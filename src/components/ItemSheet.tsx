"use client";

import { useState } from "react";
import { Banknote, CalendarCheck, CalendarPlus, Check, Clock, MapPin, RefreshCw } from "lucide-react";
import { Button, Cover, ErrorNote, Sheet } from "@/components/ui";
import { isUnknownDetail } from "@/lib/itinerary/format";
import { CATEGORY_COLOR } from "@/lib/theme";
import type { ItineraryItemView, SurpriseView } from "@/lib/types";
import styles from "@/components/WeekSheets.module.css";

type Item = ItineraryItemView | NonNullable<SurpriseView>;

/** What the sheet needs to offer "add to my calendar" for a planned item. Absent when the feature is not switched on. */
export type CalendarOffer = {
  connected: boolean;
  added: boolean;
  /** Each returns an error message, or null when it worked. */
  onAdd: () => Promise<string | null>;
  onRemove: () => Promise<string | null>;
};

function CalendarControl({ offer }: { offer: CalendarOffer }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    setError(await action());
    setBusy(false);
  };

  if (!offer.connected) {
    return (
      <div className={styles.actions}>
        <Button href="/account#calendar" variant="secondary" fullWidth>
          <CalendarPlus size={18} aria-hidden="true" /> Connect Google Calendar
        </Button>
        <p className={styles.hint}>So you can add outings to your calendar.</p>
      </div>
    );
  }

  return (
    <div className={styles.actions}>
      {error && <ErrorNote>{error}</ErrorNote>}
      {offer.added ? (
        <>
          <p className={styles.calendarDone}>
            <CalendarCheck size={18} aria-hidden="true" /> On your Google Calendar
          </p>
          <Button variant="quiet" loading={busy} onClick={() => run(offer.onRemove)}>
            Remove from calendar
          </Button>
        </>
      ) : (
        <Button variant="secondary" fullWidth loading={busy} onClick={() => run(offer.onAdd)}>
          <CalendarPlus size={18} aria-hidden="true" /> Add to my calendar
        </Button>
      )}
    </div>
  );
}

/**
 * The choices once someone has said yes and then can't, or doesn't want to, go: the same two
 * ways out they were offered the first time. Kept apart from the button that reveals it so it
 * can be shown (and tested) on its own.
 */
export function ChangeMindOptions({
  onAction,
  onKeep,
  onCalendar,
}: {
  onAction: (action: "swapped" | "skipped") => void;
  onKeep: () => void;
  /** True when this outing is on their Google Calendar, which the change will also clear. */
  onCalendar: boolean;
}) {
  return (
    <div className={`${styles.actions} ync-appear`}>
      <p className={styles.hint}>
        No problem. What would you like to do instead?
        {onCalendar && " It will come off your Google Calendar too."}
      </p>
      <div className={styles.secondary}>
        <Button variant="secondary" onClick={() => onAction("swapped")}>
          <RefreshCw size={16} aria-hidden="true" /> Something else
        </Button>
        <Button variant="quiet" onClick={() => onAction("skipped")}>
          Not this time
        </Button>
        <Button variant="quiet" onClick={onKeep}>
          Keep it
        </Button>
      </div>
    </div>
  );
}

/** A quiet way back from "Going": one tap to reveal the choices, so it cannot happen by accident. */
function ChangeMyMind({ onAction, onCalendar }: { onAction: (action: "swapped" | "skipped") => void; onCalendar: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className={styles.actions}>
        <Button variant="quiet" onClick={() => setOpen(true)}>
          Change my mind
        </Button>
      </div>
    );
  }
  return <ChangeMindOptions onAction={onAction} onKeep={() => setOpen(false)} onCalendar={onCalendar} />;
}

/** One planned thing, opened from the week: what it is, why it was chosen, and what to do about it. */
export function ItemSheet({
  item,
  status,
  calendar,
  onClose,
  onAction,
}: {
  item: Item;
  status: string | null | undefined;
  calendar?: CalendarOffer | null;
  onClose: () => void;
  onAction: (action: "accepted" | "swapped" | "skipped") => void;
}) {
  const details = [
    { icon: Clock, text: item.time },
    { icon: MapPin, text: item.location },
    { icon: Banknote, text: item.cost },
  ].filter((d) => d.text && !isUnknownDetail(d.text));

  return (
    <Sheet label={item.title} onClose={onClose}>
      <div className={styles.body}>
        <Cover category={item.category} ratio="banner" />
        <p className={styles.category} style={{ color: CATEGORY_COLOR[item.category] }}>
          {item.category}
        </p>
        <h2 className={styles.title}>{item.title}</h2>

        <ul className={styles.details}>
          {details.map(({ icon: Icon, text }) => (
            <li key={text}>
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>{text}</span>
            </li>
          ))}
        </ul>

        {(item.why || ("behaviorNote" in item && item.behaviorNote)) && (
          <section className={styles.why}>
            <h3 className={styles.whyTitle}>Why this one</h3>
            {item.why && <p>{item.why}</p>}
            {"behaviorNote" in item && item.behaviorNote && <p className={styles.note}>{item.behaviorNote}</p>}
          </section>
        )}

        {status === "accepted" ? (
          <>
          {item.bookingUrl ? (
            <div className={styles.actions}>
              <Button href={item.bookingUrl} target="_blank" rel="noopener noreferrer" fullWidth>
                Book this
              </Button>
              <p className={styles.hint}>Opens the provider&apos;s own site.</p>
            </div>
          ) : (
            <p className={styles.hint}>You&apos;re going. There&apos;s no booking link for this one yet.</p>
          )}
          {calendar && <CalendarControl offer={calendar} />}
          <ChangeMyMind onAction={onAction} onCalendar={Boolean(calendar?.added)} />
          </>
        ) : (
          <div className={styles.actions}>
            <Button fullWidth onClick={() => onAction("accepted")}>
              <Check size={18} strokeWidth={2.25} aria-hidden="true" /> Yes, I&apos;ll go
            </Button>
            <div className={styles.secondary}>
              <Button variant="secondary" onClick={() => onAction("swapped")}>
                <RefreshCw size={16} aria-hidden="true" /> Something else
              </Button>
              <Button variant="quiet" onClick={() => onAction("skipped")}>
                Not this time
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
