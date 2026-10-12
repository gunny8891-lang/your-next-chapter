import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * A short, anonymous record that something went wrong, so that problems can be seen without reading server logs: a sign-up
 * that could not be completed, a login refused, a confirmation email that could not be sent, a screen that broke.
 *
 * It holds a kind and a short code of our own, and nothing else: no email address, no name, no member, and never the
 * provider's own words (which can contain an address). Best effort: it never throws, and when the table is not there yet
 * the problem simply is not recorded.
 */

export type AppEventKind = "signup_failed" | "login_failed" | "resend_failed" | "reset_failed" | "page_error";

/** How long they are kept. */
export const APP_EVENT_KEEP_DAYS = 90;

/** Only letters, digits, dashes and underscores, and short: a code, never a sentence that could hold a person's details. */
export function cleanCode(code: string | null | undefined): string {
  const cleaned = (code ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
  return cleaned || "unknown";
}

export async function recordAppEvent(kind: AppEventKind, code: string | null | undefined, deps: { admin?: SupabaseClient } = {}): Promise<boolean> {
  try {
    const admin = deps.admin ?? createAdminClient();
    const { error } = await admin.from("app_events").insert({ kind, code: cleanCode(code) });
    return !error;
  } catch {
    return false;
  }
}

/** Removes records older than the keeping period. Best effort. Returns how many went, or null if it could not be done. */
export async function purgeOldAppEvents(admin: SupabaseClient, now: Date = new Date()): Promise<number | null> {
  try {
    const cutoff = new Date(now.getTime() - APP_EVENT_KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin.from("app_events").delete().lt("created_at", cutoff).select("id");
    return error ? null : (data ?? []).length;
  } catch {
    return null;
  }
}
