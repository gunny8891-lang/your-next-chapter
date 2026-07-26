import { Resend } from "resend";
import { render } from "@react-email/render";
import { WeeklyDigestEmail, type DigestItem, type DigestSurprise } from "@/lib/email/WeeklyDigestEmail";

// Resend's shared test sender — works without domain verification, but only
// delivers to the email address the Resend account itself was signed up with.
// Swap for a verified custom domain address before sending to real members.
const FROM_ADDRESS = "Your Next Chapter <onboarding@resend.dev>";

export async function sendWeeklyDigestEmail(
  to: string,
  locationLabel: string,
  items: DigestItem[],
  surprise: DigestSurprise
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const resend = new Resend(apiKey);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const html = await render(
    <WeeklyDigestEmail locationLabel={locationLabel} items={items} surprise={surprise} siteUrl={siteUrl} />
  );

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: "Your Perfect Week is ready",
    html,
  });

  if (error) throw new Error(error.message);
  return data;
}
