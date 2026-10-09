import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LANDING_PHOTOS, pickLandingPhoto, randomLandingPhoto } from "@/lib/landing/photos";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("the landing page pictures", () => {
  it("are several, so a visit can differ from the last", () => {
    expect(LANDING_PHOTOS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(LANDING_PHOTOS.map((p) => p.src)).size).toBe(LANDING_PHOTOS.length);
  });

  it("each exist, and are credited as free to use", () => {
    const credits = read("public/images/fallback/CREDITS.md");
    for (const photo of LANDING_PHOTOS) {
      expect(existsSync(join(process.cwd(), "public", photo.src)), photo.src).toBe(true);
      const file = photo.src.split("/").pop()!;
      expect(credits, file).toContain(`\`${file}\``);
    }
    expect(credits).toContain("CC0");
  });

  it("are each described for a screen reader, in words that say what is in the picture, and no two alike", () => {
    for (const photo of LANDING_PHOTOS) {
      expect(photo.alt.trim().length, photo.src).toBeGreaterThan(15);
      expect(photo.alt, photo.src).not.toMatch(/\b(image|picture|photo)\b/i);
    }
    expect(new Set(LANDING_PHOTOS.map((p) => p.alt)).size).toBe(LANDING_PHOTOS.length);
  });

  it("leave out the swimming pool, where a brand's logo shows", () => {
    expect(LANDING_PHOTOS.some((p) => p.src.includes("pool"))).toBe(false);
  });

  it("keep the woodland path the page has always had among them", () => {
    expect(LANDING_PHOTOS.some((p) => p.src.endsWith("woodland.jpg"))).toBe(true);
  });
});

describe("choosing one", () => {
  it("gives each picture its share of the range, in order", () => {
    const n = LANDING_PHOTOS.length;
    for (let i = 0; i < n; i++) expect(pickLandingPhoto((i + 0.5) / n)).toBe(LANDING_PHOTOS[i]);
    expect(pickLandingPhoto(0)).toBe(LANDING_PHOTOS[0]);
  });

  it("still gives one for a number at or past the edges, or not a number", () => {
    expect(pickLandingPhoto(1)).toBe(LANDING_PHOTOS[LANDING_PHOTOS.length - 1]);
    expect(pickLandingPhoto(-3)).toBe(LANDING_PHOTOS[0]);
    expect(pickLandingPhoto(99)).toBe(LANDING_PHOTOS[LANDING_PHOTOS.length - 1]);
    expect(pickLandingPhoto(Number.NaN)).toBe(LANDING_PHOTOS[0]);
  });

  it("really does vary: many visits show more than one, and only ones from the list", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const photo = randomLandingPhoto();
      expect(LANDING_PHOTOS).toContain(photo);
      seen.add(photo.src);
    }
    expect(seen.size).toBe(LANDING_PHOTOS.length);
  });
});

describe("the landing page", () => {
  it("shows the chosen picture with its own description, not one fixed picture", () => {
    const page = read("src/app/page.tsx");
    expect(page).toContain("const photo = randomLandingPhoto();");
    expect(page).toContain("src={photo.src}");
    expect(page).toContain("alt={photo.alt}");
    expect(page).not.toContain('src="/images/fallback/');
  });
});
