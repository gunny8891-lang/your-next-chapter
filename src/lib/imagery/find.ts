import { parseCommonsPages, pickBest, THUMB_WIDTH, toPlaceImage, type CommonsCandidate, type Place } from "@/lib/imagery/commons";
import type { PlaceImage } from "@/lib/imagery/types";

const API = "https://commons.wikimedia.org/w/api.php";
// Wikimedia asks every client to say who it is and how to reach them.
const USER_AGENT = "LarkHour/1.0 (https://your-next-chapter-orcin.vercel.app; contact: hello@larkhour.com)";
const REQUEST_TIMEOUT_MS = 8000;
/** A place's photo is searched for within this radius of it, in metres. */
const GEO_RADIUS_M = 400;

const FILE_PROPS = {
  prop: "imageinfo|coordinates",
  iiprop: "url|size|mime|extmetadata",
  iiurlwidth: String(THUMB_WIDTH),
  iiextmetadatafilter: "LicenseShortName|Artist|ImageDescription|NonFree|Restrictions",
  colimit: "max",
};

export type FetchJson = (url: string) => Promise<unknown>;

export const defaultFetchJson: FetchJson = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Wikimedia Commons answered ${res.status}`);
  return res.json();
};

function apiUrl(params: Record<string, string>): string {
  const query = new URLSearchParams({ action: "query", format: "json", formatversion: "2", ...params });
  return `${API}?${query.toString()}`;
}

/** The API reports "too busy" in the body of a 200: that is a reason to try again later, not an answer. */
function assertAnswer(json: unknown): unknown {
  const error = (json as { error?: { code?: string; info?: string } } | null)?.error;
  if (error) throw new Error(`Wikimedia Commons: ${error.code ?? error.info ?? "error"}`);
  return json;
}

export type FindResult =
  | { status: "found"; image: PlaceImage; fileTitle: string }
  /** Searched properly and nothing qualified. Worth remembering, so we do not ask again tomorrow. */
  | { status: "none"; rejected: { fileTitle: string; reason: string }[] }
  /** Could not search (busy, offline). Says nothing about the place: try again later. */
  | { status: "error"; error: string };

/**
 * Looks for a photograph of a place on Wikimedia Commons: files named for it,
 * and files geotagged close to it, judged by the same strict rules (commons.ts).
 */
export async function findPlaceImage(place: Place, fetchJson: FetchJson = defaultFetchJson): Promise<FindResult> {
  try {
    const [byName, byPlace] = await Promise.all([
      fetchJson(
        apiUrl({ generator: "search", gsrsearch: place.title, gsrnamespace: "6", gsrlimit: "15", ...FILE_PROPS })
      ).then(assertAnswer),
      fetchJson(
        apiUrl({
          generator: "geosearch",
          ggscoord: `${place.lat}|${place.lng}`,
          ggsradius: String(GEO_RADIUS_M),
          ggsnamespace: "6",
          ggslimit: "30",
          ...FILE_PROPS,
        })
      ).then(assertAnswer),
    ]);

    const seen = new Set<string>();
    const candidates: CommonsCandidate[] = [];
    for (const c of [...parseCommonsPages(byName), ...parseCommonsPages(byPlace)]) {
      if (seen.has(c.fileTitle)) continue;
      seen.add(c.fileTitle);
      candidates.push(c);
    }

    const { best, rejected } = pickBest(place, candidates);
    if (!best) return { status: "none", rejected };
    return { status: "found", image: toPlaceImage(place, best), fileTitle: best.fileTitle };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
