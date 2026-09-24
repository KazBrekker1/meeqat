// Package rooms implements room creation defaults, join/rotate-code/nearby
// routes and member-role management for Pray Together rooms.
package rooms

import (
	"crypto/rand"
	"math"
	"strconv"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// codeAlphabet excludes visually-ambiguous characters (0/O, 1/I/L).
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

const codeLength = 8

// RegisterHooks wires the rooms record hooks (defaults on create, owner
// membership after create). Call once during app bootstrap.
func RegisterHooks(app core.App) {
	app.OnRecordCreateRequest("rooms").BindFunc(func(e *core.RecordRequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("sign in required", nil)
		}

		e.Record.Set("owner", e.Auth.Id)

		tz := e.Record.GetString("tz")
		if tz == "" {
			return apis.NewBadRequestError("tz is required", nil)
		}
		if _, err := time.LoadLocation(tz); err != nil {
			return apis.NewBadRequestError("invalid tz", nil)
		}

		code, err := generateUniqueCode(e.App)
		if err != nil {
			return apis.NewInternalServerError("could not generate room code", nil)
		}
		e.Record.Set("code", code)

		if e.Record.GetBool("discoverable") {
			lat := round3(e.Record.GetFloat("lat"))
			lng := round3(e.Record.GetFloat("lng"))
			e.Record.Set("lat", lat)
			e.Record.Set("lng", lng)
		} else {
			e.Record.Set("lat", 0)
			e.Record.Set("lng", 0)
		}

		return e.Next()
	})

	app.OnRecordAfterCreateSuccess("rooms").BindFunc(func(e *core.RecordEvent) error {
		if err := upsertMembership(e.App, e.Record.Id, e.Record.GetString("owner"), "owner", true); err != nil {
			return err
		}
		return e.Next()
	})
}

// Register mounts the custom room routes on se.Router.
func Register(se *core.ServeEvent, app core.App) {
	g := se.Router.Group("/api/rooms").Bind(apis.RequireAuth("users"))

	g.POST("/join", func(e *core.RequestEvent) error {
		var body struct {
			Code string `json:"code"`
		}
		if err := e.BindBody(&body); err != nil || body.Code == "" {
			return apis.NewBadRequestError("code is required", nil)
		}

		room, err := e.App.FindFirstRecordByFilter("rooms", "code = {:code}", dbx.Params{"code": body.Code})
		if err != nil {
			return apis.NewNotFoundError("room not found", nil)
		}

		if err := upsertMembership(e.App, room.Id, e.Auth.Id, "member", true); err != nil {
			return apis.NewInternalServerError("could not join room", nil)
		}

		return e.JSON(200, room)
	})

	g.POST("/{id}/join", func(e *core.RequestEvent) error {
		room, err := e.App.FindRecordById("rooms", e.Request.PathValue("id"))
		if err != nil {
			return apis.NewNotFoundError("room not found", nil)
		}
		if !room.GetBool("discoverable") {
			return apis.NewForbiddenError("room is not discoverable", nil)
		}

		if err := upsertMembership(e.App, room.Id, e.Auth.Id, "member", true); err != nil {
			return apis.NewInternalServerError("could not join room", nil)
		}

		return e.JSON(200, room)
	})

	g.POST("/{id}/rotate-code", func(e *core.RequestEvent) error {
		room, err := e.App.FindRecordById("rooms", e.Request.PathValue("id"))
		if err != nil {
			return apis.NewNotFoundError("room not found", nil)
		}
		if room.GetString("owner") != e.Auth.Id {
			return apis.NewForbiddenError("only the owner can rotate the code", nil)
		}

		code, err := generateUniqueCode(e.App)
		if err != nil {
			return apis.NewInternalServerError("could not generate room code", nil)
		}
		room.Set("code", code)
		if err := e.App.Save(room); err != nil {
			return apis.NewInternalServerError("could not rotate code", nil)
		}

		return e.JSON(200, room)
	})

	g.PATCH("/{id}/members/{userId}", func(e *core.RequestEvent) error {
		room, err := e.App.FindRecordById("rooms", e.Request.PathValue("id"))
		if err != nil {
			return apis.NewNotFoundError("room not found", nil)
		}
		if room.GetString("owner") != e.Auth.Id {
			return apis.NewForbiddenError("only the owner can change roles", nil)
		}

		userId := e.Request.PathValue("userId")
		if userId == e.Auth.Id {
			return apis.NewBadRequestError("the owner can't demote themself", nil)
		}

		var body struct {
			Role string `json:"role"`
		}
		if err := e.BindBody(&body); err != nil || (body.Role != "caller" && body.Role != "member") {
			return apis.NewBadRequestError("role must be caller or member", nil)
		}

		membership, err := e.App.FindFirstRecordByFilter(
			"memberships",
			"room = {:room} && user = {:user}",
			dbx.Params{"room": room.Id, "user": userId},
		)
		if err != nil {
			return apis.NewNotFoundError("membership not found", nil)
		}

		membership.Set("role", body.Role)
		if err := e.App.Save(membership); err != nil {
			return apis.NewInternalServerError("could not update role", nil)
		}

		return e.JSON(200, membership)
	})

	g.DELETE("/{id}/members/{userId}", func(e *core.RequestEvent) error {
		room, err := e.App.FindRecordById("rooms", e.Request.PathValue("id"))
		if err != nil {
			return apis.NewNotFoundError("room not found", nil)
		}
		if room.GetString("owner") != e.Auth.Id {
			return apis.NewForbiddenError("only the owner can remove members", nil)
		}

		userId := e.Request.PathValue("userId")
		membership, err := e.App.FindFirstRecordByFilter(
			"memberships",
			"room = {:room} && user = {:user}",
			dbx.Params{"room": room.Id, "user": userId},
		)
		if err != nil {
			return apis.NewNotFoundError("membership not found", nil)
		}

		if err := e.App.Delete(membership); err != nil {
			return apis.NewInternalServerError("could not remove member", nil)
		}

		return e.NoContent(204)
	})

	g.GET("/nearby", func(e *core.RequestEvent) error {
		return handleNearby(e)
	})
}

type nearbyRoom struct {
	Id           string `json:"id"`
	Name         string `json:"name"`
	DefaultPlace string `json:"default_place"`
	DistanceM    int    `json:"distance_m"`
	Members      int    `json:"members"`
}

func handleNearby(e *core.RequestEvent) error {
	lat, latErr := parseFloatQuery(e, "lat")
	lng, lngErr := parseFloatQuery(e, "lng")
	if latErr != nil || lngErr != nil {
		return apis.NewBadRequestError("lat and lng are required numbers", nil)
	}

	const latDelta = 0.01
	lngDelta := 0.01 / math.Cos(lat*math.Pi/180)

	candidates, err := e.App.FindRecordsByFilter(
		"rooms",
		"discoverable = true && lat >= {:latMin} && lat <= {:latMax} && lng >= {:lngMin} && lng <= {:lngMax}",
		"",
		0,
		0,
		dbx.Params{
			"latMin": lat - latDelta,
			"latMax": lat + latDelta,
			"lngMin": lng - lngDelta,
			"lngMax": lng + lngDelta,
		},
	)
	if err != nil {
		return apis.NewInternalServerError("could not search rooms", nil)
	}

	results := make([]nearbyRoom, 0, len(candidates))
	for _, room := range candidates {
		roomLat := room.GetFloat("lat")
		roomLng := room.GetFloat("lng")
		dist := haversineMeters(lat, lng, roomLat, roomLng)
		if dist > 1000 {
			continue
		}

		count, _ := e.App.CountRecords("memberships", dbx.NewExp("room = {:room}", dbx.Params{"room": room.Id}))

		results = append(results, nearbyRoom{
			Id:           room.Id,
			Name:         room.GetString("name"),
			DefaultPlace: room.GetString("default_place"),
			DistanceM:    roundTo(dist, 50),
			Members:      int(count),
		})
	}

	// sort by distance ascending
	for i := 1; i < len(results); i++ {
		for j := i; j > 0 && results[j].DistanceM < results[j-1].DistanceM; j-- {
			results[j], results[j-1] = results[j-1], results[j]
		}
	}

	return e.JSON(200, results)
}

func upsertMembership(app core.App, roomId, userId, role string, subscribed bool) error {
	existing, err := app.FindFirstRecordByFilter(
		"memberships",
		"room = {:room} && user = {:user}",
		dbx.Params{"room": roomId, "user": userId},
	)
	if err == nil {
		existing.Set("subscribed", subscribed)
		return app.Save(existing)
	}

	collection, err := app.FindCollectionByNameOrId("memberships")
	if err != nil {
		return err
	}

	m := core.NewRecord(collection)
	m.Set("room", roomId)
	m.Set("user", userId)
	m.Set("role", role)
	m.Set("subscribed", subscribed)

	return app.Save(m)
}

func generateUniqueCode(app core.App) (string, error) {
	for i := 0; i < 10; i++ {
		code, err := randomCode()
		if err != nil {
			return "", err
		}

		_, err = app.FindFirstRecordByFilter("rooms", "code = {:code}", dbx.Params{"code": code})
		if err != nil {
			// no existing room with this code
			return code, nil
		}
	}

	return "", errCodeGenerationFailed
}

var errCodeGenerationFailed = &codeGenError{}

type codeGenError struct{}

func (*codeGenError) Error() string { return "could not generate a unique room code" }

func randomCode() (string, error) {
	b := make([]byte, codeLength)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	for i := range b {
		b[i] = codeAlphabet[int(b[i])%len(codeAlphabet)]
	}
	return string(b), nil
}

func round3(v float64) float64 {
	return math.Round(v*1000) / 1000
}

func roundTo(v float64, step int) int {
	return int(math.Round(v/float64(step))) * step
}

func haversineMeters(lat1, lng1, lat2, lng2 float64) float64 {
	const earthRadiusM = 6371000.0
	toRad := func(deg float64) float64 { return deg * math.Pi / 180 }

	dLat := toRad(lat2 - lat1)
	dLng := toRad(lng2 - lng1)

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(toRad(lat1))*math.Cos(toRad(lat2))*math.Sin(dLng/2)*math.Sin(dLng/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return earthRadiusM * c
}

func parseFloatQuery(e *core.RequestEvent, key string) (float64, error) {
	return strconv.ParseFloat(e.Request.URL.Query().Get(key), 64)
}
