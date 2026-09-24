// Package cleanup runs the calls-lifecycle cron: ending stale calls, writing
// room_history, and deleting chat older than an hour past call end.
package cleanup

import (
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
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

func deleteOldMessages(app core.App) {
	cutoff := time.Now().Add(-1 * time.Hour)

	endedCalls, err := app.FindRecordsByFilter(
		"calls",
		"(status = 'ended' || status = 'cancelled') && updated < {:cutoff}",
		"",
		0,
		0,
		dbx.Params{"cutoff": cutoff.UTC().Format("2006-01-02 15:04:05.000Z")},
	)
	if err != nil {
		app.Logger().Error("cleanup: could not list ended calls", "error", err)
		return
	}

	for _, call := range endedCalls {
		messages, err := app.FindRecordsByFilter(
			"messages",
			"call = {:call}",
			"",
			0,
			0,
			dbx.Params{"call": call.Id},
		)
		if err != nil {
			app.Logger().Error("cleanup: could not list messages", "error", err, "call", call.Id)
			continue
		}

		for _, msg := range messages {
			if err := app.Delete(msg); err != nil {
				app.Logger().Error("cleanup: could not delete message", "error", err, "message", msg.Id)
			}
		}
	}
}
