"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { MAX_DATES_PER_MEMBER, parseNewDate } from "@/lib/dates/importantDates";
import { tableMissing } from "@/lib/dates/store";

/**
 * Dates to remember: add one, take one away. Both ask the sign-in service who is asking, and write with the member's own client,
 * so row-level security means only their own dates can ever be added to or removed.
 */

export async function addDateAction(raw: unknown): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const date = parseNewDate(raw, new Date().getUTCFullYear());
  if (!date) return { error: "That does not look like a date we can keep. Check the name, the day and the month." };

  const { count, error: countError } = await supabase.from("important_dates").select("id", { count: "exact", head: true }).eq("member_id", user.id);
  if (countError) return { error: tableMissing(countError) ? "Dates to remember are not switched on yet. Please try again soon." : "We could not save that just now. Please try again." };
  if ((count ?? 0) >= MAX_DATES_PER_MEMBER) return { error: `You have ${MAX_DATES_PER_MEMBER} dates saved, which is the most we can keep. Remove one first.` };

  const { error } = await supabase.from("important_dates").insert({ member_id: user.id, ...date });
  if (error) return { error: "We could not save that just now. Please try again." };

  revalidatePath("/chapter");
  revalidatePath("/today");
  return { error: null };
}

export async function deleteDateAction(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { error: "That date could not be found." };

  const { error } = await supabase.from("important_dates").delete().eq("id", id).eq("member_id", user.id);
  if (error) return { error: "We could not remove that just now. Please try again." };

  revalidatePath("/chapter");
  revalidatePath("/today");
  return { error: null };
}
