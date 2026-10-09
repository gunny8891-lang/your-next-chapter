/**
 * A calendar file (.ics) that any calendar opens: Apple, Outlook, Google, a phone's own. It is the way to add an outing for
 * people who do not use Google Calendar (which is what the connected option is for). Pure: nothing is sent anywhere, and
 * the file holds only what is already on the card.
 *
 * Times in the app are London wall-clock times. The file states them in UTC, worked out for the day itself, so an event in
 * April and one in December both land at the right hour for the person, wherever the calendar app thinks it is.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** The offset of London from UTC, in minutes, at an instant: 60 in British Summer Time, 0 in winter. */
function londonOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(instant.getTime() / 60_000) * 60_000) / 60_000);
}

/** London wall-clock "YYYY-MM-DD" and "HH:MM" as a real instant. */
export function londonWallToUtc(date: string, clock: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = clock.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes settle it either side of a clock change.
  const first = guess - londonOffsetMinutes(new Date(guess)) * 60_000;
  return new Date(guess - londonOffsetMinutes(new Date(first)) * 60_000);
}

const stamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** Text as a calendar file wants it: nothing that could start a new line or a new property, and commas and semicolons escaped. */
export function icsText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Lines may be at most 75 bytes: longer ones continue on the next line, which starts with a space. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    // The first line may hold 75 bytes; each continuation 74 plus its leading space.
    if (bytes + size > 74) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

export type IcsEvent = {
  /** Stable for an outing, so adding it twice updates it rather than duplicating it. */
  uid: string;
  title: string;
  location?: string | null;
  description?: string | null;
  start: { date: string; clock: string };
  end: { date: string; clock: string };
  /** Minutes before the start to remind them. */
  reminderMinutes?: number;
  now?: Date;
};

export function buildIcs(event: IcsEvent): string {
  const start = londonWallToUtc(event.start.date, event.start.clock);
  const end = londonWallToUtc(event.end.date, event.end.clock);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lark Hour//Outings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsText(event.uid)}@larkhour.com`,
    `DTSTAMP:${stamp(event.now ?? new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${icsText(event.title)}`,
    ...(event.location ? [`LOCATION:${icsText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${icsText(event.description)}`] : []),
    "BEGIN:VALARM",
    `TRIGGER:-PT${event.reminderMinutes ?? 60}M`,
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** A safe file name: letters, numbers and hyphens, so no browser or phone has to guess. */
export function icsFileName(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `lark-hour-${slug || "outing"}.ics`;
}
