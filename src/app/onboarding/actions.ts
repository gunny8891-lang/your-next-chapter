"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { geocodeLocation } from "@/lib/geo/geocode";
import { generateAndSaveItinerary } from "@/lib/itinerary/generateAndSave";
import { catchUpWeekAhead } from "@/lib/email/weekAhead";
import { triggerDiscoveryForRegion } from "@/lib/discovery/regional";
import { cleanLocationText } from "@/lib/geo/locationText";
import { cleanFirstName } from "@/lib/someTime/format";
import type { OnboardingAnswers } from "@/components/OnboardingFlow";
import { budgetBandFor, mobilityNoteFor } from "@/lib/onboarding/choices";

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
  if (firstName) {
    await supabase.auth.updateUser({ data: { first_name: firstName } });
    // The screens that only read take the name from the sign-in token, so a new one is issued now.
    await supabase.auth.refreshSession();
  }

  const goalTag = answers.goal ? GOAL_TAG[answers.goal] ?? null : null;

  // Best-effort — a member whose town doesn't resolve still completes onboarding;
  // they just won't get distance-filtered results until this can be retried.
  // Only a place name is kept (see lib/geo/locationText.ts): it is searched for on a map, and in a paid search.
  const location = cleanLocationText(answers.location);
  const geocoded = location ? await geocodeLocation(location) : null;

  await supabase.from("member_profiles").upsert(
    {
      user_id: user.id,
      location_text: location,
      location_lat: geocoded?.lat ?? null,
      location_lng: geocoded?.lng ?? null,
      travel_radius_km: answers.radius ? RADIUS_KM[answers.radius] ?? null : null,
      // What would make an outing unsuitable or unaffordable, asked now so the very first plan already respects it.
      mobility_notes: mobilityNoteFor(answers.mobility),
      budget_band: budgetBandFor(answers.budget),
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

  // The Sunday-evening email goes to everyone who has finished setting up by then. Someone finishing after it has gone out
  // would otherwise wait a whole week for their first, so they are sent the week ahead now.
  after(() => catchUpWeekAhead(admin, user.id));

  // Kick off discovery for this region now rather than waiting for the
  // nightly cron — queues candidates for admin review, doesn't itself
  // populate the week just generated above (those still need approval).
  if (location) {
    after(() => triggerDiscoveryForRegion(admin, user.id, location));
  }

  redirect("/today");
}
