/**
 * The app sorts things into seven internal categories (Move, Connect, Learn, Explore, Give Back,
 * Wellness, Joy). They are fine as small labels on a card, but not as words in a sentence: "Connect is a
 * category you have not touched lately" reads like a spreadsheet, not like a person. The prompts that
 * write sentences for members carry this rule, and a sentence that still slips through is replaced.
 */

export const PLAIN_WORDS_RULE =
  'In any sentence the member will read, never use the word "category", and never use the labels Move, Connect, Learn, Explore, Give Back, Wellness or Joy as names for kinds of activity. Say it in plain words instead (for example "something social", "something to learn", "time outdoors", "a way to give back").';

/** Whether a sentence for a member talks like the app's internals (the word "category"). */
export function containsJargon(text: string): boolean {
  return /\bcategor(y|ies)\b/i.test(text);
}
