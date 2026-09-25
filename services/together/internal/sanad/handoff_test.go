package sanad_test

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"testing"
)

func postJSON(t *testing.T, url string, payload map[string]string) (int, map[string]any) {
	t.Helper()
	raw, _ := json.Marshal(payload)
	resp, err := http.Post(url, "application/json", bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("POST %s: %v", url, err)
	}
	defer resp.Body.Close()
	var body map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&body)
	return resp.StatusCode, body
}

func pkcePair() (verifier, challenge string) {
	verifier = base64.RawURLEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef"))
	sum := sha256.Sum256([]byte(verifier))
	return verifier, base64.RawURLEncoding.EncodeToString(sum[:])
}

// The native sign-in hand-off: a code only works once, and only with the
// verifier that matches the challenge it was issued for.
func TestHandoffRedeem(t *testing.T) {
	_, srv, key := newTestServer(t)
	verifier, challenge := pkcePair()

	issue := func() string {
		status, body := postJSON(t, srv.URL+"/api/sanad/handoff", map[string]string{"token": signToken(t, key, testKID), "challenge": challenge})
		if status != 200 || body["code"] == "" {
			t.Fatalf("handoff: expected a code, got %d %v", status, body)
		}
		return body["code"].(string)
	}
	redeem := func(code, v string) (int, map[string]any) {
		return postJSON(t, srv.URL+"/api/sanad/redeem", map[string]string{"code": code, "verifier": v})
	}

	code := issue()
	if status, body := redeem(code, verifier); status != 200 || body["token"] == "" {
		t.Fatalf("redeem with the right verifier: got %d %v", status, body)
	} else if rec, _ := body["record"].(map[string]any); rec["sanad_id"] != "sanad-user-1" {
		t.Fatalf("redeemed the wrong user: %v", rec)
	}
	if status, _ := redeem(code, verifier); status != 401 {
		t.Fatalf("second redeem of the same code should fail, got %d", status)
	}

	code = issue()
	if status, _ := redeem(code, "wrong-verifier"); status != 401 {
		t.Fatalf("wrong verifier should fail, got %d", status)
	}
	if status, _ := redeem(code, verifier); status != 401 {
		t.Fatalf("a code must be burnt by a failed attempt, got %d", status)
	}

	if status, _ := postJSON(t, srv.URL+"/api/sanad/handoff", map[string]string{"token": "junk", "challenge": challenge}); status != 401 {
		t.Fatalf("handoff with a bad Sanad token should fail, got %d", status)
	}
	if status, _ := postJSON(t, srv.URL+"/api/sanad/handoff", map[string]string{"token": signToken(t, key, testKID), "challenge": "short"}); status != 400 {
		t.Fatalf("malformed challenge should be rejected, got %d", status)
	}
}
