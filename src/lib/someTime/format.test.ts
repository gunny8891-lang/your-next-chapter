import { describe, expect, it } from "vitest";
import { humanReason } from "@/lib/someTime/copy";
import { cleanFirstName, clockToMinutes, doorToDoorMinutes, friendlyDuration, greetingFor, placeLabel, priceBand, settingOf } from "@/lib/someTime/format";

describe("priceBand", () => {
  it("shows a band, not a false precision", () => {
    expect(priceBand(0)).toBe("Free");
    expect(priceBand(8)).toBe("£");
    expect(priceBand(10)).toBe("£");
    expect(priceBand(11)).toBe("££");
    expect(priceBand(30)).toBe("££");
    expect(priceBand(31)).toBe("£££");
  });

  it("shows nothing when the price is not known", () => {
    expect(priceBand(null)).toBeNull();
    expect(priceBand(undefined)).toBeNull();
  });
});

describe("placeLabel", () => {
  it("shows the neighbourhood, not the street or postcode", () => {
    expect(placeLabel("Chaplin Square, Fallow Corner, N12 0GL")).toBe("Fallow Corner");
    expect(placeLabel("5 Nether Street, North Finchley, N12 0GA")).toBe("North Finchley");
    expect(placeLabel("Ewen Hall, Barnet")).toBe("Barnet");
  });

  it("keeps a lone name, and copes with a postcode-only or empty address", () => {
    expect(placeLabel("Barnet")).toBe("Barnet");
    expect(placeLabel("EN5 1AB")).toBeNull();
    expect(placeLabel("")).toBeNull();
    expect(placeLabel(null)).toBeNull();
  });
});

describe("times", () => {
  it("reads clock labels", () => {
    expect(clockToMinutes("14:25")).toBe(14 * 60 + 25);
    expect(clockToMinutes("2pm")).toBeNull();
  });

  it("works out door to door, including past midnight", () => {
    expect(doorToDoorMinutes("14:25", "16:49")).toBe(144);
    expect(doorToDoorMinutes("22:00", "00:30")).toBe(150);
    expect(doorToDoorMinutes("nope", "16:49")).toBeNull();
  });
});

describe("greetingFor", () => {
  it("fits the part of the day", () => {
    expect(greetingFor(6)).toBe("Good morning");
    expect(greetingFor(11)).toBe("Good morning");
    expect(greetingFor(12)).toBe("Good afternoon");
    expect(greetingFor(17)).toBe("Good afternoon");
    expect(greetingFor(18)).toBe("Good evening");
    expect(greetingFor(23)).toBe("Good evening");
  });
});

describe("cleanFirstName", () => {
  it("keeps an ordinary name", () => {
    expect(cleanFirstName("  Matt ")).toBe("Matt");
    expect(cleanFirstName("Mary Anne")).toBe("Mary Anne");
  });

  it("strips control characters and markup, collapses spaces, and caps the length", () => {
    expect(cleanFirstName("Ma\u0000tt<script>")).toBe("Mattscript");
    expect(cleanFirstName("A    B")).toBe("A B");
    expect(cleanFirstName("x".repeat(100))).toHaveLength(40);
  });

  it("is empty for anything that is not a usable name", () => {
    expect(cleanFirstName(undefined)).toBe("");
    expect(cleanFirstName(null)).toBe("");
    expect(cleanFirstName(42)).toBe("");
    expect(cleanFirstName("   ")).toBe("");
  });
});

describe("humanReason", () => {
  it("turns internal reasons into a natural sentence", () => {
    expect(humanReason(["the weather suits being outdoors", "it matches your interest in history"])).toBe(
      "It is perfect weather for it today, and it matches your interest in history."
    );
    expect(humanReason(["it supports your goal of staying active"])).toBe("It supports your goal of staying active.");
    expect(humanReason(["you have enjoyed active outings lately"])).toBe("You have been enjoying active outings lately.");
    expect(humanReason(["it is actually happening today"])).toBe("It is on today.");
  });

  it("uses at most two reasons, and never invents one", () => {
    expect(humanReason(["it supports your goal of staying active", "the weather suits being outdoors", "it is actually happening today"])).toBe(
      "It supports your goal of staying active, and it is perfect weather for it today."
    );
    expect(humanReason([])).toBe("");
  });

  it("passes an unfamiliar reason through rather than losing it", () => {
    expect(humanReason(["something new"])).toBe("Something new.");
  });
});

describe("settingOf", () => {
  it("says whether something is mostly outdoors or indoors", () => {
    expect(settingOf(["walking", "nature"])).toBe("outdoors");
    expect(settingOf(["museum", "history"])).toBe("indoors");
    expect(settingOf(["food-venue", "cafe"])).toBe("indoors");
  });

  it("prefers outdoors when something is both, and says nothing when it cannot tell", () => {
    expect(settingOf(["gardens", "cafe"])).toBe("outdoors");
    expect(settingOf(["volunteering"])).toBeNull();
    expect(settingOf([])).toBeNull();
  });
});

describe("friendlyDuration", () => {
  it("rounds short times to five minutes", () => {
    expect(friendlyDuration(20)).toBe("20 min");
    expect(friendlyDuration(43)).toBe("45 min");
    expect(friendlyDuration(50)).toBe("50 min");
    expect(friendlyDuration(3)).toBe("5 min");
  });

  it("rounds longer times to the half hour, as a person would say it", () => {
    expect(friendlyDuration(60)).toBe("1 hour");
    expect(friendlyDuration(75)).toBe("1½ hours");
    expect(friendlyDuration(132)).toBe("2 hours");
    expect(friendlyDuration(144)).toBe("2½ hours");
    expect(friendlyDuration(210)).toBe("3½ hours");
    expect(friendlyDuration(240)).toBe("4 hours");
  });

  it("never says nought hours", () => {
    expect(friendlyDuration(51)).toBe("1 hour");
    expect(friendlyDuration(55)).toBe("1 hour");
  });
});
