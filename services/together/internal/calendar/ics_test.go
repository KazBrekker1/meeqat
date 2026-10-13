package calendar

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	_ "meeqat.app/together/migrations"
)

func testParams(lat, lng float64) *params {
	return &params{
		lat: round3(lat), lng: round3(lng),
		keyLat: round2(lat), keyLng: round2(lng),
		method: 4, tz: "Asia/Riyadh", alert: 10, days: 60,
	}
}

// Many subscribers refreshing at once (or a burst of requests for one new
// location) must cost a single AlAdhan request, not one each.
func TestConcurrentMissesShareOneFetch(t *testing.T) {
	var fetches atomic.Int32
	release := make(chan struct{})

	c := newCache()
	c.fetch = func(p *params, year, month int) ([]dayTimings, error) {
		fetches.Add(1)
		<-release
		return []dayTimings{{year: year, month: month, day: 1}}, nil
	}

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			// Neighbours: different 3rd decimal, same cache cell.
			days, err := c.getMonth(testParams(21.4201+float64(i%4)/1000, 39.8262), 2026, 10)
			if err != nil || len(days) != 1 {
				t.Errorf("getMonth: %v %v", days, err)
			}
		}()
	}

	// Let every goroutine reach the fetch (or its queue) before it returns.
	time.Sleep(100 * time.Millisecond)
	close(release)
	wg.Wait()

	if n := fetches.Load(); n != 1 {
		t.Fatalf("expected 1 upstream fetch for 20 concurrent misses, got %d", n)
	}

	// And it is cached now.
	if _, err := c.getMonth(testParams(21.42, 39.83), 2026, 10); err != nil || fetches.Load() != 1 {
		t.Fatalf("expected a cache hit, got %d fetches (err %v)", fetches.Load(), err)
	}
}

func TestCacheKeyIsCoarserThanTheEventUIDs(t *testing.T) {
	a, b := testParams(21.4231, 39.8262), testParams(21.4249, 39.8301)
	if cacheKey(a, 2026, 10) != cacheKey(b, 2026, 10) {
		t.Fatalf("points ~500 m apart should share a cache entry: %q vs %q", cacheKey(a, 2026, 10), cacheKey(b, 2026, 10))
	}
	if far := testParams(21.50, 39.8262); cacheKey(a, 2026, 10) == cacheKey(far, 2026, 10) {
		t.Fatalf("points ~8 km apart must not share a cache entry")
	}

	// UIDs keep the 3-decimal coordinates they always had, so calendars that
	// are already subscribed don't see every event replaced.
	loc, _ := time.LoadLocation("Asia/Riyadh")
	ics := buildICS(a, loc, []dayTimings{{year: 2026, month: 10, day: 13, timings: map[string]string{"Fajr": "05:01"}}})
	if !strings.Contains(ics, "UID:2026-10-13-fajr-21.423-39.826-4@meeqat") {
		t.Fatalf("unexpected event UID in:\n%s", ics)
	}
}

func TestFailedRefreshServesStaleEntry(t *testing.T) {
	c := newCache()
	c.fetch = func(p *params, year, month int) ([]dayTimings, error) {
		return []dayTimings{{year: year, month: month, day: 1}}, nil
	}
	p := testParams(21.42, 39.83)
	if _, err := c.getMonth(p, 2026, 10); err != nil {
		t.Fatalf("first fetch: %v", err)
	}

	c.entries[cacheKey(p, 2026, 10)].fetchedAt = time.Now().Add(-2 * cacheTTL)
	c.fetch = func(*params, int, int) ([]dayTimings, error) { return nil, errors.New("aladhan is down") }

	if days, err := c.getMonth(p, 2026, 10); err != nil || len(days) != 1 {
		t.Fatalf("expected the stale entry, got %v %v", days, err)
	}
	if _, err := c.getMonth(testParams(10, 10), 2026, 10); err == nil {
		t.Fatalf("a miss with no stale entry should fail")
	}
}

func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()

	app, err := tests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(app.Cleanup)

	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatalf("NewRouter: %v", err)
	}
	Register(&core.ServeEvent{App: app, Router: router}, app)

	mux, err := router.BuildMux()
	if err != nil {
		t.Fatalf("BuildMux: %v", err)
	}
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func status(t *testing.T, url string) int {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	resp.Body.Close()
	return resp.StatusCode
}

// The feed is public, so it is rate limited per IP (the "/cal/" settings
// rule). Requests here are invalid on purpose: they are counted all the
// same, and never reach AlAdhan.
func TestFeedIsRateLimited(t *testing.T) {
	srv := newTestServer(t)
	url := srv.URL + "/cal/prayers.ics?lat=nope"

	for i := 1; i <= 30; i++ {
		if got := status(t, url); got != 400 {
			t.Fatalf("request %d: expected 400 (bad params), got %d", i, got)
		}
	}
	if got := status(t, url); got != 429 {
		t.Fatalf("request 31 within a minute: expected 429, got %d", got)
	}
}

func TestRejectsOutOfRangeCoordinates(t *testing.T) {
	srv := newTestServer(t)
	for _, q := range []string{"lat=NaN&lng=39.8", "lat=91&lng=39.8", "lat=21.4&lng=Inf", "lat=21.4&lng=-181"} {
		if got := status(t, srv.URL+"/cal/prayers.ics?method=4&tz=Asia/Riyadh&"+q); got != 400 {
			t.Fatalf("%s: expected 400, got %d", q, got)
		}
	}
}

// Calendar services re-encode the link they are given; a mangled or missing tz
// must not turn the feed into an error page.
func TestTimezoneParamIsForgiving(t *testing.T) {
	for raw, want := range map[string]string{
		"Asia/Qatar":       "Asia/Qatar",
		"Asia%2FQatar":     "Asia/Qatar", // double-encoded by the caller
		"":                 "",
		"Not/AZone":        "",
		"Asia%252FQatar":   "",
		"America/New_York": "America/New_York",
	} {
		if got := cleanTZ(raw); got != want {
			t.Errorf("cleanTZ(%q) = %q, want %q", raw, got, want)
		}
	}
}

func TestPlaceTimezoneIsLookedUpOnce(t *testing.T) {
	c := newCache()
	var calls atomic.Int32
	c.fetchTZ = func(*params) (string, error) {
		calls.Add(1)
		return "Asia/Qatar", nil
	}

	for i := 0; i < 3; i++ {
		// 25.2854 and 25.2861 are the same place at cache precision.
		tz, err := c.placeTZ(testParams(25.2854+float64(i)*0.0003, 51.531))
		if err != nil || tz != "Asia/Qatar" {
			t.Fatalf("placeTZ = %q, %v", tz, err)
		}
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("expected one lookup, got %d", got)
	}
}

// The path form of the link reaches the same handler (and its validation).
func TestPathFormOfTheLink(t *testing.T) {
	srv := newTestServer(t)
	if got := status(t, srv.URL+"/cal/95/51.531/4/prayers.ics"); got != 400 {
		t.Fatalf("out-of-range lat in the path: expected 400, got %d", got)
	}
	if got := status(t, srv.URL+"/cal/25.285/51.531/99/prayers.ics"); got != 400 {
		t.Fatalf("bad method in the path: expected 400, got %d", got)
	}
}

func TestEventsCarryAnExplicitEnd(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Qatar")
	p := testParams(25.285, 51.531)
	p.tz = "Asia/Qatar"
	ics := buildICS(p, loc, []dayTimings{{year: 2026, month: 10, day: 13, timings: map[string]string{"Fajr": "04:13"}}})

	// Fajr 04:13 Doha = 01:13Z: the block is 01:23–01:53, the reminder 10 min before the athan.
	for _, want := range []string{"DTSTART:20261013T012300Z\r\n", "DTEND:20261013T015300Z\r\n", "TRIGGER:-PT20M\r\n", "X-WR-TIMEZONE:Asia/Qatar\r\n"} {
		if !strings.Contains(ics, want) {
			t.Errorf("feed is missing %q", want)
		}
	}
	if strings.Contains(ics, "DURATION:PT20M") {
		t.Errorf("events should end with DTEND, not DURATION")
	}
}

func TestSunriseIsNotShifted(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Qatar")
	p := testParams(25.285, 51.531)
	p.tz, p.sunrise = "Asia/Qatar", true
	ics := buildICS(p, loc, []dayTimings{{year: 2026, month: 10, day: 13, timings: map[string]string{"Sunrise": "05:31"}}})

	for _, want := range []string{"DTSTART:20261013T023100Z\r\n", "DTEND:20261013T025100Z\r\n", "TRIGGER:-PT10M\r\n"} {
		if !strings.Contains(ics, want) {
			t.Errorf("feed is missing %q", want)
		}
	}
}
