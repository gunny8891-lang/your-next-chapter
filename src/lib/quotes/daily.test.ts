import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { attribution, QUOTES, quoteForDate } from "@/lib/quotes/daily";
import { setDailyQuoteVisible } from "@/lib/quotes/visibility";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** Writers who died more than seventy years ago, so their words are free to quote. Adding someone here is a decision, not a default. */
const LONG_OUT_OF_COPYRIGHT = new Set([
  "Alfred, Lord Tennyson", "Henry David Thoreau", "Charles Dickens", "William Shakespeare", "Robert Browning", "W. H. Davies",
  "Ralph Waldo Emerson", "Robert Louis Stevenson", "Henry Wadsworth Longfellow", "Jane Austen", "Rudyard Kipling", "George Eliot",
  "Walt Whitman", "Emily Dickinson", "John Muir", "Samuel Johnson", "William Blake", "Lewis Carroll", "Benjamin Franklin",
  "William Wordsworth", "Marcus Aurelius", "William Cowper", "John Ruskin", "Oscar Wilde", "Charlotte Brontë", "John Keats",
]);

describe("the list of quotations", () => {
  it("is long enough that a month does not repeat", () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(40);
  });

  it("names the writer, the work and the year of every one, so anyone can check it", () => {
    for (const q of QUOTES) {
      expect(q.text.trim().length, q.text).toBeGreaterThan(10);
      expect(q.author.trim(), q.text).not.toBe("");
      expect(q.work.trim(), q.text).not.toBe("");
      expect(q.year, q.text).toBeGreaterThan(1500);
    }
  });

  it("is short enough to read in a glance", () => {
    for (const q of QUOTES) expect(q.text.length, q.text).toBeLessThanOrEqual(220);
  });

  it("has no line twice", () => {
    const texts = QUOTES.map((q) => q.text.toLowerCase());
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("only quotes writers who died long ago, and nothing written within living memory of copyright", () => {
    for (const q of QUOTES) {
      expect(LONG_OUT_OF_COPYRIGHT.has(q.author), q.author).toBe(true);
      expect(q.year, `${q.author}: ${q.work}`).toBeLessThanOrEqual(1915);
    }
  });

  it("leaves out the famous lines that are really somebody else's, or nobody's", () => {
    const wrong = [
      "never too late to be what you might have been",
      "every day is the best day in the year",
      "be the change",
      "go confidently in the direction of your dreams",
      "it's not the years in your life",
      "be yourself; everyone else is already taken",
      "life is a journey, not a destination",
    ];
    const all = QUOTES.map((q) => q.text.toLowerCase()).join("\n");
    for (const line of wrong) expect(all, line).not.toContain(line);
  });

  it("uses Thoreau's own words from Walden, not the greetings-card version", () => {
    const walden = QUOTES.find((q) => q.text.includes("advances confidently in the direction of his dreams"));
    expect(walden?.work).toBe("Walden");
    expect(walden?.text).toContain("a success unexpected in common hours");
  });
});

describe("which one is shown today", () => {
  it("is the same for the same date, whenever and wherever it is asked", () => {
    expect(quoteForDate("2026-10-09")).toBe(quoteForDate("2026-10-09"));
  });

  it("changes every day, and works through the whole list before it repeats", () => {
    const start = "2026-10-09";
    const seen = new Set<string>();
    let previous = quoteForDate(start).text;
    for (let i = 0; i < QUOTES.length; i++) {
      const date = new Date(Date.UTC(2026, 9, 9 + i)).toISOString().slice(0, 10);
      const q = quoteForDate(date);
      if (i > 0) expect(q.text, date).not.toBe(previous);
      previous = q.text;
      seen.add(q.text);
    }
    expect(seen.size).toBe(QUOTES.length);
  });

  it("comes round to the same one again after the whole list", () => {
    const later = new Date(Date.UTC(2026, 9, 9 + QUOTES.length)).toISOString().slice(0, 10);
    expect(quoteForDate(later)).toBe(quoteForDate("2026-10-09"));
  });

  it("copes with a year end, a leap day and dates long ago", () => {
    for (const date of ["2026-12-31", "2027-01-01", "2028-02-29", "1970-01-01", "1969-12-31", "2100-06-15"]) {
      expect(QUOTES).toContain(quoteForDate(date));
    }
  });

  it("is not moved by the clocks changing", () => {
    // Date strings, not instants: the day before and the day after the clocks go back are simply consecutive days.
    expect(quoteForDate("2026-10-25")).not.toBe(quoteForDate("2026-10-26"));
    expect(quoteForDate("2026-03-29")).not.toBe(quoteForDate("2026-03-30"));
  });
});

describe("how it is credited", () => {
  it("gives the writer, the work and the year", () => {
    expect(attribution({ text: "x", author: "Alfred, Lord Tennyson", work: "Ulysses", year: 1842 })).toBe("Alfred, Lord Tennyson, Ulysses (1842)");
  });

  it("says c. where the date is approximate", () => {
    expect(attribution({ text: "x", author: "William Shakespeare", work: "Hamlet", year: 1600, circa: true })).toBe("William Shakespeare, Hamlet (c. 1600)");
  });

  it("is circa for every Shakespeare line, since the plays cannot be dated to a year", () => {
    for (const q of QUOTES.filter((x) => x.author === "William Shakespeare")) expect(q.circa, q.work).toBe(true);
  });
});

describe("hiding it", () => {
  const store = new Map<string, string>();
  const events: string[] = [];
  const g = globalThis as unknown as { window?: unknown };
  const original = g.window;

  afterEach(() => {
    g.window = original;
    store.clear();
    events.length = 0;
  });

  const withBrowser = (throwing = false) => {
    g.window = {
      localStorage: {
        getItem: (k: string) => {
          if (throwing) throw new Error("blocked");
          return store.get(k) ?? null;
        },
        setItem: (k: string, v: string) => {
          if (throwing) throw new Error("blocked");
          store.set(k, v);
        },
        removeItem: (k: string) => {
          if (throwing) throw new Error("blocked");
          store.delete(k);
        },
      },
      dispatchEvent: (e: Event) => (events.push(e.type), true),
    };
  };

  it("is remembered on this device and announced, so Today and Account agree", () => {
    withBrowser();
    setDailyQuoteVisible(false);
    expect(store.get("ync.dailyQuote.hidden")).toBe("1");
    expect(events).toContain("ync-daily-quote-changed");
    setDailyQuoteVisible(true);
    expect(store.has("ync.dailyQuote.hidden")).toBe(false);
  });

  it("does not fail when the browser will not store it", () => {
    withBrowser(true);
    expect(() => setDailyQuoteVisible(false)).not.toThrow();
    expect(() => setDailyQuoteVisible(true)).not.toThrow();
  });
});

describe("where it appears", () => {
  it("under the date on Today, from the member's own (London) day, with a way to hide it", () => {
    expect(read("src/app/today/page.tsx")).toContain("quote={quoteForDate(londonToday())}");
    expect(read("src/components/TodayView.tsx")).toContain("{quote && <DailyQuote quote={quote} />}");
    const quote = read("src/components/DailyQuote.tsx");
    expect(quote).toContain("setDailyQuoteVisible(false)");
    expect(quote).toContain('aria-label="Hide the daily quotation"');
    expect(quote).toContain("<blockquote");
    expect(quote).toContain("<figcaption");
  });

  it("can be turned back on, or off, in Account", () => {
    const account = read("src/components/AccountSettingsForm.tsx");
    expect(account).toContain("useDailyQuoteVisible()");
    expect(account).toContain("setDailyQuoteVisible(e.target.checked)");
    // It is a choice for the device, so it is not part of what the form saves to the profile.
    expect(account).not.toMatch(/name="daily_quote"/);
  });
});
