import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { encryptToken } from "@/lib/calendar/crypto";
import { addItemToCalendar, disconnectCalendar, loadConnection, removeItemFromCalendar, saveConnection } from "@/lib/calendar/service";

const KEY = randomBytes(32).toString("base64");
const config = { clientId: "cid", clientSecret: "secret", tokenKey: KEY };
const ME = "member-1";
const ITEM = "item-1";

type Row = Record<string, unknown>;

/** Just enough of the database client for these scenarios: filters by equality, upsert, update, delete. */
function fakeAdmin(initial: Record<string, Row[]>, options: { failUpsertOn?: string } = {}) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(initial));
  const admin = {
    tables,
    from(name: string) {
      tables[name] ??= [];
      const state = { op: "select", filters: [] as [string, unknown][], payload: null as Row | null };
      const matches = (row: Row) => state.filters.every(([c, v]) => row[c] === v);
      const run = () => {
        if (state.op === "delete") {
          tables[name] = tables[name].filter((r) => !matches(r));
          return { data: null, error: null };
        }
        if (state.op === "update") {
          tables[name].filter(matches).forEach((r) => Object.assign(r, state.payload));
          return { data: null, error: null };
        }
        return { data: tables[name].filter(matches), error: null };
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (c: string, v: unknown) => (state.filters.push([c, v]), builder),
        update: (p: Row) => ((state.op = "update"), (state.payload = p), builder),
        delete: () => ((state.op = "delete"), builder),
        upsert: async (row: Row, opts: { onConflict: string }) => {
          if (options.failUpsertOn === name) return { data: null, error: { message: "boom" } };
          const keys = opts.onConflict.split(",");
          const existing = tables[name].find((r) => keys.every((k) => r[k] === row[k]));
          if (existing) Object.assign(existing, row);
          else tables[name].push({ ...row });
          return { data: null, error: null };
        },
        maybeSingle: async () => ({ data: (run().data as Row[] | null)?.[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve(run()),
      };
      return builder;
    },
  };
  return admin as unknown as SupabaseClient & { tables: Record<string, Row[]> };
}

/** The member's own view of one plan item. */
function memberWith(item: Row | null): SupabaseClient {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: item, error: null }) }) }) }),
  } as unknown as SupabaseClient;
}

const acceptedItem = (over: Row = {}): Row => ({
  day_of_week: "Sat",
  slot: "afternoon",
  member_action: "accepted",
  rationale_text: "You like gardens.",
  itineraries: { week_start_date: "2026-10-05" },
  activities: { title: "Kew Gardens", address: "Richmond", date_time: null, expires_at: null, duration_minutes: null, booking_url: null },
  ...over,
});

const connectedTables = (calendarId: string | null = "cal-1") => ({
  calendar_connections: [{ member_id: ME, refresh_token_enc: encryptToken("refresh-token", KEY), calendar_id: calendarId, scope: "s" }],
  calendar_events: [] as Row[],
});

type Handler = (url: string, init: RequestInit) => { status?: number; json?: unknown };
function google(handler: Handler) {
  const urls: string[] = [];
  const fn = (async (url: string | URL | Request, init: RequestInit = {}) => {
    urls.push(`${init.method ?? "GET"} ${String(url)}`);
    const r = handler(String(url), init);
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => r.json ?? {} } as Response;
  }) as typeof fetch;
  return { fn, urls };
}

const happy: Handler = (url) => {
  if (url.endsWith("/token")) return { json: { access_token: "at" } };
  if (url.endsWith("/events")) return { json: { id: "evt-1" } };
  if (url.endsWith("/calendars")) return { json: { id: "new-cal" } };
  return { status: 204 };
};

describe("the stored connection", () => {
  it("is saved encrypted and read back", async () => {
    const admin = fakeAdmin({});
    await saveConnection(admin, ME, "refresh-token", "cal-1", KEY);
    const stored = String(admin.tables.calendar_connections[0].refresh_token_enc);
    expect(stored).not.toContain("refresh-token");
    expect(await loadConnection(admin, ME, KEY)).toEqual({ calendarId: "cal-1", refreshToken: "refresh-token" });
  });

  it("is treated as absent if it cannot be decrypted (the key changed)", async () => {
    const admin = fakeAdmin(connectedTables());
    expect(await loadConnection(admin, ME, randomBytes(32).toString("base64"))).toBeNull();
  });

  it("is absent for a member who never connected", async () => {
    expect(await loadConnection(fakeAdmin({}), ME, KEY)).toBeNull();
  });
});

describe("adding an outing to the calendar", () => {
  it("puts it in our calendar and remembers it", async () => {
    const admin = fakeAdmin(connectedTables());
    const g = google(happy);
    const result = await addItemToCalendar(ME, ITEM, { member: memberWith(acceptedItem()), admin, config, fetchFn: g.fn });
    expect(result).toEqual({ error: null });
    expect(g.urls).toEqual(["POST https://oauth2.googleapis.com/token", "POST https://www.googleapis.com/calendar/v3/calendars/cal-1/events"]);
    expect(admin.tables.calendar_events).toEqual([expect.objectContaining({ member_id: ME, itinerary_item_id: ITEM, google_event_id: "evt-1" })]);
  });

  it("sends the right event: the day, the hour and the zone", async () => {
    const admin = fakeAdmin(connectedTables());
    let sent: Row = {};
    const g = google((url, init) => {
      if (url.endsWith("/events")) sent = JSON.parse(String(init.body));
      return happy(url, init);
    });
    await addItemToCalendar(ME, ITEM, { member: memberWith(acceptedItem()), admin, config, fetchFn: g.fn });
    expect(sent.summary).toBe("Kew Gardens");
    expect(sent.start).toEqual({ dateTime: "2026-10-10T14:00:00", timeZone: "Europe/London" });
  });

  it("never makes a second event for the same outing", async () => {
    const admin = fakeAdmin(connectedTables());
    const g = google(happy);
    const deps = { member: memberWith(acceptedItem()), admin, config, fetchFn: g.fn };
    await addItemToCalendar(ME, ITEM, deps);
    const callsAfterFirst = g.urls.length;
    expect(await addItemToCalendar(ME, ITEM, deps)).toEqual({ error: null });
    expect(g.urls.length).toBe(callsAfterFirst);
    expect(admin.tables.calendar_events).toHaveLength(1);
  });

  it("asks the member to connect first if they have not", async () => {
    const admin = fakeAdmin({});
    const g = google(happy);
    const result = await addItemToCalendar(ME, ITEM, { member: memberWith(acceptedItem()), admin, config, fetchFn: g.fn });
    expect(result.reconnect).toBe(true);
    expect(g.urls).toEqual([]);
  });

  it("only adds what they have said yes to", async () => {
    const admin = fakeAdmin(connectedTables());
    const g = google(happy);
    for (const status of ["pending", "skipped", "swapped"]) {
      const result = await addItemToCalendar(ME, ITEM, { member: memberWith(acceptedItem({ member_action: status })), admin, config, fetchFn: g.fn });
      expect(result.error).toBeTruthy();
    }
    expect(g.urls).toEqual([]);
  });

  it("cannot reach an item that is not the member's own (their view of it is empty)", async () => {
    const admin = fakeAdmin(connectedTables());
    const g = google(happy);
    const result = await addItemToCalendar(ME, "someone-elses-item", { member: memberWith(null), admin, config, fetchFn: g.fn });
    expect(result.error).toMatch(/isn't in your plan/);
    expect(g.urls).toEqual([]);
    expect(admin.tables.calendar_events).toHaveLength(0);
  });

  it("makes a fresh calendar if they deleted ours in Google, and carries on", async () => {
    const admin = fakeAdmin(connectedTables("old-cal"));
    let eventTries = 0;
    const g = google((url, init) => {
      if (url.includes("/calendars/old-cal/events")) {
        eventTries++;
        return { status: 404 };
      }
      return happy(url, init);
    });
    const result = await addItemToCalendar(ME, ITEM, { member: memberWith(acceptedItem()), admin, config, fetchFn: g.fn });
    expect(result).toEqual({ error: null });
    expect(eventTries).toBe(1);
    expect(admin.tables.calendar_connections[0].calendar_id).toBe("new-cal");
    expect(admin.tables.calendar_events).toHaveLength(1);
  });

  it("makes the calendar the first time if the connection had none yet", async () => {
    const admin = fakeAdmin(connectedTables(null));
    const g = google(happy);
    await addItemToCalendar(ME, ITEM, { member: memberWith(acceptedItem()), admin, config, fetchFn: g.fn });
    expect(g.urls).toContain("POST https://www.googleapis.com/calendar/v3/calendars");
    expect(admin.tables.calendar_connections[0].calendar_id).toBe("new-cal");
  });

  it("forgets the connection and asks them to reconnect if they have withdrawn access in Google", async () => {
    const admin = fakeAdmin({ ...connectedTables(), calendar_events: [{ member_id: ME, itinerary_item_id: "other", google_event_id: "e" }] });
    const g = google((url) => (url.endsWith("/token") ? { status: 400, json: { error: "invalid_grant" } } : { status: 500 }));
    const result = await addItemToCalendar(ME, ITEM, { member: memberWith(acceptedItem()), admin, config, fetchFn: g.fn });
    expect(result.reconnect).toBe(true);
    expect(result.error).toMatch(/connect it again/);
    expect(admin.tables.calendar_connections).toHaveLength(0);
    expect(admin.tables.calendar_events).toHaveLength(0);
  });

  it("keeps the connection through a Google hiccup and says so kindly", async () => {
    const admin = fakeAdmin(connectedTables());
    const g = google((url) => (url.endsWith("/token") ? { json: { access_token: "at" } } : { status: 500 }));
    const result = await addItemToCalendar(ME, ITEM, { member: memberWith(acceptedItem()), admin, config, fetchFn: g.fn });
    expect(result.error).toMatch(/couldn't reach your calendar/);
    expect(result.reconnect).toBeUndefined();
    expect(admin.tables.calendar_connections).toHaveLength(1);
    expect(admin.tables.calendar_events).toHaveLength(0);
  });

  it("asks them to wait if Google says it is busy", async () => {
    const admin = fakeAdmin(connectedTables());
    const g = google((url) => (url.endsWith("/token") ? { json: { access_token: "at" } } : { status: 429 }));
    const result = await addItemToCalendar(ME, ITEM, { member: memberWith(acceptedItem()), admin, config, fetchFn: g.fn });
    expect(result.error).toMatch(/busy/);
  });

  it("takes the event back out if it cannot remember it, rather than leave one it cannot manage", async () => {
    const admin = fakeAdmin(connectedTables(), { failUpsertOn: "calendar_events" });
    const g = google(happy);
    const result = await addItemToCalendar(ME, ITEM, { member: memberWith(acceptedItem()), admin, config, fetchFn: g.fn });
    expect(result.error).toBeTruthy();
    expect(g.urls).toContain("DELETE https://www.googleapis.com/calendar/v3/calendars/cal-1/events/evt-1");
  });
});

describe("taking an outing off the calendar", () => {
  const linked = () => ({ ...connectedTables(), calendar_events: [{ member_id: ME, itinerary_item_id: ITEM, google_event_id: "evt-1" }] });

  it("removes the event in Google and forgets it", async () => {
    const admin = fakeAdmin(linked());
    const g = google(happy);
    expect(await removeItemFromCalendar(ME, ITEM, { admin, config, fetchFn: g.fn })).toEqual({ error: null });
    expect(g.urls).toContain("DELETE https://www.googleapis.com/calendar/v3/calendars/cal-1/events/evt-1");
    expect(admin.tables.calendar_events).toHaveLength(0);
  });

  it("does nothing, and asks nothing of Google, for an outing that was never added", async () => {
    const admin = fakeAdmin(connectedTables());
    const g = google(happy);
    expect(await removeItemFromCalendar(ME, ITEM, { admin, config, fetchFn: g.fn })).toEqual({ error: null });
    expect(g.urls).toEqual([]);
  });

  it("leaves other outings alone", async () => {
    const admin = fakeAdmin({ ...connectedTables(), calendar_events: [...linked().calendar_events, { member_id: ME, itinerary_item_id: "item-2", google_event_id: "evt-2" }] });
    await removeItemFromCalendar(ME, ITEM, { admin, config, fetchFn: google(happy).fn });
    expect(admin.tables.calendar_events).toEqual([expect.objectContaining({ itinerary_item_id: "item-2" })]);
  });

  it("is fine if the member already deleted the event themselves", async () => {
    const admin = fakeAdmin(linked());
    const g = google((url, init) => (url.includes("/events/") ? { status: 404 } : happy(url, init)));
    expect(await removeItemFromCalendar(ME, ITEM, { admin, config, fetchFn: g.fn })).toEqual({ error: null });
    expect(admin.tables.calendar_events).toHaveLength(0);
  });

  it("keeps the record if Google could not be reached, so it can be tried again", async () => {
    const admin = fakeAdmin(linked());
    const g = google((url) => (url.endsWith("/token") ? { json: { access_token: "at" } } : { status: 500 }));
    const result = await removeItemFromCalendar(ME, ITEM, { admin, config, fetchFn: g.fn });
    expect(result.error).toBeTruthy();
    expect(admin.tables.calendar_events).toHaveLength(1);
  });
});

describe("disconnecting", () => {
  it("withdraws access at Google and forgets everything we held", async () => {
    const admin = fakeAdmin({ ...connectedTables(), calendar_events: [{ member_id: ME, itinerary_item_id: ITEM, google_event_id: "evt-1" }] });
    const g = google(happy);
    await disconnectCalendar(ME, { admin, config, fetchFn: g.fn });
    expect(g.urls).toEqual(["POST https://oauth2.googleapis.com/revoke"]);
    expect(admin.tables.calendar_connections).toHaveLength(0);
    expect(admin.tables.calendar_events).toHaveLength(0);
  });

  it("still forgets everything if Google cannot be reached", async () => {
    const admin = fakeAdmin(connectedTables());
    const down = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await disconnectCalendar(ME, { admin, config, fetchFn: down });
    expect(admin.tables.calendar_connections).toHaveLength(0);
  });

  it("does not touch another member's connection", async () => {
    const admin = fakeAdmin({
      calendar_connections: [...connectedTables().calendar_connections, { member_id: "member-2", refresh_token_enc: encryptToken("theirs", KEY), calendar_id: "c2", scope: "s" }],
    });
    await disconnectCalendar(ME, { admin, config, fetchFn: google(happy).fn });
    expect(admin.tables.calendar_connections).toEqual([expect.objectContaining({ member_id: "member-2" })]);
  });
});
