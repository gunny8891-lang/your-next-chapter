"use client";

import { Banknote, Check, Clock, MapPin, RefreshCw } from "lucide-react";
import { Button, Cover, Sheet } from "@/components/ui";
import { CATEGORY_COLOR } from "@/lib/theme";
import type { ItineraryItemView, SurpriseView } from "@/lib/types";
import styles from "@/components/WeekSheets.module.css";

type Item = ItineraryItemView | NonNullable<SurpriseView>;

/** What the database stores when it does not know: not worth showing as a fact. */
const UNKNOWN = new Set(["Price TBC", "Location TBC"]);

/** One planned thing, opened from the week: what it is, why it was chosen, and what to do about it. */
export function ItemSheet({
  item,
  status,
  onClose,
  onAction,
}: {
  item: Item;
  status: string | null | undefined;
  onClose: () => void;
  onAction: (action: "accepted" | "swapped" | "skipped") => void;
}) {
  const details = [
    { icon: Clock, text: item.time },
    { icon: MapPin, text: item.location },
    { icon: Banknote, text: item.cost },
  ].filter((d) => d.text && !UNKNOWN.has(d.text));

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
          item.bookingUrl ? (
            <div className={styles.actions}>
              <Button href={item.bookingUrl} target="_blank" rel="noopener noreferrer" fullWidth>
                Book this
              </Button>
              <p className={styles.hint}>Opens the provider&apos;s own site.</p>
            </div>
          ) : (
            <p className={styles.hint}>You&apos;re going. There&apos;s no booking link for this one yet.</p>
          )
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
