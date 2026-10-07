/** "Week of Monday 12 October": names the week a plan is for, from its Monday (YYYY-MM-DD). */
export function weekLabel(weekStart: string): string {
  const monday = new Date(`${weekStart}T12:00:00Z`);
  if (Number.isNaN(monday.getTime())) return "";
  return `Week of ${monday.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}`;
}
