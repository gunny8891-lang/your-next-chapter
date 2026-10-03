import { Coffee, Footprints } from "lucide-react";
import type { ReactNode } from "react";
import type { PlanLeg, PlanStop } from "@/lib/someTime/types";
import styles from "@/components/ui/Timeline.module.css";

type TimelineProps = {
  stops: PlanStop[];
  /** The journey between each pair of stops: legs.length === stops.length - 1. */
  legs: PlanLeg[];
  /** A closing line, e.g. "Leave 14:25 · home about 16:49". */
  summary?: ReactNode;
};

/**
 * An outing as a timeline: when, where, and how you get from one stop to the
 * next. Reads as an ordered list to a screen reader, with each journey said
 * aloud ("then a 5 minute walk").
 */
export function Timeline({ stops, legs, summary }: TimelineProps) {
  return (
    <div>
      <ol className={styles.timeline}>
        {stops.map((stop, i) => {
          const leg = legs[i];
          return (
            <li key={`${stop.time}-${stop.title}`} style={{ display: "contents" }}>
              <div className={styles.stop}>
                <span className={styles.time}>{stop.time}</span>
                <span className={styles.rail} aria-hidden="true">
                  <span className={`${styles.dot} ${stop.kind === "food" ? styles.dotFood : ""}`} />
                </span>
                <div className={styles.stopBody}>
                  <p className={styles.stopTitle}>
                    {stop.kind === "food" && <Coffee size={16} strokeWidth={1.75} aria-hidden="true" />}
                    {stop.title}
                  </p>
                  {(stop.subtitle || stop.note) && (
                    <p className={styles.stopSub}>{[stop.subtitle, stop.note].filter(Boolean).join(" · ")}</p>
                  )}
                  {stop.url && (
                    <a className={styles.more} href={stop.url} target="_blank" rel="noopener noreferrer">
                      More about this
                    </a>
                  )}
                </div>
              </div>

              {leg && (
                <div className={styles.leg}>
                  <span />
                  <span className={styles.rail} aria-hidden="true" />
                  <p className={styles.legBody}>
                    <Footprints size={14} strokeWidth={1.75} aria-hidden="true" />
                    <span>
                      <span className="sr-only">then a </span>
                      {leg.minutes} min walk
                    </span>
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {summary && <p className={styles.summary}>{summary}</p>}
    </div>
  );
}
