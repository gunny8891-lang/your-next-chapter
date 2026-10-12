import { after } from "next/server";

/**
 * Runs something once the response has gone, so a note, a record or a fetch never slows or breaks what the person asked for.
 * Outside a request (a test, a script) there is no "after the response", so it just runs, and whatever it does that fails is
 * swallowed: it is only ever a bonus.
 */
export function afterResponse(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void task().catch(() => undefined);
  }
}
