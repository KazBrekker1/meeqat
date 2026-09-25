package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// PocketBase rate limits are keyed by client IP. Behind Coolify's Traefik the
// socket peer is the proxy, so without a trusted header every user shared one
// bucket; and a whole office behind one NAT would share per-IP limits anyway.
// So: trust the proxy's X-Forwarded-For (the container port isn't published,
// only Traefik can reach it), keep IP limits only where there is no user yet
// (exchange, join-by-code), and enforce call/message limits per user in the
// calls hooks instead.
func init() {
	m.Register(func(app core.App) error {
		settings := app.Settings()

		settings.TrustedProxy.Headers = []string{"X-Forwarded-For"}
		settings.TrustedProxy.UseLeftmostIP = false

		settings.RateLimits.Enabled = true
		limits := map[string]core.RateLimitRule{
			// PocketBase's default is 20 creates / 5 s per IP; an office behind one
			// address tapping "Join" on the same alert would trip it.
			"*:create":                 {Label: "*:create", MaxRequests: 60, Duration: 5},
			"calls:create":             {}, // now per user (calls hooks)
			"messages:create":          {}, // now per user (calls hooks)
			"POST /api/sanad/exchange": {Label: "POST /api/sanad/exchange", MaxRequests: 300, Duration: 3600},
			"POST /api/rooms/join":     {Label: "POST /api/rooms/join", MaxRequests: 60, Duration: 3600},
		}
		rules := settings.RateLimits.Rules[:0]
		for _, r := range settings.RateLimits.Rules {
			if _, ours := limits[r.Label]; !ours {
				rules = append(rules, r) // keep PocketBase's defaults
			}
		}
		for _, r := range limits {
			if r.Label != "" {
				rules = append(rules, r)
			}
		}
		settings.RateLimits.Rules = rules

		return app.Save(settings)
	}, nil)
}
