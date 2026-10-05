import Link from "next/link";
import { signup } from "@/app/auth/actions";
import { AuthLink, AuthLinks, AuthPage } from "@/components/AuthPage";
import { Button, ErrorNote, Field } from "@/components/ui";
import styles from "@/components/AuthPage.module.css";

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
    <AuthPage title="Start your next chapter" lead="It takes about a minute. Then we'll have something good for today.">
      <form action={signup}>
        {error && <ErrorNote>{error}</ErrorNote>}
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
        <Button type="submit" fullWidth>
          Create my account
        </Button>
        <p className={styles.agree}>
          By creating an account you agree to our <Link href="/terms">terms of use</Link>. Our <Link href="/privacy">privacy notice</Link> explains what we keep and why.
        </p>
      </form>

      <AuthLinks>
        <AuthLink href="/login">Already have an account? Log in</AuthLink>
      </AuthLinks>
    </AuthPage>
  );
}
