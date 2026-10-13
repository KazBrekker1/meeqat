// Package cleanup runs the calls-lifecycle cron: ending stale calls, writing
// room_history, deleting chat older than an hour past call end, and purging
// calls that ended long ago.
package cleanup

import (
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	// Chat is kept for an hour after its call ends.
	messagesRetention = time.Hour
	// Ended and cancelled calls are deleted after this long. Nothing reads
	// them: the apps only list open/finalized calls, and a room's past
	// prayers come from room_history.
	callsRetention = 30 * 24 * time.Hour
	// Calls purged per run (every 5 minutes).
	purgeBatch = 200
)

// Register schedules the "calls-lifecycle" cron job every 5 minutes.
func Register(app core.App) {
	app.Cron().MustAdd("calls-lifecycle", "*/5 * * * *", func() {
		Run(app)
	})
}

// Run executes one pass of the calls-lifecycle job. Exported so it can be
// invoked directly (e.g. from a temporary faster schedule during manual
// local testing).
func Run(app core.App) {
	endStaleCalls(app)
	deleteOldMessages(app)
	purgeOldCalls(app)
}

func endStaleCalls(app core.App) {
	active, err := app.FindRecordsByFilter(
		"calls",
		"status = 'open' || status = 'finalized'",
		"",
		0,
		0,
	)
	if err != nil {
		app.Logger().Error("cleanup: could not list active calls", "error", err)
		return
	}

	now := time.Now()

	for _, call := range active {
		meetAt := call.GetDateTime("meet_at")
		created := call.GetDateTime("created")

		var shouldEnd bool
		if !meetAt.IsZero() {
			shouldEnd = now.After(meetAt.Time().Add(30 * time.Minute))
		} else {
			shouldEnd = now.After(created.Time().Add(45 * time.Minute))
		}

		if !shouldEnd {
			continue
		}

		place := call.GetString("place")
		prayer := call.GetString("prayer")
		day := call.GetString("day")
		room := call.GetString("room")

		joined, err := app.CountRecords("participants", dbx.NewExp("call = {:call}", dbx.Params{"call": call.Id}))
		if err != nil {
			app.Logger().Error("cleanup: could not count participants", "error", err, "call", call.Id)
		}

		call.Set("status", "ended")
		if err := app.Save(call); err != nil {
			app.Logger().Error("cleanup: could not end call", "error", err, "call", call.Id)
			continue
		}

		if err := writeHistory(app, room, prayer, day, place, joined); err != nil {
			app.Logger().Error("cleanup: could not write room_history", "error", err, "call", call.Id)
		}
	}
}

func writeHistory(app core.App, room, prayer, day, place string, joined int64) error {
	collection, err := app.FindCollectionByNameOrId("room_history")
	if err != nil {
		return err
	}

	h := core.NewRecord(collection)
	h.Set("room", room)
	h.Set("prayer", prayer)
	h.Set("day", day)
	h.Set("place", place)
	h.Set("joined", joined)

	return app.Save(h)
}

// deleteOldMessages removes the chat of calls that ended over an hour ago,
// in one statement. It goes around the record hooks on purpose: nobody is
// subscribed to the chat of a finished call, and messages have no files or
// dependent records to clean up.
func deleteOldMessages(app core.App) {
	cutoff := time.Now().Add(-messagesRetention)

	_, err := app.DB().NewQuery(`
		DELETE FROM {{messages}}
		WHERE [[call]] IN (
			SELECT [[id]] FROM {{calls}}
			WHERE [[status]] IN ('ended', 'cancelled') AND [[updated]] < {:cutoff}
		)
	`).Bind(dbx.Params{"cutoff": dbTime(cutoff)}).Execute()
	if err != nil {
		app.Logger().Error("cleanup: could not delete old messages", "error", err)
	}
}

// purgeOldCalls deletes calls that ended more than callsRetention ago, with
// their participants, poll options and votes (cascade). What a room keeps of
// a past call is its room_history row, which is not touched. At most
// purgeBatch calls per run, oldest first, so a backlog drains over a few runs
// instead of in one long transaction.
func purgeOldCalls(app core.App) {
	cutoff := time.Now().Add(-callsRetention)

	old, err := app.FindRecordsByFilter(
		"calls",
		"(status = 'ended' || status = 'cancelled') && updated < {:cutoff}",
		"updated",
		purgeBatch,
		0,
		dbx.Params{"cutoff": dbTime(cutoff)},
	)
	if err != nil {
		app.Logger().Error("cleanup: could not list calls to purge", "error", err)
		return
	}

	for _, call := range old {
		if err := app.Delete(call); err != nil {
			app.Logger().Error("cleanup: could not purge call", "error", err, "call", call.Id)
		}
	}
}

// dbTime formats t the way PocketBase stores datetimes.
func dbTime(t time.Time) string {
	return t.UTC().Format(types.DefaultDateLayout)
}
