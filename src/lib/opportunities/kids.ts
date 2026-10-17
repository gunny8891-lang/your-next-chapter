/**
 * Things for children, for the grandparent who is taking them: what the catalogue's tags say about whether a place suits
 * children, and about which age. Nothing here knows more than the tags: a place is "for children" only if something
 * recorded about it says so, and never promised to be safe, supervised or right for a particular age.
 */

/** Tags that say a place or an event is for children, or for a family with children. */
export const KID_TAGS = ["grandchildren", "family", "toddlers", "playground", "play", "soft play", "children", "kids", "farm", "animals", "active play"];

/** The ages they can say, and "any" when they have not. */
export type KidsAge = "toddlers" | "young" | "older";
export type KidsChoice = KidsAge | "any";

export const KIDS_AGE_OPTIONS: { value: KidsChoice; label: string }[] = [
  { value: "toddlers", label: "Under 5" },
  { value: "young", label: "5 to 11" },
  { value: "older", label: "12 and over" },
  { value: "any", label: "Any age" },
];

export const KIDS_CHOICES: KidsChoice[] = ["any", "toddlers", "young", "older"];

/** What suits an age, by tag: a bonus, never a requirement. */
const SUITS_AGE: Record<KidsAge, string[]> = {
  toddlers: ["toddlers", "soft play", "playground", "play", "farm", "animals", "gardens", "nature"],
  young: ["playground", "farm", "animals", "wildlife", "mini golf", "active play", "museum", "swimming", "nature"],
  older: ["bowling", "mini golf", "active play", "trampoline", "ice rink", "theme park", "museum", "cinema", "swimming", "wildlife"],
};

/** What is known not to suit an age: left out. Toddlers cannot bowl; a twelve-year-old does not want a toddler group. */
const NOT_FOR_AGE: Record<KidsAge, string[]> = {
  toddlers: ["bowling", "ice rink", "theme park", "golf", "mini golf", "active play", "trampoline", "cinema"],
  young: ["toddlers"],
  older: ["toddlers", "soft play"],
};

/** Pure: whether the tags say it is for children. */
export function suitsChildren(tags: readonly string[] | undefined): boolean {
  return Boolean(tags?.some((t) => KID_TAGS.includes(t)));
}

/** Pure: whether something recorded about it says it is not for this age. */
export function notForAge(tags: readonly string[] | undefined, age: KidsAge): boolean {
  return Boolean(tags?.some((t) => NOT_FOR_AGE[age].includes(t)));
}

/** Pure: whether the tags say it suits this age in particular, beyond suiting children at all. */
export function suitsAge(tags: readonly string[] | undefined, age: KidsAge): boolean {
  return Boolean(tags?.some((t) => SUITS_AGE[age].includes(t)));
}

/** How the age reads in a sentence. */
export const KIDS_AGE_PHRASE: Record<KidsChoice, string> = {
  toddlers: "under five",
  young: "between five and eleven",
  older: "twelve or over",
  any: "of various ages",
};
