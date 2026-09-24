package calls_test

import "testing"

// TestUnsubscribedMembersCannotSeeCalls covers the core.24 privacy rule:
// only a *subscribed* member of a call's room can list/view it. A member of
// the room who has unsubscribed sees nothing, and neither does someone who
// isn't a member of the room at all - only the subscribed member does.
func TestUnsubscribedMembersCannotSeeCalls(t *testing.T) {
	env := newTestEnv(t)

	owner, ownerToken := env.createUser(t, "owner-access")
	subscribed, subscribedToken := env.createUser(t, "subscribed-access")
	unsubscribed, unsubscribedToken := env.createUser(t, "unsubscribed-access")
	stranger, strangerToken := env.createUser(t, "stranger-access")

	room := env.createRoom(t, owner, "Asia/Qatar")
	env.addMembership(t, room, owner, "owner", true)
	env.addMembership(t, room, subscribed, "member", true)
	env.addMembership(t, room, unsubscribed, "member", false)
	// Subscribed elsewhere: the rule must not let a subscription to another
	// room count for this one.
	otherRoom := env.createRoom(t, owner, "Asia/Qatar")
	env.addMembership(t, otherRoom, unsubscribed, "member", true)
	_ = stranger // never added as a member of the room at all

	created := env.postJSON(t, "/api/collections/calls/records", ownerToken, map[string]any{
		"room":   room.Id,
		"prayer": "fajr",
	})
	if created.status != 200 && created.status != 201 {
		t.Fatalf("expected the call to be created, got %d: %v", created.status, created.body)
	}
	callID, _ := created.body["id"].(string)
	if callID == "" {
		t.Fatalf("expected the created call to have an id, got %v", created.body)
	}

	cases := []struct {
		name        string
		token       string
		wantVisible bool
	}{
		{"subscribed member sees it", subscribedToken, true},
		{"unsubscribed member sees nothing", unsubscribedToken, false},
		{"non-member sees nothing", strangerToken, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp := env.getJSON(t, "/api/collections/calls/records", tc.token)
			if resp.status != 200 {
				t.Fatalf("expected 200 listing calls, got %d: %v", resp.status, resp.body)
			}

			items, _ := resp.body["items"].([]any)
			found := false
			for _, item := range items {
				record, ok := item.(map[string]any)
				if ok && record["id"] == callID {
					found = true
				}
			}

			if found != tc.wantVisible {
				t.Fatalf("expected visible=%v for %s, got items=%v", tc.wantVisible, tc.name, items)
			}

			// also check the direct view endpoint agrees
			view := env.getJSON(t, "/api/collections/calls/records/"+callID, tc.token)
			viewVisible := view.status == 200
			if viewVisible != tc.wantVisible {
				t.Fatalf("expected view visible=%v for %s, got status %d", tc.wantVisible, tc.name, view.status)
			}
		})
	}
}

// Accounts only come from the Sanad exchange: no public signup, no password
// login, and nobody can rewrite their own sanad_id (which would hand them
// someone else's account on that person's first sign-in).
func TestUsersAreLockedDown(t *testing.T) {
	env := newTestEnv(t)
	user, token := env.createUser(t, "locked-down")

	signup := env.postJSON(t, "/api/collections/users/records", "", map[string]any{
		"email": "x@example.com", "password": "12345678", "passwordConfirm": "12345678", "sanad_id": "victim",
	})
	if signup.status < 400 {
		t.Fatalf("public signup should be rejected, got %d", signup.status)
	}

	login := env.postJSON(t, "/api/collections/users/auth-with-password", "", map[string]any{
		"identity": user.Email(), "password": "anything",
	})
	if login.status < 400 {
		t.Fatalf("password login should be disabled, got %d", login.status)
	}

	edit := env.sendJSON(t, "PATCH", "/api/collections/users/records/"+user.Id, token, map[string]any{"sanad_id": "victim"})
	if edit.status < 400 {
		t.Fatalf("editing sanad_id should be rejected, got %d", edit.status)
	}
}
