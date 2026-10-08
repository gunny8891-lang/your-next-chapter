import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { TodayView, type TodaySlot } from "@/components/TodayView";
import { updateItineraryItemAction } from "@/app/week/actions";
import { getTimeOptionsAction, acceptTimeOptionAction, feedbackTimeOptionAction, saveIdeaAction } from "@/app/today/timeActions";
import { getTodayWeather, weatherCoordinates } from "@/lib/nudges/weather";
import { formatCost, formatTime, LOCATION_UNKNOWN } from "@/lib/itinerary/format";
import { scheduleImageLookups } from "@/lib/someTime/imageLookups";
import { getFeaturedOption } from "@/lib/someTime/recommend";
import { completeExperienceAction, clearDailyStateAction, saveDailyStateAction } from "@/app/today/experienceActions";
import { loadDailyState } from "@/lib/experience/dailyStateStore";
import { loadReflections } from "@/lib/experience/reflections";
import { londonToday, londonWeekStart } from "@/lib/opportunities/schedule";
import { visibleSlots } from "@/lib/experience/daySlots";
import { cleanFirstName, greetingFor } from "@/lib/someTime/format";
import { londonClock } from "@/lib/someTime/window";
import type { CategoryName } from "@/lib/categories";
import type { ItineraryItemView } from "@/lib/types";

type ActivityRow = {
  id: string;
  title: string;
  category: string;
  address: string | null;
  date_time: string | null;
  price_estimate: number | null;
  booking_url: string | null;
};

const SLOT_ORDER = ["morning", "afternoon", "evening"] as const;

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("member_profiles")
    .select("location_lat, location_lng, has_dog, dog_name, dog_usually_comes")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  // "Mon".."Sun" — matches itinerary_items.day_of_week exactly.
  // London's calendar, not the server's (UTC on Vercel) — otherwise the evening
  // of a BST day, or the hour after midnight, shows the wrong day's plan.
  const todayName = new Date().toLocaleDateString("en-GB", { weekday: "short", timeZone: "Europe/London" });
  const dateLabel = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });

  const { data: itinerary } = await supabase
    .from("itineraries")
    .select(
      "itinerary_items(id, day_of_week, slot, member_action, rationale_text, activities(id, title, category, address, date_time, price_estimate, booking_url))"
    )
    .eq("member_id", user.id)
    // The plan for the week we are in, never the latest: on a Sunday evening the latest is next week's, whose
    // "Sun" is not today.
    .eq("week_start_date", londonWeekStart())
    .maybeSingle();

  const todaysItems = (itinerary?.itinerary_items ?? []).filter(
    (row) => row.day_of_week === todayName && row.activities
  );

  const itemBySlot: Record<string, ItineraryItemView> = {};
  for (const row of todaysItems) {
    const activity = row.activities as unknown as ActivityRow;
    itemBySlot[row.slot] = {
      id: row.id,
      day: row.day_of_week,
      title: activity.title,
      category: activity.category as CategoryName,
      time: formatTime(activity.date_time, row.slot),
      location: activity.address ?? LOCATION_UNKNOWN,
      cost: formatCost(activity.price_estimate),
      why: row.rationale_text ?? "",
      status: row.member_action as ItineraryItemView["status"],
      bookingUrl: activity.booking_url,
    };
  }

  // Real per-member coordinates when we have them (a genuine improvement now
  // that onboarding/account settings geocode location) — the pilot coordinate
  // is only a fallback for a profile with no resolved location yet.
  const { latitude, longitude } = weatherCoordinates(profile);
  // The weather and the featured idea are independent, so fetch them together. The
  // idea is a bonus: if anything about it fails, Today simply shows without it.
  const [weather, featured, dailyState, reflections] = await Promise.all([
    getTodayWeather(latitude, longitude),
    getFeaturedOption(supabase, user.id).catch((err) => {
      console.warn("today: could not build the featured idea:", err instanceof Error ? err.message : err);
      return null;
    }),
    loadDailyState(supabase, user.id, londonToday()),
    loadReflections(supabase, user.id, londonToday()),
  ]);

  if (featured) scheduleImageLookups([featured]);

  // A free part of the day that has already gone is not offered (see daySlots.ts); one with something planned stays.
  const slots: TodaySlot[] = visibleSlots(
    SLOT_ORDER.map((slot) => ({ slot, item: itemBySlot[slot] ?? null })),
    londonClock(new Date()).minutes
  );

  return (
    <TodayView
      greeting={greetingFor(Math.floor(londonClock(new Date()).minutes / 60))}
      firstName={cleanFirstName(user.user_metadata?.first_name)}
      featured={featured}
      dog={{ hasDog: profile.has_dog === true, usuallyComes: profile.dog_usually_comes === true, name: profile.dog_name ?? null }}
      dateLabel={dateLabel}
      weather={weather}
      slots={slots}
      onItemAction={updateItineraryItemAction}
      onFindTime={getTimeOptionsAction}
      onAcceptTime={acceptTimeOptionAction}
      onFeedbackTime={feedbackTimeOptionAction}
      onSaveTime={saveIdeaAction}
      dailyState={dailyState}
      reflections={reflections}
      onSaveDailyState={saveDailyStateAction}
      onClearDailyState={clearDailyStateAction}
      onAnswerReflection={completeExperienceAction}
    />
  );
}
