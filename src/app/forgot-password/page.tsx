import { requestPasswordReset } from "@/app/auth/actions";
import { AuthLink, AuthLinks, AuthPage } from "@/components/AuthPage";
import { Button, Field } from "@/components/ui";

export const metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ checkEmail?: string }>;
}) {
  const { checkEmail } = await searchParams;

  if (checkEmail) {
    return (
      <AuthPage title="Check your email" lead="If there's an account for that address, we've sent a link to set a new password.">
        <AuthLinks>
          <AuthLink href="/login">Back to log in</AuthLink>
        </AuthLinks>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Reset your password" lead="Tell us your email and we'll send you a link to choose a new one.">
      <form action={requestPasswordReset}>
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Button type="submit" fullWidth>
          Send me the link
        </Button>
      </form>

      <AuthLinks>
        <AuthLink href="/login">Back to log in</AuthLink>
      </AuthLinks>
    </AuthPage>
  );
}
