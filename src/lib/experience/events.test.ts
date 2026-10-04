import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyState } from "@/lib/experience/dailyState";
import { buildContext, explainedByState, recordExperience, signalForDismissal, signalForOutcome, validateEvent } from "@/lib/experience/events";

const ID = "6f6c5cda-1b2e-4c3d-9a8b-7c6d5e4f3a2b";
const lowEnergy: DailyState = { energy: "low", intention: null, indoors: false, lessWalking: false };
const walk = { category: "Move", tags: ["walking", "outdoors"] };
const museum = { category: "Explore", tags: ["museum", "indoor"] };

describe("validateEvent", () => {
  it("accepts a well-formed event and keeps only the fixed fields", () => {
    expect(validateEvent({ type: "shown", activityId: ID, surface: "today", who: "partner", extra: "ignored" })).toEqual({
      type: "shown",
      activityId: ID,
      surface: "today",
      context: { who: "partner" },
    });
  });

  it("only lets an outcome ride on a completion and a reason on a dismissal", () => {
    expect(validateEvent({ type: "shown", activityId: ID, outcome: "loved", reason: "too_far" })).toEqual({ type: "shown", activityId: ID });
    expect(validateEvent({ type: "completed", activityId: ID, outcome: "loved" })?.outcome).toBe("loved");
    expect(validateEvent({ type: "dismissed", activityId: ID, reason: "didnt_go" })?.reason).toBe("didnt_go");
  });

  it("drops anything that is not on the fixed lists", () => {
    expect(validateEvent({ type: "exploded", activityId: ID })).toBeNull();
    expect(validateEvent({ type: "shown", activityId: "not-an-id" })).toBeNull();
    expect(validateEvent({ type: "shown" })).toBeNull();
    expect(validateEvent(null)).toBeNull();
    expect(validateEvent({ type: "shown", activityId: ID, surface: "billboard", who: "stranger" })).toEqual({ type: "shown", activityId: ID });
  });
});

describe("explainedByState: a bad day is not a dislike", () => {
  it("a long walk turned down while taking it easy is explained by the day", () => {
    expect(explainedByState(lowEnergy, walk, { durationMinutes: 180 })).toBe(true);
  });

  it("the same walk turned down on a normal day is not explained", () => {
    expect(explainedByState({ ...lowEnergy, energy: "normal" }, walk, { durationMinutes: 180 })).toBe(false);
    expect(explainedByState(null, walk, { durationMinutes: 180 })).toBe(false);
  });

  it("an idea that did not clash with the day is not explained by it", () => {
    expect(explainedByState(lowEnergy, museum, { durationMinutes: 60 })).toBe(false);
  });

  it("indoors preferred explains turning down something outdoors", () => {
    expect(explainedByState({ ...lowEnergy, energy: "normal", indoors: true }, walk, { durationMinutes: 60 })).toBe(true);
  });
});

describe("what a dismissal teaches", () => {
  it("a plain 'not my thing' is a dislike", () => {
    expect(signalForDismissal("not_my_thing", false)).toBe("disliked");
  });

  it("but not when the day explains it", () => {
    expect(signalForDismissal("not_my_thing", true)).toBeNull();
  });

  it("logistics keep their own signals, and 'didn't go' says nothing about taste", () => {
    expect(signalForDismissal("too_far", true)).toBe("too_far");
    expect(signalForDismissal("too_expensive", false)).toBe("too_expensive");
    expect(signalForDismissal("seen_it", false)).toBe("too_similar");
    expect(signalForDismissal("didnt_go", false)).toBeNull();
  });
});

describe("what 'how did it go?' teaches", () => {
  it("loved teaches a like, not-for-me a dislike, and fine nothing more", () => {
    expect(signalForOutcome("loved")).toBe("liked");
    expect(signalForOutcome("not_for_me")).toBe("disliked");
    expect(signalForOutcome("fine")).toBeNull();
  });
});

describe("buildContext", () => {
  it("keeps only coarse values", () => {
    const state: DailyState = { energy: "low", intention: "outdoors", indoors: true, lessWalking: true };
    expect(buildContext(state, { who: "partner", explainedByState: true })).toEqual({
      energy: "low",
      intention: "outdoors",
      who: "partner",
      explainedByState: true,
    });
    expect(buildContext(null)).toEqual({});
  });
});

describe("recordExperience", () => {
  const client = (error: { message: string } | null) => {
    const insert = vi.fn(async () => ({ error }));
    return { supabase: { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient, insert };
  };

  it("writes the events as rows", async () => {
    const { supabase, insert } = client(null);
    await recordExperience(supabase, "m1", [{ type: "completed", activityId: ID, outcome: "loved", surface: "reflection", context: { energy: "low" } }]);
    expect(insert).toHaveBeenCalledWith([
      { member_id: "m1", activity_id: ID, event_type: "completed", outcome: "loved", reason: null, surface: "reflection", context: { energy: "low" } },
    ]);
  });

  it("does nothing for no events", async () => {
    const { supabase, insert } = client(null);
    await recordExperience(supabase, "m1", []);
    expect(insert).not.toHaveBeenCalled();
  });

  it("never throws, whatever happens (a missing table included)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { supabase } = client({ message: 'relation "experience_events" does not exist' });
    await expect(recordExperience(supabase, "m1", [{ type: "shown", activityId: ID }])).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
