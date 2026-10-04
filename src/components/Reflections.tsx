"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui";
import type { Outcome } from "@/lib/experience/events";
import type { Reflection } from "@/lib/experience/reflections";
import styles from "@/components/Reflections.module.css";

type Answer = Outcome | "didnt_go";

const CHOICES: { value: Answer; label: string; variant: "secondary" | "quiet" }[] = [
  { value: "loved", label: "Loved it", variant: "secondary" },
  { value: "fine", label: "It was fine", variant: "secondary" },
  { value: "not_for_me", label: "Not for me", variant: "secondary" },
  { value: "didnt_go", label: "I didn't go", variant: "quiet" },
];

/**
 * "Did you get to ___?": a gentle look back at something they planned. One tap
 * answers it, and that answer is what teaches the app what they actually enjoy.
 * There is no scale and no free text, and it can be ignored.
 */
export function Reflections({
  items,
  onAnswer,
}: {
  items: Reflection[];
  onAnswer: (activityId: string, answer: Answer) => Promise<{ error: string | null }>;
}) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const answer = async (activityId: string, value: Answer) => {
    setBusy(activityId);
    setErrors((e) => ({ ...e, [activityId]: "" }));
    const res = await onAnswer(activityId, value);
    setBusy(null);
    if (res.error) setErrors((e) => ({ ...e, [activityId]: res.error ?? "" }));
    else setDone((d) => ({ ...d, [activityId]: true }));
  };

  if (items.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="reflect">
      <h2 id="reflect" className={styles.label}>
        How did it go?
      </h2>
      <ul className={styles.list} aria-live="polite">
        {items.map((item) => (
          <li key={item.activityId} className={styles.item}>
            {done[item.activityId] ? (
              <p className={styles.thanks}>
                <Check size={18} strokeWidth={2.25} aria-hidden="true" /> Thanks, that helps us choose better.
              </p>
            ) : (
              <>
                <p className={styles.question}>
                  Did you get to <strong>{item.title}</strong>?
                </p>
                <div className={styles.choices}>
                  {CHOICES.map((c) => (
                    <Button key={c.value} size="sm" variant={c.variant} disabled={busy === item.activityId} onClick={() => answer(item.activityId, c.value)}>
                      {c.label}
                    </Button>
                  ))}
                </div>
                {errors[item.activityId] && <p className={styles.error}>{errors[item.activityId]}</p>}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
