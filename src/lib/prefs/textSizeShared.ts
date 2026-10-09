/**
 * Text size is a choice for the person on this device, like turning up a phone's own text: it is kept in the browser and
 * needs nothing from the server. It works by making the body text sizes larger (the headings are already large), so
 * every screen follows it.
 */

export type TextSize = "normal" | "large" | "larger";

export const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "large", label: "Large" },
  { value: "larger", label: "Larger" },
];

export const TEXT_SIZE_KEY = "ync.textSize";
export const TEXT_SIZE_CHANGED = "ync-text-size-changed";

/** Anything stored that is not one of the three is treated as the usual size. */
export function parseTextSize(value: unknown): TextSize {
  return value === "large" || value === "larger" ? value : "normal";
}

/**
 * Runs in the page before it is first drawn, so a person who chose larger text never sees the page flash at the usual
 * size first. It does nothing at all (and never fails) if the browser will not let it read what was chosen.
 */
export const TEXT_SIZE_BOOT = `try{var s=localStorage.getItem(${JSON.stringify(TEXT_SIZE_KEY)});if(s==="large"||s==="larger")document.documentElement.dataset.textSize=s}catch(e){}`;
