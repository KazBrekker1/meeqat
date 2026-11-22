import { describe, expect, test } from "bun:test";
import {
  CALENDAR_RANGE_PRESETS,
  calendarFeedPath,
  clampCalendarDays,
  isCalendarRangePreset,
} from "../../../app/utils/calendarRange";

describe("calendar feed range", () => {
  test("the default range keeps the link subscribed calendars already use", () => {
    expect(calendarFeedPath(25.28541, 51.53104, 4, 60)).toBe("/cal/25.285/51.531/4/prayers.ics");
  });

  test("another range is a path segment, never a query string", () => {
    expect(calendarFeedPath(25.28541, 51.53104, 4, 7)).toBe("/cal/25.285/51.531/4/7/prayers.ics");
    expect(calendarFeedPath(-33.8688, 151.2093, 3, 90)).toBe("/cal/-33.869/151.209/3/90/prayers.ics");
    for (const { days } of CALENDAR_RANGE_PRESETS) {
      expect(calendarFeedPath(21.4225, 39.8262, 4, days)).toMatch(/^\/cal\/[-\d./]+\/prayers\.ics$/);
    }
  });

  test("a range is a whole number of days the service accepts", () => {
    expect(clampCalendarDays(10)).toBe(10);
    expect(clampCalendarDays("21")).toBe(21);
    expect(clampCalendarDays(2.6)).toBe(3);
    expect(clampCalendarDays(0)).toBe(1);
    expect(clampCalendarDays(-5)).toBe(1);
    expect(clampCalendarDays(365)).toBe(90);
    expect(calendarFeedPath(25.285, 51.531, 4, 365)).toBe("/cal/25.285/51.531/4/90/prayers.ics");
  });

  test("anything that isn't a number falls back to the default", () => {
    for (const junk of [undefined, null, "", "  ", "week", NaN, Infinity, {}]) {
      expect(clampCalendarDays(junk)).toBe(60);
    }
  });

  test("named ranges", () => {
    expect(isCalendarRangePreset(30)).toBe(true);
    expect(isCalendarRangePreset(10)).toBe(false);
  });
});
