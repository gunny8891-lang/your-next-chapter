import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";
import { defaultRecipients, defaultSend } from "@/lib/ai/operatorAlert";
import { countNearbyPlaces, isThinArea } from "@/lib/coverage/nearbyPlaces";
import { loadProblems, type ProblemsSummary } from "@/lib/admin/problemsLoader";

/**
 * The week in numbers, for whoever runs the app, once a week: how many people used it and for what, what it cost, what went
 * wrong, what is waiting for a person to check, how the catalogue grew and where it is thin. Counts and the names of places
 * only, never anything about a person. Each part is gathered on its own and left out (with a note) if it cannot be, so one
 * missing table never loses the rest. No AI is used: it is a plain tally, so it costs nothing and cannot make anything up.
 */

const DAY = 24 * 60 * 60 * 1000;

export type HealthReport = {
  generatedAt: string;
  days: number;
  people: { total: number; newThisWeek: number; activeThisWeek: number } | null;
  use: { planned: number; saved: number; wentTo: number; conciergeMessages: number } | null;
  ai: { calls: number; failures: number; estimatedCost: number; topFeatures: { feature: string; cost: number; calls: number }[] } | null;
  problems: ProblemsSummary | null;
  waiting: { toCheck: number; suggestedByMembers: number; feedback: number | null } | null;
  catalogue: { active: number; addedThisWeek: number; upcomingEvents: number; eventsNextTwoWeeks: number } | null;
  searches: { regionsSearchedRecently: number; regionsOverdue: number; organisersReread: number } | null;
  thinAreas: { area: string; places: number }[] | null;
  unavailable: string[];
};

async function section<T>(name: string, unavailable: string[], load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (err) {
    console.warn(`health report: could not gather ${name}:`, err instanceof Error ? err.message : err);
    unavailable.push(name);
    return null;
  }
}

function must<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as T;
}

const count = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
  const r = await q;
  if (r.error) throw new Error(r.error.message);
  return r.count ?? 0;
};

export async function buildHealthReport(admin: SupabaseClient, now: Date = new Date(), days = 7): Promise<HealthReport> {
  const unavailable: string[] = [];
  const since = new Date(now.getTime() - days * DAY).toISOString();
  const nowIso = now.toISOString();
  const fortnight = new Date(now.getTime() + 14 * DAY).toISOString();

  const people = await section("people", unavailable, async () => {
    const [total, newThisWeek, events] = await Promise.all([
      count(admin.from("users").select("id", { count: "exact", head: true })),
      count(admin.from("users").select("id", { count: "exact", head: true }).gte("created_at", since)),
      admin.from("experience_events").select("member_id").gte("created_at", since).limit(10_000),
    ]);
    const active = new Set(must<{ member_id: string }[]>(events).map((e) => e.member_id));
    return { total, newThisWeek, activeThisWeek: active.size };
  });

  const use = await section("use", unavailable, async () => {
    const events = (type: string) => count(admin.from("experience_events").select("id", { count: "exact", head: true }).eq("event_type", type).gte("created_at", since));
    const [planned, saved, wentTo, conciergeMessages] = await Promise.all([
      events("planned"),
      events("saved"),
      events("completed"),
      count(admin.from("chat_messages").select("id", { count: "exact", head: true }).eq("role", "user").gte("created_at", since)),
    ]);
    return { planned, saved, wentTo, conciergeMessages };
  });

  const ai = await section("ai", unavailable, async () => {
    const rows = must<{ feature: string; estimated_cost: number | null; success: boolean | null }[]>(await admin.from("ai_usage_logs").select("feature, estimated_cost, success").gte("created_at", since).limit(10_000));
    const byFeature = new Map<string, { cost: number; calls: number }>();
    let cost = 0;
    for (const r of rows) {
      const c = Number(r.estimated_cost ?? 0);
      cost += c;
      const f = byFeature.get(r.feature) ?? { cost: 0, calls: 0 };
      byFeature.set(r.feature, { cost: f.cost + c, calls: f.calls + 1 });
    }
    return {
      calls: rows.length,
      failures: rows.filter((r) => r.success === false).length,
      estimatedCost: cost,
      topFeatures: [...byFeature].map(([feature, v]) => ({ feature, ...v })).sort((a, b) => b.cost - a.cost).slice(0, 5),
    };
  });

  const problems = await loadProblems(admin, now, days);

  const waiting = await section("waiting", unavailable, async () => {
    const [toCheck, suggestedByMembers] = await Promise.all([
      count(admin.from("activities").select("id", { count: "exact", head: true }).eq("status", "needs_review")),
      count(admin.from("activities").select("id", { count: "exact", head: true }).eq("status", "needs_review").like("admin_notes", "Suggested by a member%")),
    ]);
    const feedback = await admin.from("member_feedback").select("id", { count: "exact", head: true }).gte("created_at", since);
    return { toCheck, suggestedByMembers, feedback: feedback.error ? null : (feedback.count ?? 0) };
  });

  const catalogue = await section("catalogue", unavailable, async () => {
    const [active, addedThisWeek, upcomingEvents, eventsNextTwoWeeks] = await Promise.all([
      count(admin.from("activities").select("id", { count: "exact", head: true }).eq("status", "active")),
      count(admin.from("activities").select("id", { count: "exact", head: true }).eq("status", "active").gte("created_at", since)),
      count(admin.from("activities").select("id", { count: "exact", head: true }).eq("status", "active").is("expires_at", null).gte("date_time", nowIso)),
      count(admin.from("activities").select("id", { count: "exact", head: true }).eq("status", "active").is("expires_at", null).gte("date_time", nowIso).lte("date_time", fortnight)),
    ]);
    return { active, addedThisWeek, upcomingEvents, eventsNextTwoWeeks };
  });

  const searches = await section("searches", unavailable, async () => {
    const rows = must<{ region_key: string; last_success_at: string | null }[]>(await admin.from("discovery_regions").select("region_key, last_success_at").limit(1000));
    const places = rows.filter((r) => !r.region_key.includes("#"));
    const recent = (r: { last_success_at: string | null }, withinDays: number) => Boolean(r.last_success_at) && now.getTime() - new Date(r.last_success_at as string).getTime() <= withinDays * DAY;
    return {
      regionsSearchedRecently: places.filter((r) => recent(r, 35)).length,
      regionsOverdue: places.filter((r) => !recent(r, 35)).length,
      organisersReread: rows.filter((r) => r.region_key.endsWith("#organiser") && recent(r, days)).length,
    };
  });

  const thinAreas = await section("thin areas", unavailable, async () => {
    const profiles = must<{ location_text: string | null; location_lat: number | null; location_lng: number | null }[]>(
      await admin.from("member_profiles").select("location_text, location_lat, location_lng").not("location_lat", "is", null).limit(200)
    );
    const seen = new Set<string>();
    const out: { area: string; places: number }[] = [];
    for (const p of profiles) {
      const area = (p.location_text ?? "").replace(/^Near /, "").trim();
      if (!area || seen.has(area.toLowerCase()) || out.length >= 20) continue;
      seen.add(area.toLowerCase());
      const places = await countNearbyPlaces(admin, p.location_lat, p.location_lng);
      if (places !== null && isThinArea(places)) out.push({ area, places });
    }
    return out;
  });

  return { generatedAt: nowIso, days, people, use, ai, problems, waiting, catalogue, searches, thinAreas, unavailable };
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dollars = (n: number) => `$${n.toFixed(2)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The lines of the report, as plain sentences under headings. Pure. */
export function reportSections(r: HealthReport): { heading: string; lines: string[] }[] {
  const out: { heading: string; lines: string[] }[] = [];
  const add = (heading: string, lines: string[]) => out.push({ heading, lines });

  if (r.people) add("People", [`${plural(r.people.total, "member")} in all, ${r.people.newThisWeek} new this week.`, `${plural(r.people.activeThisWeek, "member")} did something in the app this week.`]);
  if (r.use) add("What they did", [`Planned ${r.use.planned}, saved ${r.use.saved}, and said they went to ${r.use.wentTo}.`, `${plural(r.use.conciergeMessages, "message")} to the concierge.`]);
  if (r.ai)
    add("AI use", [
      `${plural(r.ai.calls, "call")}, ${r.ai.failures} failed, about ${dollars(r.ai.estimatedCost)} in all.`,
      ...r.ai.topFeatures.map((f) => `${f.feature}: ${dollars(f.cost)} over ${plural(f.calls, "call")}.`),
    ]);
  if (r.problems)
    add(
      "What went wrong",
      r.problems.total === 0 ? ["Nothing was recorded."] : [`${plural(r.problems.total, "problem")} recorded.`, ...r.problems.topCodes.slice(0, 5).map((c) => `${c.label} (${c.count})`)]
    );
  if (r.waiting)
    add("Waiting for you", [
      r.waiting.toCheck === 0 ? "Nothing is waiting to be checked." : `${plural(r.waiting.toCheck, "entry", "entries")} to check, ${r.waiting.suggestedByMembers} suggested by members.`,
      ...(r.waiting.feedback !== null ? [`${plural(r.waiting.feedback, "piece", "pieces")} of feedback this week.`] : []),
    ]);
  if (r.catalogue)
    add("The catalogue", [
      `${r.catalogue.active} places and events are live, ${r.catalogue.addedThisWeek} added this week.`,
      `${r.catalogue.upcomingEvents} one-off events are still to come, ${r.catalogue.eventsNextTwoWeeks} of them in the next two weeks.`,
    ]);
  if (r.searches) add("Searching", [`${plural(r.searches.regionsSearchedRecently, "area")} searched in the last five weeks, ${r.searches.regionsOverdue} overdue.`, `${plural(r.searches.organisersReread, "organiser")} reread this week.`]);
  if (r.thinAreas) add("Thin areas", r.thinAreas.length === 0 ? ["Every member's area has plenty of places."] : r.thinAreas.map((a) => `${a.area}: only ${a.places} places known.`));
  if (r.unavailable.length > 0) add("Could not be gathered", [r.unavailable.join(", ")]);
  return out;
}

export function healthMessage(r: HealthReport, siteUrl: string): { subject: string; text: string; html: string } {
  const sections = reportSections(r);
  const admin = `${siteUrl.replace(/\/$/, "")}/admin/members`;
  const date = new Date(r.generatedAt).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long" });
  const text = [`Lark Hour: the week to ${date}`, "", ...sections.flatMap((s) => [s.heading.toUpperCase(), ...s.lines.map((l) => `- ${l}`), ""]), `Admin: ${admin}`].join("\n");
  const html =
    `<h2 style="font-family:Georgia,serif">Lark Hour: the week to ${escapeHtml(date)}</h2>` +
    sections.map((s) => `<h3>${escapeHtml(s.heading)}</h3><ul>${s.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`).join("") +
    `<p><a href="${admin}">Admin</a></p>`;
  return { subject: `Lark Hour: the week to ${date}`, text, html };
}

export type HealthDeps = {
  admin?: SupabaseClient;
  now?: Date;
  recipients?: (admin: SupabaseClient) => Promise<string[]>;
  send?: (to: string[], message: { subject: string; text: string; html: string }) => Promise<void>;
  siteUrl?: string;
};

/** Gathers the week and emails it. Returns what was sent to. */
export async function sendHealthReport(deps: HealthDeps = {}): Promise<{ report: HealthReport; sentTo: string[] }> {
  const admin = deps.admin ?? createAdminClient();
  const report = await buildHealthReport(admin, deps.now);
  const to = await (deps.recipients ?? defaultRecipients)(admin);
  if (to.length === 0) {
    console.warn("health report: nobody to send it to (set OPERATOR_ALERT_EMAIL, or have an admin account)");
    return { report, sentTo: [] };
  }
  await (deps.send ?? defaultSend)(to, healthMessage(report, deps.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.larkhour.com"));
  return { report, sentTo: to };
}
