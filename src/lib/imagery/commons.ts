import { haversineDistanceKm } from "@/lib/geo/haversine";
import type { PlaceImage } from "@/lib/imagery/types";

/**
 * Choosing a Wikimedia Commons photograph for a named place.
 *
 * The rule that governs everything here: a wrong photograph is worse than none.
 * A card with a tidy tonal panel looks finished; a card showing the wrong park
 * looks broken and untrustworthy. So a candidate has to clear every test —
 * a free licence we can honour, a usable shape and size, the place's own name,
 * and (when the photo is geotagged) a location near the place — and when
 * nothing does, we say so and show no photo.
 */

export type Place = {
  title: string;
  lat: number;
  lng: number;
  /** How far from the point a photograph of it can have been taken: a pub is a few steps, a park is a walk. */
  radiusKm?: number;
  /** The town or suburb from its address: what tells this Red Lion from the other hundred. */
  locality?: string[];
};

/** One file as the Commons API describes it, reduced to what the choice needs. */
export type CommonsCandidate = {
  /** "File:Richmond Park.jpg" */
  fileTitle: string;
  width: number;
  height: number;
  mime: string;
  /** A resized copy (we ask for 1280px wide), not the original. */
  thumbUrl: string;
  pageUrl: string;
  license: string;
  nonFree: boolean;
  restricted: boolean;
  author: string;
  description: string;
  coords: { lat: number; lng: number } | null;
};

export const THUMB_WIDTH = 1280;

const MIN_WIDTH = 1000;
const MIN_ASPECT = 1.25; // landscape only: it has to fill a wide banner
const MAX_ASPECT = 2.6; // not a thin panorama
/** A geotagged photo further than this from a small place is a photo of somewhere else. */
const SMALL_PLACE_KM = 0.35;
const LARGE_PLACE_KM = 1.5;
const NEAR_KM = 0.15;

/** Tags that mean a place is large and open (a park, a reserve), so its photographs are taken across it. */
const LARGE_TAGS = new Set(["outdoors", "nature", "walking", "gardens", "heritage"]);
export function placeRadiusKm(tags: string[]): number {
  return tags.some((t) => LARGE_TAGS.has(t)) ? LARGE_PLACE_KM : SMALL_PLACE_KM;
}

const ROAD_WORD = /\b(street|road|lane|avenue|close|drive|way|gardens|terrace|crescent|court|grove|walk|row|parade|broadway|square)\b/i;
const POSTCODE_LIKE = /^[a-z]{1,2}\d[a-z\d]?(\s*\d[a-z]{2})?$/i;

/** The town or suburb out of an address like "12 High Street, Barnet, EN5 5XX". */
export function localityWords(address: string | null): string[] {
  if (!address) return [];
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  const kept = parts.filter((p, i) => !POSTCODE_LIKE.test(p) && !/^\d/.test(p) && !(i === 0 && parts.length > 1 && ROAD_WORD.test(p)));
  return [...new Set(kept.flatMap((p) => nameWords(p)).filter((w) => w.length >= 4 && !/\d/.test(w)))];
}

/**
 * What a photograph's title can say it is of, other than the place we mean. A
 * file called "Oakmere Park - Western pool" is of a park, not of the pub that
 * shares its name; one is only accepted for a place whose own name has the word.
 */
const OTHER_SUBJECT = new Set(["church", "school", "station", "cemetery", "hospital", "castle", "museum", "library", "cinema", "theatre", "stadium", "college", "university", "hotel", "cathedral", "abbey"]);
/** Features of open space: telling for a small venue (a pub is not its park's pond), harmless in a large place's own photographs. */
const OUTDOOR_FEATURE = new Set(["park", "pool", "lake", "pond", "bridge"]);

/** Words that make a file a poor cover even when it is of the right place. */
const UNWANTED = /\b(logo|map|diagram|plan of|floor ?plan|coat of arms|flag|poster|advert|menu|screenshot|locator|signature|crest|badge|icon|timetable|ticket|brochure|leaflet|portrait|wedding|funeral|memorial plaque|interior of|sign|signage)\b/i;

const STOP_WORDS = new Set(["the", "a", "an", "of", "and", "at", "in", "on", "for", "to", "by", "with"]);

/** Lower-case, accent-free, apostrophes removed (so "Bull's" and "Bulls" agree), words only. */
export function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The words of a place's name that a photograph's title has to contain. */
export function nameWords(name: string): string[] {
  return words(name).filter((w) => !STOP_WORDS.has(w));
}

/**
 * Names that cannot be told apart from a thousand others ("Library", "The Park")
 * have no word of their own to look for, so no photograph can be matched to them.
 */
const GENERIC = new Set(["park", "gardens", "garden", "library", "museum", "centre", "center", "cafe", "pub", "inn", "church", "hall", "pool", "leisure", "community", "public", "restaurant", "theatre", "cinema", "playground", "tea", "room", "rooms", "house"]);

export function hasDistinctiveName(name: string): boolean {
  return nameWords(name).some((w) => w.length >= 3 && !GENERIC.has(w));
}

/** Every word of `needles`, in order and side by side: "Angel Cafe, New Barnet" does not hold "Barnet Cafe". */
function containsPhrase(haystack: string, needles: string[]): boolean {
  if (needles.length === 0) return false;
  const have = words(haystack).filter((w) => !STOP_WORDS.has(w));
  for (let i = 0; i + needles.length <= have.length; i++) {
    if (needles.every((n, j) => have[i + j] === n)) return true;
  }
  return false;
}

/** A licence we can honour with a credit line: public domain, CC0, or Creative Commons BY / BY-SA. */
export function licenceAllowed(short: string): boolean {
  const l = short.trim();
  if (!l) return false;
  if (/\b(nc|nd)\b/i.test(l) || /non-?commercial|no ?deriv/i.test(l)) return false;
  return /^(cc0\b|public domain|pd[- ]|cc[- ]by(-sa)?\b)/i.test(l);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export type Verdict = { ok: true; score: number } | { ok: false; reason: string };

/** Pure: does this file qualify as a photograph of this place, and how good a match is it? */
export function assess(place: Place, c: CommonsCandidate): Verdict {
  if (!/^image\/(jpeg|png|webp)$/.test(c.mime)) return { ok: false, reason: "not a photograph file" };
  if (c.nonFree || c.restricted) return { ok: false, reason: "restricted" };
  if (!licenceAllowed(c.license)) return { ok: false, reason: `licence ${c.license || "unknown"}` };
  if (c.width < MIN_WIDTH) return { ok: false, reason: "too small" };
  const aspect = c.width / c.height;
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return { ok: false, reason: "wrong shape" };
  if (UNWANTED.test(c.fileTitle.replace(/^File:/, "").replace(/\.[a-z]+$/i, ""))) return { ok: false, reason: "not a view of the place" };

  const needed = nameWords(place.title);
  if (!hasDistinctiveName(place.title)) return { ok: false, reason: "name too generic to match" };

  const baseTitle = c.fileTitle.replace(/^File:/, "").replace(/\.[a-z]+$/i, "");
  // The name, as a phrase, in the file's own title. Not scattered through it, and not only
  // in a description: that is how a photograph of the Angel Cafe in New Barnet gets offered
  // for "Barnet Cafe", and how a museum's jewellery-box exhibit becomes its picture.
  if (!containsPhrase(baseTitle, needed)) return { ok: false, reason: "name not in the file's title" };
  const named = new Set(needed);
  const small = (place.radiusKm ?? SMALL_PLACE_KM) <= SMALL_PLACE_KM;
  if (words(baseTitle).some((w) => !named.has(w) && (OTHER_SUBJECT.has(w) || (small && OUTDOOR_FEATURE.has(w))))) return { ok: false, reason: "a photograph of something else nearby" };

  let distance: number | null = null;
  if (c.coords) {
    distance = haversineDistanceKm(place.lat, place.lng, c.coords.lat, c.coords.lng);
    if (distance > (place.radiusKm ?? SMALL_PLACE_KM)) return { ok: false, reason: "photographed somewhere else" };
  } else {
    // Nothing to confirm the place by but words, so there have to be enough of them: more
    // than one word of the name, and the town. Many places share a name; "Red Lion" alone
    // is not one.
    if (needed.length < 2) return { ok: false, reason: "one-word name and no location to confirm it" };
    const where = place.locality ?? [];
    const text = `${baseTitle} ${stripHtml(c.description)}`;
    if (!where.some((w) => containsPhrase(text, [w]))) return { ok: false, reason: "no location and the town is not mentioned" };
  }

  // Prefer: the place is the subject (its name is most of the title), confirmed
  // nearby by a geotag, and a sharp image.
  const titleWords = words(baseTitle).filter((w) => !STOP_WORDS.has(w) && !/^\d+$/.test(w));
  const focus = titleWords.length ? needed.length / titleWords.length : 0;
  const score =
    focus * 3 +
    (distance === null ? 0 : distance <= NEAR_KM ? 2 : 1) +
    Math.min(c.width / THUMB_WIDTH, 1.5);
  return { ok: true, score };
}

export function pickBest(place: Place, candidates: CommonsCandidate[]): { best: CommonsCandidate | null; rejected: { fileTitle: string; reason: string }[] } {
  let best: { c: CommonsCandidate; score: number } | null = null;
  const rejected: { fileTitle: string; reason: string }[] = [];
  for (const c of candidates) {
    const v = assess(place, c);
    if (!v.ok) {
      rejected.push({ fileTitle: c.fileTitle, reason: v.reason });
      continue;
    }
    if (!best || v.score > best.score) best = { c, score: v.score };
  }
  return { best: best?.c ?? null, rejected };
}

/** The line shown with the photograph, and the link to the licence and author. */
export function toPlaceImage(place: Place, c: CommonsCandidate): PlaceImage {
  const author = c.author.length > 60 ? `${c.author.slice(0, 57).trim()}…` : c.author;
  const credit = `Photo: ${author || "Wikimedia Commons"} · ${c.license.trim()}`;
  return {
    src: c.thumbUrl,
    alt: `A photograph of ${place.title}`,
    credit,
    sourceUrl: c.pageUrl,
    license: c.license.trim(),
  };
}

// ---------------------------------------------------------------- API shape

type ApiPage = {
  title?: string;
  imageinfo?: {
    width?: number;
    height?: number;
    mime?: string;
    thumburl?: string;
    thumbwidth?: number;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string } | undefined>;
  }[];
  coordinates?: { lat: number; lon: number }[];
};

/** Pure: the Commons API's `query.pages` as candidates. Files it could not describe are skipped. */
export function parseCommonsPages(json: unknown): CommonsCandidate[] {
  const pages = (json as { query?: { pages?: ApiPage[] } } | null)?.query?.pages;
  if (!Array.isArray(pages)) return [];
  const out: CommonsCandidate[] = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!p.title || !info?.thumburl || !info.width || !info.height || !info.descriptionurl) continue;
    const meta = info.extmetadata ?? {};
    const value = (key: string) => meta[key]?.value ?? "";
    const coords = p.coordinates?.[0];
    out.push({
      fileTitle: p.title,
      width: info.width,
      height: info.height,
      mime: info.mime ?? "",
      // Resized copies are announced from thumb.wikimedia.org; the same path is served by
      // upload.wikimedia.org, the one host we allow (next.config.ts, and the database check).
      thumbUrl: info.thumburl.replace(/\?.*$/, "").replace("//thumb.wikimedia.org/", "//upload.wikimedia.org/"),
      pageUrl: info.descriptionurl,
      license: stripHtml(value("LicenseShortName")),
      nonFree: /true|yes/i.test(value("NonFree")),
      restricted: stripHtml(value("Restrictions")).length > 0,
      author: stripHtml(value("Artist")),
      description: value("ImageDescription"),
      coords: coords ? { lat: coords.lat, lng: coords.lon } : null,
    });
  }
  return out;
}
