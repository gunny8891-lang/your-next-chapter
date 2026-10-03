"use client";

import { useRef, useState } from "react";
import { Check, ChevronRight, Coffee, Hourglass } from "lucide-react";
import { CATEGORY_COLOR } from "@/lib/theme";
import { Button, Card, Cover, WeatherLine } from "@/components/ui";
import { SomeTimeFlow, type SomeTimeInitial } from "@/components/SomeTimeFlow";
import { doorToDoorMinutes, friendlyDuration, placeLabel, priceBand } from "@/lib/someTime/format";
import type { ItineraryItemView } from "@/lib/types";
import type { TodayWeather } from "@/lib/nudges/weather";
import type { TimeOption } from "@/lib/someTime/types";
import styles from "@/components/Today.module.css";

export type TodaySlot = { slot: string; item: ItineraryItemView | null };

const SLOT_LABEL: Record<string, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

/** Where "I've got some time" starts when it is opened from a free part of the day. */
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

const SETTING_LABEL = { outdoors: "Mostly outdoors", indoors: "Indoors" } as const;

/** The best idea for the rest of the day: a cover, a title, the essentials, why, and one action. */
function FeaturedIdea({ option, flow }: { option: TimeOption; flow: FlowActions }) {
  const [state, setState] = useState<"idle" | "planning" | "planned" | "hidden">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "hidden") return null;

  const total = doorToDoorMinutes(option.leaveBy, option.homeBy);
  const meta = [
    placeLabel(option.address),
    total ? friendlyDuration(total) : null,
    priceBand(option.priceEstimate),
    option.setting ? SETTING_LABEL[option.setting] : null,
  ].filter((m): m is string => Boolean(m));

  const plan = async () => {
    setError(null);
    setState("planning");
    // The same window the idea was chosen for, so it lands in the right part of the day.
    const result = await flow.onAccept(option.id, { start: "now", duration: "half_day" }, option.foodStop?.id);
    if (result.error) {
      setError(result.error);
      setState("idle");
    } else {
      setState("planned");
    }
  };

  const dismiss = () => {
    void flow.onFeedback(option.id, "not_my_thing");
    setState("hidden");
  };

  return (
    <Card padding="none" className="ync-appear">
      <Cover category={option.category} />
      <div className={styles.heroBody}>
        <h3 className={styles.heroTitle}>{option.title}</h3>
        {meta.length > 0 && <p className={styles.heroMeta}>{meta.join(" · ")}</p>}
        <p className={styles.heroReason}>{option.reason || option.why}</p>
        {option.foodStop && (
          <p className={styles.heroThen}>
            <Coffee size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>
              Then {option.foodStop.meal} at {option.foodStop.title}, {option.foodStop.walkMinutes} min walk
            </span>
          </p>
        )}

        <div className={styles.heroActions} aria-live="polite">
          {state === "planned" ? (
            <p className={styles.planned}>
              <Check size={18} strokeWidth={2.25} aria-hidden="true" /> Added to your day
            </p>
          ) : (
            <>
              <Button variant="primary" loading={state === "planning"} onClick={plan}>
                {state === "planning" ? "Planning…" : "Plan this"}
                {state !== "planning" && <ChevronRight size={18} aria-hidden="true" />}
              </Button>
              <Button variant="quiet" size="sm" onClick={dismiss} disabled={state === "planning"}>
                Not for me
              </Button>
            </>
          )}
        </div>
        {error && <p style={{ marginTop: 12, fontSize: 15, color: "var(--color-error)" }}>{error}</p>}
      </div>
    </Card>
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
}) {
  const [statuses, setStatuses] = useState<Record<string, string>>(() =>
    Object.fromEntries(slots.filter((s) => s.item).map((s) => [s.item!.id, s.item!.status]))
  );
  // Which "I've got some time" flow is open, and where it should start.
  const [flow, setFlow] = useState<{ initial?: SomeTimeInitial; key: number } | null>(null);
  const flowRef = useRef<HTMLDivElement>(null);

  const flowActions: FlowActions = { onFind: onFindTime, onAccept: onAcceptTime, onFeedback: onFeedbackTime };

  const openFlow = (initial?: SomeTimeInitial) => {
    setFlow((prev) => ({ initial, key: (prev?.key ?? 0) + 1 }));
    // Bring it into view, gently — and not at all for anyone who prefers less motion.
    requestAnimationFrame(() => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      flowRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
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
                    {item.cost && item.cost !== "Price TBC" ? ` · ${item.cost}` : ""}
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

        {flow && (
          <div ref={flowRef} className={`${styles.flow} ync-appear`}>
            <Card padding="lg">
              <SomeTimeFlow key={flow.key} initial={flow.initial} {...flowActions} />
              <div className={styles.flowClose}>
                <Button variant="quiet" size="sm" onClick={() => setFlow(null)}>
                  Close
                </Button>
              </div>
            </Card>
          </div>
        )}
      </section>

      {featured && (
        <section className={styles.section} aria-labelledby="for-you">
          <h2 id="for-you" className={styles.label}>
            For you today
          </h2>
          <FeaturedIdea option={featured} flow={flowActions} />
        </section>
      )}
    </div>
  );
}
