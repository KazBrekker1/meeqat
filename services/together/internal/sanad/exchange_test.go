package sanad_test

import (
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/MicahParks/jwkset"
	"github.com/golang-jwt/jwt/v5"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"meeqat.app/together/internal/sanad"

	_ "meeqat.app/together/migrations"
)

const (
	testKID      = "test-key-1"
	testIssuer   = "https://auth.sanad.ink"
	testAudience = "convex"
)

// newTestServer spins up a PocketBase test app (with our migrations
// applied), an httptest JWKS server backed by a freshly generated RSA key,
// and an HTTP server exposing POST /api/sanad/exchange pointed at it.
func newTestServer(t *testing.T) (*tests.TestApp, *httptest.Server, *rsa.PrivateKey) {
	t.Helper()

	// Start from an empty data dir (not PocketBase's own demo fixtures):
	// those fixtures ship several `users` rows, and our required+unique
	// `sanad_id` field would collide across all of them once added.
	testApp, err := tests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(testApp.Cleanup)

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}

	jwk, err := jwkset.NewJWKFromKey(key.Public(), jwkset.JWKOptions{
		Metadata: jwkset.JWKMetadataOptions{
			KID: testKID,
			ALG: jwkset.AlgRS256,
		},
	})
	if err != nil {
		t.Fatalf("NewJWKFromKey: %v", err)
	}

	jwksServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(jwkset.JWKSMarshal{Keys: []jwkset.JWKMarshal{jwk.Marshal()}})
	}))
	t.Cleanup(jwksServer.Close)

	t.Setenv("SANAD_JWKS_URL", jwksServer.URL)
	t.Setenv("SANAD_ISSUER", testIssuer)
	t.Setenv("SANAD_AUDIENCE", testAudience)

	router, err := apis.NewRouter(testApp)
	if err != nil {
		t.Fatalf("NewRouter: %v", err)
	}

	se := &core.ServeEvent{App: testApp, Router: router}
	sanad.Register(se, testApp)

	mux, err := router.BuildMux()
	if err != nil {
		t.Fatalf("BuildMux: %v", err)
	}

	apiServer := httptest.NewServer(mux)
	t.Cleanup(apiServer.Close)

	return testApp, apiServer, key
}

type claimOverrides func(jwt.MapClaims)

func signToken(t *testing.T, key *rsa.PrivateKey, kid string, overrides ...claimOverrides) string {
	t.Helper()

	claims := jwt.MapClaims{
		"sub":   "sanad-user-1",
		"email": "person@example.com",
		"name":  "Person One",
		"image": "https://example.com/avatar.png",
		"iss":   testIssuer,
		"aud":   testAudience,
		"iat":   time.Now().Unix(),
		"exp":   time.Now().Add(15 * time.Minute).Unix(),
	}
	for _, o := range overrides {
		o(claims)
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = kid

	signed, err := token.SignedString(key)
	if err != nil {
		t.Fatalf("SignedString: %v", err)
	}
	return signed
}

func exchange(t *testing.T, serverURL, token string) (*http.Response, map[string]any) {
	t.Helper()

	body, _ := json.Marshal(map[string]string{"token": token})
	resp, err := http.Post(serverURL+"/api/sanad/exchange", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST exchange: %v", err)
	}
	defer resp.Body.Close()

	var parsed map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&parsed)

	return resp, parsed
}

func TestExchangeValidToken(t *testing.T) {
	testApp, apiServer, key := newTestServer(t)

	token := signToken(t, key, testKID)
	resp, body := exchange(t, apiServer.URL, token)

	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d: %v", resp.StatusCode, body)
	}
	if body["token"] == nil || body["token"] == "" {
		t.Fatalf("expected a token in response, got %v", body)
	}

	record, ok := body["record"].(map[string]any)
	if !ok {
		t.Fatalf("expected a record in response, got %v", body)
	}
	if record["sanad_id"] != "sanad-user-1" {
		t.Fatalf("expected sanad_id sanad-user-1, got %v", record["sanad_id"])
	}

	// the user should now exist for real in the test app
	users, err := testApp.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("FindCollectionByNameOrId: %v", err)
	}
	found, err := testApp.FindFirstRecordByFilter(users, "sanad_id = {:id}", map[string]any{"id": "sanad-user-1"})
	if err != nil {
		t.Fatalf("expected the user to have been created: %v", err)
	}
	if found.GetString("name") != "Person One" {
		t.Fatalf("expected name to be set from claims, got %q", found.GetString("name"))
	}
}

func TestExchangeUpdatesExistingUser(t *testing.T) {
	testApp, apiServer, key := newTestServer(t)

	token1 := signToken(t, key, testKID)
	resp1, body1 := exchange(t, apiServer.URL, token1)
	if resp1.StatusCode != 200 {
		t.Fatalf("first exchange: expected 200, got %d: %v", resp1.StatusCode, body1)
	}
	firstRecord := body1["record"].(map[string]any)

	token2 := signToken(t, key, testKID, func(c jwt.MapClaims) {
		c["name"] = "Person One Renamed"
	})
	resp2, body2 := exchange(t, apiServer.URL, token2)
	if resp2.StatusCode != 200 {
		t.Fatalf("second exchange: expected 200, got %d: %v", resp2.StatusCode, body2)
	}
	secondRecord := body2["record"].(map[string]any)

	if firstRecord["id"] != secondRecord["id"] {
		t.Fatalf("expected the same user record, got %v and %v", firstRecord["id"], secondRecord["id"])
	}
	if secondRecord["name"] != "Person One Renamed" {
		t.Fatalf("expected name to be updated, got %v", secondRecord["name"])
	}

	users, _ := testApp.FindCollectionByNameOrId("users")
	total, err := testApp.CountRecords(users)
	if err != nil {
		t.Fatalf("CountRecords: %v", err)
	}
	if total != 1 {
		t.Fatalf("expected exactly one user after two exchanges, got %d", total)
	}
}

func TestExchangeWrongAudience(t *testing.T) {
	_, apiServer, key := newTestServer(t)

	token := signToken(t, key, testKID, func(c jwt.MapClaims) {
		c["aud"] = "some-other-app"
	})
	resp, _ := exchange(t, apiServer.URL, token)

	if resp.StatusCode != 401 {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}

func TestExchangeWrongIssuer(t *testing.T) {
	_, apiServer, key := newTestServer(t)

	token := signToken(t, key, testKID, func(c jwt.MapClaims) {
		c["iss"] = "https://not-sanad.example.com"
	})
	resp, _ := exchange(t, apiServer.URL, token)

	if resp.StatusCode != 401 {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}

func TestExchangeExpiredToken(t *testing.T) {
	_, apiServer, key := newTestServer(t)

	token := signToken(t, key, testKID, func(c jwt.MapClaims) {
		c["exp"] = time.Now().Add(-2 * time.Minute).Unix()
	})
	resp, _ := exchange(t, apiServer.URL, token)

	if resp.StatusCode != 401 {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}

func TestExchangeUnknownKey(t *testing.T) {
	_, apiServer, _ := newTestServer(t)

	otherKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}

	// signed by a key that isn't in the JWKS at all
	token := signToken(t, otherKey, "unknown-kid")
	resp, _ := exchange(t, apiServer.URL, token)

	if resp.StatusCode != 401 {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}

func TestExchangeAlgNoneRejected(t *testing.T) {
	_, apiServer, _ := newTestServer(t)

	claims := jwt.MapClaims{
		"sub": "sanad-user-1",
		"iss": testIssuer,
		"aud": testAudience,
		"exp": time.Now().Add(15 * time.Minute).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
	signed, err := token.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("SignedString: %v", err)
	}

	resp, _ := exchange(t, apiServer.URL, signed)
	if resp.StatusCode != 401 {
		t.Fatalf("expected 401 for alg=none, got %d", resp.StatusCode)
	}
}

func TestExchangeHS256Rejected(t *testing.T) {
	_, apiServer, _ := newTestServer(t)

	claims := jwt.MapClaims{
		"sub": "sanad-user-1",
		"iss": testIssuer,
		"aud": testAudience,
		"exp": time.Now().Add(15 * time.Minute).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte("some-shared-secret"))
	if err != nil {
		t.Fatalf("SignedString: %v", err)
	}

	resp, _ := exchange(t, apiServer.URL, signed)
	if resp.StatusCode != 401 {
		t.Fatalf("expected 401 for HS256, got %d", resp.StatusCode)
	}
}

func TestExchangeMissingToken(t *testing.T) {
	_, apiServer, _ := newTestServer(t)

	resp, err := http.Post(apiServer.URL+"/api/sanad/exchange", "application/json", bytes.NewReader([]byte(`{}`)))
	if err != nil {
		t.Fatalf("POST exchange: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 400 {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}
