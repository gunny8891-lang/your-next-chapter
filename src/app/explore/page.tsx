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
import { countNearbyPlaces, isThinArea } from "@/lib/coverage/nearbyPlaces";

export const metadata = { title: "Explore" };

export default async function ExplorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("member_profiles").select("location_lat, location_lng").eq("user_id", user.id).maybeSingle();
  const [saved, nearbyPlaces] = await Promise.all([
    loadSavedIdeas(supabase, user.id),
    countNearbyPlaces(supabase, profile?.location_lat ?? null, profile?.location_lng ?? null),
  ]);

  return (
    <ExploreView
      saved={saved}
      learningArea={isThinArea(nearbyPlaces)}
      onFind={getTimeOptionsAction}
      onAccept={acceptTimeOptionAction}
      onFeedback={feedbackTimeOptionAction}
      onSave={saveIdeaAction}
      onUnsave={unsaveIdeaAction}
    />
  );
}
