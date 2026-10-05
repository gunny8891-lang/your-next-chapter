import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { updatePassword } from "@/app/auth/actions";
import { AuthPage } from "@/components/AuthPage";
import { Button, ErrorNote, Field } from "@/components/ui";
import { authErrorMessage } from "@/lib/auth/messages";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=link_expired");

  return (
    <AuthPage title="Choose a new password">
      <form action={updatePassword}>
        {error && <ErrorNote>{authErrorMessage(error)}</ErrorNote>}
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={6}
          hint="At least 6 characters"
          required
        />
        <Button type="submit" fullWidth>
          Save my new password
        </Button>
      </form>
    </AuthPage>
  );
}
