import Link from "next/link";
import { requestPasswordReset } from "@/app/auth/actions";
import { T } from "@/lib/theme";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ checkEmail?: string }>;
}) {
  const { checkEmail } = await searchParams;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 400, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: "32px 28px" }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 24, color: T.ink, margin: "0 0 24px" }}>
          Reset your password
        </h1>

        {checkEmail ? (
          <p style={{ fontSize: 15, color: T.ink, lineHeight: 1.5 }}>
            If an account exists for that email, we&apos;ve sent a link to reset your password.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 14, color: T.inkSoft, marginBottom: 20, lineHeight: 1.5 }}>
              Enter your email and we&apos;ll send you a link to set a new password.
            </p>

            <form action={requestPasswordReset} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <input
                name="email"
                type="email"
                placeholder="Email"
                required
                style={{ padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${T.line}`, fontSize: 15 }}
              />
              <button
                type="submit"
                style={{ padding: "13px", borderRadius: 10, border: "none", background: T.primary, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 8 }}
              >
                Send reset link
              </button>
            </form>
          </>
        )}

        <p style={{ fontSize: 14, color: T.inkSoft, marginTop: 20, textAlign: "center" }}>
          <Link href="/login" style={{ color: T.primary, fontWeight: 600 }}>Back to log in</Link>
        </p>
      </div>
    </div>
  );
}
