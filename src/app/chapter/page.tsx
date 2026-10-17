import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getSessionUser } from "@/utils/supabase/user";
import { MyChapterView } from "@/components/MyChapterView";
import { addGoalAction, updateGoalStatusAction, deleteGoalAction } from "@/app/chapter/actions";
import { addDateAction, deleteDateAction } from "@/app/chapter/dateActions";
import { loadImportantDates } from "@/lib/dates/store";
import { londonToday } from "@/lib/opportunities/schedule";

export const metadata = { title: "My chapter" };

export default async function ChapterPage() {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect("/login");

  const [{ data: goals }, dates] = await Promise.all([
    supabase.from("goals").select("id, text, target_date, status").eq("member_id", user.id).order("created_at", { ascending: false }),
    loadImportantDates(supabase, user.id),
  ]);

  return (
    <MyChapterView
      goals={goals ?? []}
      onAdd={addGoalAction}
      onUpdateStatus={updateGoalStatusAction}
      onDelete={deleteGoalAction}
      dates={dates}
      today={londonToday()}
      onAddDate={addDateAction}
      onDeleteDate={deleteDateAction}
    />
  );
}
