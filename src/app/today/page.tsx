import { Suspense } from "react";
import { redirect } from "next/navigation";
import { FeaturedFallback, FeaturedForYou } from "@/app/today/FeaturedForYou";
import { createClient } from "@/utils/supabase/server";
import { getSessionUser } from "@/utils/supabase/user";
import { TodayView, type TodaySlot } from "@/components/TodayView";
import { updateItineraryItemAction } from "@/app/week/actions";
import { getTimeOptionsAction, acceptTimeOptionAction, feedbackTimeOptionAction, saveIdeaAction } from "@/app/today/timeActions";
import { getTodayWeather, weatherCoordinates } from "@/lib/nudges/weather";
import { formatCost, formatTime, LOCATION_UNKNOWN } from "@/lib/itinerary/format";
import { completeExperienceAction, clearDailyStateAction, planAgainAction, saveDailyStateAction } from "@/app/today/experienceActions";
import { loadDailyState } from "@/lib/experience/dailyStateStore";
import { loadReflections } from "@/lib/experience/reflections";
import { londonToday, londonWeekStart } from "@/lib/opportunities/schedule";
import { visibleSlots } from "@/lib/experience/daySlots";
import { cleanFirstName, greetingFor } from "@/lib/someTime/format";
import { londonClock } from "@/lib/someTime/window";
import type { CategoryName } from "@/lib/categories";
import type { ItineraryItemView } from "@/lib/types";
import { imageForRow } from "@/lib/imagery/forRow";
import { quoteForDate } from "@/lib/quotes/daily";
import { countNearbyPlaces, isThinArea } from "@/lib/coverage/nearbyPlaces";

type ActivityRow = {
  id: string;
  title: string;
  category: string;
  address: string | null;
  date_time: string | null;
  price_estimate: number | null;
  booking_url: string | null;
  tags: string[] | null;
  image_url: string | null;
  image_alt: string | null;
  image_credit: string | null;
  image_license: string | null;
  image_source_url: string | null;
};

const SLOT_ORDER = ["morning", "afternoon", "evening"] as const;

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect("/login");

  // "Mon".."Sun" — matches itinerary_items.day_of_week exactly.
  // London's calendar, not the server's (UTC on Vercel) — otherwise the evening
  // of a BST day, or the hour after midnight, shows the wrong day's plan.
  const todayName = new Date().toLocaleDateString("en-GB", { weekday: "short", timeZone: "Europe/London" });
  const dateLabel = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });

  // Everything that needs only who they are is asked for together, not one after another: each is a trip to the database.
  const [{ data: profile }, { data: itinerary }, dailyState, reflections] = await Promise.all([
    supabase.from("member_profiles").select("location_lat, location_lng, has_dog, dog_name, dog_usually_comes").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("itineraries")
      .select(
        "itinerary_items(id, day_of_week, slot, member_action, rationale_text, activities(id, title, category, address, date_time, price_estimate, booking_url, tags, image_url, image_alt, image_credit, image_license, image_source_url))"
      )
      .eq("member_id", user.id)
      // The plan for the week we are in, never the latest: on a Sunday evening the latest is next week's, whose
      // "Sun" is not today.
      .eq("week_start_date", londonWeekStart())
      .maybeSingle(),
    loadDailyState(supabase, user.id, londonToday()),
    loadReflections(supabase, user.id, londonToday(), londonClock(new Date()).minutes),
  ]);
  if (!profile) redirect("/onboarding");

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
      image: imageForRow(activity),
    };
  }

  // Real per-member coordinates when we have them (a genuine improvement now
  // that onboarding/account settings geocode location) — the pilot coordinate
  // is only a fallback for a profile with no resolved location yet.
  const { latitude, longitude } = weatherCoordinates(profile);
  const [weather, nearbyPlaces] = await Promise.all([
    getTodayWeather(latitude, longitude),
    countNearbyPlaces(supabase, profile.location_lat, profile.location_lng),
  ]);

  // A free part of the day that has already gone is not offered (see daySlots.ts); one with something planned stays.
  const slots: TodaySlot[] = visibleSlots(
    SLOT_ORDER.map((slot) => ({ slot, item: itemBySlot[slot] ?? null })),
    londonClock(new Date()).minutes
  );

  return (
    <TodayView
      greeting={greetingFor(Math.floor(londonClock(new Date()).minutes / 60))}
      firstName={cleanFirstName(user.user_metadata?.first_name)}
      // The idea for today is the slowest part to work out, so the rest of the page is sent first and this fills in when it is ready.
      featuredSlot={
        <Suspense fallback={<FeaturedFallback />}>
          <FeaturedForYou
            supabase={supabase}
            userId={user.id}
            flow={{ onFind: getTimeOptionsAction, onAccept: acceptTimeOptionAction, onFeedback: feedbackTimeOptionAction, onSave: saveIdeaAction }}
          />
        </Suspense>
      }
      quote={quoteForDate(londonToday())}
      learningArea={isThinArea(nearbyPlaces)}
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
      onPlanAgain={planAgainAction}
    />
  );
}
