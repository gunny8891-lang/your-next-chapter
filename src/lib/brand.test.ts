import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { OPERATOR } from "@/lib/legal/details";
import { senderSettings } from "@/lib/email/send";
import { APP_CALENDAR_NAME } from "@/lib/calendar/google";

/**
 * The product is called Lark Hour. This keeps the old name from creeping back into
 * anything a member, a search engine or an AI model sees. Internal identifiers that
 * must not change (the package and project names, the web address) are not matched by
 * these patterns on purpose.
 */

const OLD_NAME = /Your Next Chapter|YourNextChapter/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__fixtures__" || entry === "node_modules") continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx|css)$/.test(entry) && entry !== "brand.test.ts") out.push(full);
  }
  return out;
}

describe("the product name", () => {
  it("is Lark Hour everywhere in the source", () => {
    const stragglers = sourceFiles(join(process.cwd(), "src"))
      .filter((file) => OLD_NAME.test(readFileSync(file, "utf8")))
      .map((file) => relative(process.cwd(), file));
    expect(stragglers).toEqual([]);
  });

  it("is the name on the calendar the app makes in a member's Google Calendar", () => {
    expect(APP_CALENDAR_NAME).toBe("Lark Hour");
  });

  it("is the name emails are sent under until the company's own sender is set", () => {
    expect(senderSettings({}).from).toMatch(/^Lark Hour </);
  });

  it("does not make up a company name before there is one", () => {
    expect(OPERATOR.companyName === null || typeof OPERATOR.companyName === "string").toBe(true);
  });
});
