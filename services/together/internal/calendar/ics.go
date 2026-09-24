// Package calendar serves GET /cal/prayers.ics: a subscribable calendar of
// prayer times built from the AlAdhan API, with an alarm baked into every
// event so the calendar app does the reminding.
package calendar

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const (
	maxCacheEntries = 5000
	cacheTTL        = 24 * time.Hour
	httpTimeout     = 10 * time.Second
)

var prayerOrder = []string{"Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"}

var httpClient = &http.Client{Timeout: httpTimeout}

// Register mounts GET /cal/prayers.ics on se.Router. No auth required.
func Register(se *core.ServeEvent, app core.App) {
	c := newCache()

	se.Router.GET("/cal/prayers.ics", func(e *core.RequestEvent) error {
		return handle(e, c)
	})
}

type params struct {
	lat     float64
	lng     float64
	method  int
	tz      string
	name    string
	alert   int
	days    int
	sunrise bool
}

func parseParams(e *core.RequestEvent) (*params, error) {
	q := e.Request.URL.Query()

	lat, err := strconv.ParseFloat(q.Get("lat"), 64)
	if err != nil {
		return nil, fmt.Errorf("invalid lat")
	}
	lng, err := strconv.ParseFloat(q.Get("lng"), 64)
	if err != nil {
		return nil, fmt.Errorf("invalid lng")
	}

	method, err := strconv.Atoi(q.Get("method"))
	if err != nil || method < 0 || method > 23 {
		return nil, fmt.Errorf("method must be an integer 0-23")
	}

	tz := q.Get("tz")
	if _, err := time.LoadLocation(tz); err != nil {
		return nil, fmt.Errorf("invalid tz")
	}

	alert := 10
	if v := q.Get("alert"); v != "" {
		alert, err = strconv.Atoi(v)
		if err != nil || alert < 0 || alert > 60 {
			return nil, fmt.Errorf("alert must be an integer 0-60")
		}
	}

	days := 60
	if v := q.Get("days"); v != "" {
		days, err = strconv.Atoi(v)
		if err != nil || days < 7 || days > 90 {
			return nil, fmt.Errorf("days must be an integer 7-90")
		}
	}

	sunrise := false
	if v := q.Get("sunrise"); v != "" {
		sunrise = v == "1"
	}

	name := q.Get("name")
	if len(name) > 40 {
		return nil, fmt.Errorf("name must be at most 40 characters")
	}

	return &params{
		lat:     round3(lat),
		lng:     round3(lng),
		method:  method,
		tz:      tz,
		name:    name,
		alert:   alert,
		days:    days,
		sunrise: sunrise,
	}, nil
}

func round3(v float64) float64 {
	return math.Round(v*1000) / 1000
}

func handle(e *core.RequestEvent, c *cache) error {
	p, err := parseParams(e)
	if err != nil {
		return e.BadRequestError(err.Error(), nil)
	}

	loc, err := time.LoadLocation(p.tz)
	if err != nil {
		return e.BadRequestError("invalid tz", nil)
	}

	today := time.Now().In(loc)
	end := today.AddDate(0, 0, p.days)

	days, err := collectDays(c, p, today, end)
	if err != nil {
		return e.Error(503, "prayer times temporarily unavailable", nil)
	}

	body := buildICS(p, loc, days)

	e.Response.Header().Set("Cache-Control", "public, max-age=21600")
	return e.Blob(200, "text/calendar; charset=utf-8", []byte(body))
}

// dayTimings holds the local "HH:MM" wall-clock strings for one Gregorian
// day, already expressed in the requested tz (AlAdhan's timezonestring param
// does that conversion for us).
type dayTimings struct {
	year, month, day int
	timings          map[string]string // prayer name -> "HH:MM"
}

func collectDays(c *cache, p *params, today, end time.Time) ([]dayTimings, error) {
	months := monthsBetween(today, end)

	var all []dayTimings
	for _, ym := range months {
		monthDays, err := c.getMonth(p, ym.year, ym.month)
		if err != nil {
			return nil, err
		}
		all = append(all, monthDays...)
	}

	var filtered []dayTimings
	for _, d := range all {
		date := time.Date(d.year, time.Month(d.month), d.day, 0, 0, 0, 0, time.UTC)
		if !date.Before(truncateDate(today)) && date.Before(truncateDate(end)) {
			filtered = append(filtered, d)
		}
	}

	return filtered, nil
}

func truncateDate(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

type yearMonth struct{ year, month int }

func monthsBetween(start, end time.Time) []yearMonth {
	var months []yearMonth
	cur := time.Date(start.Year(), start.Month(), 1, 0, 0, 0, 0, time.UTC)
	last := time.Date(end.Year(), end.Month(), 1, 0, 0, 0, 0, time.UTC)
	for !cur.After(last) {
		months = append(months, yearMonth{cur.Year(), int(cur.Month())})
		cur = cur.AddDate(0, 1, 0)
	}
	return months
}

// ---- AlAdhan fetch + cache ----

type aladhanResponse struct {
	Data []struct {
		Timings map[string]string `json:"timings"`
		Date    struct {
			Gregorian struct {
				Date string `json:"date"` // DD-MM-YYYY
			} `json:"gregorian"`
		} `json:"date"`
	} `json:"data"`
}

func fetchMonth(p *params, year, month int) ([]dayTimings, error) {
	u := fmt.Sprintf(
		"https://api.aladhan.com/v1/calendar/%d/%d?latitude=%g&longitude=%g&method=%d&timezonestring=%s&shafaq=general",
		year, month, p.lat, p.lng, p.method, url.QueryEscape(p.tz),
	)

	resp, err := httpClient.Get(u)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("aladhan returned %d", resp.StatusCode)
	}

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var parsed aladhanResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, err
	}

	days := make([]dayTimings, 0, len(parsed.Data))
	for _, d := range parsed.Data {
		y, mo, da, err := parseGregorian(d.Date.Gregorian.Date)
		if err != nil {
			continue
		}

		timings := make(map[string]string, len(prayerOrder))
		for _, name := range prayerOrder {
			raw, ok := d.Timings[name]
			if !ok {
				continue
			}
			timings[name] = strings.TrimSpace(strings.SplitN(raw, " ", 2)[0])
		}

		days = append(days, dayTimings{year: y, month: mo, day: da, timings: timings})
	}

	return days, nil
}

func parseGregorian(s string) (year, month, day int, err error) {
	parts := strings.Split(s, "-")
	if len(parts) != 3 {
		return 0, 0, 0, fmt.Errorf("unexpected date format %q", s)
	}
	day, err = strconv.Atoi(parts[0])
	if err != nil {
		return 0, 0, 0, err
	}
	month, err = strconv.Atoi(parts[1])
	if err != nil {
		return 0, 0, 0, err
	}
	year, err = strconv.Atoi(parts[2])
	if err != nil {
		return 0, 0, 0, err
	}
	return year, month, day, nil
}

type cacheEntry struct {
	days      []dayTimings
	fetchedAt time.Time
}

type cache struct {
	mu      sync.Mutex
	entries map[string]*cacheEntry
	order   []string // insertion order, for bounded eviction
}

func newCache() *cache {
	return &cache{entries: make(map[string]*cacheEntry)}
}

func cacheKey(p *params, year, month int) string {
	return fmt.Sprintf("%.3f,%.3f,%d,%s,%d,%d", p.lat, p.lng, p.method, p.tz, year, month)
}

func (c *cache) getMonth(p *params, year, month int) ([]dayTimings, error) {
	key := cacheKey(p, year, month)

	c.mu.Lock()
	entry, ok := c.entries[key]
	c.mu.Unlock()

	if ok && time.Since(entry.fetchedAt) < cacheTTL {
		return entry.days, nil
	}

	fresh, err := fetchMonth(p, year, month)
	if err != nil {
		if ok {
			// stale-but-present beats a hard failure
			return entry.days, nil
		}
		return nil, err
	}

	c.mu.Lock()
	if _, exists := c.entries[key]; !exists {
		c.order = append(c.order, key)
	}
	c.entries[key] = &cacheEntry{days: fresh, fetchedAt: time.Now()}
	for len(c.order) > maxCacheEntries {
		oldest := c.order[0]
		c.order = c.order[1:]
		delete(c.entries, oldest)
	}
	c.mu.Unlock()

	return fresh, nil
}

// ---- ICS building ----

func buildICS(p *params, loc *time.Location, days []dayTimings) string {
	var b strings.Builder

	write := func(s string) {
		b.WriteString(foldLine(s))
		b.WriteString("\r\n")
	}

	calname := "Prayer times"
	if p.name != "" {
		calname += " · " + p.name
	}

	write("BEGIN:VCALENDAR")
	write("VERSION:2.0")
	write("PRODID:-//Meeqat//Prayer Times//EN")
	write("CALSCALE:GREGORIAN")
	write("METHOD:PUBLISH")
	write("X-WR-CALNAME:" + icsEscape(calname))
	write("X-WR-TIMEZONE:" + icsEscape(p.tz))
	write("REFRESH-INTERVAL;VALUE=DURATION:PT12H")
	write("X-PUBLISHED-TTL:PT12H")

	prayers := []string{"Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"}
	if p.sunrise {
		prayers = append([]string{"Fajr", "Sunrise"}, prayers[1:]...)
	}

	for _, d := range days {
		date := time.Date(d.year, time.Month(d.month), d.day, 0, 0, 0, 0, time.UTC)
		isFriday := date.Weekday() == time.Friday

		for _, prayer := range prayers {
			hm, ok := d.timings[prayer]
			if !ok {
				continue
			}

			hour, min, err := parseHHMM(hm)
			if err != nil {
				continue
			}

			start := time.Date(d.year, time.Month(d.month), d.day, hour, min, 0, 0, loc).UTC()
			dateStr := fmt.Sprintf("%04d-%02d-%02d", d.year, d.month, d.day)

			summary := prayer
			if prayer == "Dhuhr" && isFriday {
				summary = "Jumu'ah / Dhuhr"
			}

			uid := fmt.Sprintf("%s-%s-%.3f-%.3f-%d@meeqat", dateStr, strings.ToLower(prayer), p.lat, p.lng, p.method)

			write("BEGIN:VEVENT")
			write("UID:" + uid)
			write("DTSTAMP:" + formatUTC(time.Now()))
			write("DTSTART:" + formatUTC(start))
			write("DURATION:PT20M")
			write("SUMMARY:" + icsEscape(summary))
			write("TRANSP:TRANSPARENT")
			write("BEGIN:VALARM")
			write("ACTION:DISPLAY")
			write("DESCRIPTION:" + icsEscape(summary))
			write(fmt.Sprintf("TRIGGER:-PT%dM", p.alert))
			write("END:VALARM")
			write("END:VEVENT")
		}
	}

	write("END:VCALENDAR")

	return b.String()
}

func parseHHMM(s string) (hour, min int, err error) {
	parts := strings.Split(s, ":")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("unexpected time format %q", s)
	}
	hour, err = strconv.Atoi(parts[0])
	if err != nil {
		return 0, 0, err
	}
	min, err = strconv.Atoi(parts[1])
	if err != nil {
		return 0, 0, err
	}
	return hour, min, nil
}

func formatUTC(t time.Time) string {
	return t.UTC().Format("20060102T150405Z")
}

func icsEscape(s string) string {
	r := strings.NewReplacer(
		`\`, `\\`,
		`;`, `\;`,
		`,`, `\,`,
		"\n", `\n`,
	)
	return r.Replace(s)
}

// foldLine wraps a single unfolded ICS content line at 75 octets per
// RFC 5545 §3.1, continuation lines prefixed with a single space, without
// splitting inside a UTF-8 multi-byte sequence.
func foldLine(s string) string {
	const limit = 75

	b := []byte(s)
	if len(b) <= limit {
		return s
	}

	var out strings.Builder
	start := 0
	first := true
	for start < len(b) {
		max := limit
		if !first {
			max = limit - 1 // account for the leading continuation space
		}

		end := start + max
		if end >= len(b) {
			end = len(b)
		} else {
			// don't split in the middle of a UTF-8 continuation byte
			for end > start && b[end]&0xC0 == 0x80 {
				end--
			}
		}

		if !first {
			out.WriteByte(' ')
		}
		out.Write(b[start:end])
		out.WriteString("\r\n")

		start = end
		first = false
	}

	// re-join: the caller adds the final "\r\n", so strip the one we added
	// after the last physical line.
	result := out.String()
	return strings.TrimSuffix(result, "\r\n")
}
