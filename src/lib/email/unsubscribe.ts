import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The link at the bottom of every plan and reminder email that switches that kind of email
 * off, without needing to sign in (a member should never have to remember a password to
 * stop an email).
 *
 * The link carries the member and the kind of email, signed with a secret only we hold, so
 * nobody can build a link that unsubscribes someone else. It does not expire: an
 * unsubscribe link in an old email must keep working.
 */

export type EmailKind = "weekly_plan" | "reminders";

/** The member_profiles column behind each kind. */
export const COLUMN_FOR_KIND: Record<EmailKind, "email_weekly_plan" | "email_reminders"> = {
  weekly_plan: "email_weekly_plan",
  reminders: "email_reminders",
};

/** What each kind is called, finishing the sentence "You are receiving this because...". */
export const KIND_LABEL: Record<EmailKind, { name: string; description: string }> = {
  weekly_plan: { name: "your weekly plan", description: "your weekly plan email" },
  reminders: { name: "occasional reminders", description: "the occasional reminder emails" },
};

const KINDS = new Set<string>(Object.keys(COLUMN_FOR_KIND));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The signing secret: its own setting if there is one, otherwise derived from the backend key (which is already secret and never sent anywhere). */
export function unsubscribeSecret(env: Record<string, string | undefined> = process.env): string | null {
  if (env.UNSUBSCRIBE_SECRET) return env.UNSUBSCRIBE_SECRET;
  if (env.SUPABASE_SERVICE_ROLE_KEY) return createHmac("sha256", env.SUPABASE_SERVICE_ROLE_KEY).update("your-next-chapter:unsubscribe:v1").digest("hex");
  return null;
}

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function signUnsubscribeToken(memberId: string, kind: EmailKind, secret: string): string {
  const payload = Buffer.from(`${memberId}.${kind}`).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/** The member and kind a token was made for, or null if it is not one of ours, has been altered, or is malformed. */
export function verifyUnsubscribeToken(token: string | null | undefined, secret: string): { memberId: string; kind: EmailKind } | null {
  if (!token) return null;
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length > 0) return null;

  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  const [memberId, kind, ...extra] = Buffer.from(payload, "base64url").toString("utf8").split(".");
  if (extra.length > 0 || !UUID.test(memberId ?? "") || !KINDS.has(kind ?? "")) return null;
  return { memberId, kind: kind as EmailKind };
}
