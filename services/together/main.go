// Command together is the PocketBase-backed Pray Together service.
package main

import (
	"log"
	"os"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	_ "time/tzdata" // distroless has no zoneinfo db; call days are computed in room time zones

	"meeqat.app/together/internal/calendar"
	"meeqat.app/together/internal/calls"
	"meeqat.app/together/internal/cleanup"
	"meeqat.app/together/internal/rooms"
	"meeqat.app/together/internal/sanad"

	_ "meeqat.app/together/migrations"
)

func main() {
	app := pocketbase.New()

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: false,
	})

	app.OnBootstrap().BindFunc(func(e *core.BootstrapEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		return upsertSuperuserFromEnv(e.App)
	})

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		// PocketBase already exposes GET /api/health (apis/health.go); no
		// need to add our own.
		sanad.Register(se, app)
		rooms.Register(se, app)
		calls.Register(se, app)
		calendar.Register(se, app)

		return se.Next()
	})

	calls.RegisterHooks(app)
	rooms.RegisterHooks(app)
	cleanup.Register(app)

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

// upsertSuperuserFromEnv makes the admin UI usable after a fresh deploy
// without needing a shell into the container.
func upsertSuperuserFromEnv(app core.App) error {
	email := os.Getenv("PB_SUPERUSER_EMAIL")
	password := os.Getenv("PB_SUPERUSER_PASSWORD")
	if email == "" || password == "" {
		return nil
	}

	superusers, err := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	if err != nil {
		return err
	}

	record, err := app.FindAuthRecordByEmail(superusers, email)
	if err != nil {
		record = core.NewRecord(superusers)
		record.SetEmail(email)
	}

	record.SetPassword(password)
	record.SetVerified(true)

	return app.Save(record)
}
