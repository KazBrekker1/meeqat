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
