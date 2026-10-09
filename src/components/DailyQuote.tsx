"use client";

import { attribution, type DailyQuote as Quote } from "@/lib/quotes/daily";
import { setDailyQuoteVisible, useDailyQuoteVisible } from "@/lib/quotes/visibility";
import styles from "@/components/DailyQuote.module.css";

/**
 * One line of company for the day, from a real work by a writer people know. Quiet on purpose: it sits under the date,
 * it is never a pop-up, and anyone can turn it off here or in Account.
 */
export function DailyQuote({ quote }: { quote: Quote }) {
  const visible = useDailyQuoteVisible();
  if (!visible) return null;

  return (
    <figure className={styles.quote} aria-label="Today's quotation">
      <blockquote className={styles.text}>{quote.text}</blockquote>
      <figcaption className={styles.credit}>
        {attribution(quote)}
        <button type="button" className={styles.hide} onClick={() => setDailyQuoteVisible(false)} aria-label="Hide the daily quotation">
          Hide
        </button>
      </figcaption>
    </figure>
  );
}
