import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDogAccessForm } from "@/lib/admin/dogAccess";
import { dogFactsFromOsm } from "@/lib/discovery/dogTags";
import { checkConstraints } from "@/lib/context/constraints";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const form = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });
const OSM = "https://www.openstreetmap.org/way/1";

describe("what OpenStreetMap says about dogs", () => {
  it("reads each value of the dog tag as something reported, with where it came from", () => {
    expect(dogFactsFromOsm({ dog: "yes" }, OSM)).toMatchObject({ access: "allowed", restrictions: null, confidence: "reported" });
    expect(dogFactsFromOsm({ dog: "leashed" }, OSM)).toMatchObject({ access: "allowed", restrictions: "on a lead", confidence: "reported" });
    expect(dogFactsFromOsm({ dog: "unleashed" }, OSM)).toMatchObject({ access: "allowed", restrictions: "off the lead is allowed" });
    expect(dogFactsFromOsm({ dog: "outside" }, OSM)).toMatchObject({ access: "outdoor_only" });
    expect(dogFactsFromOsm({ dog: "no" }, OSM)).toMatchObject({ access: "not_allowed" });
    expect(dogFactsFromOsm({ dog: "Leashed " }, OSM)?.source).toBe(`OpenStreetMap contributors (dog=leashed): ${OSM}`);
  });

  it("says nothing when the tag is missing or not understood: unknown is not a no", () => {
    expect(dogFactsFromOsm({}, OSM)).toBeNull();
    expect(dogFactsFromOsm(undefined, OSM)).toBeNull();
    expect(dogFactsFromOsm({ dog: "" }, OSM)).toBeNull();
    expect(dogFactsFromOsm({ dog: "sometimes" }, OSM)).toBeNull();
    // A different tag about animals or the outdoors is not a statement about dogs.
    expect(dogFactsFromOsm({ outdoor_seating: "yes", leisure: "park" }, OSM)).toBeNull();
  });

  it("is written with a new place only when the source said something", () => {
    const run = read("src/lib/discovery/run.ts");
    expect(run).toContain("...(c.dog");
    expect(run).toContain("dog_access: c.dog.access");
    expect(read("src/lib/discovery/sources/openStreetMap.ts")).toContain("dog: dogFactsFromOsm(place.extratags, osmUrl(place))");
  });

  it("records an estimated price as an estimate, and no price as unknown", () => {
    const run = read("src/lib/discovery/run.ts");
    expect(run).toContain('price_type: c.priceEstimate === null ? "unknown" : c.priceEstimate === 0 ? "free" : "entry"');
    expect(run).toContain('cost_confidence: c.priceEstimate === null ? "unknown" : "estimated"');
  });
});

describe("recording dog access by hand", () => {
  it("clears everything when set to unknown, whatever else was filled in", () => {
    const r = parseDogAccessForm(form({ dog_access: "unknown", dog_confidence: "verified", dog_source: "https://example.org", dog_restrictions: "on a lead" }));
    expect(r).toEqual({ ok: true, update: { dog_access: "unknown", dog_restrictions: null, dog_confidence: "unknown", dog_source: null } });
  });

  it("needs a link for verified, and a note of where it was heard for reported", () => {
    expect(parseDogAccessForm(form({ dog_access: "allowed", dog_confidence: "verified", dog_source: "" })).ok).toBe(false);
    expect(parseDogAccessForm(form({ dog_access: "allowed", dog_confidence: "verified", dog_source: "ask Pat" })).ok).toBe(false);
    expect(parseDogAccessForm(form({ dog_access: "allowed", dog_confidence: "verified", dog_source: "javascript:alert(1)" })).ok).toBe(false);
    expect(parseDogAccessForm(form({ dog_access: "allowed", dog_confidence: "reported", dog_source: "" })).ok).toBe(false);
    expect(parseDogAccessForm(form({ dog_access: "allowed", dog_confidence: "reported", dog_source: "a regular, Oct 2026" })).ok).toBe(true);
  });

  it("keeps a verified record with its link and its rules", () => {
    const r = parseDogAccessForm(form({ dog_access: "outdoor_only", dog_confidence: "verified", dog_source: "https://www.nationaltrust.org.uk/visit/london/ham-house-and-garden", dog_restrictions: "  on a lead; not in the house " }));
    expect(r).toEqual({
      ok: true,
      update: { dog_access: "outdoor_only", dog_restrictions: "on a lead; not in the house", dog_confidence: "verified", dog_source: "https://www.nationaltrust.org.uk/visit/london/ham-house-and-garden" },
    });
  });

  it("rejects an option that does not exist, and a confidence that is not one of the two", () => {
    expect(parseDogAccessForm(form({ dog_access: "yes", dog_confidence: "verified", dog_source: "https://example.org" })).ok).toBe(false);
    expect(parseDogAccessForm(form({})).ok).toBe(false);
    expect(parseDogAccessForm(form({ dog_access: "allowed", dog_confidence: "unknown", dog_source: "https://example.org" })).ok).toBe(false);
  });

  it("trims what is too long and strips control characters", () => {
    const r = parseDogAccessForm(form({ dog_access: "allowed", dog_confidence: "reported", dog_source: "x".repeat(900), dog_restrictions: "y".repeat(400) + "\u0000" }));
    expect(r.ok && r.update.dog_source).toHaveLength(500);
    expect(r.ok && r.update.dog_restrictions).toHaveLength(120);
  });

  it("is only for admins: the page and the action each check, and the link is for admins", () => {
    expect(read("src/app/admin/places/page.tsx")).toContain("await requireAdmin()");
    const actions = read("src/app/admin/places/actions.ts");
    expect(actions).toContain("await requireAdmin()");
    // Only async actions are exported from a server-actions file, so the admin check itself is kept out of it.
    expect(read("src/lib/admin/requireAdmin.ts")).not.toMatch(/^\s*["']use server["']/);
    expect(read("src/components/AdminLinks.tsx")).toContain('href="/admin/places"');
  });

  it("only ever sends the admin back to its own pages", () => {
    expect(read("src/app/admin/places/actions.ts")).toContain('back.startsWith("/admin/places")');
  });
});

describe("with the dog coming, unconfirmed places are ordered but never called friendly", () => {
  const dog = { dog: true } as const;

  it("puts outdoor places ahead of indoor ones among those that need checking", () => {
    const park = checkConstraints({ tags: ["park", "outdoors"] }, dog);
    const gym = checkConstraints({ tags: ["fitness", "indoor"] }, dog);
    const unknown = checkConstraints({ tags: ["community"] }, dog);
    expect(park.bonus).toBeGreaterThan(unknown.bonus);
    expect(unknown.bonus).toBeGreaterThan(gym.bonus);
  });

  it("still says to check, and claims nothing, for an outdoor place", () => {
    const park = checkConstraints({ tags: ["park", "outdoors", "walking"] }, dog);
    expect(park.unverified).toEqual(["Check dog access"]);
    expect(park.facts).toEqual([]);
    expect(park.reasons).toEqual([]);
  });

  it("leaves a place that is known to take dogs ahead of an unconfirmed outdoor one", () => {
    const known = checkConstraints({ tags: ["indoor"], dog_access: "allowed", dog_confidence: "verified" }, dog);
    expect(known.unverified).toEqual([]);
    expect(known.facts).toEqual(["Dogs welcome"]);
  });

  it("does not order anything when the dog is not coming", () => {
    expect(checkConstraints({ tags: ["park", "outdoors"] }, { dog: false }).bonus).toBe(0);
    expect(checkConstraints({ tags: ["fitness"] }, undefined).bonus).toBe(0);
  });
});
