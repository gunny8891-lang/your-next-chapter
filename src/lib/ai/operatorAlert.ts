import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { createAdminClient } from "@/utils/supabase/admin";
import { needsOperator, operatorAlert, type AiFailureKind } from "@/lib/ai/unavailable";
import { senderSettings } from "@/lib/email/send";

/**
 * Telling the person who runs the app when the AI has stopped working for a reason only they can fix: the account is out of
 * credit, or the key was rejected. Every AI feature fails at once when this happens, and the server log and the running-costs
 * page are only seen by someone who goes looking. One email, at most one a day for each kind of problem, says it plainly and
 * links to the page.
 *
 * It is a best effort and never gets in the way of the call it is reporting on: whatever goes wrong in here is swallowed.
 */

/** The usage log row that records that an alert was sent, so the next failure within the day does not send another. */
export const ALERT_FEATURE = "operator_alert";
export const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type AlertOutcome = "sent" | "recent" | "not_needed" | "no_recipient" | "failed";

export type AlertDeps = {
  admin?: SupabaseClient;
  now?: Date;
  /** Who to tell. By default the address in OPERATOR_ALERT_EMAIL, otherwise the app's admins. */
  recipients?: (admin: SupabaseClient) => Promise<string[]>;
  send?: (to: string[], message: { subject: string; text: string; html: string }) => Promise<void>;
};

/** The words of the email. Plain, and says what to do first. */
export function alertMessage(kind: AiFailureKind, now: Date, siteUrl: string): { subject: string; text: string; html: string } {
  const what = operatorAlert(kind);
  const subject = kind === "out_of_credit" ? "Lark Hour: the AI is out of credit" : "Lark Hour: the AI key was rejected";
  const when = now.toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "full", timeStyle: "short" });
  const costs = `${siteUrl.replace(/\/$/, "")}/admin/ai-costs`;
  const text = [
    what,
    "",
    "Until this is fixed, chat, \"I've got some time\" ideas and weekly plans will not work for anyone, and the nightly search for new places will not run.",
    `First seen: ${when}.`,
    "",
    `Running costs and recent failures: ${costs}`,
    "",
    "You will not be emailed about this again for 24 hours.",
  ].join("\n");
  const html = `<p>${what.replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>
<p>Until this is fixed, chat, &ldquo;I&rsquo;ve got some time&rdquo; ideas and weekly plans will not work for anyone, and the nightly search for new places will not run.</p>
<p>First seen: ${when}.</p>
<p><a href="${costs}">Running costs and recent failures</a></p>
<p style="color:#666">You will not be emailed about this again for 24 hours.</p>`;
  return { subject, text, html };
}

async function defaultRecipients(admin: SupabaseClient): Promise<string[]> {
  const fromSetting = (process.env.OPERATOR_ALERT_EMAIL ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  if (fromSetting.length > 0) return fromSetting;

  const { data } = await admin.from("users").select("id").eq("role", "admin");
  const addresses: string[] = [];
  for (const row of data ?? []) {
    const { data: found } = await admin.auth.admin.getUserById(row.id as string);
    if (found.user?.email) addresses.push(found.user.email);
  }
  return addresses;
}

async function defaultSend(to: string[], message: { subject: string; text: string; html: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const { from } = senderSettings();
  const { error } = await new Resend(apiKey).emails.send({ from, to, subject: message.subject, text: message.text, html: message.html });
  if (error) throw new Error(error.message);
}

/** Emails the person running the app about a failure only they can fix, at most once a day for each kind. Never throws. */
export async function maybeAlertOperator(kind: AiFailureKind, deps: AlertDeps = {}): Promise<AlertOutcome> {
  if (!needsOperator(kind)) return "not_needed";
  try {
    const admin = deps.admin ?? createAdminClient();
    const now = deps.now ?? new Date();
    const since = new Date(now.getTime() - ALERT_COOLDOWN_MS).toISOString();

    const { data: recent } = await admin
      .from("ai_usage_logs")
      .select("id")
      .eq("feature", ALERT_FEATURE)
      .like("error_message", `${kind}%`)
      .gte("created_at", since)
      .limit(1);
    if ((recent ?? []).length > 0) return "recent";

    const to = await (deps.recipients ?? defaultRecipients)(admin);
    if (to.length === 0) {
      console.warn("operator alert: nobody to tell (set OPERATOR_ALERT_EMAIL, or have an admin account)");
      return "no_recipient";
    }

    // Record it before sending, so a second failure a moment later (there are often several at once) finds it.
    const { data: claim, error: claimError } = await admin
      .from("ai_usage_logs")
      .insert({ user_id: null, feature: ALERT_FEATURE, model: "none", input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, estimated_cost: 0, latency_ms: 0, success: true, error_message: kind })
      .select("id")
      .single();
    if (claimError || !claim) return "failed";
    // If two failures claimed at once, only the earliest sends.
    const { data: earliest } = await admin.from("ai_usage_logs").select("id").eq("feature", ALERT_FEATURE).like("error_message", `${kind}%`).gte("created_at", since).order("created_at", { ascending: true }).limit(1);
    if (earliest?.[0] && earliest[0].id !== claim.id) return "recent";

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.larkhour.com";
    try {
      await (deps.send ?? defaultSend)(to, alertMessage(kind, now, siteUrl));
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown";
      console.error("operator alert: could not send the email:", reason);
      await admin.from("ai_usage_logs").update({ success: false, error_message: `${kind}: not sent: ${reason}`.slice(0, 300) }).eq("id", claim.id);
      return "failed";
    }
    return "sent";
  } catch (err) {
    console.error("operator alert failed:", err instanceof Error ? err.message : err);
    return "failed";
  }
}
