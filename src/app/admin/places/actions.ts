"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { parseDogAccessForm } from "@/lib/admin/dogAccess";

/**
 * Records whether dogs can come to a place, with how sure we are and where it was found. Admins only; the
 * admin check is made here, not just on the page, and the database's own policy allows only admins to write
 * activities. The page is told what happened through the address, never with a raw error.
 */
export async function setDogAccessAction(formData: FormData) {
  const supabase = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const back = String(formData.get("back") ?? "/admin/places");
  const returnTo = back.startsWith("/admin/places") ? back : "/admin/places";

  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent("That place was not recognised.")}`);

  const parsed = parseDogAccessForm(formData);
  if (!parsed.ok) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(parsed.error)}&open=${id}`);

  const { error } = await supabase.from("activities").update(parsed.update).eq("id", id);
  if (error) {
    console.warn("admin: could not save dog access:", error.message);
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent("Could not save that. Try again.")}&open=${id}`);
  }

  revalidatePath("/admin/places");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}saved=${id}`);
}
