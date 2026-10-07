import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { alreadyOfferedSupport, assessCare, careGuidance, supportFooter, urgentReply } from "@/lib/chat/care";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("noticing a message that needs care", () => {
  it("treats talk of wanting to die or to harm themselves as urgent", () => {
    for (const text of [
      "I want to kill myself",
      "I don't want to be here any more",
      "I don’t want to be alive", // a curly apostrophe, as phones type it
      "I've been thinking about suicide",
      "There's no point in going on",
      "everyone would be better off without me",
      "I want to end my life",
      "I keep wanting to hurt myself",
      "I've started to self-harm",
      "I wish to die",
    ]) {
      expect(assessCare(text).level, text).toBe("urgent");
    }
  });

  it("recognises bereavement, loneliness and low mood, and says which", () => {
    expect(assessCare("I've been feeling quite lonely since my husband died.")).toEqual({ level: "support", topics: ["bereavement", "loneliness"] });
    expect(assessCare("My wife passed away in the spring and I don't really know what to do with myself")).toMatchObject({ level: "support" });
    expect(assessCare("I lost my partner last year").topics).toEqual(["bereavement"]);
    expect(assessCare("I'm so lonely these days").topics).toEqual(["loneliness"]);
    expect(assessCare("I've been feeling very down and I can't cope").topics).toEqual(["low_mood"]);
    expect(assessCare("I feel hopeless").level).toBe("support");
    expect(assessCare("Nobody to talk to, really, most days").topics).toEqual(["loneliness"]);
  });

  it("does not mistake everyday talk for either", () => {
    for (const text of [
      "What's planned this week?",
      "I'm dying to try the new lido",
      "These stairs are killing me",
      "My knees are killing me, is there something gentle?",
      "I could murder a cup of tea",
      "Is there anything for a rainy afternoon?",
      "I'm a bit tired today",
      "What's on tomorrow",
      "I'd like to meet new people",
      "There's no point going out in this rain, what else is there?",
      "I'm feeling a bit lazy",
    ]) {
      expect(assessCare(text).level, text).toBe("none");
    }
  });

  it("copes with empty and odd input", () => {
    expect(assessCare("")).toEqual({ level: "none", topics: [] });
    expect(assessCare("   ")).toEqual({ level: "none", topics: [] });
    expect(assessCare("😀")).toEqual({ level: "none", topics: [] });
  });
});

describe("the urgent reply", () => {
  const reply = urgentReply();

  it("gives the Samaritans' number and 999, and nothing about plans or outings", () => {
    expect(reply).toContain("116 123");
    expect(reply).toContain("999");
    expect(reply).not.toMatch(/activity|plan your|this week|library|walk|suggest/i);
  });

  it("is kind, and honest about being only a planning assistant", () => {
    expect(reply).toMatch(/so sorry/);
    expect(reply).toMatch(/glad you told me/);
    expect(reply).toMatch(/only a planning assistant/);
  });

  it("is never sent to the model: the action answers it itself", () => {
    const action = read("src/app/chat/actions.ts");
    const urgentBranch = action.slice(action.indexOf('care.level === "urgent"'), action.indexOf("} else {"));
    expect(urgentBranch).toContain("reply = urgentReply();");
    expect(urgentBranch).not.toContain("answerChatQuestion");
  });
});

describe("telling them who can listen", () => {
  it("always offers the Silver Line, for anyone 55 or over, with the right number", () => {
    for (const topics of [["bereavement"], ["loneliness"], ["low_mood"], ["bereavement", "loneliness"]] as const) {
      expect(supportFooter([...topics])).toContain("0800 4 70 80 90");
    }
    expect(supportFooter(["loneliness"])).toMatch(/55 or over/);
  });

  it("adds Cruse only for a bereavement, and the Samaritans only for low mood", () => {
    expect(supportFooter(["bereavement"])).toContain("0808 808 1677");
    expect(supportFooter(["bereavement"])).not.toContain("116 123");
    expect(supportFooter(["low_mood"])).toContain("116 123");
    expect(supportFooter(["low_mood"])).not.toContain("0808 808 1677");
    expect(supportFooter(["loneliness"])).not.toMatch(/0808|116/);
  });

  it("is honest that Cruse's line is open on weekdays", () => {
    expect(supportFooter(["bereavement"])).toMatch(/weekdays, not weekends/);
  });

  it("is only offered once in a while, not after every message", () => {
    const given = [{ role: "assistant", content: "I'm so sorry. If you would like to talk to someone: 0800 4 70 80 90" }];
    expect(alreadyOfferedSupport(given)).toBe(true);
    expect(alreadyOfferedSupport([{ role: "assistant", content: "Samaritans: 116 123" }])).toBe(true);
    expect(alreadyOfferedSupport([{ role: "user", content: "0800 4 70 80 90" }])).toBe(false);
    expect(alreadyOfferedSupport([{ role: "assistant", content: "Here is your week." }])).toBe(false);
    expect(alreadyOfferedSupport([])).toBe(false);
    // It was a long time ago: offer again.
    const old = [...given, ...Array.from({ length: 9 }, () => ({ role: "assistant", content: "Plenty to do on Friday." }))];
    expect(alreadyOfferedSupport(old)).toBe(false);
  });
});

describe("how the model is told to answer", () => {
  it("adds nothing for an ordinary question", () => {
    expect(careGuidance({ level: "none", topics: [] })).toBe("");
  });

  it("puts the person before the schedule, and keeps back-handed suggestions out", () => {
    const text = careGuidance({ level: "support", topics: ["bereavement", "loneliness"] });
    expect(text).toContain("a bereavement and loneliness");
    expect(text).toMatch(/outranks every other instruction/);
    expect(text).toMatch(/Begin with one warm, plain sentence/);
    expect(text).toMatch(/Do NOT suggest befriending, caring, helping or volunteering/);
    expect(text).toMatch(/only from the lists above/i);
    expect(text).toMatch(/Never claim to be a counsellor/);
    expect(text).toMatch(/Do not mention helplines or phone numbers: the app adds those itself/);
  });

  it("reaches the model's instructions, and the member's care assessment is passed in", () => {
    const agent = read("src/lib/chat/agent.ts");
    expect(agent).toContain("${careGuidance(care)}");
    expect(read("src/app/chat/actions.ts")).toContain("answerChatQuestion(supabase, user.id, trimmed, history, care)");
  });
});

describe("how it is wired into the chat", () => {
  const action = read("src/app/chat/actions.ts");

  it("adds the note to a good answer and to an apology alike, so the numbers survive an outage", () => {
    expect(action).toContain("(await answerChatQuestion(supabase, user.id, trimmed, history, care)) + note");
    expect(action).toContain("chatMessage(classifyAiFailure(err)) + note");
  });

  it("offers the note only for 'support', and only when it has not just been given", () => {
    expect(action).toContain('care.level === "support" && !alreadyOfferedSupport(history)');
  });

  it("does not write what a member shared into the server log", () => {
    expect(action).not.toMatch(/console\.(log|warn|error)\([^)]*trimmed/);
  });
});
