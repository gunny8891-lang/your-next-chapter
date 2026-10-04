import { after } from "next/server";
import { enrichImagesFor } from "@/lib/imagery/store";
import { createAdminClient } from "@/utils/supabase/admin";
import type { TimeOption } from "@/lib/someTime/types";

/**
 * After the response has gone, looks for photographs of the places just shown
 * that have none of their own (a generic picture does not count), so the next time they appear they have one. Never delays or
 * fails the response: this is a bonus, and any problem is only logged. Only for
 * request handlers (Server Actions, pages): `after` needs a request to hang on.
 */
export function scheduleImageLookups(options: TimeOption[]): void {
  const ids = options
    .flatMap((o) => (o.image && !o.image.generic ? [] : [o.id, ...(o.foodStop ? [o.foodStop.id] : [])]))
    .filter((id, i, all) => all.indexOf(id) === i);
  if (ids.length === 0) return;
  try {
    after(async () => {
      try {
        const summary = await enrichImagesFor(createAdminClient(), ids.slice(0, 6));
        if (summary.found > 0 || summary.errors > 0) console.log("imagery: after-response lookups", summary);
      } catch (err) {
        console.warn("imagery: after-response lookups failed:", err instanceof Error ? err.message : err);
      }
    });
  } catch (err) {
    console.warn("imagery: could not schedule lookups:", err instanceof Error ? err.message : err);
  }
}
