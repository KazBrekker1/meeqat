package sanad_test

import (
	"encoding/json"
	"net/http"
	"net/url"
	"testing"

	"github.com/golang-jwt/jwt/v5"
)

func getJSON(t *testing.T, rawURL, token string) (int, map[string]any) {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req.Header.Set("Authorization", token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET %s: %v", rawURL, err)
	}
	defer resp.Body.Close()
	var body map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&body)
	return resp.StatusCode, body
}

// sanad_id is the user's id at the identity provider: signed-in users can
// view each other's records (name, avatar) but must not get it, nor probe
// for it with a filter. The owner still reads their own, which the web
// client relies on to recognise a stored session.
func TestSanadIdIsPrivate(t *testing.T) {
	_, srv, key := newTestServer(t)

	signIn := func(sub string) (id, token string) {
		resp, body := exchange(t, srv.URL, signToken(t, key, testKID, func(c jwt.MapClaims) {
			c["sub"] = sub
			c["email"] = sub + "@example.com"
		}))
		if resp.StatusCode != 200 {
			t.Fatalf("exchange %s: %d %v", sub, resp.StatusCode, body)
		}
		record := body["record"].(map[string]any)
		if record["sanad_id"] != sub {
			t.Fatalf("exchange must return the caller's own sanad_id, got %v", record["sanad_id"])
		}
		return record["id"].(string), body["token"].(string)
	}
	aliceId, aliceToken := signIn("sanad-alice")
	bobId, bobToken := signIn("sanad-bob")

	records := srv.URL + "/api/collections/users/records"

	status, other := getJSON(t, records+"/"+aliceId, bobToken)
	if status != 200 || other["name"] == nil {
		t.Fatalf("signed-in users can view each other, got %d %v", status, other)
	}
	if _, leaked := other["sanad_id"]; leaked {
		t.Fatalf("another user's sanad_id leaked: %v", other)
	}

	if status, own := getJSON(t, records+"/"+bobId, bobToken); status != 200 || own["sanad_id"] != "sanad-bob" {
		t.Fatalf("a user reads their own sanad_id, got %d %v", status, own)
	}

	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/collections/users/auth-refresh", nil)
	req.Header.Set("Authorization", aliceToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("auth-refresh: %v", err)
	}
	defer resp.Body.Close()
	var refreshed map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&refreshed)
	if record, _ := refreshed["record"].(map[string]any); resp.StatusCode != 200 || record["sanad_id"] != "sanad-alice" {
		t.Fatalf("auth-refresh keeps the caller's own sanad_id, got %d %v", resp.StatusCode, refreshed)
	}

	// A filter on a hidden field would be an oracle ("is there a user with this id?").
	filter := url.QueryEscape("sanad_id = 'sanad-alice'")
	if status, list := getJSON(t, records+"?filter="+filter, bobToken); status == 200 {
		t.Fatalf("filtering by sanad_id must be rejected, got %v", list)
	}
}
