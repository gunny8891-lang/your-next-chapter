import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FetchJson } from "@/lib/imagery/find";
import { enrichImagesFor, isNamedVenue, loadImages, placeFromRow } from "@/lib/imagery/store";

type Call = { table: string; op: string; args: unknown[] };

/**
 * A stand-in for the Supabase client: every chained call is recorded and the
 * chain, when awaited, resolves to what the test says that table returns.
 */
function fakeClient(reads: Record<string, { data?: unknown; error?: { message: string } | null }>) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const result = reads[table] ?? { data: [], error: null };
      const record = (op: string) => (...args: unknown[]) => {
        calls.push({ table, op, args });
        return chain;
      };
      for (const op of ["select", "eq", "in", "like", "is", "not", "or", "order", "limit", "update"]) chain[op] = record(op);
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: result.data ?? null, error: result.error ?? null });
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const row = {
  id: "a1",
  title: "Red Lion",
  address: "Fitzjohn Avenue, High Barnet, EN5 2HE",
  tags: ["food-venue", "pub"],
  location_lat: 51.6513,
  location_lng: -0.2008,
};

const goodPage = {
  title: "File:Red Lion, High Barnet, EN5.jpg",
  coordinates: [{ lat: 51.6514, lon: -0.2009 }],
  imageinfo: [
    {
      width: 2400,
      height: 1600,
      mime: "image/jpeg",
      thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Red_Lion.jpg/1280px-Red_Lion.jpg",
      descriptionurl: "https://commons.wikimedia.org/wiki/File:Red_Lion,_High_Barnet,_EN5.jpg",
      extmetadata: { LicenseShortName: { value: "CC BY-SA 2.0" }, Artist: { value: "Ewan-M" } },
    },
  ],
};

describe("placeFromRow", () => {
  it("builds the place to look for, with how far a photograph of it may be and the town to look for", () => {
    expect(placeFromRow(row)).toEqual({ title: "Red Lion", lat: 51.6513, lng: -0.2008, radiusKm: 0.35, locality: ["high", "barnet"] });
  });
  it("gives a park a wider radius", () => {
    expect(placeFromRow({ ...row, tags: ["walking", "outdoors"] })?.radiusKm).toBe(1.5);
  });
  it("cannot place a row with no coordinates", () => {
    expect(placeFromRow({ ...row, location_lat: null })).toBeNull();
  });
});

describe("isNamedVenue", () => {
  it("is true only for places that came from OpenStreetMap", () => {
    expect(isNamedVenue({ admin_notes: "Place data from OpenStreetMap (© contributors)" })).toBe(true);
    expect(isNamedVenue({ admin_notes: "Place data from OpenStreetMap (food and drink, © contributors)" })).toBe(true);
    expect(isNamedVenue({ admin_notes: null })).toBe(false);
    expect(isNamedVenue({ admin_notes: "Found by web search" })).toBe(false);
  });
});

describe("loadImages", () => {
  it("returns the photographs held, by id", async () => {
    const { client } = fakeClient({
      activities: {
        data: [
          { id: "a1", image_url: "https://upload.wikimedia.org/x.jpg", image_alt: "alt", image_credit: "Photo: A · CC BY 2.0", image_license: "CC BY 2.0", image_source_url: "https://commons.wikimedia.org/wiki/File:x.jpg" },
          { id: "a2", image_url: null },
        ],
      },
    });
    const images = await loadImages(client, ["a1", "a2"]);
    expect([...images.keys()]).toEqual(["a1"]);
    expect(images.get("a1")?.credit).toBe("Photo: A · CC BY 2.0");
  });

  it("returns nothing, rather than failing, when the read fails (the migration not applied yet)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = fakeClient({ activities: { error: { message: "column activities.image_url does not exist" } } });
    expect((await loadImages(client, ["a1"])).size).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not read at all for no ids", async () => {
    const { client, calls } = fakeClient({});
    expect((await loadImages(client, [])).size).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe("enrichImagesFor", () => {
  const found: FetchJson = async () => ({ query: { pages: [goodPage] } });
  const nothing: FetchJson = async () => ({ query: { pages: [] } });
  const busy: FetchJson = async () => ({ error: { code: "cirrussearch-too-busy-error" } });
  const options = { pauseMs: 0 };

  it("saves a photograph with its credit, licence and source", async () => {
    const { client, calls } = fakeClient({ activities: { data: [row] } });
    const summary = await enrichImagesFor(client, ["a1"], { ...options, fetchJson: found });
    expect(summary).toMatchObject({ checked: 1, found: 1, none: 0, errors: 0 });
    const update = calls.find((c) => c.op === "update");
    expect(update?.args[0]).toMatchObject({
      image_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Red_Lion.jpg/1280px-Red_Lion.jpg",
      image_credit: "Photo: Ewan-M · CC BY-SA 2.0",
      image_license: "CC BY-SA 2.0",
      image_source_url: "https://commons.wikimedia.org/wiki/File:Red_Lion,_High_Barnet,_EN5.jpg",
    });
  });

  it("remembers that it looked when nothing qualified, so it does not ask again tomorrow", async () => {
    const { client, calls } = fakeClient({ activities: { data: [row] } });
    const summary = await enrichImagesFor(client, ["a1"], { ...options, fetchJson: nothing });
    expect(summary).toMatchObject({ checked: 1, found: 0, none: 1 });
    const update = calls.find((c) => c.op === "update");
    expect(Object.keys(update?.args[0] as object)).toEqual(["image_checked_at"]);
  });

  it("does NOT mark a place as looked at when the service was busy, so it is tried again soon", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client, calls } = fakeClient({ activities: { data: [row] } });
    const summary = await enrichImagesFor(client, ["a1"], { ...options, fetchJson: busy });
    expect(summary).toMatchObject({ checked: 1, errors: 1, found: 0, none: 0 });
    expect(calls.some((c) => c.op === "update")).toBe(false);
    warn.mockRestore();
  });

  it("only considers named venues without a photograph that are due a look", async () => {
    const { client, calls } = fakeClient({ activities: { data: [] } });
    await enrichImagesFor(client, ["a1"], { ...options, fetchJson: found, now: new Date("2026-10-03T12:00:00Z") });
    const ops = calls.map((c) => [c.op, ...c.args]);
    expect(ops).toContainEqual(["like", "admin_notes", "Place data from OpenStreetMap%"]);
    expect(ops).toContainEqual(["is", "image_url", null]);
    const due = calls.find((c) => c.op === "or")?.args[0] as string;
    expect(due).toContain("image_checked_at.is.null");
    // Six weeks and a bit before the given date.
    expect(due).toContain("image_checked_at.lt.2026-08-19");
  });

  it("stops starting lookups when its time budget is spent", async () => {
    const { client } = fakeClient({ activities: { data: [row, { ...row, id: "a2" }] } });
    const summary = await enrichImagesFor(client, ["a1", "a2"], { ...options, fetchJson: nothing, budgetMs: -1 });
    expect(summary).toMatchObject({ checked: 0, skipped: 2 });
  });

  it("does nothing for no ids", async () => {
    const { client, calls } = fakeClient({});
    expect(await enrichImagesFor(client, [])).toMatchObject({ checked: 0 });
    expect(calls).toHaveLength(0);
  });
});
