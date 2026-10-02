"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Check, X, Hourglass } from "lucide-react";
import { T, CATEGORY_COLOR } from "@/lib/theme";
import { SomeTimeFlow, type SomeTimeInitial } from "@/components/SomeTimeFlow";
import type { ItineraryItemView } from "@/lib/types";
import type { TodayWeather } from "@/lib/nudges/weather";
import type { TimeResult } from "@/lib/someTime/types";

export type TodaySlot = { slot: string; item: ItineraryItemView | null };

const SLOT_LABEL: Record<string, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

/** Where "I've got some time" starts when it is opened from an empty part of the day. */
const SLOT_START: Record<string, SomeTimeInitial> = {
  morning: { start: "now", duration: "1-2h" },
  afternoon: { start: "afternoon", duration: "1-2h" },
  evening: { start: "evening", duration: "1-2h" },
};

type FlowActions = {
  onFind: React.ComponentProps<typeof SomeTimeFlow>["onFind"];
  onAccept: React.ComponentProps<typeof SomeTimeFlow>["onAccept"];
  onFeedback: React.ComponentProps<typeof SomeTimeFlow>["onFeedback"];
};

function weatherLine(weather: TodayWeather): string | null {
  if (!weather) return null;
  return `${Math.round(weather.temperatureMax)}°C today · ${weather.precipitationProbabilityMax}% chance of rain`;
}

/** The headline entry point: always available, whatever is or isn't planned. */
function GotSomeTime({ flow }: { flow: FlowActions }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ background: T.surface, border: `1.5px solid ${T.accent}`, borderRadius: 16, padding: "18px 20px", marginBottom: 22 }}>
      <p style={{ fontFamily: "Georgia, serif", fontSize: 19, color: T.ink, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
        <Hourglass size={18} color={T.accent} /> I&apos;ve got some time
      </p>
      {!open ? (
        <>
          <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 14px", lineHeight: 1.5 }}>
            Tell me how long you have and I&apos;ll suggest a few great ways to spend it.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{ minHeight: 46, padding: "10px 22px", borderRadius: 12, border: "none", background: T.accent, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            Let&apos;s find something
          </button>
        </>
      ) : (
        <div style={{ marginTop: 14 }}>
          <SomeTimeFlow {...flow} />
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: T.inkSoft, fontSize: 13, marginTop: 14, cursor: "pointer", padding: 0 }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

/** An empty part of today's plan, which opens the same flow already pointed at that time. */
function OpenTimeSlot({ slotLabel, slot, flow }: { slotLabel: string; slot: string; flow: FlowActions }) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <div style={{ background: T.accentSoft, border: `1.5px dashed ${T.accent}`, borderRadius: 14, padding: "18px 20px", marginBottom: 14 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: T.accent, letterSpacing: 0.3, margin: "0 0 4px" }}>{slotLabel.toUpperCase()}</p>
        <p style={{ fontFamily: "Georgia, serif", fontSize: 17, color: T.ink, margin: "0 0 12px" }}>✨ Open Time</p>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{ minHeight: 44, padding: "10px 18px", borderRadius: 10, border: "none", background: T.primary, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          Make something of it
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 14, padding: "18px 20px", marginBottom: 14 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: T.accent, letterSpacing: 0.3, margin: "0 0 12px" }}>{slotLabel.toUpperCase()} · OPEN TIME</p>
      <SomeTimeFlow {...flow} initial={SLOT_START[slot]} />
      <button
        type="button"
        onClick={() => setExpanded(false)}
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
  onFindTime,
  onAcceptTime,
  onFeedbackTime,
}: {
  dateLabel: string;
  weather: TodayWeather;
  slots: TodaySlot[];
  onItemAction: (itemId: string, action: "accepted" | "swapped" | "skipped") => Promise<void>;
  onFindTime: (request: { start: "now" | "afternoon" | "evening"; duration: "30m" | "1-2h" | "half_day" | "rest_of_day"; who: "just_me" | "partner" | "friends" | "family"; mood: "surprise" | "social" | "active" | "culture" | "relaxed" | "food" | null; exclude: string[] }) => Promise<TimeResult>;
  onAcceptTime: FlowActions["onAccept"];
  onFeedbackTime: FlowActions["onFeedback"];
}) {
  const [statuses, setStatuses] = useState<Record<string, string>>(() =>
    Object.fromEntries(slots.filter((s) => s.item).map((s) => [s.item!.id, s.item!.status]))
  );

  const flow: FlowActions = { onFind: onFindTime, onAccept: onAcceptTime, onFeedback: onFeedbackTime };

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
        <GotSomeTime flow={flow} />

        {slots.map(({ slot, item }) => {
          const slotLabel = SLOT_LABEL[slot] ?? slot;

          if (!item) {
            return <OpenTimeSlot key={slot} slotLabel={slotLabel} slot={slot} flow={flow} />;
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
                    style={{ flex: 1, minHeight: 44, padding: "10px", borderRadius: 8, border: "none", background: T.primary, color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    <Check size={14} /> Accept
                  </button>
                  <button
                    onClick={() => handleAction(item.id, "skipped")}
                    style={{ flex: 1, minHeight: 44, padding: "10px", borderRadius: 8, border: `1.5px solid ${T.line}`, background: "none", color: T.ink, fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
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
