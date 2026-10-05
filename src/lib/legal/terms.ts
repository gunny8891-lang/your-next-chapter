import { OPERATOR, type OperatorField } from "@/lib/legal/details";
import type { Section } from "@/lib/legal/privacy";

/**
 * The terms of use, in plain English. A DRAFT until the company details are filled in
 * (details.ts) and a solicitor has reviewed it. It deliberately promises only what the
 * product does today: ideas and plans, no payments, no booking on anyone's behalf.
 */
export function termsSections(operator: Record<OperatorField, string | null> = OPERATOR): Section[] {
  const company = operator.companyName ?? "[company name to be added]";
  const contact = operator.contactEmail ?? "[contact email to be added]";

  return [
    {
      id: "agreement",
      title: "What this is",
      blocks: [
        { p: `Your Next Chapter is a service from ${company} that suggests things to do with your time, close to home, and plans them from your door to home again. By creating an account you agree to these terms. How we look after your information is in our privacy notice.` },
        { p: "The service is new and still being developed. It may change, and some parts may not always be available." },
      ],
    },
    {
      id: "ideas",
      title: "Ideas, not advice",
      blocks: [
        { p: "What we suggest is a starting point, not a promise. Opening times, prices, dates and places change, and some of what we know comes from public sources or an AI that can make mistakes." },
        {
          ul: [
            "Please check the details with the venue or organiser before you set out.",
            "You are the best judge of what is safe and right for you, on the day. If a suggestion does not suit you, skip it.",
            "Nothing we say is medical, legal, financial or safety advice, and we do not book or pay for anything on your behalf.",
            "A mention of a place or an organisation is not an endorsement, and we are not responsible for what they offer.",
          ],
        },
      ],
    },
    {
      id: "account",
      title: "Your account",
      blocks: [
        {
          ul: [
            "You must be 18 or over.",
            "Give us accurate details, and keep your password to yourself. Tell us if you think someone else has used your account.",
            "You can change your details, or delete your account and everything in it, at any time in Account.",
          ],
        },
      ],
    },
    {
      id: "use",
      title: "Using the service fairly",
      blocks: [
        { p: "Please use the service for yourself, and do not:" },
        {
          ul: [
            "try to break it, overload it or get into anyone else’s information",
            "use automated tools to make requests in bulk",
            "put in anything unlawful, or anything about another person that you should not share",
          ],
        },
        { p: "To keep the service fair for everyone and to keep costs under control, each member has a daily limit on how much the AI features can be used. Most people never reach it. We may suspend an account that is being misused." },
      ],
    },
    {
      id: "cost",
      title: "What it costs",
      blocks: [{ p: "The service is free to use at the moment. If we introduce paid plans we will tell you well beforehand, and you will never be charged without agreeing to it first." }],
    },
    {
      id: "liability",
      title: "Our responsibility",
      blocks: [
        { p: "We will take reasonable care to provide the service and to keep your information safe. We cannot promise that it will always be available or free from errors." },
        { p: "Nothing in these terms limits our responsibility for death or personal injury caused by our negligence, for fraud, or for anything else the law does not allow us to limit, and it does not affect your rights as a consumer." },
        { p: "Beyond that, we are not responsible for what happens at a place or event we suggested, or for a loss that was not a foreseeable result of our failing to take reasonable care." },
      ],
    },
    {
      id: "ending",
      title: "Ending things",
      blocks: [
        { p: "You can stop using the service whenever you like, and delete your account in Account. We may close an account that breaks these terms, and will tell you why. If we ever stopped the service altogether, we would give you notice and a chance to take your information with you." },
      ],
    },
    {
      id: "changes",
      title: "Changes to these terms",
      blocks: [{ p: "If we change these terms in a way that matters, we will tell you before it takes effect. The date at the top shows when they last changed." }],
    },
    {
      id: "law",
      title: "Law, and getting in touch",
      blocks: [
        { p: "These terms are governed by the law of England and Wales, and the courts of England and Wales can deal with any dispute, though if you live in Scotland or Northern Ireland you may use your local courts." },
        { p: `Questions, or something that has gone wrong? Write to ${contact} and we will do our best to put it right.` },
      ],
    },
  ];
}
