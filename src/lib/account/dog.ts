/**
 * What the Account form says about the member's dog, in the shape the profile stores. Optional all
 * through: nobody has to say anything about a dog, and a name or "usually comes" with no dog is
 * ignored rather than kept (so unticking "I have a dog" really does forget the rest).
 */

const MAX_NAME_CHARS = 60;

/** A name as typed: control characters removed, spaces tidied, at most 60 characters; null when nothing is left. */
export function cleanDogName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_CHARS).trim();
  return name || null;
}

export type DogFields = { has_dog: boolean; dog_name: string | null; dog_usually_comes: boolean };

export function dogFromForm(form: { get(name: string): unknown }): DogFields {
  const hasDog = form.get("has_dog") === "on";
  if (!hasDog) return { has_dog: false, dog_name: null, dog_usually_comes: false };
  return { has_dog: true, dog_name: cleanDogName(form.get("dog_name")), dog_usually_comes: form.get("dog_usually_comes") === "on" };
}
