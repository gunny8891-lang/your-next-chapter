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
import { computeBehavioralRationale, formatBehavioralRationale, getRecentWindowStartIso } from "@/lib/memory/rationale";
import type { CategoryName } from "@/lib/categories";
import type { ItineraryItemView, SurpriseView } from "@/lib/types";

type ActivityRow = {
  id: string;
  title: string;
  category: string;
  address: string | null;
  date_time: string | null;
  price_estimate: number | null;
  booking_url: string | null;
  tags: string[];
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
    .select("location_text")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) redirect("/onboarding");

  // London's calendar, not the server's: the week opens on today's day.
  const today = new Date().toLocaleDateString("en-GB", { weekday: "short", timeZone: "Europe/London" });

  const { data: itinerary } = await supabase
    .from("itineraries")
    .select(
      "id, week_start_date, itinerary_items(id, day_of_week, slot, member_action, rationale_text, activities(id, title, category, address, date_time, price_estimate, booking_url, tags))"
    )
    .eq("member_id", user.id)
    .order("week_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

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
      items={items}
      surprise={surprise}
      isDemo={isDemo}
      today={today}
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
