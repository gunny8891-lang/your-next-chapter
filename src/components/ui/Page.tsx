import type { ReactNode } from "react";
import styles from "@/components/ui/ui.module.css";

/** The column every member screen sits in: calm width, generous side and top space. */
export function Page({ children }: { children: ReactNode }) {
  return <div className={styles.page}>{children}</div>;
}

/**
 * A screen's heading: plain text on the page in the display face, with one
 * line beneath it. Not a coloured band: the page opens quietly.
 */
export function PageHeader({ title, lead }: { title: string; lead?: ReactNode }) {
  return (
    <header className={styles.pageHeader}>
      <h1 className={styles.pageTitle}>{title}</h1>
      {lead && <p className={styles.pageLead}>{lead}</p>}
    </header>
  );
}

/** A small sentence-case section heading inside a screen. */
export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className={styles.sectionTitle}>
      {children}
    </h2>
  );
}
