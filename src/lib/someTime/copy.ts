/**
 * The scoring step records WHY something suited the member as short internal
 * phrases ("it supports a goal you set"). This turns them into the natural,
 * second-person sentence a person would say — and never invents a reason it was
 * not given.
 */
const FRIENDLY: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/^the weather suits being outdoors$/, () => "it is perfect weather for it today"],
  [/^it supports your goal of (.+)$/, (m) => `it supports your goal of ${m[1]}`],
  [/^you have enjoyed (.+) lately$/, (m) => `you have been enjoying ${m[1]} lately`],
  [/^it matches your interest in (.+)$/, (m) => `it matches your interest in ${m[1]}`],
  [/^it is actually happening today$/, () => "it is on today"],
  [/^it is actually happening tomorrow$/, () => "it is on tomorrow"],
  [/^it is actually happening on (.+)$/, (m) => `it is on ${m[1]}`],
  [/^the weather suits being outdoors (tomorrow|on .+)$/, (m) => `it should be good weather for it ${m[1]}`],
  [/^it is a wet day and this is indoors$/, () => "it is a wet day and this is under cover"],
  [/^it fits before your next plan$/, () => "it fits neatly before your next plan"],
  [/^it suits a (.+) mood$/, (m) => `it suits a ${m[1]} mood`],
];

function friendly(reason: string): string {
  for (const [pattern, write] of FRIENDLY) {
    const match = reason.match(pattern);
    if (match) return write(match);
  }
  return reason;
}

/** "Perfect…" style sentence from up to two reasons, or an empty string if there are none. */
export function humanReason(reasons: string[]): string {
  const parts = reasons.slice(0, 2).map(friendly);
  if (parts.length === 0) return "";
  const sentence = parts.join(", and ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}
