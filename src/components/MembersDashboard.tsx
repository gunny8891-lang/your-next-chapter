import Link from "next/link";
import { ChevronLeft, Users } from "lucide-react";
import { T } from "@/lib/theme";
import { RETURNING_DAYS_NEEDED } from "@/lib/admin/memberStats";
import type { MemberStatsResult } from "@/lib/admin/memberStatsLoader";
import { kindLabel, type ProblemsSummary } from "@/lib/admin/problemsLoader";
import { MAX_LISTED } from "@/lib/admin/memberList";
import type { MemberListResult } from "@/lib/admin/memberListLoader";

const card = {
  background: T.surface,
  border: `1px solid ${T.line}`,
  borderRadius: 14,
  padding: "16px 18px",
} as const;

const heading = { fontFamily: "var(--font-display), Georgia, serif", fontSize: 17, color: T.ink, margin: "0 0 12px" } as const;

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div style={card}>
      <p style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3, color: T.inkSoft, margin: "0 0 6px" }}>{label}</p>
      <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 28, color: T.ink, margin: 0 }}>{value}</p>
      {note && <p style={{ fontSize: 12, color: T.inkSoft, margin: "4px 0 0" }}>{note}</p>}
    </div>
  );
}

const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 28 } as const;

function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function MembersDashboard({ stats, problems = null, list = null }: { stats: MemberStatsResult; problems?: ProblemsSummary | null; list?: MemberListResult | null }) {
  const busiest = Math.max(1, ...stats.daily.map((d) => d.members));
  const of = (n: number) => (stats.registered ? `${Math.round((n / stats.registered) * 100)}% of members` : undefined);

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <div style={{ background: T.primary, padding: "20px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <Link href="/account" style={{ color: "#EAE3D0", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
            <ChevronLeft size={14} /> Back to Account
          </Link>
          <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", color: "#fff", fontSize: 24, margin: "10px 0 0", display: "flex", alignItems: "center", gap: 10 }}>
            <Users size={22} /> Members
          </h1>
          <p style={{ color: "#EAE3D0", fontSize: 13.5, margin: "6px 0 0" }}>
            Counts first, then who has registered. Admin accounts are left out, so your own use does not show here. Days are London days.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px 60px" }}>
        {stats.truncated && (
          <div style={{ background: "#F5E9E2", border: "1px solid #D3A98C", borderRadius: 10, padding: "12px 14px", marginBottom: 20, fontSize: 14, color: "#8A4A28" }}>
            There is more data than this page reads in one go, so some figures below undercount.
          </div>
        )}

        {problems && (
          <>
            <h2 style={heading}>What went wrong, last {problems.days} days</h2>
            <div style={{ ...card, marginBottom: 28 }}>
              {problems.total === 0 ? (
                <p style={{ margin: 0, fontSize: 14, color: T.inkSoft }}>Nothing recorded. That includes sign-up, log-in and broken screens.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: T.ink, display: "grid", gap: 4 }}>
                  {problems.byKind.map((k) => (
                    <li key={k.kind}>
                      {kindLabel(k.kind)}: <strong>{k.count}</strong>
                    </li>
                  ))}
                </ul>
              )}
              {problems.topCodes.length > 0 && (
                <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "10px 0 0" }}>
                  Most common: {problems.topCodes.map((c) => `${c.label} (${c.count})`).join("; ")}
                </p>
              )}
              {problems.feedbackThisWeek !== null && (
                <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "10px 0 0" }}>
                  Messages written in the app this week: <strong>{problems.feedbackThisWeek}</strong> (they are also emailed to you).
                </p>
              )}
            </div>
          </>
        )}

        <h2 style={heading}>Signed up</h2>
        <div style={grid}>
          <Stat label="REGISTERED" value={stats.registered} note={`${stats.newLast7Days} new in the last 7 days`} />
          <Stat label="EMAIL CONFIRMED" value={stats.emailConfirmed} note={of(stats.emailConfirmed)} />
          <Stat label="FINISHED ONBOARDING" value={stats.onboarded} note={of(stats.onboarded)} />
        </div>

        {list && (
          <>
            <h2 style={heading}>Who has registered</h2>
            <div style={{ ...card, marginBottom: 28, overflowX: "auto" }}>
              {list.rows.length === 0 ? (
                <p style={{ margin: 0, fontSize: 14, color: T.inkSoft }}>Nobody yet.</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, color: T.ink }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: T.inkSoft, fontSize: 11.5, letterSpacing: 0.3 }}>
                      <th style={{ padding: "0 10px 8px 0" }}>EMAIL</th>
                      <th style={{ padding: "0 10px 8px 0" }}>JOINED</th>
                      <th style={{ padding: "0 10px 8px 0" }}>EMAIL CONFIRMED</th>
                      <th style={{ padding: "0 10px 8px 0" }}>FINISHED SETTING UP</th>
                      <th style={{ padding: "0 0 8px" }}>WEEKLY EMAIL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.rows.map((row) => (
                      <tr key={row.email} style={{ borderTop: `1px solid ${T.line}` }}>
                        <td style={{ padding: "8px 10px 8px 0", wordBreak: "break-all" }}>{row.email}</td>
                        <td style={{ padding: "8px 10px 8px 0", whiteSpace: "nowrap" }}>{dayLabel(row.joined)}</td>
                        <td style={{ padding: "8px 10px 8px 0", color: row.emailConfirmed ? T.ink : "#8A4A28", fontWeight: row.emailConfirmed ? 400 : 700 }}>{row.emailConfirmed ? "Yes" : "Not yet"}</td>
                        <td style={{ padding: "8px 10px 8px 0" }}>{row.finishedOnboarding ? "Yes" : "Not yet"}</td>
                        <td style={{ padding: "8px 0" }}>{row.weeklyPlanEmail === null ? "-" : row.weeklyPlanEmail ? "On" : "Off"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {list.total > MAX_LISTED && <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "10px 0 0" }}>Showing the newest {MAX_LISTED} of {list.total}.</p>}
            </div>
          </>
        )}

        <h2 style={heading}>Using it</h2>
        <div style={{ ...grid, marginBottom: 8 }}>
          <Stat label="ACTIVE TODAY" value={stats.activeToday} note={of(stats.activeToday)} />
          <Stat label="ACTIVE, LAST 7 DAYS" value={stats.active7Days} note={of(stats.active7Days)} />
          <Stat label="ACTIVE, LAST 30 DAYS" value={stats.active30Days} note={of(stats.active30Days)} />
          <Stat label="DAILY HABIT" value={stats.returning} note={`${RETURNING_DAYS_NEEDED}+ of the last 7 days`} />
          <Stat label="QUIET" value={stats.quiet} note="nothing done in 30 days" />
        </div>
        <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "0 0 28px", lineHeight: 1.5 }}>
          &quot;Active&quot; means the member did something themselves: opened or saved an idea, planned or finished something, wrote to the concierge or set how they feel today. Signing in alone does not count, and
          neither does anything we send them.
        </p>

        <h2 style={heading}>Members active each day</h2>
        <div style={{ ...card, marginBottom: 28 }}>
          {stats.daily.map((d) => (
            <div key={d.date} style={{ display: "grid", gridTemplateColumns: "92px 1fr 28px", alignItems: "center", gap: 10, padding: "4px 0" }}>
              <span style={{ fontSize: 12.5, color: T.inkSoft }}>{dayLabel(d.date)}</span>
              <span aria-hidden="true" style={{ display: "block", height: 10, borderRadius: 5, background: T.line }}>
                <span style={{ display: "block", height: "100%", width: `${(d.members / busiest) * 100}%`, borderRadius: 5, background: T.primary }} />
              </span>
              <span style={{ fontSize: 13, color: T.ink, textAlign: "right" }}>{d.members}</span>
            </div>
          ))}
        </div>

        <h2 style={heading}>Their choices</h2>
        <div style={grid}>
          <Stat label="CALENDAR CONNECTED" value={stats.calendarConnected} />
          <Stat label="WEEKLY PLAN EMAIL ON" value={stats.weeklyPlanOn} note={`of ${stats.onboarded} onboarded`} />
          <Stat label="REMINDERS ON" value={stats.remindersOn} note={`of ${stats.onboarded} onboarded`} />
        </div>
      </div>
    </div>
  );
}
