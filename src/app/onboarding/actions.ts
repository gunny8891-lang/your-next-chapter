"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { geocodeLocation } from "@/lib/geo/geocode";
import { generateAndSaveItinerary } from "@/lib/itinerary/generateAndSave";
import { triggerDiscoveryForRegion } from "@/lib/discovery/regional";
import { cleanFirstName } from "@/lib/someTime/format";
import type { OnboardingAnswers } from "@/components/OnboardingFlow";

const RADIUS_KM: Record<string, number> = {
  "Walking distance only": 1,
  "Up to 3 miles": 5,
  "Up to 10 miles": 16,
  "I'm happy to travel further": 40,
};

const GOAL_TAG: Record<string, string> = {
  "Meeting new people": "meet_people",
  "Staying active": "fitness",
  "Learning something new": "learn_something_new",
  "Giving back locally": "give_back",
};

export async function saveOnboardingAction(submitted: OnboardingAnswers) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The first name is for saying hello (it lives with the account, as on the Account
  // page); it is not part of the answers kept about their preferences.
  const { firstName: rawFirstName, ...answers } = submitted;
  const firstName = cleanFirstName(rawFirstName);
  if (firstName) await supabase.auth.updateUser({ data: { first_name: firstName } });

  const goalTag = answers.goal ? GOAL_TAG[answers.goal] ?? null : null;

  // Best-effort — a member whose town doesn't resolve still completes onboarding;
  // they just won't get distance-filtered results until this can be retried.
  const geocoded = answers.location ? await geocodeLocation(answers.location) : null;

  await supabase.from("member_profiles").upsert(
    {
      user_id: user.id,
      location_text: answers.location ?? null,
      location_lat: geocoded?.lat ?? null,
      location_lng: geocoded?.lng ?? null,
      travel_radius_km: answers.radius ? RADIUS_KM[answers.radius] ?? null : null,
      personality: answers.personality ? { free_time_pref: answers.personality } : {},
      goals: goalTag ? [goalTag] : [],
      onboarding_transcript: answers,
    },
    { onConflict: "user_id" }
  );

  // Generate a real first week right away rather than leaving the member on
  // demo placeholder data until they notice a "Generate my week" button.
  const admin = createAdminClient();
  await generateAndSaveItinerary(admin, user.id);

  // Kick off discovery for this region now rather than waiting for the
  // nightly cron — queues candidates for admin review, doesn't itself
  // populate the week just generated above (those still need approval).
  if (answers.location) {
    after(() => triggerDiscoveryForRegion(admin, user.id, answers.location!));
  }

  redirect("/today");
}
