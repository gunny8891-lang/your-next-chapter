"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, Check, X, Sparkles } from "lucide-react";
import { T, CATEGORY_COLOR } from "@/lib/theme";
import { Pill } from "@/components/Pill";
import type { ItineraryItemView, SurpriseOption } from "@/lib/types";
import type { SurpriseWhen, SurpriseWho } from "@/lib/surprise/onDemand";
import type { TodayWeather } from "@/lib/nudges/weather";

export type TodaySlot = { slot: string; item: ItineraryItemView | null };

const SLOT_LABEL: Record<string, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

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

function weatherLine(weather: TodayWeather): string | null {
  if (!weather) return null;
  return `${Math.round(weather.temperatureMax)}°C today · ${weather.precipitationProbabilityMax}% chance of rain`;
}

function OpenTimeSlot({
  slotLabel,
  onSurpriseMe,
  onAccept,
}: {
  slotLabel: string;
  onSurpriseMe: (who: SurpriseWho) => Promise<{ error: string | null; options: SurpriseOption[] }>;
  onAccept: (activityId: string) => Promise<{ error: string | null }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [who, setWho] = useState<SurpriseWho>("just_me");
  const [isPending, startTransition] = useTransition();
  const [options, setOptions] = useState<SurpriseOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acceptedId, setAcceptedId] = useState<string | null>(null);

  const handleSurpriseMe = () => {
    setError(null);
    startTransition(async () => {
      const result = await onSurpriseMe(who);
      if (result.error) {
        setError(result.error);
        setOptions(null);
      } else {
        setOptions(result.options);
      }
    });
  };

  if (!expanded) {
    return (
      <div style={{ background: T.accentSoft, border: `1.5px dashed ${T.accent}`, borderRadius: 14, padding: "18px 20px", marginBottom: 14 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: T.accent, letterSpacing: 0.3, margin: "0 0 4px" }}>{slotLabel.toUpperCase()}</p>
        <p style={{ fontFamily: "Georgia, serif", fontSize: 17, color: T.ink, margin: "0 0 12px" }}>✨ Open Time</p>
        <button
          onClick={() => setExpanded(true)}
          style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: T.primary, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          Make something of it
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 14, padding: "18px 20px", marginBottom: 14 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: T.accent, letterSpacing: 0.3, margin: "0 0 10px" }}>{slotLabel.toUpperCase()} · OPEN TIME</p>

      {!options && (
        <>
          <p style={{ fontSize: 13, fontWeight: 600, color: T.inkSoft, margin: "0 0 8px" }}>WHO</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {WHO_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setWho(opt.value)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 20,
                  border: `1.5px solid ${who === opt.value ? T.primary : T.line}`,
                  background: who === opt.value ? T.primary : T.surface,
                  color: who === opt.value ? "#fff" : T.ink,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleSurpriseMe}
            disabled={isPending}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 10,
              border: "none",
              background: T.accent,
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: isPending ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Sparkles size={15} /> {isPending ? "Finding something good…" : "Surprise Me"}
          </button>
        </>
      )}

      {error && <p style={{ color: "#B0562F", fontSize: 13.5, margin: "10px 0 0" }}>{error}</p>}

      {options && options.length === 0 && (
        <p style={{ fontSize: 13.5, color: T.inkSoft, margin: 0 }}>Nothing genuinely suitable nearby right now.</p>
      )}

      {options?.map((option) => (
        <div key={option.id} style={{ borderTop: `1px solid ${T.line}`, paddingTop: 12, marginTop: 12 }}>
          <div style={{ marginBottom: 6 }}>
            <Pill color={CATEGORY_COLOR[option.category] ?? T.primary}>{option.category}</Pill>
          </div>
          <p style={{ fontFamily: "Georgia, serif", fontSize: 15.5, color: T.ink, margin: "0 0 4px" }}>{option.title}</p>
          <p style={{ fontSize: 13, color: T.inkSoft, margin: "0 0 6px" }}>
            {[option.address, formatCost(option.priceEstimate)].filter(Boolean).join(" · ")}
          </p>
          <p style={{ fontSize: 13.5, color: T.ink, margin: "0 0 10px" }}>{option.why}</p>
          <button
            onClick={() => {
              setAcceptedId(option.id);
              startTransition(() => {
                void onAccept(option.id);
              });
            }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: acceptedId === option.id ? T.primarySoft : T.primary,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {acceptedId === option.id ? "Noted" : "I'll do this"}
          </button>
        </div>
      ))}

      <button
        onClick={() => {
          setExpanded(false);
          setOptions(null);
        }}
        style={{ background: "none", border: "none", color: T.inkSoft, fontSize: 12.5, marginTop: 14, cursor: "pointer", padding: 0 }}
      >
        Never mind
      </button>
    </div>
  );
}

export function TodayView({
  dateLabel,
  weather,
  slots,
  onItemAction,
  onSurpriseMe,
  onAccept,
}: {
  dateLabel: string;
  weather: TodayWeather;
  slots: TodaySlot[];
  onItemAction: (itemId: string, action: "accepted" | "swapped" | "skipped") => Promise<void>;
  onSurpriseMe: (when: SurpriseWhen, who: SurpriseWho, slot?: string) => Promise<{ error: string | null; options: SurpriseOption[] }>;
  onAccept: (activityId: string) => Promise<{ error: string | null }>;
}) {
  const [statuses, setStatuses] = useState<Record<string, string>>(() =>
    Object.fromEntries(slots.filter((s) => s.item).map((s) => [s.item!.id, s.item!.status]))
  );

  const handleAction = (itemId: string, action: "accepted" | "skipped") => {
    setStatuses((prev) => ({ ...prev, [itemId]: action }));
    void onItemAction(itemId, action);
  };

  const line = weatherLine(weather);

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <div style={{ background: T.primary, padding: "20px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <Link href="/week" style={{ color: "#EAE3D0", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
            <ChevronLeft size={14} /> Back to This Week
          </Link>
          <h1 style={{ fontFamily: "Georgia, serif", color: "#fff", fontSize: 24, margin: "10px 0 0" }}>Today</h1>
          <p style={{ color: "#EAE3D0", fontSize: 13.5, margin: "6px 0 0" }}>
            {dateLabel}
            {line ? ` · ${line}` : ""}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px 60px" }}>
        {slots.map(({ slot, item }) => {
          const slotLabel = SLOT_LABEL[slot] ?? slot;

          if (!item) {
            return (
              <OpenTimeSlot
                key={slot}
                slotLabel={slotLabel}
                onSurpriseMe={(who) => onSurpriseMe("today", who, slot)}
                onAccept={onAccept}
              />
            );
          }

          const status = statuses[item.id] ?? item.status;
          return (
            <div
              key={item.id}
              style={{
                background: T.surface,
                border: `1px solid ${T.line}`,
                borderRadius: 14,
                padding: "18px 20px",
                marginBottom: 14,
                opacity: status === "skipped" ? 0.55 : 1,
              }}
            >
              <p style={{ fontSize: 12, fontWeight: 700, color: CATEGORY_COLOR[item.category] ?? T.primary, letterSpacing: 0.3, margin: "0 0 6px" }}>
                {slotLabel.toUpperCase()} · {item.category.toUpperCase()}
              </p>
              <h3 style={{ fontFamily: "Georgia, serif", fontSize: 18, color: T.ink, margin: "0 0 6px" }}>{item.title}</h3>
              <p style={{ fontSize: 13.5, color: T.inkSoft, margin: "0 0 10px" }}>
                {item.time} · {item.location} · {item.cost}
              </p>
              {item.why && <p style={{ fontSize: 13.5, color: T.ink, margin: "0 0 12px" }}>{item.why}</p>}

              {status === "pending" && (
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => handleAction(item.id, "accepted")}
                    style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: T.primary, color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    <Check size={14} /> Accept
                  </button>
                  <button
                    onClick={() => handleAction(item.id, "skipped")}
                    style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1.5px solid ${T.line}`, background: "none", color: T.ink, fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    <X size={14} /> Skip
                  </button>
                </div>
              )}
              {status === "accepted" && <p style={{ fontSize: 13, color: T.primary, fontWeight: 600, margin: 0 }}>✓ Accepted</p>}
              {status === "skipped" && <p style={{ fontSize: 13, color: T.inkSoft, margin: 0 }}>Skipped</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
