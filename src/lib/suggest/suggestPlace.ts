import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryName } from "@/lib/categories";
import type { RawActivityCandidate } from "@/lib/discovery/types";
import { persistDiscovery } from "@/lib/discovery/run";
import { isDuplicate, loadExisting } from "@/lib/discovery/sources/openStreetMap";
import { geocodeLocation, type Coordinates } from "@/lib/geo/geocode";
import { submitFeedback, type FeedbackDeps } from "@/lib/feedbackSubmit";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Members telling us about somewhere good that is not in the app: a café, a club, a coffee morning, a class. It is how the
 * catalogue grows from the people who live in each place, for everyone after them.
 *
 * What a member writes is never shown to anyone as it stands. It goes in as an entry waiting for a person to check (the same
 * review the searches' uncertain finds wait in), with a note saying who it came from only as "a member", and it is also sent to
 * whoever runs the app as a message so it is noticed. Once it is checked and approved it is an ordinary entry that every member
 * near it can be offered.
 */

export const SUGGEST_KINDS: { value: string; label: string; category: CategoryName; tags: string[] }[] = [
  { value: "place", label: "A place to visit", category: "Explore", tags: [] },
  { value: "group", label: "A group or club", category: "Connect", tags: ["social"] },
  { value: "event", label: "A one-off event", category: "Joy", tags: [] },
  { value: "class", label: "A class or course", category: "Learn", tags: ["classes"] },
  { value: "other", label: "Something else", category: "Joy", tags: [] },
];

export type Suggestion = { name: string; kind: string; where: string; when: string | null; link: string | null; notes: string | null };

const MAX = { name: 100, where: 200, when: 120, link: 300, notes: 500 };
const tidy = (raw: unknown, max: number): string => (typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** A link worth keeping: a web address. Anything else is dropped rather than shown to people. */
function cleanLink(raw: unknown): string | null {
  const text = tidy(raw, MAX.link);
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".") ? url.toString() : null;
  } catch {
    return null;
  }
}

/** What arrived from the form, tidied; null when it has no name, no kind that exists, or no say of where. */
export function cleanSuggestion(raw: unknown): Suggestion | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const name = tidy(r.name, MAX.name);
  const where = tidy(r.where, MAX.where);
  const kind = SUGGEST_KINDS.find((k) => k.value === r.kind)?.value;
  if (name.length < 2 || where.length < 3 || !kind) return null;
  return { name, kind, where, when: tidy(r.when, MAX.when) || null, link: cleanLink(r.link), notes: tidy(r.notes, MAX.notes) || null };
}

/** The note to whoever runs the app. */
export function suggestionMessage(s: Suggestion): string {
  const kind = SUGGEST_KINDS.find((k) => k.value === s.kind)?.label ?? s.kind;
  return [`Suggested: ${s.name} (${kind})`, `Where: ${s.where}`, s.when ? `When: ${s.when}` : null, s.link ? `Link: ${s.link}` : null, s.notes ? `Notes: ${s.notes}` : null]
    .filter((l): l is string => l !== null)
    .join("\n");
}

/** The entry waiting to be checked. Never auto-activated: its link is not verified, and nobody has looked at it. */
export function suggestionCandidate(s: Suggestion, coords: Coordinates | null): RawActivityCandidate {
  const kind = SUGGEST_KINDS.find((k) => k.value === s.kind) ?? SUGGEST_KINDS[SUGGEST_KINDS.length - 1];
  const description = [`${kind.label}, suggested by a member and not yet checked.`, s.when ? `When: ${s.when}.` : null, s.notes ? s.notes : null].filter(Boolean).join(" ");
  return {
    title: s.name,
    description,
    category: kind.category,
    address: s.where,
    locationLat: coords?.lat ?? null,
    locationLng: coords?.lng ?? null,
    dateTime: null,
    priceEstimate: null,
    // Something to point at until it is checked: their link, or a map search for the name and the place.
    bookingUrl: s.link ?? `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: `${s.name} ${s.where}` }).toString()}`,
    bookingUrlVerified: false,
    tags: ["member-suggested", ...kind.tags],
    status: "needs_review",
    adminNotes: "Suggested by a member. Not checked: confirm it exists and is open to the public, when it is on and where, and what it costs, then approve. Everything in the description was written by the member.",
  };
}

export type SuggestOutcome = "added" | "already_have" | "invalid" | "too_many" | "failed";

export type SuggestDeps = FeedbackDeps & {
  geocode?: (query: string) => Promise<Coordinates | null>;
  persist?: typeof persistDiscovery;
  existing?: (admin: SupabaseClient, centre: Coordinates) => Promise<{ title: string; location_lat: number | null; location_lng: number | null }[]>;
};

export async function submitSuggestion(input: { memberId: string; memberEmail: string | null; raw: unknown }, deps: SuggestDeps = {}): Promise<SuggestOutcome> {
  const suggestion = cleanSuggestion(input.raw);
  if (!suggestion) return "invalid";

  // The note to whoever runs the app goes first: it holds the few-a-day limit, and it means a suggestion is noticed even if
  // the rest cannot be done.
  const sent = await submitFeedback({ memberId: input.memberId, memberEmail: input.memberEmail, page: "Suggest a place", message: suggestionMessage(suggestion) }, deps);
  if (sent === "too_many") return "too_many";
  if (sent === "empty") return "invalid";

  try {
    const admin = deps.admin ?? createAdminClient();
    const coords = await (deps.geocode ?? geocodeLocation)(suggestion.where).catch(() => null);
    // Already in the catalogue under the same name, close by: nothing to add, and they are thanked all the same.
    if (coords) {
      const existing = await (deps.existing ?? ((a, c) => loadExisting(a, c)))(admin, coords);
      if (isDuplicate(suggestion.name, coords, existing)) return "already_have";
    }
    const { results } = await (deps.persist ?? persistDiscovery)(admin, [{ name: "member-suggestion", fetchCandidates: async () => [suggestionCandidate(suggestion, coords)] }]);
    const result = results[0];
    if (result.errors.length > 0) return sent === "sent" ? "added" : "failed";
    // The same link already in the catalogue is the same place.
    return result.inserted > 0 ? "added" : "already_have";
  } catch (err) {
    console.warn("suggest: could not add it:", err instanceof Error ? err.message : err);
    // It was still sent to whoever runs the app, who can add it by hand.
    return sent === "sent" ? "added" : "failed";
  }
}
