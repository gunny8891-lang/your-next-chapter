/**
 * The place a member says they live: "Barnet", "St Albans, Hertfordshire", "EN5 5XY". This text is looked up on a map and is
 * also put into the instructions of the paid web search for their area, so it must be a place name and nothing else: short,
 * no punctuation that carries an instruction or a web address, no line breaks. Anything else is not kept.
 */

export const MAX_LOCATION_CHARS = 80;

// Letters (any language), digits, spaces, and the few marks a place name uses: comma, full stop, apostrophe, hyphen, ampersand, brackets.
const PLACE_TEXT = /^[\p{L}\p{N} ,.'’&()-]+$/u;

/** The tidied place text, or null when it is empty or is not just a place name. Pure. */
export function cleanLocationText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length > MAX_LOCATION_CHARS) return null;
  return PLACE_TEXT.test(text) ? text : null;
}
