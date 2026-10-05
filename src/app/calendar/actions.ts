"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { googleConfig } from "@/lib/calendar/google";
import { addItemToCalendar, disconnectCalendar, removeItemFromCalendar, type CalendarResult } from "@/lib/calendar/service";

const UNAVAILABLE: CalendarResult = { error: "Calendar isn't switched on yet." };
const SIGN_IN: CalendarResult = { error: "Please sign in again." };

/** "Add to my calendar" on a planned item. The item is read with the member's own access, so only their own plan is reachable. */
export async function addToCalendarAction(itemId: string): Promise<CalendarResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return SIGN_IN;
  const config = googleConfig();
  if (!config) return UNAVAILABLE;

  const result = await addItemToCalendar(user.id, itemId, { member: supabase, admin: createAdminClient(), config });
  revalidatePath("/week");
  revalidatePath("/account");
  return result;
}

export async function removeFromCalendarAction(itemId: string): Promise<CalendarResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return SIGN_IN;
  const config = googleConfig();
  if (!config) return UNAVAILABLE;

  const result = await removeItemFromCalendar(user.id, itemId, { admin: createAdminClient(), config });
  revalidatePath("/week");
  return result;
}

/** Withdraws access at Google and forgets the connection. The calendar itself stays in the member's Google account. */
export async function disconnectCalendarAction(): Promise<CalendarResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return SIGN_IN;
  const config = googleConfig();
  if (!config) return UNAVAILABLE;

  await disconnectCalendar(user.id, { admin: createAdminClient(), config });
  revalidatePath("/week");
  revalidatePath("/account");
  return { error: null };
}
