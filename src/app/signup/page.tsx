import Link from "next/link";
import { signup } from "@/app/auth/actions";
import { AuthLink, AuthLinks, AuthPage } from "@/components/AuthPage";
import { Button, CheckboxField, ErrorNote, Field } from "@/components/ui";
import styles from "@/components/AuthPage.module.css";
import { authErrorMessage } from "@/lib/auth/messages";

export const metadata = { title: "Sign up" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; checkEmail?: string }>;
}) {
  const { error, checkEmail } = await searchParams;

  if (checkEmail) {
    return (
      <AuthPage title="Check your email" lead="We've sent you a link. Open it to finish signing up, and we'll take it from there.">
        <AuthLinks>
          <AuthLink href="/login">Back to log in</AuthLink>
        </AuthLinks>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Welcome to Lark Hour" lead="It takes about a minute. Then we'll have something good for today.">
      <form action={signup}>
        {error && <ErrorNote>{authErrorMessage(error)}</ErrorNote>}
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={6}
          hint="At least 6 characters"
          required
        />
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
          Create my account
        </Button>
      </form>

      <AuthLinks>
        <AuthLink href="/login">Already have an account? Log in</AuthLink>
      </AuthLinks>
    </AuthPage>
  );
}
