
/**
 * Dates to remember: birthdays, anniversaries, a day to remember, anything else. Held as a month and a day so a date comes round
 * every year, with a year only if the member gave one (for "turning 70", "their 40th anniversary"). Pure: no database.
 */

export type DateKind = "birthday" | "anniversary" | "remembrance" | "other";

export const DATE_KINDS: { value: DateKind; label: string }[] = [
  { value: "birthday", label: "Birthday" },
  { value: "anniversary", label: "Anniversary" },
  { value: "remembrance", label: "A day to remember" },
  { value: "other", label: "Something else" },
];

export type ImportantDate = { id: string; title: string; kind: DateKind; month: number; day: number; year: number | null };
export type NewImportantDate = Omit<ImportantDate, "id">;

export const MAX_DATES_PER_MEMBER = 60;
export const MAX_TITLE = 80;

/** Days in each month, counting February as 29 so a 29 February birthday can be kept. */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isValidMonthDay(month: number, day: number): boolean {
  return Number.isInteger(month) && Number.isInteger(day) && month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1];
}

const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const pad = (n: number) => String(n).padStart(2, "0");

/** The date it next falls on, today included (YYYY-MM-DD). A 29 February is kept on 28 February in a year without one. */
export function nextOccurrence(month: number, day: number, today: string): string {
  const thisYear = Number(today.slice(0, 4));
  const on = (year: number) => `${year}-${pad(month)}-${pad(month === 2 && day === 29 && !isLeap(year) ? 28 : day)}`;
  const candidate = on(thisYear);
  return candidate >= today ? candidate : on(thisYear + 1);
}

/** How many days until it next falls: 0 today. */
export function daysUntil(month: number, day: number, today: string): number {
  const next = nextOccurrence(month, day, today);
  return Math.round((Date.parse(`${next}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** How many years it will be on that day (the age they turn, the anniversary it is), or null with no year given. */
export function yearsOn(date: Pick<ImportantDate, "month" | "day" | "year">, today: string): number | null {
  if (date.year === null) return null;
  const years = Number(nextOccurrence(date.month, date.day, today).slice(0, 4)) - date.year;
  return years > 0 ? years : null;
}

const ORDINAL_SUFFIX = ["th", "st", "nd", "rd"];
export function ordinal(n: number): string {
  const v = n % 100;
  return `${n}${ORDINAL_SUFFIX[(v - 20) % 10] ?? ORDINAL_SUFFIX[v] ?? ORDINAL_SUFFIX[0]}`;
}

/** "today", "tomorrow", "in 5 days", "in 3 weeks". */
export function whenLabel(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

/** What is special about the coming one, if the year is known: "turning 70", "40th anniversary". Nothing for the rest. */
export function milestone(date: ImportantDate, today: string): string | null {
  const years = yearsOn(date, today);
  if (years === null) return null;
  if (date.kind === "birthday") return `turning ${years}`;
  if (date.kind === "anniversary") return `${ordinal(years)} anniversary`;
  return null;
}

export type UpcomingDate = { id: string; title: string; kind: DateKind; days: number; when: string; note: string | null };

/** The dates falling within `withinDays`, soonest first. */
export function upcoming(dates: ImportantDate[], today: string, withinDays: number): UpcomingDate[] {
  return dates
    .map((d) => ({ d, days: daysUntil(d.month, d.day, today) }))
    .filter(({ days }) => days <= withinDays)
    .sort((a, b) => a.days - b.days || a.d.title.localeCompare(b.d.title))
    .map(({ d, days }) => ({ id: d.id, title: d.title, kind: d.kind, days, when: whenLabel(days), note: milestone(d, today) }));
}

/** Every date, the next to come first. */
export function inOrder(dates: ImportantDate[], today: string): (ImportantDate & { days: number; when: string; note: string | null })[] {
  return dates
    .map((d) => ({ ...d, days: daysUntil(d.month, d.day, today), when: whenLabel(daysUntil(d.month, d.day, today)), note: milestone(d, today) }))
    .sort((a, b) => a.days - b.days || a.title.localeCompare(b.title));
}

/** "12 March", or "12 March 1954" when the year is held. */
export function dateLabel(d: Pick<ImportantDate, "month" | "day" | "year">): string {
  const base = new Date(Date.UTC(2024, d.month - 1, d.day)).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  return d.year ? `${base} ${d.year}` : base;
}

/** Tidies what arrived from the form; null when it is not a date that could exist. `thisYear` stops a year in the future. */
export function parseNewDate(raw: unknown, thisYear: number): NewImportantDate | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim() : "";
  if (!title || title.length > MAX_TITLE) return null;
  const kind = DATE_KINDS.find((k) => k.value === r.kind)?.value;
  if (!kind) return null;
  const month = Number(r.month);
  const day = Number(r.day);
  if (!isValidMonthDay(month, day)) return null;
  let year: number | null = null;
  if (r.year !== undefined && r.year !== null && String(r.year).trim() !== "") {
    year = Number(r.year);
    if (!Number.isInteger(year) || year < 1900 || year > thisYear) return null;
  }
  return { title, kind, month, day, year };
}

/** The next fortnight's worth, for a quick look: how far ahead Today looks. */
export const TODAY_LOOKS_AHEAD_DAYS = 14;
/** How far ahead the concierge is told about. */
export const CONCIERGE_LOOKS_AHEAD_DAYS = 30;
