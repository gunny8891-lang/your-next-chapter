import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

/**
 * The signed-in admin's database client, or a redirect: to sign in if nobody is, away from the page if they
 * are not an admin. Every admin page and action checks this itself: the page being unlinked is not a gate.
 * (Not in a "use server" file on purpose: anything exported from one is callable from the browser.)
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/today");

  return supabase;
}
