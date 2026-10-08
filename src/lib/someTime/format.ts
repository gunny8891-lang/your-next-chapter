import { COST_TIER_LABEL, costTierOf, type CostTier } from "@/lib/opportunities/facts";

/** Small formatting helpers for the cards. Pure, so they can be tested. */

/**
 * A price as a band: "Free", "£", "££" or "£££", on the same limits as the cost tiers and the Spend
 * choice, so what a card says and what a filter means are never different. Cards show a band rather
 * than a figure because most of what we know is an estimate. null = no price known.
 */
export function priceBand(price: number | null | undefined): string | null {
  const tier = costTierOf({ price_estimate: price ?? null });
  return tier ? COST_TIER_LABEL[tier] : null;
}

/**
 * What an idea's card says about cost: the exact price when it is a checked one ("£12"), otherwise the
 * band, since most of what we hold is an estimate. Null when nothing is known: never "Free" by default.
 */
export function costLabelFor(o: { costTier: CostTier | null; costIsEstimate: boolean; estimatedCost: number | null }): string | null {
  if (!o.costTier) return null;
  if (!o.costIsEstimate && o.estimatedCost !== null) return o.estimatedCost === 0 ? "Free" : `£${o.estimatedCost}`;
  return COST_TIER_LABEL[o.costTier];
}

const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{2})?$/i;
/** A full postcode on the end of a place name: "Stevenage SG2 0BL". */
const TRAILING_POSTCODE = /\s+[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

/**
 * The part of an address worth showing on a card: the neighbourhood, not the
 * street or postcode. "Chaplin Square, Fallow Corner, N12 0GL" → "Fallow Corner".
 */
export function placeLabel(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address
    .split(",")
    .map((p) => p.trim().replace(TRAILING_POSTCODE, "").trim())
    .filter((p) => p && !POSTCODE.test(p));
  if (parts.length === 0) return null;
  // With a street first ("5 Nether Street, North Finchley") the locality is what follows.
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}

const OUTDOOR = ["outdoors", "walking", "nature", "gardens", "playground"];
const INDOOR = ["museum", "books", "theatre", "cinema", "indoor", "arts", "classes", "cafe", "restaurant", "pub", "afternoon-tea"];

/** Whether something is mostly outdoors or indoors, from its tags; null when we cannot tell. */
export function settingOf(tags: string[]): "outdoors" | "indoors" | null {
  if (tags.some((t) => OUTDOOR.includes(t))) return "outdoors";
  if (tags.some((t) => INDOOR.includes(t))) return "indoors";
  return null;
}

/** "14:25" → minutes after midnight, or null if it is not a clock time. */
export function clockToMinutes(clock: string): number | null {
  const m = clock.match(/^(\d{2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Minutes from leaving to being home again, from the two "HH:MM" labels on an option. */
export function doorToDoorMinutes(leaveBy: string, homeBy: string): number | null {
  const from = clockToMinutes(leaveBy);
  const to = clockToMinutes(homeBy);
  if (from == null || to == null) return null;
  return to >= from ? to - from : to + 1440 - from;
}

/**
 * A length of time the way a person would say it on a card: "45 min", "1 hour",
 * "2½ hours". Short times round to five minutes, longer ones to the half hour —
 * "2 hours 12 min" is false precision for an estimate.
 */
export function friendlyDuration(minutes: number): string {
  if (minutes <= 50) return `${Math.max(5, Math.round(minutes / 5) * 5)} min`;
  const halfHours = Math.max(2, Math.round(minutes / 30));
  const hours = halfHours / 2;
  const whole = Math.floor(hours);
  const text = hours === whole ? String(whole) : `${whole === 0 ? "" : whole}½`;
  return `${text} ${hours <= 1 ? "hour" : "hours"}`;
}

/** "Plan this morning" / "…afternoon" / "…evening", for the time the outing starts ("HH:MM"). */
export function planLabelFor(startTime: string): string {
  const minutes = clockToMinutes(startTime);
  if (minutes === null) return "Plan this";
  if (minutes < 12 * 60) return "Plan this morning";
  if (minutes < 17 * 60) return "Plan this afternoon";
  return "Plan this evening";
}

/** "Good morning" / "Good afternoon" / "Good evening" for a London hour (0-23). */
export function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** A first name that is safe to show: trimmed, printable, and not absurdly long. Empty if there is nothing usable. */
export function cleanFirstName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().replace(/\s+/g, " ").slice(0, 40);
}
