"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Gift } from "lucide-react";
import { DAYS } from "@/lib/categories";
import { isUnknownDetail } from "@/lib/itinerary/format";
import { CATEGORY_COLOR } from "@/lib/theme";
import { placeLabel } from "@/lib/someTime/format";
import { Button, Card, EmptyState, Page, PageHeader } from "@/components/ui";
import { ItemSheet, type CalendarOffer } from "@/components/ItemSheet";
import { SwapSheet } from "@/components/SwapSheet";
import { SkippedPrompt } from "@/components/SkippedPrompt";
import { GenerateWeekButton } from "@/components/GenerateWeekButton";
import type { ItineraryItemView, SurpriseView, MemberAction, SwapAlternative } from "@/lib/types";
import styles from "@/components/ThisWeek.module.css";

const isRealItem = (id: string) => !id.startsWith("demo-");

const FULL_DAY: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

export function ThisWeekView({
  locationLabel,
  today,
  items,
  surprise,
  isDemo,
  nextWeekLabel,
  onItemAction,
  onSurpriseAction,
  onGenerate,
  onGetSwapAlternatives,
  onApplySwap,
  calendar,
  onAddToCalendar,
  onRemoveFromCalendar,
}: {
  locationLabel: string;
  /** "Mon".."Sun": today in London, so the week opens on it. */
  today: string;
  items: ItineraryItemView[];
  surprise: SurpriseView;
  isDemo: boolean;
  /** Set (e.g. "Week of Monday 12 October") when the screen is showing next week's plan, on a Sunday evening; null for this week. */
  nextWeekLabel?: string | null;
  onItemAction: (itemId: string, action: "accepted" | "swapped" | "skipped") => Promise<void>;
  onSurpriseAction: (cardId: string, response: "accepted" | "dismissed") => Promise<void>;
  onGenerate: () => Promise<{ error: string | null; usedFallback?: boolean }>;
  onGetSwapAlternatives: (itemId: string) => Promise<{ error: string | null; alternatives: SwapAlternative[] }>;
  onApplySwap: (itemId: string, newActivityId: string) => Promise<{ error: string | null }>;
  /** Null when Google Calendar is not switched on, so nothing about it shows. */
  calendar?: { connected: boolean; onCalendarIds: string[] } | null;
  onAddToCalendar?: (itemId: string) => Promise<{ error: string | null }>;
  onRemoveFromCalendar?: (itemId: string) => Promise<{ error: string | null }>;
}) {
  const itemsByDay = useMemo(() => {
    const map: Record<string, ItineraryItemView[]> = {};
    for (const day of DAYS) map[day] = [];
    for (const item of items) {
      (map[item.day] ??= []).push(item);
    }
    return map;
  }, [items]);

  // The week opens on today, wherever in it that is.
  const [activeDay, setActiveDay] = useState<string>((DAYS as readonly string[]).includes(today) ? today : "Mon");
  const [statuses, setStatuses] = useState<Record<string, MemberAction>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.status]))
  );
  const [surpriseStatus, setSurpriseStatus] = useState<"accepted" | "dismissed" | null>(surprise?.response ?? null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [onCalendar, setOnCalendar] = useState<Set<string>>(() => new Set(calendar?.onCalendarIds ?? []));
  const [swapItemId, setSwapItemId] = useState<string | null>(null);
  const [swapAlternatives, setSwapAlternatives] = useState<SwapAlternative[]>([]);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const openingSurprise = openItemId === "surprise";
  const openItem = openingSurprise ? surprise : (items.find((i) => i.id === openItemId) ?? null);

  // The server takes a changed plan off the calendar; this keeps what the sheet shows in step.
  const dropFromCalendarView = (itemId: string) =>
    setOnCalendar((current) => {
      const next = new Set(current);
      next.delete(itemId);
      return next;
    });

  // Opens the alternatives picker for an item: from "Something else" in its sheet, or from the
  // "find something else" prompt under an outing the member turned down.
  const beginSwap = (itemId: string) => {
    setOpenItemId(null);
    setSwapItemId(itemId);
    setSwapAlternatives([]);
    setSwapError(null);
    setSwapLoading(true);
    startTransition(async () => {
      const result = await onGetSwapAlternatives(itemId);
      setSwapLoading(false);
      if (result.error) setSwapError(result.error);
      else setSwapAlternatives(result.alternatives);
    });
  };

  const handleAction = (action: "accepted" | "swapped" | "skipped") => {
    if (openingSurprise && surprise) {
      const response = action === "accepted" ? "accepted" : "dismissed";
      setSurpriseStatus(response);
      startTransition(() => {
        onSurpriseAction(surprise.id, response);
      });
      setOpenItemId(null);
      return;
    }

    if (openItem && action === "swapped" && isRealItem(openItem.id)) {
      // Real items get an alternatives picker instead of an immediate swap.
      beginSwap(openItem.id);
      return;
    }

    if (openItem) {
      setStatuses((s) => ({ ...s, [openItem.id]: action }));
      if (action !== "accepted") dropFromCalendarView(openItem.id);
      startTransition(() => {
        onItemAction(openItem.id, action);
      });
    }
    setOpenItemId(null);
  };

  const handleChooseAlternative = (alt: SwapAlternative) => {
    if (!swapItemId) return;
    setStatuses((s) => ({ ...s, [swapItemId]: "pending" }));
    dropFromCalendarView(swapItemId);
    startTransition(() => {
      onApplySwap(swapItemId, alt.id);
    });
    setSwapItemId(null);
  };

  // Offered only for a real, planned item, and only when the feature is switched on.
  const calendarOfferFor = (itemId: string): CalendarOffer | null => {
    if (!calendar || !onAddToCalendar || !onRemoveFromCalendar || openingSurprise || !isRealItem(itemId)) return null;
    const change = (on: boolean) => setOnCalendar((current) => {
      const next = new Set(current);
      if (on) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
    return {
      connected: calendar.connected,
      added: onCalendar.has(itemId),
      onAdd: async () => {
        const result = await onAddToCalendar(itemId);
        if (!result.error) change(true);
        return result.error;
      },
      onRemove: async () => {
        const result = await onRemoveFromCalendar(itemId);
        if (!result.error) change(false);
        return result.error;
      },
    };
  };

  const dayItems = itemsByDay[activeDay] ?? [];
  const dayName = FULL_DAY[activeDay] ?? activeDay;
  // A day that has already gone is not "free so far": nothing was planned for it. (Not shown when looking at next week, where `today` is empty.)
  const dayHasPassed = (DAYS as readonly string[]).indexOf(today) > 0 && (DAYS as readonly string[]).indexOf(activeDay) < (DAYS as readonly string[]).indexOf(today);

  return (
    <Page>
      <PageHeader
        title={nextWeekLabel ? "Next week" : "My week"}
        lead={isDemo ? "An example of how a week can look." : nextWeekLabel ? `${nextWeekLabel} · around ${locationLabel}` : `Around ${locationLabel}`}
      />

      {isDemo && (
        <Card className={styles.demo}>
          <p>This is only an example. Plan your own and it will be chosen around you.</p>
          <GenerateWeekButton onGenerate={onGenerate} />
        </Card>
      )}

      <div className={styles.days} role="group" aria-label="Day of the week">
        {DAYS.map((d) => {
          const dItems = itemsByDay[d] ?? [];
          const isToday = d === today;
          return (
            <button
              key={d}
              type="button"
              className={styles.day}
              aria-pressed={activeDay === d}
              aria-label={`${FULL_DAY[d]}${isToday ? ", today" : ""}, ${dItems.length === 0 ? "nothing planned" : `${dItems.length} planned`}`}
              onClick={() => setActiveDay(d)}
            >
              <span className={styles.dayName}>{d}</span>
              <span className={styles.dots} aria-hidden="true">
                {dItems.slice(0, 3).map((item) => {
                  const color = CATEGORY_COLOR[item.category] ?? CATEGORY_COLOR.Joy;
                  const skipped = statuses[item.id] === "skipped";
                  return (
                    <span
                      key={item.id}
                      className={styles.dot}
                      style={skipped ? { border: `1.5px solid ${color}` } : { background: color }}
                    />
                  );
                })}
              </span>
              {isToday && <span className={styles.todayMark}>Today</span>}
            </button>
          );
        })}
      </div>

      <section aria-labelledby="week-day" className={styles.dayPanel}>
        <h2 id="week-day" className={styles.dayTitle}>
          {dayName}
          {activeDay === today && <span className={styles.dayTitleNote}> · today</span>}
        </h2>

        {dayItems.length === 0 ? (
          <EmptyState
            icon={<Check size={24} strokeWidth={1.75} />}
            title="Nothing planned"
            action={
              activeDay === today ? (
                <Button href="/today" variant="secondary">
                  Find something for today
                </Button>
              ) : undefined
            }
          >
            {activeDay === today ? "A free day. Perhaps there's something you'd enjoy." : dayHasPassed ? `Nothing was planned for ${dayName}.` : `${dayName} is free so far.`}
          </EmptyState>
        ) : (
          <ul className={styles.list}>
            {dayItems.map((item) => {
              const status = statuses[item.id];
              const place = placeLabel(item.location);
              const meta = [place, isUnknownDetail(item.cost) ? null : item.cost].filter(Boolean).join(" · ");
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`${styles.item} ${status === "skipped" ? styles.skipped : ""}`}
                    onClick={() => setOpenItemId(item.id)}
                  >
                    <span className={styles.time}>{item.time}</span>
                    <span className={styles.itemBody}>
                      <span className={styles.itemTitle}>{item.title}</span>
                      <span className={styles.itemMeta}>
                        <span style={{ color: CATEGORY_COLOR[item.category], fontWeight: 600 }}>{item.category}</span>
                        {meta ? ` · ${meta}` : ""}
                      </span>
                      {status === "accepted" && (
                        <span className={styles.going}>
                          <Check size={16} strokeWidth={2.25} aria-hidden="true" /> Going
                        </span>
                      )}
                      {status === "skipped" && <span className={styles.skippedNote}>Not this time</span>}
                      {item.behaviorNote && <span className={styles.note}>{item.behaviorNote}</span>}
                    </span>
                  </button>
                  {status === "skipped" && isRealItem(item.id) && <SkippedPrompt time={item.time} onFind={() => beginSwap(item.id)} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {surprise && (
        <button
          type="button"
          className={`${styles.treat} ${surpriseStatus === "dismissed" ? styles.skipped : ""}`}
          onClick={() => setOpenItemId("surprise")}
        >
          <span className={styles.treatLabel}>
            <Gift size={16} strokeWidth={1.75} aria-hidden="true" /> A little extra this week
          </span>
          <span className={styles.itemTitle}>{surprise.title}</span>
          <span className={styles.itemMeta}>
            {[placeLabel(surprise.location), isUnknownDetail(surprise.cost) ? null : surprise.cost].filter(Boolean).join(" · ")}
          </span>
          {surpriseStatus === "accepted" && (
            <span className={styles.going}>
              <Check size={16} strokeWidth={2.25} aria-hidden="true" /> Going
            </span>
          )}
        </button>
      )}

      {openItem && (
        <ItemSheet
          item={openItem}
          status={openingSurprise ? surpriseStatus : statuses[openItem.id]}
          calendar={calendarOfferFor(openItem.id)}
          onClose={() => setOpenItemId(null)}
          onAction={handleAction}
        />
      )}

      {swapItemId && (
        <SwapSheet
          isLoading={swapLoading}
          alternatives={swapAlternatives}
          error={swapError}
          onChoose={handleChooseAlternative}
          onClose={() => setSwapItemId(null)}
        />
      )}
    </Page>
  );
}
