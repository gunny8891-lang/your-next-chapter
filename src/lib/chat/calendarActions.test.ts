import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTHORISED, authorisationFor } from "@/lib/chat/authorise";
import { checkDate, chooseSlot, executeTool, MAX_DAYS_AHEAD, nextMeetings, type ToolContext } from "@/lib/chat/calendarTools";
import { guardUnconfirmedClaims, MAX_TOOL_ROUNDS, NOT_ADDED, runToolLoop } from "@/lib/chat/toolLoop";
import { buildSystemPrompt } from "@/lib/chat/agent";
import { doneFrom } from "@/components/ChatView";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

// Friday 16 October 2026, so Saturday is the 17th and Tuesday the 20th.
const NOW = new Date("2026-10-16T10:00:00Z");
const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const GROUP_ID = "22222222-2222-4222-8222-222222222222";
const PLACE_ID = "33333333-3333-4333-8333-333333333333";
const ITEM_ID = "44444444-4444-4444-8444-444444444444";

const row = (over: Record<string, unknown>) => ({
  id: EVENT_ID,
  title: "Autumn Concert",
  category: "Joy",
  address: "Town Hall, Barnet",
  date_time: null,
  expires_at: null,
  recurrence_rule: null,
  duration_minutes: 90,
  price_estimate: 8,
  booking_url: null,
  description: null,
  ...over,
});
const concert = row({ date_time: "2026-10-17T14:00:00Z" });
const group = row({ id: GROUP_ID, title: "Craft Group", recurrence_rule: "Tu 14:00-16:00" });
const place = row({ id: PLACE_ID, title: "Hall Café", recurrence_rule: "Mo-Sa 09:00-17:00" });

/** A member client that answers the two reads the tools make: the activity, and the plan for a week. */
function fakeMember(activities: Record<string, unknown>[], planItems: Record<string, unknown>[] = []) {
  const reads: string[] = [];
  const member = {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      let id: string | null = null;
      chain.select = () => chain;
      chain.eq = (col: string, value: string) => {
        if (col === "id") id = value;
        return chain;
      };
      chain.maybeSingle = async () => {
        reads.push(table);
        if (table === "activities") return { data: activities.find((a) => a.id === id) ?? null, error: null };
        if (table === "itineraries") return { data: { itinerary_items: planItems }, error: null };
        return { data: null, error: null };
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { member, reads };
}

function context(over: Partial<ToolContext> & { activities?: Record<string, unknown>[]; planItems?: Record<string, unknown>[] } = {}) {
  const { activities = [concert, group, place], planItems = [], ...rest } = over;
  const { member } = fakeMember(activities, planItems);
  const place_ = vi.fn(async () => ({ error: null }));
  const ctx: ToolContext = {
    member,
    admin: {} as SupabaseClient,
    memberId: "m1",
    now: NOW,
    authorised: true,
    place: place_ as unknown as ToolContext["place"],
    recordPlanned: vi.fn(async () => {}),
    ...rest,
  };
  return { ctx, place: place_ };
}

describe("when the member has asked", () => {
  it("counts asking to add, book, diary or schedule, and saying they would like to go", () => {
    for (const text of [
      "Add this to my calendar",
      "Book this into my diary for Saturday",
      "I'd like to go to this",
      "Add the second event you suggested",
      "Add this and remind me the day before",
      "Schedule this every Tuesday",
      "Add this to my Google Calendar too",
    ]) {
      expect(authorisationFor(text, null), text).toBe("explicit");
    }
  });

  it("does not count asking whether to, or how", () => {
    for (const text of ["Should I add this to my calendar?", "How do I add this to my plan?", "Can I add it to my diary?"]) {
      expect(authorisationFor(text, null), text).toBe("none");
    }
  });

  it("counts a short yes only when the concierge had just offered to add it", () => {
    expect(authorisationFor("Yes please", "It is the Autumn Concert on Saturday at 2pm. Shall I add it?")).toBe("affirmative");
    expect(authorisationFor("Yes", "Would you like me to add it to your Google Calendar too?")).toBe("affirmative");
    expect(authorisationFor("Yes", "Do you like live music?")).toBe("none");
    expect(authorisationFor("Yes", null)).toBe("none");
  });

  it("does not count a long message that merely contains a yes", () => {
    expect(authorisationFor("Yes, I do enjoy concerts, particularly the ones with a choir and a proper interval", "Shall I add it?")).toBe("none");
  });

  it("is a plain yes or no for the tools", () => {
    expect(AUTHORISED).toEqual({ explicit: true, affirmative: true, none: false });
  });
});

describe("which days and parts of the day are allowed", () => {
  it("takes real dates from today to four weeks ahead", () => {
    expect(checkDate("2026-10-16", NOW)).toBeNull();
    expect(checkDate("2026-11-13", NOW)).toBeNull();
    expect(checkDate("2026-10-15", NOW)).toMatch(/already gone/);
    expect(checkDate("2026-11-14", NOW)).toMatch(new RegExp(`${MAX_DAYS_AHEAD} days`));
    for (const bad of ["Saturday", "17/10/2026", "2026-13-45", "", null, 42]) expect(checkDate(bad, NOW)).toMatch(/not a date/);
  });

  it("puts a one-off event only on its own day, in the part of the day it is on", () => {
    expect(chooseSlot(concert, "2026-10-17", null, "2026-10-16")).toEqual({ slot: "afternoon" });
    expect(chooseSlot(concert, "2026-10-18", null, "2026-10-16")).toEqual({ error: expect.stringMatching(/Saturday 17 October, not Sunday 18 October/) });
  });

  it("puts a group that meets only on a day it meets, and says when it does", () => {
    expect(chooseSlot(group, "2026-10-20", null, "2026-10-16")).toEqual({ slot: "afternoon" });
    const wrong = chooseSlot(group, "2026-10-21", null, "2026-10-16");
    expect(wrong).toMatchObject({ error: expect.stringMatching(/does not meet on Wednesday/) });
    expect("next" in wrong && wrong.next?.[0]).toEqual({ date: "2026-10-20", start: "14:00", end: "16:00" });
  });

  it("puts a place where it is open, and says when it is not", () => {
    expect(chooseSlot(place, "2026-10-17", "afternoon", "2026-10-16")).toEqual({ slot: "afternoon" });
    expect(chooseSlot(place, "2026-10-17", "evening", "2026-10-16")).toMatchObject({ error: expect.stringMatching(/not open in the evening/) });
    expect(chooseSlot(place, "2026-10-18", null, "2026-10-16")).toMatchObject({ error: expect.stringMatching(/closed on Sunday/) });
  });

  it("uses the morning when nothing says, and refuses something that has ended", () => {
    expect(chooseSlot(row({}), "2026-10-17", null, "2026-10-16")).toEqual({ slot: "morning" });
    expect(chooseSlot(row({ expires_at: "2026-10-18T00:00:00Z" }), "2026-10-25", null, "2026-10-16")).toMatchObject({ error: expect.stringMatching(/ends on/) });
  });

  it("lists the next meetings of a group", () => {
    expect(nextMeetings("Tu 14:00-16:00", "2026-10-16", 2).map((m) => m.date)).toEqual(["2026-10-20", "2026-10-27"]);
  });
});

describe("adding to the plan", () => {
  const add = (input: unknown, over: Parameters<typeof context>[0] = {}) => {
    const c = context(over);
    return executeTool("add_to_my_plan", input, c.ctx).then((outcome) => ({ outcome, place: c.place }));
  };

  it("writes nothing unless the member asked, and says what to do instead", async () => {
    const { outcome, place } = await add({ activity_id: EVENT_ID, date: "2026-10-17" }, { authorised: false });
    expect(place).not.toHaveBeenCalled();
    expect(outcome.isError).toBe(true);
    expect(outcome.action).toBeUndefined();
    expect(outcome.result).toMatchObject({ ok: false, needs_confirmation: true });
  });

  it("uses the same placement as 'I'll do this' on Today, for that date and slot", async () => {
    const { outcome, place } = await add({ activity_id: EVENT_ID, date: "2026-10-17" });
    expect(place).toHaveBeenCalledWith(expect.anything(), expect.anything(), "m1", EVENT_ID, "afternoon", NOW, "You asked the concierge to add this.", "2026-10-17");
    expect(outcome.isError).toBe(false);
    expect(outcome.action).toMatchObject({ type: "added", title: "Autumn Concert", day: "Saturday", slot: "afternoon", date: "2026-10-17" });
  });

  it("gives back the id of the item it made, so it can go on to Google Calendar", async () => {
    const { outcome } = await add({ activity_id: EVENT_ID, date: "2026-10-17" }, { planItems: [{ id: ITEM_ID, day_of_week: "Sat", slot: "afternoon", member_action: "pending", activities: { title: "Autumn Concert" } }] });
    expect(outcome.result).toMatchObject({ ok: true, item_id: ITEM_ID });
    expect(outcome.action).toMatchObject({ itemId: ITEM_ID });
  });

  it("does not add an event on a day it is not on", async () => {
    const { outcome, place } = await add({ activity_id: EVENT_ID, date: "2026-10-18" });
    expect(place).not.toHaveBeenCalled();
    expect(outcome.result).toMatchObject({ ok: false, error: expect.stringMatching(/Saturday 17 October/) });
    expect(outcome.action).toBeUndefined();
  });

  it("does not add a group on a day it does not meet, and offers the days it does", async () => {
    const { outcome } = await add({ activity_id: GROUP_ID, date: "2026-10-21" });
    expect(outcome.result).toMatchObject({ ok: false, next_meetings: expect.arrayContaining([expect.stringMatching(/Tuesday 20 October 14:00 to 16:00/)]) });
  });

  it("passes on the part of the day for a place", async () => {
    const { place } = await add({ activity_id: PLACE_ID, date: "2026-10-17", part_of_day: "afternoon" });
    expect(place).toHaveBeenCalledWith(expect.anything(), expect.anything(), "m1", PLACE_ID, "afternoon", NOW, expect.any(String), "2026-10-17");
  });

  it("says plainly when that part of the day already has something in it", async () => {
    const taken = context();
    const busy = { ...taken.ctx, place: vi.fn(async () => ({ error: "That slot is already planned." })) as unknown as ToolContext["place"] };
    const outcome = await executeTool("add_to_my_plan", { activity_id: EVENT_ID, date: "2026-10-17" }, busy);
    expect(outcome.isError).toBe(true);
    expect(outcome.result).toMatchObject({ error: expect.stringMatching(/already planned on Saturday 17 October in the afternoon/) });
    expect(outcome.action).toBeUndefined();
  });

  it("refuses an id that is not one, an activity that is gone, and a date that is not a date", async () => {
    expect((await add({ activity_id: "abc", date: "2026-10-17" })).outcome.result).toMatchObject({ ok: false });
    expect((await add({ activity_id: "55555555-5555-4555-8555-555555555555", date: "2026-10-17" })).outcome.result).toMatchObject({ error: expect.stringMatching(/not available/) });
    const bad = await add({ activity_id: EVENT_ID, date: "next Saturday" });
    expect(bad.place).not.toHaveBeenCalled();
    expect(bad.outcome.isError).toBe(true);
  });

  it("is not caught out when learning from it fails, or when the tool is given nonsense", async () => {
    const { ctx } = context({ recordPlanned: vi.fn(async () => { throw new Error("no"); }) });
    expect((await executeTool("add_to_my_plan", { activity_id: EVENT_ID, date: "2026-10-17" }, ctx)).isError).toBe(false);
    for (const nonsense of [null, "text", 5, [], {}]) {
      const outcome = await executeTool("add_to_my_plan", nonsense, ctx);
      expect(outcome.isError).toBe(true);
    }
    expect((await executeTool("delete_everything", {}, ctx)).result).toMatchObject({ ok: false });
  });

  it("returns a failure the model can explain, rather than throwing, when the database fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ctx } = context({ member: { from: () => { throw new Error("db down"); } } as unknown as SupabaseClient });
    const outcome = await executeTool("add_to_my_plan", { activity_id: EVENT_ID, date: "2026-10-17" }, ctx);
    expect(outcome.isError).toBe(true);
    expect(outcome.result).toMatchObject({ error: expect.stringMatching(/nothing was changed/) });
    warn.mockRestore();
  });
});

describe("looking at the details", () => {
  it("is free to do without being asked, and tells the date, place, cost and what is already planned", async () => {
    const { ctx } = context({
      authorised: false,
      planItems: [{ id: ITEM_ID, day_of_week: "Sat", slot: "morning", member_action: "pending", activities: { title: "Park walk" } }],
    });
    const outcome = await executeTool("get_event_details", { activity_id: EVENT_ID }, ctx);
    expect(outcome.isError).toBe(false);
    expect(outcome.result).toMatchObject({
      ok: true,
      title: "Autumn Concert",
      kind: "one_off_event",
      when: "Saturday 17 October at 14:00",
      address: "Town Hall, Barnet",
      cost: "about £8",
      already_in_their_plan_that_day: ["morning: Park walk"],
      calendars_you_can_see: expect.stringMatching(/Lark Hour plan only/),
    });
    expect(outcome.action).toBeUndefined();
  });

  it("lists the next meetings of a group and when a place is open on a day", async () => {
    const { ctx } = context();
    const g = await executeTool("get_event_details", { activity_id: GROUP_ID }, ctx);
    expect(g.result).toMatchObject({ kind: "group_that_meets", when: expect.stringContaining("Tuesday 20 October 14:00 to 16:00") });
    const p = await executeTool("get_event_details", { activity_id: PLACE_ID, date: "2026-10-18" }, ctx);
    expect(p.result).toMatchObject({ kind: "place_to_visit", on_the_date_asked: expect.stringMatching(/not on Sunday 18 October/) });
  });
});

describe("Google Calendar", () => {
  const google = (over: Partial<ToolContext>) => context(over).ctx;
  it("is not touched unless the member asked", async () => {
    const googleAdd = vi.fn();
    const outcome = await executeTool("add_to_google_calendar", { item_id: ITEM_ID }, google({ authorised: false, googleAdd }));
    expect(googleAdd).not.toHaveBeenCalled();
    expect(outcome.result).toMatchObject({ needs_confirmation: true });
  });

  it("says when it is not switched on, and when the member has not connected", async () => {
    const googleAdd = vi.fn();
    const off = await executeTool("add_to_google_calendar", { item_id: ITEM_ID }, google({ googleState: async () => "not_switched_on", googleAdd }));
    expect(off.result).toMatchObject({ error: expect.stringMatching(/not switched on/) });
    const not = await executeTool("add_to_google_calendar", { item_id: ITEM_ID }, google({ googleState: async () => "not_connected", googleAdd }));
    expect(not.result).toMatchObject({ error: expect.stringMatching(/connect it in Account/) });
    expect(googleAdd).not.toHaveBeenCalled();
    expect(off.action ?? not.action).toBeUndefined();
  });

  it("adds it, and reports it only when Google said so", async () => {
    const googleAdd = vi.fn(async () => ({ error: null }));
    const ok = await executeTool("add_to_google_calendar", { item_id: ITEM_ID }, google({ googleState: async () => "ready", googleAdd }));
    expect(googleAdd).toHaveBeenCalledWith(ITEM_ID);
    expect(ok.action).toEqual({ type: "google", itemId: ITEM_ID });

    const failed = await executeTool("add_to_google_calendar", { item_id: ITEM_ID }, google({ googleState: async () => "ready", googleAdd: async () => ({ error: "Google said no" }) }));
    expect(failed.isError).toBe(true);
    expect(failed.action).toBeUndefined();

    const reconnect = await executeTool("add_to_google_calendar", { item_id: ITEM_ID }, google({ googleState: async () => "ready", googleAdd: async () => ({ error: "x", reconnect: true }) }));
    expect(reconnect.result).toMatchObject({ error: expect.stringMatching(/connect it again in Account/) });
  });

  it("wants the id of a planned item", async () => {
    const outcome = await executeTool("add_to_google_calendar", { item_id: "Autumn Concert" }, google({ googleState: async () => "ready" }));
    expect(outcome.isError).toBe(true);
  });
});

const message = (content: Anthropic.ContentBlock[], stop: "tool_use" | "end_turn"): Anthropic.Message =>
  ({ id: "m", type: "message", role: "assistant", model: "x", content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }) as unknown as Anthropic.Message;
const say = (text: string) => message([{ type: "text", text, citations: null } as Anthropic.TextBlock], "end_turn");
const call = (id: string, name: string, input: unknown) => message([{ type: "tool_use", id, name, input } as Anthropic.ToolUseBlock], "tool_use");

describe("the conversation while it uses tools", () => {
  it("runs the tool, gives the result back, and returns the words", async () => {
    const turns = [call("t1", "add_to_my_plan", { activity_id: EVENT_ID, date: "2026-10-17" }), say("Done: it is in your plan.")];
    const seen: Anthropic.MessageParam[][] = [];
    const create = vi.fn(async (messages: Anthropic.MessageParam[]) => (seen.push([...messages]), turns.shift()!));
    const action = { type: "added" as const, title: "Autumn Concert", day: "Saturday", slot: "afternoon", date: "2026-10-17", itemId: null };
    const execute = vi.fn(async () => ({ result: { ok: true }, isError: false, action }));

    const result = await runToolLoop({ create, messages: [{ role: "user", content: "Add it" }], execute });
    expect(execute).toHaveBeenCalledWith("add_to_my_plan", { activity_id: EVENT_ID, date: "2026-10-17" });
    expect(result).toEqual({ text: "Done: it is in your plan.", actions: [action], rounds: 1 });

    const second = seen[1];
    expect(second.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(JSON.stringify(second[2].content)).toContain('"tool_use_id":"t1"');
  });

  it("keeps the model's own turn exactly, including any thinking, when it goes back", async () => {
    const thinking = { type: "thinking", thinking: "hm", signature: "sig" } as unknown as Anthropic.ContentBlock;
    const turns = [message([thinking, { type: "tool_use", id: "t1", name: "get_event_details", input: {} } as Anthropic.ToolUseBlock], "tool_use"), say("ok")];
    const seen: Anthropic.MessageParam[][] = [];
    await runToolLoop({ create: async (m) => (seen.push([...m]), turns.shift()!), messages: [{ role: "user", content: "x" }], execute: async () => ({ result: {}, isError: false }) });
    expect((seen[1][1].content as Anthropic.ContentBlock[])[0]).toBe(thinking);
  });

  it("marks a failed tool as an error and carries on", async () => {
    const turns = [call("t1", "add_to_my_plan", {}), say("I could not.")];
    const seen: Anthropic.MessageParam[][] = [];
    const result = await runToolLoop({ create: async (m) => (seen.push([...m]), turns.shift()!), messages: [], execute: async () => ({ result: { ok: false }, isError: true }) });
    expect(JSON.stringify(seen[1][1].content)).toContain('"is_error":true');
    expect(result.actions).toEqual([]);
  });

  it("stops after a few rounds and makes it answer without tools", async () => {
    const create = vi.fn(async (_m: Anthropic.MessageParam[], allowTools: boolean) => (allowTools ? call("t", "get_event_details", {}) : say("Here is what I found.")));
    const execute = vi.fn(async () => ({ result: {}, isError: false }));
    const result = await runToolLoop({ create, messages: [], execute });
    expect(execute).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);
    expect(create).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS + 1);
    expect(create.mock.calls.at(-1)![1]).toBe(false);
    expect(result).toMatchObject({ text: "Here is what I found.", rounds: MAX_TOOL_ROUNDS });
  });

  it("answers at once, with no tools, when none are wanted", async () => {
    const execute = vi.fn();
    const result = await runToolLoop({ create: async () => say("Hello."), messages: [], execute });
    expect(execute).not.toHaveBeenCalled();
    expect(result).toEqual({ text: "Hello.", actions: [], rounds: 0 });
  });
});

describe("never saying it is done when it is not", () => {
  const added = [{ type: "added" as const, title: "x", day: "Saturday", slot: "morning", date: "2026-10-17", itemId: null }];

  it("replaces a claim of having added when nothing was added", () => {
    for (const claim of ["I've added it to your calendar.", "I have booked that for Saturday.", "Great, it has been added to your plan.", "Added to your calendar for Saturday."]) {
      expect(guardUnconfirmedClaims(claim, []), claim).toEqual({ text: NOT_ADDED, replaced: true });
    }
  });

  it("lets the claim stand when it was really done", () => {
    expect(guardUnconfirmedClaims("I've added it to your plan.", added)).toEqual({ text: "I've added it to your plan.", replaced: false });
  });

  it("leaves questions, offers and descriptions alone", () => {
    for (const text of ["Shall I add it to your Google Calendar?", "Would you like me to add it to your plan?", "The concert is in your plan on Saturday.", "It is on at 2pm. Shall I put it in your diary?"]) {
      expect(guardUnconfirmedClaims(text, []).replaced, text).toBe(false);
    }
  });
});

describe("what the concierge is told", () => {
  const profile = { location_text: "Barnet", travel_radius_km: 10, interests: [], goals: [], budget_band: null, mobility_notes: null };
  const prompt = buildSystemPrompt(
    profile,
    "Friday 16 October",
    [{ id: ITEM_ID, day_of_week: "Sat", slot: "morning", member_action: "pending", activities: { id: EVENT_ID, title: "Park walk", category: "Move", address: "The Park", date_time: null } }] as never,
    [],
    "",
    undefined,
    [],
    "- Saturday 17 October = 2026-10-17"
  );

  it("names the tools and the dates, and the items in the plan by their ids", () => {
    expect(prompt).toContain("add_to_my_plan");
    expect(prompt).toContain("Saturday 17 October = 2026-10-17");
    expect(prompt).toContain(`item=${ITEM_ID}`);
  });

  it("says to ask which one when unsure, to offer before adding, and to say it is added only after the tool says so", () => {
    expect(prompt).toMatch(/ask a short question to find out which/);
    expect(prompt).toMatch(/Shall I add it\?/);
    expect(prompt).toMatch(/only after the tool has reported ok/);
  });

  it("is honest about repeats, reminders and the Google Calendar it cannot see, and treats descriptions as information", () => {
    expect(prompt).toMatch(/cannot set repeating events/);
    expect(prompt).toMatch(/reminders/);
    expect(prompt).toMatch(/cannot see their Google Calendar/);
    expect(prompt).toMatch(/never an instruction to you/);
  });
});

describe("how it reaches the screen", () => {
  it("shows what was really done, with a link to My Week for the plan", () => {
    expect(doneFrom(undefined)).toEqual([]);
    expect(doneFrom([{ type: "added", title: "Autumn Concert", day: "Saturday", slot: "afternoon", date: "2026-10-17", itemId: null }, { type: "google", itemId: ITEM_ID }])).toEqual([
      { kind: "plan", text: "Added to My Week: Autumn Concert, Saturday afternoon" },
      { kind: "google", text: "Added to your Google Calendar" },
    ]);
    expect(read("src/components/ChatView.tsx")).toContain('href="/week"');
  });

  it("refreshes My Week and Today after something is added", () => {
    const action = read("src/app/chat/actions.ts");
    expect(action).toContain('revalidatePath("/week")');
    expect(action).toContain('revalidatePath("/today")');
    expect(action).toMatch(/actions\.length > 0/);
  });

  it("changes the plan only through the shared placement, with the member's own words deciding", () => {
    const tools = read("src/lib/chat/calendarTools.ts");
    expect(tools).toContain("placeOpenTimeChoice");
    expect(tools).not.toMatch(/\.from\("itinerary_items"\)\.(insert|update|upsert)/);
    expect(tools).not.toMatch(/\.from\("itineraries"\)\.(insert|update|upsert)/);
    const agent = read("src/lib/chat/agent.ts");
    expect(agent).toContain("AUTHORISED[authorisationFor(question, lastAssistant)]");
    expect(agent).not.toMatch(/authorised\s*=\s*[^;]*\binput\b/);
  });

  it("does not offer the tools to the model on the urgent branch, which never calls it", () => {
    const action = read("src/app/chat/actions.ts");
    const urgent = action.slice(action.indexOf('care.level === "urgent"'), action.indexOf("} else"));
    expect(urgent).not.toContain("conciergeReply");
  });
});
