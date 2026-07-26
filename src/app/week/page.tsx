import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ThisWeekView } from "@/components/ThisWeekView";
import { updateItineraryItemAction, respondSurpriseAction } from "@/app/week/actions";
import { generateWeekItineraryAction } from "@/app/week/itineraryActions";
import { DEMO_ITEMS, DEMO_SURPRISE } from "@/lib/demoData";
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
};

function formatCost(price: number | null) {
  if (price === null) return "Price TBC";
  if (price === 0) return "Free";
  return `£${price}`;
}

function formatTime(dateTime: string | null, slot: string) {
  if (!dateTime) return slot.charAt(0).toUpperCase() + slot.slice(1);
  return new Date(dateTime).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
}

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

  const { data: itinerary } = await supabase
    .from("itineraries")
    .select(
      "id, week_start_date, itinerary_items(id, day_of_week, slot, member_action, rationale_text, activities(id, title, category, address, date_time, price_estimate, booking_url))"
    )
    .eq("member_id", user.id)
    .order("week_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

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
        return {
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
      }) ?? [];

  const realSurprise: SurpriseView = (() => {
    const activity = surpriseCard?.activities as unknown as (ActivityRow & { description: string | null }) | null;
    if (!surpriseCard || !activity) return null;
    return {
      id: surpriseCard.id,
      title: activity.title,
      category: activity.category as CategoryName,
      time: formatTime(activity.date_time, "afternoon"),
      location: activity.address ?? "Location TBC",
      cost: formatCost(activity.price_estimate),
      why: activity.description ?? "",
      bookingUrl: activity.booking_url,
      response: surpriseCard.member_response as "accepted" | "dismissed" | null,
    };
  })();

  const isDemo = realItems.length === 0;
  const items = isDemo ? DEMO_ITEMS : realItems;
  const surprise = isDemo ? DEMO_SURPRISE : realSurprise;

  return (
    <ThisWeekView
      locationLabel={profile.location_text?.replace("Near ", "") || "This week"}
      items={items}
      surprise={surprise}
      isDemo={isDemo}
      onItemAction={updateItineraryItemAction}
      onSurpriseAction={respondSurpriseAction}
      onGenerate={generateWeekItineraryAction}
    />
  );
}
