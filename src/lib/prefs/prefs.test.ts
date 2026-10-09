import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseTextSize, TEXT_SIZE_BOOT, TEXT_SIZES } from "@/lib/prefs/textSizeShared";
import { setTextSize } from "@/lib/prefs/textSize";
import { FEEDBACK_EMAIL, feedbackHref } from "@/lib/feedback";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("text size choices", () => {
  it("are normal, large and larger, in that order, in plain words", () => {
    expect(TEXT_SIZES.map((s) => s.value)).toEqual(["normal", "large", "larger"]);
    expect(TEXT_SIZES.map((s) => s.label)).toEqual(["Normal", "Large", "Larger"]);
  });

  it("treat anything stored that is not one of them as the usual size", () => {
    expect(parseTextSize("large")).toBe("large");
    expect(parseTextSize("larger")).toBe("larger");
    expect(parseTextSize("normal")).toBe("normal");
    expect(parseTextSize("huge")).toBe("normal");
    expect(parseTextSize(null)).toBe("normal");
    expect(parseTextSize(undefined)).toBe("normal");
    expect(parseTextSize(3)).toBe("normal");
  });
});

describe("the text size before the page is drawn", () => {
  const run = (stored: string | null, throws = false) => {
    const dataset: Record<string, string> = {};
    const fakeLocalStorage = { getItem: () => (throws ? (() => { throw new Error("blocked"); })() : stored) };
    // The script is run exactly as the browser would, with only the two things it touches.
    new Function("localStorage", "document", TEXT_SIZE_BOOT)(fakeLocalStorage, { documentElement: { dataset } });
    return dataset;
  };

  it("sets the chosen size on the page", () => {
    expect(run("large")).toEqual({ textSize: "large" });
    expect(run("larger")).toEqual({ textSize: "larger" });
  });

  it("does nothing for the usual size, for nothing stored, or for something unknown", () => {
    expect(run(null)).toEqual({});
    expect(run("normal")).toEqual({});
    expect(run("<script>")).toEqual({});
  });

  it("never fails, even when the browser will not let it read", () => {
    expect(() => run(null, true)).not.toThrow();
    expect(run(null, true)).toEqual({});
  });

  it("runs in the head of every page, which allows for the attribute it sets", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("<script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_BOOT }} />");
    expect(layout).toContain("suppressHydrationWarning");
  });
});

describe("choosing a size", () => {
  const original = (globalThis as { window?: unknown; document?: unknown }).window;
  const originalDoc = (globalThis as { document?: unknown }).document;
  const store = new Map<string, string>();
  const events: string[] = [];
  const dataset: Record<string, string> = {};
  afterEach(() => {
    (globalThis as { window?: unknown }).window = original;
    (globalThis as { document?: unknown }).document = originalDoc;
    store.clear();
    events.length = 0;
    for (const k of Object.keys(dataset)) delete dataset[k];
  });
  const browser = (blocked = false) => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => (blocked ? (() => { throw new Error("x"); })() : (store.get(k) ?? null)),
        setItem: (k: string, v: string) => (blocked ? (() => { throw new Error("x"); })() : void store.set(k, v)),
        removeItem: (k: string) => (blocked ? (() => { throw new Error("x"); })() : void store.delete(k)),
      },
      dispatchEvent: (e: Event) => (events.push(e.type), true),
    };
    (globalThis as { document?: unknown }).document = { documentElement: { dataset } };
  };

  it("applies at once, is remembered, and is announced so the choice shows wherever it is read", () => {
    browser();
    setTextSize("large");
    expect(dataset.textSize).toBe("large");
    expect(store.get("ync.textSize")).toBe("large");
    expect(events).toContain("ync-text-size-changed");
  });

  it("goes back to the usual size by forgetting the choice, rather than storing 'normal'", () => {
    browser();
    setTextSize("larger");
    setTextSize("normal");
    expect(dataset.textSize).toBeUndefined();
    expect(store.has("ync.textSize")).toBe(false);
  });

  it("still changes the page when the browser will not store it", () => {
    browser(true);
    expect(() => setTextSize("large")).not.toThrow();
    expect(dataset.textSize).toBe("large");
  });
});

describe("what a larger size changes", () => {
  const css = read("src/app/globals.css");
  const sizes = (selector: string) => {
    const block = css.match(new RegExp(`${selector.replace(/[[\]"=]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
    return { body: Number(block.match(/--text-body:\s*(\d+)px/)?.[1]), small: Number(block.match(/--text-small:\s*(\d+)px/)?.[1]), label: Number(block.match(/--text-label:\s*(\d+)px/)?.[1]) };
  };

  it("makes every body size bigger at Large, and bigger again at Larger, with the smallest text never under 16px", () => {
    const large = sizes('html[data-text-size="large"]');
    const larger = sizes('html[data-text-size="larger"]');
    expect(large.body).toBeGreaterThan(17);
    expect(large.small).toBeGreaterThan(16);
    expect(large.label).toBeGreaterThan(14);
    expect(larger.body).toBeGreaterThan(large.body);
    expect(larger.small).toBeGreaterThan(large.small);
    expect(larger.label).toBeGreaterThan(large.label);
    expect(large.label).toBeGreaterThanOrEqual(16);
  });

  it("leaves the usual sizes exactly as they were", () => {
    expect(css).toMatch(/--text-body:\s*17px/);
    expect(css).toMatch(/--text-small:\s*16px/);
    expect(css).toMatch(/--text-label:\s*14px/);
  });

  it("is offered in Account, with the three choices, applying straight away", () => {
    const account = read("src/components/AccountSettingsForm.tsx");
    expect(account).toContain("useTextSize()");
    expect(account).toContain("onClick={() => setTextSize(s.value)}");
    expect(account).toContain('aria-label="Text size"');
  });
});

describe("telling us what you think", () => {
  it("opens an email to us, says which screen it was written from, and starts with a few questions", () => {
    const href = feedbackHref("Today");
    expect(href.startsWith(`mailto:${FEEDBACK_EMAIL}?`)).toBe(true);
    const params = new URL(href).searchParams;
    expect(params.get("subject")).toBe("Lark Hour feedback: Today");
    expect(params.get("body")).toContain("What I was trying to do:");
    expect(params.get("body")).toContain("What happened, or what I wish had happened:");
  });

  it("puts nothing about the person in it", () => {
    const href = decodeURIComponent(feedbackHref("My Week"));
    expect(href).not.toMatch(/user|member|@gmail|id=/i);
  });

  it("is findable: at the foot of Today and My Week as well as in Account", () => {
    expect(read("src/components/TodayView.tsx")).toContain('<FeedbackLink where="Today" />');
    expect(read("src/components/ThisWeekView.tsx")).toContain('<FeedbackLink where="My Week" />');
    expect(read("src/components/AccountSettingsForm.tsx")).toContain('href={feedbackHref("Account")}');
    expect(read("src/components/FeedbackLink.tsx")).toContain("Tell us what you think");
  });
});
