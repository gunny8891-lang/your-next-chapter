import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { Button, ErrorNote, Notice, Page, PageHeader, TextareaField } from "@/components/ui";
import { sendFeedbackAction } from "@/app/feedback/actions";
import { cleanPage, FEEDBACK_MAX_CHARS } from "@/lib/feedbackSubmit";
import { FEEDBACK_EMAIL } from "@/lib/feedback";

export const metadata = { title: "Tell us what you think" };

const PROBLEMS: Record<string, string> = {
  empty: "Please write a few words first, then send it.",
  too_many: "You've sent a few today already, thank you. Please try again tomorrow, or email us.",
  failed: "We couldn't send that just now. Please try again in a moment, or email us.",
};

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ from?: string; sent?: string; error?: string }> }) {
  const { from, sent, error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const page = cleanPage(from);

  return (
    <Page>
      <PageHeader title="Tell us what you think" lead="Something confusing, something missing, or an idea that was a good one. A few words is plenty." />

      {sent ? (
        <>
          <Notice>Thank you. We read every one, and we&apos;ll write back if you&apos;d like an answer.</Notice>
          <p style={{ marginTop: "var(--space-5)" }}>
            <Button href="/today" variant="secondary">
              Back to today
            </Button>
          </p>
        </>
      ) : (
        <form action={sendFeedbackAction} style={{ display: "grid", gap: "var(--space-5)" }}>
          {error && PROBLEMS[error] && <ErrorNote>{PROBLEMS[error]}</ErrorNote>}
          <input type="hidden" name="page" value={page} />
          <TextareaField
            label="What would you like to tell us?"
            name="message"
            rows={7}
            maxLength={FEEDBACK_MAX_CHARS}
            required
            hint={`You were on: ${page}. We'll see your email address so we can reply, and nothing else about you.`}
          />
          <Button type="submit" fullWidth>
            Send
          </Button>
          <p style={{ fontSize: "var(--text-small)", color: "var(--color-ink-soft)" }}>
            Prefer email? Write to <Link href={`mailto:${FEEDBACK_EMAIL}`}>{FEEDBACK_EMAIL}</Link>.
          </p>
        </form>
      )}
    </Page>
  );
}
