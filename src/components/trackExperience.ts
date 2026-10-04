import { recordSeenAction } from "@/app/today/experienceActions";
import type { Surface } from "@/lib/experience/events";

/**
 * Tells the server what is on screen ("shown") and what was opened. Only the browser
 * can know these two. They are batched and de-duplicated, so a card re-rendering, or
 * the same idea appearing in the sheet and on Explore in one visit, is one note, not
 * many. Failures are ignored: a note about what was on screen is never worth an error.
 */
type Pending = { type: "shown" | "opened"; activityId: string; surface: Surface; who?: string };

const sentThisVisit = new Set<string>();
let queue: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

const FLUSH_AFTER_MS = 800;

function flush() {
  timer = null;
  const batch = queue;
  queue = [];
  if (batch.length === 0) return;
  void recordSeenAction(batch).catch(() => {});
}

export function trackSeen(type: Pending["type"], activityId: string, surface: Surface, who?: string) {
  const key = `${type}:${activityId}:${surface}`;
  if (sentThisVisit.has(key)) return;
  sentThisVisit.add(key);
  queue.push({ type, activityId, surface, who });
  if (!timer) timer = setTimeout(flush, FLUSH_AFTER_MS);
}
