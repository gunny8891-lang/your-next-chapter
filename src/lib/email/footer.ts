import { OPERATOR } from "@/lib/legal/details";
import { KIND_LABEL, signUnsubscribeToken, unsubscribeSecret, type EmailKind } from "@/lib/email/unsubscribe";

/** What every plan and reminder email says at the bottom: why it was sent, how to stop it, and who we are. */
export type EmailFooter = {
  /** "You are receiving this because you have your weekly plan emailed to you." */
  reason: string;
  /** Page that asks "stop these?" and does it. */
  unsubscribeUrl: string | null;
  /** Account, where both choices can be changed any time. */
  preferencesUrl: string;
  privacyUrl: string;
  /** "Company Ltd, 1 Street, Town": only what has actually been supplied, never a placeholder. */
  senderLine: string | null;
};

export function senderLine(operator: { companyName: string | null; address: string | null } = OPERATOR): string | null {
  const parts = [operator.companyName, operator.address].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(", ") : null;
}

/** The page a member lands on from the link in an email, or (with the api path) the address mail programs call themselves to unsubscribe in one step. */
export function unsubscribeUrlFor(memberId: string, kind: EmailKind, siteUrl: string, secret: string | null = unsubscribeSecret(), path = "/unsubscribe"): string | null {
  if (!secret) return null;
  return `${siteUrl}${path}?token=${encodeURIComponent(signUnsubscribeToken(memberId, kind, secret))}`;
}

export function footerFor(memberId: string, kind: EmailKind, siteUrl: string): EmailFooter {
  return {
    reason: `You are receiving this because you have ${KIND_LABEL[kind].description} switched on.`,
    unsubscribeUrl: unsubscribeUrlFor(memberId, kind, siteUrl),
    preferencesUrl: `${siteUrl}/account#emails`,
    privacyUrl: `${siteUrl}/privacy`,
    senderLine: senderLine(),
  };
}
