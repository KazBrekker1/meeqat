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
