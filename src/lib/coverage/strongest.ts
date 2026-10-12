/**
 * Where the app has the most to offer today, said plainly to someone about to join, so a person in a town we do not yet
 * cover well is not surprised by thin results. A place is added here when it has been searched and checked, which is a
 * decision, not something worked out.
 */
export const STRONGEST_AREAS = ["Barnet", "Stevenage"] as const;

export function coverageNote(areas: readonly string[] = STRONGEST_AREAS): string {
  const list = areas.length > 1 ? `${areas.slice(0, -1).join(", ")} and ${areas.at(-1)}` : (areas[0] ?? "a few places");
  return `Lark Hour is strongest around ${list} for now. Elsewhere it has fewer ideas to begin with, and grows as we learn the area.`;
}
