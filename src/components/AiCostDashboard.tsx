import Link from "next/link";
import { ChevronLeft, Coins } from "lucide-react";
import { T } from "@/lib/theme";
import type { UsageSummary, BreakdownRow } from "@/lib/ai/usageSummary";

const FEATURE_LABEL: Record<string, string> = {
  itinerary_agent: "My Week",
  concierge_chat: "Concierge chat",
  surprise_me_on_demand: "Surprise Me",
  nudge_message: "Nudge messages",
  discovery_claude_web_search: "Discovery (web search)",
  discovery_claude_web: "Discovery (page extraction)",
};

function featureLabel(key: string): string {
  return FEATURE_LABEL[key] ?? key;
}

function usd(n: number | null): string {
  if (n === null) return "—";
  return n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

function calls(n: number): string {
  return `${n} call${n === 1 ? "" : "s"}`;
}

function pct(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

const card = {
  background: T.surface,
  border: `1px solid ${T.line}`,
  borderRadius: 14,
  padding: "16px 18px",
} as const;

const th = {
  textAlign: "left" as const,
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: 0.3,
  color: T.inkSoft,
  padding: "8px 10px",
  borderBottom: `1px solid ${T.line}`,
  whiteSpace: "nowrap" as const,
};

const td = {
  fontSize: 13.5,
  color: T.ink,
  padding: "9px 10px",
  borderBottom: `1px solid ${T.line}`,
};

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div style={card}>
      <p style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3, color: T.inkSoft, margin: "0 0 6px" }}>{label}</p>
      <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 24, color: T.ink, margin: 0 }}>{value}</p>
      {note && <p style={{ fontSize: 12, color: T.inkSoft, margin: "4px 0 0" }}>{note}</p>}
    </div>
  );
}

function BreakdownTable({
  rows,
  labelFor,
  totalCost,
  firstColumn,
}: {
  rows: BreakdownRow[];
  labelFor: (key: string) => string;
  totalCost: number;
  firstColumn: string;
}) {
  if (rows.length === 0) {
    return <p style={{ fontSize: 13.5, color: T.inkSoft, margin: 0 }}>No successful calls logged this month yet.</p>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>{firstColumn}</th>
            <th style={th}>CALLS</th>
            <th style={th}>COST</th>
            <th style={th}>AVG / CALL</th>
            <th style={th}>SHARE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td style={td}>{labelFor(r.key)}</td>
              <td style={td}>{r.calls}</td>
              <td style={td}>{usd(r.cost)}</td>
              <td style={td}>{usd(r.avgCost)}</td>
              <td style={td}>{pct(r.cost, totalCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AiCostDashboard({ summary }: { summary: UsageSummary }) {
  const avgFor = (key: string): BreakdownRow | undefined => summary.byFeature.find((f) => f.key === key);
  const successfulCost = summary.byFeature.reduce((sum, f) => sum + f.cost, 0);
  const { haiku, sonnet, other } = summary.tierShare;
  const totalCalls = haiku.calls + sonnet.calls + other.calls;
  const totalTierCost = haiku.cost + sonnet.cost + other.cost;

  const keyAverages: { label: string; row: BreakdownRow | undefined }[] = [
    { label: "MY WEEK", row: avgFor("itinerary_agent") },
    { label: "CONCIERGE", row: avgFor("concierge_chat") },
    { label: "SURPRISE ME", row: avgFor("surprise_me_on_demand") },
  ];

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <div style={{ background: T.primary, padding: "20px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <Link href="/week" style={{ color: "#EAE3D0", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
            <ChevronLeft size={14} /> Back to This Week
          </Link>
          <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", color: "#fff", fontSize: 24, margin: "10px 0 0", display: "flex", alignItems: "center", gap: 10 }}>
            <Coins size={22} /> AI costs
          </h1>
          <p style={{ color: "#EAE3D0", fontSize: 13.5, margin: "6px 0 0" }}>
            Estimated from logged token counts. Days and months are UTC.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px 60px" }}>
        {summary.truncated && (
          <div style={{ background: "#F5E9E2", border: "1px solid #D3A98C", borderRadius: 10, padding: "12px 14px", marginBottom: 20, fontSize: 14, color: "#8A4A28" }}>
            This month has more logged calls than the dashboard reads in one go — figures below are for the most recent calls only and undercount.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>
          <Stat label="TODAY" value={usd(summary.costToday)} />
          <Stat label="THIS MONTH" value={usd(summary.costThisMonth)} note={calls(summary.callsThisMonth)} />
          <Stat
            label="PER ACTIVE MEMBER"
            value={usd(summary.costPerActiveUser)}
            note={summary.activeUsers ? `${summary.activeUsers} active this month` : "No member activity yet"}
          />
          <Stat
            label="PER PAYING MEMBER"
            value={usd(summary.costPerPayingUser)}
            note={summary.payingUsers ? `${summary.payingUsers} paying` : "No paying members yet"}
          />
        </div>
        <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "0 0 28px" }}>
          This month: {usd(summary.memberCostThisMonth)} tied to members · {usd(summary.systemCostThisMonth)} system (Discovery Agent, not tied to a member)
        </p>

        <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 17, color: T.ink, margin: "0 0 12px" }}>Average cost per call</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 6 }}>
          {keyAverages.map(({ label, row }) => (
            <Stat key={label} label={label} value={row ? usd(row.avgCost) : "—"} note={row ? calls(row.calls) : "No calls yet"} />
          ))}
        </div>
        <p style={{ fontSize: 12, color: T.inkSoft, margin: "0 0 28px" }}>
          Per call, not per generation — a My Week build retries once if the first answer is invalid, so it can be up to two calls.
        </p>

        <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 17, color: T.ink, margin: "0 0 12px" }}>By feature</h2>
        <div style={{ ...card, marginBottom: 28 }}>
          <BreakdownTable rows={summary.byFeature} labelFor={featureLabel} totalCost={successfulCost} firstColumn="FEATURE" />
        </div>

        <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 17, color: T.ink, margin: "0 0 12px" }}>By model</h2>
        <div style={{ ...card, marginBottom: 12 }}>
          <BreakdownTable rows={summary.byModel} labelFor={(k) => k} totalCost={successfulCost} firstColumn="MODEL" />
        </div>
        <p style={{ fontSize: 13.5, color: T.ink, margin: "0 0 28px" }}>
          Haiku : Sonnet — {pct(haiku.calls, totalCalls)} : {pct(sonnet.calls, totalCalls)} of calls,{" "}
          {pct(haiku.cost, totalTierCost)} : {pct(sonnet.cost, totalTierCost)} of cost
          {other.calls > 0 && ` (${other.calls} on other models)`}
        </p>

        <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 17, color: T.ink, margin: "0 0 12px" }}>
          Failed calls this month: {summary.failedCallsThisMonth}
        </h2>
        {summary.recentFailures.length === 0 ? (
          <p style={{ fontSize: 13.5, color: T.inkSoft, margin: 0 }}>None.</p>
        ) : (
          <div style={card}>
            {summary.recentFailures.map((f, i) => (
              <div key={i} style={{ padding: "8px 0", borderBottom: i < summary.recentFailures.length - 1 ? `1px solid ${T.line}` : "none" }}>
                <p style={{ fontSize: 13, color: T.ink, margin: 0, fontWeight: 600 }}>
                  {featureLabel(f.feature)} · {f.model}
                </p>
                <p style={{ fontSize: 12, color: T.inkSoft, margin: "2px 0 0" }}>
                  {new Date(f.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                </p>
                <p style={{ fontSize: 12.5, color: "#8A4A28", margin: "4px 0 0", wordBreak: "break-word" }}>
                  {f.error_message ? f.error_message.slice(0, 220) : "No error message recorded"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
