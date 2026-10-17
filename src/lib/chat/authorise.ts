/**
 * Whether the member has actually asked the concierge to add something, or said yes to its offer to. Decided here, in code,
 * from the member's own words, and never by the model: the concierge reads descriptions that came from the web, and nothing
 * written in one of them may be able to put an entry into someone's plan. A tool that changes their plan does nothing unless
 * this says they asked.
 *
 * Two ways to have asked:
 *  - explicitly, in the message ("add this to my calendar", "put it in my diary for Saturday", "I'd like to go to this");
 *  - by saying yes, when the concierge's last message offered to add it ("Shall I add it?" ... "Yes").
 *
 * A question about whether they should, or how, is not a request.
 */

export type Authorisation = "explicit" | "affirmative" | "none";

const ADD_WORDS =
  /\b(add|adding|put|pop|pencil|sign me up|put me down|i'?d like to go|i would like to go|i want to go|i'?ll go|i will go|let'?s do|let'?s go|count me in)\b|\b(book|schedule|diary)\s+(this|it|that|these|those|me|us)\b/i;

/** Asking about adding (or whether to), which is not asking for it to be done. */
const NOT_A_REQUEST =
  /\b(should i|do you think i should|how do i|how can i|can i add|could i add|can i put|is it possible to add|what if i|will it let me|does it let me|what does adding)\b/i;

const YES =
  /^(yes|yeah|yep|yup|ok|okay|sure|please|please do|yes please|go ahead|do it|do that|that would be (lovely|great|good|nice)|that'?s? (fine|good|great|right|perfect)|sounds (good|great|lovely|perfect)|perfect|lovely|great|brilliant|yes,? (please|add it|do|go ahead|that'?s? (right|fine)))[\s.!,]*(please|add it|do it)?[\s.!]*$/i;

/** What the concierge's last message has to have said for a bare "yes" to count: it offered to add, schedule or book it. */
const OFFERED =
  /\b(shall i|should i|would you like me to|do you want me to|want me to|happy for me to)\b[^?.!]*\b(add|put|schedule|book|pop|place)\b|\badd (it|this|that|them)\b[^?.!]*\?/i;
const OFFERED_GOOGLE = /\bgoogle calendar\b[^.!]*\?|\?[^.!]*\bgoogle calendar\b/i;

export function authorisationFor(message: string, previousAssistant: string | null): Authorisation {
  const text = message.trim();
  if (!text) return "none";
  if (NOT_A_REQUEST.test(text)) return "none";

  if (ADD_WORDS.test(text)) return "explicit";

  // A short yes, to something that was offered: not any "yes" to any question.
  if (text.length <= 60 && YES.test(text) && previousAssistant && (OFFERED.test(previousAssistant) || OFFERED_GOOGLE.test(previousAssistant))) {
    return "affirmative";
  }
  return "none";
}

export const AUTHORISED: Record<Authorisation, boolean> = { explicit: true, affirmative: true, none: false };
