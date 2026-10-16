import type { PlaceImage } from "@/lib/imagery/types";

/**
 * A calm, generic picture for a card with no photograph of its own: a woodland
 * path for a walk, a table for a café. Chosen by what the activity is (its tags),
 * never by where it is, so it makes no claim to be the place itself: it carries
 * no credit (the images are CC0, see public/images/fallback/CREDITS.md) and
 * empty alt text, because it is decoration, not information.
 *
 * Where nothing fits (a pub, a restaurant, a bowling alley) there is no
 * picture, and the card shows its tonal panel. A fitting picture beats none; a
 * misleading one does not.
 */

type Rule = { image: string; tags: string[] };

// The first rule with a matching tag wins, so the specific comes before the broad. Tags are matched as they are held, which
// is not always the catalogue's tidy spelling (a row read straight from the database has "tai_chi" and "National Trust"), so
// the common variants are listed.
export const FALLBACK_RULES: Rule[] = [
  { image: "pool", tags: ["swimming"] },
  { image: "library", tags: ["books"] },
  { image: "theatre", tags: ["theatre", "cinema", "film"] },
  { image: "garden", tags: ["gardens", "garden"] },
  { image: "cafe", tags: ["cafe", "afternoon-tea", "afternoon tea"] },
  { image: "crafts", tags: ["arts", "crafts", "craft", "pottery", "knitting", "sewing"] },
  { image: "woodland", tags: ["nature", "walking"] },
  { image: "yoga", tags: ["yoga", "tai-chi", "tai chi", "tai_chi", "relaxation", "wellness", "pilates"] },
  { image: "heritage", tags: ["heritage", "castle", "national-trust", "National Trust", "house tour"] },
  { image: "museum", tags: ["museum", "gallery", "art", "history", "culture"] },
  { image: "events", tags: ["music", "live music", "concert", "jazz"] },
  { image: "playground", tags: ["playground", "play"] },
  { image: "sport", tags: ["fitness"] },
  { image: "social", tags: ["community", "social", "u3a", "U3A", "over-55s", "community-centre"] },
];

/**
 * Things we deliberately do not stand a picture in for: a pub is not a generic table, and a bowling alley, an adventure golf
 * course, a soft play centre or a bike ride is not the picture of a picnic, a court or a swing that its other tags would match.
 */
const NO_FALLBACK = new Set(["pub", "restaurant", "bowling", "mini golf", "golf", "soft play", "cycling"]);

export function fallbackImageFor(tags: string[]): PlaceImage | null {
  if (tags.some((t) => NO_FALLBACK.has(t))) return null;
  const rule = FALLBACK_RULES.find((r) => r.tags.some((t) => tags.includes(t)));
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
