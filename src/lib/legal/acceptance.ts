import type { SupabaseClient } from "@supabase/supabase-js";
import { LEGAL_VERSION } from "@/lib/legal/details";

/**
 * Keeping the record that a member agreed to our terms and privacy notice, and which
 * version of each. Written by the backend only (the table has no member write access), at
 * the moment of sign-up, with the version of the wording the member was actually shown.
 */

export const ACCEPTED_DOCUMENTS = ["terms", "privacy"] as const;

/**
 * Whether a sign-up made a new account. When an address is already registered the sign-in
 * provider answers as if it had succeeded, to avoid revealing who has an account, but the
 * "user" it returns has no identities. The agreement must never be written against that
 * look-alike: it is not the person who just ticked the box.
 */
export function isNewAccount(user: { id?: string; identities?: unknown[] | null } | null | undefined): user is { id: string; identities: unknown[] } {
  return Boolean(user?.id) && Array.isArray(user?.identities) && user.identities.length > 0;
}

/** Records the agreement to both documents. Agreeing twice to the same version changes nothing. */
export async function recordAcceptance(
  admin: SupabaseClient,
  memberId: string,
  source: "signup" | "reaccept" = "signup",
  version: string = LEGAL_VERSION
): Promise<{ error: string | null }> {
  const rows = ACCEPTED_DOCUMENTS.map((document) => ({ member_id: memberId, document, version, source }));
  const { error } = await admin.from("legal_acceptances").upsert(rows, { onConflict: "member_id,document,version", ignoreDuplicates: true });
  return { error: error?.message ?? null };
}
