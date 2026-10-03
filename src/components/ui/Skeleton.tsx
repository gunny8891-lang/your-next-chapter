import styles from "@/components/ui/ui.module.css";

/**
 * A placeholder while something loads, shaped like what is coming so the page
 * does not jump. Hidden from screen readers: pair it with a labelled busy region.
 */
export function Skeleton({ height = 16, width = "100%", radius = 8 }: { height?: number | string; width?: number | string; radius?: number }) {
  return <div aria-hidden="true" className={styles.skeleton} style={{ height, width, borderRadius: radius }} />;
}
