import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { googleConfig } from "@/lib/calendar/google";
import { isConnected } from "@/lib/calendar/service";
import { addToCalendarAction, removeFromCalendarAction } from "@/app/calendar/actions";
import { ThisWeekView } from "@/components/ThisWeekView";
import { updateItineraryItemAction, respondSurpriseAction } from "@/app/week/actions";
import { generateWeekItineraryAction } from "@/app/week/itineraryActions";
import { getSwapAlternativesAction, applySwapAction } from "@/app/week/swapActions";
import { DEMO_ITEMS, DEMO_SURPRISE } from "@/lib/demoData";
import { formatCost, formatTime, LOCATION_UNKNOWN } from "@/lib/itinerary/format";
import { weekLabel } from "@/lib/email/weekLabel";
import { buildItemDetails } from "@/lib/itinerary/details";
import { addDays, londonWeekStart, weekToShow } from "@/lib/opportunities/schedule";
import { computeBehavioralRationale, formatBehavioralRationale, getRecentWindowStartIso } from "@/lib/memory/rationale";
import type { CategoryName } from "@/lib/categories";
import type { ItineraryItemView, SurpriseView } from "@/lib/types";
import { distanceHint } from "@/lib/account/distanceHint";
import { imageForRow } from "@/lib/imagery/forRow";
import { directionsUrl, travelModeToward } from "@/lib/act/directions";
import { itemCalendarUrl } from "@/lib/act/links";
import { longDate, shareMessage } from "@/lib/act/share";
import { dateOfDay } from "@/lib/calendar/event";

type ActivityRow = {
  id: string;
  title: string;
  category: string;
  address: string | null;
  date_time: string | null;
  price_estimate: number | null;
  booking_url: string | null;
  tags: string[];
  description: string | null;
  recurrence_rule: string | null;
  duration_minutes: number | null;
  location_lat: number | null;
  location_lng: number | null;
  accessibility_notes: string | null;
  image_url: string | null;
  image_alt: string | null;
  image_credit: string | null;
  image_license: string | null;
  image_source_url: string | null;
};

export const metadata = { title: "My week" };

export default async function WeekPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("member_profiles")
    .select("location_text, location_lat, location_lng, travel_radius_km, drives, uses_public_transport, mobility_notes")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) redirect("/onboarding");

  // London's calendar, not the server's: the week opens on today's day.
  const today = new Date().toLocaleDateString("en-GB", { weekday: "short", timeZone: "Europe/London" });

  // This week, or on a Sunday (once the Sunday-evening plan exists) next week. A week with no plan shows the example
  // and the button to make one, rather than last week's plan with this week's days on it.
  const now = new Date();
  const thisWeek = londonWeekStart(now);
  const { data: plans } = await supabase
    .from("itineraries")
    .select(
      "id, week_start_date, itinerary_items(id, day_of_week, slot, member_action, rationale_text, activities(id, title, category, address, date_time, price_estimate, booking_url, tags, description, recurrence_rule, duration_minutes, location_lat, location_lng, accessibility_notes, image_url, image_alt, image_credit, image_license, image_source_url))"
    )
    .eq("member_id", user.id)
    .in("week_start_date", [thisWeek, addDays(thisWeek, 7)]);
  const shownWeek = weekToShow((plans ?? []).map((p) => p.week_start_date as string), now);
  const itinerary = (plans ?? []).find((p) => p.week_start_date === shownWeek) ?? null;
  const showingNextWeek = shownWeek !== thisWeek;

  // "Why this changed": real behavioral signal (last 4 weeks of accepted items),
  // never a fabricated reason — see computeBehavioralRationale.
  const fourWeeksAgo = getRecentWindowStartIso(28);
  const { data: recentLikedSignals } = await supabase
    .from("preference_signals")
    .select("activity_id, signal_type, created_at, activities(id, tags)")
    .eq("member_id", user.id)
    .eq("signal_type", "liked")
    .gte("created_at", fourWeeksAgo);

  const recentLikedActivities = (recentLikedSignals ?? [])
    .map((s) => s.activities as unknown as { id: string; tags: string[] } | null)
    .filter((a): a is { id: string; tags: string[] } => a !== null);

  const { data: surpriseCard } = await supabase
    .from("surprise_me_cards")
    .select(
      "id, member_response, activities(id, title, category, address, date_time, price_estimate, booking_url, description)"
    )
    .eq("member_id", user.id)
    .order("week_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const realItems: ItineraryItemView[] =
    itinerary?.itinerary_items
      ?.filter((row) => row.activities)
      .map((row) => {
        const activity = row.activities as unknown as ActivityRow;
        const rationale = computeBehavioralRationale(activity, recentLikedActivities);
        return {
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
          behaviorNote: rationale ? formatBehavioralRationale(rationale) : null,
          image: imageForRow(activity),
          act: {
            directions: directionsUrl(
              { lat: activity.location_lat, lng: activity.location_lng },
              travelModeToward({ lat: profile.location_lat, lng: profile.location_lng }, { lat: activity.location_lat, lng: activity.location_lng }, {
                drives: profile.drives,
                uses_public_transport: profile.uses_public_transport,
                mobility_notes: profile.mobility_notes,
              })
            ),
            calendar: row.member_action === "accepted" ? itemCalendarUrl(row.id) : null,
            share: shareMessage({
              title: activity.title,
              when: dateOfDay(shownWeek, row.day_of_week) ? longDate(dateOfDay(shownWeek, row.day_of_week)!) : `${row.day_of_week} ${row.slot}`,
              at: activity.date_time ? activity.date_time.slice(11, 16) : null,
              address: activity.address,
              moreUrl: activity.booking_url && !/openstreetmap\.org/i.test(activity.booking_url) ? activity.booking_url : null,
            }),
          },
          details: buildItemDetails({
            title: activity.title,
            description: activity.description,
            recurrenceRule: activity.recurrence_rule,
            durationMinutes: activity.duration_minutes,
            bookingUrl: activity.booking_url,
            accessibilityNotes: activity.accessibility_notes,
            day: row.day_of_week,
            lat: activity.location_lat,
            lng: activity.location_lng,
            home: { lat: profile.location_lat, lng: profile.location_lng },
            travel: { drives: profile.drives, uses_public_transport: profile.uses_public_transport, mobility_notes: profile.mobility_notes },
          }),
        };
      }) ?? [];

  const realSurprise: SurpriseView = (() => {
    const activity = surpriseCard?.activities as unknown as (ActivityRow & { description: string | null }) | null;
    if (!surpriseCard || !activity) return null;
    return {
      id: surpriseCard.id,
      title: activity.title,
      category: activity.category as CategoryName,
      time: formatTime(activity.date_time, "afternoon"),
      location: activity.address ?? LOCATION_UNKNOWN,
      cost: formatCost(activity.price_estimate),
      why: activity.description ?? "",
      bookingUrl: activity.booking_url,
      response: surpriseCard.member_response as "accepted" | "dismissed" | null,
    };
  })();

  const isDemo = realItems.length === 0;
  const items = isDemo ? DEMO_ITEMS : realItems;
  const surprise = isDemo ? DEMO_SURPRISE : realSurprise;

  // Google Calendar: shown only once it has been switched on (the keys are set). Read problems just mean "not connected".
  let calendar: { connected: boolean; onCalendarIds: string[] } | null = null;
  if (googleConfig()) {
    const connected = await isConnected(createAdminClient(), user.id);
    const { data: linked } = connected ? await supabase.from("calendar_events").select("itinerary_item_id") : { data: [] };
    calendar = { connected, onCalendarIds: (linked ?? []).map((r) => r.itinerary_item_id as string) };
  }

  return (
    <ThisWeekView
      locationLabel={profile.location_text?.replace("Near ", "") || "This week"}
      distanceHint={isDemo ? null : distanceHint(profile.travel_radius_km, items.length)}
      items={items}
      surprise={surprise}
      isDemo={isDemo}
      today={showingNextWeek ? "" : today}
      nextWeekLabel={showingNextWeek && !isDemo ? weekLabel(shownWeek) : null}
      onItemAction={updateItineraryItemAction}
      onSurpriseAction={respondSurpriseAction}
      onGenerate={generateWeekItineraryAction}
      onGetSwapAlternatives={getSwapAlternativesAction}
      onApplySwap={applySwapAction}
      calendar={calendar}
      onAddToCalendar={addToCalendarAction}
      onRemoveFromCalendar={removeFromCalendarAction}
    />
  );
}
