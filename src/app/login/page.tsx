import { login } from "@/app/auth/actions";
import { AuthLink, AuthLinks, AuthPage } from "@/components/AuthPage";
import { Button, ErrorNote, Field } from "@/components/ui";

export const metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <AuthPage title="Welcome back">
      <form action={login}>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <Button type="submit" fullWidth>
          Log in
        </Button>
      </form>

      <AuthLinks>
        <AuthLink href="/forgot-password">Forgot your password?</AuthLink>
        <AuthLink href="/signup">New here? Create an account</AuthLink>
      </AuthLinks>
    </AuthPage>
  );
}
