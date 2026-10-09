import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { QUICK_THINKING } from "@/lib/ai/models";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("keeping the wait short where a person is waiting", () => {
  it("lets the model think a little, and says to keep it short", () => {
    expect(QUICK_THINKING).toEqual({ thinking: { type: "adaptive" }, output_config: { effort: "low" } });
  });

  it("is used for the chat and for generating a week's plan", () => {
    for (const file of ["src/lib/chat/agent.ts", "src/lib/itinerary/agent.ts"]) {
      expect(read(file)).toContain("...QUICK_THINKING,");
    }
  });

  it("leaves room in the reply for any thinking, which is counted against its length", () => {
    // At the old limits a long think could use the whole allowance: a plan cut off mid-JSON, a chat reply cut short.
    expect(read("src/lib/itinerary/agent.ts")).toMatch(/max_tokens: 4096/);
    expect(read("src/lib/chat/agent.ts")).toMatch(/max_tokens: 700/);
  });

  it("is not needed where the model is a small one or the choice is simple", () => {
    // The nudge message uses the small model, which does not think; the idea picker turns thinking off (see weekend.test.ts).
    expect(read("src/lib/nudges/message.ts")).toContain("AI_MODELS.cheap");
    expect(read("src/lib/someTime/recommend.ts")).toContain('thinking: { type: "disabled" }');
  });
});
