/**
 * Most "Give Back" entries in the catalogue are standing volunteer roles (befriending, a charity shop
 * shift, a school reading helper): a commitment that asks for weeks of someone's time, not an outing for
 * Tuesday afternoon. Offered freely they crowded the plan and read like homework. Unless the member said
 * giving back is what would make this chapter worthwhile, none are offered; if they did, at most one is,
 * so the week still has room for everything else. One-off events with a date (a litter pick on Saturday)
 * are ordinary outings and are never touched. Pure: takes ranked candidates, returns them in the same order.
 */

export const GIVING_BACK_GOAL = "give_back";
const MAX_ROLES_FOR_GIVERS = 1;

type Candidate = { category: string; date_time: string | null };

export function isSignUpRole(c: Candidate): boolean {
  return c.category === "Give Back" && c.date_time === null;
}

export function limitSignUpRoles<T extends Candidate>(ranked: T[], goals: readonly string[]): T[] {
  const max = goals.includes(GIVING_BACK_GOAL) ? MAX_ROLES_FOR_GIVERS : 0;
  let kept = 0;
  return ranked.filter((c) => {
    if (!isSignUpRole(c)) return true;
    if (kept >= max) return false;
    kept += 1;
    return true;
  });
}
