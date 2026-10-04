"use client";

import { Button, ErrorNote, Sheet, Skeleton } from "@/components/ui";
import { placeLabel, priceBand } from "@/lib/someTime/format";
import { CATEGORY_COLOR } from "@/lib/theme";
import type { SwapAlternative } from "@/lib/types";
import styles from "@/components/WeekSheets.module.css";

/** Other ideas for the same slot, when someone would rather not do what was planned. */
export function SwapSheet({
  isLoading,
  alternatives,
  error,
  onChoose,
  onClose,
}: {
  isLoading: boolean;
  alternatives: SwapAlternative[];
  error: string | null;
  onChoose: (alternative: SwapAlternative) => void;
  onClose: () => void;
}) {
  return (
    <Sheet label="Something else" onClose={onClose}>
      <div className={styles.body}>
        <h2 className={styles.title}>How about one of these?</h2>

        <div aria-live="polite" aria-busy={isLoading}>
          {isLoading && (
            <div className={styles.skeletons}>
              {[0, 1, 2].map((i) => (
                <div key={i} className={styles.skeleton}>
                  <Skeleton height={14} width={70} radius={999} />
                  <Skeleton height={22} width="65%" />
                  <Skeleton height={14} width="40%" />
                </div>
              ))}
            </div>
          )}
          {error && <ErrorNote>{error}</ErrorNote>}
          {!isLoading && !error && alternatives.length === 0 && (
            <p className={styles.hint}>There&apos;s nothing else like this nearby right now. Check back soon.</p>
          )}
        </div>

        <ul className={styles.alternatives}>
          {alternatives.map((alt) => {
            const meta = [placeLabel(alt.address), priceBand(alt.priceEstimate)].filter(Boolean).join(" · ");
            return (
              <li key={alt.id} className={styles.alternative}>
                <p className={styles.category} style={{ color: CATEGORY_COLOR[alt.category] }}>
                  {alt.category}
                </p>
                <h3 className={styles.altTitle}>{alt.title}</h3>
                {meta && <p className={styles.meta}>{meta}</p>}
                <Button variant="secondary" fullWidth onClick={() => onChoose(alt)}>
                  Choose this one
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}
