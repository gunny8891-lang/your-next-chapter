import type { PlaceImage } from "@/lib/imagery/types";

/**
 * A calm, generic picture for a card with no photograph of its own: a woodland
 * path for a walk, a table for a café. Chosen by what the activity is (its tags),
 * never by where it is, so it makes no claim to be the place itself: it carries
 * no credit (the images are CC0, see public/images/fallback/CREDITS.md) and
 * empty alt text, because it is decoration, not information.
 *
 * Where nothing fits (a pub, a restaurant, a community hall) there is no
 * picture, and the card shows its tonal panel. A fitting picture beats none; a
 * misleading one does not.
 */

type Rule = { image: string; tags: string[] };

// The first rule with a matching tag wins, so the specific comes before the broad.
const RULES: Rule[] = [
  { image: "pool", tags: ["swimming"] },
  { image: "library", tags: ["books"] },
  { image: "theatre", tags: ["theatre", "cinema"] },
  { image: "garden", tags: ["gardens"] },
  { image: "cafe", tags: ["cafe", "afternoon-tea"] },
  { image: "crafts", tags: ["arts", "crafts", "pottery"] },
  { image: "woodland", tags: ["nature", "walking"] },
];

/** Places to eat that we deliberately do not stand a picture in for: a pub is not a generic table. */
const NO_FALLBACK = new Set(["pub", "restaurant"]);

export function fallbackImageFor(tags: string[]): PlaceImage | null {
  if (tags.some((t) => NO_FALLBACK.has(t))) return null;
  const rule = RULES.find((r) => r.tags.some((t) => tags.includes(t)));
  if (!rule) return null;
  return {
    src: `/images/fallback/${rule.image}.jpg`,
    alt: "",
    credit: "",
    sourceUrl: "",
    license: "CC0",
    generic: true,
  };
}
