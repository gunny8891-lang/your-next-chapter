"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, Clock } from "lucide-react";
import { Button, Card, Chip, ErrorNote, Skeleton } from "@/components/ui";
import { ExperienceCard, type FeedbackReason } from "@/components/ExperienceCard";
import {
  availableStarts,
  DURATION_OPTIONS,
  durationOptionsFor,
  MOOD_OPTIONS,
  startLabel,
  summaryLine,
  untilOption,
  WHO_OPTIONS,
  type Commitment,
} from "@/lib/someTime/choices";
import { INTENTION_OPTIONS } from "@/lib/experience/dailyState";
import { SPEND_OPTIONS, type ExperienceContext, type Spend } from "@/lib/context/constraints";
import type { DurationChoice, Mood, StartChoice } from "@/lib/someTime/request";
import type { SurpriseWho } from "@/lib/surprise/context";
import type { TimeOption, TimeResult } from "@/lib/someTime/types";
import styles from "@/components/TimeSheet.module.css";

export type TimeSheetInitial = { start?: StartChoice; duration?: DurationChoice };

type FindRequest = {
  start: StartChoice;
  duration: DurationChoice;
  untilMin?: number | null;
  who: SurpriseWho;
  mood: Mood | null;
  exclude: string[];
  /** What they said about this outing (a spend, the dog coming). Absent when they said nothing. */
  context?: ExperienceContext;
};

/** What the sheet needs to know about the member's dog: only members who have one are asked. */
export type DogInfo = { hasDog: boolean; usuallyComes: boolean; name: string | null };

type Props = {
  initial?: TimeSheetInitial;
  /** The next thing already in the member's day, if any: lets us offer "Until Tennis". */
  commitment: Commitment | null;
  /** What they said they feel like today (Daily State), offered as one tap. */
  suggestedMood?: Mood | null;
  /** The time now, in minutes after midnight. */
  nowMin: number;
  /** Their dog, if they have one. Without one, "Dog coming" is never shown. */
  dog?: DogInfo;
  onFind: (request: FindRequest) => Promise<TimeResult>;
  onAccept: (
    activityId: string,
    choice: { start: StartChoice; duration: DurationChoice; untilMin?: number | null },
    foodStopId?: string,
    meta?: { surface?: string; who?: string }
  ) => Promise<{ error: string | null }>;
  onFeedback: (activityId: string, reason: FeedbackReason, meta?: { surface?: string; who?: string }) => Promise<{ error: string | null }>;
  onSave: (activityId: string, meta?: { surface?: string; who?: string }) => Promise<{ error: string | null }>;
  onClose: () => void;
};

const STORAGE_KEY = "ync.sometime.v2";
type Saved = { duration?: DurationChoice; who?: SurpriseWho };

/**
 * How they last answered, so the usual case is quicker. Storage can be
 * unavailable (private windows, blocked cookies): any failure just means "no
 * saved answers". Only called on the client — the sheet mounts on a tap.
 */
function readSaved(): Saved | null {
  try {
    if (typeof window === "undefined") return null;
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Saved | null;
  } catch {
    return null;
  }
}

function writeSaved(saved: Saved) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    /* nothing depends on it */
  }
}

/** What they chose for this outing, as the request carries it; undefined when they chose nothing (spend not set, no dog). */
export function extrasContext(spend: Spend | "any", dog: DogInfo | undefined, dogComing: boolean): ExperienceContext | undefined {
  const context: ExperienceContext = {};
  if (spend !== "any") context.spend = spend;
  // Said either way for someone with a dog, so that "No" overrides a usual "Yes" for this outing.
  if (dog?.hasDog) context.dog = dogComing;
  return Object.keys(context).length > 0 ? context : undefined;
}

/** The choices so far, in a line: "Spend: Don't mind · Dog coming". */
export function extrasSummary(spend: Spend | "any", dog: DogInfo | undefined, dogComing: boolean): string {
  const label = SPEND_OPTIONS.find((o) => o.value === spend)?.label ?? "Don't mind";
  return `Spend: ${label}${dog?.hasDog && dogComing ? " · Dog coming" : ""}`;
}

const isDuration = (v: unknown): v is DurationChoice => DURATION_OPTIONS.some((d) => d.value === v);
const isWho = (v: unknown): v is SurpriseWho => WHO_OPTIONS.some((w) => w.value === v);

export function TimeSheet({ initial, commitment, suggestedMood, nowMin, dog, onFind, onAccept, onFeedback, onSave, onClose }: Props) {
  const [saved] = useState(readSaved);
  const [step, setStep] = useState<"time" | "feel" | "results">("time");
  const [start, setStart] = useState<StartChoice>(initial?.start ?? "now");
  const [duration, setDuration] = useState<DurationChoice>(initial?.duration ?? (isDuration(saved?.duration) ? saved!.duration! : "1-2h"));
  const [untilMin, setUntilMin] = useState<number | null>(null);
  const [who, setWho] = useState<SurpriseWho>(isWho(saved?.who) ? saved!.who! : "just_me");
  const [mood, setMood] = useState<Mood | null>(null);
  const [showWhen, setShowWhen] = useState(false);
  const [showWho, setShowWho] = useState(false);
  // Optional, and for this outing only: spend is not remembered, and the dog starts as what they usually do.
  const [spend, setSpend] = useState<Spend | "any">("any");
  const [dogComing, setDogComing] = useState<boolean>(dog?.hasDog === true && dog.usuallyComes);
  const [showExtras, setShowExtras] = useState(false);

  const [result, setResult] = useState<TimeResult | null>(null);
  const [shown, setShown] = useState<string[]>([]);
  const [acceptedId, setAcceptedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Each new question is announced: move focus to its heading.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const until = untilOption(commitment, nowMin);
  const hour = Math.floor(nowMin / 60);
  const starts = availableStarts(hour);
  const effectiveStart = starts.some((s) => s.value === start) ? start : "now";
  // Tomorrow has its own lengths of time, and no "until my next thing": that is about the day they are in.
  const durations = durationOptionsFor(effectiveStart);

  const chooseDuration = (value: DurationChoice, until: number | null = null) => {
    setDuration(value);
    setUntilMin(until);
    setStep("feel");
  };

  const run = (chosenMood: Mood | null, exclude: string[]) => {
    setError(null);
    setAcceptedId(null);
    setMood(chosenMood);
    setResult(null);
    setStep("results");
    writeSaved({ duration: duration === "until_next" ? undefined : duration, who });
    startTransition(async () => {
      const context = extrasContext(spend, dog, dogComing);
      const res = await onFind({ start: effectiveStart, duration, untilMin, who, mood: chosenMood, exclude, ...(context ? { context } : {}) });
      if (res.error) {
        setError(res.error);
        return;
      }
      setResult(res);
      setShown((prev) => [...new Set([...exclude, ...prev, ...res.options.map((o) => o.id)])]);
    });
  };

  const accept = (option: TimeOption) => {
    setError(null);
    setAcceptedId(option.id);
    startTransition(async () => {
      const res = await onAccept(option.id, { start: effectiveStart, duration, untilMin }, option.foodStop?.id, { surface: "sheet", who });
      if (res.error) {
        setAcceptedId(null);
        setError(res.error);
      }
    });
  };

  const giveFeedback = (option: TimeOption, reason: FeedbackReason) => {
    void onFeedback(option.id, reason, { surface: "sheet", who });
    setResult((r) => (r ? { ...r, options: r.options.filter((o) => o.id !== option.id) } : r));
  };

  // ------------------------------------------------------------ 1. how long
  if (step === "time") {
    return (
      <div className={styles.step} key="time">
        <h2 className={styles.heading} ref={headingRef} tabIndex={-1}>
          How much time have you got?
        </h2>

        <button type="button" className={styles.refine} onClick={() => setShowWhen((v) => !v)} aria-expanded={showWhen}>
          {startLabel(effectiveStart)} · <strong>{showWhen ? "Done" : "Change"}</strong>
        </button>
        {showWhen && (
          <div className={styles.chips} role="group" aria-label="When">
            {starts.map((s) => (
              <Chip key={s.value} selected={effectiveStart === s.value} onClick={() => setStart(s.value)}>
                {s.label}
              </Chip>
            ))}
          </div>
        )}

        <div className={styles.options}>
          {until && effectiveStart !== "tomorrow" && (
            <button type="button" className={`${styles.option} ${styles.optionUntil}`} onClick={() => chooseDuration("until_next", until.untilMin)}>
              <span className={styles.optionLabel}>{until.label}</span>
              <span className={styles.optionHint}>{until.hint}</span>
            </button>
          )}
          {durations.map((d) => (
            <button
              key={d.value}
              type="button"
              className={`${styles.option} ${!until && duration === d.value && saved?.duration === d.value ? styles.optionRemembered : ""}`}
              onClick={() => chooseDuration(d.value)}
            >
              <span className={styles.optionLabel}>{d.label}</span>
              <span className={styles.optionHint}>{d.hint}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------- 2. the mood
  if (step === "feel") {
    return (
      <div className={styles.step} key="feel">
        <div className={styles.feelTop}>
          <button type="button" className={styles.back} onClick={() => setStep("time")}>
            <ChevronLeft size={18} aria-hidden="true" /> {summaryLine({ duration, start: effectiveStart, untilMin })}
          </button>
        </div>
        <h2 className={styles.heading} ref={headingRef} tabIndex={-1}>
          What do you feel like?
        </h2>

        <div className={styles.feelBody}>
          {/* Tapping any of these is the answer: there is no separate Submit. */}
          {suggestedMood && suggestedMood !== "surprise" && (
            <Button variant="primary" fullWidth onClick={() => run(suggestedMood, [])}>
              {INTENTION_OPTIONS.find((o) => o.value === suggestedMood)?.label ?? suggestedMood}, as you said today
            </Button>
          )}
          <Button variant="accent" fullWidth onClick={() => run("surprise", [])}>
            Surprise me
          </Button>
          <div className={styles.chips} role="group" aria-label="Or choose a mood">
            {MOOD_OPTIONS.filter((m) => m.value !== "surprise").map((m) => (
              <Chip key={m.value} selected={false} onClick={() => run(m.value, [])}>
                {m.label}
              </Chip>
            ))}
          </div>

          <div className={styles.who}>
            <button type="button" className={styles.refine} onClick={() => setShowExtras((v) => !v)} aria-expanded={showExtras}>
              {extrasSummary(spend, dog, dogComing)} · <strong>{showExtras ? "Done" : "Change"}</strong>
            </button>
            {showExtras && (
              <div className={styles.extras}>
                <p className={styles.extraLabel}>Spend, per person</p>
                <div className={styles.chips} role="group" aria-label="Spend per person">
                  {SPEND_OPTIONS.map((o) => (
                    <Chip key={o.value} selected={spend === o.value} onClick={() => setSpend(o.value)}>
                      {o.label}
                    </Chip>
                  ))}
                </div>
                {dog?.hasDog && (
                  <>
                    <p className={styles.extraLabel}>{dog.name ? `Is ${dog.name} coming?` : "Is the dog coming?"}</p>
                    <div className={styles.chips} role="group" aria-label="Dog coming">
                      <Chip selected={dogComing} onClick={() => setDogComing(true)}>
                        Yes
                      </Chip>
                      <Chip selected={!dogComing} onClick={() => setDogComing(false)}>
                        No
                      </Chip>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className={styles.who}>
            <button type="button" className={styles.refine} onClick={() => setShowWho((v) => !v)} aria-expanded={showWho}>
              {WHO_OPTIONS.find((w) => w.value === who)?.label} · <strong>{showWho ? "Done" : "Going with someone?"}</strong>
            </button>
            {showWho && (
              <div className={styles.chips} role="group" aria-label="Who with">
                {WHO_OPTIONS.map((w) => (
                  <Chip key={w.value} selected={who === w.value} onClick={() => setWho(w.value)}>
                    {w.label}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ 3. results
  const loading = isPending && !result && !error;
  return (
    <div className={styles.step} key="results">
      <h2 className={styles.heading} ref={headingRef} tabIndex={-1}>
        {loading ? "Finding something good…" : result && result.options.length > 0 ? "A few ideas for you" : "Let me think again"}
      </h2>
      <p className={styles.sub}>{summaryLine({ duration, start: effectiveStart, untilMin, mood })}</p>

      <div className={styles.results} aria-live="polite" aria-busy={loading}>
        {loading &&
          [0, 1, 2].map((i) => (
            <Card key={i}>
              <div style={{ display: "grid", gap: 10 }}>
                <Skeleton height={14} width={90} radius={999} />
                <Skeleton height={24} width="70%" />
                <Skeleton height={14} width="45%" />
                <Skeleton height={16} />
                <Skeleton height={16} width="85%" />
              </div>
            </Card>
          ))}

        {error && <ErrorNote>{error}</ErrorNote>}

        {result && result.windowLabel && (
          <p className={styles.windowLine}>
            <Clock size={14} aria-hidden="true" /> {result.windowLabel}
          </p>
        )}
        {result && result.notice && <p>{result.notice}</p>}

        {result?.options.map((option) => (
          <ExperienceCard
            key={option.id}
            option={option}
            reason={option.why}
            variant="result"
            surface="sheet"
            who={who}
            state={acceptedId === option.id && !error ? (isPending ? "planning" : "planned") : "idle"}
            error={acceptedId === option.id || !acceptedId ? error : null}
            onPlan={() => accept(option)}
            onSave={() => onSave(option.id, { surface: "sheet", who })}
            onNotForMe={(reason) => giveFeedback(option, reason)}
          />
        ))}
      </div>

      {!loading && (
        <div className={styles.footer}>
          {result && result.options.length > 0 && (
            <Button variant="secondary" onClick={() => run(mood, shown)} disabled={isPending}>
              Show me different ideas
            </Button>
          )}
          <Button variant="quiet" onClick={() => setStep("time")}>
            Change my answers
          </Button>
          {acceptedId && !isPending && !error && <Button onClick={onClose}>Done</Button>}
        </div>
      )}
    </div>
  );
}
