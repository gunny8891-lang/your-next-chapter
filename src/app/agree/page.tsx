import Link from "next/link";
import { redirect } from "next/navigation";
import { agree } from "@/app/agree/actions";
import { logout } from "@/app/auth/actions";
import { AuthLink, AuthLinks, AuthPage } from "@/components/AuthPage";
import { Button, CheckboxField, ErrorNote } from "@/components/ui";
import styles from "@/components/AuthPage.module.css";
import { authErrorMessage } from "@/lib/auth/messages";
import { hasAgreedToCurrent, safeNext } from "@/lib/legal/gate";
import { LEGAL_VERSION } from "@/lib/legal/details";
import { createClient } from "@/utils/supabase/server";

export const metadata = { title: "Before you continue" };

export default async function AgreePage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next: rawNext } = await searchParams;
  const next = safeNext(rawNext);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Already agreed (opened by hand, or in another tab): nothing to ask.
  const { data } = await supabase.from("legal_acceptances").select("document").eq("member_id", user.id).eq("version", LEGAL_VERSION);
  if (hasAgreedToCurrent(data ?? [])) redirect(next);

  return (
    <AuthPage title="Before you continue" lead="Please read our terms of use and privacy notice, and agree to carry on. We keep a note of when you agree.">
      <form action={agree}>
        {error && <ErrorNote>{authErrorMessage(error)}</ErrorNote>}
        <input type="hidden" name="next" value={next} />
        <CheckboxField
          name="accept"
          required
          label={
            <>
              I agree to the{" "}
              <Link href="/terms" target="_blank" rel="noopener" className={styles.agreeLink}>
                terms of use
              </Link>{" "}
              and have read the{" "}
              <Link href="/privacy" target="_blank" rel="noopener" className={styles.agreeLink}>
                privacy notice
              </Link>
              , which explains what we keep and why.
            </>
          }
        />
        <Button type="submit" fullWidth>
          Agree and continue
        </Button>
      </form>

      <AuthLinks>
        <AuthLink href="/account#delete">I would rather not agree: delete my account</AuthLink>
      </AuthLinks>
      <form action={logout}>
        <Button type="submit" variant="quiet" fullWidth>
          Log out for now
        </Button>
      </form>
    </AuthPage>
  );
}
