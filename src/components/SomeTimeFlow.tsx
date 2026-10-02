"use client";

import { useState, useTransition } from "react";
import { Check, Clock, Coffee, MapPin, Sparkles } from "lucide-react";
import { T, CATEGORY_COLOR } from "@/lib/theme";
import { Pill } from "@/components/Pill";
import type { TimeOption, TimeResult } from "@/lib/someTime/types";

type Start = "now" | "afternoon" | "evening";
type Duration = "30m" | "1-2h" | "half_day" | "rest_of_day";
type Who = "just_me" | "partner" | "friends" | "family";
type Mood = "surprise" | "social" | "active" | "culture" | "relaxed" | "food";
type Reason = "not_my_thing" | "too_far" | "too_expensive" | "seen_it";

export type SomeTimeInitial = { start?: Start; duration?: Duration };

const DURATIONS: { value: Duration; label: string }[] = [
  { value: "30m", label: "30 mins" },
  { value: "1-2h", label: "1–2 hours" },
  { value: "half_day", label: "Half a day" },
  { value: "rest_of_day", label: "Rest of the day" },
];

const WHOS: { value: Who; label: string }[] = [
  { value: "just_me", label: "Just me" },
  { value: "partner", label: "Partner" },
  { value: "friends", label: "Friends" },
  { value: "family", label: "Family" },
];

const MOODS: { value: Mood; label: string }[] = [
  { value: "surprise", label: "Surprise me" },
  { value: "social", label: "Social" },
  { value: "active", label: "Active" },
  { value: "culture", label: "Culture" },
  { value: "relaxed", label: "Relaxed" },
  { value: "food", label: "Food & drink" },
];

const REASONS: { value: Reason; label: string }[] = [
  { value: "not_my_thing", label: "Not my thing" },
  { value: "too_far", label: "Too far" },
  { value: "too_expensive", label: "Too expensive" },
  { value: "seen_it", label: "Been there" },
];

const STORAGE_KEY = "ync.sometime.v1";

type Saved = { duration?: Duration; who?: Who; mood?: Mood | null };

/**
 * How they last answered, so the usual case is one tap. Storage can be
 * unavailable (private windows, blocked cookies), so every failure just means
 * "no saved answers" and nothing depends on it. Only ever called on the client:
 * this component mounts after the member opens it, never during server render.
 */
function readSaved(): Saved | null {
  try {
    if (typeof window === "undefined") return null;
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Saved | null;
  } catch {
    return null;
  }
}

/** Starts a person can still pick: "this afternoon" is no use at 6pm. */
function availableStarts(hour: number): { value: Start; label: string }[] {
  const starts: { value: Start; label: string }[] = [{ value: "now", label: "Now" }];
  if (hour < 17) starts.push({ value: "afternoon", label: "This afternoon" });
  if (hour < 21) starts.push({ value: "evening", label: "This evening" });
  return starts;
}

const chip = (active: boolean) => ({
  minHeight: 44,
  padding: "8px 16px",
  borderRadius: 22,
  border: `1.5px solid ${active ? T.primary : T.line}`,
  background: active ? T.primary : T.surface,
  color: active ? "#fff" : T.ink,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
});

function Group({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }} role="group" aria-label={label}>
      <p style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft, letterSpacing: 0.4, margin: "0 0 8px" }}>
        {label.toUpperCase()}
        {hint ? <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}> · {hint}</span> : null}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

type Props = {
  initial?: SomeTimeInitial;
  onFind: (request: { start: Start; duration: Duration; who: Who; mood: Mood | null; exclude: string[] }) => Promise<TimeResult>;
  onAccept: (activityId: string, choice: { start: Start; duration: Duration }, foodStopId?: string) => Promise<{ error: string | null }>;
  onFeedback: (activityId: string, reason: Reason) => Promise<{ error: string | null }>;
};

export function SomeTimeFlow({ initial, onFind, onAccept, onFeedback }: Props) {
  const [saved] = useState(readSaved);
  const [start, setStart] = useState<Start>(initial?.start ?? "now");
  const [duration, setDuration] = useState<Duration>(
    initial?.duration ?? (DURATIONS.some((d) => d.value === saved?.duration) ? saved!.duration! : "1-2h")
  );
  const [who, setWho] = useState<Who>(WHOS.some((w) => w.value === saved?.who) ? saved!.who! : "just_me");
  const [mood, setMood] = useState<Mood | null>(MOODS.some((m) => m.value === saved?.mood) ? saved!.mood! : null);
  const [hour] = useState(() => new Date().getHours());

  const [result, setResult] = useState<TimeResult | null>(null);
  const [shown, setShown] = useState<string[]>([]);
  const [acceptedId, setAcceptedId] = useState<string | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const starts = availableStarts(hour);
  const effectiveStart = starts.some((s) => s.value === start) ? start : "now";

  const find = (exclude: string[]) => {
    setError(null);
    setFeedbackFor(null);
    setAcceptedId(null);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ duration, who, mood }));
    } catch {
      /* ignore */
    }
    startTransition(async () => {
      const res = await onFind({ start: effectiveStart, duration, who, mood, exclude });
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
      const res = await onAccept(option.id, { start: effectiveStart, duration }, option.foodStop?.id);
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

  // ------------------------------------------------------------------ form
  if (!result) {
    return (
      <div>
        <Group label="When">
          {starts.map((s) => (
            <button key={s.value} type="button" aria-pressed={effectiveStart === s.value} onClick={() => setStart(s.value)} style={chip(effectiveStart === s.value)}>
              {s.label}
            </button>
          ))}
        </Group>
        <Group label="How long have you got?">
          {DURATIONS.map((d) => (
            <button key={d.value} type="button" aria-pressed={duration === d.value} onClick={() => setDuration(d.value)} style={chip(duration === d.value)}>
              {d.label}
            </button>
          ))}
        </Group>
        <Group label="Who with">
          {WHOS.map((w) => (
            <button key={w.value} type="button" aria-pressed={who === w.value} onClick={() => setWho(w.value)} style={chip(who === w.value)}>
              {w.label}
            </button>
          ))}
        </Group>
        <Group label="In the mood for" hint="optional">
          {MOODS.map((m) => (
            <button key={m.value} type="button" aria-pressed={mood === m.value} onClick={() => setMood(mood === m.value ? null : m.value)} style={chip(mood === m.value)}>
              {m.label}
            </button>
          ))}
        </Group>

        {error && <p style={{ color: "#B0562F", fontSize: 13.5, margin: "0 0 12px" }}>{error}</p>}
        <button
          type="button"
          onClick={() => find([])}
          disabled={isPending}
          style={{
            width: "100%",
            minHeight: 48,
            borderRadius: 12,
            border: "none",
            background: T.accent,
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            cursor: isPending ? "default" : "pointer",
            opacity: isPending ? 0.75 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Sparkles size={16} /> {isPending ? "Finding the best way to spend it…" : "Find something"}
        </button>
      </div>
    );
  }

  // --------------------------------------------------------------- results
  return (
    <div>
      {result.windowLabel && (
        <p style={{ fontSize: 13, color: T.inkSoft, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
          <Clock size={14} /> {result.windowLabel}
        </p>
      )}

      {result.notice && result.options.length === 0 && <p style={{ fontSize: 14, color: T.ink, margin: "0 0 14px", lineHeight: 1.5 }}>{result.notice}</p>}
      {error && <p style={{ color: "#B0562F", fontSize: 13.5, margin: "0 0 12px" }}>{error}</p>}

      {result.options.map((option) => (
        <div key={option.id} style={{ border: `1px solid ${T.line}`, borderRadius: 14, padding: "16px 16px 14px", marginBottom: 12, background: T.surface }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <Pill color={CATEGORY_COLOR[option.category] ?? T.primary}>{option.isFood ? "Food & drink" : option.category}</Pill>
            {option.happeningToday && <Pill color={T.accent}>On today</Pill>}
          </div>
          <h3 style={{ fontFamily: "Georgia, serif", fontSize: 18, color: T.ink, margin: "0 0 4px" }}>{option.title}</h3>
          {option.address && (
            <p style={{ fontSize: 13, color: T.inkSoft, margin: "0 0 6px", display: "flex", gap: 5, alignItems: "flex-start" }}>
              <MapPin size={13} style={{ marginTop: 2, flexShrink: 0 }} /> {option.address}
            </p>
          )}
          <p style={{ fontSize: 13, color: T.inkSoft, margin: "0 0 8px" }}>{option.facts.join(" · ")}</p>
          <p style={{ fontSize: 14.5, color: T.ink, margin: "0 0 10px", lineHeight: 1.5 }}>{option.why}</p>

          <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "0 0 10px" }}>
            Leave {option.leaveBy} · there by {option.arriveBy} · home about {option.homeBy}
          </p>

          {option.foodStop && (
            <div style={{ background: T.accentSoft, borderRadius: 10, padding: "10px 12px", margin: "0 0 12px", fontSize: 13.5, color: T.ink }}>
              <p style={{ margin: 0, display: "flex", gap: 6, alignItems: "center", fontWeight: 600 }}>
                <Coffee size={14} /> Then: {option.foodStop.title}
              </p>
              <p style={{ margin: "3px 0 0", color: T.inkSoft, fontSize: 13 }}>
                {option.foodStop.kind} for {option.foodStop.meal} · {option.foodStop.walkMinutes} min walk ({option.foodStop.distanceMeters} m)
                {option.foodStop.openUntil ? ` · open until ${option.foodStop.openUntil}` : ""}
              </p>
            </div>
          )}

          {acceptedId === option.id && !error ? (
            <p style={{ fontSize: 14, color: T.primary, fontWeight: 600, margin: 0, display: "flex", gap: 6, alignItems: "center" }}>
              <Check size={15} /> {isPending ? "Adding to your day…" : "Added to your day"}
            </p>
          ) : feedbackFor === option.id ? (
            <div>
              <p style={{ fontSize: 13, color: T.inkSoft, margin: "0 0 8px" }}>What was it about this one?</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {REASONS.map((r) => (
                  <button key={r.value} type="button" onClick={() => giveFeedback(option, r.value)} style={{ ...chip(false), minHeight: 40, padding: "6px 14px", fontSize: 13 }}>
                    {r.label}
                  </button>
                ))}
                <button type="button" onClick={() => setFeedbackFor(null)} style={{ background: "none", border: "none", color: T.inkSoft, fontSize: 13, cursor: "pointer", padding: "6px 8px" }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => accept(option)}
                disabled={isPending}
                style={{ flex: "1 1 120px", minHeight: 44, borderRadius: 10, border: "none", background: T.primary, color: "#fff", fontSize: 14, fontWeight: 600, cursor: isPending ? "default" : "pointer" }}
              >
                I&apos;ll do this
              </button>
              {option.bookingUrl && (
                <a
                  href={option.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ flex: "1 1 80px", minHeight: 44, borderRadius: 10, border: `1.5px solid ${T.line}`, color: T.ink, fontSize: 14, fontWeight: 600, textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  Details
                </a>
              )}
              <button
                type="button"
                onClick={() => setFeedbackFor(option.id)}
                disabled={isPending}
                style={{ flex: "1 1 100px", minHeight: 44, borderRadius: 10, border: `1.5px solid ${T.line}`, background: "none", color: T.inkSoft, fontSize: 14, fontWeight: 600, cursor: isPending ? "default" : "pointer" }}
              >
                Not for me
              </button>
            </div>
          )}
        </div>
      ))}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
        <button
          type="button"
          onClick={() => find(shown)}
          disabled={isPending}
          style={{ flex: "1 1 160px", minHeight: 44, borderRadius: 10, border: `1.5px solid ${T.primary}`, background: "none", color: T.primary, fontSize: 14, fontWeight: 600, cursor: isPending ? "default" : "pointer" }}
        >
          {isPending ? "Looking…" : "Show me different ideas"}
        </button>
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setShown([]);
            setError(null);
          }}
          style={{ flex: "1 1 120px", minHeight: 44, borderRadius: 10, border: "none", background: "none", color: T.inkSoft, fontSize: 14, cursor: "pointer" }}
        >
          Change my answers
        </button>
      </div>
    </div>
  );
}
