import type { SupabaseClient } from "@supabase/supabase-js";
import { coarseContext, dailyStateAdjustment, type DailyState, type Energy } from "@/lib/experience/dailyState";
import type { Mood } from "@/lib/someTime/request";

/**
 * The Experience Graph: what happens to each idea we put in front of a member.
 *
 *   shown → opened → saved → planned → completed (and how it went)
 *                                    ↘ dismissed (and why)
 *
 * Preference signals (liked, disliked…) remain what today's scoring reads. These
 * events are the fuller record around them, and the place where context lives, so
 * learning can tell "unsuitable today" from "not for me".
 */

export type EventType = "shown" | "opened" | "saved" | "planned" | "completed" | "dismissed";
export type Outcome = "loved" | "fine" | "not_for_me";
export type DismissReason = "not_my_thing" | "too_far" | "too_expensive" | "seen_it" | "didnt_go";
export type Surface = "today" | "sheet" | "explore" | "week" | "reflection";

/** Coarse and fixed: never free text, never anything about health beyond how energetic they said they were. */
export type ExperienceContext = {
  energy?: Energy;
  intention?: Mood;
  who?: string;
  /** The dismissal is explained by how they said they felt that day, not by the idea itself. */
  explainedByState?: boolean;
};

export type ExperienceEvent = {
  activityId: string | null;
  type: EventType;
  outcome?: Outcome;
  reason?: DismissReason;
  surface?: Surface;
  context?: ExperienceContext;
};

const TYPES: EventType[] = ["shown", "opened", "saved", "planned", "completed", "dismissed"];
const OUTCOMES: Outcome[] = ["loved", "fine", "not_for_me"];
const REASONS: DismissReason[] = ["not_my_thing", "too_far", "too_expensive", "seen_it", "didnt_go"];
const SURFACES: Surface[] = ["today", "sheet", "explore", "week", "reflection"];
const WHO = ["just_me", "partner", "friends", "family"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pure: the browser can send these (shown, opened), so each field is checked
 * against the fixed lists. Anything else is dropped rather than stored.
 */
export function validateEvent(raw: unknown): ExperienceEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.type !== "string" || !TYPES.includes(r.type as EventType)) return null;
  if (typeof r.activityId !== "string" || !UUID.test(r.activityId)) return null;
  const event: ExperienceEvent = { activityId: r.activityId, type: r.type as EventType };
  if (typeof r.surface === "string" && SURFACES.includes(r.surface as Surface)) event.surface = r.surface as Surface;
  if (event.type === "completed" && typeof r.outcome === "string" && OUTCOMES.includes(r.outcome as Outcome)) event.outcome = r.outcome as Outcome;
  if (event.type === "dismissed" && typeof r.reason === "string" && REASONS.includes(r.reason as DismissReason)) event.reason = r.reason as DismissReason;
  if (typeof r.who === "string" && WHO.includes(r.who)) event.context = { who: r.who };
  return event;
}

/** Pure: the context to store with an event: coarse Daily State, who with, and nothing else. */
export function buildContext(state: DailyState | null, extra: { who?: string; explainedByState?: boolean } = {}): ExperienceContext {
  const context: ExperienceContext = { ...coarseContext(state) };
  if (extra.who) context.who = extra.who;
  if (extra.explainedByState) context.explainedByState = true;
  return context;
}

/**
 * Pure: a rejection is only a statement about the idea when the idea did not
 * obviously clash with how they said they felt. A 3-hour walk turned down on a day
 * they were "taking it easy" says the walk was wrong for the day, not that they
 * dislike walking.
 */
export function explainedByState(
  state: DailyState | null,
  c: { category: string; tags: string[] },
  how: { durationMinutes: number; travelMinutes?: number } = { durationMinutes: 60 }
): boolean {
  const adjustment = dailyStateAdjustment(state, c, { durationMinutes: how.durationMinutes, travelMinutes: how.travelMinutes ?? 0 });
  return adjustment.exclude || adjustment.score <= -2;
}

type SignalType = "liked" | "disliked" | "too_far" | "too_expensive" | "too_similar";

/**
 * Pure: the preference signal a "not for me" should leave, if any. Reasons that are
 * about this one idea's logistics keep their own signals; a plain "not my thing" is
 * a dislike unless the day explains it; "didn't go" says nothing about taste.
 */
export function signalForDismissal(reason: DismissReason, explained: boolean): SignalType | null {
  switch (reason) {
    case "not_my_thing":
      return explained ? null : "disliked";
    case "too_far":
      return "too_far";
    case "too_expensive":
      return "too_expensive";
    case "seen_it":
      return "too_similar";
    case "didnt_go":
      return null;
  }
}

/** Pure: what "how did it go?" teaches. "Fine" is a neutral: it happened, and nothing more is learned. */
export function signalForOutcome(outcome: Outcome): SignalType | null {
  if (outcome === "loved") return "liked";
  if (outcome === "not_for_me") return "disliked";
  return null;
}

/**
 * Writes events. Never throws: the history is valuable, but nothing a member is doing
 * should fail because a note about it could not be kept (the table not being there
 * yet included).
 */
export async function recordExperience(supabase: SupabaseClient, memberId: string, events: ExperienceEvent[]): Promise<void> {
  if (events.length === 0) return;
  const rows = events.map((e) => ({
    member_id: memberId,
    activity_id: e.activityId,
    event_type: e.type,
    outcome: e.outcome ?? null,
    reason: e.reason ?? null,
    surface: e.surface ?? null,
    context: e.context ?? {},
  }));
  const { error } = await supabase.from("experience_events").insert(rows);
  if (error) console.warn("experience: could not record events:", error.message);
}
