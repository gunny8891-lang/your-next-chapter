"use server";

import { createClient } from "@/utils/supabase/server";
import { recordAppEvent } from "@/lib/appEvents";

/**
 * Called by the screen that says "something didn't go to plan": records that a screen broke, with its reference only, so it
 * can be seen without reading server logs. Only for someone signed in, so it cannot be used to fill the table.
 */
export async function reportPageError(reference: string | null | undefined): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await recordAppEvent("page_error", reference);
  } catch {
    // Reporting a problem must never be a problem.
  }
}
