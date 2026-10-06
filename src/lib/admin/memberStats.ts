/**
 * How many people have signed up and how many are really using the app: counts only, no
 * names or email addresses. Pure (no database, no clock of its own) so the numbers can be
 * checked against small made-up groups; memberStatsLoader.ts reads the real data.
 *
 * "Using the app" means the member did something: opened or saved an idea, planned or
 * finished something, wrote to the concierge, set how they feel today. Just signing in
 * does not count (a phone stays signed in for weeks), and neither does anything the
 * system does for them (the nightly nudge, the weekly plan email). Days are London days,
 * in step with how the rest of the app talks about "today". Admin accounts are left out so
 * the person running the app does not make it look busier than it is.
 */

export type AccountRow = { id: string; createdAt: string; emailConfirmed: boolean };
export type ProfileRow = { userId: string; weeklyPlan: boolean; reminders: boolean };
export type ActivityStamp = { memberId: string; at: string };

export type StatsInput = {
  now: Date;
  accounts: AccountRow[];
  adminIds: ReadonlySet<string>;
  profiles: ProfileRow[];
  calendarMemberIds: string[];
  activity: ActivityStamp[];
};

export type DayCount = { date: string; members: number };

export type MemberStats = {
  registered: number;
  emailConfirmed: number;
  onboarded: number;
  newLast7Days: number;
  activeToday: number;
  active7Days: number;
  active30Days: number;
  /** Members who did something on at least three of the last seven days: the daily habit. */
  returning: number;
  /** Signed up, but nothing done in the last 30 days. */
  quiet: number;
  calendarConnected: number;
  weeklyPlanOn: number;
  remindersOn: number;
  /** The last 14 London days, oldest first. */
  daily: DayCount[];
};

export const RETURNING_DAYS_NEEDED = 3;

/** The London calendar day (YYYY-MM-DD) an instant falls on. */
export function londonDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** The day `back` days before a YYYY-MM-DD day (plain calendar arithmetic, so clock changes cannot skew it). */
export function dayBefore(day: string, back: number): string {
  const ms = Date.parse(`${day}T00:00:00Z`) - back * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function computeMemberStats(input: StatsInput): MemberStats {
  const { now, adminIds } = input;
  const members = input.accounts.filter((a) => !adminIds.has(a.id));
  const memberIds = new Set(members.map((m) => m.id));

  const today = londonDay(now);
  const last = (n: number) => Array.from({ length: n }, (_, i) => dayBefore(today, i)); // today first
  const last7 = new Set(last(7));
  const last30 = new Set(last(30));
  const last14 = last(14).reverse();

  // The distinct London days each member did something on.
  const daysByMember = new Map<string, Set<string>>();
  for (const stamp of input.activity) {
    if (!memberIds.has(stamp.memberId)) continue;
    const when = new Date(stamp.at);
    if (Number.isNaN(when.getTime()) || when.getTime() > now.getTime()) continue;
    const day = londonDay(when);
    const set = daysByMember.get(stamp.memberId) ?? new Set<string>();
    set.add(day);
    daysByMember.set(stamp.memberId, set);
  }

  const anyIn = (days: Set<string>, window: Set<string>) => [...days].some((d) => window.has(d));
  const countIf = (test: (days: Set<string>) => boolean) => [...daysByMember.values()].filter(test).length;

  const profiles = input.profiles.filter((p) => memberIds.has(p.userId));
  const activeIn30 = countIf((d) => anyIn(d, last30));
  const weekAgo = now.getTime() - 7 * 86_400_000;

  return {
    registered: members.length,
    emailConfirmed: members.filter((m) => m.emailConfirmed).length,
    onboarded: profiles.length,
    newLast7Days: members.filter((m) => new Date(m.createdAt).getTime() >= weekAgo).length,
    activeToday: countIf((d) => d.has(today)),
    active7Days: countIf((d) => anyIn(d, last7)),
    active30Days: activeIn30,
    returning: countIf((d) => [...d].filter((day) => last7.has(day)).length >= RETURNING_DAYS_NEEDED),
    quiet: members.length - activeIn30,
    calendarConnected: new Set(input.calendarMemberIds.filter((id) => memberIds.has(id))).size,
    weeklyPlanOn: profiles.filter((p) => p.weeklyPlan).length,
    remindersOn: profiles.filter((p) => p.reminders).length,
    daily: last14.map((date) => ({ date, members: countIf((d) => d.has(date)) })),
  };
}
