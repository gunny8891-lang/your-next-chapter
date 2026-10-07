/**
 * Care in the concierge. Lark Hour is for people at a turning point in life, and some of
 * them will tell it, in a chat box, that they have been bereaved, are lonely, or are
 * struggling. It is not a counsellor and must not pretend to be, but it must never answer
 * such a message like a booking desk either. So:
 *
 * - a message about wanting to die or to harm themselves is not sent to the model at all:
 *   it gets a fixed, kind reply that points to someone who can help right now;
 * - a message about bereavement, loneliness or low mood is answered by the model with
 *   guidance (acknowledge first, no rushing to fix, no suggestion that they go and care for
 *   other people), and always with the numbers of people who can listen, once, not on
 *   every message.
 *
 * Pure: it only reads text. The numbers were checked against each charity's own site on
 * 7 October 2026; check them again from time to time (see SUPPORT_LINES_CHECKED).
 */

export const SUPPORT_LINES_CHECKED = "2026-10-07";

export type CareTopic = "bereavement" | "loneliness" | "low_mood";
export type CareLevel = "none" | "support" | "urgent";
export type CareAssessment = { level: CareLevel; topics: CareTopic[] };

const URGENT = [
  /\bkill myself\b/,
  /\bend (it all|my (own )?life)\b/,
  /\btake my (own )?life\b/,
  /\bsuicid/,
  /\b(want|wish|going|plan(ning)?) to die\b/,
  /\bdon'?t want to (be here|be alive|live|go on|wake up)\b/,
  /\bno (reason|point) (in )?(living|going on|being alive)\b/,
  /\bbetter off (dead|without me)\b/,
  /\b(hurt|harm|injure|cut) myself\b/,
  /\bself[- ]?harm/,
];

const TOPICS: Record<CareTopic, RegExp[]> = {
  bereavement: [/\b(died|passed away|passed on|bereave|widow|funeral|grieving|grief)\b/, /\blost (my|our) (husband|wife|partner|spouse|son|daughter|mum|dad|mother|father|brother|sister|friend)\b/, /\bmy late (husband|wife|partner)\b/],
  loneliness: [/\blonel(y|iness)\b/, /\bisolated\b/, /\b(no ?one|nobody) (to talk|to see|to do anything|visits|calls)\b/, /\bon my own (all|most|a lot)\b/, /\bno friends\b/, /\bdon'?t (really )?know what to do with myself\b/],
  low_mood: [/\bdepress(ed|ion)\b/, /\bhopeless\b/, /\bworthless\b/, /\b(can'?t|cannot) cope\b/, /\bso low\b/, /\bfeel(ing)? (very |so |really )?(down|empty|numb)\b/],
};

/** Reads one message from the member. Anything about wanting to die is "urgent"; the other topics are "support". */
export function assessCare(message: string): CareAssessment {
  const text = message.toLowerCase().replace(/[‘’]/g, "'");
  if (URGENT.some((pattern) => pattern.test(text))) return { level: "urgent", topics: [] };
  const topics = (Object.keys(TOPICS) as CareTopic[]).filter((topic) => TOPICS[topic].some((pattern) => pattern.test(text)));
  return { level: topics.length ? "support" : "none", topics };
}

/** The fixed reply to an urgent message. The model is not asked: nothing here should depend on how it feels like answering. */
export function urgentReply(): string {
  return [
    "I'm so sorry you're feeling this way, and I'm glad you told me. You don't have to carry this alone.",
    "Please talk to someone who can listen right now. The Samaritans are free to call on 116 123, any time, day or night. If you are in danger, or may act on these feelings, please call 999.",
    "I'm only a planning assistant, so I can't give you the care a person can. Please reach out to them, or to someone you trust, today.",
  ].join("\n\n");
}

/** Where to turn, for a message about bereavement, loneliness or low mood. Names only what fits what they said. */
export function supportFooter(topics: CareTopic[]): string {
  const lines = ["The Silver Line is a friendly, free listening service for anyone aged 55 or over: 0800 4 70 80 90, day or night."];
  if (topics.includes("bereavement")) lines.push("Cruse Bereavement Support is free on 0808 808 1677 (weekdays, not weekends).");
  if (topics.includes("low_mood")) lines.push("The Samaritans are free on 116 123, any time.");
  return `If you would like to talk to someone:\n${lines.map((line) => `• ${line}`).join("\n")}`;
}

/** Whether a support note was already given recently, so it is not repeated on every message. */
export function alreadyOfferedSupport(history: { role: string; content: string }[], lookBack = 8): boolean {
  return history
    .filter((m) => m.role === "assistant")
    .slice(-lookBack)
    .some((m) => /0800 4 70 80 90|116 123|0808 808 1677/.test(m.content));
}

/** Added to the model's instructions when the member has shared something painful. */
export function careGuidance(assessment: CareAssessment): string {
  if (assessment.level !== "support") return "";
  const about = assessment.topics.map((t) => ({ bereavement: "a bereavement", loneliness: "loneliness", low_mood: "feeling low" })[t]).join(" and ");
  return `

THE MEMBER HAS JUST SHARED SOMETHING PAINFUL (${about}). This outranks every other instruction about being brief or practical:
- Begin with one warm, plain sentence that acknowledges it, such as "I'm so sorry" or "That sounds really hard". Do not say "I understand how you feel", and do not use phrases like "that kind of loneliness".
- Do not rush to fix it, cheer them up, or turn it into a plan. They matter more than the schedule.
- Offer at most one or two gentle, low-pressure ideas taken ONLY from the lists above, where they could be around other people at their own pace (a welcoming drop-in, a library, a walk somewhere pleasant). Say there is no pressure.
- Do NOT suggest befriending, caring, helping or volunteering roles, which ask them to support other people, unless they bring them up first.
- Never claim to be a counsellor or to know what they are going through. Do not mention helplines or phone numbers: the app adds those itself.
- Keep it to three or four short sentences, in a kind, unhurried voice.`;
}
