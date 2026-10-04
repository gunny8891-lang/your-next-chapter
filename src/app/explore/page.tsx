import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ExploreView } from "@/components/ExploreView";
import {
  acceptTimeOptionAction,
  feedbackTimeOptionAction,
  getTimeOptionsAction,
  saveIdeaAction,
  unsaveIdeaAction,
} from "@/app/today/timeActions";
import { loadSavedIdeas } from "@/lib/someTime/saved";

export const metadata = { title: "Explore" };

export default async function ExplorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const saved = await loadSavedIdeas(supabase, user.id);

  return (
    <ExploreView
      saved={saved}
      onFind={getTimeOptionsAction}
      onAccept={acceptTimeOptionAction}
      onFeedback={feedbackTimeOptionAction}
      onSave={saveIdeaAction}
      onUnsave={unsaveIdeaAction}
    />
  );
}
