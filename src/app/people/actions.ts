"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

function parseTagList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function addPersonAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await supabase.from("people").insert({
    member_id: user.id,
    name,
    relationship: String(formData.get("relationship") ?? "").trim() || null,
    shared_interests: parseTagList(formData.get("shared_interests")),
    notes: String(formData.get("notes") ?? "").trim() || null,
    wants_to_see_more: formData.get("wants_to_see_more") === "on",
  });

  revalidatePath("/people");
}

export async function markSeenTodayAction(personId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("people")
    .update({ last_seen_date: new Date().toISOString().slice(0, 10) })
    .eq("id", personId)
    .eq("member_id", user.id);

  revalidatePath("/people");
}

export async function toggleWantsToSeeMoreAction(personId: string, value: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("people").update({ wants_to_see_more: value }).eq("id", personId).eq("member_id", user.id);
  revalidatePath("/people");
}

export async function deletePersonAction(personId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("people").delete().eq("id", personId).eq("member_id", user.id);
  revalidatePath("/people");
}
