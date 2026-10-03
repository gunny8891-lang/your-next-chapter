import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlaceImage } from "@/lib/imagery/types";
import type { TimeOption } from "@/lib/someTime/types";

const held = new Map<string, PlaceImage>();
vi.mock("@/lib/imagery/store", () => ({ loadImages: vi.fn(async () => held) }));

const { attachImages } = await import("@/lib/someTime/images");

const image = (name: string): PlaceImage => ({
  src: `https://upload.wikimedia.org/wikipedia/commons/${name}.jpg`,
  alt: `A photograph of ${name}`,
  credit: "Photo: A · CC BY 2.0",
  sourceUrl: `https://commons.wikimedia.org/wiki/File:${name}.jpg`,
  license: "CC BY 2.0",
});

const option = (id: string, foodStopId: string | null): TimeOption =>
  ({ id, foodStop: foodStopId ? { id: foodStopId } : null, image: null }) as unknown as TimeOption;

describe("attachImages", () => {
  const supabase = {} as SupabaseClient;

  it("uses the place's own photograph", async () => {
    held.clear();
    held.set("park", image("park"));
    held.set("pub", image("pub"));
    const [o] = await attachImages(supabase, [option("park", "pub")]);
    expect(o.image?.alt).toBe("A photograph of park");
  });

  it("falls back to the place to eat that ends the outing", async () => {
    held.clear();
    held.set("pub", image("pub"));
    const [o] = await attachImages(supabase, [option("park", "pub")]);
    expect(o.image?.alt).toBe("A photograph of pub");
  });

  it("leaves an idea with no photograph as it was", async () => {
    held.clear();
    const options = [option("park", null)];
    expect(await attachImages(supabase, options)).toBe(options);
  });
});
