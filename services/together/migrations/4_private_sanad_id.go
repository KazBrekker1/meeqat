package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// users' view rule lets any signed-in user read another user's record (names
// and avatars for participants and chat). That also exposed `sanad_id`, the
// account id at the Sanad identity provider. Hidden fields are left out of
// API responses and can't be used in client filters or sorts; server code
// (the exchange's lookup by sanad_id) is unaffected. The owner still gets
// their own sanad_id back: see sanad.RegisterHooks.
func init() {
	m.Register(func(app core.App) error {
		return setSanadIdHidden(app, true)
	}, func(app core.App) error {
		return setSanadIdHidden(app, false)
	})
}

func setSanadIdHidden(app core.App, hidden bool) error {
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}
	field, ok := users.Fields.GetByName("sanad_id").(*core.TextField)
	if !ok {
		return nil // nothing to hide
	}
	field.Hidden = hidden
	return app.Save(users)
}
