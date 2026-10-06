"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronLeft } from "lucide-react";
import { Button, Chip, Field } from "@/components/ui";
import { Wordmark } from "@/components/Wordmark";
import styles from "@/components/Onboarding.module.css";

/**
 * Five short questions, one at a time. The option wording is stored and mapped by
 * saveOnboardingAction (radius, goal), so change it there too if it changes here.
 */
const STEPS = [
  {
    field: "firstName",
    type: "text" as const,
    heading: "First, what should we call you?",
    intro: "A few quick questions, then we'll have something good for today.",
    label: "Your first name",
    hint: "Just a first name is fine.",
    placeholder: "",
    autoComplete: "given-name",
    optional: true,
    suggestions: [] as string[],
  },
  {
    field: "location",
    type: "text" as const,
    heading: "Where should we look for things to do?",
    label: "Your town or area",
    hint: "",
    placeholder: "e.g. Bath, Somerset",
    autoComplete: "address-level2",
    optional: false,
    suggestions: ["Richmond, London", "York", "Bristol"],
  },
  {
    field: "radius",
    type: "options" as const,
    heading: "How far are you happy to go for a good outing?",
    options: ["Walking distance only", "Up to 3 miles", "Up to 10 miles", "I'm happy to travel further"],
  },
  {
    field: "personality",
    type: "options" as const,
    heading: "What does a good free afternoon look like?",
    options: ["A long walk, just me", "Coffee with one or two friends", "A group class or club", "A day trip somewhere new"],
  },
  {
    field: "goal",
    type: "options" as const,
    heading: "What would make this next chapter feel worthwhile?",
    options: ["Meeting new people", "Staying active", "Learning something new", "Giving back locally"],
  },
] as const;

export type OnboardingAnswers = Record<string, string>;

export function OnboardingFlow({ onDone }: { onDone: (answers: OnboardingAnswers) => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [textValue, setTextValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const current = STEPS[step];

  // Each new question is announced: focus moves to its heading.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const advance = (value: string) => {
    const next = { ...answers, [current.field]: value };
    setAnswers(next);
    setTextValue("");
    if (step < STEPS.length - 1) {
      setTimeout(() => setStep(step + 1), 150);
    } else {
      setTimeout(() => startTransition(() => onDone(next)), 300);
    }
  };

  const back = () => {
    const previous = STEPS[step - 1];
    setTextValue(previous.type === "text" ? (answers[previous.field] ?? "") : "");
    setStep(step - 1);
  };

  if (isPending) {
    return (
      <main className={styles.page}>
        <div className={styles.inner}>
          <p className={styles.brand}>
            <Wordmark size={32} />
          </p>
          <div className={`${styles.saving} ync-appear`} role="status">
            <h1 className={styles.heading}>Getting your first ideas ready…</h1>
            <p className={styles.intro}>This takes a moment. Thank you for your patience.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.brand}>
          <Wordmark size={32} />
        </p>

        <div
          className={styles.progress}
          role="progressbar"
          aria-label="Your progress"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
          aria-valuetext={`Question ${step + 1} of ${STEPS.length}`}
        >
          {STEPS.map((_, i) => (
            <span key={i} className={i <= step ? styles.done : ""} />
          ))}
        </div>

        <div key={step} className={`${styles.step} ync-appear`}>
          <div className={styles.top}>
            {step > 0 ? (
              <button type="button" className={styles.back} onClick={back}>
                <ChevronLeft size={18} aria-hidden="true" /> Back
              </button>
            ) : (
              <span />
            )}
            <span className={styles.count}>
              {step + 1} of {STEPS.length}
            </span>
          </div>

          <h1 className={styles.heading} ref={headingRef} tabIndex={-1}>
            {current.heading}
          </h1>
          {"intro" in current && current.intro && <p className={styles.intro}>{current.intro}</p>}

          {current.type === "text" ? (
            <form
              className={styles.form}
              onSubmit={(e) => {
                e.preventDefault();
                if (textValue.trim() || current.optional) advance(textValue.trim());
              }}
            >
              <Field
                label={current.label}
                name={current.field}
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                placeholder={current.placeholder}
                hint={current.hint || undefined}
                autoComplete={current.autoComplete}
                maxLength={current.field === "firstName" ? 40 : 120}
              />
              {current.suggestions.length > 0 && (
                <div className={styles.chips} role="group" aria-label="Suggestions">
                  {current.suggestions.map((s) => (
                    <Chip key={s} selected={textValue === s} onClick={() => setTextValue(s)}>
                      {s}
                    </Chip>
                  ))}
                </div>
              )}
              <div className={styles.buttons}>
                <Button type="submit" disabled={!current.optional && !textValue.trim()}>
                  Continue
                </Button>
                {current.optional && (
                  <Button variant="quiet" onClick={() => advance("")}>
                    Skip for now
                  </Button>
                )}
              </div>
            </form>
          ) : (
            <div className={styles.options} role="group" aria-label={current.heading}>
              {current.options.map((opt) => {
                const selected = answers[current.field] === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    className={styles.option}
                    aria-pressed={selected}
                    onClick={() => advance(opt)}
                  >
                    <span>{opt}</span>
                    {selected && <Check size={20} strokeWidth={2.25} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
