import { Button } from "@/components/ui";
import styles from "@/components/ThisWeek.module.css";

const PARTS_OF_DAY = ["morning", "afternoon", "evening"];

/** "That afternoon is free." for a part of the day; "That time is free." when the outing had a clock time of its own. */
export function freeSlotMessage(time: string): string {
  const part = time.trim().toLowerCase();
  return PARTS_OF_DAY.includes(part) ? `That ${part} is free.` : "That time is free.";
}

/**
 * Under an outing the member has said no to: the slot it held is open again, so say so and
 * offer the alternatives, rather than leaving a greyed card and an empty stretch of the week.
 * It only offers; nothing is put in the slot until the member chooses.
 */
export function SkippedPrompt({ time, onFind }: { time: string; onFind: () => void }) {
  return (
    <div className={styles.freePrompt}>
      <p>{freeSlotMessage(time)}</p>
      <Button variant="secondary" onClick={onFind}>
        Find something else
      </Button>
    </div>
  );
}
