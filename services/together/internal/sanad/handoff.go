package sanad

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"strings"
	"sync"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// Native sign-in hand-off (PKCE). The browser page, signed in to Sanad, trades
// a Sanad JWT plus the app's code challenge for a one-time code; the app
// redeems that code with the matching verifier. Anyone who intercepts the
// meeqat:// link only gets the code, which is useless without the verifier.

const handoffTTL = 3 * time.Minute

type pendingHandoff struct {
	userId    string
	challenge string
	expires   time.Time
}

type handoffStore struct {
	mu    sync.Mutex
	codes map[string]pendingHandoff
	now   func() time.Time
}

func newHandoffStore() *handoffStore {
	return &handoffStore{codes: map[string]pendingHandoff{}, now: time.Now}
}

func (s *handoffStore) issue(userId, challenge string) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	code := base64.RawURLEncoding.EncodeToString(b)

	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	for c, p := range s.codes { // codes are few and short-lived: sweep on write
		if now.After(p.expires) {
			delete(s.codes, c)
		}
	}
	s.codes[code] = pendingHandoff{userId: userId, challenge: challenge, expires: now.Add(handoffTTL)}
	return code, nil
}

// redeem consumes the code (single use, even when the verifier is wrong) and
// returns its user if the verifier matches and the code hasn't expired.
func (s *handoffStore) redeem(code, verifier string) (string, bool) {
	s.mu.Lock()
	p, ok := s.codes[code]
	delete(s.codes, code)
	s.mu.Unlock()
	if !ok || s.now().After(p.expires) {
		return "", false
	}
	sum := sha256.Sum256([]byte(verifier))
	got := base64.RawURLEncoding.EncodeToString(sum[:])
	if subtle.ConstantTimeCompare([]byte(got), []byte(p.challenge)) != 1 {
		return "", false
	}
	return p.userId, true
}

// A base64url SHA-256 digest is 43 characters.
func validChallenge(c string) bool {
	if len(c) != 43 {
		return false
	}
	_, err := base64.RawURLEncoding.DecodeString(c)
	return err == nil
}

func registerHandoff(se *core.ServeEvent, kf keyfunc.Keyfunc, issuer, audience string, store *handoffStore) {
	se.Router.POST("/api/sanad/handoff", func(e *core.RequestEvent) error {
		var body struct {
			Token     string `json:"token"`
			Challenge string `json:"challenge"`
		}
		if err := e.BindBody(&body); err != nil || strings.TrimSpace(body.Token) == "" || !validChallenge(body.Challenge) {
			return apis.NewBadRequestError("missing token or challenge", nil)
		}
		if kf == nil {
			return apis.NewUnauthorizedError(genericAuthError, nil)
		}
		claims, err := verify(body.Token, kf, issuer, audience)
		if err != nil {
			return apis.NewUnauthorizedError(genericAuthError, nil)
		}
		record, err := upsertUser(e.App, claims)
		if err != nil {
			return apis.NewInternalServerError("could not create or update user", nil)
		}
		code, err := store.issue(record.Id, body.Challenge)
		if err != nil {
			return apis.NewInternalServerError("could not issue code", nil)
		}
		return e.JSON(200, map[string]any{"code": code})
	})

	se.Router.POST("/api/sanad/redeem", func(e *core.RequestEvent) error {
		var body struct {
			Code     string `json:"code"`
			Verifier string `json:"verifier"`
		}
		if err := e.BindBody(&body); err != nil || body.Code == "" || body.Verifier == "" {
			return apis.NewBadRequestError("missing code or verifier", nil)
		}
		userId, ok := store.redeem(body.Code, body.Verifier)
		if !ok {
			return apis.NewUnauthorizedError(genericAuthError, nil)
		}
		record, err := e.App.FindRecordById("users", userId)
		if err != nil {
			return apis.NewUnauthorizedError(genericAuthError, nil)
		}
		token, err := record.NewAuthToken()
		if err != nil {
			return apis.NewInternalServerError("could not issue token", nil)
		}
		return e.JSON(200, map[string]any{"token": token, "record": record})
	})
}
