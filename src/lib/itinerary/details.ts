import { haversineDistanceKm } from "@/lib/geo/haversine";
import { DAYS_OF_WEEK } from "@/lib/itinerary/schema";
import { clockLabel } from "@/lib/someTime/window";
import { friendlyDuration } from "@/lib/someTime/format";
import { parseOpeningHours } from "@/lib/someTime/openingHours";
import { estimateTravel, type TravelMode, type TravelProfile } from "@/lib/someTime/travel";

/**
 * The practical details of a planned outing, so that opening it answers the questions a person
 * actually asks: what is it, when exactly, how long, how far, is it open, how do I find out more,
 * will I manage it. All of it comes from what the catalogue already holds; anything it does not
 * hold is simply left out, never guessed. Pure: no network, no database.
 */

export type ItemDetails = {
  /** What it is, in a few plain sentences. */
  about: string | null;
  /** "Open 09:00–17:00 on Friday", or "Closed on Friday": only when its opening hours are known. */
  hours: string | null;
  /** "About 1½ hours" */
  duration: string | null;
  /** "About 20 min by car (3.4 miles)" */
  journey: string | null;
  website: string | null;
  /** Anything the listing says about getting in and around. */
  accessibility: string | null;
};

export type DetailsInput = {
  description: string | null;
  recurrenceRule: string | null;
  durationMinutes: number | null;
  bookingUrl: string | null;
  accessibilityNotes: string | null;
  /** "Mon".."Sun": the day it is planned for. */
  day: string;
  lat: number | null;
  lng: number | null;
  home: { lat: number | null; lng: number | null };
  travel: TravelProfile;
};

const MAX_ABOUT = 300;
const KM_PER_MILE = 1.609;

const MODE_TEXT: Record<TravelMode, string> = { walk: "on foot", drive: "by car", "public transport": "by bus or train", mixed: "" };

const FULL_DAY: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

/** A few sentences of the description, cut at a word, with no web addresses in it. */
export function aboutText(description: string | null | undefined, title?: string): string | null {
  const text = (description ?? "")
    .replace(/https?:\/\/\S+/g, "")
    // A raw opening-hours code copied into the text ("Opening hours: Mo-Su 10:00-17:00.") is shown properly as its own line instead.
    .replace(/Opening hours:\s*[^.]*\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 25) return null;
  if (title && text.toLowerCase() === title.trim().toLowerCase()) return null;
  if (text.length <= MAX_ABOUT) return text;
  const cut = text.slice(0, MAX_ABOUT);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (lastStop > 120) return cut.slice(0, lastStop + 1);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

/** "Open 09:00–17:00 on Friday" from OpenStreetMap-style hours; null if they are missing or not understood. */
export function hoursText(rule: string | null | undefined, day: string): string | null {
  const week = parseOpeningHours(rule);
  const index = DAYS_OF_WEEK.indexOf(day as (typeof DAYS_OF_WEEK)[number]);
  if (!week || index < 0) return null;
  const name = FULL_DAY[day] ?? day;
  const intervals = week[index];
  if (intervals.length === 0) return `Closed on ${name}`;
  const spans = intervals.map(([start, end]) => (end - start >= 1440 ? "all day" : `${clockLabel(start)}–${clockLabel(end % 1440)}`));
  return `Open ${spans.join(" and ")} on ${name}`;
}

/** "About 20 min by car (3.4 miles)" from where they live; null if either place is unknown. */
export function journeyText(input: Pick<DetailsInput, "lat" | "lng" | "home" | "travel">): string | null {
  const { lat, lng, home, travel } = input;
  if (lat === null || lng === null || home.lat === null || home.lng === null) return null;
  const km = haversineDistanceKm(home.lat, home.lng, lat, lng);
  const { minutes, mode } = estimateTravel(km, travel);
  const miles = km / KM_PER_MILE;
  const away = miles < 0.15 ? "very close to home" : `${miles.toFixed(1)} miles`;
  const how = MODE_TEXT[mode];
  return `About ${minutes} min${how ? ` ${how}` : ""} (${away})`;
}

export function buildItemDetails(input: DetailsInput & { title?: string }): ItemDetails {
  const url = input.bookingUrl?.trim() ?? "";
  return {
    about: aboutText(input.description, input.title),
    hours: hoursText(input.recurrenceRule, input.day),
    duration: input.durationMinutes && input.durationMinutes > 0 ? `About ${friendlyDuration(input.durationMinutes)}` : null,
    journey: journeyText(input),
    website: /^https?:\/\//i.test(url) ? url : null,
    accessibility: input.accessibilityNotes?.replace(/\s+/g, " ").trim() || null,
  };
}

/** Whether there is anything worth showing. */
export function hasDetails(details: ItemDetails | null | undefined): boolean {
  return Boolean(details && Object.values(details).some(Boolean));
}
