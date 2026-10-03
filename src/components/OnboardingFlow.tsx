"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Sun } from "lucide-react";
import { T } from "@/lib/theme";

const ONBOARD_STEPS = [
  {
    q: "Hello — I'll get to know you in a short chat, then build your first week. Where should we start looking for things to do?",
    field: "location",
    type: "text" as const,
    placeholder: "e.g. Bath, Somerset",
    suggestions: ["Richmond, London", "York", "Bristol"],
  },
  {
    q: "Good. And roughly how far would you like to travel for a typical outing?",
    field: "radius",
    type: "options" as const,
    options: ["Walking distance only", "Up to 3 miles", "Up to 10 miles", "I'm happy to travel further"],
  },
  {
    q: "What sounds most like you on a free afternoon?",
    field: "personality",
    type: "options" as const,
    options: ["A long walk, just me", "Coffee with one or two friends", "A group class or club", "A day trip somewhere new"],
  },
  {
    q: "Last one — what would make this next chapter feel worthwhile?",
    field: "goal",
    type: "options" as const,
    options: ["Meeting new people", "Staying active", "Learning something new", "Giving back locally"],
  },
] as const;

export type OnboardingAnswers = Record<string, string>;

export function OnboardingFlow({ onDone }: { onDone: (answers: OnboardingAnswers) => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [textValue, setTextValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const current = ONBOARD_STEPS[step];

  const choose = (opt: string) => {
    const next = { ...answers, [current.field]: opt };
    setAnswers(next);
    setTextValue("");
    if (step < ONBOARD_STEPS.length - 1) {
      setTimeout(() => setStep(step + 1), 150);
    } else {
      setTimeout(() => startTransition(() => onDone(next)), 400);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 20px" }}>
      <div style={{ width: "100%", maxWidth: 520 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 36 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: T.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sun size={18} color={T.accentSoft} />
          </div>
          <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 19, color: T.primary, letterSpacing: 0.2 }}>Your Next Chapter</span>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 28 }}>
          {ONBOARD_STEPS.map((_, i) => (
            <div key={i} style={{ height: 4, flex: 1, borderRadius: 2, background: i <= step ? T.primary : T.line, transition: "background 0.3s" }} />
          ))}
        </div>

        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: "28px 26px", marginBottom: 20 }}>
          <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 21, lineHeight: 1.5, color: T.ink, margin: 0 }}>
            {isPending ? "Saving your answers…" : current.q}
          </p>
        </div>

        {current.type === "text" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                autoFocus
                disabled={isPending}
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && textValue.trim()) choose(textValue.trim());
                }}
                placeholder={current.placeholder}
                style={{
                  flex: 1,
                  fontSize: 17,
                  padding: "16px 20px",
                  borderRadius: 12,
                  border: `1.5px solid ${T.line}`,
                  background: T.surface,
                  color: T.ink,
                  outline: "none",
                }}
              />
              <button
                disabled={isPending || !textValue.trim()}
                onClick={() => choose(textValue.trim())}
                style={{
                  padding: "0 20px",
                  borderRadius: 12,
                  border: "none",
                  background: textValue.trim() ? T.primary : T.line,
                  color: "#fff",
                  cursor: isPending || !textValue.trim() ? "default" : "pointer",
                }}
              >
                <ArrowRight size={18} />
              </button>
            </div>

            {current.suggestions && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {current.suggestions.map((s) => (
                  <button
                    key={s}
                    disabled={isPending}
                    onClick={() => setTextValue(s)}
                    style={{
                      fontSize: 14,
                      padding: "8px 14px",
                      borderRadius: 20,
                      border: `1px solid ${T.line}`,
                      background: T.surface,
                      color: T.inkSoft,
                      cursor: isPending ? "default" : "pointer",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {current.options.map((opt) => (
              <button
                key={opt}
                disabled={isPending}
                onClick={() => choose(opt)}
                style={{
                  textAlign: "left",
                  fontSize: 17,
                  padding: "16px 20px",
                  borderRadius: 12,
                  border: `1.5px solid ${answers[current.field] === opt ? T.primary : T.line}`,
                  background: answers[current.field] === opt ? T.primary : T.surface,
                  color: answers[current.field] === opt ? "#fff" : T.ink,
                  cursor: isPending ? "default" : "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  transition: "all 0.15s",
                }}
              >
                {opt}
                <ArrowRight size={16} style={{ opacity: 0.6 }} />
              </button>
            ))}
          </div>
        )}

        <p style={{ fontSize: 13, color: T.inkSoft, marginTop: 20 }}>
          Step {step + 1} of {ONBOARD_STEPS.length}
        </p>
      </div>
    </div>
  );
}
