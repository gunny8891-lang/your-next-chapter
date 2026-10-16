import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, Skeleton } from "@/components/ui";
import { FeaturedIdea, type FlowActions } from "@/components/TodayView";
import { getFeaturedOption } from "@/lib/someTime/recommend";
import { scheduleImageLookups } from "@/lib/someTime/imageLookups";
import styles from "@/components/Today.module.css";

/**
 * "For you today": the single best idea for the rest of the day. It is the slowest thing on Today to work out (it weighs
 * everything nearby against what they like), so Today is sent without it and this fills in a moment later, instead of the whole
 * page waiting for it. A bonus: if anything about it fails, Today simply shows without it.
 */
export async function FeaturedForYou({ supabase, userId, flow }: { supabase: SupabaseClient; userId: string; flow: FlowActions }) {
  const featured = await getFeaturedOption(supabase, userId).catch((err) => {
    console.warn("today: could not build the featured idea:", err instanceof Error ? err.message : err);
    return null;
  });
  if (featured) scheduleImageLookups([featured]);

  if (!featured) {
    // Late in the day, or nothing suitable nearby: say so, rather than leave the page ending in silence.
    return (
      <p className={styles.quiet}>
        Nothing more to suggest for today. If you&apos;d like to look again, tap &ldquo;I&apos;ve got some time&rdquo;.
      </p>
    );
  }
  return <FeaturedIdea key={featured.id} option={featured} flow={flow} />;
}

/** Shaped like the idea, so nothing jumps when it arrives. */
export function FeaturedFallback() {
  return (
    <div role="status" aria-busy="true" aria-label="Finding something for you">
      <Card padding="none">
        <Skeleton height={190} radius={0} />
        <div style={{ padding: 20, display: "grid", gap: 12 }}>
          <Skeleton height={26} width="75%" />
          <Skeleton height={14} width="55%" />
          <Skeleton height={16} />
          <Skeleton height={16} width="80%" />
        </div>
      </Card>
    </div>
  );
}
