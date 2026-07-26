"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

function parseTagList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function updateProfileAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const radiusRaw = formData.get("travel_radius_km");
  const budgetRaw = String(formData.get("budget_band") ?? "");

  await supabase
    .from("member_profiles")
    .update({
      location_text: String(formData.get("location_text") ?? "").trim() || null,
      travel_radius_km: radiusRaw ? Number(radiusRaw) : null,
      budget_band: ["low", "medium", "high"].includes(budgetRaw) ? budgetRaw : null,
      dietary_preferences: String(formData.get("dietary_preferences") ?? "").trim() || null,
      mobility_notes: String(formData.get("mobility_notes") ?? "").trim() || null,
      interests: parseTagList(formData.get("interests")),
      goals: parseTagList(formData.get("goals")),
    })
    .eq("user_id", user.id);

  revalidatePath("/account");
  redirect("/account?saved=1");
}

export async function deleteAccountAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Deleting the auth user cascades through public.users and every FK-linked
  // table (member_profiles, preference_signals, itineraries, etc.) per the
  // "on delete cascade" constraints in the schema migrations.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    redirect(`/account?deleteError=${encodeURIComponent(error.message)}`);
  }

  await supabase.auth.signOut().catch(() => {});
  redirect("/?deleted=1");
}
