import { signup } from "@/app/auth/actions";
import { AuthLink, AuthLinks, AuthPage } from "@/components/AuthPage";
import { Button, ErrorNote, Field } from "@/components/ui";

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
      </form>

      <AuthLinks>
        <AuthLink href="/login">Already have an account? Log in</AuthLink>
      </AuthLinks>
    </AuthPage>
  );
}
