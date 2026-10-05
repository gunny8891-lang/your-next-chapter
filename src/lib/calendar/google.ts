import type { CalendarEventBody } from "@/lib/calendar/event";
import { CALENDAR_TIME_ZONE } from "@/lib/calendar/event";

/**
 * A small client for the three Google endpoints this feature uses (sign-in consent, token
 * exchange, Calendar). Plain fetch, no SDK, so what leaves the app is easy to see and test:
 * `fetchFn` is injectable and the tests drive it with canned responses.
 *
 * The permission asked for is calendar.app.created: the app may create ONE calendar of its
 * own and add, change and remove events in it, and nothing more. It cannot read the
 * member's other calendars or events. (calendar.events.owned would put outings straight
 * into the main calendar, but would also let the app read all of it.)
 */

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
export const APP_CALENDAR_NAME = "Your Next Chapter";

export type GoogleConfig = { clientId: string; clientSecret: string; tokenKey: string };

/** The keys the feature needs, or null when it has not been set up (the feature then stays hidden). */
export function googleConfig(env: Record<string, string | undefined> = process.env): GoogleConfig | null {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, CALENDAR_TOKEN_KEY: tokenKey } = env;
  if (!clientId || !clientSecret || !tokenKey) return null;
  return { clientId, clientSecret, tokenKey };
}

/** What went wrong, in terms the caller can act on. */
export type GoogleErrorKind = "revoked" | "calendar_missing" | "rate_limited" | "failed";

export class GoogleError extends Error {
  readonly kind: GoogleErrorKind;
  readonly status: number;

  constructor(kind: GoogleErrorKind, status: number, message: string) {
    super(message);
    this.name = "GoogleError";
    this.kind = kind;
    this.status = status;
  }
}

type FetchFn = typeof fetch;

export function buildAuthUrl(config: Pick<GoogleConfig, "clientId">, redirectUri: string, state: string): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CALENDAR_SCOPE);
  // Offline access gives a refresh token, so adding an outing later does not need Google to ask again;
  // "consent" makes sure Google returns it even if the member connected before.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(config: GoogleConfig, params: Record<string, string>, fetchFn: FetchFn) {
  const res = await fetchFn(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...params }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; scope?: string; error?: string };
  if (!res.ok) {
    // invalid_grant means the member withdrew access (or the credential expired): not a fault, a decision.
    const revoked = body.error === "invalid_grant";
    throw new GoogleError(revoked ? "revoked" : "failed", res.status, `Google token request failed: ${body.error ?? res.status}`);
  }
  return body;
}

export async function exchangeCode(config: GoogleConfig, code: string, redirectUri: string, fetchFn: FetchFn = fetch) {
  const body = await tokenRequest(config, { code, redirect_uri: redirectUri, grant_type: "authorization_code" }, fetchFn);
  if (!body.access_token || !body.refresh_token) throw new GoogleError("failed", 200, "Google did not return a refresh token");
  return { accessToken: body.access_token, refreshToken: body.refresh_token, scope: body.scope ?? "" };
}

export async function refreshAccessToken(config: GoogleConfig, refreshToken: string, fetchFn: FetchFn = fetch): Promise<string> {
  const body = await tokenRequest(config, { refresh_token: refreshToken, grant_type: "refresh_token" }, fetchFn);
  if (!body.access_token) throw new GoogleError("failed", 200, "Google did not return an access token");
  return body.access_token;
}

/** Withdraws our access at Google. Best effort: failing to revoke must never block a member disconnecting. */
export async function revokeToken(token: string, fetchFn: FetchFn = fetch): Promise<boolean> {
  try {
    const res = await fetchFn(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function calendarRequest<T>(accessToken: string, path: string, init: RequestInit, fetchFn: FetchFn): Promise<T | null> {
  const res = await fetchFn(`${GOOGLE_CALENDAR_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 204) return null;
  const body = (await res.json().catch(() => null)) as T | null;
  if (res.ok) return body;
  if (res.status === 401) throw new GoogleError("revoked", 401, "Google rejected our access");
  if (res.status === 404 || res.status === 410) throw new GoogleError("calendar_missing", res.status, "That calendar or event no longer exists");
  if (res.status === 403 || res.status === 429) throw new GoogleError("rate_limited", res.status, "Google asked us to slow down");
  throw new GoogleError("failed", res.status, `Google Calendar request failed (${res.status})`);
}

export async function createAppCalendar(accessToken: string, fetchFn: FetchFn = fetch): Promise<string> {
  const created = await calendarRequest<{ id?: string }>(
    accessToken,
    "/calendars",
    { method: "POST", body: JSON.stringify({ summary: APP_CALENDAR_NAME, timeZone: CALENDAR_TIME_ZONE }) },
    fetchFn
  );
  if (!created?.id) throw new GoogleError("failed", 200, "Google did not return a calendar id");
  return created.id;
}

export async function insertEvent(accessToken: string, calendarId: string, event: CalendarEventBody, fetchFn: FetchFn = fetch): Promise<string> {
  const created = await calendarRequest<{ id?: string }>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: "POST", body: JSON.stringify(event) },
    fetchFn
  );
  if (!created?.id) throw new GoogleError("failed", 200, "Google did not return an event id");
  return created.id;
}

/** Removes an event. One that is already gone counts as removed. */
export async function deleteEvent(accessToken: string, calendarId: string, eventId: string, fetchFn: FetchFn = fetch): Promise<void> {
  try {
    await calendarRequest(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" }, fetchFn);
  } catch (err) {
    if (err instanceof GoogleError && err.kind === "calendar_missing") return;
    throw err;
  }
}
