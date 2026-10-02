import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { AiCostDashboard } from "@/components/AiCostDashboard";
import { loadAiUsageSummary } from "@/lib/ai/usageSummary";

export default async function AdminAiCostsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/week");

  const summary = await loadAiUsageSummary(supabase);

  return <AiCostDashboard summary={summary} />;
}
