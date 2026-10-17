import { timingSafeEqual } from "node:crypto";

/**
 * Whether a request to a scheduled job carries the secret. The jobs use the service role and can spend money (paid searches, a
 * re-plan of every member, email to everyone), so this must never let a request in by accident: a secret that is not set
 * (a preview deployment, a rotation that went wrong) means nothing is let in, rather than the text "Bearer undefined" being
 * a valid password. The comparison takes the same time however much of it is right.
 */
export function isCronRequest(request: Request, secret: string | undefined = process.env.CRON_SECRET): boolean {
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
