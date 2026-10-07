/**
 * The catalogue's tags came from several sources, and the same idea arrives spelled differently:
 * "National Trust", "national trust" and "national_trust"; "garden" and "gardens"; "walk" and
 * "walking". Every rule that asks "is this a walk?" by tag then quietly misses some of them. This
 * puts tags into one vocabulary when they are read (so the existing rows are fixed without
 * rewriting them) and when they are written (so new ones arrive clean).
 *
 * Deliberately small: lower case, underscores to spaces, a short list of aliases, and a few
 * things that are plainly implied (a nature trail is a walk; a park is outdoors). It never
 * guesses anything about a place that its tags did not already say, and says nothing about dogs.
 */

/** Keyed by how a tag reads with hyphens and underscores as spaces, so every spelling of it finds the same entry. */
const ALIASES: Record<string, string> = {
  garden: "gardens",
  walk: "walking",
  talks: "talk",
  "day trip": "day-trip",
  "national trust": "national-trust",
  "tai chi": "tai-chi",
};

/** Tags that, when present, also mean another tag is true. */
const IMPLIES: Record<string, string[]> = {
  "nature walk": ["walking", "nature"],
  "nature trail": ["walking", "nature"],
  "guided walk": ["walking"],
  park: ["outdoors"],
  parkland: ["outdoors", "park"],
};

function canonical(tag: string): string {
  const lower = tag.trim().toLowerCase();
  // Underscores become spaces ("nature_walk" reads like "nature walk"); existing hyphens are left as they are.
  return ALIASES[lower.replace(/[-_]/g, " ")] ?? lower.replace(/_/g, " ");
}

/** Pure: the tags in one vocabulary, each once, in their original order (implied tags follow the tag that implies them). */
export function normaliseTags(tags: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  const add = (tag: string) => {
    if (tag && !out.includes(tag)) out.push(tag);
  };
  for (const raw of tags ?? []) {
    if (typeof raw !== "string") continue;
    const tag = canonical(raw);
    add(tag);
    for (const implied of IMPLIES[tag] ?? []) add(implied);
  }
  return out;
}
