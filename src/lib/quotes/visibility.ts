"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether this device shows the daily quotation on Today. It is a preference of the person on this device, not an
 * account setting, so it lives in the browser and needs nothing from the server. Storage can be unavailable (private
 * windows, blocked site data): then the quotation is simply shown, and choosing to hide it lasts until the page is
 * closed. Shared between Today (a quiet "Hide") and Account (a tick box) so they always agree.
 */

const KEY = "ync.dailyQuote.hidden";
const CHANGED = "ync-daily-quote-changed";

let hiddenInMemory = false;

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1" || hiddenInMemory;
  } catch {
    return hiddenInMemory;
  }
}

export function setDailyQuoteVisible(visible: boolean): void {
  hiddenInMemory = !visible;
  try {
    if (visible) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, "1");
  } catch {
    /* the in-memory choice stands for this visit */
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Visible unless the person has hidden it. The server always renders it visible, then this settles on the real answer. */
export function useDailyQuoteVisible(): boolean {
  return useSyncExternalStore(subscribe, () => !readHidden(), () => true);
}
