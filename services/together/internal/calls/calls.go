// Package calls implements the one-active-call rule, the Jumu'ah-on-Fridays
// rule, participants, and the finalize/cancel transitions for Pray Together
// calls.
package calls

import (
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Register is a no-op placeholder kept for symmetry with the other internal
// packages (calls has no custom routes - everything goes through the
// generic /api/collections/calls/records API plus the hooks below).
func Register(se *core.ServeEvent, app core.App) {}

// RegisterHooks wires the calls record hooks. Call once during app bootstrap.
func RegisterHooks(app core.App) {
	app.OnRecordCreateRequest("calls").BindFunc(func(e *core.RecordRequestEvent) error {
		return handleCreate(e)
	})

	app.OnRecordAfterCreateSuccess("calls").BindFunc(func(e *core.RecordEvent) error {
		if err := addParticipant(e.App, e.Record.Id, e.Record.GetString("organizer")); err != nil {
			return err
		}
		return e.Next()
	})

	app.OnRecordUpdateRequest("calls").BindFunc(func(e *core.RecordRequestEvent) error {
		return handleUpdate(e)
	})

	// An organizer leaving (or being removed from) the room hands their live
	// calls to another caller; with nobody left to run them, they're cancelled.
	app.OnRecordAfterDeleteSuccess("memberships").BindFunc(func(e *core.RecordEvent) error {
		handOverCalls(e.App, e.Record.GetString("room"), e.Record.GetString("user"))
		return e.Next()
	})

	// Joining, chatting and polling only make sense while the call is live.
	app.OnRecordCreateRequest("participants", "messages", "poll_options").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := requireActiveCall(e.App, e.Record.GetString("call")); err != nil {
			return err
		}
		if e.Collection.Name == "messages" {
			if err := perUserLimit(e, "messages", "user", 20, time.Minute); err != nil {
				return err
			}
		}
		return e.Next()
	})

	app.OnRecordCreateRequest("poll_votes").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := validateVote(e); err != nil {
			return err
		}
		return e.Next()
	})

	app.OnRecordUpdateRequest("poll_votes").BindFunc(func(e *core.RecordRequestEvent) error {
		original := e.Record.Original()
		if e.Record.GetString("call") != original.GetString("call") ||
			e.Record.GetString("user") != original.GetString("user") {
			return apis.NewBadRequestError("only the chosen option can change", nil)
		}
		if err := validateVote(e); err != nil {
			return err
		}
		return e.Next()
	})
}

func handOverCalls(app core.App, roomId, leaverId string) {
	live, err := app.FindRecordsByFilter("calls",
		"room = {:room} && organizer = {:user} && (status = 'open' || status = 'finalized')",
		"", 0, 0, dbx.Params{"room": roomId, "user": leaverId})
	if err != nil || len(live) == 0 {
		return
	}
	// Prefer the owner, then the longest-standing subscribed caller.
	next, _ := app.FindRecordsByFilter("memberships",
		"room = {:room} && user != {:user} && subscribed = true && (role = 'owner' || role = 'caller')",
		"-role,created", 1, 0, dbx.Params{"room": roomId, "user": leaverId})
	for _, call := range live {
		if len(next) > 0 {
			call.Set("organizer", next[0].GetString("user"))
		} else {
			call.Set("status", "cancelled")
		}
		if err := app.Save(call); err != nil {
			app.Logger().Error("calls: hand-over failed", "error", err, "call", call.Id)
		}
	}
}

// perUserLimit caps how many records a user created in a collection within a
// window. PocketBase's built-in limiter is per IP, which would throttle a whole
// office sharing one address together.
func perUserLimit(e *core.RecordRequestEvent, collection, userField string, max int, window time.Duration) error {
	since := types.NowDateTime().Add(-window).String()
	n, err := e.App.CountRecords(collection, dbx.NewExp(
		userField+" = {:user} AND created > {:since}",
		dbx.Params{"user": e.Auth.Id, "since": since},
	))
	if err != nil {
		return err
	}
	if n >= int64(max) {
		return apis.NewTooManyRequestsError("You're doing that too often — try again in a moment.", nil)
	}
	return nil
}

func requireActiveCall(app core.App, callId string) error {
	call, err := app.FindRecordById("calls", callId)
	if err != nil {
		return apis.NewBadRequestError("call not found", nil)
	}
	if s := call.GetString("status"); s != "open" && s != "finalized" {
		return apis.NewBadRequestError("this call has ended", nil)
	}
	return nil
}

// validateVote checks the call is live and the chosen option belongs to it.
func validateVote(e *core.RecordRequestEvent) error {
	callId := e.Record.GetString("call")
	if err := requireActiveCall(e.App, callId); err != nil {
		return err
	}
	option, err := e.App.FindRecordById("poll_options", e.Record.GetString("option"))
	if err != nil || option.GetString("call") != callId {
		return apis.NewBadRequestError("option does not belong to this call", nil)
	}
	return nil
}

func handleCreate(e *core.RecordRequestEvent) error {
	if e.Auth == nil {
		return apis.NewUnauthorizedError("sign in required", nil)
	}

	roomId := e.Record.GetString("room")
	room, err := e.App.FindRecordById("rooms", roomId)
	if err != nil {
		return apis.NewBadRequestError("room not found", nil)
	}

	membership, err := e.App.FindFirstRecordByFilter(
		"memberships",
		"room = {:room} && user = {:user}",
		dbx.Params{"room": roomId, "user": e.Auth.Id},
	)
	if err != nil {
		return apis.NewForbiddenError("not a member of this room", nil)
	}
	role := membership.GetString("role")
	if !membership.GetBool("subscribed") || (role != "owner" && role != "caller") {
		return apis.NewForbiddenError("only subscribed callers can start a call", nil)
	}

	loc, err := time.LoadLocation(room.GetString("tz"))
	if err != nil {
		loc = time.UTC
	}
	now := time.Now().In(loc)
	day := now.Format("2006-01-02")

	prayer := e.Record.GetString("prayer")
	if prayer == "jumuah" && now.Weekday() != time.Friday {
		return apis.NewBadRequestError("jumuah calls can only be started on a Friday", nil)
	}

	if err := perUserLimit(e, "calls", "organizer", 10, time.Hour); err != nil {
		return err
	}

	if existing, err := findActiveCall(e.App, roomId, prayer, day); err == nil {
		return respondCallConflict(e, existing.Id)
	}

	e.Record.Set("organizer", e.Auth.Id)
	e.Record.Set("status", "open")
	e.Record.Set("day", day)
	if e.Record.GetString("place") == "" {
		e.Record.Set("place", room.GetString("default_place"))
	}

	if err := e.Next(); err != nil {
		if isUniqueConstraintErr(err) {
			// Lost the race: the partial unique index caught a concurrent
			// insert for the same (room, prayer, day) between our check
			// above and this save.
			existingId := ""
			if existing, ferr := findActiveCall(e.App, roomId, prayer, day); ferr == nil {
				existingId = existing.Id
			}
			return respondCallConflict(e, existingId)
		}
		return err
	}

	return nil
}

// respondCallConflict writes the 409 response body directly (rather than
// going through apis.NewApiError, whose `data` field is reserved for
// validation-style field errors and would silently drop a plain
// {"existing": id} payload).
func respondCallConflict(e *core.RecordRequestEvent, existingId string) error {
	return e.JSON(409, map[string]any{
		"message": "A call is already active for this prayer.",
		"data":    map[string]any{"existing": existingId},
	})
}

func findActiveCall(app core.App, roomId, prayer, day string) (*core.Record, error) {
	return app.FindFirstRecordByFilter(
		"calls",
		"room = {:room} && prayer = {:prayer} && day = {:day} && (status = 'open' || status = 'finalized')",
		dbx.Params{"room": roomId, "prayer": prayer, "day": day},
	)
}

func isUniqueConstraintErr(err error) bool {
	return err != nil && strings.Contains(strings.ToUpper(err.Error()), "UNIQUE CONSTRAINT")
}

func addParticipant(app core.App, callId, userId string) error {
	existing, err := app.FindFirstRecordByFilter(
		"participants",
		"call = {:call} && user = {:user}",
		dbx.Params{"call": callId, "user": userId},
	)
	if err == nil {
		_ = existing
		return nil
	}

	collection, err := app.FindCollectionByNameOrId("participants")
	if err != nil {
		return err
	}

	p := core.NewRecord(collection)
	p.Set("call", callId)
	p.Set("user", userId)

	return app.Save(p)
}

var allowedFields = map[string]bool{
	"place":           true,
	"meet_at":         true,
	"status":          true,
	"finalize_option": true,
}

func handleUpdate(e *core.RecordRequestEvent) error {
	if e.Auth == nil {
		return apis.NewUnauthorizedError("sign in required", nil)
	}

	info, err := e.RequestInfo()
	if err != nil {
		return apis.NewBadRequestError("invalid request", nil)
	}

	for key := range info.Body {
		if !allowedFields[key] {
			return apis.NewBadRequestError("field not editable: "+key, nil)
		}
	}

	original := e.Record.Original()
	if s := original.GetString("status"); s == "ended" || s == "cancelled" {
		return apis.NewBadRequestError("this call has ended", nil)
	}

	if optionId, ok := info.Body["finalize_option"].(string); ok && optionId != "" {
		option, err := e.App.FindRecordById("poll_options", optionId)
		if err != nil || option.GetString("call") != e.Record.Id {
			return apis.NewBadRequestError("finalize_option does not belong to this call", nil)
		}

		switch option.GetString("kind") {
		case "place":
			e.Record.Set("place", option.GetString("value"))
		case "time":
			e.Record.Set("meet_at", option.GetString("value"))
		}

		e.Record.Set("status", "finalized")
	}

	if e.Record.GetString("place") != original.GetString("place") {
		e.Record.Set("place_changed_at", time.Now())
	}

	if status, ok := info.Body["status"].(string); ok {
		from := original.GetString("status")
		if !isAllowedTransition(from, status) {
			return apis.NewBadRequestError("invalid status transition", nil)
		}
	}

	return e.Next()
}

func isAllowedTransition(from, to string) bool {
	if from == to {
		return true
	}
	switch from {
	case "open":
		return to == "finalized" || to == "cancelled"
	case "finalized":
		return to == "cancelled"
	}
	return false
}
