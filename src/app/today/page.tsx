import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { TodayView, type TodaySlot } from "@/components/TodayView";
import { updateItineraryItemAction } from "@/app/week/actions";
import { getSurpriseOptionsAction, acceptSurpriseOptionAction } from "@/app/explore/actions";
import { getTodayWeather, PILOT_COORDINATES } from "@/lib/nudges/weather";
import { formatCost, formatTime } from "@/lib/itinerary/format";
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

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("member_profiles")
    .select("location_lat, location_lng")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  // "Mon".."Sun" — matches itinerary_items.day_of_week exactly.
  const todayName = new Date().toLocaleDateString("en-GB", { weekday: "short" });
  const dateLabel = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  const { data: itinerary } = await supabase
    .from("itineraries")
    .select(
      "itinerary_items(id, day_of_week, slot, member_action, rationale_text, activities(id, title, category, address, date_time, price_estimate, booking_url))"
    )
    .eq("member_id", user.id)
    .order("week_start_date", { ascending: false })
    .limit(1)
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
      location: activity.address ?? "Location TBC",
      cost: formatCost(activity.price_estimate),
      why: row.rationale_text ?? "",
      status: row.member_action as ItineraryItemView["status"],
      bookingUrl: activity.booking_url,
    };
  }

  // Real per-member coordinates when we have them (a genuine improvement now
  // that onboarding/account settings geocode location) — the pilot coordinate
  // is only a fallback for a profile with no resolved location yet.
  const lat = profile.location_lat ?? PILOT_COORDINATES.latitude;
  const lng = profile.location_lng ?? PILOT_COORDINATES.longitude;
  const weather = await getTodayWeather(lat, lng);

  const slots: TodaySlot[] = SLOT_ORDER.map((slot) => ({ slot, item: itemBySlot[slot] ?? null }));

  return (
    <TodayView
      dateLabel={dateLabel}
      weather={weather}
      slots={slots}
      onItemAction={updateItineraryItemAction}
      onSurpriseMe={getSurpriseOptionsAction}
      onAccept={acceptSurpriseOptionAction}
    />
  );
}
