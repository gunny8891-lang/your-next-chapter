"use client";

import { useState } from "react";
import { Button, Chip } from "@/components/ui";
import { ENERGY_OPTIONS, INTENTION_OPTIONS, type DailyState, type Energy } from "@/lib/experience/dailyState";
import styles from "@/components/DailyStateStrip.module.css";

/**
 * "How are you today?": optional, one tap, and only for today. The energy choice
 * alone is enough; what they feel like, and the two practical choices, appear once
 * they have said how they are. It shapes today's suggestions and is not remembered
 * as a trait: the line under the choices says so, in plain words.
 */
export function DailyStateStrip({
  initial,
  onSave,
  onClear,
  onChange,
}: {
  initial: DailyState | null;
  /** Told whenever the choice changes, so the rest of the screen can follow. */
  onChange?: (state: DailyState | null) => void;
  onSave: (state: DailyState) => Promise<{ error: string | null }>;
  onClear: () => Promise<{ error: string | null }>;
}) {
  const [state, setState] = useState<DailyState | null>(initial);
  const [error, setError] = useState<string | null>(null);
  // The extras stay one tap away unless they have already chosen some: the energy choice alone is enough.
  const [showMore, setShowMore] = useState(Boolean(initial && (initial.intention || initial.indoors || initial.lessWalking)));

  const change = async (next: DailyState) => {
    const before = state;
    setState(next); // optimistic: it is one tap and easily changed
    onChange?.(next);
    setError(null);
    const res = await onSave(next);
    if (res.error) {
      setState(before);
      onChange?.(before);
      setError("We couldn't save that just now.");
    }
  };

  const pickEnergy = (energy: Energy) => change({ intention: null, indoors: false, lessWalking: false, ...state, energy });

  const clear = async () => {
    const before = state;
    setState(null);
    onChange?.(null);
    setError(null);
    const res = await onClear();
    if (res.error) {
      setState(before);
      onChange?.(before);
      setError("We couldn't clear that just now.");
    }
  };

  return (
    <section className={styles.strip} aria-labelledby="today-state">
      <h2 id="today-state" className={styles.title}>
        How are you today?
      </h2>

      <div className={styles.chips} role="group" aria-label="Your energy today">
        {ENERGY_OPTIONS.map((o) => (
          <Chip key={o.value} selected={state?.energy === o.value} onClick={() => pickEnergy(o.value)}>
            {o.label}
          </Chip>
        ))}
      </div>

      {state && (
        <div className={styles.footer}>
          <Button size="sm" variant="quiet" aria-expanded={showMore} onClick={() => setShowMore((v) => !v)}>
            {showMore ? "Fewer options" : "Say what you feel like"}
          </Button>
          <Button size="sm" variant="quiet" onClick={clear}>
            Never mind
          </Button>
        </div>
      )}

      {state && showMore && (
        <div className={`${styles.more} ync-appear`}>
          <p className={styles.sub}>What would suit you? (if you know)</p>
          <div className={styles.chips} role="group" aria-label="What you feel like today">
            {INTENTION_OPTIONS.map((o) => (
              <Chip key={o.value} selected={state.intention === o.value} onClick={() => change({ ...state, intention: state.intention === o.value ? null : o.value })}>
                {o.label}
              </Chip>
            ))}
          </div>
          <div className={styles.chips} role="group" aria-label="Anything to take into account today">
            <Chip selected={state.indoors} onClick={() => change({ ...state, indoors: !state.indoors })}>
              Indoors today
            </Chip>
            <Chip selected={state.lessWalking} onClick={() => change({ ...state, lessWalking: !state.lessWalking })}>
              Less walking
            </Chip>
          </div>
        </div>
      )}

      <p className={styles.note}>Optional. It only shapes today&apos;s ideas, and it&apos;s gone tomorrow.</p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}
