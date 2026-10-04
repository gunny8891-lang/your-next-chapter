"use client";

import { useState } from "react";
import { Check, ChevronRight, Hourglass } from "lucide-react";
import { CATEGORY_COLOR } from "@/lib/theme";
import { Button, Sheet, WeatherLine } from "@/components/ui";
import { ExperienceCard, type FeedbackReason } from "@/components/ExperienceCard";
import { DailyStateStrip } from "@/components/DailyStateStrip";
import { Reflections } from "@/components/Reflections";
import type { DailyState } from "@/lib/experience/dailyState";
import type { Reflection } from "@/lib/experience/reflections";
import { TimeSheet, type TimeSheetInitial } from "@/components/TimeSheet";
import { nextCommitment, type Commitment } from "@/lib/someTime/choices";
import { isUnknownDetail } from "@/lib/itinerary/format";
import { placeLabel } from "@/lib/someTime/format";
import type { ItineraryItemView } from "@/lib/types";
import type { TodayWeather } from "@/lib/nudges/weather";
import type { TimeOption } from "@/lib/someTime/types";
import styles from "@/components/Today.module.css";

export type TodaySlot = { slot: string; item: ItineraryItemView | null };

const SLOT_LABEL: Record<string, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

/** Where "I've got some time" starts when it is opened from a free part of the day. */
const SLOT_START: Record<string, TimeSheetInitial> = {
  morning: { start: "now", duration: "1-2h" },
  afternoon: { start: "afternoon", duration: "1-2h" },
  evening: { start: "evening", duration: "1-2h" },
};

type FlowActions = {
  onFind: React.ComponentProps<typeof TimeSheet>["onFind"];
  onAccept: React.ComponentProps<typeof TimeSheet>["onAccept"];
  onFeedback: React.ComponentProps<typeof TimeSheet>["onFeedback"];
  onSave: React.ComponentProps<typeof TimeSheet>["onSave"];
};

/** The best idea for the rest of the day, as the same card the "I've got some time" sheet uses. */
function FeaturedIdea({ option, flow }: { option: TimeOption; flow: FlowActions }) {
  const [state, setState] = useState<"idle" | "planning" | "planned" | "hidden">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "hidden") return null;

  const plan = async () => {
    setError(null);
    setState("planning");
    // The same window the idea was chosen for, so it lands in the right part of the day.
    const result = await flow.onAccept(option.id, { start: "now", duration: "half_day" }, option.foodStop?.id, { surface: "today" });
    if (result.error) {
      setError(result.error);
      setState("idle");
    } else {
      setState("planned");
    }
  };

  const notForMe = (reason: FeedbackReason) => {
    void flow.onFeedback(option.id, reason, { surface: "today" });
    setState("hidden");
  };

  return (
    <ExperienceCard
      option={option}
      reason={option.reason || option.why}
      variant="hero"
      surface="today"
      state={state}
      error={error}
      onPlan={plan}
      onSave={() => flow.onSave(option.id, { surface: "today" })}
      onNotForMe={notForMe}
    />
  );
}

export function TodayView({
  greeting,
  firstName,
  dateLabel,
  weather,
  slots,
  featured,
  onItemAction,
  onFindTime,
  onAcceptTime,
  onFeedbackTime,
  onSaveTime,
  dailyState: initialDailyState,
  reflections,
  onSaveDailyState,
  onClearDailyState,
  onAnswerReflection,
}: {
  greeting: string;
  firstName: string;
  dateLabel: string;
  weather: TodayWeather;
  slots: TodaySlot[];
  featured: TimeOption | null;
  onItemAction: (itemId: string, action: "accepted" | "swapped" | "skipped") => Promise<void>;
  onFindTime: FlowActions["onFind"];
  onAcceptTime: FlowActions["onAccept"];
  onFeedbackTime: FlowActions["onFeedback"];
  onSaveTime: FlowActions["onSave"];
  dailyState: DailyState | null;
  reflections: Reflection[];
  onSaveDailyState: (state: DailyState) => Promise<{ error: string | null }>;
  onClearDailyState: () => Promise<{ error: string | null }>;
  onAnswerReflection: React.ComponentProps<typeof Reflections>["onAnswer"];
}) {
  // How they said they are today, followed as it changes so the sheet can offer it.
  const [dailyState, setDailyState] = useState<DailyState | null>(initialDailyState);
  const [statuses, setStatuses] = useState<Record<string, string>>(() =>
    Object.fromEntries(slots.filter((s) => s.item).map((s) => [s.item!.id, s.item!.status]))
  );
  // The "I've got some time" sheet, when open: where it starts, and what is next in the member's day.
  const [sheet, setSheet] = useState<{ initial?: TimeSheetInitial; commitment: Commitment | null; nowMin: number } | null>(null);

  const flowActions: FlowActions = { onFind: onFindTime, onAccept: onAcceptTime, onFeedback: onFeedbackTime, onSave: onSaveTime };

  const openFlow = (initial?: TimeSheetInitial) => {
    // Read the clock when it is opened (not during render), and look for something
    // already planned later today: that lets the sheet offer "Until Tennis".
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const commitment = nextCommitment(
      slots.flatMap(({ item }) => (item ? [{ title: item.title, time: item.time, skipped: (statuses[item.id] ?? item.status) === "skipped" }] : [])),
      nowMin
    );
    setSheet({ initial, commitment, nowMin });
  };

  const handleAction = (itemId: string, action: "accepted" | "skipped") => {
    setStatuses((prev) => ({ ...prev, [itemId]: action }));
    void onItemAction(itemId, action);
  };

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.greeting}>{firstName ? `${greeting}, ${firstName}` : greeting}</h1>
        <p className={styles.dateLine}>
          <span>{dateLabel}</span>
          <WeatherLine weather={weather} />
        </p>
      </header>

      <DailyStateStrip initial={initialDailyState} onSave={onSaveDailyState} onClear={onClearDailyState} onChange={setDailyState} />

      <Reflections items={reflections} onAnswer={onAnswerReflection} />

      <section className={styles.section} aria-labelledby="your-day">
        <h2 id="your-day" className={styles.label}>
          Your day
        </h2>
        <ul className={styles.dayList}>
          {slots.map(({ slot, item }) => {
            const slotLabel = SLOT_LABEL[slot] ?? slot;

            if (!item) {
              return (
                <li key={slot}>
                  <button type="button" className={styles.freeRow} onClick={() => openFlow(SLOT_START[slot])}>
                    <span className={styles.time}>{slotLabel}</span>
                    <span className={styles.freeText}>
                      Free
                      <span className={styles.freeHint}>
                        Find something <ChevronRight size={16} aria-hidden="true" />
                      </span>
                    </span>
                  </button>
                </li>
              );
            }

            const status = statuses[item.id] ?? item.status;
            const place = placeLabel(item.location);
            return (
              <li key={item.id} className={`${styles.row} ${status === "skipped" ? styles.skipped : ""}`}>
                <span className={styles.time}>{item.time}</span>
                <div>
                  <h3 className={styles.itemTitle}>{item.title}</h3>
                  <p className={styles.itemMeta}>
                    <span style={{ color: CATEGORY_COLOR[item.category], fontWeight: 600 }}>{item.category}</span>
                    {place ? ` · ${place}` : ""}
                    {item.cost && !isUnknownDetail(item.cost) ? ` · ${item.cost}` : ""}
                  </p>
                  {status === "pending" && (
                    <div className={styles.itemActions}>
                      <Button size="sm" onClick={() => handleAction(item.id, "accepted")}>
                        Accept
                      </Button>
                      <Button size="sm" variant="quiet" onClick={() => handleAction(item.id, "skipped")}>
                        Skip
                      </Button>
                    </div>
                  )}
                  {status === "accepted" && (
                    <p className={styles.status}>
                      <Check size={16} strokeWidth={2.25} aria-hidden="true" /> Going
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className={styles.cta}>
          <Button variant="accent" fullWidth onClick={() => openFlow()}>
            <Hourglass size={18} strokeWidth={1.75} aria-hidden="true" /> I&apos;ve got some time
          </Button>
        </div>

        {sheet && (
          <Sheet label="I've got some time" onClose={() => setSheet(null)}>
            <TimeSheet
              initial={sheet.initial}
              commitment={sheet.commitment}
              suggestedMood={dailyState?.intention ?? null}
              nowMin={sheet.nowMin}
              onClose={() => setSheet(null)}
              {...flowActions}
            />
          </Sheet>
        )}
      </section>

      <section className={styles.section} aria-labelledby="for-you">
        <h2 id="for-you" className={styles.label}>
          For you today
        </h2>
        {featured ? (
          <FeaturedIdea key={featured.id} option={featured} flow={flowActions} />
        ) : (
          // Late in the day, or nothing suitable nearby: say so, rather than leave the page ending in silence.
          <p className={styles.quiet}>
            Nothing more to suggest for today. If you&apos;d like to look again, tap &ldquo;I&apos;ve got some time&rdquo;.
          </p>
        )}
      </section>

      {/* Place data is OpenStreetMap's, under a licence that asks for this credit; photographs carry their own. */}
      <p className={styles.credits}>
        Places from{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          OpenStreetMap contributors
        </a>
        . Photographs from{" "}
        <a href="https://commons.wikimedia.org" target="_blank" rel="noopener noreferrer">
          Wikimedia Commons
        </a>
        .
      </p>
    </div>
  );
}
