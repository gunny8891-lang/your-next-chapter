import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dateLabel,
  daysUntil,
  inOrder,
  isValidMonthDay,
  milestone,
  nextOccurrence,
  ordinal,
  parseNewDate,
  upcoming,
  whenLabel,
  yearsOn,
  type ImportantDate,
} from "@/lib/dates/importantDates";
import { loadImportantDates, tableMissing } from "@/lib/dates/store";
import { memberLifeText } from "@/lib/chat/memberContext";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

// Friday 16 October 2026.
const TODAY = "2026-10-16";
const date = (over: Partial<ImportantDate> & Pick<ImportantDate, "month" | "day">): ImportantDate => ({ id: "d", title: "Margaret's birthday", kind: "birthday", year: null, ...over });

describe("when a date next comes round", () => {
  it("is this year if it has not gone, today included, and next year if it has", () => {
    expect(nextOccurrence(10, 16, TODAY)).toBe("2026-10-16");
    expect(nextOccurrence(10, 17, TODAY)).toBe("2026-10-17");
    expect(nextOccurrence(10, 15, TODAY)).toBe("2027-10-15");
    expect(nextOccurrence(1, 3, TODAY)).toBe("2027-01-03");
    expect(nextOccurrence(12, 25, TODAY)).toBe("2026-12-25");
  });

  it("keeps a 29 February on the 28th in a year without one", () => {
    expect(nextOccurrence(2, 29, "2026-10-16")).toBe("2027-02-28");
    expect(nextOccurrence(2, 29, "2027-10-16")).toBe("2028-02-29");
    expect(nextOccurrence(2, 29, "2028-01-10")).toBe("2028-02-29");
  });

  it("counts the days across a year end and a clock change", () => {
    expect(daysUntil(10, 16, TODAY)).toBe(0);
    expect(daysUntil(10, 17, TODAY)).toBe(1);
    expect(daysUntil(12, 31, TODAY)).toBe(76);
    expect(daysUntil(1, 1, "2026-12-31")).toBe(1);
    expect(daysUntil(3, 29, "2026-03-28")).toBe(1);
  });

  it("only allows days that exist", () => {
    expect(isValidMonthDay(2, 29)).toBe(true);
    expect(isValidMonthDay(2, 30)).toBe(false);
    expect(isValidMonthDay(4, 31)).toBe(false);
    expect(isValidMonthDay(12, 31)).toBe(true);
    expect(isValidMonthDay(0, 5)).toBe(false);
    expect(isValidMonthDay(13, 5)).toBe(false);
    expect(isValidMonthDay(5, 0)).toBe(false);
    expect(isValidMonthDay(5.5, 1)).toBe(false);
  });
});

describe("saying how far away it is, and what it is", () => {
  it("reads as a person would say it", () => {
    expect(whenLabel(0)).toBe("today");
    expect(whenLabel(1)).toBe("tomorrow");
    expect(whenLabel(5)).toBe("in 5 days");
    expect(whenLabel(20)).toBe("in 3 weeks");
    expect(whenLabel(120)).toBe("in 4 months");
  });

  it("says how old they are turning, or which anniversary, when the year is known", () => {
    expect(yearsOn({ month: 10, day: 20, year: 1956 }, TODAY)).toBe(70);
    expect(yearsOn({ month: 10, day: 10, year: 1956 }, TODAY)).toBe(71);
    expect(yearsOn({ month: 10, day: 20, year: null }, TODAY)).toBeNull();
    expect(milestone(date({ month: 10, day: 20, year: 1956 }), TODAY)).toBe("turning 70");
    expect(milestone(date({ month: 10, day: 20, year: 1986, kind: "anniversary" }), TODAY)).toBe("40th anniversary");
    expect(milestone(date({ month: 10, day: 20, year: 1986, kind: "remembrance" }), TODAY)).toBeNull();
    expect(milestone(date({ month: 10, day: 20 }), TODAY)).toBeNull();
  });

  it("writes ordinals properly", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 40, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "40th", "101st", "111th"]);
  });

  it("writes the date with the year only when it is held", () => {
    expect(dateLabel({ month: 3, day: 12, year: null })).toBe("12 March");
    expect(dateLabel({ month: 3, day: 12, year: 1954 })).toBe("12 March 1954");
  });
});

describe("what is coming up", () => {
  const dates = [
    date({ id: "a", title: "Far", month: 6, day: 1 }),
    date({ id: "b", title: "Soon", month: 10, day: 19 }),
    date({ id: "c", title: "Today", month: 10, day: 16 }),
    date({ id: "d", title: "Fortnight", month: 10, day: 30 }),
    date({ id: "e", title: "Just past", month: 10, day: 15 }),
  ];

  it("is those within the time given, soonest first, today included, and not what has just passed", () => {
    expect(upcoming(dates, TODAY, 14).map((d) => d.id)).toEqual(["c", "b", "d"]);
    expect(upcoming(dates, TODAY, 3).map((d) => d.id)).toEqual(["c", "b"]);
    expect(upcoming([], TODAY, 14)).toEqual([]);
  });

  it("says how far away each is, and what is special about it", () => {
    const [first] = upcoming([date({ id: "x", title: "Dad", month: 10, day: 18, year: 1946 })], TODAY, 14);
    expect(first).toMatchObject({ days: 2, when: "in 2 days", note: "turning 80", kind: "birthday" });
  });

  it("puts every date in order of the next to come, whatever the year", () => {
    expect(inOrder(dates, TODAY).map((d) => d.id)).toEqual(["c", "b", "d", "a", "e"]);
  });
});

describe("what arrives from the form", () => {
  const ok = { title: "  Margaret's   birthday ", kind: "birthday", month: "3", day: "12", year: "1954" };

  it("is tidied and kept", () => {
    expect(parseNewDate(ok, 2026)).toEqual({ title: "Margaret's birthday", kind: "birthday", month: 3, day: 12, year: 1954 });
    expect(parseNewDate({ ...ok, year: "" }, 2026)?.year).toBeNull();
    expect(parseNewDate({ ...ok, year: undefined }, 2026)?.year).toBeNull();
  });

  it("is refused when it could not be a date, or has no name, or a year that cannot be", () => {
    for (const bad of [
      { ...ok, title: "   " },
      { ...ok, title: "x".repeat(81) },
      { ...ok, kind: "party" },
      { ...ok, month: "13" },
      { ...ok, day: "31", month: "4" },
      { ...ok, day: "0" },
      { ...ok, day: "abc" },
      { ...ok, year: "2030" },
      { ...ok, year: "1800" },
      { ...ok, year: "19.5" },
      null,
      "text",
    ]) {
      expect(parseNewDate(bad, 2026), JSON.stringify(bad)).toBeNull();
    }
  });

  it("strips control characters from the name", () => {
    expect(parseNewDate({ ...ok, title: "Anna\u0000\u0007 Smith" }, 2026)?.title).toBe("Anna Smith");
  });
});

describe("reading them", () => {
  const db = (answer: unknown, throws = false) =>
    ({
      from: () => {
        if (throws) throw new Error("db");
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq", "limit"]) chain[m] = () => chain;
        chain.then = (resolve: (v: unknown) => void) => resolve(answer);
        return chain;
      },
    }) as unknown as SupabaseClient;

  it("gives them back, and skips a row that could not be a date", async () => {
    const out = await loadImportantDates(
      db({
        data: [
          { id: "1", title: "Anna", kind: "birthday", month: 3, day: 12, year: 1954 },
          { id: "2", title: "Bad", kind: "birthday", month: 2, day: 31, year: null },
          { id: "3", title: "Odd", kind: "party", month: 3, day: 1, year: null },
        ],
        error: null,
      }),
      "m1"
    );
    expect(out).toEqual([{ id: "1", title: "Anna", kind: "birthday", month: 3, day: 12, year: 1954 }]);
  });

  it("is an empty list, not a failure, when the table is not there yet or cannot be read", async () => {
    const warn = console.warn;
    console.warn = () => {};
    expect(await loadImportantDates(db({ data: null, error: { message: 'relation "important_dates" does not exist' } }), "m1")).toEqual([]);
    expect(await loadImportantDates(db(null, true), "m1")).toEqual([]);
    console.warn = warn;
    expect(tableMissing({ code: "42P01" })).toBe(true);
    expect(tableMissing({ code: "PGRST205" })).toBe(true);
    expect(tableMissing({ message: "Could not find the table in the schema cache" })).toBe(true);
    expect(tableMissing({ message: "boom" })).toBe(false);
    expect(tableMissing(null)).toBe(false);
  });
});

describe("how it is built into the app", () => {
  it("is a private table with a month, a day and an optional year, owned by the member, gone with the account", () => {
    const sql = read("supabase/migrations/20260101000028_important_dates.sql");
    expect(sql).toMatch(/create table public\.important_dates/);
    expect(sql).toMatch(/member_id uuid not null references public\.users \(id\) on delete cascade/);
    expect(sql).toMatch(/month smallint not null check \(month between 1 and 12\)/);
    expect(sql).toMatch(/day smallint not null check \(day between 1 and 31\)/);
    expect(sql).toMatch(/year smallint check/);
    expect(sql).toMatch(/enable row level security/);
    for (const verb of ["select", "insert", "update", "delete"]) expect(sql).toContain(`for ${verb}`);
    expect(sql).not.toMatch(/is_admin\(\)/);
    expect(sql).toMatch(/grant select, insert, update, delete on public\.important_dates to authenticated/);
  });

  it("is added and removed by actions that check who is asking and keep to the member's own", () => {
    const actions = read("src/app/chapter/dateActions.ts");
    expect(actions.match(/auth\.getUser\(\)/g)).toHaveLength(2);
    expect(actions).toContain('.eq("member_id", user.id)');
    expect(actions).toContain("MAX_DATES_PER_MEMBER");
    expect(actions).toContain("parseNewDate(raw");
    expect(actions).toContain('revalidatePath("/today")');
  });

  it("is on My Chapter, and what is coming up is on Today, from a table that may not exist yet", () => {
    expect(read("src/app/chapter/page.tsx")).toContain("loadImportantDates(supabase, user.id)");
    expect(read("src/components/MyChapterView.tsx")).toContain("<ImportantDates");
    expect(read("src/app/today/page.tsx")).toContain("upcoming(importantDates, londonToday(), TODAY_LOOKS_AHEAD_DAYS)");
    expect(read("src/components/TodayView.tsx")).toContain("Coming up");
  });

  it("is told to the concierge as a kind and how far away, never whose", () => {
    const text = memberLifeText({ wishes: [], people: [], planned: 0, went: 0, dates: [{ kind: "birthday", days: 5, note: "turning 70" }, { kind: "anniversary", days: 0, note: null }] });
    expect(text).toContain("a birthday in 5 days (turning 70)");
    expect(text).toContain("an anniversary today");
    expect(text).toContain("no names are given to you");
    expect(text).not.toMatch(/Margaret/);
    expect(memberLifeText({ wishes: [], people: [], planned: 0, went: 0 })).not.toContain("Dates they asked us to remember");
  });

  it("is disclosed in the privacy notice", () => {
    expect(read("src/lib/legal/privacy.ts")).toContain('tables: ["people", "goals", "important_dates"]');
  });
});
