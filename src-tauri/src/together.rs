//! Pray Together on desktop: a PocketBase realtime listener that lives in Rust.
//!
//! The main window is usually hidden and macOS throttles hidden webviews (the same
//! reason the tray moved to Rust), so a call started while Meeqat sits in the menu
//! bar would go unnoticed if the page owned the connection. Instead the webview hands
//! its session over (`together_set_session`) and this module:
//! - keeps one SSE connection to `{url}/api/realtime` while signed in,
//! - notifies about calls other people start ("Ahmed started Asr · Musalla B2"),
//! - arms a reminder 5 min before the meeting time of finalized calls I joined
//!   (through notify.rs's scheduler),
//! - keeps the active calls for the tray popover (`together:calls` + `together_get_calls`).
//!
//! PocketBase v0.40.4 realtime (apis/realtime.go, tools/subscriptions):
//! - `GET /api/realtime` streams SSE; the first event is `PB_CONNECT` with `{"clientId"}`.
//! - `POST /api/realtime {clientId, subscriptions}` sets the subscriptions, authorised
//!   by the raw token in `Authorization` (no "Bearer"); it must come from the same IP.
//! - A topic is `<collection>/*` (list rule) or `<collection>/<id>` (view rule), with
//!   optional `?options=<json {query, headers}>` — `query.expand` expands relations in
//!   the event records. The SSE event name is the topic string exactly as subscribed;
//!   the data is `{"action": "create"|"update"|"delete", "record": {...}}`.
//! - No keepalives: the server closes a connection after 5 min without a message, and
//!   any connection after 30 min. So a close is routine: reconnect, resubscribe, and
//!   refetch (events sent while disconnected are lost).

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::notify::{self, now_ms, ScheduledNotification};

/// Webview event carrying the active-calls snapshot (`Vec<ActiveCall>`).
const CALLS_EVENT: &str = "together:calls";
/// Asks the main window to route to a room (payload: the room id).
const OPEN_ROOM_EVENT: &str = "together:open-room";
/// Calls older than this are not announced (e.g. already running when the app starts).
const FRESH_MS: i64 = 45 * 60 * 1000;
const REMIND_BEFORE_MS: i64 = 5 * 60 * 1000;
/// The server closes an idle stream after 5 min; if not even that close arrives, the
/// connection died silently (sleep, network change) — give up on it.
const READ_IDLE: Duration = Duration::from_secs(6 * 60);
const BACKOFF_MIN_MS: u64 = 1_000;
const BACKOFF_MAX_MS: u64 = 60_000;

#[derive(Clone, PartialEq)]
struct Session {
    url: String,
    token: String,
    user_id: String,
}

/// A call as the tray shows it, most relevant first in the snapshot.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveCall {
    id: String,
    room_id: String,
    room_name: String,
    prayer: String,
    place: String,
    status: String,
    meet_at: Option<String>,
    organizer_id: String,
    organizer_name: String,
    created: String,
    going: usize,
    joined: bool,
}

#[derive(Default)]
struct State {
    session: Option<Session>,
    task: Option<JoinHandle<()>>,
    /// Active calls by id (raw records, with `expand.organizer` / `expand.room`).
    calls: HashMap<String, Value>,
    /// Participants of active calls: id → (call, user).
    participants: HashMap<String, (String, String)>,
    /// Calls already seen (announced or deliberately not), so refetches don't re-notify.
    /// In memory only: after an app restart, calls younger than FRESH_MS announce again.
    seen: HashSet<String>,
    /// Reminders currently armed: call id → at (epoch ms).
    reminders: HashMap<String, i64>,
}

pub struct Together {
    http: reqwest::Client,
    state: Mutex<State>,
}

pub fn setup(app: &AppHandle) {
    // reqwest is built with rustls but no crypto provider (shared with the updater,
    // which installs ring the same way).
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let http = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .user_agent("Meeqat desktop")
        .build()
        .unwrap_or_default();
    app.manage(Together { http, state: Mutex::new(State::default()) });
}

fn lock(app: &AppHandle) -> std::sync::MutexGuard<'_, State> {
    app.state::<Together>().inner().state.lock().unwrap_or_else(|e| e.into_inner())
}

// --- Commands ----------------------------------------------------------------

/// Start (or restart) the listener for this session. Called by the webview after
/// sign-in and every token refresh; an unchanged session is a no-op.
#[tauri::command]
pub fn together_set_session(app: AppHandle, url: String, token: String, user_id: String) {
    let session = Session { url: url.trim_end_matches('/').to_string(), token, user_id };
    let mut st = lock(&app);
    if st.session.as_ref() == Some(&session) && st.task.is_some() {
        return;
    }
    if let Some(task) = st.task.take() {
        task.abort();
    }
    let same_user = st
        .session
        .as_ref()
        .is_some_and(|s| s.url == session.url && s.user_id == session.user_id);
    if !same_user {
        reset(&app, &mut st);
    }
    st.session = Some(session.clone());
    st.task = Some(tauri::async_runtime::spawn(run(app.clone(), session)));
}

/// Stop the listener and forget everything (sign-out).
#[tauri::command]
pub fn together_clear_session(app: AppHandle) {
    let mut st = lock(&app);
    if let Some(task) = st.task.take() {
        task.abort();
    }
    st.session = None;
    reset(&app, &mut st);
    drop(st);
    let _ = app.emit(CALLS_EVENT, Vec::<ActiveCall>::new());
}

/// The current snapshot, for a webview that just loaded (the tray popover).
#[tauri::command]
pub fn together_get_calls(app: AppHandle) -> Vec<ActiveCall> {
    snapshot(&lock(&app))
}

/// Join a call as the signed-in user.
#[tauri::command]
pub async fn together_join_call(app: AppHandle, call_id: String) -> Result<(), String> {
    let session = lock(&app).session.clone().ok_or("Not signed in")?;
    let http = app.state::<Together>().http.clone();
    let res = http
        .post(format!("{}/api/collections/participants/records", session.url))
        .header(reqwest::header::AUTHORIZATION, &session.token)
        .json(&json!({ "call": call_id, "user": session.user_id }))
        .send()
        .await
        .map_err(|e| format!("Couldn't reach Pray Together: {e}"))?;
    let status = res.status();
    let body: Value = res.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        let msg = body.get("message").and_then(Value::as_str).unwrap_or("Couldn't join");
        return Err(msg.to_string());
    }
    let effects = {
        let mut st = lock(&app);
        apply_participant(&mut st, "create", &body);
        reconcile(&app, &mut st)
    };
    effects.run(&app);
    Ok(())
}

/// Show the main window on a room (the tray card's Open).
#[tauri::command]
pub fn together_open_room(app: AppHandle, room_id: String) {
    crate::tray::show_main(&app);
    let _ = app.emit_to("main", OPEN_ROOM_EVENT, room_id);
}

// --- State -------------------------------------------------------------------

fn reset(app: &AppHandle, st: &mut State) {
    st.calls.clear();
    st.participants.clear();
    // `seen` is kept: signing out and back in shouldn't re-announce the same calls.
    for id in std::mem::take(&mut st.reminders).into_keys() {
        notify::set_reminder(app, &reminder_key(&id), None);
    }
}

fn str_of<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}

fn is_active(call: &Value) -> bool {
    matches!(str_of(call, "status"), "open" | "finalized")
}

fn apply_call(st: &mut State, action: &str, record: &Value) {
    let id = str_of(record, "id").to_string();
    if id.is_empty() {
        return;
    }
    if action == "delete" || !is_active(record) {
        st.calls.remove(&id);
        st.participants.retain(|_, (call, _)| *call != id);
        return;
    }
    // Events queued during a refetch may be older than what it returned.
    if let Some(old) = st.calls.get(&id) {
        if str_of(old, "updated") > str_of(record, "updated") {
            return;
        }
    }
    st.calls.insert(id, record.clone());
}

fn apply_participant(st: &mut State, action: &str, record: &Value) {
    let id = str_of(record, "id").to_string();
    if id.is_empty() {
        return;
    }
    if action == "delete" {
        st.participants.remove(&id);
    } else {
        st.participants.insert(id, (str_of(record, "call").into(), str_of(record, "user").into()));
    }
}

fn prayer_name(prayer: &str) -> String {
    if prayer == "jumuah" {
        return "Jumu'ah".into();
    }
    let mut c = prayer.chars();
    c.next().map(|f| f.to_uppercase().chain(c).collect()).unwrap_or_default()
}

fn expanded<'a>(call: &'a Value, relation: &str, field: &str) -> &'a str {
    call.get("expand").and_then(|e| e.get(relation)).map(|r| str_of(r, field)).unwrap_or("")
}

fn to_active(st: &State, me: &str, call: &Value) -> ActiveCall {
    let id = str_of(call, "id");
    let going: Vec<&str> = st
        .participants
        .values()
        .filter(|(c, _)| c == id)
        .map(|(_, u)| u.as_str())
        .collect();
    let meet_at = str_of(call, "meet_at");
    ActiveCall {
        id: id.into(),
        room_id: str_of(call, "room").into(),
        room_name: expanded(call, "room", "name").into(),
        prayer: str_of(call, "prayer").into(),
        place: str_of(call, "place").into(),
        status: str_of(call, "status").into(),
        meet_at: (!meet_at.is_empty()).then(|| meet_at.into()),
        organizer_id: str_of(call, "organizer").into(),
        organizer_name: expanded(call, "organizer", "name").into(),
        created: str_of(call, "created").into(),
        going: going.len(),
        joined: going.contains(&me),
    }
}

/// Active calls, most relevant first: finalized ones by meeting time, then the rest
/// newest first.
fn snapshot(st: &State) -> Vec<ActiveCall> {
    let me = st.session.as_ref().map(|s| s.user_id.as_str()).unwrap_or("");
    let mut list: Vec<ActiveCall> = st.calls.values().map(|c| to_active(st, me, c)).collect();
    list.sort_by(|a, b| match (&a.meet_at, &b.meet_at) {
        (Some(x), Some(y)) => x.cmp(y),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => b.created.cmp(&a.created),
    });
    list
}

fn reminder_key(call_id: &str) -> String {
    format!("together:{call_id}")
}

fn place_line(c: &ActiveCall) -> String {
    [c.room_name.as_str(), c.place.as_str()]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" · ")
}

/// Side effects to run once the state lock is released.
struct Effects {
    notifications: Vec<(String, String)>,
    snapshot: Vec<ActiveCall>,
}

impl Effects {
    fn run(self, app: &AppHandle) {
        for (title, body) in self.notifications {
            let res = app.notification().builder().title(title).body(body).sound("default").show();
            if let Err(e) = res {
                eprintln!("[together] failed to show notification: {e}");
            }
        }
        let _ = app.emit(CALLS_EVENT, self.snapshot);
    }
}

/// After any change: announce new calls, re-arm reminders, and build the snapshot.
fn reconcile(app: &AppHandle, st: &mut State) -> Effects {
    let now = now_ms();
    let snapshot = snapshot(st);
    let me = st.session.as_ref().map(|s| s.user_id.clone()).unwrap_or_default();

    let mut notifications = Vec::new();
    for c in &snapshot {
        if !st.seen.insert(c.id.clone()) {
            continue;
        }
        let fresh = parse_pb_date(&c.created).is_some_and(|t| now - t <= FRESH_MS);
        if c.organizer_id != me && fresh && !c.joined {
            let who = if c.organizer_name.is_empty() { "Someone" } else { &c.organizer_name };
            let mut title = format!("{who} started {}", prayer_name(&c.prayer));
            if !c.place.is_empty() {
                title = format!("{title} · {}", c.place);
            }
            let body = if c.room_name.is_empty() { "Pray Together".to_string() } else { c.room_name.clone() };
            eprintln!("[together] announcing call {}", c.id);
            notifications.push((title, body));
        }
    }

    // Reminders: finalized calls I joined, 5 min before the meeting time.
    let mut want: HashMap<String, (i64, &ActiveCall)> = HashMap::new();
    for c in &snapshot {
        if c.status != "finalized" || !c.joined {
            continue;
        }
        if let Some(meet) = c.meet_at.as_deref().and_then(parse_pb_date) {
            let at = meet - REMIND_BEFORE_MS;
            if at > now {
                want.insert(c.id.clone(), (at, c));
            }
        }
    }
    let stale: Vec<String> = st.reminders.keys().filter(|id| !want.contains_key(*id)).cloned().collect();
    for id in stale {
        st.reminders.remove(&id);
        notify::set_reminder(app, &reminder_key(&id), None);
    }
    for (id, (at, c)) in want {
        if st.reminders.get(&id) == Some(&at) {
            continue;
        }
        st.reminders.insert(id.clone(), at);
        let reminder = ScheduledNotification {
            at_ms: at,
            title: format!("{} in 5 minutes", prayer_name(&c.prayer)),
            body: place_line(c),
            silent: false,
        };
        notify::set_reminder(app, &reminder_key(&id), Some(reminder));
    }

    Effects { notifications, snapshot }
}

/// PocketBase datetime ("2026-09-25 13:05:00.000Z", always UTC) → epoch ms.
fn parse_pb_date(s: &str) -> Option<i64> {
    let num = |a: usize, b: usize| s.get(a..b)?.parse::<i64>().ok();
    let (y, mo, d) = (num(0, 4)?, num(5, 7)?, num(8, 10)?);
    let (h, mi, sec) = (num(11, 13)?, num(14, 16)?, num(17, 19)?);
    let ms = if s.as_bytes().get(19) == Some(&b'.') {
        let frac: String = s[20..].chars().take_while(char::is_ascii_digit).take(3).collect();
        format!("{frac:0<3}").parse::<i64>().unwrap_or(0)
    } else {
        0
    };
    // Days since 1970-01-01 (Howard Hinnant's days_from_civil).
    let y = if mo <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (if mo > 2 { mo - 3 } else { mo + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some(((days * 24 + h) * 60 + mi) * 60_000 + sec * 1000 + ms)
}

// --- Realtime ----------------------------------------------------------------

async fn run(app: AppHandle, session: Session) {
    let http = app.state::<Together>().http.clone();
    let mut attempt: u32 = 0;
    loop {
        match connect(&app, &http, &session, &mut attempt).await {
            Ok(()) => {}
            Err(e) => eprintln!("[together] realtime: {e}"),
        }
        let delay = backoff(attempt);
        attempt = attempt.saturating_add(1);
        tokio::time::sleep(delay).await;
    }
}

/// Capped exponential backoff with jitter (half fixed, half random).
fn backoff(attempt: u32) -> Duration {
    let cap = BACKOFF_MIN_MS.saturating_mul(1 << attempt.min(6)).min(BACKOFF_MAX_MS);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as u64)
        .unwrap_or(0);
    Duration::from_millis(cap / 2 + nanos % (cap / 2 + 1))
}

/// Percent-encode a subscription option value (JSON) for the topic's query string.
fn encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// One connection: connect, subscribe, refetch, then apply events until it ends.
async fn connect(app: &AppHandle, http: &reqwest::Client, s: &Session, attempt: &mut u32) -> Result<(), String> {
    let realtime = format!("{}/api/realtime", s.url);
    let mut stream = http
        .get(&realtime)
        .header(reqwest::header::ACCEPT, "text/event-stream")
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("connect failed: {e}"))?;
    let mut sse = SseParser::default();

    let client_id = loop {
        let ev = next_event(&mut stream, &mut sse).await?;
        if ev.event == "PB_CONNECT" {
            let data: Value = serde_json::from_str(&ev.data).map_err(|e| format!("bad PB_CONNECT: {e}"))?;
            break str_of(&data, "clientId").to_string();
        }
    };

    let calls_topic = format!("calls/*?options={}", encode(r#"{"query":{"expand":"organizer,room"}}"#));
    let res = http
        .post(&realtime)
        .header(reqwest::header::AUTHORIZATION, &s.token)
        .json(&json!({ "clientId": client_id, "subscriptions": [calls_topic, "participants/*"] }))
        .send()
        .await
        .map_err(|e| format!("subscribe failed: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("subscribe failed: HTTP {}", res.status()));
    }

    // Subscribed first, so nothing falls between the fetch and the live events.
    refetch(app, http, s).await?;
    *attempt = 0;

    loop {
        let ev = next_event(&mut stream, &mut sse).await?;
        let Ok(data) = serde_json::from_str::<Value>(&ev.data) else { continue };
        let action = str_of(&data, "action");
        let record = data.get("record").unwrap_or(&Value::Null);
        let effects = {
            let mut st = lock(app);
            if ev.event.starts_with("calls/") {
                apply_call(&mut st, action, record);
            } else if ev.event.starts_with("participants/") {
                apply_participant(&mut st, action, record);
            } else {
                continue;
            }
            reconcile(app, &mut st)
        };
        effects.run(app);
    }
}

async fn get_items(http: &reqwest::Client, s: &Session, url: reqwest::Url) -> Result<Vec<Value>, String> {
    let res = http
        .get(url)
        .header(reqwest::header::AUTHORIZATION, &s.token)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("fetch failed: {e}"))?;
    let body: Value = res.json().await.map_err(|e| format!("fetch failed: {e}"))?;
    Ok(body.get("items").and_then(Value::as_array).cloned().unwrap_or_default())
}

/// Replace the state with the server's truth (the access rules only return calls in
/// rooms I'm subscribed to).
async fn refetch(app: &AppHandle, http: &reqwest::Client, s: &Session) -> Result<(), String> {
    let base = |collection: &str, params: &[(&str, &str)]| {
        reqwest::Url::parse_with_params(&format!("{}/api/collections/{collection}/records", s.url), params)
            .map_err(|e| format!("bad url: {e}"))
    };
    let calls_url = base(
        "calls",
        &[
            ("filter", "(status='open'||status='finalized')"),
            ("expand", "organizer,room"),
            ("perPage", "50"),
            ("skipTotal", "1"),
        ],
    )?;
    let participants_url = base(
        "participants",
        &[
            ("filter", "(call.status='open'||call.status='finalized')"),
            ("fields", "id,call,user"),
            ("perPage", "500"),
            ("skipTotal", "1"),
        ],
    )?;
    let calls = get_items(http, s, calls_url).await?;
    let participants = get_items(http, s, participants_url).await?;

    let effects = {
        let mut st = lock(app);
        st.calls.clear();
        st.participants.clear();
        for c in &calls {
            apply_call(&mut st, "update", c);
        }
        for p in &participants {
            apply_participant(&mut st, "create", p);
        }
        eprintln!("[together] connected; {} active call(s)", st.calls.len());
        reconcile(app, &mut st)
    };
    effects.run(app);
    Ok(())
}

// --- SSE ---------------------------------------------------------------------

struct SseEvent {
    event: String,
    data: String,
}

/// Minimal text/event-stream parser: events are blank-line separated blocks of
/// `field:value` lines (only `event` and `data` matter here).
#[derive(Default)]
struct SseParser {
    buf: Vec<u8>,
}

impl SseParser {
    fn push(&mut self, bytes: &[u8]) {
        self.buf.extend_from_slice(bytes);
    }

    fn next(&mut self) -> Option<SseEvent> {
        loop {
            let end = self.buf.windows(2).position(|w| w == b"\n\n")?;
            let block: Vec<u8> = self.buf.drain(..end + 2).collect();
            let text = String::from_utf8_lossy(&block);
            let (mut event, mut data) = (String::new(), Vec::new());
            for line in text.lines() {
                let line = line.trim_end_matches('\r');
                let (field, value) = line.split_once(':').unwrap_or((line, ""));
                let value = value.strip_prefix(' ').unwrap_or(value);
                match field {
                    "event" => event = value.to_string(),
                    "data" => data.push(value),
                    _ => {}
                }
            }
            if !event.is_empty() || !data.is_empty() {
                return Some(SseEvent { event, data: data.join("\n") });
            }
        }
    }
}

async fn next_event(stream: &mut reqwest::Response, sse: &mut SseParser) -> Result<SseEvent, String> {
    loop {
        if let Some(ev) = sse.next() {
            return Ok(ev);
        }
        match tokio::time::timeout(READ_IDLE, stream.chunk()).await {
            Err(_) => return Err("stream silent too long".into()),
            Ok(Err(e)) => return Err(format!("stream error: {e}")),
            Ok(Ok(None)) => return Err("stream closed by the server".into()),
            Ok(Ok(Some(bytes))) => sse.push(&bytes),
        }
    }
}
