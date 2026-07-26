import Link from "next/link";
import { Sun } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { T } from "@/lib/theme";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 520, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 28 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: T.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sun size={20} color={T.accentSoft} />
          </div>
          <span style={{ fontFamily: "Georgia, serif", fontSize: 24, color: T.primary }}>Your Next Chapter</span>
        </div>

        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 34, lineHeight: 1.3, color: T.ink, margin: "0 0 16px" }}>
          An AI concierge for making the most of retirement.
        </h1>
        <p style={{ fontSize: 17, color: T.inkSoft, lineHeight: 1.6, margin: "0 0 32px" }}>
          Tell us a little about yourself, and we&apos;ll build you a personalised week — activities, people, and
          places, chosen for you and refined every week.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          {user ? (
            <Link
              href="/week"
              style={{ padding: "14px 28px", borderRadius: 12, background: T.primary, color: "#fff", fontSize: 16, fontWeight: 600, textDecoration: "none" }}
            >
              Continue to your week
            </Link>
          ) : (
            <>
              <Link
                href="/signup"
                style={{ padding: "14px 28px", borderRadius: 12, background: T.primary, color: "#fff", fontSize: 16, fontWeight: 600, textDecoration: "none" }}
              >
                Get started
              </Link>
              <Link
                href="/login"
                style={{ padding: "14px 28px", borderRadius: 12, border: `1.5px solid ${T.line}`, color: T.ink, fontSize: 16, fontWeight: 600, textDecoration: "none" }}
              >
                Log in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
