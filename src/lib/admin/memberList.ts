/**
 * Who has registered, for the person running the app: the address, when they joined, whether they confirmed it, and
 * whether they finished setting up. It is for chasing someone whose confirmation email did not arrive or who stopped
 * halfway, so it holds nothing about what they do in the app. Pure; memberListLoader.ts reads the real data.
 * Admin accounts are left out, as in the counts above it.
 */

export type ListedAccount = { id: string; email: string | null; createdAt: string; confirmedAt: string | null };

export type MemberListRow = {
  email: string;
  /** YYYY-MM-DD */
  joined: string;
  emailConfirmed: boolean;
  finishedOnboarding: boolean;
  /** Whether the weekly plan email is on. Null until they have finished setting up. */
  weeklyPlanEmail: boolean | null;
};

/** The most rows shown: the newest first, with a note when there are more. */
export const MAX_LISTED = 200;

export function buildMemberList(
  accounts: ListedAccount[],
  adminIds: ReadonlySet<string>,
  profiles: { userId: string; weeklyPlan: boolean }[]
): { rows: MemberListRow[]; total: number } {
  const profileOf = new Map(profiles.map((p) => [p.userId, p]));
  const members = accounts
    .filter((a) => !adminIds.has(a.id) && a.email)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((a): MemberListRow => {
      const profile = profileOf.get(a.id);
      return {
        email: a.email as string,
        joined: a.createdAt.slice(0, 10),
        emailConfirmed: Boolean(a.confirmedAt),
        finishedOnboarding: Boolean(profile),
        weeklyPlanEmail: profile ? profile.weeklyPlan : null,
      };
    });
  return { rows: members.slice(0, MAX_LISTED), total: members.length };
}
