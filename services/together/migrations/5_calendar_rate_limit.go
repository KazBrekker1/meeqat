package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// GET /cal/prayers.ics is public and every new location costs requests to
// the AlAdhan API, so it gets a per-IP limit like the other unauthenticated
// routes. Rule labels can't contain a dot, hence the "/cal/" path prefix
// (the feed is the only route under it). Calendar apps poll a feed a few
// times a day; Google Calendar fetches for all its subscribers from a shared
// pool of addresses, which is why this isn't tighter.
func init() {
	const label = "/cal/"

	m.Register(func(app core.App) error {
		settings := app.Settings()

		rules := settings.RateLimits.Rules[:0]
		for _, r := range settings.RateLimits.Rules {
			if r.Label != label {
				rules = append(rules, r)
			}
		}
		settings.RateLimits.Rules = append(rules,
			core.RateLimitRule{Label: label, MaxRequests: 30, Duration: 60},
		)

		return app.Save(settings)
	}, nil)
}
