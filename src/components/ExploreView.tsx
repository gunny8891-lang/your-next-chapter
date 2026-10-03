"use client";

import { useState, useTransition } from "react";
import { Sparkles, Check } from "lucide-react";
import { T, CATEGORY_COLOR } from "@/lib/theme";
import { Pill } from "@/components/Pill";
import type { SurpriseOption } from "@/lib/types";
import type { SurpriseWhen, SurpriseWho } from "@/lib/surprise/onDemand";

const WHEN_OPTIONS: { value: SurpriseWhen; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "weekend", label: "Weekend" },
];

const WHO_OPTIONS: { value: SurpriseWho; label: string }[] = [
  { value: "just_me", label: "Just me" },
  { value: "partner", label: "Partner" },
  { value: "friends", label: "Friends" },
  { value: "family", label: "Family" },
];

function formatCost(price: number | null): string {
  if (price === null) return "Price TBC";
  if (price === 0) return "Free";
  return `£${price}`;
}

function pillButtonStyle(active: boolean) {
  return {
    padding: "8px 16px",
    borderRadius: 20,
    border: `1.5px solid ${active ? T.primary : T.line}`,
    background: active ? T.primary : T.surface,
    color: active ? "#fff" : T.ink,
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
  };
}

export function ExploreView({
  onSurpriseMe,
  onAccept,
  onDismiss,
}: {
  onSurpriseMe: (when: SurpriseWhen, who: SurpriseWho) => Promise<{ error: string | null; options: SurpriseOption[] }>;
  onAccept: (activityId: string) => Promise<{ error: string | null }>;
  onDismiss: (activityId: string) => Promise<{ error: string | null }>;
}) {
  const [when, setWhen] = useState<SurpriseWhen>("today");
  const [who, setWho] = useState<SurpriseWho>("just_me");
  const [isPending, startTransition] = useTransition();
  const [options, setOptions] = useState<SurpriseOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acceptedId, setAcceptedId] = useState<string | null>(null);

  const handleSurpriseMe = () => {
    setError(null);
    setAcceptedId(null);
    startTransition(async () => {
      const result = await onSurpriseMe(when, who);
      if (result.error) {
        setError(result.error);
        setOptions(null);
      } else {
        setOptions(result.options);
      }
    });
  };

  const handleDismiss = (id: string) => {
    void onDismiss(id);
    setOptions((current) => (current ? current.filter((o) => o.id !== id) : current));
  };

  const handleAccept = (id: string) => {
    setAcceptedId(id);
    startTransition(() => {
      void onAccept(id);
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <div style={{ background: T.primary, padding: "20px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", color: "#fff", fontSize: 24, margin: "10px 0 0", display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles size={22} /> Explore
          </h1>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px 60px" }}>
        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: "22px", marginBottom: 20 }}>
          <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 18, color: T.ink, margin: "0 0 16px" }}>Surprise Me</h2>

          <p style={{ fontSize: 13, fontWeight: 600, color: T.inkSoft, margin: "0 0 8px" }}>WHEN</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {WHEN_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => setWhen(opt.value)} style={pillButtonStyle(when === opt.value)}>
                {opt.label}
              </button>
            ))}
          </div>

          <p style={{ fontSize: 13, fontWeight: 600, color: T.inkSoft, margin: "0 0 8px" }}>WHO</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {WHO_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => setWho(opt.value)} style={pillButtonStyle(who === opt.value)}>
                {opt.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleSurpriseMe}
            disabled={isPending}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 12,
              border: "none",
              background: T.accent,
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              cursor: isPending ? "default" : "pointer",
              opacity: isPending ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Sparkles size={16} />
            {isPending ? "Finding something good…" : options ? "Surprise Me again" : "Surprise Me"}
          </button>
        </div>

        {error && (
          <div style={{ background: "#F5E9E2", border: "1px solid #D3A98C", borderRadius: 10, padding: "12px 14px", marginBottom: 20, fontSize: 14, color: "#8A4A28" }}>
            {error}
          </div>
        )}

        {options && options.length === 0 && !error && (
          <p style={{ fontSize: 14, color: T.inkSoft, textAlign: "center", padding: "20px 0" }}>
            Nothing genuinely suitable nearby right now — check back soon as we find more.
          </p>
        )}

        {options?.map((option) => (
          <div
            key={option.id}
            style={{
              background: T.surface,
              border: `1px solid ${T.line}`,
              borderRadius: 14,
              padding: "18px 20px",
              marginBottom: 12,
            }}
          >
            <div style={{ marginBottom: 8 }}>
              <Pill color={CATEGORY_COLOR[option.category] ?? T.primary}>{option.category}</Pill>
            </div>
            <h3 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 18, color: T.ink, margin: "0 0 6px" }}>{option.title}</h3>
            <p style={{ fontSize: 13.5, color: T.inkSoft, margin: "0 0 10px" }}>
              {[option.address, formatCost(option.priceEstimate)].filter(Boolean).join(" · ")}
            </p>
            <p style={{ fontSize: 14, color: T.ink, margin: "0 0 14px", lineHeight: 1.5 }}>{option.why}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => handleAccept(option.id)}
                disabled={isPending}
                style={{
                  flex: 1,
                  padding: "11px",
                  borderRadius: 10,
                  border: "none",
                  background: acceptedId === option.id ? T.primarySoft : T.primary,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: isPending ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                {acceptedId === option.id ? (
                  <>
                    <Check size={14} /> Noted
                  </>
                ) : (
                  "I'll do this"
                )}
              </button>
              <button
                onClick={() => handleDismiss(option.id)}
                disabled={isPending}
                style={{
                  flex: 1,
                  padding: "11px",
                  borderRadius: 10,
                  border: `1.5px solid ${T.line}`,
                  background: "none",
                  color: T.inkSoft,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: isPending ? "default" : "pointer",
                }}
              >
                Not for me
              </button>
              {option.bookingUrl && (
                <a
                  href={option.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    padding: "11px",
                    borderRadius: 10,
                    border: `1.5px solid ${T.line}`,
                    color: T.ink,
                    fontSize: 14,
                    fontWeight: 600,
                    textAlign: "center",
                    textDecoration: "none",
                  }}
                >
                  Details
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
