//! Desktop prayer notifications, scheduled in Rust.
//!
//! tauri-plugin-notification can't schedule on desktop: its `show()` ignores the
//! `schedule` field and delivers immediately. Meeqat re-lays a week of reminders
//! whenever the day's timings change (midnight), on launch and on resume — so on
//! macOS/Windows/Linux every one of them fired at once ("stale" floods at 12 AM).
//! Android/iOS schedule natively and don't use this.
//!
//! Here the list lives in Rust and one thread delivers each notification at its
//! time. A reminder more than STALE late (the machine slept through it) is dropped.
//!
//! Rust-owned one-off reminders (Pray Together meetings, see together.rs) live in a
//! separate keyed list that the JS window's replace/cancel never touches.

use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

/// Deliver late notifications only if they're at most this late.
const STALE_MS: i64 = 2 * 60 * 1000;
/// Re-check the wall clock at least this often, so sleep/wake and clock changes
/// are noticed even while waiting for a far-off notification.
const MAX_WAIT: Duration = Duration::from_secs(20);

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledNotification {
    /// Unix epoch milliseconds.
    pub at_ms: i64,
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub silent: bool,
}

#[derive(Default)]
struct Queue {
    items: Vec<ScheduledNotification>,
    /// Reminders set from Rust by key (`set_reminder`), independent of `items`.
    keyed: HashMap<String, ScheduledNotification>,
}

pub struct DesktopScheduler(Arc<(Mutex<Queue>, Condvar)>);

pub(crate) fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

pub fn setup(app: &AppHandle) {
    let shared = Arc::new((Mutex::new(Queue::default()), Condvar::new()));
    app.manage(DesktopScheduler(shared.clone()));

    let handle = app.clone();
    std::thread::spawn(move || {
        let (lock, wake) = &*shared;
        loop {
            let due: Vec<ScheduledNotification>;
            {
                let mut q = lock.lock().unwrap_or_else(|e| e.into_inner());
                let now = now_ms();
                let mut ready = take_due(&mut q.items, now);
                q.keyed.retain(|_, n| {
                    if n.at_ms > now {
                        return true;
                    }
                    if now - n.at_ms <= STALE_MS {
                        ready.push(n.clone());
                    }
                    false
                });
                due = ready;

                if due.is_empty() {
                    let wait = q
                        .items
                        .first()
                        .into_iter()
                        .chain(q.keyed.values())
                        .map(|n| n.at_ms)
                        .min()
                        .map(|at| Duration::from_millis((at - now).max(0) as u64))
                        .unwrap_or(MAX_WAIT)
                        .min(MAX_WAIT);
                    // Woken early when the list is replaced.
                    let _ = wake.wait_timeout(q, wait);
                    continue;
                }
            }
            for n in due {
                let mut b = handle.notification().builder().title(n.title).body(n.body);
                if !n.silent {
                    b = b.sound("default");
                }
                if let Err(e) = b.show() {
                    eprintln!("[notify] failed to show notification: {e}");
                }
            }
        }
    });
}

/// Remove everything due by `now` from `items`; return the ones still fresh enough
/// to show (stale ones — the machine slept through them — are dropped).
fn take_due(items: &mut Vec<ScheduledNotification>, now: i64) -> Vec<ScheduledNotification> {
    let (ready, later): (Vec<_>, Vec<_>) = items.drain(..).partition(|n| n.at_ms <= now);
    *items = later;
    ready.into_iter().filter(|n| now - n.at_ms <= STALE_MS).collect()
}

/// Replace the pending list (the JS side always sends the full rolling window).
#[tauri::command]
pub fn schedule_notifications(state: tauri::State<'_, DesktopScheduler>, items: Vec<ScheduledNotification>) {
    let (lock, wake) = &*state.0;
    let now = now_ms();
    let mut q = lock.lock().unwrap_or_else(|e| e.into_inner());
    q.items = items.into_iter().filter(|n| n.at_ms > now).collect();
    q.items.sort_by_key(|n| n.at_ms);
    wake.notify_all();
}

#[tauri::command]
pub fn cancel_notifications(state: tauri::State<'_, DesktopScheduler>) {
    let (lock, wake) = &*state.0;
    lock.lock().unwrap_or_else(|e| e.into_inner()).items.clear();
    wake.notify_all();
}

/// Set (`Some`) or cancel (`None`) the Rust-owned reminder under `key`. A reminder
/// whose time has already passed is not scheduled.
pub fn set_reminder(app: &AppHandle, key: &str, reminder: Option<ScheduledNotification>) {
    let Some(state) = app.try_state::<DesktopScheduler>() else { return };
    let (lock, wake) = &*state.0;
    let mut q = lock.lock().unwrap_or_else(|e| e.into_inner());
    match reminder {
        Some(n) if n.at_ms > now_ms() => {
            eprintln!("[notify] reminder {key} scheduled at {} (epoch ms)", n.at_ms);
            q.keyed.insert(key.to_string(), n);
        }
        _ => {
            if q.keyed.remove(key).is_some() {
                eprintln!("[notify] reminder {key} cancelled");
            }
        }
    }
    wake.notify_all();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn n(at_ms: i64, title: &str) -> ScheduledNotification {
        ScheduledNotification { at_ms, title: title.into(), body: String::new(), silent: false }
    }

    #[test]
    fn fires_due_keeps_future_drops_stale() {
        let now = 1_000_000_000;
        let mut items = vec![
            n(now - STALE_MS - 1, "slept through"),
            n(now - 30_000, "just due"),
            n(now, "exactly now"),
            n(now + 60_000, "later"),
        ];
        let due = take_due(&mut items, now);
        let titles: Vec<_> = due.iter().map(|d| d.title.as_str()).collect();
        assert_eq!(titles, ["just due", "exactly now"]);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "later");
    }

    #[test]
    fn a_week_scheduled_at_midnight_fires_nothing_immediately() {
        // The reported bug: re-laying the window at 00:00 showed every reminder at once.
        let now = 1_000_000_000;
        let mut items: Vec<_> = (1..=60).map(|i| n(now + i * 3_600_000, "future")).collect();
        assert!(take_due(&mut items, now).is_empty());
        assert_eq!(items.len(), 60);
    }
}
