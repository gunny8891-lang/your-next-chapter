"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/week");

  return supabase;
}

export async function approveActivityAction(formData: FormData) {
  const supabase = await requireAdmin();
  const id = String(formData.get("id"));

  await supabase
    .from("activities")
    .update({
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? "") || null,
      category: String(formData.get("category") ?? ""),
      address: String(formData.get("address") ?? "") || null,
      price_estimate: formData.get("price_estimate") ? Number(formData.get("price_estimate")) : null,
      status: "active",
    })
    .eq("id", id);

  revalidatePath("/admin/activities");
}

export async function rejectActivityAction(formData: FormData) {
  const supabase = await requireAdmin();
  const id = String(formData.get("id"));

  await supabase.from("activities").delete().eq("id", id);

  revalidatePath("/admin/activities");
}
