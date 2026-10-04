import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { MyChapterView } from "@/components/MyChapterView";
import { addGoalAction, updateGoalStatusAction, deleteGoalAction } from "@/app/chapter/actions";

export const metadata = { title: "My chapter" };

export default async function ChapterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: goals } = await supabase
    .from("goals")
    .select("id, text, target_date, status")
    .eq("member_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <MyChapterView
      goals={goals ?? []}
      onAdd={addGoalAction}
      onUpdateStatus={updateGoalStatusAction}
      onDelete={deleteGoalAction}
    />
  );
}
