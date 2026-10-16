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
  onPlanAgain,
}: {
  items: Reflection[];
  onAnswer: (activityId: string, answer: Answer) => Promise<{ error: string | null }>;
  onPlanAgain: (activityId: string, date: string, slot: string) => Promise<{ error: string | null; when?: string }>;
}) {
  const [done, setDone] = useState<Record<string, Answer>>({});
  // Planning it again: what it said, once it has been tried.
  const [again, setAgain] = useState<Record<string, { message: string; ok: boolean }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const answer = async (activityId: string, value: Answer) => {
    setBusy(activityId);
    setErrors((e) => ({ ...e, [activityId]: "" }));
    const res = await onAnswer(activityId, value);
    setBusy(null);
    if (res.error) setErrors((e) => ({ ...e, [activityId]: res.error ?? "" }));
    else setDone((d) => ({ ...d, [activityId]: value }));
  };

  const planItAgain = async (item: Reflection) => {
    if (!item.slot) return;
    setBusy(item.activityId);
    const res = await onPlanAgain(item.activityId, item.date, item.slot);
    setBusy(null);
    setAgain((a) => ({ ...a, [item.activityId]: res.error ? { message: res.error, ok: false } : { message: `Done: ${res.when} next week.`, ok: true } }));
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
              <>
                <p className={styles.thanks}>
                  <Check size={18} strokeWidth={2.25} aria-hidden="true" /> Thanks, that helps us choose better.
                </p>
                {done[item.activityId] === "loved" && item.canRepeat && item.slot && !again[item.activityId]?.ok && (
                  <div className={styles.choices}>
                    <Button size="sm" variant="secondary" disabled={busy === item.activityId} onClick={() => planItAgain(item)}>
                      Plan it again next week
                    </Button>
                  </div>
                )}
                {again[item.activityId] && <p className={again[item.activityId].ok ? styles.thanks : styles.error}>{again[item.activityId].message}</p>}
              </>
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
