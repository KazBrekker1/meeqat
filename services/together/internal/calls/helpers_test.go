package calls_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"meeqat.app/together/internal/calls"

	_ "meeqat.app/together/migrations"
)

// testEnv bundles a real PocketBase test app (schema + hooks + generic
// record CRUD API, exactly as it runs in production) behind an httptest
// server, so the calls tests exercise actual HTTP requests through the real
// access rules and hooks rather than calling Go functions directly.
type testEnv struct {
	app    *tests.TestApp
	server *httptest.Server
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()

	app, err := tests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(app.Cleanup)

	calls.RegisterHooks(app)

	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatalf("NewRouter: %v", err)
	}

	mux, err := router.BuildMux()
	if err != nil {
		t.Fatalf("BuildMux: %v", err)
	}

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	return &testEnv{app: app, server: server}
}

// createUser makes a verified users record with a random sanad_id and
// returns it together with a PocketBase auth (bearer) token for it.
func (e *testEnv) createUser(t *testing.T, sanadID string) (*core.Record, string) {
	t.Helper()

	users, err := e.app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("FindCollectionByNameOrId(users): %v", err)
	}

	u := core.NewRecord(users)
	u.SetEmail(sanadID + "@users.meeqat.invalid")
	u.SetRandomPassword()
	u.SetVerified(true)
	u.Set("sanad_id", sanadID)

	if err := e.app.Save(u); err != nil {
		t.Fatalf("save user: %v", err)
	}

	token, err := u.NewAuthToken()
	if err != nil {
		t.Fatalf("NewAuthToken: %v", err)
	}

	return u, token
}

// createRoom makes a room owned by the given user.
func (e *testEnv) createRoom(t *testing.T, owner *core.Record, tz string) *core.Record {
	t.Helper()

	rooms, err := e.app.FindCollectionByNameOrId("rooms")
	if err != nil {
		t.Fatalf("FindCollectionByNameOrId(rooms): %v", err)
	}

	r := core.NewRecord(rooms)
	r.Set("name", "Test Room")
	r.Set("default_place", "Main Hall")
	r.Set("tz", tz)
	r.Set("code", randomCode())
	r.Set("owner", owner.Id)

	if err := e.app.Save(r); err != nil {
		t.Fatalf("save room: %v", err)
	}

	return r
}

// addMembership creates a membership row for user in room.
func (e *testEnv) addMembership(t *testing.T, room, user *core.Record, role string, subscribed bool) *core.Record {
	t.Helper()

	memberships, err := e.app.FindCollectionByNameOrId("memberships")
	if err != nil {
		t.Fatalf("FindCollectionByNameOrId(memberships): %v", err)
	}

	m := core.NewRecord(memberships)
	m.Set("room", room.Id)
	m.Set("user", user.Id)
	m.Set("role", role)
	m.Set("subscribed", subscribed)

	if err := e.app.Save(m); err != nil {
		t.Fatalf("save membership: %v", err)
	}

	return m
}

type apiResponse struct {
	status int
	body   map[string]any
}

func (e *testEnv) postJSON(t *testing.T, path, token string, payload map[string]any) apiResponse {
	t.Helper()

	raw, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, e.server.URL+path, bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	defer resp.Body.Close()

	var body map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&body)

	return apiResponse{status: resp.StatusCode, body: body}
}

func (e *testEnv) getJSON(t *testing.T, path, token string) apiResponse {
	t.Helper()

	req, err := http.NewRequest(http.MethodGet, e.server.URL+path, nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	if token != "" {
		req.Header.Set("Authorization", token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	defer resp.Body.Close()

	var body map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&body)

	return apiResponse{status: resp.StatusCode, body: body}
}

var codeCounter int

func randomCode() string {
	codeCounter++
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 8)
	n := codeCounter
	for i := range b {
		b[i] = alphabet[(n+i*7)%len(alphabet)]
	}
	return string(b)
}
