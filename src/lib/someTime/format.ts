/** Small formatting helpers for the cards. Pure, so they can be tested. */

/**
 * A price as a band: "Free", "£", "££" or "£££". Cards show a band rather than a
 * figure because most of what we know is an estimate. null = no price known.
 */
export function priceBand(price: number | null | undefined): string | null {
  if (price == null) return null;
  if (price === 0) return "Free";
  if (price <= 10) return "£";
  if (price <= 30) return "££";
  return "£££";
}

const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{2})?$/i;

/**
 * The part of an address worth showing on a card: the neighbourhood, not the
 * street or postcode. "Chaplin Square, Fallow Corner, N12 0GL" → "Fallow Corner".
 */
export function placeLabel(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address
    .split(",")
    .map((p) => p.trim())
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
