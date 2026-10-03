"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { eventDate } from "@/lib/opportunities/schedule";
import { isFoodVenue } from "@/lib/opportunities/kinds";
import { placeOpenTimeChoice } from "@/lib/surprise/placeInSlot";
import { scheduleImageLookups } from "@/lib/someTime/imageLookups";
import { getTimeOptions } from "@/lib/someTime/recommend";
import { parseTimeRequest } from "@/lib/someTime/request";
import { slotsForWindow } from "@/lib/someTime/slots";
import type { TimeResult } from "@/lib/someTime/types";
import { resolveWindow } from "@/lib/someTime/window";

/** "I've got some time": find a few strong ways to spend it. */
export async function getTimeOptionsAction(raw: unknown): Promise<TimeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again.", notice: null, options: [], windowLabel: null };

  const request = parseTimeRequest(raw);
  if (!request) return { error: "That didn't look right — please try again.", notice: null, options: [], windowLabel: null };

  try {
    const result = await getTimeOptions(supabase, user.id, request);
    scheduleImageLookups(result.options);
    return result;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Couldn't find suggestions right now.",
      notice: null,
      options: [],
      windowLabel: null,
    };
  }
}

/**
 * "I'll do this": puts the choice into today's plan, in the first free part of
 * the day that the stretch of time covers, and learns from it. If a place to eat
 * was part of the idea it is noted in the plan entry.
 */
export async function acceptTimeOptionAction(
  activityId: string,
  choice: { start?: unknown; duration?: unknown; untilMin?: unknown },
  foodStopId?: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const request = parseTimeRequest({ start: choice.start, duration: choice.duration, untilMin: choice.untilMin, who: "just_me" });
  if (!request) return { error: "That didn't look right — please try again." };
  const resolved = resolveWindow(request, new Date());
  if (!resolved.ok) return { error: resolved.reason };

  // Both are read with the member's own client, so only an active activity is visible.
  const { data: activity } = await supabase.from("activities").select("id, date_time, expires_at").eq("id", activityId).maybeSingle();
  if (!activity) return { error: "That suggestion isn't available any more." };

  let rationale = "You chose this from \"I've got some time\".";
  if (foodStopId) {
    const { data: stop } = await supabase.from("activities").select("title, tags").eq("id", foodStopId).maybeSingle();
    if (stop && isFoodVenue({ tags: stop.tags ?? [] })) rationale += ` Then ${stop.title}.`;
  }

  const event = eventDate({ date_time: activity.date_time, expires_at: activity.expires_at });
  const eventStart = event ? new Date(activity.date_time as string).getUTCHours() * 60 + new Date(activity.date_time as string).getUTCMinutes() : null;
  const slots = slotsForWindow(resolved.window, eventStart);

  const admin = createAdminClient();
  let lastError = "Something is already planned for that time.";
  for (const slot of slots) {
    const result = await placeOpenTimeChoice(supabase, admin, user.id, activityId, slot, new Date(), rationale);
    if (!result.error) {
      revalidatePath("/today");
      revalidatePath("/week");
      return { error: null };
    }
    // Only a taken slot is worth trying past; anything else is a real failure.
    if (!/already planned/.test(result.error)) return result;
    lastError = result.error;
  }
  return { error: slots.length > 1 ? "Your plan already has something in all of that time." : lastError };
}

export type FeedbackReason = "not_my_thing" | "too_far" | "too_expensive" | "seen_it";

const SIGNAL_FOR_REASON: Record<FeedbackReason, "disliked" | "too_far" | "too_expensive" | "too_similar"> = {
  not_my_thing: "disliked",
  too_far: "too_far",
  too_expensive: "too_expensive",
  seen_it: "too_similar",
};

/**
 * "Not for me", with a reason. The reason matters: too far and too expensive are
 * about this one thing, and are learned that way (see computeAffinity), while a
 * plain "not my thing" teaches the Memory Agent about the kind of thing.
 */
export async function feedbackTimeOptionAction(activityId: string, reason: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const signalType = SIGNAL_FOR_REASON[reason as FeedbackReason];
  if (!signalType) return { error: "Unknown reason." };

  const { error } = await supabase.from("preference_signals").insert({
    member_id: user.id,
    source: "explicit_feedback",
    activity_id: activityId,
    signal_type: signalType,
  });
  return { error: error?.message ?? null };
}

/**
 * "Save" on an idea: "I would like this, not necessarily now". It is recorded as a
 * positive signal (explicit feedback, so it is never mistaken for something the
 * member has already done — see loadRepetitionHistory), which is what makes ideas
 * like it come back. There is no saved list yet; the card says only what is true.
 */
export async function saveIdeaAction(activityId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const { error } = await supabase.from("preference_signals").insert({
    member_id: user.id,
    source: "explicit_feedback",
    activity_id: activityId,
    signal_type: "liked",
  });
  return { error: error?.message ?? null };
}
