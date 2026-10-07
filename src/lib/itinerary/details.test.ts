import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aboutText, buildItemDetails, hasDetails, hoursText, journeyText, type DetailsInput } from "@/lib/itinerary/details";

const BARNET = { lat: 51.65309, lng: -0.2002261 };
const km = (distance: number) => ({ lat: BARNET.lat + distance / 111, lng: BARNET.lng });

const base = (over: Partial<DetailsInput> = {}): DetailsInput => ({
  description: null,
  recurrenceRule: null,
  durationMinutes: null,
  bookingUrl: null,
  accessibilityNotes: null,
  day: "Fri",
  lat: null,
  lng: null,
  home: { lat: BARNET.lat, lng: BARNET.lng },
  travel: { drives: true, uses_public_transport: null, mobility_notes: null },
  ...over,
});

describe("what it is", () => {
  it("keeps a plain description, collapsing stray whitespace", () => {
    expect(aboutText("A weekly   walk along the\nriver, with tea afterwards.")).toBe("A weekly walk along the river, with tea afterwards.");
  });

  it("drops web addresses, and anything too thin to help", () => {
    expect(aboutText("Friendly befriending service. More at https://example.org/info today.")).toBe("Friendly befriending service. More at today.");
    expect(aboutText("Walk")).toBeNull();
    expect(aboutText(null)).toBeNull();
    expect(aboutText("")).toBeNull();
  });

  it("does not repeat the title as a description", () => {
    expect(aboutText("Richmond Park Deer Walk", "Richmond Park Deer Walk")).toBeNull();
  });

  it("cuts a long description at the end of a sentence, or at a word", () => {
    const sentence = "A relaxed riverside walk led by volunteers, open to all abilities. ";
    const long = sentence.repeat(8).trim();
    const cut = aboutText(long)!;
    expect(cut.length).toBeLessThanOrEqual(300);
    expect(cut.endsWith(".")).toBe(true);
    const noStops = aboutText("word ".repeat(100).trim())!;
    expect(noStops.endsWith("…")).toBe(true);
    expect(noStops.length).toBeLessThanOrEqual(301);
  });
});

describe("whether it is open", () => {
  const rule = "Mo-Fr 09:00-17:00; Sa 10:00-14:00; Su off";

  it("says when it opens on the planned day", () => {
    expect(hoursText(rule, "Fri")).toBe("Open 09:00–17:00 on Friday");
    expect(hoursText(rule, "Sat")).toBe("Open 10:00–14:00 on Saturday");
  });

  it("warns when it is shut that day", () => {
    expect(hoursText(rule, "Sun")).toBe("Closed on Sunday");
  });

  it("handles a split day, an all-day place and a late night", () => {
    expect(hoursText("Tu-Su 12:00-14:30,17:30-22:00", "Tue")).toBe("Open 12:00–14:30 and 17:30–22:00 on Tuesday");
    expect(hoursText("24/7", "Wed")).toBe("Open all day on Wednesday");
    expect(hoursText("Fr 22:00-02:00", "Fri")).toBe("Open 22:00–02:00 on Friday");
  });

  it("says nothing when the hours are unknown or not understood, rather than guess", () => {
    expect(hoursText(null, "Fri")).toBeNull();
    expect(hoursText("", "Fri")).toBeNull();
    expect(hoursText("Every second Tuesday, ask at the desk", "Tue")).toBeNull();
    expect(hoursText("sunrise-sunset", "Tue")).toBeNull();
    expect(hoursText(rule, "Funday")).toBeNull();
  });
});

describe("how far it is", () => {
  const profile = { drives: true, uses_public_transport: null, mobility_notes: null };

  it("gives minutes, how, and the distance in miles", () => {
    const there = km(5.6); // about 3.5 miles
    const text = journeyText({ ...there, home: BARNET, travel: profile })!;
    expect(text).toMatch(/^About \d+ min by car \(3\.\d miles\)$/);
  });

  it("walks when it is close, and says so", () => {
    const text = journeyText({ ...km(0.6), home: BARNET, travel: profile })!;
    expect(text).toMatch(/on foot/);
  });

  it("uses buses or trains for someone who does not drive", () => {
    const text = journeyText({ ...km(6), home: BARNET, travel: { drives: false, uses_public_transport: true, mobility_notes: null } })!;
    expect(text).toMatch(/by bus or train/);
  });

  it("says 'very close to home' for next door", () => {
    expect(journeyText({ ...km(0.05), home: BARNET, travel: profile })).toMatch(/very close to home/);
  });

  it("is left out when either place is unknown", () => {
    expect(journeyText({ lat: null, lng: null, home: BARNET, travel: profile })).toBeNull();
    expect(journeyText({ ...km(2), home: { lat: null, lng: null }, travel: profile })).toBeNull();
  });
});

describe("the whole set of details", () => {
  it("puts them together, and shows only a real web address", () => {
    const d = buildItemDetails(
      base({
        description: "A weekly befriending service run with Age UK, for people who would welcome a chat.",
        recurrenceRule: "Mo-Fr 10:00-16:00",
        durationMinutes: 90,
        bookingUrl: "https://www.example.org/befriending",
        accessibilityNotes: "  Step-free access.  Accessible toilet. ",
        ...km(3),
      })
    );
    expect(d.about).toMatch(/befriending service/);
    expect(d.hours).toBe("Open 10:00–16:00 on Friday");
    expect(d.duration).toBe("About 1½ hours");
    expect(d.journey).toMatch(/^About \d+ min/);
    expect(d.website).toBe("https://www.example.org/befriending");
    expect(d.accessibility).toBe("Step-free access. Accessible toilet.");
    expect(hasDetails(d)).toBe(true);
  });

  it("ignores a booking 'url' that is not a web address", () => {
    expect(buildItemDetails(base({ bookingUrl: "javascript:alert(1)" })).website).toBeNull();
    expect(buildItemDetails(base({ bookingUrl: "call 020 8000 0000" })).website).toBeNull();
    expect(buildItemDetails(base({ bookingUrl: "http://example.org" })).website).toBe("http://example.org");
  });

  it("leaves out whatever is not known, and knows when there is nothing to show", () => {
    const d = buildItemDetails(base());
    expect(d).toEqual({ about: null, hours: null, duration: null, journey: null, website: null, accessibility: null });
    expect(hasDetails(d)).toBe(false);
    expect(hasDetails(null)).toBe(false);
    expect(hasDetails(undefined)).toBe(false);
  });

  it("does not show a zero or negative duration", () => {
    expect(buildItemDetails(base({ durationMinutes: 0 })).duration).toBeNull();
    expect(buildItemDetails(base({ durationMinutes: -5 })).duration).toBeNull();
  });
});

describe("where the details come from and where they show", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("the week page asks for the catalogue fields and builds the details for each outing", () => {
    const page = read("src/app/week/page.tsx");
    for (const column of ["description", "recurrence_rule", "duration_minutes", "location_lat", "location_lng", "accessibility_notes"]) expect(page, column).toContain(column);
    expect(page).toContain("details: buildItemDetails({");
    expect(page).toContain("home: { lat: profile.location_lat, lng: profile.location_lng }");
  });

  it("the outing's sheet shows how long, how far, whether it is open, access, and a link to find out more", () => {
    const sheet = read("src/components/ItemSheet.tsx");
    for (const field of ["extra?.duration", "extra?.journey", "extra?.hours", "extra?.accessibility", "extra?.website", "extra.about"]) expect(sheet, field).toContain(field);
    expect(sheet).toContain("Find out more or sign up");
    expect(sheet).toContain('rel="noopener noreferrer"');
  });
});

describe("tidying a description", () => {
  it("drops a raw opening-hours code (shown properly as its own line instead)", () => {
    expect(aboutText("Museum in Colindale. Opening hours: Mo-Su 10:00-17:00. A place to visit rather than a scheduled event.")).toBe("Museum in Colindale. A place to visit rather than a scheduled event.");
  });
});

describe("a volunteering role is not an outing you just turn up to", () => {
  it("offers 'Yes, I'll look into it' for a Give Back role and 'Yes, I'll go' for the rest", () => {
    const sheet = readFileSync(join(process.cwd(), "src", "components", "ItemSheet.tsx"), "utf8");
    expect(sheet).toContain('item.category === "Give Back" ? "Yes, I\'ll look into it" : "Yes, I\'ll go"');
  });
});
