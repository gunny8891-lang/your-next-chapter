/**
 * Telling us what you think, by email. A message that starts from a few gentle questions is far more useful than a blank
 * one, and nothing about the person is put in it: not their name, their address or their account. They write what they
 * want to, and send it from their own email.
 */

export const FEEDBACK_EMAIL = "hello@larkhour.com";

/** A link that opens an email to us, with a subject saying which screen it was written from and a few prompts to start. */
export function feedbackHref(where: string): string {
  const subject = `Lark Hour feedback: ${where}`;
  const body = ["What I was trying to do:", "", "", "What happened, or what I wish had happened:", "", "", "Anything else:", "", ""].join("\n");
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
