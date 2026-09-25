//! Menu-bar / system-tray popover, handled entirely in Rust.
//!
//! This used to run in the main window's JavaScript: a tray click went to the main
//! webview, which made ~8 awaited IPC round-trips to measure, place and show the
//! popover. The main window is usually hidden when the tray is used, so macOS
//! throttled that webview and every open crawled. It was also an ordinary window,
//! which can't appear over another app's full-screen Space, and its placement mixed
//! monitors with different scale factors.
//!
//! Now: the click is handled here, the popover is placed on the monitor that owns
//! the clicked icon (in that monitor's pixels), and on macOS the window is an
//! NSPanel that joins every Space — including full-screen ones — without
//! activating the app or switching Spaces.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Position, Rect, Size, WebviewWindow};

pub const TRAY_ID: &str = "meeqat-tray";
const POPOVER: &str = "tray";
/// Clicking the tray icon while the popover is open first blurs it (hiding it), then
/// delivers the click — which would immediately reopen it. Ignore that click.
const REOPEN_GUARD: Duration = Duration::from_millis(300);
/// Windows can report a spurious blur right after an undecorated window is shown.
#[cfg(not(target_os = "macos"))]
const BLUR_GRACE: Duration = Duration::from_millis(300);

#[derive(Default)]
struct PopoverState {
    last_auto_hide: Option<Instant>,
    last_show: Option<Instant>,
}

/// Latest tray data (prayer times, dates, place) from the main window. The popover
/// pulls it on load, so it never depends on catching a one-off event.
#[derive(Default)]
pub struct TraySnapshot(pub Mutex<Option<serde_json::Value>>);

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    app.manage(Mutex::new(PopoverState::default()));
    app.manage(TraySnapshot::default());

    let popover = app
        .get_webview_window(POPOVER)
        .expect("tray window is declared in tauri.conf.json");

    #[cfg(target_os = "macos")]
    macos::make_panel(app, &popover)?;

    #[cfg(not(target_os = "macos"))]
    {
        let handle = app.clone();
        popover.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(false) = event {
                let recently_shown = handle
                    .state::<Mutex<PopoverState>>()
                    .lock()
                    .ok()
                    .and_then(|s| s.last_show)
                    .is_some_and(|t| t.elapsed() < BLUR_GRACE);
                if !recently_shown {
                    hide(&handle);
                }
            }
        });
    }

    let open = MenuItem::with_id(app, "open", "Open Meeqat", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Meeqat", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &quit])?;

    let builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Meeqat")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                toggle(tray.app_handle(), rect);
            }
        });

    // macOS shows a text title in the menu bar (the countdown); elsewhere an icon.
    #[cfg(target_os = "macos")]
    let builder = builder.title("Meeqat");
    #[cfg(not(target_os = "macos"))]
    let builder = match app.default_window_icon() {
        Some(icon) => builder.icon(icon.clone()),
        None => builder,
    };

    builder.build(app)?;
    Ok(())
}

fn toggle(app: &AppHandle, rect: Rect) {
    if is_visible(app) {
        hide(app);
        return;
    }
    let just_hidden = app
        .state::<Mutex<PopoverState>>()
        .lock()
        .ok()
        .and_then(|s| s.last_auto_hide)
        .is_some_and(|t| t.elapsed() < REOPEN_GUARD);
    if !just_hidden {
        show_at(app, rect);
    }
}

fn popover(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(POPOVER)
}

fn is_visible(app: &AppHandle) -> bool {
    popover(app).and_then(|w| w.is_visible().ok()).unwrap_or(false)
}

fn show_at(app: &AppHandle, rect: Rect) {
    let Some(window) = popover(app) else { return };
    if let Some(pos) = placement(app, &window, rect) {
        let _ = window.set_position(pos);
    }
    if let Ok(mut s) = app.state::<Mutex<PopoverState>>().lock() {
        s.last_show = Some(Instant::now());
    }

    #[cfg(target_os = "macos")]
    macos::show(app);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window.show();
        let _ = window.set_focus();
    }
    // Lets the page resync its clock the moment it appears.
    let _ = app.emit_to(POPOVER, "meeqat:tray:shown", ());
}

/// Hide the popover (blur, Esc, its close button). Records the time for REOPEN_GUARD.
pub fn hide(app: &AppHandle) {
    if let Ok(mut s) = app.state::<Mutex<PopoverState>>().lock() {
        s.last_auto_hide = Some(Instant::now());
    }
    #[cfg(target_os = "macos")]
    macos::hide(app);
    #[cfg(not(target_os = "macos"))]
    if let Some(w) = popover(app) {
        let _ = w.hide();
    }
}

pub fn show_main(app: &AppHandle) {
    hide(app);
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

/// Where to put the popover: centred under the clicked icon (above it when the
/// taskbar is at the bottom), on the monitor that contains the icon, clamped to
/// that monitor's work area. Everything is in that monitor's physical pixels, so
/// mixed-DPI setups don't shift it onto the wrong screen.
fn placement(app: &AppHandle, window: &WebviewWindow, rect: Rect) -> Option<PhysicalPosition<i32>> {
    let monitors = app.available_monitors().ok()?;
    let (mut ax, mut ay, mut aw, mut ah) = rect_physical(&rect, &monitors);

    // Some platforms (notably Linux) report an empty rect: anchor to the cursor.
    let rect_empty = aw <= 0.0 && ah <= 0.0 && ax == 0.0 && ay == 0.0;
    if rect_empty {
        let cursor = app.cursor_position().ok()?;
        (ax, ay, aw, ah) = (cursor.x, cursor.y, 0.0, 0.0);
    }
    let (cx, cy) = (ax + aw / 2.0, ay + ah / 2.0);

    let monitor = monitors
        .iter()
        .find(|m| contains(m, cx, cy))
        .or_else(|| monitors.first())?;

    // The window's logical size, rendered at the target monitor's scale.
    let scale = monitor.scale_factor();
    let current_scale = window.scale_factor().unwrap_or(scale);
    let outer = window.outer_size().ok()?;
    let w = outer.width as f64 / current_scale * scale;
    let h = outer.height as f64 / current_scale * scale;

    let area = monitor.work_area();
    let (left, top) = (area.position.x as f64, area.position.y as f64);
    let (right, bottom) = (left + area.size.width as f64, top + area.size.height as f64);
    let margin = 6.0 * scale;

    let mut x = cx - w / 2.0;
    // Below the icon (macOS menu bar, top-docked panels); above it when that
    // wouldn't fit (bottom taskbar on Windows/Linux).
    let mut y = ay + ah + margin;
    if y + h > bottom {
        y = ay - h - margin;
    }
    x = x.clamp(left + margin, (right - w - margin).max(left));
    y = y.clamp(top, (bottom - h).max(top));
    Some(PhysicalPosition::new(x.round() as i32, y.round() as i32))
}

fn contains(m: &tauri::Monitor, x: f64, y: f64) -> bool {
    let p = m.position();
    let s = m.size();
    x >= p.x as f64 && x < p.x as f64 + s.width as f64 && y >= p.y as f64 && y < p.y as f64 + s.height as f64
}

/// The tray rect in physical pixels. Tray events are normally physical already; a
/// logical rect is converted with the scale of the monitor it falls on.
fn rect_physical(rect: &Rect, monitors: &[tauri::Monitor]) -> (f64, f64, f64, f64) {
    let scale_at = |x: f64, y: f64| {
        monitors
            .iter()
            .find(|m| {
                let s = m.scale_factor();
                contains(m, x * s, y * s)
            })
            .map(|m| m.scale_factor())
            .unwrap_or(1.0)
    };
    let (x, y, pos_scale) = match rect.position {
        Position::Physical(p) => (p.x as f64, p.y as f64, 1.0),
        Position::Logical(p) => (p.x, p.y, scale_at(p.x, p.y)),
    };
    let (w, h) = match rect.size {
        Size::Physical(s) => (s.width as f64, s.height as f64),
        Size::Logical(s) => (s.width * pos_scale, s.height * pos_scale),
    };
    (x * pos_scale, y * pos_scale, w, h)
}

#[tauri::command]
pub fn hide_tray_popover(app: AppHandle) {
    hide(&app);
}

#[tauri::command]
pub fn set_tray_snapshot(app: AppHandle, state: tauri::State<'_, TraySnapshot>, payload: serde_json::Value) {
    if let Ok(mut s) = state.0.lock() {
        *s = Some(payload.clone());
    }
    let _ = app.emit_to(POPOVER, "meeqat:tray:snapshot", payload);
}

#[tauri::command]
pub fn get_tray_snapshot(state: tauri::State<'_, TraySnapshot>) -> Option<serde_json::Value> {
    state.0.lock().ok().and_then(|s| s.clone())
}

#[cfg(target_os = "macos")]
mod macos {
    use tauri::{AppHandle, WebviewWindow};
    use tauri_nspanel::{tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt};

    tauri_panel! {
        panel!(TrayPanel {
            config: {
                can_become_key_window: true,
                is_floating_panel: true
            }
        })

        panel_event!(TrayPanelEvents {
            window_did_resign_key(notification: &NSNotification) -> ()
        })
    }

    pub fn make_panel(app: &AppHandle, window: &WebviewWindow) -> tauri::Result<()> {
        let panel = window.to_panel::<TrayPanel>()?;

        // Above normal windows and full-screen apps, like a menu-bar extra.
        panel.set_level(PanelLevel::Status.value());
        // Never activates Meeqat (so macOS doesn't jump back to Meeqat's Space).
        let _ = panel.add_style_mask(StyleMask::empty().nonactivating_panel().into());
        // Shows on whichever Space is current, including another app's full screen.
        panel.set_collection_behavior(
            CollectionBehavior::new()
                .can_join_all_spaces()
                .full_screen_auxiliary()
                .into(),
        );

        let handler = TrayPanelEvents::new();
        let handle = app.clone();
        handler.window_did_resign_key(move |_| super::hide(&handle));
        // The panel retains its handler (tauri-nspanel docs), so it outlives this scope.
        panel.set_event_handler(Some(handler.as_ref()));
        Ok(())
    }

    pub fn show(app: &AppHandle) {
        if let Ok(panel) = app.get_webview_panel(super::POPOVER) {
            panel.show_and_make_key();
        }
    }

    pub fn hide(app: &AppHandle) {
        if let Ok(panel) = app.get_webview_panel(super::POPOVER) {
            panel.hide();
        }
    }
}
