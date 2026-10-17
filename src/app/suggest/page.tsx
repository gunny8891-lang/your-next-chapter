import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getSessionUser } from "@/utils/supabase/user";
import { Button, ErrorNote, Field, Notice, Page, PageHeader, SelectField, TextareaField } from "@/components/ui";
import { suggestPlaceAction } from "@/app/suggest/actions";
import { SUGGEST_KINDS } from "@/lib/suggest/suggestPlace";

export const metadata = { title: "Tell us about a place" };

const PROBLEMS: Record<string, string> = {
  invalid: "Please give it a name, say where it is, and choose what kind of thing it is.",
  too_many: "You've sent a few today already, thank you. Please try again tomorrow.",
  failed: "We couldn't send that just now. Please try again in a moment.",
};

export default async function SuggestPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { sent, error } = await searchParams;
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect("/login");

  return (
    <Page>
      <PageHeader title="Tell us about a place" lead="A café you love, a club, a coffee morning, a class. If it isn't in the app, tell us and we'll check it and add it for everyone nearby." />

      {sent ? (
        <>
          <Notice>
            {sent === "already_have"
              ? "Thank you. We already have that one, so there is nothing more to do."
              : "Thank you. We'll check it, and once we have, it will be there for people near you."}
          </Notice>
          <p style={{ marginTop: "var(--space-5)" }}>
            <Button href="/suggest" variant="secondary">
              Tell us about another
            </Button>{" "}
            <Button href="/explore" variant="quiet">
              Back to Explore
            </Button>
          </p>
        </>
      ) : (
        <form action={suggestPlaceAction} style={{ display: "grid", gap: "var(--space-5)" }}>
          {error && PROBLEMS[error] && <ErrorNote>{PROBLEMS[error]}</ErrorNote>}
          <Field label="What is it called?" name="name" required minLength={2} maxLength={100} placeholder="e.g. The Garden Cafe, Tuesday Knitting Circle" />
          <SelectField label="What kind of thing is it?" name="kind" defaultValue="place">
            {SUGGEST_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </SelectField>
          <Field label="Where is it?" name="where" required minLength={3} maxLength={200} hint="An address or the town and street is plenty." placeholder="e.g. 12 High Street, Barnet" />
          <Field label="When is it on? (if it is not always open)" name="when" maxLength={120} placeholder="e.g. Tuesdays 10 to 12, or Saturday 14 March" />
          <Field label="A web address, if there is one" name="link" maxLength={300} placeholder="e.g. www.example.org" />
          <TextareaField label="Anything else we should know?" name="notes" rows={4} maxLength={500} hint="Costs, whether it suits wheelchairs or dogs, who it is for." />
          <Button type="submit" fullWidth>
            Send
          </Button>
          <p style={{ fontSize: "var(--text-small)", color: "var(--color-ink-soft)" }}>
            We read every one, and we check before anything is added. We&apos;ll see your email address so we can ask you about it, and nothing else about you.{" "}
            <Link href="/explore">Back to Explore</Link>
          </p>
        </form>
      )}
    </Page>
  );
}
