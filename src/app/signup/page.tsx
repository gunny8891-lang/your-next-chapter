import Link from "next/link";
import { signup } from "@/app/auth/actions";
import { T } from "@/lib/theme";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; checkEmail?: string }>;
}) {
  const { error, checkEmail } = await searchParams;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 400, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: "32px 28px" }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 24, color: T.ink, margin: "0 0 24px" }}>
          Start your next chapter
        </h1>

        {checkEmail ? (
          <p style={{ fontSize: 15, color: T.ink, lineHeight: 1.5 }}>
            Almost there — check your email for a confirmation link to finish signing up.
          </p>
        ) : (
          <>
            {error && (
              <p style={{ color: "#B0562F", fontSize: 14, marginBottom: 16 }}>{error}</p>
            )}

            <form action={signup} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <input
                name="email"
                type="email"
                placeholder="Email"
                required
                style={{ padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${T.line}`, fontSize: 15 }}
              />
              <input
                name="password"
                type="password"
                placeholder="Password (min 6 characters)"
                minLength={6}
                required
                style={{ padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${T.line}`, fontSize: 15 }}
              />
              <button
                type="submit"
                style={{ padding: "13px", borderRadius: 10, border: "none", background: T.primary, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 8 }}
              >
                Sign up
              </button>
            </form>

            <p style={{ fontSize: 14, color: T.inkSoft, marginTop: 20, textAlign: "center" }}>
              Already have an account? <Link href="/login" style={{ color: T.primary, fontWeight: 600 }}>Log in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
