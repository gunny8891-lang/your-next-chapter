import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { operatorAlerts } from "@/components/AiCostDashboard";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("where a member could see a raw error, they now see a kind sentence", () => {
  it("the concierge answers in its own voice for each kind of failure", () => {
    const chat = read("src/app/chat/actions.ts");
    expect(chat).toContain("reply = chatMessage(classifyAiFailure(err)) + note;");
    expect(chat).not.toContain("having trouble answering right now —");
  });

  it("Today's time suggestions never return the raw reason", () => {
    const actions = read("src/app/today/timeActions.ts");
    expect(actions).toContain("error: memberMessage(classifyAiFailure(err)),");
    expect(actions).not.toMatch(/error: err instanceof Error \? err\.message/);
  });

  it("the plan button never shows the raw reason", () => {
    const button = read("src/components/GenerateWeekButton.tsx");
    expect(button).not.toContain("${result.error}");
    expect(button).toContain("We couldn't plan your week just now. Please try again in a little while.");
  });

  it("the Account save notice and address never carry the raw reason", () => {
    expect(read("src/components/AccountSettingsForm.tsx")).not.toContain("({planError})");
    const action = read("src/app/account/actions.ts");
    expect(action).not.toContain("encodeURIComponent(generated.error)");
    expect(action).toContain('"&planError=1"');
  });
});

describe("the person running the app is told when only they can fix it", () => {
  it("the call wrapper logs an 'ACTION NEEDED' line for an out-of-credit account or a rejected key", () => {
    const client = read("src/lib/ai/client.ts");
    expect(client).toContain("if (needsOperator(kind)) console.error(`ACTION NEEDED (${context.feature}): ${operatorAlert(kind)}`);");
  });

  const NOW = new Date("2026-10-07T12:00:00Z").getTime();
  const failure = (hoursAgo: number, message: string) => ({
    created_at: new Date(NOW - hoursAgo * 3_600_000).toISOString(),
    feature: "concierge_chat",
    model: "claude-sonnet-5",
    error_message: message,
  });
  const OUT_OF_CREDIT = "400 Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.";

  it("the admin costs page shows an alert for a recent out-of-credit failure, once however many there were", () => {
    const alerts = operatorAlerts([failure(1, OUT_OF_CREDIT), failure(2, OUT_OF_CREDIT), failure(3, OUT_OF_CREDIT)], NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("platform.claude.com/settings/billing");
  });

  it("names a rejected key separately", () => {
    const alerts = operatorAlerts([failure(1, OUT_OF_CREDIT), failure(1, "401 invalid x-api-key")], NOW);
    expect(alerts).toHaveLength(2);
    expect(alerts.join(" ")).toContain("ANTHROPIC_API_KEY");
  });

  it("stays quiet for an old failure, a passing hiccup, or a failure with no message", () => {
    expect(operatorAlerts([failure(30, OUT_OF_CREDIT)], NOW)).toEqual([]);
    expect(operatorAlerts([failure(1, "529 Overloaded"), failure(1, "fetch failed"), failure(1, "reply had no usable options")], NOW)).toEqual([]);
    expect(operatorAlerts([{ ...failure(1, ""), error_message: null }], NOW)).toEqual([]);
    expect(operatorAlerts([], NOW)).toEqual([]);
  });

  it("is shown on the page, above everything else", () => {
    const dashboard = read("src/components/AiCostDashboard.tsx");
    expect(dashboard).toContain("operatorAlerts(summary.recentFailures).map(");
    expect(dashboard.indexOf("operatorAlerts(summary.recentFailures)")).toBeLessThan(dashboard.indexOf("summary.truncated &&"));
  });
});
