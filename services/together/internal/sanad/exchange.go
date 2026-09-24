// Package sanad implements the Sanad JWT -> PocketBase auth token exchange
// (POST /api/sanad/exchange).
package sanad

import (
	"context"
	"errors"
	"os"
	"strings"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const (
	defaultIssuer   = "https://auth.sanad.ink"
	defaultAudience = "convex"
	defaultJWKSURL  = "https://auth.sanad.ink/api/auth/jwks"
)

// genericAuthError is returned for every exchange failure once the request
// is confirmed to at least carry a token, so we never leak which check
// (issuer, audience, signature, expiry...) failed.
const genericAuthError = "invalid or expired token"

type exchangeRequest struct {
	Token string `json:"token"`
}

// Register mounts POST /api/sanad/exchange on se.Router. It builds its own
// background-refreshing JWKS client from SANAD_JWKS_URL (or the real Sanad
// JWKS endpoint by default) once at boot.
func Register(se *core.ServeEvent, app core.App) {
	jwksURL := envOr("SANAD_JWKS_URL", defaultJWKSURL)
	issuer := envOr("SANAD_ISSUER", defaultIssuer)
	audience := envOr("SANAD_AUDIENCE", defaultAudience)

	kf, err := keyfunc.NewDefaultCtx(context.Background(), []string{jwksURL})
	if err != nil {
		// A boot-time JWKS fetch failure shouldn't crash the whole service;
		// log it and let every exchange fail with 401 until it's refreshed.
		app.Logger().Error("sanad: failed to init JWKS client", "error", err, "url", jwksURL)
	}

	se.Router.POST("/api/sanad/exchange", func(e *core.RequestEvent) error {
		return handleExchange(e, kf, issuer, audience)
	})
}

func handleExchange(e *core.RequestEvent, kf keyfunc.Keyfunc, issuer, audience string) error {
	var body exchangeRequest
	if err := e.BindBody(&body); err != nil || strings.TrimSpace(body.Token) == "" {
		return apis.NewBadRequestError("missing token", nil)
	}

	if kf == nil {
		return apis.NewUnauthorizedError(genericAuthError, nil)
	}

	claims, err := verify(body.Token, kf, issuer, audience)
	if err != nil {
		return apis.NewUnauthorizedError(genericAuthError, nil)
	}

	app := e.App
	record, err := upsertUser(app, claims)
	if err != nil {
		return apis.NewInternalServerError("could not create or update user", nil)
	}

	token, err := record.NewAuthToken()
	if err != nil {
		return apis.NewInternalServerError("could not issue token", nil)
	}

	return e.JSON(200, map[string]any{
		"token":  token,
		"record": record,
	})
}

type sanadClaims struct {
	Sub   string
	Email string
	Name  string
	Image string
}

func verify(tokenStr string, kf keyfunc.Keyfunc, issuer, audience string) (*sanadClaims, error) {
	claims := jwt.MapClaims{}

	_, err := jwt.ParseWithClaims(tokenStr, claims, kf.Keyfunc,
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithIssuer(issuer),
		jwt.WithAudience(audience),
		jwt.WithLeeway(60*time.Second),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return nil, err
	}

	sub, _ := claims["sub"].(string)
	if sub == "" {
		return nil, errors.New("missing sub claim")
	}

	email, _ := claims["email"].(string)
	name, _ := claims["name"].(string)
	image, _ := claims["image"].(string)

	return &sanadClaims{Sub: sub, Email: email, Name: name, Image: image}, nil
}

func upsertUser(app core.App, claims *sanadClaims) (*core.Record, error) {
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return nil, err
	}

	record, err := app.FindFirstRecordByFilter(users, "sanad_id = {:sanad_id}", map[string]any{"sanad_id": claims.Sub})
	isNew := err != nil
	if isNew {
		record = core.NewRecord(users)
		record.Set("sanad_id", claims.Sub)

		email := claims.Email
		if email == "" {
			email = claims.Sub + "@users.meeqat.invalid"
		}
		record.SetEmail(email)
		record.SetRandomPassword()
		record.SetVerified(true)
	}

	changed := isNew
	if claims.Name != "" && record.GetString("name") != claims.Name {
		record.Set("name", claims.Name)
		changed = true
	}
	if claims.Image != "" && record.GetString("avatar_url") != claims.Image {
		record.Set("avatar_url", claims.Image)
		changed = true
	}

	if changed {
		if err := app.Save(record); err != nil {
			return nil, err
		}
	}

	return record, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
