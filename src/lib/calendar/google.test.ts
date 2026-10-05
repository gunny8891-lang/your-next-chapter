import { describe, expect, it } from "vitest";
import {
  CALENDAR_SCOPE,
  GoogleError,
  buildAuthUrl,
  createAppCalendar,
  deleteEvent,
  exchangeCode,
  googleConfig,
  insertEvent,
  refreshAccessToken,
  revokeToken,
} from "@/lib/calendar/google";
import { buildCalendarEvent } from "@/lib/calendar/event";

const config = { clientId: "client-id", clientSecret: "client-secret", tokenKey: "unused-here" };

type Call = { url: string; method: string; headers: Record<string, string>; body: string };

/** A stand-in for fetch: answers by address, and remembers what was asked. */
function fakeFetch(answer: (url: string, init: RequestInit) => { status?: number; json?: unknown } | Promise<never>) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method ?? "GET", headers: (init.headers ?? {}) as Record<string, string>, body: String(init.body ?? "") });
    const r = await answer(u, init);
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => r.json ?? {} } as Response;
  }) as typeof fetch;
  return { fn, calls };
}

const event = buildCalendarEvent({
  weekStart: "2026-10-05",
  day: "Sat",
  slot: "afternoon",
  title: "Kew Gardens",
  address: null,
  dateTime: null,
  expiresAt: null,
  durationMinutes: null,
  bookingUrl: null,
  why: null,
})!;

describe("the keys", () => {
  it("are present only when all three are set", () => {
    expect(googleConfig({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b", CALENDAR_TOKEN_KEY: "c" })).toEqual({ clientId: "a", clientSecret: "b", tokenKey: "c" });
    expect(googleConfig({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b" })).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_ID: "a", CALENDAR_TOKEN_KEY: "c" })).toBeNull();
    expect(googleConfig({})).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", CALENDAR_TOKEN_KEY: "" })).toBeNull();
  });
});

describe("the consent address", () => {
  const url = new URL(buildAuthUrl(config, "https://app.test/api/calendar/callback", "state-123"));

  it("goes to Google and carries who we are and where to come back to", () => {
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.test/api/calendar/callback");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("asks only for the narrow permission: our own calendar, nothing of theirs", () => {
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/calendar.app.created");
    expect(CALENDAR_SCOPE).toBe(url.searchParams.get("scope"));
  });

  it("asks for lasting access, and for it to be given again on reconnecting", () => {
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("never carries the secret", () => {
    expect(url.toString()).not.toContain("client-secret");
  });
});

describe("exchanging the code", () => {
  it("returns the credentials and sends the secret in the body, not the address", async () => {
    const f = fakeFetch(() => ({ json: { access_token: "at", refresh_token: "rt", scope: CALENDAR_SCOPE } }));
    expect(await exchangeCode(config, "the-code", "https://app.test/cb", f.fn)).toEqual({ accessToken: "at", refreshToken: "rt", scope: CALENDAR_SCOPE });
    expect(f.calls[0].url).toBe("https://oauth2.googleapis.com/token");
    expect(f.calls[0].url).not.toContain("client-secret");
    expect(f.calls[0].body).toContain("grant_type=authorization_code");
    expect(f.calls[0].body).toContain("code=the-code");
  });

  it("fails if Google gives no refresh token, since adding outings later would then be impossible", async () => {
    const f = fakeFetch(() => ({ json: { access_token: "at" } }));
    await expect(exchangeCode(config, "c", "https://app.test/cb", f.fn)).rejects.toBeInstanceOf(GoogleError);
  });

  it("reports a refused code as a failure", async () => {
    const f = fakeFetch(() => ({ status: 400, json: { error: "invalid_request" } }));
    await expect(exchangeCode(config, "c", "https://app.test/cb", f.fn)).rejects.toMatchObject({ kind: "failed" });
  });
});

describe("refreshing access", () => {
  it("gets a fresh access token", async () => {
    const f = fakeFetch(() => ({ json: { access_token: "fresh" } }));
    expect(await refreshAccessToken(config, "rt", f.fn)).toBe("fresh");
    expect(f.calls[0].body).toContain("grant_type=refresh_token");
    expect(f.calls[0].body).toContain("refresh_token=rt");
  });

  it("recognises that the member has withdrawn access", async () => {
    const f = fakeFetch(() => ({ status: 400, json: { error: "invalid_grant" } }));
    await expect(refreshAccessToken(config, "rt", f.fn)).rejects.toMatchObject({ kind: "revoked" });
  });

  it("does not mistake an outage for withdrawal", async () => {
    const f = fakeFetch(() => ({ status: 503, json: {} }));
    await expect(refreshAccessToken(config, "rt", f.fn)).rejects.toMatchObject({ kind: "failed" });
  });
});

describe("the calendar", () => {
  it("makes our own calendar, named for the app, in London time", async () => {
    const f = fakeFetch(() => ({ json: { id: "cal-1" } }));
    expect(await createAppCalendar("at", f.fn)).toBe("cal-1");
    expect(f.calls[0].url).toBe("https://www.googleapis.com/calendar/v3/calendars");
    expect(f.calls[0].headers.Authorization).toBe("Bearer at");
    expect(JSON.parse(f.calls[0].body)).toEqual({ summary: "Your Next Chapter", timeZone: "Europe/London" });
  });

  it("adds an event to that calendar and returns its id", async () => {
    const f = fakeFetch(() => ({ json: { id: "evt-1" } }));
    expect(await insertEvent("at", "cal@group.calendar.google.com", event, f.fn)).toBe("evt-1");
    expect(f.calls[0].url).toBe("https://www.googleapis.com/calendar/v3/calendars/cal%40group.calendar.google.com/events");
    expect(f.calls[0].method).toBe("POST");
    expect(JSON.parse(f.calls[0].body).summary).toBe("Kew Gardens");
  });

  it.each([
    [401, "revoked"],
    [404, "calendar_missing"],
    [410, "calendar_missing"],
    [403, "rate_limited"],
    [429, "rate_limited"],
    [500, "failed"],
  ])("a %s from Google is understood as %s", async (status, kind) => {
    const f = fakeFetch(() => ({ status }));
    await expect(insertEvent("at", "cal", event, f.fn)).rejects.toMatchObject({ kind });
  });

  it("removes an event, and counts one that is already gone as removed", async () => {
    const ok = fakeFetch(() => ({ status: 204 }));
    await expect(deleteEvent("at", "cal", "evt-1", ok.fn)).resolves.toBeUndefined();
    expect(ok.calls[0].method).toBe("DELETE");
    expect(ok.calls[0].url).toBe("https://www.googleapis.com/calendar/v3/calendars/cal/events/evt-1");

    const gone = fakeFetch(() => ({ status: 404 }));
    await expect(deleteEvent("at", "cal", "evt-1", gone.fn)).resolves.toBeUndefined();

    const broken = fakeFetch(() => ({ status: 500 }));
    await expect(deleteEvent("at", "cal", "evt-1", broken.fn)).rejects.toMatchObject({ kind: "failed" });
  });
});

describe("withdrawing access", () => {
  it("tells Google to revoke the credential", async () => {
    const f = fakeFetch(() => ({}));
    expect(await revokeToken("rt", f.fn)).toBe(true);
    expect(f.calls[0].url).toBe("https://oauth2.googleapis.com/revoke");
    expect(f.calls[0].body).toBe("token=rt");
  });

  it("never throws, so a member can always disconnect", async () => {
    const down = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await revokeToken("rt", down)).toBe(false);
    expect(await revokeToken("rt", fakeFetch(() => ({ status: 400 })).fn)).toBe(false);
  });
});
