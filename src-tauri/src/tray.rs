//! Menu-bar / system-tray popover, handled entirely in Rust.
//!
//! This used to run in the main window's JavaScript: a tray click went to the main
//! webview, which made ~8 awaited IPC round-trips to measure, place and show the
//! popover. The main window is usually hidden when the tray is used, so macOS
//! throttled that webview and every open crawled. It was also an ordinary window,
//! which can't appear over another app's full-screen Space, and its placement mixed
//! monitors with different scale factors.
//!
//! Now: the click is handled here, the popover is placed under the clicked icon on
//! that icon's screen (`geometry`), and on macOS the window is an NSPanel that
//! joins every Space — including full-screen ones — without activating the app or
//! switching Spaces.
//!
//! Placement on macOS is done in AppKit points, not through Tauri's "physical"
//! positions: there, each screen's pixels are its points × its own scale, so with
//! a Retina and a non-Retina display the pixel spaces overlap and a physical
//! position doesn't name one spot (see `geometry::unscale_anchor`).

mod geometry;

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Rect, WebviewWindow};
#[cfg(not(target_os = "macos"))]
use tauri::{PhysicalPosition, Position, Size};

pub const TRAY_ID: &str = "meeqat-tray";
const POPOVER: &str = "tray";
/// Gap between the tray icon and the popover, in logical pixels.
const MARGIN: f64 = 6.0;
/// Pressing the tray icon while the popover is open can blur it (hiding it) before
/// the press is delivered. A popover hidden this recently still counts as open for
/// that press, so the click closes it instead of reopening it.
const REOPEN_GUARD: Duration = Duration::from_millis(300);
/// Windows can report a spurious blur right after an undecorated window is shown.
#[cfg(not(target_os = "macos"))]
const BLUR_GRACE: Duration = Duration::from_millis(300);

#[derive(Default)]
struct PopoverState {
    last_auto_hide: Option<Instant>,
    last_show: Option<Instant>,
    /// The tray icon was pressed while the popover was open: releasing closes it.
    press_closes: bool,
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
                button_state,
                rect,
                ..
            } = event
            {
                match button_state {
                    MouseButtonState::Down => press(tray.app_handle()),
                    MouseButtonState::Up => release(tray.app_handle(), rect),
                }
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

fn recently_hidden(app: &AppHandle) -> bool {
    app.state::<Mutex<PopoverState>>()
        .lock()
        .ok()
        .and_then(|s| s.last_auto_hide)
        .is_some_and(|t| t.elapsed() < REOPEN_GUARD)
}

/// Mouse-down on the tray icon: decide now whether this click closes the popover,
/// so it doesn't matter how long the button is held before release.
fn press(app: &AppHandle) {
    let closes = is_visible(app) || recently_hidden(app);
    if let Ok(mut s) = app.state::<Mutex<PopoverState>>().lock() {
        s.press_closes = closes;
    }
}

/// Mouse-up on the tray icon: a click toggles the popover.
fn release(app: &AppHandle, rect: Rect) {
    let press_closes = app
        .state::<Mutex<PopoverState>>()
        .lock()
        .map(|mut s| std::mem::take(&mut s.press_closes))
        .unwrap_or(false);
    if is_visible(app) {
        hide(app);
    } else if !press_closes && !recently_hidden(app) {
        // `recently_hidden` covers a release that arrives without its press.
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
    if let Ok(mut s) = app.state::<Mutex<PopoverState>>().lock() {
        s.last_show = Some(Instant::now());
    }

    #[cfg(target_os = "macos")]
    macos::show_at(app, rect);
    #[cfg(not(target_os = "macos"))]
    if let Some(window) = popover(app) {
        if let Some(pos) = placement(app, &window, rect) {
            let _ = window.set_position(pos);
        }
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

/// Where to put the popover on Windows and Linux, whose monitors share one
/// physical-pixel space: under (or above) the clicked icon, on the monitor that
/// contains it.
#[cfg(not(target_os = "macos"))]
fn placement(app: &AppHandle, window: &WebviewWindow, rect: Rect) -> Option<PhysicalPosition<i32>> {
    let monitors = app.available_monitors().ok()?;
    let mut anchor = rect_physical(&rect, &monitors);

    // Some platforms (notably Linux) report an empty rect: anchor to the cursor.
    if anchor == geometry::Rect::new(0.0, 0.0, 0.0, 0.0) {
        let cursor = app.cursor_position().ok()?;
        anchor = geometry::Rect::new(cursor.x, cursor.y, 0.0, 0.0);
    }

    let monitor = monitors
        .iter()
        .find(|m| monitor_rect(m).contains(anchor.center()))
        .or_else(|| monitors.first())?;

    // The window's logical size, rendered at the target monitor's scale.
    let scale = monitor.scale_factor();
    let current_scale = window.scale_factor().unwrap_or(scale);
    let outer = window.outer_size().ok()?;
    let size = (outer.width as f64 / current_scale * scale, outer.height as f64 / current_scale * scale);

    let area = monitor.work_area();
    let work = geometry::Rect::new(
        area.position.x as f64,
        area.position.y as f64,
        area.size.width as f64,
        area.size.height as f64,
    );
    let (x, y) = geometry::place(anchor, work, size, MARGIN * scale);
    Some(PhysicalPosition::new(x.round() as i32, y.round() as i32))
}

#[cfg(not(target_os = "macos"))]
fn monitor_rect(m: &tauri::Monitor) -> geometry::Rect {
    let (p, s) = (m.position(), m.size());
    geometry::Rect::new(p.x as f64, p.y as f64, s.width as f64, s.height as f64)
}

/// The tray rect in physical pixels. Tray events are normally physical already; a
/// logical rect is converted with the scale of the monitor it falls on.
#[cfg(not(target_os = "macos"))]
fn rect_physical(rect: &Rect, monitors: &[tauri::Monitor]) -> geometry::Rect {
    let scale_at = |x: f64, y: f64| {
        monitors
            .iter()
            .find(|m| {
                let s = m.scale_factor();
                monitor_rect(m).contains((x * s, y * s))
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
    geometry::Rect::new(x * pos_scale, y * pos_scale, w, h)
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
    use tauri::{AppHandle, Rect, WebviewWindow};
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

    pub fn show_at(app: &AppHandle, rect: Rect) {
        // AppKit is main-thread only. Tray events arrive there already.
        let Some(mtm) = MainThreadMarker::new() else {
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || show_at(&handle, rect));
            return;
        };
        if let Ok(panel) = app.get_webview_panel(super::POPOVER) {
            // The status item's window, to tell which screen the click was on. It
            // follows the menu bar that was clicked.
            let status_item = app.tray_by_id(super::TRAY_ID).and_then(|tray| {
                tray.with_inner_tray_icon(|inner| {
                    let mtm = MainThreadMarker::new()?;
                    Some(inner.ns_status_item()?.button(mtm)?.window()?.frame())
                })
                .ok()
                .flatten()
            });
            place::under_icon(panel.as_panel(), rect, status_item, mtm);
            panel.show_and_make_key();
        }
    }

    pub fn hide(app: &AppHandle) {
        if let Ok(panel) = app.get_webview_panel(super::POPOVER) {
            panel.hide();
        }
    }

    /// Kept apart from the panel macro above, which imports AppKit names of its own.
    mod place {
        use tauri::{Position, Rect, Size};
        use tauri_nspanel::objc2::MainThreadMarker;
        use tauri_nspanel::objc2_app_kit::{NSEvent, NSScreen, NSWindow};
        use tauri_nspanel::{NSPoint, NSRect};

        use crate::tray::geometry::{self, Screen};
        use crate::tray::MARGIN;

        /// Move the panel under the clicked menu-bar item, entirely in AppKit's global
        /// point space (flipped to y-down for `geometry`), so no screen scale is involved.
        pub fn under_icon(panel: &NSWindow, rect: Rect, status_item: Option<NSRect>, mtm: MainThreadMarker) {
            let ns_screens = NSScreen::screens(mtm);
            // AppKit's y axis points up from the bottom of the primary screen — the one
            // at the origin, and the one the tray event's y is measured down from.
            let Some(primary_height) = ns_screens
                .iter()
                .find(|s| s.frame().origin.x == 0.0 && s.frame().origin.y == 0.0)
                .or_else(|| ns_screens.firstObject())
                .map(|s| s.frame().size.height)
            else {
                return;
            };
            let flip = |r: NSRect| {
                let top = primary_height - (r.origin.y + r.size.height);
                geometry::Rect::new(r.origin.x, top, r.size.width, r.size.height)
            };
            let screens: Vec<Screen> = ns_screens
                .iter()
                .map(|s| Screen {
                    frame: flip(s.frame()),
                    work: flip(s.visibleFrame()),
                    scale: s.backingScaleFactor(),
                })
                .collect();

            let mouse = NSEvent::mouseLocation();
            let cursor = (mouse.x, primary_height - mouse.y);
            let hints: Vec<_> = status_item.map(|r| flip(r).center()).into_iter().chain([cursor]).collect();
            let anchor = match (rect.position, rect.size) {
                (Position::Physical(p), Size::Physical(s)) => geometry::unscale_anchor(
                    geometry::Rect::new(p.x as f64, p.y as f64, s.width as f64, s.height as f64),
                    &hints,
                    &screens,
                ),
                _ => None,
            };
            // No usable rect: hang the popover from the cursor instead.
            let (anchor, screen) = anchor.unwrap_or_else(|| {
                let under_cursor = screens.iter().position(|s| s.frame.contains(cursor));
                (geometry::Rect::new(cursor.0, cursor.1, 0.0, 0.0), under_cursor.unwrap_or(0))
            });
            let Some(screen) = screens.get(screen) else { return };

            let size = panel.frame().size;
            let (x, y) = geometry::place(anchor, screen.work, (size.width, size.height), MARGIN);
            panel.setFrameTopLeftPoint(NSPoint::new(x, primary_height - y));
        }
    }
}
