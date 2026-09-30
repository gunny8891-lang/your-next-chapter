import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ExploreView } from "@/components/ExploreView";
import { getSurpriseOptionsAction, acceptSurpriseOptionAction } from "@/app/explore/actions";

export default async function ExplorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <ExploreView onSurpriseMe={getSurpriseOptionsAction} onAccept={acceptSurpriseOptionAction} />;
}
