import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";
import { defaultRecipients, defaultSend } from "@/lib/ai/operatorAlert";

/**
 * A note to whoever runs the app when someone registers, so a sign-up is seen the day it happens and a person who gets
 * stuck (the confirmation email did not arrive) is not found a week later. It goes to the same place as the alerts:
 * OPERATOR_ALERT_EMAIL, otherwise the admin accounts.
 *
 * It is internal: it names the address that registered and nothing else about them, and it is never sent to the person.
 * A best effort that never gets in the way of signing up. Turn it off with NOTIFY_ON_SIGNUP=false.
 */

export type SignupNoticeDeps = {
  admin?: SupabaseClient;
  now?: Date;
  recipients?: (admin: SupabaseClient) => Promise<string[]>;
  send?: (to: string[], message: { subject: string; text: string; html: string }) => Promise<void>;
  /** How many accounts there are, counting this one. Looked up when not given. */
  memberCount?: number | null;
};

export type SignupNoticeOutcome = "sent" | "off" | "no_recipient" | "failed";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The words of the note. Pure. */
export function signupMessage(email: string, memberCount: number | null, now: Date, siteUrl: string): { subject: string; text: string; html: string } {
  const when = now.toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "full", timeStyle: "short" });
  const number = memberCount && memberCount > 0 ? ` That makes ${memberCount} account${memberCount === 1 ? "" : "s"} in all.` : "";
  const members = `${siteUrl.replace(/\/$/, "")}/admin/members`;
  const text = [
    `Someone has just registered: ${email}`,
    "",
    `Registered ${when}.${number}`,
    "They have not confirmed their email yet. If they do not appear as having signed in within a day, the confirmation email may not have reached them: it is worth a look.",
    "",
    `Members: ${members}`,
  ].join("\n");
  const html = `<p>Someone has just registered: <strong>${escapeHtml(email)}</strong></p>
<p>Registered ${when}.${number}</p>
<p>They have not confirmed their email yet. If they do not appear as having signed in within a day, the confirmation email may not have reached them: it is worth a look.</p>
<p><a href="${members}">Members</a></p>`;
  return { subject: `Lark Hour: new sign-up (${email})`, text, html };
}

/** Tells the person running the app about a new registration. Never throws. */
export async function notifyNewSignup(email: string, deps: SignupNoticeDeps = {}): Promise<SignupNoticeOutcome> {
  if (/^(false|off|no|0)$/i.test(process.env.NOTIFY_ON_SIGNUP ?? "")) return "off";
  try {
    const admin = deps.admin ?? createAdminClient();
    const to = await (deps.recipients ?? defaultRecipients)(admin);
    if (to.length === 0) {
      console.warn("signup notice: nobody to tell (set OPERATOR_ALERT_EMAIL, or have an admin account)");
      return "no_recipient";
    }
    let count = deps.memberCount;
    if (count === undefined) {
      const { count: found } = await admin.from("users").select("id", { count: "exact", head: true });
      count = found ?? null;
    }
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.larkhour.com";
    await (deps.send ?? defaultSend)(to, signupMessage(email, count ?? null, deps.now ?? new Date(), siteUrl));
    return "sent";
  } catch (err) {
    console.error("signup notice failed:", err instanceof Error ? err.message : err);
    return "failed";
  }
}
