import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { updatePassword } from "@/app/auth/actions";
import { T } from "@/lib/theme";

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
  if (!user) redirect("/login?error=Your reset link has expired, please request a new one");

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 400, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: "32px 28px" }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 24, color: T.ink, margin: "0 0 24px" }}>
          Set a new password
        </h1>

        {error && (
          <p style={{ color: "#B0562F", fontSize: 14, marginBottom: 16 }}>{error}</p>
        )}

        <form action={updatePassword} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input
            name="password"
            type="password"
            placeholder="New password (min 6 characters)"
            minLength={6}
            required
            style={{ padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${T.line}`, fontSize: 15 }}
          />
          <button
            type="submit"
            style={{ padding: "13px", borderRadius: 10, border: "none", background: T.primary, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 8 }}
          >
            Update password
          </button>
        </form>
      </div>
    </div>
  );
}
