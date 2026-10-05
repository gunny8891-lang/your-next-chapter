import { Resend } from "resend";
import { render } from "@react-email/render";
import { WeeklyDigestEmail, type DigestItem, type DigestSurprise } from "@/lib/email/WeeklyDigestEmail";
import { NudgeEmail, type NudgeActivity } from "@/lib/email/NudgeEmail";
import { footerFor, unsubscribeUrlFor } from "@/lib/email/footer";
import type { EmailKind } from "@/lib/email/unsubscribe";
import { OPERATOR } from "@/lib/legal/details";

// Resend's shared test sender works without domain verification, but only delivers to the
// address the Resend account itself was opened with. Once the company's domain is verified
// there, set EMAIL_FROM (for example: Your Next Chapter <hello@yourdomain.co.uk>) and every
// email switches to it with no code change.
const TEST_SENDER = "Your Next Chapter <onboarding@resend.dev>";

export function senderSettings(env: Record<string, string | undefined> = process.env): { from: string; replyTo: string | undefined } {
  return {
    from: env.EMAIL_FROM || TEST_SENDER,
    // Replies go to a real person: the setting if there is one, otherwise the company's contact address once it is known.
    replyTo: env.EMAIL_REPLY_TO || OPERATOR.contactEmail || undefined,
  };
}

/** Every plan and reminder email carries the headers mail programs use to offer their own "Unsubscribe" button. */
export function unsubscribeHeaders(memberId: string, kind: EmailKind, siteUrl: string): Record<string, string> {
  const oneClick = unsubscribeUrlFor(memberId, kind, siteUrl, undefined, "/api/email/unsubscribe");
  if (!oneClick) return {};
  return { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

async function deliver(client: Resend, to: string, memberId: string, kind: EmailKind, siteUrl: string, subject: string, html: string) {
  const { from, replyTo } = senderSettings();
  const { data, error } = await client.emails.send({
    from,
    to,
    subject,
    html,
    ...(replyTo ? { replyTo } : {}),
    headers: unsubscribeHeaders(memberId, kind, siteUrl),
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function sendWeeklyDigestEmail(
  to: string,
  memberId: string,
  locationLabel: string,
  items: DigestItem[],
  surprise: DigestSurprise
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const resend = new Resend(apiKey);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const html = await render(
    <WeeklyDigestEmail locationLabel={locationLabel} items={items} surprise={surprise} siteUrl={siteUrl} footer={footerFor(memberId, "weekly_plan", siteUrl)} />
  );
  return deliver(resend, to, memberId, "weekly_plan", siteUrl, "Your Perfect Week is ready", html);
}

export async function sendNudgeEmail(to: string, memberId: string, message: string, activity: NudgeActivity) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const resend = new Resend(apiKey);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const html = await render(<NudgeEmail message={message} activity={activity} siteUrl={siteUrl} footer={footerFor(memberId, "reminders", siteUrl)} />);
  return deliver(resend, to, memberId, "reminders", siteUrl, "A thought for today", html);
}
