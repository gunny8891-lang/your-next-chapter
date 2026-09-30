"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function addGoalAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;

  const targetDateRaw = String(formData.get("target_date") ?? "").trim();

  await supabase.from("goals").insert({
    member_id: user.id,
    text,
    target_date: targetDateRaw || null,
  });

  revalidatePath("/chapter");
}

export async function updateGoalStatusAction(goalId: string, status: "active" | "completed" | "archived") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("goals").update({ status }).eq("id", goalId).eq("member_id", user.id);
  revalidatePath("/chapter");
}

export async function deleteGoalAction(goalId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("goals").delete().eq("id", goalId).eq("member_id", user.id);
  revalidatePath("/chapter");
}
