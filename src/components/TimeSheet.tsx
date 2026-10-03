"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronLeft, Clock, Coffee } from "lucide-react";
import { Button, Card, Chip, ErrorNote, Skeleton } from "@/components/ui";
import { Pill } from "@/components/Pill";
import { CATEGORY_COLOR, T } from "@/lib/theme";
import {
  availableStarts,
  DURATION_OPTIONS,
  MOOD_OPTIONS,
  startLabel,
  summaryLine,
  untilOption,
  WHO_OPTIONS,
  type Commitment,
} from "@/lib/someTime/choices";
import type { DurationChoice, Mood, StartChoice } from "@/lib/someTime/request";
import type { SurpriseWho } from "@/lib/surprise/context";
import type { TimeOption, TimeResult } from "@/lib/someTime/types";
import styles from "@/components/TimeSheet.module.css";

type Reason = "not_my_thing" | "too_far" | "too_expensive" | "seen_it";

const REASONS: { value: Reason; label: string }[] = [
  { value: "not_my_thing", label: "Not my thing" },
  { value: "too_far", label: "Too far" },
  { value: "too_expensive", label: "Too expensive" },
  { value: "seen_it", label: "Been there" },
];

export type TimeSheetInitial = { start?: StartChoice; duration?: DurationChoice };

type FindRequest = {
  start: StartChoice;
  duration: DurationChoice;
  untilMin?: number | null;
  who: SurpriseWho;
  mood: Mood | null;
  exclude: string[];
};

type Props = {
  initial?: TimeSheetInitial;
  /** The next thing already in the member's day, if any: lets us offer "Until Tennis". */
  commitment: Commitment | null;
  /** The time now, in minutes after midnight. */
  nowMin: number;
  onFind: (request: FindRequest) => Promise<TimeResult>;
  onAccept: (
    activityId: string,
    choice: { start: StartChoice; duration: DurationChoice; untilMin?: number | null },
    foodStopId?: string
  ) => Promise<{ error: string | null }>;
  onFeedback: (activityId: string, reason: Reason) => Promise<{ error: string | null }>;
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

const isDuration = (v: unknown): v is DurationChoice => DURATION_OPTIONS.some((d) => d.value === v);
const isWho = (v: unknown): v is SurpriseWho => WHO_OPTIONS.some((w) => w.value === v);

export function TimeSheet({ initial, commitment, nowMin, onFind, onAccept, onFeedback, onClose }: Props) {
  const [saved] = useState(readSaved);
  const [step, setStep] = useState<"time" | "feel" | "results">("time");
  const [start, setStart] = useState<StartChoice>(initial?.start ?? "now");
  const [duration, setDuration] = useState<DurationChoice>(initial?.duration ?? (isDuration(saved?.duration) ? saved!.duration! : "1-2h"));
  const [untilMin, setUntilMin] = useState<number | null>(null);
  const [who, setWho] = useState<SurpriseWho>(isWho(saved?.who) ? saved!.who! : "just_me");
  const [mood, setMood] = useState<Mood | null>(null);
  const [showWhen, setShowWhen] = useState(false);
  const [showWho, setShowWho] = useState(false);

  const [result, setResult] = useState<TimeResult | null>(null);
  const [shown, setShown] = useState<string[]>([]);
  const [acceptedId, setAcceptedId] = useState<string | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
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

  const chooseDuration = (value: DurationChoice, until: number | null = null) => {
    setDuration(value);
    setUntilMin(until);
    setStep("feel");
  };

  const run = (chosenMood: Mood | null, exclude: string[]) => {
    setError(null);
    setFeedbackFor(null);
    setAcceptedId(null);
    setMood(chosenMood);
    setResult(null);
    setStep("results");
    writeSaved({ duration: duration === "until_next" ? undefined : duration, who });
    startTransition(async () => {
      const res = await onFind({ start: effectiveStart, duration, untilMin, who, mood: chosenMood, exclude });
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
      const res = await onAccept(option.id, { start: effectiveStart, duration, untilMin }, option.foodStop?.id);
      if (res.error) {
        setAcceptedId(null);
        setError(res.error);
      }
    });
  };

  const giveFeedback = (option: TimeOption, reason: Reason) => {
    void onFeedback(option.id, reason);
    setFeedbackFor(null);
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
          {until && (
            <button type="button" className={`${styles.option} ${styles.optionUntil}`} onClick={() => chooseDuration("until_next", until.untilMin)}>
              <span className={styles.optionLabel}>{until.label}</span>
              <span className={styles.optionHint}>{until.hint}</span>
            </button>
          )}
          {DURATION_OPTIONS.map((d) => (
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
        {result && result.notice && result.options.length === 0 && <p>{result.notice}</p>}

        {result?.options.map((option) => (
          <Card key={option.id} className="ync-appear">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Pill color={CATEGORY_COLOR[option.category] ?? CATEGORY_COLOR.Joy}>{option.isFood ? "Food & drink" : option.category}</Pill>
              {option.happeningToday && <Pill color={T.accent}>On today</Pill>}
            </div>
            <h3 className={styles.cardTitle}>{option.title}</h3>
            <p className={styles.cardMeta}>{option.facts.join(" · ")}</p>
            <p className={styles.cardWhy}>{option.why}</p>
            <p className={styles.cardPlan}>
              Leave {option.leaveBy} · there by {option.arriveBy} · home about {option.homeBy}
            </p>
            {option.foodStop && (
              <p className={styles.then}>
                <Coffee size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>
                  Then {option.foodStop.meal} at <strong>{option.foodStop.title}</strong>, {option.foodStop.walkMinutes} min walk
                  {option.foodStop.openUntil ? ` · open until ${option.foodStop.openUntil}` : ""}
                </span>
              </p>
            )}

            {acceptedId === option.id && !error ? (
              <p className={styles.added}>
                <Check size={18} strokeWidth={2.25} aria-hidden="true" /> {isPending ? "Adding to your day…" : "Added to your day"}
              </p>
            ) : feedbackFor === option.id ? (
              <div className={styles.reasons}>
                <p className={styles.reasonsLabel}>What was it about this one?</p>
                <div className={styles.chips}>
                  {REASONS.map((r) => (
                    <Chip key={r.value} selected={false} onClick={() => giveFeedback(option, r.value)}>
                      {r.label}
                    </Chip>
                  ))}
                  <Button variant="quiet" size="sm" onClick={() => setFeedbackFor(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className={styles.cardActions}>
                <Button onClick={() => accept(option)} disabled={isPending}>
                  I&apos;ll do this
                </Button>
                {option.bookingUrl && (
                  <Button variant="secondary" href={option.bookingUrl} target="_blank" rel="noopener noreferrer">
                    Details
                  </Button>
                )}
                <Button variant="quiet" onClick={() => setFeedbackFor(option.id)} disabled={isPending}>
                  Not for me
                </Button>
              </div>
            )}
          </Card>
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
