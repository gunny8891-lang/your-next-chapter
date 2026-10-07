import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChangeMindOptions } from "@/components/ItemSheet";

const source = readFileSync(join(process.cwd(), "src", "components", "ItemSheet.tsx"), "utf8");
const noop = () => undefined;

function render(onCalendar: boolean) {
  return renderToStaticMarkup(createElement(ChangeMindOptions, { onAction: noop, onKeep: noop, onCalendar }));
}

describe("changing your mind after saying yes", () => {
  it("offers the two ways out they had the first time, and a way to keep it", () => {
    const html = render(false);
    expect(html).toContain("Something else");
    expect(html).toContain("Not this time");
    expect(html).toContain("Keep it");
  });

  it("says it will also come off the Google Calendar, but only when it is on there", () => {
    expect(render(true)).toContain("come off your Google Calendar too");
    expect(render(false)).not.toContain("Google Calendar");
  });

  it("is offered on a going outing, and only there", () => {
    // Inside the branch for status === "accepted"; the not-yet-accepted branch has its own buttons.
    const accepted = source.slice(source.indexOf('status === "accepted" ?'), source.indexOf("Yes, I&apos;ll go"));
    expect(accepted).toContain("<ChangeMyMind");
    const rest = source.slice(source.indexOf("Yes, I&apos;ll go"));
    expect(rest).not.toContain("<ChangeMyMind");
  });

  it("sends the choice to the same handler that already takes a changed plan off the calendar", () => {
    expect(source).toMatch(/<ChangeMyMind onAction=\{onAction\}/);
    expect(readFileSync(join(process.cwd(), "src", "app", "week", "actions.ts"), "utf8")).toContain('if (action !== "accepted") after(() => dropFromCalendarIfAny');
  });
});
