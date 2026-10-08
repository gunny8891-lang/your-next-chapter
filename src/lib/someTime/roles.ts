/**
 * Up to three ideas read better as three different kinds of good than as three of the same: the one that suits
 * them best, one that is a change from the usual, and one for company. The labels are worked out here, from facts
 * about the ideas (never by the model), after the final order is known, and only where they are true: an idea that
 * is not social is never called social, and nothing is labelled when there is only one idea. Pure.
 */

import { themesOf, primaryTheme } from "@/lib/opportunities/taxonomy";
import type { SurpriseWho } from "@/lib/surprise/context";

export type OptionRole = "best" | "different" | "social";

export const ROLE_LABEL: Record<OptionRole, string> = {
  best: "Best match",
  different: "Something different",
  social: "Something social",
};

type RoleSubject = { category: string; tags: string[]; isFood: boolean };

/** Somewhere people go to be with other people: a group, a class, a club, a pub or a tea room. */
function isSocial(o: RoleSubject): boolean {
  if (o.category === "Connect" || themesOf(o).includes("community")) return true;
  return o.tags.some((t) => ["pub", "afternoon-tea", "u3a", "classes", "coffee morning"].includes(t));
}

/**
 * One role (or none) for each idea, in the order given, which is best first.
 * - The first is the best match.
 * - The first of the rest that is social is the social one, unless they are already going with someone: then
 *   "something social" would be odd, so there is none.
 * - Of what is left, the first that differs from the best match in kind (its main theme, else its category) is the
 *   different one. If nothing differs, nothing is labelled different.
 */
export function assignRoles(options: RoleSubject[], who: SurpriseWho): (OptionRole | null)[] {
  const roles: (OptionRole | null)[] = options.map(() => null);
  if (options.length < 2) return roles;
  roles[0] = "best";

  if (who === "just_me") {
    const social = options.findIndex((o, i) => i > 0 && isSocial(o));
    if (social !== -1) roles[social] = "social";
  }

  const best = options[0];
  const differs = (o: RoleSubject) => {
    const a = primaryTheme(best);
    const b = primaryTheme(o);
    return a !== null && b !== null ? a !== b : o.category !== best.category;
  };
  const different = options.findIndex((o, i) => i > 0 && roles[i] === null && differs(o));
  if (different !== -1) roles[different] = "different";
  return roles;
}
