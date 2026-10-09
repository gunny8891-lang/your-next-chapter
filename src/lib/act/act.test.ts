import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { directionsUrl, travelModeToward } from "@/lib/act/directions";
import { buildIcs, foldLine, icsFileName, icsText, londonWallToUtc } from "@/lib/act/ics";
import { ideaActLinks, ideaCalendarUrl, itemCalendarUrl } from "@/lib/act/links";
import { longDate, shareMessage, SITE_URL, worthSharing } from "@/lib/act/share";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("how to get there", () => {
  it("opens the maps at the place, with the way of travelling, and no starting point", () => {
    const url = directionsUrl({ lat: 51.9014, lng: -0.1986 }, "walk")!;
    expect(url).toBe("https://www.google.com/maps/dir/?api=1&destination=51.901400%2C-0.198600&travelmode=walking");
    expect(url).not.toMatch(/origin/);
  });

  it("maps each way of travelling to the maps app's own word", () => {
    const mode = (m: "walk" | "drive" | "public transport" | "mixed") => new URL(directionsUrl({ lat: 51.5, lng: -0.1 }, m)!).searchParams.get("travelmode");
    expect(mode("walk")).toBe("walking");
    expect(mode("drive")).toBe("driving");
    expect(mode("public transport")).toBe("transit");
    expect(mode("mixed")).toBe("transit");
  });

  it("leaves the way of travelling to the maps app when it is not known", () => {
    expect(new URL(directionsUrl({ lat: 51.5, lng: -0.1 })!).searchParams.has("travelmode")).toBe(false);
  });

  it("is nothing when the place is not located or the position is nonsense", () => {
    expect(directionsUrl({ lat: null, lng: null })).toBeNull();
    expect(directionsUrl({ lat: undefined, lng: 1 })).toBeNull();
    expect(directionsUrl({ lat: Number.NaN, lng: 1 })).toBeNull();
    expect(directionsUrl({ lat: 95, lng: 0 })).toBeNull();
    expect(directionsUrl({ lat: 0, lng: 200 })).toBeNull();
  });

  it("works out the way this member would go from their own answers and the distance", () => {
    const home = { lat: 51.9253, lng: -0.0895 };
    const near = { lat: 51.9271, lng: -0.0964 }; // under a kilometre
    const far = { lat: 51.9017, lng: -0.2027 }; // about eight kilometres
    expect(travelModeToward(home, near, { drives: true, uses_public_transport: false, mobility_notes: null })).toBe("walk");
    expect(travelModeToward(home, far, { drives: true, uses_public_transport: false, mobility_notes: null })).toBe("drive");
    expect(travelModeToward(null, far, { drives: true, uses_public_transport: false, mobility_notes: null })).toBeNull();
    expect(travelModeToward(home, { lat: null, lng: null }, { drives: true, uses_public_transport: false, mobility_notes: null })).toBeNull();
  });
});

describe("London time as a real instant", () => {
  it("is an hour earlier than the clock in British Summer Time", () => {
    expect(londonWallToUtc("2026-10-10", "11:00").toISOString()).toBe("2026-10-10T10:00:00.000Z");
    expect(londonWallToUtc("2026-07-01", "00:30").toISOString()).toBe("2026-06-30T23:30:00.000Z");
  });

  it("is the same as the clock in winter", () => {
    expect(londonWallToUtc("2026-12-12", "11:00").toISOString()).toBe("2026-12-12T11:00:00.000Z");
  });

  it("gets either side of the clocks changing right", () => {
    // Clocks go back at 02:00 on Sunday 25 October 2026 and forward at 01:00 on Sunday 29 March 2026.
    expect(londonWallToUtc("2026-10-24", "23:00").toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(londonWallToUtc("2026-10-25", "12:00").toISOString()).toBe("2026-10-25T12:00:00.000Z");
    expect(londonWallToUtc("2026-03-28", "12:00").toISOString()).toBe("2026-03-28T12:00:00.000Z");
    expect(londonWallToUtc("2026-03-29", "12:00").toISOString()).toBe("2026-03-29T11:00:00.000Z");
  });
});

describe("the calendar file", () => {
  const event = {
    uid: "idea-abc",
    title: "Stevenage Museum",
    location: "St George's Way, Bedwell, SG1 1XX",
    description: "Planned with Lark Hour.\n\nThen: Frequency Coffee.",
    start: { date: "2026-10-10", clock: "11:00" },
    end: { date: "2026-10-10", clock: "12:00" },
    now: new Date("2026-10-09T08:00:00Z"),
  };

  it("is a valid calendar with one event, in UTC, with a reminder", () => {
    const ics = buildIcs(event);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("UID:idea-abc@larkhour.com");
    expect(ics).toContain("DTSTAMP:20261009T080000Z");
    expect(ics).toContain("DTSTART:20261010T100000Z");
    expect(ics).toContain("DTEND:20261010T110000Z");
    expect(ics).toContain("SUMMARY:Stevenage Museum");
    expect(ics).toContain("TRIGGER:-PT60M");
  });

  it("escapes what a calendar file cannot hold raw, so nothing can start a new line or property", () => {
    expect(icsText("a, b; c\\d\ne")).toBe("a\\, b\\; c\\\\d\\ne");
    const ics = buildIcs({ ...event, title: "Evil\r\nEND:VEVENT\r\nBEGIN:VEVENT", description: "x\nSUMMARY:injected" });
    // The typed new lines became the two characters backslash-n inside one line: no line of its own starts an event.
    const lines = ics.split("\r\n");
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines.filter((l) => l === "END:VEVENT")).toHaveLength(1);
    expect(lines.some((l) => l.startsWith("SUMMARY:injected"))).toBe(false);
  });

  it("uses only CRLF line ends and folds long lines at 75 bytes without breaking a character", () => {
    const long = buildIcs({ ...event, description: "é".repeat(200) });
    for (const line of long.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(long).not.toMatch(/[^\r]\n/);
    const unfolded = long.replace(/\r\n /g, "");
    // Putting the folded lines back together gives the whole text, unharmed.
    expect(unfolded).toContain("DESCRIPTION:" + "é".repeat(200));
    expect(foldLine("a".repeat(10))).toBe("a".repeat(10));
  });

  it("leaves the location out when there is none", () => {
    expect(buildIcs({ ...event, location: null })).not.toContain("LOCATION:");
  });

  it("gets a safe file name", () => {
    expect(icsFileName("Stevenage Museum")).toBe("lark-hour-stevenage-museum.ics");
    expect(icsFileName("Café & “Tea” Room / 5!")).toBe("lark-hour-cafe-tea-room-5.ics");
    expect(icsFileName("!!!")).toBe("lark-hour-outing.ics");
    expect(icsFileName("x".repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe("the link to a calendar file", () => {
  it("for an idea carries the day and the times, and the place to eat when there is one", () => {
    const url = ideaCalendarUrl({ activityId: "a1", date: "2026-10-10", start: "11:00", end: "12:30", foodId: "f1" })!;
    expect(url.startsWith("/api/calendar/file?")).toBe(true);
    const p = new URL(url, "https://x.test").searchParams;
    expect([p.get("activity"), p.get("date"), p.get("start"), p.get("end"), p.get("food")]).toEqual(["a1", "2026-10-10", "11:00", "12:30", "f1"]);
    expect(new URL(ideaCalendarUrl({ activityId: "a1", date: "2026-10-10", start: "11:00", end: "12:30" })!, "https://x.test").searchParams.has("food")).toBe(false);
  });

  it("is nothing when the times are not usable, rather than a link that fails", () => {
    expect(ideaCalendarUrl({ activityId: "a", date: "10/10/2026", start: "11:00", end: "12:00" })).toBeNull();
    expect(ideaCalendarUrl({ activityId: "a", date: "2026-10-10", start: "25:00", end: "26:00" })).toBeNull();
    expect(ideaCalendarUrl({ activityId: "a", date: "2026-10-10", start: "12:00", end: "11:00" })).toBeNull();
    expect(ideaCalendarUrl({ activityId: "a", date: "2026-10-10", start: "12:00", end: "12:00" })).toBeNull();
  });

  it("for something in the plan is just its id", () => {
    expect(itemCalendarUrl("i1")).toBe("/api/calendar/file?item=i1");
  });
});

describe("the message for a friend", () => {
  it("says what, when and where, and where to read more", () => {
    const m = shareMessage({ title: "A walk, then lunch", when: "Saturday 10 October", at: "11:00", place: "Stevenage Museum", address: "St George's Way, SG1 1XX", moreUrl: "https://www.stevenage.gov.uk/museum" });
    expect(m.title).toBe("A walk, then lunch");
    expect(m.text).toBe(
      ["A walk, then lunch", "Saturday 10 October, from 11:00", "At Stevenage Museum, St George's Way, SG1 1XX", "More: https://www.stevenage.gov.uk/museum", `Found with Lark Hour: ${SITE_URL}`].join("\n")
    );
  });

  it("leaves out what it does not know", () => {
    expect(shareMessage({ title: "Kenwood House" }).text).toBe(`Kenwood House\nFound with Lark Hour: ${SITE_URL}`);
  });

  it("does not say the address twice when the place already includes it", () => {
    const m = shareMessage({ title: "x", place: "Church Farm, Ardeley", address: "Church Farm, Ardeley" });
    expect(m.text.match(/Ardeley/g)).toHaveLength(1);
    expect(m.text).toContain("At Church Farm, Ardeley\n");
  });

  it("never says anything about the person sending it", () => {
    const text = shareMessage({ title: "A walk", when: "Monday", place: "Park" }).text;
    expect(text).not.toMatch(/\b(I |my |me )\b/i);
  });

  it("is kept to a length a message can hold", () => {
    expect(shareMessage({ title: "x".repeat(2000) }).text.length).toBeLessThanOrEqual(600);
  });

  it("writes a date in words", () => {
    expect(longDate("2026-10-10")).toBe("Saturday 10 October");
  });
});

describe("an idea's links", () => {
  const links = ideaActLinks({
    activityId: "a1", experienceTitle: "A museum visit", placeTitle: "Stevenage Museum", address: "St George's Way, Bedwell, SG1 1XX",
    lat: 51.9014, lng: -0.1986, mode: "walk", date: "2026-10-10", start: "11:00", end: "12:00", foodId: null, moreUrl: null,
  });

  it("has a map link, a calendar file and a message, all for the same outing", () => {
    expect(links.directions).toContain("destination=51.901400");
    expect(links.calendar).toContain("activity=a1");
    expect(links.share.text).toContain("Saturday 10 October, from 11:00");
    expect(links.share.text).toContain("At Stevenage Museum");
  });

  it("drops the map link for a place that is not located", () => {
    expect(ideaActLinks({ activityId: "a1", experienceTitle: "t", placeTitle: "p", address: null, lat: null, lng: null, mode: null, date: "2026-10-10", start: "11:00", end: "12:00", foodId: null, moreUrl: null }).directions).toBeNull();
  });
});

describe("where they appear", () => {
  it("under the plan on a card, and on My Week's outing sheet, only for what can be done", () => {
    expect(read("src/components/ExperienceCard.tsx")).toContain("<OutAndAbout act={option.act} />");
    expect(read("src/components/ItemSheet.tsx")).toContain('{"act" in item && item.act && <OutAndAbout act={item.act} />}');
    const row = read("src/components/OutAndAbout.tsx");
    expect(row).toContain("{act.directions && (");
    expect(row).toContain("{act.calendar && (");
    expect(row).toContain("download");
    expect(row).toContain('target="_blank" rel="noopener noreferrer"');
  });

  it("on My Week, a calendar file is offered only for something they have said yes to", () => {
    expect(read("src/app/week/page.tsx")).toContain('calendar: row.member_action === "accepted" ? itemCalendarUrl(row.id) : null,');
  });

  it("the file comes from signed-in members only, with the content taken from the catalogue and the times checked", () => {
    const route = read("src/app/api/calendar/file/route.ts");
    expect(route).toContain("if (!user) return new Response");
    expect(route).toContain("status: 401");
    expect(route).toContain("UUID.test(activityId)");
    expect(route).toContain("CLOCK.test(start)");
    expect(route).toContain("MAX_MINUTES");
    expect(route).toContain('.from("activities").select("title, address, booking_url")');
    expect(route).toContain('"Content-Type": "text/calendar; charset=utf-8"');
    expect(route).toContain('"Cache-Control": "no-store"');
    // Nothing the person who built the link typed becomes the title, place or notes.
    expect(route).not.toContain('params.get("title")');
    expect(route).not.toContain('params.get("location")');
  });

  it("asks nothing of the maps app about who they are", () => {
    expect(read("src/lib/act/directions.ts")).not.toMatch(/origin/);
  });
});

describe("a link worth giving someone", () => {
  it("is the place's own page or booking page, never the openstreetmap listing it was found on", () => {
    expect(worthSharing("https://www.hopecorner.org/visit")).toBe("https://www.hopecorner.org/visit");
    expect(worthSharing("https://www.openstreetmap.org/node/5806215288")).toBeNull();
    expect(worthSharing(null)).toBeNull();
    expect(worthSharing("")).toBeNull();
  });

  it("is used for the calendar file and the Google calendar event as well as the message to a friend", () => {
    expect(readFileSync(join(process.cwd(), "src/lib/calendar/event.ts"), "utf8")).toContain("worthSharing(item.bookingUrl)");
    expect(readFileSync(join(process.cwd(), "src/app/api/calendar/file/route.ts"), "utf8")).toContain("worthSharing(activity.booking_url)");
  });
});
