import { feedbackHref } from "@/lib/feedback";
import styles from "@/components/FeedbackLink.module.css";

/** A quiet line at the foot of a screen, so that telling us what you think is something you can find. */
export function FeedbackLink({ where }: { where: string }) {
  return (
    <p className={styles.line}>
      Something confusing, or an idea that was a good one?
      <a href={feedbackHref(where)} className={styles.link}>
        Tell us what you think
      </a>
    </p>
  );
}
