import { DAILY_STATE_KEEP_DAYS } from "@/lib/experience/dailyStateStore";
import { OPERATOR, type OperatorField } from "@/lib/legal/details";

/**
 * The privacy notice, as data. Two things are deliberately kept as structured lists
 * (DATA_CATEGORIES and PROVIDERS) rather than loose prose: a test compares them with
 * the database migrations and with the outside services the code actually calls, so
 * the notice cannot quietly fall behind the product. Add a table that holds personal
 * data, or a new service that receives it, and the build fails until this page says so.
 *
 * Written for people who are not lawyers, in plain English. It is a DRAFT until the
 * company details are filled in (details.ts) and a solicitor has reviewed it.
 */

export type Block = { p: string } | { ul: string[] } | { dl: { term: string; text: string }[] };
export type Section = { id: string; title: string; blocks: Block[] };

export type DataCategory = {
  id: string;
  title: string;
  /** What is held, in the member's own terms. */
  what: string;
  /** What it is used for. */
  why: string;
  /** The database tables that hold it (empty if it lives inside another category's table). */
  tables: string[];
};

/** Tables that hold no personal data (the shared catalogue of places and events). */
export const NON_PERSONAL_TABLES = ["partners", "activities", "discovery_regions"];

export const DATA_CATEGORIES: DataCategory[] = [
  {
    id: "account",
    title: "Your account",
    what: "Your email address, your first name and when you joined. Your password is kept by our sign-in provider only as a scrambled code that nobody, including us, can read back.",
    why: "To let you in, to know who you are, and to get in touch with you.",
    tables: ["users"],
  },
  {
    id: "profile",
    title: "About you",
    what: "Where you live (the town or postcode you give us), how far you are happy to travel, how you usually get about, your budget, your interests and what you hope the next chapter will bring, and your answers during set-up.",
    why: "To choose ideas that suit where you are and how you like to spend time.",
    tables: ["member_profiles"],
  },
  {
    id: "health",
    title: "Details about your health or beliefs, only if you choose to give them",
    what: "Anything you tell us about getting around (for example “no long walks”) and about food (for example “vegetarian” or “no shellfish”). These can reveal something about your health or your beliefs, so you are never required to fill them in, and you can change or remove them any time in Account.",
    why: "To avoid suggesting things that would not suit you.",
    tables: [],
  },
  {
    id: "plans",
    title: "Your plans and saved ideas",
    what: "The weekly plans we build for you, what you did with each idea (accepted, swapped, skipped), the surprise ideas we sent, and the ideas you have saved.",
    why: "To show you your week and your saved ideas.",
    tables: ["itineraries", "itinerary_items", "surprise_me_cards", "saved_ideas"],
  },
  {
    id: "activity",
    title: "What you do in the app",
    what: "Which ideas you open, save, plan and dismiss, how an outing went when you tell us (loved it, fine, not for me), and your reasons for saying no (too far, too expensive and so on).",
    why: "To learn what you enjoy, so each day’s suggestions feel more like you. This is not shared with anyone and is not used for advertising.",
    tables: ["experience_events", "preference_signals"],
  },
  {
    id: "today",
    title: "How you say you feel today",
    what: `Your energy, what you fancy doing, and whether you would rather stay indoors or walk less, if you choose to tell us. It can say something about your health.`,
    why: "To shape that day’s suggestions, and nothing else.",
    tables: ["daily_states"],
  },
  {
    id: "chat",
    title: "Your conversations with the concierge",
    what: "What you type in the chat and the replies you receive.",
    why: "To answer you, and to remember the thread of the conversation.",
    tables: ["chat_messages"],
  },
  {
    id: "people",
    title: "People and goals you add",
    what: "The first names, relationships and notes you add about people in your life, whether you would like to see them more, and the goals you set for yourself. People you add are not told, and you decide what to write about them: please keep notes to things you would be comfortable with them reading.",
    why: "To help you keep in touch and work towards what matters to you.",
    tables: ["people", "goals"],
  },
  {
    id: "messages",
    title: "Reminders and emails we send you",
    what: "A record of the reminders we have sent, and your email address held by our email provider while they deliver them.",
    why: "To send you your weekly plan and the occasional timely thought, and to avoid repeating ourselves.",
    tables: ["nudges"],
  },
  {
    id: "plan",
    title: "Your plan with us",
    what: "Which plan you are on. We do not take payments yet. Family sharing is planned but not switched on, and nothing is stored for it today.",
    why: "To know what you are entitled to.",
    tables: ["subscriptions", "family_links"],
  },
  {
    id: "usage",
    title: "Technical records of how the service is used",
    what: "For each request to the AI: which feature it was, its size and cost, how long it took and whether it failed. Not what you wrote. Our hosting provider also keeps ordinary technical logs, such as your IP address and the pages requested.",
    why: "To keep costs under control, to keep the service secure and to fix faults.",
    tables: ["ai_usage_logs"],
  },
];

export type Provider = {
  name: string;
  /** What we use them for. */
  role: string;
  /** What reaches them, in plain words. */
  receives: string;
  /** Web addresses the code calls directly (checked against the source by a test). */
  hosts: string[];
};

export const PROVIDERS: Provider[] = [
  {
    name: "Supabase",
    role: "Our database and sign-in.",
    receives: "Everything you give us, held securely, with sign-in and your password handled by them. Each member can only read their own information.",
    hosts: [],
  },
  {
    name: "Vercel",
    role: "Runs the website.",
    receives: "Your requests to the site, including the technical details that come with any web request, such as your IP address.",
    hosts: [],
  },
  {
    name: "Anthropic",
    role: "The AI that writes your suggestions, plans, reminders and chat replies.",
    receives:
      "What it needs to do each of those: for example your area, how far you will travel, your interests, goals, budget and any health or food notes you gave, a short summary of the kinds of things you tend to enjoy, plus what you type in the chat. When it writes a reminder about someone you have said you would like to see more, it is given their first name. It is not given your email address. We also ask it to look up local activities for a town, and for that it is sent only the name of the area.",
    hosts: [],
  },
  {
    name: "Resend",
    role: "Sends our emails.",
    receives: "Your email address and the email itself.",
    hosts: [],
  },
  {
    name: "Open-Meteo",
    role: "The weather forecast.",
    receives: "Your location, rounded to about a kilometre. Nothing that says who you are.",
    hosts: ["api.open-meteo.com"],
  },
  {
    name: "OpenStreetMap (Nominatim)",
    role: "Turns the place you type into a point on the map.",
    receives: "The place you typed, exactly as you typed it. If you give a full address, that is what they see. Nothing that says who you are.",
    hosts: ["nominatim.openstreetmap.org"],
  },
  {
    name: "Wikimedia Commons",
    role: "Photographs of places.",
    receives: "We ask them about a place, never about you. When a photograph is shown, your device fetches it from them, so they see your IP address, as with any picture on any website.",
    hosts: ["commons.wikimedia.org"],
  },
  {
    name: "Ticketmaster",
    role: "Local events.",
    receives: "The area to look in (the same for every member of that area). Nothing about you.",
    hosts: ["app.ticketmaster.com"],
  },
];

export const RETENTION: { what: string; howLong: string }[] = [
  { what: "How you say you feel today", howLong: `${DAILY_STATE_KEEP_DAYS} days, then it is deleted automatically.` },
  { what: "What we have learned about what you enjoy", howLong: "Until you clear it (Account, “Clear what we’ve learned”) or delete your account." },
  { what: "Everything else you have given us, and your conversations", howLong: "Until you delete your account. Deleting it removes it all from our live systems straight away. Copies in our database provider’s backups are overwritten on their normal cycle." },
  { what: "Technical usage records", howLong: "Kept without your identity once your account is deleted, because they hold nothing about you beyond cost and size." },
];

const detail = (field: OperatorField, placeholder: string, operator: Record<OperatorField, string | null>) => operator[field] ?? `[${placeholder}]`;

/** The notice's sections, with the company's details filled in (or an obvious gap where they are not yet known). */
export function privacySections(operator: Record<OperatorField, string | null> = OPERATOR): Section[] {
  const company = detail("companyName", "company name to be added", operator);
  const contact = detail("contactEmail", "contact email to be added", operator);
  const address = detail("address", "registered address to be added", operator);
  const companyNumber = detail("companyNumber", "company number to be added", operator);
  const ico = operator.icoNumber ? ` Our registration with the Information Commissioner’s Office is ${operator.icoNumber}.` : "";

  return [
    {
      id: "who",
      title: "Who we are",
      blocks: [
        { p: `Your Next Chapter is run by ${company}, a company registered in England and Wales (number ${companyNumber}), whose registered office is ${address}.` },
        { p: `We decide how and why your personal information is used, which makes us the “controller” under UK data protection law.${ico} For anything in this notice, write to ${contact}.` },
      ],
    },
    {
      id: "what",
      title: "What we hold, and why",
      blocks: [
        { p: "We hold only what you give us by using the service, and what the service learns from how you use it. We have no information about you from anywhere else." },
        { dl: DATA_CATEGORIES.map((c) => ({ term: c.title, text: `${c.what} We use it ${c.why.charAt(0).toLowerCase()}${c.why.slice(1)}` })) },
      ],
    },
    {
      id: "basis",
      title: "Our legal reasons",
      blocks: [
        { p: "UK law asks us to name the legal reason for each use of your information." },
        {
          ul: [
            "To provide the service you asked for. This covers your account, your profile, your plans, your conversations and the learning that makes suggestions personal. It is the main reason.",
            "Your consent, for anything about your health or beliefs (your mobility and food notes, and how you say you feel today). You choose whether to give these, and you can withdraw consent at any time by changing or deleting them, or by clearing what we have learned. Withdrawing never affects the rest of the service.",
            "Our legitimate interests, for the technical records that keep costs in check, keep the service secure and let us fix faults. We keep them to what is needed and they hold nothing you wrote.",
          ],
        },
        { p: "We do not sell your information, share it for advertising, or build a profile of you for anyone else. Suggestions are only suggestions: nothing is decided about you automatically in a way that affects your legal rights." },
      ],
    },
    {
      id: "shared",
      title: "Who else sees it",
      blocks: [
        { p: "We use a small number of other organisations to run the service. Each one only receives what it needs for its job, and acts on our instructions." },
        { dl: PROVIDERS.map((p) => ({ term: p.name, text: `${p.role} ${p.receives}` })) },
        { p: "Beyond these, we share your information only if the law requires it, or to protect someone’s safety." },
      ],
    },
    {
      id: "ai",
      title: "About the AI",
      blocks: [
        { p: "Suggestions, plans, reminders and chat replies are written with the help of an AI system. It can make mistakes, and it is told only to recommend things from our own list of places and events, but you should always check the details before you set out." },
        { p: "Under Anthropic’s terms for businesses, the information we send is not used to train their models." },
        { p: "To keep a runaway request from costing money, each member has a daily limit on how often the AI is used. Most people never meet it." },
      ],
    },
    {
      id: "abroad",
      title: "Where it is kept",
      blocks: [
        { p: "Some of the organisations above handle information outside the UK, including in the United States. Where that happens, we rely on the safeguards UK law accepts for it, such as an adequacy arrangement or standard contract terms with the provider." },
      ],
    },
    {
      id: "keep",
      title: "How long we keep it",
      blocks: [{ ul: RETENTION.map((r) => `${r.what}: ${r.howLong}`) }],
    },
    {
      id: "rights",
      title: "Your rights",
      blocks: [
        { p: "You can ask us at any time to:" },
        {
          ul: [
            "show you what we hold about you, and give you a copy",
            "correct anything that is wrong (most of it you can change yourself in Account)",
            "delete it (you can delete your whole account in Account, or clear only what we have learned)",
            "limit how we use it, or stop using it for something",
            "give you your information in a form you can take elsewhere",
          ],
        },
        { p: `There is no export button yet, so for a copy of your information, write to ${contact} and we will send it to you. We will answer within one month.` },
        { p: "If you are unhappy with how we have handled your information, please tell us first so we can put it right. You can also complain to the Information Commissioner’s Office at ico.org.uk, or on 0303 123 1113." },
      ],
    },
    {
      id: "cookies",
      title: "Cookies",
      blocks: [
        { p: "We use only the cookies needed to keep you signed in. We do not use advertising or tracking cookies, and we do not run analytics that follow you around." },
      ],
    },
    {
      id: "security",
      title: "Keeping it safe",
      blocks: [
        { p: "Information travels between your device and ours in encrypted form. Each member can read only their own information, and only a few people who run the service can reach the technical records. No online service can promise perfect security, and if something goes wrong that puts you at risk we will tell you and the regulator as the law requires." },
      ],
    },
    {
      id: "age",
      title: "Who this is for",
      blocks: [{ p: "Your Next Chapter is for adults. We do not knowingly collect information from anyone under 18." }],
    },
    {
      id: "changes",
      title: "Changes to this notice",
      blocks: [{ p: "If we change how we use your information in a way that matters, we will tell you before it takes effect. The date at the top shows when this notice last changed." }],
    },
  ];
}
