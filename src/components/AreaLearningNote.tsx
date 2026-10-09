import { AREA_LEARNING_MESSAGE } from "@/lib/coverage/nearbyPlaces";
import styles from "@/components/AreaLearningNote.module.css";

/** A quiet, honest line for someone whose area we have only just started to learn. */
export function AreaLearningNote() {
  return <p className={styles.note}>{AREA_LEARNING_MESSAGE}</p>;
}
