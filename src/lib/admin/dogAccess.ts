/**
 * What an admin may record about whether dogs can come to a place. The rule that matters: nothing is
 * recorded without something behind it. "Verified" needs a link to the page that says so (the place's own
 * site, the council's, the National Trust's), "reported" needs at least a note of where it was heard, and
 * "unknown" clears everything, so a place is never left saying "allowed" with no way to check. Pure.
 */

import { DOG_ACCESS, type DogAccess } from "@/lib/opportunities/facts";

export type DogAccessUpdate = {
  dog_access: DogAccess;
  dog_restrictions: string | null;
  dog_confidence: "verified" | "reported" | "unknown";
  dog_source: string | null;
};

export type ParsedDogAccess = { ok: true; update: DogAccessUpdate } | { ok: false; error: string };

const MAX_RESTRICTIONS = 120;
const MAX_SOURCE = 500;

const clean = (v: unknown): string =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

export function parseDogAccessForm(form: { get(name: string): unknown }): ParsedDogAccess {
  const access = clean(form.get("dog_access"));
  if (!(DOG_ACCESS as readonly string[]).includes(access)) return { ok: false, error: "Choose one of the dog access options." };

  if (access === "unknown") {
    return { ok: true, update: { dog_access: "unknown", dog_restrictions: null, dog_confidence: "unknown", dog_source: null } };
  }

  const confidence = clean(form.get("dog_confidence"));
  if (confidence !== "verified" && confidence !== "reported") return { ok: false, error: "Say whether this is verified or only reported." };

  const source = clean(form.get("dog_source")).slice(0, MAX_SOURCE);
  if (confidence === "verified" && !isHttpUrl(source)) return { ok: false, error: "Verified needs a link to the page that says so." };
  if (confidence === "reported" && source.length < 3) return { ok: false, error: "Say where this was heard, so it can be checked." };

  const restrictions = clean(form.get("dog_restrictions")).slice(0, MAX_RESTRICTIONS);
  return {
    ok: true,
    update: { dog_access: access as DogAccess, dog_restrictions: restrictions || null, dog_confidence: confidence, dog_source: source },
  };
}
