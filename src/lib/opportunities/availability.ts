type DatedActivity = { date_time: string | null; expires_at: string | null };

/**
 * Whether an activity can still be recommended.
 *
 * - expires_at set: available until then (an exhibition or series with a
 *   known end — date_time is just a sample date and is ignored).
 * - otherwise date_time set: a one-off event, available until it starts.
 * - neither: a standing group or venue, always available.
 */
export function isStillAvailable(activity: DatedActivity, now: Date): boolean {
  const cutoff = activity.expires_at ?? activity.date_time;
  if (!cutoff) return true;
  return new Date(cutoff).getTime() >= now.getTime();
}
