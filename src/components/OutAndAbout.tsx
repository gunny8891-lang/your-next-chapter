"use client";

import { useState } from "react";
import { CalendarPlus, Navigation, Share2 } from "lucide-react";
import type { ActLinks } from "@/lib/act/links";
import styles from "@/components/OutAndAbout.module.css";

/**
 * Three things people do once they like an outing: find the way, put it in a calendar, tell a friend. Each is only shown
 * when it can really be done (no map link for a place we cannot locate, no calendar file for something not on a day).
 */
export function OutAndAbout({ act }: { act: ActLinks }) {
  const [note, setNote] = useState<string | null>(null);

  const share = async () => {
    setNote(null);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: act.share.title, text: act.share.text });
        return;
      }
    } catch (err) {
      // Closing the share menu without choosing is not a problem: say nothing.
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
    // No share menu on this device (a computer): copy the message so it can be pasted into one.
    try {
      await navigator.clipboard.writeText(act.share.text);
      setNote("Copied. You can paste it into a message.");
    } catch {
      setNote("Sorry, this device would not let us copy it.");
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        {act.directions && (
          <a className={styles.action} href={act.directions} target="_blank" rel="noopener noreferrer">
            <Navigation size={18} strokeWidth={1.75} aria-hidden="true" /> How to get there
          </a>
        )}
        {act.calendar && (
          <a className={styles.action} href={act.calendar} download>
            <CalendarPlus size={18} strokeWidth={1.75} aria-hidden="true" /> Add to my calendar
          </a>
        )}
        <button type="button" className={styles.action} onClick={share}>
          <Share2 size={18} strokeWidth={1.75} aria-hidden="true" /> Send to a friend
        </button>
      </div>
      <p className={styles.note} role="status">
        {note}
      </p>
    </div>
  );
}
