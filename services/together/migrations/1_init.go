package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

// SUB(roomField) is the "subscribed member of the call's room" rule: it walks
// a `memberships` row aliased :me that must simultaneously match the given
// room expression, the authenticated user, and subscribed=true. Using ONE
// alias for all three conditions is what forces them onto the same
// membership row (a member with two rows - one subscribed to another room,
// one unsubscribed here - must not slip through).
func sub(roomExpr string) string {
	return "@request.auth.id != '' && " +
		"@collection.memberships:me.room ?= " + roomExpr + " && " +
		"@collection.memberships:me.user ?= @request.auth.id && " +
		"@collection.memberships:me.subscribed ?= true"
}

// member(roomExpr) is the same as sub() but without the subscribed check.
func member(roomExpr string) string {
	return "@request.auth.id != '' && " +
		"@collection.memberships:me.room ?= " + roomExpr + " && " +
		"@collection.memberships:me.user ?= @request.auth.id"
}

// Rules that reference the `memberships` collection by name (via the
// @collection.memberships:me... alias, including memberships referencing
// itself) can only be *set* once every collection they mention already
// exists in the `_collections` table. So collection creation happens in two
// passes: pass 1 creates every collection with its fields, indexes and the
// rules that don't need another collection to exist yet; pass 2 goes back
// and attaches the memberships-referencing list/view rules once everything
// is there.
func init() {
	m.Register(func(app core.App) error {
		usersCol, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}
		if err := addUserFields(app, usersCol); err != nil {
			return err
		}

		rooms, err := createRoomsCollection(app, usersCol)
		if err != nil {
			return err
		}

		if _, err := createMembershipsCollection(app, usersCol, rooms); err != nil {
			return err
		}

		calls, err := createCallsCollection(app, usersCol, rooms)
		if err != nil {
			return err
		}

		if _, err := createParticipantsCollection(app, usersCol, calls); err != nil {
			return err
		}

		pollOptions, err := createPollOptionsCollection(app, calls)
		if err != nil {
			return err
		}

		if err := createPollVotesCollection(app, usersCol, calls, pollOptions); err != nil {
			return err
		}

		if err := createMessagesCollection(app, usersCol, calls); err != nil {
			return err
		}

		if err := createRoomHistoryCollection(app, rooms); err != nil {
			return err
		}

		// pass 2: attach the memberships-referencing rules now that every
		// collection involved exists.
		if err := attachMembershipAwareRules(app); err != nil {
			return err
		}

		return configureRateLimits(app)
	}, func(app core.App) error {
		names := []string{
			"room_history",
			"messages",
			"poll_votes",
			"poll_options",
			"participants",
			"calls",
			"memberships",
			"rooms",
		}

		for _, name := range names {
			col, err := app.FindCollectionByNameOrId(name)
			if err != nil {
				continue // already gone
			}
			if err := app.Delete(col); err != nil {
				return err
			}
		}

		return nil
	})
}

func addUserFields(app core.App, users *core.Collection) error {
	users.Fields.Add(&core.TextField{
		Name:     "sanad_id",
		Required: true,
	})
	users.Fields.Add(&core.URLField{
		Name: "avatar_url",
	})

	users.AddIndex("idx_users_sanad_id", true, "sanad_id", "")

	// Accounts only come from POST /api/sanad/exchange. PocketBase's defaults
	// (public signup, password login, self-update) would let someone register
	// or edit a record with another person's sanad_id and be handed that
	// person's account on their first Sanad sign-in.
	users.CreateRule = nil
	users.UpdateRule = nil
	users.PasswordAuth.Enabled = false
	users.OAuth2.Enabled = false
	// Signed-in users can see each other's name/avatar (participants, chat
	// authors); emails stay hidden (emailVisibility is false).
	users.ViewRule = types.Pointer("@request.auth.id != ''")

	// 7-day PocketBase auth token so native clients don't have to
	// re-exchange the Sanad JWT on every app open.
	users.AuthToken.Duration = 7 * 24 * 60 * 60

	return app.Save(users)
}

func createRoomsCollection(app core.App, users *core.Collection) (*core.Collection, error) {
	col := core.NewBaseCollection("rooms")

	col.Fields.Add(
		&core.TextField{Name: "name", Required: true, Max: 60},
		&core.TextField{Name: "default_place", Max: 80},
		&core.TextField{Name: "tz", Required: true},
		&core.TextField{Name: "code", Required: true, Min: 8, Max: 8},
		&core.RelationField{
			Name:         "owner",
			Required:     true,
			CollectionId: users.Id,
			MaxSelect:    1,
		},
		&core.BoolField{Name: "discoverable"},
		&core.NumberField{Name: "lat"},
		&core.NumberField{Name: "lng"},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)

	col.AddIndex("idx_rooms_code", true, "code", "")
	col.AddIndex("idx_rooms_lat_lng", false, "lat, lng", "")

	// ListRule/ViewRule (member-of-room) are attached in pass 2, once
	// `memberships` exists.
	//
	// NB: PocketBase evaluates CreateRule against the *raw submitted*
	// record, before OnRecordCreateRequest hooks run - so a rule like
	// "owner = @request.auth.id" would require the client to submit the
	// right owner itself. Since rooms.RegisterHooks always overwrites
	// `owner` with the caller's id before saving regardless of what (if
	// anything) was submitted, the rule only needs to gate on being
	// signed in at all.
	col.CreateRule = types.Pointer("@request.auth.id != ''")
	col.UpdateRule = types.Pointer("owner = @request.auth.id")
	col.DeleteRule = types.Pointer("owner = @request.auth.id")

	if err := app.Save(col); err != nil {
		return nil, err
	}

	return col, nil
}

func createMembershipsCollection(app core.App, users, rooms *core.Collection) (*core.Collection, error) {
	col := core.NewBaseCollection("memberships")

	col.Fields.Add(
		&core.RelationField{
			Name:          "room",
			Required:      true,
			CollectionId:  rooms.Id,
			MaxSelect:     1,
			CascadeDelete: true,
		},
		&core.RelationField{
			Name:          "user",
			Required:      true,
			CollectionId:  users.Id,
			MaxSelect:     1,
			CascadeDelete: true,
		},
		&core.SelectField{
			Name:      "role",
			Required:  true,
			Values:    []string{"owner", "caller", "member"},
			MaxSelect: 1,
		},
		&core.BoolField{Name: "subscribed"},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)

	col.AddIndex("idx_memberships_room_user", true, "room, user", "")

	// Records are created by superuser-only server routes (room create hook,
	// join routes), never directly by clients.
	col.CreateRule = nil
	// A member may only flip their own `subscribed` flag; nothing else about
	// a membership (including their own role) is editable this way. Role
	// changes go through PATCH /api/rooms/{id}/members/{userId} (Unit C).
	col.UpdateRule = types.Pointer(
		"user = @request.auth.id && " +
			"@request.body.role:isset = false && " +
			"@request.body.room:isset = false && " +
			"@request.body.user:isset = false",
	)
	// ListRule/ViewRule/DeleteRule (self-referencing via the memberships
	// alias) are attached in pass 2.

	if err := app.Save(col); err != nil {
		return nil, err
	}

	return col, nil
}

func createCallsCollection(app core.App, users, rooms *core.Collection) (*core.Collection, error) {
	col := core.NewBaseCollection("calls")

	col.Fields.Add(
		&core.RelationField{
			Name:          "room",
			Required:      true,
			CollectionId:  rooms.Id,
			MaxSelect:     1,
			CascadeDelete: true,
		},
		&core.SelectField{
			Name:      "prayer",
			Required:  true,
			Values:    []string{"fajr", "dhuhr", "asr", "maghrib", "isha", "jumuah"},
			MaxSelect: 1,
		},
		&core.TextField{Name: "day", Required: true, Min: 10, Max: 10},
		&core.SelectField{
			Name:      "status",
			Required:  true,
			Values:    []string{"open", "finalized", "ended", "cancelled"},
			MaxSelect: 1,
		},
		&core.RelationField{
			Name:         "organizer",
			Required:     true,
			CollectionId: users.Id,
			MaxSelect:    1,
		},
		&core.TextField{Name: "place", Max: 80},
		&core.DateField{Name: "meet_at"},
		&core.DateField{Name: "place_changed_at"},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)

	// Partial unique index: only one *active* (open/finalized) call per
	// room+prayer+day. This is the DB-level backstop for the one-active-call
	// rule; the create hook checks it first for a friendly 409, but a
	// concurrent race is decided here.
	col.AddIndex(
		"idx_calls_active_room_prayer_day",
		true,
		"room, prayer, day",
		"status IN ('open', 'finalized')",
	)

	// ListRule/ViewRule/CreateRule (subscribed-member-of-room) are attached
	// in pass 2.
	col.UpdateRule = types.Pointer("organizer = @request.auth.id")
	col.DeleteRule = nil

	if err := app.Save(col); err != nil {
		return nil, err
	}

	return col, nil
}

func createParticipantsCollection(app core.App, users, calls *core.Collection) (*core.Collection, error) {
	col := core.NewBaseCollection("participants")

	col.Fields.Add(
		&core.RelationField{
			Name:          "call",
			Required:      true,
			CollectionId:  calls.Id,
			MaxSelect:     1,
			CascadeDelete: true,
		},
		&core.RelationField{
			Name:         "user",
			Required:     true,
			CollectionId: users.Id,
			MaxSelect:    1,
		},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)

	col.AddIndex("idx_participants_call_user", true, "call, user", "")

	// ListRule/ViewRule/CreateRule (subscribed-member-of-call's-room) are
	// attached in pass 2.
	col.UpdateRule = nil
	col.DeleteRule = types.Pointer("user = @request.auth.id")

	if err := app.Save(col); err != nil {
		return nil, err
	}

	return col, nil
}

func createPollOptionsCollection(app core.App, calls *core.Collection) (*core.Collection, error) {
	col := core.NewBaseCollection("poll_options")

	col.Fields.Add(
		&core.RelationField{
			Name:          "call",
			Required:      true,
			CollectionId:  calls.Id,
			MaxSelect:     1,
			CascadeDelete: true,
		},
		&core.SelectField{
			Name:      "kind",
			Values:    []string{"place", "time", "other"},
			MaxSelect: 1,
		},
		&core.TextField{Name: "label", Required: true, Max: 60},
		&core.TextField{Name: "value", Max: 80},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)

	organizer := "call.organizer = @request.auth.id"
	// ListRule/ViewRule (subscribed-member-of-call's-room) are attached in
	// pass 2; create/update/delete only need `calls`, which already exists.
	col.CreateRule = types.Pointer(organizer)
	col.UpdateRule = types.Pointer(organizer)
	col.DeleteRule = types.Pointer(organizer)

	if err := app.Save(col); err != nil {
		return nil, err
	}

	return col, nil
}

func createPollVotesCollection(app core.App, users, calls, pollOptions *core.Collection) error {
	col := core.NewBaseCollection("poll_votes")

	col.Fields.Add(
		&core.RelationField{
			Name:          "call",
			Required:      true,
			CollectionId:  calls.Id,
			MaxSelect:     1,
			CascadeDelete: true,
		},
		&core.RelationField{
			Name:          "option",
			Required:      true,
			CollectionId:  pollOptions.Id,
			MaxSelect:     1,
			CascadeDelete: true,
		},
		&core.RelationField{
			Name:         "user",
			Required:     true,
			CollectionId: users.Id,
			MaxSelect:    1,
		},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)

	col.AddIndex("idx_poll_votes_call_user", true, "call, user", "")

	// ListRule/ViewRule/CreateRule (subscribed-member-of-call's-room) are
	// attached in pass 2.
	col.UpdateRule = types.Pointer("user = @request.auth.id")
	col.DeleteRule = types.Pointer("user = @request.auth.id")

	return app.Save(col)
}

func createMessagesCollection(app core.App, users, calls *core.Collection) error {
	col := core.NewBaseCollection("messages")

	col.Fields.Add(
		&core.RelationField{
			Name:          "call",
			Required:      true,
			CollectionId:  calls.Id,
			MaxSelect:     1,
			CascadeDelete: true,
		},
		&core.RelationField{
			Name:         "user",
			Required:     true,
			CollectionId: users.Id,
			MaxSelect:    1,
		},
		&core.TextField{Name: "body", Required: true, Max: 280},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)

	col.AddIndex("idx_messages_call_created", false, "call, created", "")

	// ListRule/ViewRule/CreateRule (subscribed-member-of-call's-room) are
	// attached in pass 2.
	col.UpdateRule = nil
	col.DeleteRule = types.Pointer("user = @request.auth.id")

	return app.Save(col)
}

func createRoomHistoryCollection(app core.App, rooms *core.Collection) error {
	col := core.NewBaseCollection("room_history")

	col.Fields.Add(
		&core.RelationField{
			Name:          "room",
			Required:      true,
			CollectionId:  rooms.Id,
			MaxSelect:     1,
			CascadeDelete: true,
		},
		&core.SelectField{
			Name:      "prayer",
			Values:    []string{"fajr", "dhuhr", "asr", "maghrib", "isha", "jumuah"},
			MaxSelect: 1,
		},
		&core.TextField{Name: "day", Min: 10, Max: 10},
		&core.TextField{Name: "place", Max: 80},
		&core.NumberField{Name: "joined"},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)

	col.AddIndex("idx_room_history_room_day", false, "room, day", "")

	// ListRule/ViewRule (member-of-room) are attached in pass 2.
	col.CreateRule = nil // written by the cleanup cron only
	col.UpdateRule = nil
	col.DeleteRule = nil

	return app.Save(col)
}

// attachMembershipAwareRules sets every rule that references the
// `memberships` collection by name (list/view rules everywhere, plus a
// couple of create rules and the memberships delete rule), now that all
// collections involved in those rules exist.
func attachMembershipAwareRules(app core.App) error {
	rooms, err := app.FindCollectionByNameOrId("rooms")
	if err != nil {
		return err
	}
	memberOfRoomsId := member("id")
	rooms.ListRule = types.Pointer(memberOfRoomsId)
	rooms.ViewRule = types.Pointer(memberOfRoomsId)
	if err := app.Save(rooms); err != nil {
		return err
	}

	memberships, err := app.FindCollectionByNameOrId("memberships")
	if err != nil {
		return err
	}
	memberOfRoom := member("room")
	memberships.ListRule = types.Pointer("user = @request.auth.id || " + memberOfRoom)
	memberships.ViewRule = types.Pointer("user = @request.auth.id || " + memberOfRoom)
	// The owner's own row can't be deleted (the room would be left ownerless).
	memberships.DeleteRule = types.Pointer("role != 'owner' && (user = @request.auth.id || @request.auth.id = room.owner)")
	if err := app.Save(memberships); err != nil {
		return err
	}

	calls, err := app.FindCollectionByNameOrId("calls")
	if err != nil {
		return err
	}
	subRoom := sub("room")
	calls.ListRule = types.Pointer(subRoom)
	calls.ViewRule = types.Pointer(subRoom)
	calls.CreateRule = types.Pointer(subRoom)
	if err := app.Save(calls); err != nil {
		return err
	}

	participants, err := app.FindCollectionByNameOrId("participants")
	if err != nil {
		return err
	}
	subCallRoom := sub("call.room")
	participants.ListRule = types.Pointer(subCallRoom)
	participants.ViewRule = types.Pointer(subCallRoom)
	participants.CreateRule = types.Pointer(subCallRoom + " && user = @request.auth.id")
	if err := app.Save(participants); err != nil {
		return err
	}

	pollOptions, err := app.FindCollectionByNameOrId("poll_options")
	if err != nil {
		return err
	}
	pollOptions.ListRule = types.Pointer(subCallRoom)
	pollOptions.ViewRule = types.Pointer(subCallRoom)
	if err := app.Save(pollOptions); err != nil {
		return err
	}

	pollVotes, err := app.FindCollectionByNameOrId("poll_votes")
	if err != nil {
		return err
	}
	pollVotes.ListRule = types.Pointer(subCallRoom)
	pollVotes.ViewRule = types.Pointer(subCallRoom)
	pollVotes.CreateRule = types.Pointer(subCallRoom + " && user = @request.auth.id")
	if err := app.Save(pollVotes); err != nil {
		return err
	}

	messages, err := app.FindCollectionByNameOrId("messages")
	if err != nil {
		return err
	}
	messages.ListRule = types.Pointer(subCallRoom)
	messages.ViewRule = types.Pointer(subCallRoom)
	messages.CreateRule = types.Pointer(subCallRoom + " && user = @request.auth.id")
	if err := app.Save(messages); err != nil {
		return err
	}

	roomHistory, err := app.FindCollectionByNameOrId("room_history")
	if err != nil {
		return err
	}
	roomHistory.ListRule = types.Pointer(memberOfRoom)
	roomHistory.ViewRule = types.Pointer(memberOfRoom)
	return app.Save(roomHistory)
}

// configureRateLimits enables PocketBase's built-in rate limiter with the
// three rules from the design spec. v0.40.4 rule labels are either a
// "collection:action" shorthand (matched against the resolved collection +
// crud action) or a literal "METHOD /path" — there is no "*:create" style
// wildcard needed here since the custom /api/sanad/exchange route uses its
// own path label.
func configureRateLimits(app core.App) error {
	settings := app.Settings()

	settings.RateLimits.Enabled = true
	settings.RateLimits.Rules = append(settings.RateLimits.Rules,
		core.RateLimitRule{Label: "calls:create", MaxRequests: 10, Duration: 3600},
		core.RateLimitRule{Label: "messages:create", MaxRequests: 30, Duration: 60},
		core.RateLimitRule{Label: "POST /api/sanad/exchange", MaxRequests: 60, Duration: 3600},
		core.RateLimitRule{Label: "POST /api/rooms/join", MaxRequests: 30, Duration: 3600},
	)

	return app.Save(settings)
}
