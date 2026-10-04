import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { PeopleView } from "@/components/PeopleView";
import { addPersonAction, markSeenTodayAction, toggleWantsToSeeMoreAction, deletePersonAction } from "@/app/people/actions";

export const metadata = { title: "People" };

export default async function PeoplePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: people } = await supabase
    .from("people")
    .select("id, name, relationship, shared_interests, notes, wants_to_see_more, last_seen_date")
    .eq("member_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <PeopleView
      people={people ?? []}
      onAdd={addPersonAction}
      onMarkSeenToday={markSeenTodayAction}
      onToggleWantsToSeeMore={toggleWantsToSeeMoreAction}
      onDelete={deletePersonAction}
    />
  );
}
