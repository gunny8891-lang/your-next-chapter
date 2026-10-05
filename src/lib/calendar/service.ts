import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCalendarEvent, type ItemForCalendar } from "@/lib/calendar/event";
import { decryptToken, encryptToken } from "@/lib/calendar/crypto";
import { CALENDAR_SCOPE, GoogleError, createAppCalendar, deleteEvent, insertEvent, refreshAccessToken, revokeToken, type GoogleConfig } from "@/lib/calendar/google";

/**
 * Putting a planned item on the member's Google calendar, and taking it off again.
 *
 * Who may do what: the caller has already authenticated `memberId`. The item is read with
 * the MEMBER's own client, so row-level security means only their own plan is visible; the
 * credential is read and written with the admin client (the table has no member access at
 * all), and always scoped to that one member id.
 */

type Deps = { member: SupabaseClient; admin: SupabaseClient; config: GoogleConfig; fetchFn?: typeof fetch };

export type CalendarResult = { error: string | null; reconnect?: boolean };

const NOT_CONNECTED: CalendarResult = { error: "Connect your Google Calendar first, in Account.", reconnect: true };
const REVOKED: CalendarResult = { error: "Google no longer lets us reach your calendar. Please connect it again in Account.", reconnect: true };
const BUSY: CalendarResult = { error: "Google is busy at the moment. Please try again in a minute." };
const FAILED: CalendarResult = { error: "We couldn't reach your calendar just now. Please try again." };

type Connection = { calendarId: string | null; refreshToken: string };

export async function loadConnection(admin: SupabaseClient, memberId: string, tokenKey: string): Promise<Connection | null> {
  const { data } = await admin.from("calendar_connections").select("refresh_token_enc, calendar_id").eq("member_id", memberId).maybeSingle();
  if (!data) return null;
  try {
    return { calendarId: data.calendar_id as string | null, refreshToken: decryptToken(data.refresh_token_enc as string, tokenKey) };
  } catch {
    // An unreadable credential (the key changed, or the value was damaged) is as good as none.
    return null;
  }
}

export async function saveConnection(admin: SupabaseClient, memberId: string, refreshToken: string, calendarId: string, tokenKey: string, scope: string = CALENDAR_SCOPE) {
  return admin.from("calendar_connections").upsert(
    { member_id: memberId, refresh_token_enc: encryptToken(refreshToken, tokenKey), calendar_id: calendarId, scope, connected_at: new Date().toISOString() },
    { onConflict: "member_id" }
  );
}

/** Whether the member is connected, without decrypting anything. */
export async function isConnected(admin: SupabaseClient, memberId: string): Promise<boolean> {
  const { data } = await admin.from("calendar_connections").select("member_id").eq("member_id", memberId).maybeSingle();
  return Boolean(data);
}

function toResult(err: unknown): CalendarResult {
  if (err instanceof GoogleError) {
    if (err.kind === "revoked") return REVOKED;
    if (err.kind === "rate_limited") return BUSY;
  }
  return FAILED;
}

async function forgetConnection(admin: SupabaseClient, memberId: string) {
  await admin.from("calendar_events").delete().eq("member_id", memberId);
  await admin.from("calendar_connections").delete().eq("member_id", memberId);
}

async function readItem(member: SupabaseClient, itemId: string): Promise<ItemForCalendar | null> {
  const { data } = await member
    .from("itinerary_items")
    .select("day_of_week, slot, member_action, rationale_text, itineraries(week_start_date), activities(title, address, date_time, expires_at, duration_minutes, booking_url)")
    .eq("id", itemId)
    .maybeSingle();
  if (!data || data.member_action !== "accepted") return null;
  const itinerary = data.itineraries as unknown as { week_start_date: string } | null;
  const activity = data.activities as unknown as {
    title: string;
    address: string | null;
    date_time: string | null;
    expires_at: string | null;
    duration_minutes: number | null;
    booking_url: string | null;
  } | null;
  if (!itinerary || !activity) return null;
  return {
    weekStart: itinerary.week_start_date,
    day: data.day_of_week as string,
    slot: data.slot as string,
    title: activity.title,
    address: activity.address,
    dateTime: activity.date_time,
    expiresAt: activity.expires_at,
    durationMinutes: activity.duration_minutes,
    bookingUrl: activity.booking_url,
    why: data.rationale_text as string | null,
  };
}

export async function addItemToCalendar(memberId: string, itemId: string, { member, admin, config, fetchFn = fetch }: Deps): Promise<CalendarResult> {
  const connection = await loadConnection(admin, memberId, config.tokenKey);
  if (!connection) return NOT_CONNECTED;

  const item = await readItem(member, itemId);
  if (!item) return { error: "That one isn't in your plan any more." };
  const event = buildCalendarEvent(item);
  if (!event) return { error: "We couldn't work out when that one is." };

  // Adding twice is not an error, and never makes a second event.
  const { data: existing } = await admin.from("calendar_events").select("google_event_id").eq("member_id", memberId).eq("itinerary_item_id", itemId).maybeSingle();
  if (existing) return { error: null };

  try {
    const accessToken = await refreshAccessToken(config, connection.refreshToken, fetchFn);
    let calendarId = connection.calendarId ?? (await createAppCalendar(accessToken, fetchFn));
    let eventId: string;
    try {
      eventId = await insertEvent(accessToken, calendarId, event, fetchFn);
    } catch (err) {
      // The member deleted our calendar in Google: make a fresh one and try once more.
      if (!(err instanceof GoogleError) || err.kind !== "calendar_missing") throw err;
      calendarId = await createAppCalendar(accessToken, fetchFn);
      eventId = await insertEvent(accessToken, calendarId, event, fetchFn);
    }
    if (calendarId !== connection.calendarId) await admin.from("calendar_connections").update({ calendar_id: calendarId }).eq("member_id", memberId);
    const { error } = await admin.from("calendar_events").upsert({ member_id: memberId, itinerary_item_id: itemId, google_event_id: eventId }, { onConflict: "member_id,itinerary_item_id" });
    if (error) {
      // The event exists in Google but we could not remember it: take it back out rather than leave a stray one.
      await deleteEvent(accessToken, calendarId, eventId, fetchFn).catch(() => undefined);
      return FAILED;
    }
    return { error: null };
  } catch (err) {
    const result = toResult(err);
    if (result.reconnect) await forgetConnection(admin, memberId);
    return result;
  }
}

export async function removeItemFromCalendar(memberId: string, itemId: string, { admin, config, fetchFn = fetch }: Omit<Deps, "member">): Promise<CalendarResult> {
  const { data: link } = await admin.from("calendar_events").select("google_event_id").eq("member_id", memberId).eq("itinerary_item_id", itemId).maybeSingle();
  if (!link) return { error: null };
  const connection = await loadConnection(admin, memberId, config.tokenKey);
  if (!connection?.calendarId) {
    await admin.from("calendar_events").delete().eq("member_id", memberId).eq("itinerary_item_id", itemId);
    return { error: null };
  }
  try {
    const accessToken = await refreshAccessToken(config, connection.refreshToken, fetchFn);
    await deleteEvent(accessToken, connection.calendarId, link.google_event_id as string, fetchFn);
    await admin.from("calendar_events").delete().eq("member_id", memberId).eq("itinerary_item_id", itemId);
    return { error: null };
  } catch (err) {
    const result = toResult(err);
    if (result.reconnect) await forgetConnection(admin, memberId);
    return result;
  }
}

/**
 * Disconnects: withdraws our access at Google, then forgets the credential and what we
 * remembered about events. The "Your Next Chapter" calendar and its events stay in the
 * member's Google account, theirs to keep or delete there.
 */
export async function disconnectCalendar(memberId: string, { admin, config, fetchFn = fetch }: Omit<Deps, "member">): Promise<void> {
  const connection = await loadConnection(admin, memberId, config.tokenKey);
  if (connection) await revokeToken(connection.refreshToken, fetchFn);
  await forgetConnection(admin, memberId);
}
