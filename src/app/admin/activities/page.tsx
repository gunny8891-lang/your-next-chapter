import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { AdminActivityReview } from "@/components/AdminActivityReview";
import { approveActivityAction, rejectActivityAction } from "@/app/admin/activities/actions";

export default async function AdminActivitiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/week");

  const { data: activities } = await supabase
    .from("activities")
    .select("id, title, description, category, address, date_time, price_estimate, source, admin_notes, created_at")
    .eq("status", "needs_review")
    .order("created_at", { ascending: false });

  return (
    <AdminActivityReview
      activities={activities ?? []}
      onApprove={approveActivityAction}
      onReject={rejectActivityAction}
    />
  );
}
