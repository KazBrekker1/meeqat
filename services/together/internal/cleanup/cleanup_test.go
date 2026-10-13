package cleanup_test

import (
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/types"

	"meeqat.app/together/internal/cleanup"

	_ "meeqat.app/together/migrations"
)

type fixture struct {
	t    *testing.T
	app  *tests.TestApp
	user *core.Record
	room *core.Record
}

func newFixture(t *testing.T) *fixture {
	t.Helper()

	app, err := tests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(app.Cleanup)

	f := &fixture{t: t, app: app}
	f.user = f.create("users", map[string]any{"sanad_id": "sanad-user-1", "name": "Person One"}, func(r *core.Record) {
		r.SetEmail("person@example.com")
		r.SetRandomPassword()
		r.SetVerified(true)
	})
	f.room = f.create("rooms", map[string]any{"name": "Office", "tz": "Asia/Riyadh", "code": "ABCDEFGH", "owner": f.user.Id}, nil)
	return f
}

func (f *fixture) create(collection string, data map[string]any, extra func(*core.Record)) *core.Record {
	f.t.Helper()

	col, err := f.app.FindCollectionByNameOrId(collection)
	if err != nil {
		f.t.Fatalf("FindCollectionByNameOrId(%s): %v", collection, err)
	}
	r := core.NewRecord(col)
	for k, v := range data {
		r.Set(k, v)
	}
	if extra != nil {
		extra(r)
	}
	if err := f.app.Save(r); err != nil {
		f.t.Fatalf("save %s: %v", collection, err)
	}
	return r
}

// call creates a call with one participant, one poll option with a vote and
// one message, last updated `age` ago (autodate fields can't be set through
// Save, so the row is backdated directly).
func (f *fixture) call(prayer, status string, age time.Duration) *core.Record {
	f.t.Helper()

	call := f.create("calls", map[string]any{
		"room": f.room.Id, "prayer": prayer, "day": "2026-10-13", "status": status, "organizer": f.user.Id,
	}, nil)
	f.create("participants", map[string]any{"call": call.Id, "user": f.user.Id}, nil)
	option := f.create("poll_options", map[string]any{"call": call.Id, "kind": "place", "label": "Musalla"}, nil)
	f.create("poll_votes", map[string]any{"call": call.Id, "option": option.Id, "user": f.user.Id}, nil)
	f.create("messages", map[string]any{"call": call.Id, "user": f.user.Id, "body": "on my way"}, nil)

	updated := time.Now().Add(-age).UTC().Format(types.DefaultDateLayout)
	_, err := f.app.DB().NewQuery("UPDATE {{calls}} SET [[updated]] = {:updated}, [[created]] = {:updated} WHERE [[id]] = {:id}").
		Bind(dbx.Params{"updated": updated, "id": call.Id}).Execute()
	if err != nil {
		f.t.Fatalf("backdate call: %v", err)
	}
	return call
}

func (f *fixture) count(collection string, call *core.Record) int64 {
	f.t.Helper()

	field := "call"
	if collection == "calls" {
		field = "id"
	}
	n, err := f.app.CountRecords(collection, dbx.HashExp{field: call.Id})
	if err != nil {
		f.t.Fatalf("count %s: %v", collection, err)
	}
	return n
}

func (f *fixture) expect(what string, call *core.Record, want map[string]int64) {
	f.t.Helper()

	for collection, n := range want {
		if got := f.count(collection, call); got != n {
			f.t.Errorf("%s: expected %d %s, got %d", what, n, collection, got)
		}
	}
}

func TestRunDeletesOldChatAndPurgesOldCalls(t *testing.T) {
	f := newFixture(t)

	live := f.call("fajr", "open", time.Minute)
	justEnded := f.call("dhuhr", "ended", 10*time.Minute)
	endedYesterday := f.call("asr", "ended", 24*time.Hour)
	cancelledYesterday := f.call("maghrib", "cancelled", 24*time.Hour)
	endedLongAgo := f.call("isha", "ended", 31*24*time.Hour)
	cancelledLongAgo := f.call("jumuah", "cancelled", 45*24*time.Hour)

	cleanup.Run(f.app)

	everything := map[string]int64{"calls": 1, "participants": 1, "poll_options": 1, "poll_votes": 1, "messages": 1}
	withoutChat := map[string]int64{"calls": 1, "participants": 1, "poll_options": 1, "poll_votes": 1, "messages": 0}
	nothing := map[string]int64{"calls": 0, "participants": 0, "poll_options": 0, "poll_votes": 0, "messages": 0}

	f.expect("a live call", live, everything)
	f.expect("a call that ended minutes ago", justEnded, everything)
	f.expect("a call that ended yesterday", endedYesterday, withoutChat)
	f.expect("a call cancelled yesterday", cancelledYesterday, withoutChat)
	f.expect("a call that ended a month ago", endedLongAgo, nothing)
	f.expect("a call cancelled long ago", cancelledLongAgo, nothing)
}

// The cron also ends stale calls and writes their room_history row; that row
// is what the app shows for past prayers and must outlive the purged call.
func TestPurgeKeepsRoomHistory(t *testing.T) {
	f := newFixture(t)

	stale := f.call("asr", "open", 2*time.Hour)
	cleanup.Run(f.app)

	ended, err := f.app.FindRecordById("calls", stale.Id)
	if err != nil || ended.GetString("status") != "ended" {
		t.Fatalf("expected the stale call to be ended, got %v (err %v)", ended, err)
	}

	// A month later the call is purged...
	old := time.Now().Add(-31 * 24 * time.Hour).UTC().Format(types.DefaultDateLayout)
	if _, err := f.app.DB().NewQuery("UPDATE {{calls}} SET [[updated]] = {:old} WHERE [[id]] = {:id}").
		Bind(dbx.Params{"old": old, "id": stale.Id}).Execute(); err != nil {
		t.Fatalf("backdate call: %v", err)
	}
	cleanup.Run(f.app)

	if _, err := f.app.FindRecordById("calls", stale.Id); err == nil {
		t.Fatalf("expected the old call to be purged")
	}
	// ...and its history row is still there.
	history, err := f.app.FindRecordsByFilter("room_history", "room = {:room}", "", 0, 0, dbx.Params{"room": f.room.Id})
	if err != nil || len(history) != 1 {
		t.Fatalf("expected 1 room_history row, got %d (err %v)", len(history), err)
	}
	if history[0].GetString("prayer") != "asr" || history[0].GetInt("joined") != 1 {
		t.Fatalf("unexpected history row: %v", history[0])
	}
}
