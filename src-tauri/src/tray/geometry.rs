//! Where the tray popover goes. Pure maths — no windowing calls — so the layouts
//! that used to go wrong are pinned by tests.
//!
//! Every rect in one call shares one coordinate space: origin top-left, y down.
//! macOS passes AppKit points (flipped to y-down), other platforms physical pixels.

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Rect {
    pub const fn new(x: f64, y: f64, w: f64, h: f64) -> Self {
        Self { x, y, w, h }
    }

    pub fn right(&self) -> f64 {
        self.x + self.w
    }

    pub fn bottom(&self) -> f64 {
        self.y + self.h
    }

    pub fn center(&self) -> (f64, f64) {
        (self.x + self.w / 2.0, self.y + self.h / 2.0)
    }

    pub fn contains(&self, (x, y): (f64, f64)) -> bool {
        x >= self.x && x < self.right() && y >= self.y && y < self.bottom()
    }
}

/// Top-left corner for a popover of `size`: centred under `anchor` (the tray icon),
/// or above it when it doesn't fit below (a bottom taskbar), kept inside `work`
/// (the icon's screen minus menu bar / taskbar / Dock).
pub fn place(anchor: Rect, work: Rect, size: (f64, f64), margin: f64) -> (f64, f64) {
    let (w, h) = size;
    let mut y = anchor.bottom() + margin;
    if y + h > work.bottom() {
        y = anchor.y - h - margin;
    }
    let x = (anchor.center().0 - w / 2.0).clamp(work.x + margin, (work.right() - w - margin).max(work.x + margin));
    let y = y.clamp(work.y, (work.bottom() - h).max(work.y));
    (x, y)
}

/// A screen in macOS's global point space (see [`unscale_anchor`]).
#[cfg_attr(not(any(target_os = "macos", test)), allow(dead_code))]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Screen {
    pub frame: Rect,
    pub work: Rect,
    pub scale: f64,
}

/// macOS only: recover the clicked tray icon's rect in points, and its screen.
///
/// The tray event reports the icon rect as *points × the backing scale of the
/// icon's screen*. With screens of different scale those "pixel" spaces overlap —
/// an icon on a 1x display to the right of a Retina one can land inside the Retina
/// display's pixel rect — so the rect alone can't say which screen it is on, and
/// guessing wrong puts the popover on the right display at the wrong spot.
///
/// `hints` are points (where screens never overlap) expected to be on the icon's
/// screen, most trusted first: the status item's own window, then the cursor,
/// which is on the icon at click time. The first hint whose screen is consistent
/// with the rect wins.
///
/// Returns `None` when no screen is consistent with the rect; anchor to the cursor.
#[cfg_attr(not(any(target_os = "macos", test)), allow(dead_code))]
pub fn unscale_anchor(scaled: Rect, hints: &[(f64, f64)], screens: &[Screen]) -> Option<(Rect, usize)> {
    let candidate = |i: usize| {
        let s = screens[i];
        let r = Rect::new(scaled.x / s.scale, scaled.y / s.scale, scaled.w / s.scale, scaled.h / s.scale);
        s.frame.contains(r.center()).then_some((r, i))
    };
    hints
        .iter()
        .filter_map(|&hint| screens.iter().position(|s| s.frame.contains(hint)))
        .find_map(candidate)
        .or_else(|| (0..screens.len()).find_map(candidate))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SIZE: (f64, f64) = (280.0, 334.0);
    const MARGIN: f64 = 6.0;

    /// A notched Retina laptop screen with a 1x 2560×1440 display to its right,
    /// tops aligned — the layout the popover was misplaced on.
    fn laptop_and_external() -> [Screen; 2] {
        [
            Screen {
                frame: Rect::new(0.0, 0.0, 2056.0, 1329.0),
                work: Rect::new(0.0, 39.0, 2056.0, 1290.0),
                scale: 2.0,
            },
            Screen {
                frame: Rect::new(2056.0, 0.0, 2560.0, 1440.0),
                work: Rect::new(2056.0, 30.0, 2560.0, 1410.0),
                scale: 1.0,
            },
        ]
    }

    /// What the tray event reports for an icon at `points` on a screen of `scale`.
    fn scaled(points: Rect, scale: f64) -> Rect {
        Rect::new(points.x * scale, points.y * scale, points.w * scale, points.h * scale)
    }

    fn popover_for(icon: Rect, screen: usize, screens: &[Screen]) -> (f64, f64) {
        let reported = scaled(icon, screens[screen].scale);
        let (anchor, found) = unscale_anchor(reported, &[icon.center()], screens).expect("a screen matches");
        assert_eq!(found, screen, "icon resolved to the wrong screen");
        assert_eq!(anchor, icon);
        place(anchor, screens[found].work, SIZE, MARGIN)
    }

    #[test]
    fn icon_on_the_1x_display_inside_the_retina_displays_pixel_rect() {
        // x = 3880 is on the external display in points, but 3880 < 2056 × 2, so
        // in "pixels" it also falls inside the laptop screen. This is the bug.
        let screens = laptop_and_external();
        let icon = Rect::new(3880.0, 0.0, 100.0, 30.0);
        assert_eq!(popover_for(icon, 1, &screens), (3790.0, 36.0));
    }

    #[test]
    fn icon_on_the_1x_display_beyond_the_retina_displays_pixel_rect() {
        let screens = laptop_and_external();
        let icon = Rect::new(4300.0, 0.0, 100.0, 30.0);
        assert_eq!(popover_for(icon, 1, &screens), (4210.0, 36.0));
    }

    #[test]
    fn icon_on_the_retina_display_whose_pixels_reach_into_the_1x_display() {
        // 1500 pt × 2 = 3000 px, which is a valid point on the external display.
        let screens = laptop_and_external();
        let icon = Rect::new(1500.0, 0.0, 100.0, 39.0);
        assert_eq!(popover_for(icon, 0, &screens), (1410.0, 45.0));
    }

    #[test]
    fn screen_order_does_not_matter() {
        let [laptop, external] = laptop_and_external();
        let screens = [external, laptop];
        assert_eq!(popover_for(Rect::new(3880.0, 0.0, 100.0, 30.0), 0, &screens), (3790.0, 36.0));
        assert_eq!(popover_for(Rect::new(1500.0, 0.0, 100.0, 39.0), 1, &screens), (1410.0, 45.0));
    }

    #[test]
    fn external_display_on_the_left_or_above() {
        let laptop = laptop_and_external()[0];
        let left = Screen {
            frame: Rect::new(-2560.0, 0.0, 2560.0, 1440.0),
            work: Rect::new(-2560.0, 30.0, 2560.0, 1410.0),
            scale: 1.0,
        };
        let above = Screen {
            frame: Rect::new(-252.0, -1440.0, 2560.0, 1440.0),
            work: Rect::new(-252.0, -1410.0, 2560.0, 1410.0),
            scale: 1.0,
        };
        assert_eq!(popover_for(Rect::new(-400.0, 0.0, 100.0, 30.0), 1, &[laptop, left]), (-490.0, 36.0));
        assert_eq!(popover_for(Rect::new(1800.0, -1440.0, 100.0, 30.0), 1, &[laptop, above]), (1710.0, -1404.0));
        assert_eq!(popover_for(Rect::new(1500.0, 0.0, 100.0, 39.0), 0, &[laptop, above]), (1410.0, 45.0));
    }

    #[test]
    fn single_screen() {
        let screens = [laptop_and_external()[0]];
        assert_eq!(popover_for(Rect::new(1500.0, 0.0, 100.0, 39.0), 0, &screens), (1410.0, 45.0));
    }

    #[test]
    fn the_status_item_window_outranks_a_cursor_that_moved_to_another_screen() {
        let screens = laptop_and_external();
        let icon = Rect::new(3880.0, 0.0, 100.0, 30.0);
        // Read as Retina pixels the rect is (1940, 0, 50, 15) — a valid spot on the
        // laptop screen, where the cursor has wandered since the click.
        let cursor = (1960.0, 8.0);
        assert_eq!(unscale_anchor(icon, &[cursor], &screens), Some((Rect::new(1940.0, 0.0, 50.0, 15.0), 0)));
        assert_eq!(unscale_anchor(icon, &[icon.center(), cursor], &screens), Some((icon, 1)));
    }

    #[test]
    fn a_hint_that_contradicts_the_rect_is_skipped() {
        let screens = laptop_and_external();
        // 4300 px only makes sense on the external display, whatever the hints say.
        let icon = Rect::new(4300.0, 0.0, 100.0, 30.0);
        assert_eq!(unscale_anchor(icon, &[(100.0, 600.0)], &screens), Some((icon, 1)));
        assert_eq!(unscale_anchor(icon, &[], &screens), Some((icon, 1)));
        // Nothing is at 9000 px on either screen.
        assert_eq!(unscale_anchor(Rect::new(9000.0, 0.0, 100.0, 30.0), &[(100.0, 600.0)], &screens), None);
    }

    #[test]
    fn stays_on_screen_next_to_the_right_edge() {
        let work = Rect::new(2056.0, 30.0, 2560.0, 1410.0);
        let icon = Rect::new(4560.0, 0.0, 50.0, 30.0);
        assert_eq!(place(icon, work, SIZE, MARGIN), (4616.0 - 280.0 - 6.0, 36.0));
    }

    #[test]
    fn opens_above_a_bottom_taskbar() {
        // The icon sits inside the taskbar, so the popover rests on the work area's edge.
        let work = Rect::new(0.0, 0.0, 1920.0, 1040.0);
        let icon = Rect::new(1700.0, 1048.0, 24.0, 24.0);
        assert_eq!(place(icon, work, SIZE, MARGIN), (1712.0 - 140.0, 1040.0 - 334.0));
        // A floating panel above the work area's edge keeps the margin.
        let icon = Rect::new(1700.0, 1010.0, 24.0, 24.0);
        assert_eq!(place(icon, work, SIZE, MARGIN), (1712.0 - 140.0, 1010.0 - 334.0 - 6.0));
    }

    #[test]
    fn a_popover_taller_than_the_work_area_starts_at_its_top() {
        let work = Rect::new(0.0, 30.0, 800.0, 300.0);
        assert_eq!(place(Rect::new(400.0, 0.0, 20.0, 30.0), work, SIZE, MARGIN).1, 30.0);
    }
}
