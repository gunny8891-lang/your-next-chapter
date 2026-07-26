"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
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

export async function saveOnboardingAction(answers: OnboardingAnswers) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const goalTag = answers.goal ? GOAL_TAG[answers.goal] ?? null : null;

  await supabase.from("member_profiles").upsert(
    {
      user_id: user.id,
      location_text: answers.location ?? null,
      travel_radius_km: answers.radius ? RADIUS_KM[answers.radius] ?? null : null,
      personality: answers.personality ? { free_time_pref: answers.personality } : {},
      goals: goalTag ? [goalTag] : [],
      onboarding_transcript: answers,
    },
    { onConflict: "user_id" }
  );

  redirect("/week");
}
