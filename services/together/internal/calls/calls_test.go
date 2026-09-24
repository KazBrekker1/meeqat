package calls_test

import (
	"sync"
	"testing"
	"time"
)

// TestOneActiveCallPerPrayerPerDay covers: a caller starting a call succeeds,
// a second call for the same room/prayer/day is rejected with 409 and the
// existing call's id, and a non-caller member is forbidden from starting one
// at all.
func TestOneActiveCallPerPrayerPerDay(t *testing.T) {
	env := newTestEnv(t)

	owner, ownerToken := env.createUser(t, "owner-1")
	member, memberToken := env.createUser(t, "member-1")
	room := env.createRoom(t, owner, "Asia/Qatar")
	env.addMembership(t, room, owner, "owner", true)
	env.addMembership(t, room, member, "member", true)

	resp := env.postJSON(t, "/api/collections/calls/records", ownerToken, map[string]any{
		"room":   room.Id,
		"prayer": "asr",
	})
	if resp.status != 200 && resp.status != 201 {
		t.Fatalf("expected 200/201 creating the first call, got %d: %v", resp.status, resp.body)
	}
	firstCallID, _ := resp.body["id"].(string)
	if firstCallID == "" {
		t.Fatalf("expected the created call to have an id, got %v", resp.body)
	}

	// a second call for the same room+prayer+day is rejected with the
	// existing call's id
	dup := env.postJSON(t, "/api/collections/calls/records", ownerToken, map[string]any{
		"room":   room.Id,
		"prayer": "asr",
	})
	if dup.status != 409 {
		t.Fatalf("expected 409 for a duplicate active call, got %d: %v", dup.status, dup.body)
	}
	data, _ := dup.body["data"].(map[string]any)
	if data == nil || data["existing"] != firstCallID {
		t.Fatalf("expected existing=%q in the 409 body, got %v", firstCallID, dup.body)
	}

	// a plain member (not owner/caller) cannot start a call at all
	forbidden := env.postJSON(t, "/api/collections/calls/records", memberToken, map[string]any{
		"room":   room.Id,
		"prayer": "maghrib",
	})
	if forbidden.status != 403 {
		t.Fatalf("expected 403 for a non-caller member, got %d: %v", forbidden.status, forbidden.body)
	}
}

// TestConcurrentCallCreationRace fires 10 concurrent create requests for the
// same room+prayer+day and asserts exactly one wins (201) and the rest lose
// to the partial unique index with a 409.
func TestConcurrentCallCreationRace(t *testing.T) {
	env := newTestEnv(t)

	owner, ownerToken := env.createUser(t, "owner-race")
	room := env.createRoom(t, owner, "Asia/Qatar")
	env.addMembership(t, room, owner, "owner", true)

	const attempts = 10
	statuses := make([]int, attempts)

	var wg sync.WaitGroup
	wg.Add(attempts)
	for i := 0; i < attempts; i++ {
		go func(i int) {
			defer wg.Done()
			resp := env.postJSON(t, "/api/collections/calls/records", ownerToken, map[string]any{
				"room":   room.Id,
				"prayer": "isha",
			})
			statuses[i] = resp.status
		}(i)
	}
	wg.Wait()

	var successes, conflicts int
	for _, s := range statuses {
		switch s {
		case 200, 201:
			successes++
		case 409:
			conflicts++
		default:
			t.Fatalf("unexpected status %d among race attempts: %v", s, statuses)
		}
	}

	if successes != 1 {
		t.Fatalf("expected exactly 1 successful create, got %d successes and %d conflicts (%v)", successes, conflicts, statuses)
	}
	if conflicts != attempts-1 {
		t.Fatalf("expected %d conflicts, got %d", attempts-1, conflicts)
	}
}

// TestJumuahOnlyOnFridays covers the Jumu'ah-specific rule: it can only be
// started on a Friday (in the room's tz), and when it is Friday a Jumu'ah
// call and a Dhuhr call can coexist (each follows the one-active rule
// separately).
func TestJumuahOnlyOnFridays(t *testing.T) {
	env := newTestEnv(t)

	owner, ownerToken := env.createUser(t, "owner-jumuah")
	room := env.createRoom(t, owner, "UTC")
	env.addMembership(t, room, owner, "owner", true)

	isFriday := time.Now().UTC().Weekday() == time.Friday

	jumuah := env.postJSON(t, "/api/collections/calls/records", ownerToken, map[string]any{
		"room":   room.Id,
		"prayer": "jumuah",
	})

	if isFriday {
		if jumuah.status != 200 && jumuah.status != 201 {
			t.Fatalf("expected jumuah to succeed on a Friday, got %d: %v", jumuah.status, jumuah.body)
		}
	} else {
		if jumuah.status != 400 {
			t.Fatalf("expected 400 for jumuah on a non-Friday, got %d: %v", jumuah.status, jumuah.body)
		}
	}

	// Dhuhr is always allowed (including alongside Jumu'ah on a Friday) and
	// follows its own one-active-call slot.
	dhuhr := env.postJSON(t, "/api/collections/calls/records", ownerToken, map[string]any{
		"room":   room.Id,
		"prayer": "dhuhr",
	})
	if dhuhr.status != 200 && dhuhr.status != 201 {
		t.Fatalf("expected dhuhr to succeed regardless of jumuah, got %d: %v", dhuhr.status, dhuhr.body)
	}
}
