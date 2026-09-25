package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Native apps sign in through a one-time hand-off and keep their PocketBase
// session: a month-long token (renewed by authRefresh on every app start)
// means people who open the app occasionally don't have to sign in again.
func init() {
	m.Register(func(app core.App) error {
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}
		users.AuthToken.Duration = 30 * 24 * 60 * 60
		if err := app.Save(users); err != nil {
			return err
		}

		settings := app.Settings()
		settings.RateLimits.Rules = append(settings.RateLimits.Rules,
			core.RateLimitRule{Label: "POST /api/sanad/handoff", MaxRequests: 60, Duration: 3600},
			core.RateLimitRule{Label: "POST /api/sanad/redeem", MaxRequests: 60, Duration: 3600},
		)
		return app.Save(settings)
	}, nil)
}
