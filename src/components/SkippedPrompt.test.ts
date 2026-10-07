import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SkippedPrompt, freeSlotMessage } from "@/components/SkippedPrompt";

const view = readFileSync(join(process.cwd(), "src", "components", "ThisWeekView.tsx"), "utf8");

describe("the prompt under an outing that was turned down", () => {
  it("names the part of the day that is free", () => {
    expect(freeSlotMessage("Afternoon")).toBe("That afternoon is free.");
    expect(freeSlotMessage("morning")).toBe("That morning is free.");
    expect(freeSlotMessage(" Evening ")).toBe("That evening is free.");
  });

  it("says 'that time' when the outing had a clock time of its own", () => {
    expect(freeSlotMessage("2:30 pm")).toBe("That time is free.");
  });

  it("offers to find something else, and does nothing by itself", () => {
    const html = renderToStaticMarkup(createElement(SkippedPrompt, { time: "Afternoon", onFind: () => undefined }));
    expect(html).toContain("That afternoon is free.");
    expect(html).toContain("Find something else");
  });
});

describe("where the prompt appears in the week", () => {
  it("only under a skipped, real outing (never a demo card, never a going or waiting one)", () => {
    expect(view).toContain('status === "skipped" && isRealItem(item.id) && <SkippedPrompt');
  });

  it("opens the same alternatives picker as 'Something else'", () => {
    expect(view).toContain("onFind={() => beginSwap(item.id)}");
    expect(view).toMatch(/if \(openItem && action === "swapped" && isRealItem\(openItem\.id\)\) \{[\s\S]*?beginSwap\(openItem\.id\);/);
  });
});
