"use client";

import { useSyncExternalStore } from "react";
import { parseTextSize, TEXT_SIZE_CHANGED, TEXT_SIZE_KEY, type TextSize } from "@/lib/prefs/textSizeShared";

let inMemory: TextSize | null = null;

function readSize(): TextSize {
  try {
    return parseTextSize(window.localStorage.getItem(TEXT_SIZE_KEY));
  } catch {
    // Storage blocked: the choice lasts until the page is closed.
    return inMemory ?? "normal";
  }
}

/** Applies the choice to the page straight away and keeps it for next time. */
export function setTextSize(size: TextSize): void {
  inMemory = size;
  try {
    if (size === "normal") window.localStorage.removeItem(TEXT_SIZE_KEY);
    else window.localStorage.setItem(TEXT_SIZE_KEY, size);
  } catch {
    /* the in-memory choice stands for this visit */
  }
  if (size === "normal") delete document.documentElement.dataset.textSize;
  else document.documentElement.dataset.textSize = size;
  window.dispatchEvent(new Event(TEXT_SIZE_CHANGED));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(TEXT_SIZE_CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(TEXT_SIZE_CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The size this device is set to. The server draws the usual size, then this settles on the real answer. */
export function useTextSize(): TextSize {
  return useSyncExternalStore(subscribe, readSize, () => "normal");
}
