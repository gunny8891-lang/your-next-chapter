/**
 * What OpenStreetMap's own `dog` tag says about a place, in our terms. Contributors add this tag by hand and
 * it is often missing, so most places will have nothing here, and that is correct: a place without the tag is
 * "unknown", never "no" and never "yes". When there is a tag it is kept as something REPORTED by contributors
 * (not verified by us), with the link to the entry it came from, so anyone can check it.
 *
 * Values follow the OpenStreetMap wiki for `dog`: yes, no, leashed, unleashed, outside; anything else is ignored.
 */

import type { DogAccess, DogConfidence } from "@/lib/opportunities/facts";

export type DogFactsFromSource = {
  access: DogAccess;
  restrictions: string | null;
  confidence: DogConfidence;
  /** Where it came from, for anyone who wants to check: a link or a short description. */
  source: string;
};

export function dogFactsFromOsm(extratags: Record<string, string> | undefined, osmUrl: string): DogFactsFromSource | null {
  const raw = extratags?.dog?.trim().toLowerCase();
  if (!raw) return null;
  const source = `OpenStreetMap contributors (dog=${raw}): ${osmUrl}`;
  switch (raw) {
    case "yes":
    case "designated":
      return { access: "allowed", restrictions: null, confidence: "reported", source };
    case "leashed":
      return { access: "allowed", restrictions: "on a lead", confidence: "reported", source };
    case "unleashed":
      return { access: "allowed", restrictions: "off the lead is allowed", confidence: "reported", source };
    case "outside":
      return { access: "outdoor_only", restrictions: null, confidence: "reported", source };
    case "no":
      return { access: "not_allowed", restrictions: null, confidence: "reported", source };
    default:
      return null;
  }
}
