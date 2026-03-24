import { z } from "zod";

const TimingsSchema = z.record(z.string(), z.string());

const DateInfoSchema = z.object({
  readable: z.string(),
  timestamp: z.string(),
  gregorian: z.object({ date: z.string() }),
  hijri: z.object({ date: z.string() }),
});

const MetaSchema = z.object({
  timezone: z.string(),
  method: z.object({ id: z.number(), name: z.string() }),
  latitude: z.number(),
  longitude: z.number(),
});

const DayDataSchema = z.object({
  timings: TimingsSchema,
  date: DateInfoSchema,
  meta: MetaSchema,
});

// Single-day response (for on-demand date picks)
export const PrayerTimingsResponseSchema = z.object({
  code: z.literal(200),
  data: DayDataSchema,
});

// Calendar/month response (replaces 30 individual prefetch calls)
export const PrayerCalendarResponseSchema = z.object({
  code: z.literal(200),
  data: z.array(DayDataSchema),
});

export type PrayerTimingsResponse = z.infer<typeof PrayerTimingsResponseSchema>;
export type PrayerCalendarResponse = z.infer<typeof PrayerCalendarResponseSchema>;
export type DayData = z.infer<typeof DayDataSchema>;
