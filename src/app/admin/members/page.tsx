import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { MembersDashboard } from "@/components/MembersDashboard";
import { loadMemberStats } from "@/lib/admin/memberStatsLoader";
import { loadProblems } from "@/lib/admin/problemsLoader";
import { loadMemberList } from "@/lib/admin/memberListLoader";

export const metadata = { title: "Members" };

export default async function AdminMembersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Admins only. The numbers are read with the service key (every member's rows), so this check is the whole gate.
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/today");

  const admin = createAdminClient();
  const [stats, problems, list] = await Promise.all([loadMemberStats(admin), loadProblems(admin), loadMemberList(admin).catch(() => null)]);

  return <MembersDashboard stats={stats} problems={problems} list={list} />;
}
