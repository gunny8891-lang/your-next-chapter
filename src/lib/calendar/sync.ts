import { createAdminClient } from "@/utils/supabase/admin";
import { googleConfig } from "@/lib/calendar/google";
import { removeItemFromCalendar } from "@/lib/calendar/service";

/**
 * When a planned item stops being a plan (skipped, swapped for something else), the
 * outing that was put on the member's calendar for it is taken off, so the calendar does
 * not keep promising something they are no longer doing. Best effort and silent: a member
 * who never connected a calendar, or a Google hiccup, must never get in the way of
 * changing their plan.
 */
export async function dropFromCalendarIfAny(memberId: string, itemId: string): Promise<void> {
  const config = googleConfig();
  if (!config) return;
  try {
    await removeItemFromCalendar(memberId, itemId, { admin: createAdminClient(), config });
  } catch (err) {
    console.warn("calendar: could not take a changed plan off the calendar:", err instanceof Error ? err.message : err);
  }
}
