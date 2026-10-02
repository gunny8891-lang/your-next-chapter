// Pure decision rules for when a location is worth another Discovery Agent web
// search (~$1 each). No I/O here so the rules can be checked exhaustively.

/** A region that keeps yielding new activities is re-searched this often. */
export const BASE_REFRESH_DAYS = 7;
/** Each consecutive search that finds nothing new doubles the wait, up to 2 doublings: 7 -> 14 -> 28 days. */
export const MAX_BACKOFF_DOUBLINGS = 2;
/** After a failed (or killed) search: wait 1, 2, 4, then 7 days between retries. */
export const MAX_FAILURE_RETRY_DAYS = 7;
/** A search that was claimed this recently is treated as still running (or just finished). */
export const IN_FLIGHT_MINUTES = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

export type RegionState = {
  region_key: string;
  region_label: string;
  last_attempt_at: string;
  last_success_at: string | null;
  empty_runs: number;
  consecutive_failures: number;
};

export type SearchDecision =
  | { due: true; reason: "never_searched" | "refresh_due" | "retry_after_failure" }
  | { due: false; reason: "just_attempted" | "recently_searched" | "backing_off_after_failure" };

/** Same place, different casing/spacing/"Near " prefix -> same key. */
export function normalizeRegionKey(label: string): string {
  return label.trim().replace(/^near\s+/i, "").replace(/\s+/g, " ").toLowerCase();
}

export function decideSearch(state: RegionState | undefined, now: Date): SearchDecision {
  if (!state) return { due: true, reason: "never_searched" };

  const sinceAttempt = now.getTime() - new Date(state.last_attempt_at).getTime();
  if (sinceAttempt < IN_FLIGHT_MINUTES * 60 * 1000) return { due: false, reason: "just_attempted" };

  // consecutive_failures is bumped when a search is claimed and cleared on
  // success, so >0 means the last attempt never completed — whether it errored
  // or the function was killed before it could record anything.
  if (state.consecutive_failures > 0) {
    const waitDays = Math.min(2 ** (state.consecutive_failures - 1), MAX_FAILURE_RETRY_DAYS);
    return sinceAttempt >= waitDays * DAY_MS
      ? { due: true, reason: "retry_after_failure" }
      : { due: false, reason: "backing_off_after_failure" };
  }

  const lastSuccess = state.last_success_at ? new Date(state.last_success_at).getTime() : 0;
  const intervalDays = BASE_REFRESH_DAYS * 2 ** Math.min(state.empty_runs, MAX_BACKOFF_DOUBLINGS);
  return now.getTime() - lastSuccess >= intervalDays * DAY_MS
    ? { due: true, reason: "refresh_due" }
    : { due: false, reason: "recently_searched" };
}
