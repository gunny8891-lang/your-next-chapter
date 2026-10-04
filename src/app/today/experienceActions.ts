"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { londonToday } from "@/lib/opportunities/schedule";
import { parseDailyState } from "@/lib/experience/dailyState";
import { clearDailyState, loadDailyState, saveDailyState } from "@/lib/experience/dailyStateStore";
import { buildContext, recordExperience, signalForOutcome, validateEvent, type Outcome } from "@/lib/experience/events";

const MAX_EVENTS_PER_CALL = 20;

/**
 * "Shown" and "opened" are things only the browser can see, so they arrive from the
 * cards. Everything is checked against the fixed lists before it is kept. Returns
 * nothing and never fails: a note about what was on screen is never worth an error.
 */
export async function recordSeenAction(raw: unknown): Promise<void> {
  if (!Array.isArray(raw)) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const events = raw.slice(0, MAX_EVENTS_PER_CALL).flatMap((r) => {
    const event = validateEvent(r);
    // Only these two come from the browser: the rest are recorded by the actions that cause them.
    return event && (event.type === "shown" || event.type === "opened") ? [event] : [];
  });
  if (events.length === 0) return;

  const state = await loadDailyState(supabase, user.id, londonToday());
  await recordExperience(
    supabase,
    user.id,
    events.map((e) => ({ ...e, context: buildContext(state, { who: e.context?.who }) }))
  );
}

/**
 * "How did it go?" after something planned. It is the only way to know it was actually
 * done. "Loved it" and "not for me" also teach the ranking; "it was fine" records that
 * it happened; "I didn't go" says nothing about taste and teaches nothing.
 */
export async function completeExperienceAction(activityId: string, outcome: Outcome | "didnt_go"): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const event =
    outcome === "didnt_go"
      ? validateEvent({ type: "dismissed", activityId, reason: "didnt_go", surface: "reflection" })
      : validateEvent({ type: "completed", activityId, outcome, surface: "reflection" });
  if (!event) return { error: "That didn't look right, please try again." };

  await recordExperience(supabase, user.id, [event]);

  const signal = outcome === "didnt_go" ? null : signalForOutcome(outcome);
  if (signal) {
    // Source "accept": it is the outcome of something they accepted, so it counts as done (unlike a Save).
    const { error } = await supabase.from("preference_signals").insert({ member_id: user.id, source: "accept", activity_id: activityId, signal_type: signal });
    if (error) return { error: error.message };
  }
  revalidatePath("/today");
  return { error: null };
}

/** Today's Daily State: a few fixed choices, replaced if they change their mind. */
export async function saveDailyStateAction(raw: unknown): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const state = parseDailyState(raw);
  if (!state) return { error: "That didn't look right, please try again." };

  const result = await saveDailyState(supabase, user.id, londonToday(), state);
  if (!result.error) revalidatePath("/today");
  return result;
}

export async function clearDailyStateAction(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const result = await clearDailyState(supabase, user.id, londonToday());
  if (!result.error) revalidatePath("/today");
  return result;
}
