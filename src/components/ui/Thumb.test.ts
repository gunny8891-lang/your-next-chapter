import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { needsNoCredit } from "@/components/ui/Thumb";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("which pictures may be shown without their credit beside them", () => {
  it("is the calm stand-ins and anything that asks for no credit", () => {
    expect(needsNoCredit({ generic: true, license: "CC0" })).toBe(true);
    expect(needsNoCredit({ license: "CC0 1.0" })).toBe(true);
    expect(needsNoCredit({ license: "Public domain" })).toBe(true);
    expect(needsNoCredit({ license: "PD" })).toBe(true);
  });

  it("is not a photograph that asks to be credited", () => {
    expect(needsNoCredit({ license: "CC BY-SA 4.0" })).toBe(false);
    expect(needsNoCredit({ license: "CC BY 2.0" })).toBe(false);
    expect(needsNoCredit({ license: "" })).toBe(false);
    expect(needsNoCredit({})).toBe(false);
    expect(needsNoCredit(null)).toBe(false);
    expect(needsNoCredit(undefined)).toBe(false);
  });
});

describe("the small pictures in the lists", () => {
  it("are under the time, in the column it already had, so the title keeps its width", () => {
    for (const [view, css] of [
      ["src/components/TodayView.tsx", "src/components/Today.module.css"],
      ["src/components/ThisWeekView.tsx", "src/components/ThisWeek.module.css"],
    ]) {
      const source = read(view);
      expect(source, view).toMatch(/<span className=\{styles\.whenCol\}>\s*<span className=\{styles\.time\}>\{item\.time\}<\/span>\s*<Thumb /);
      expect(read(css), css).toMatch(/\.whenCol \{[^}]*--thumb-size: 56px/);
      expect(read(css), css).toMatch(/grid-template-columns: calc\(var\(--text-label\) \* 6\) 1fr;/);
    }
  });

  it("show a photograph on My Week, where the sheet it opens carries the credit, and only a picture needing none on Today", () => {
    expect(read("src/components/ThisWeekView.tsx")).toContain("<Thumb category={item.category} image={item.image} creditNearby />");
    expect(read("src/components/TodayView.tsx")).toContain("<Thumb category={item.category} image={item.image} />");
    expect(read("src/components/TodayView.tsx")).not.toContain("creditNearby");
  });

  it("are decoration: hidden from a screen reader, with empty alt text", () => {
    const thumb = read("src/components/ui/Thumb.tsx");
    expect(thumb).toContain('aria-hidden="true"');
    expect(thumb).toContain('alt=""');
  });

  it("have their picture on Today read from the catalogue like every other card", () => {
    const page = read("src/app/today/page.tsx");
    expect(page).toContain("image_url, image_alt, image_credit, image_license, image_source_url");
    expect(page).toContain("image: imageForRow(activity)");
  });
});
