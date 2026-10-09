/**
 * The landing page's picture changes from visit to visit, so it shows the range of what Lark Hour is for (a woodland walk,
 * a coffee, a garden, an evening at the theatre, making something, a good book) rather than one idea.
 *
 * These are the freely licensed pictures already in the app (see public/images/fallback/CREDITS.md). Each has its own
 * description for people using a screen reader: on this page the picture is part of the welcome, not decoration, so the
 * description says what is in it. The swimming pool is left out because a brand's logo is clearly visible in it.
 */

export type LandingPhoto = { src: string; alt: string };

export const LANDING_PHOTOS: LandingPhoto[] = [
  { src: "/images/fallback/woodland.jpg", alt: "A sunlit path through the woods" },
  { src: "/images/fallback/cafe.jpg", alt: "A slice of cake and a coffee on a wooden table" },
  { src: "/images/fallback/garden.jpg", alt: "Red and white flowers seen from above" },
  { src: "/images/fallback/theatre.jpg", alt: "A theatre with a red curtain, waiting for the evening's show" },
  { src: "/images/fallback/crafts.jpg", alt: "Handmade clay pots and bowls stacked on stone shelves" },
  { src: "/images/fallback/library.jpg", alt: "A shelf of old books in the sunlight" },
];

/** The picture for a number in [0, 1): each is equally likely, and anything outside or not a number still gives one. Pure. */
export function pickLandingPhoto(r: number): LandingPhoto {
  const n = LANDING_PHOTOS.length;
  const index = Number.isFinite(r) ? Math.min(n - 1, Math.max(0, Math.floor(r * n))) : 0;
  return LANDING_PHOTOS[index];
}

/** A different one on different visits. (Kept out of the page itself so the page stays a plain description of what is shown.) */
export function randomLandingPhoto(): LandingPhoto {
  return pickLandingPhoto(Math.random());
}
