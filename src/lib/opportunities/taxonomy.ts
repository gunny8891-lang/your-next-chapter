/**
 * What kind of thing an opportunity is, in the words the product thinks in, worked out from what the
 * catalogue already says about it (tags, title, dates). Nothing is stored: the seven categories the
 * database allows stay as they are, and these are a second, finer reading of the same rows.
 *
 * Pool: LIVE is something that happens at a particular time (an event, an exhibition that closes);
 * GO is a place or standing group that is there whenever it is open; DO is something Lark Hour can
 * suggest with no listing at all (a photography walk, ringing a friend), which never comes from the
 * catalogue and arrives with the experience templates. Pure.
 */

import { eventDate } from "@/lib/opportunities/schedule";
import { isFoodVenue } from "@/lib/opportunities/kinds";

export type OpportunityPool = "live" | "go" | "do";

export function opportunityPool(a: { date_time: string | null; expires_at: string | null }): Exclude<OpportunityPool, "do"> {
  return eventDate(a) !== null || a.expires_at !== null ? "live" : "go";
}

export type Theme =
  | "days_out"
  | "outdoors"
  | "food_drink"
  | "culture"
  | "short_trips"
  | "learning"
  | "active"
  | "wellbeing"
  | "family"
  | "community"
  | "volunteering";

/** In the order they are told apart when only one is wanted: the brief's priorities first. */
export const THEME_ORDER: Theme[] = [
  "days_out",
  "short_trips",
  "outdoors",
  "food_drink",
  "culture",
  "learning",
  "active",
  "wellbeing",
  "family",
  "community",
  "volunteering",
];

type Candidate = { title?: string; category?: string; tags: string[] };

const HERITAGE_NAME = /\b(castle|stately|palace|abbey|priory|manor|hall|house|estate|heritage|historic)\b/i;
const CULTURE_NAME = /\b(museum|gallery|theatre|theater|exhibition|cinema|concert|arts)\b/i;

export function themesOf(c: Candidate): Theme[] {
  const has = (...tags: string[]) => tags.some((t) => c.tags.includes(t));
  const name = c.title ?? "";
  const found = new Set<Theme>();

  if (isFoodVenue(c) || has("food", "afternoon-tea")) found.add("food_drink");
  // A day out is somewhere worth a visit in itself, not just somewhere to sit: a heritage site or a National Trust place.
  if (has("national-trust", "heritage", "house tour", "castle") || (HERITAGE_NAME.test(name) && has("history", "gardens", "museum"))) found.add("days_out");
  if (has("day-trip", "trip", "overnight")) found.add("short_trips");
  if (has("outdoors", "walking", "nature", "gardens", "cycling", "wildlife", "views")) found.add("outdoors");
  if (has("museum", "theatre", "cinema", "arts", "art", "exhibition", "music", "festival", "film", "talk", "culture") || CULTURE_NAME.test(name)) found.add("culture");
  if (c.category === "Learn" || has("classes", "learning", "language", "photography", "crafts", "woodworking", "painting", "textiles", "creative", "gardening", "reading")) found.add("learning");
  if (c.category === "Move" || has("fitness", "swimming", "yoga", "tai-chi", "running", "table tennis", "gentle exercise", "cycling", "golf", "tennis")) found.add("active");
  if (c.category === "Wellness" || has("wellness", "wellbeing", "meditation", "relaxation", "spa")) found.add("wellbeing");
  if (has("grandchildren", "family", "toddlers", "children", "soft play", "playground")) found.add("family");
  if (c.category === "Connect" || has("community", "social", "u3a", "coffee morning", "new members")) found.add("community");
  if (c.category === "Give Back" || has("volunteering", "befriending", "volunteer-led", "conservation")) found.add("volunteering");

  return THEME_ORDER.filter((t) => found.has(t));
}

/** The one theme that best names it, or null when the tags say nothing useful. */
export function primaryTheme(c: Candidate): Theme | null {
  return themesOf(c)[0] ?? null;
}
