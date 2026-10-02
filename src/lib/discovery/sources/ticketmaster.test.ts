import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTicketmasterSource,
  mapTicketmasterEvents,
  RICHMOND_AREA,
  type TmEvent,
} from "@/lib/discovery/sources/ticketmaster";

const event = (overrides: Partial<TmEvent> = {}): TmEvent => ({
  name: "The Magic Flute",
  url: "https://www.ticketmaster.co.uk/event/1",
  dates: { start: { dateTime: "2026-10-20T18:30:00Z", localDate: "2026-10-20", localTime: "19:30:00" } },
  classifications: [{ segment: { name: "Arts & Theatre" } }],
  _embedded: { venues: [{ address: { line1: "Southbank" }, city: { name: "London" }, location: { latitude: "51.5", longitude: "-0.12" } }] },
  ...overrides,
});

describe("mapTicketmasterEvents", () => {
  it("maps an event and keeps the venue's own clock time (7:30pm stays 7:30pm in summer)", () => {
    const [c] = mapTicketmasterEvents([event()]);
    expect(c).toMatchObject({
      title: "The Magic Flute",
      category: "Learn",
      address: "Southbank, London",
      locationLat: 51.5,
      locationLng: -0.12,
      dateTime: "2026-10-20T19:30:00",
      bookingUrl: "https://www.ticketmaster.co.uk/event/1",
      tags: ["arts & theatre"],
    });
  });

  it("does not file spectator sport under Move", () => {
    const [c] = mapTicketmasterEvents([event({ classifications: [{ segment: { name: "Sports" } }] })]);
    expect(c.category).toBe("Joy");
  });

  it("falls back to the UTC instant when there is no local time, and to Explore for unknown segments", () => {
    const [c] = mapTicketmasterEvents([
      event({ dates: { start: { dateTime: "2026-10-20T18:30:00Z" } }, classifications: [{ segment: { name: "Miscellaneous" } }] }),
    ]);
    expect(c.dateTime).toBe("2026-10-20T18:30:00Z");
    expect(c.category).toBe("Explore");
  });

  it("skips cancelled events", () => {
    const events = [event(), event({ name: "Cancelled show", url: "https://x/2", dates: { status: { code: "cancelled" }, start: { localDate: "2026-10-21", localTime: "19:00:00" } } })];
    expect(mapTicketmasterEvents(events).map((c) => c.title)).toEqual(["The Magic Flute"]);
  });

  it("skips an event with no usable start time (it would otherwise look like a venue that never expires)", () => {
    expect(mapTicketmasterEvents([event({ dates: { start: { localDate: "2026-10-20" } } })])).toEqual([]);
    expect(mapTicketmasterEvents([event({ dates: {} })])).toEqual([]);
  });

  it("copes with a missing venue", () => {
    const [c] = mapTicketmasterEvents([event({ _embedded: undefined })]);
    expect(c.address).toBeNull();
    expect(c.locationLat).toBeNull();
  });
});

describe("createTicketmasterSource", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TICKETMASTER_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("searches around the given area, not a fixed town", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ _embedded: { events: [event()] } }) });

    const candidates = await createTicketmasterSource({ lat: 51.65, lng: -0.2, radiusMiles: 12 }).fetchCandidates();

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("latlong")).toBe("51.65,-0.2");
    expect(url.searchParams.get("radius")).toBe("12");
    expect(url.searchParams.get("unit")).toBe("miles");
    expect(candidates).toHaveLength(1);
  });

  it("still defaults to Richmond when given no area", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await createTicketmasterSource().fetchCandidates();
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("latlong")).toBe(`${RICHMOND_AREA.lat},${RICHMOND_AREA.lng}`);
  });

  it("returns nothing, without error, when the area simply has no events", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(createTicketmasterSource().fetchCandidates()).resolves.toEqual([]);
  });

  it("fails loudly on an API error rather than looking like 'no events'", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => "Invalid ApiKey" });
    await expect(createTicketmasterSource().fetchCandidates()).rejects.toThrow(/401/);
  });

  it("fails loudly when the key is not configured", async () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "");
    await expect(createTicketmasterSource().fetchCandidates()).rejects.toThrow(/not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names each area's source so results can be told apart", () => {
    const a = createTicketmasterSource({ lat: 51.65, lng: -0.2, radiusMiles: 10 });
    const b = createTicketmasterSource({ lat: 51.46, lng: -0.3, radiusMiles: 10 });
    expect(a.name).not.toBe(b.name);
  });
});
