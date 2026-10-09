import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { imageForRow } from "@/lib/imagery/forRow";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("the picture for a place", () => {
  const photographed = {
    tags: ["museum"],
    image_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Museum.jpg/640px-Museum.jpg",
    image_alt: "The front of the museum",
    image_credit: "Photo: A. Person · CC BY-SA 4.0",
    image_license: "CC BY-SA 4.0",
    image_source_url: "https://commons.wikimedia.org/wiki/File:Museum.jpg",
  };

  it("is its own photograph, with the credit and licence that must go with it", () => {
    expect(imageForRow(photographed)).toEqual({
      src: photographed.image_url,
      alt: "The front of the museum",
      credit: "Photo: A. Person · CC BY-SA 4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Museum.jpg",
      license: "CC BY-SA 4.0",
    });
  });

  it("is a calm stand-in for the kind of thing it is when it has no photograph, marked generic and uncredited", () => {
    const stand = imageForRow({ tags: ["swimming"], image_url: null });
    expect(stand).toMatchObject({ src: "/images/fallback/pool.jpg", generic: true, alt: "", credit: "" });
  });

  it("is nothing for a pub or a hall with no photograph, rather than a picture of something else", () => {
    expect(imageForRow({ tags: ["food-venue", "pub"], image_url: null })).toBeNull();
    expect(imageForRow({ tags: ["community", "community-centre"] })).toBeNull();
    expect(imageForRow({ tags: null })).toBeNull();
  });

  it("prefers the real photograph to a stand-in", () => {
    const both = imageForRow({ ...photographed, tags: ["swimming"] });
    expect(both?.generic).toBeUndefined();
    expect(both?.src).toBe(photographed.image_url);
  });

  it("copes with missing pieces of a credit", () => {
    expect(imageForRow({ tags: [], image_url: "https://upload.wikimedia.org/x.jpg" })).toEqual({ src: "https://upload.wikimedia.org/x.jpg", alt: "", credit: "", sourceUrl: "", license: "" });
  });
});

describe("My Week", () => {
  it("reads the photograph columns with each planned place and gives them to the outing's sheet", () => {
    const page = read("src/app/week/page.tsx");
    expect(page).toContain("image_url, image_alt, image_credit, image_license, image_source_url");
    expect(page).toContain("image: imageForRow(activity),");
    const sheet = read("src/components/ItemSheet.tsx");
    expect(sheet).toContain('image={"image" in item ? (item.image ?? null) : null}');
  });
});
