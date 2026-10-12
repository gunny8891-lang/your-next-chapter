import { login } from "@/app/auth/actions";
import { AuthLink, AuthLinks, AuthPage } from "@/components/AuthPage";
import { cookies } from "next/headers";
import { Button, ErrorNote, Field } from "@/components/ui";
import { ResendConfirmation } from "@/components/ResendConfirmation";
import { PENDING_EMAIL_COOKIE, readPendingEmail } from "@/lib/auth/pendingEmail";
import { authErrorMessage } from "@/lib/auth/messages";

export const metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // Signed up but never opened the link: show where it went and offer another.
  const pending = error === "unconfirmed" ? readPendingEmail((await cookies()).get(PENDING_EMAIL_COOKIE)?.value) : null;

  return (
    <AuthPage title="Welcome back">
      <form action={login}>
        {error && <ErrorNote>{authErrorMessage(error)}</ErrorNote>}
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <Button type="submit" fullWidth>
          Log in
        </Button>
      </form>

      {error === "unconfirmed" && <ResendConfirmation email={pending} />}

      <AuthLinks>
        <AuthLink href="/forgot-password">Forgot your password?</AuthLink>
        <AuthLink href="/signup">New here? Create an account</AuthLink>
      </AuthLinks>
    </AuthPage>
  );
}
