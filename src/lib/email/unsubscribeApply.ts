import type { SupabaseClient } from "@supabase/supabase-js";
import { COLUMN_FOR_KIND, verifyUnsubscribeToken, unsubscribeSecret, type EmailKind } from "@/lib/email/unsubscribe";

/** Switches one kind of email off for one member. Used by the confirm page and by the one-step call mail programs make. */
export async function applyUnsubscribe(admin: SupabaseClient, memberId: string, kind: EmailKind): Promise<boolean> {
  const { error } = await admin
    .from("member_profiles")
    .update({ [COLUMN_FOR_KIND[kind]]: false })
    .eq("user_id", memberId);
  return !error;
}

/** The member and kind a link is for, checked against our secret; null when the link is not genuine. */
export function readUnsubscribeLink(token: string | null | undefined): { memberId: string; kind: EmailKind } | null {
  const secret = unsubscribeSecret();
  return secret ? verifyUnsubscribeToken(token, secret) : null;
}
