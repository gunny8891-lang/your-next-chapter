import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";
import { defaultRecipients, defaultSend } from "@/lib/ai/operatorAlert";

/**
 * What a member writes in "Tell us what you think": kept, and emailed to whoever runs the app with the member's address as
 * the reply-to, so answering is just replying. Either is enough: if the table is not there yet it is still emailed, and if
 * the email cannot be sent it is still kept. It only counts as failed when neither worked.
 */

export const FEEDBACK_MAX_CHARS = 2000;
export const FEEDBACK_PER_DAY = 5;

/** The screens feedback can say it came from: a fixed list, so what is stored is never free text from the address. */
export const FEEDBACK_PAGES = ["Today", "My Week", "Explore", "My Chapter", "Account", "Concierge", "Somewhere else"] as const;
export type FeedbackPage = (typeof FEEDBACK_PAGES)[number];

export function cleanPage(raw: unknown): FeedbackPage {
  return (FEEDBACK_PAGES as readonly string[]).includes(String(raw)) ? (raw as FeedbackPage) : "Somewhere else";
}

/** The message tidied (no control characters, runs of blank lines shortened, trimmed), or null if there is nothing in it. */
export function cleanMessage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const tidy = raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, FEEDBACK_MAX_CHARS);
  return tidy.length > 0 ? tidy : null;
}

export type FeedbackOutcome = "sent" | "empty" | "too_many" | "failed";

export type FeedbackDeps = {
  admin?: SupabaseClient;
  now?: Date;
  recipients?: (admin: SupabaseClient) => Promise<string[]>;
  send?: (to: string[], message: { subject: string; text: string; html: string; replyTo?: string }) => Promise<void>;
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function feedbackEmail(page: FeedbackPage, message: string, memberEmail: string | null): { subject: string; text: string; html: string; replyTo?: string } {
  const from = memberEmail ? `From: ${memberEmail}` : "From: a member (no email address on file)";
  return {
    subject: `Lark Hour feedback: ${page}`,
    text: `${message}\n\n—\n${from}\nScreen: ${page}\n${memberEmail ? "You can reply to this email to answer them." : ""}`.trim(),
    html: `<p style="white-space:pre-wrap">${escapeHtml(message)}</p><hr><p style="color:#666">${escapeHtml(from)}<br>Screen: ${escapeHtml(page)}</p>`,
    ...(memberEmail ? { replyTo: memberEmail } : {}),
  };
}

export async function submitFeedback(
  input: { memberId: string; memberEmail: string | null; page: unknown; message: unknown },
  deps: FeedbackDeps = {}
): Promise<FeedbackOutcome> {
  const message = cleanMessage(input.message);
  if (!message) return "empty";
  const page = cleanPage(input.page);

  let admin: SupabaseClient;
  try {
    admin = deps.admin ?? createAdminClient();
  } catch {
    return "failed";
  }
  const now = deps.now ?? new Date();

  // A few a day is plenty for anyone; it is a note, not a chat. If the table is not there, there is no limit to apply.
  try {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin.from("member_feedback").select("id", { count: "exact", head: true }).eq("member_id", input.memberId).gte("created_at", since);
    if ((count ?? 0) >= FEEDBACK_PER_DAY) return "too_many";
  } catch {
    // no limit to apply
  }

  let kept = false;
  try {
    const { error } = await admin.from("member_feedback").insert({ member_id: input.memberId, page, message });
    kept = !error;
    if (error) console.warn("feedback: could not keep it:", error.message);
  } catch (err) {
    console.warn("feedback: could not keep it:", err instanceof Error ? err.message : err);
  }

  let emailed = false;
  try {
    const to = await (deps.recipients ?? defaultRecipients)(admin);
    if (to.length > 0) {
      await (deps.send ?? defaultSend)(to, feedbackEmail(page, message, input.memberEmail));
      emailed = true;
    } else {
      console.warn("feedback: nobody to email (set OPERATOR_ALERT_EMAIL, or have an admin account)");
    }
  } catch (err) {
    console.error("feedback: could not email it:", err instanceof Error ? err.message : err);
  }

  return kept || emailed ? "sent" : "failed";
}
