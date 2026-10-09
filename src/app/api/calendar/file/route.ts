import { type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { buildCalendarEvent } from "@/lib/calendar/event";
import { readItem } from "@/lib/calendar/service";
import { buildIcs, icsFileName } from "@/lib/act/ics";
import { worthSharing } from "@/lib/act/share";
import { isUnknownDetail } from "@/lib/itinerary/format";

/**
 * A calendar file for one outing, for people who do not use (or have not connected) Google Calendar. Two ways to ask:
 *   ?item=<id>   something already in the member's plan: the same event the Google option would create
 *   ?activity=<id>&date=YYYY-MM-DD&start=HH:MM&end=HH:MM[&food=<id>]   an idea they have just been shown
 * The title, place and link always come from the catalogue, never from the address, so nothing can be written into the
 * file by whoever builds the link; only the day and times (checked here) come from the request. Signed-in members only.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_MINUTES = 12 * 60;

const minutesOf = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));

function file(body: string, title: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFileName(title)}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Please sign in again.", { status: 401 });

  const params = request.nextUrl.searchParams;
  const itemId = params.get("item");
  if (itemId) {
    if (!UUID.test(itemId)) return new Response("That link is not right.", { status: 400 });
    // Read with the member's own access: only their own plan is reachable.
    const item = await readItem(supabase, itemId);
    const event = item ? buildCalendarEvent(item) : null;
    if (!item || !event) return new Response("That one isn't in your plan.", { status: 404 });
    const [startDate, startClock] = event.start.dateTime.split("T");
    const [endDate, endClock] = event.end.dateTime.split("T");
    return file(
      buildIcs({
        uid: `item-${itemId}`,
        title: event.summary,
        location: event.location,
        description: event.description,
        start: { date: startDate, clock: startClock.slice(0, 5) },
        end: { date: endDate, clock: endClock.slice(0, 5) },
      }),
      event.summary
    );
  }

  const activityId = params.get("activity");
  const date = params.get("date") ?? "";
  const start = params.get("start") ?? "";
  const end = params.get("end") ?? "";
  const foodId = params.get("food");
  if (!activityId || !UUID.test(activityId) || !DATE.test(date) || !CLOCK.test(start) || !CLOCK.test(end) || (foodId && !UUID.test(foodId))) {
    return new Response("That link is not right.", { status: 400 });
  }
  const length = minutesOf(end) - minutesOf(start);
  if (length <= 0 || length > MAX_MINUTES) return new Response("That link is not right.", { status: 400 });

  const { data: activity } = await supabase.from("activities").select("title, address, booking_url").eq("id", activityId).maybeSingle();
  if (!activity) return new Response("That one isn't available any more.", { status: 404 });
  const food = foodId ? (await supabase.from("activities").select("title").eq("id", foodId).maybeSingle()).data : null;

  const lines = ["Planned with Lark Hour."];
  if (food?.title) lines.push(`Then: ${food.title}.`);
  const more = worthSharing(activity.booking_url);
  if (more) lines.push(`More information or booking: ${more}`);
  const location = activity.address && !isUnknownDetail(activity.address) ? activity.address : null;

  return file(
    buildIcs({
      uid: `idea-${activityId}-${date}-${start.replace(":", "")}`,
      title: activity.title,
      location,
      description: lines.join("\n\n"),
      start: { date, clock: start },
      end: { date, clock: end },
    }),
    activity.title
  );
}
