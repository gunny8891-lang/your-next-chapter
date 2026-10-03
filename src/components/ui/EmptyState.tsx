import type { ReactNode } from "react";
import styles from "@/components/ui/ui.module.css";

/** For when there is nothing to show yet: say why in plain language and offer the next step. */
export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon} aria-hidden="true">
        {icon}
      </div>
      <h2 className={styles.emptyTitle}>{title}</h2>
      {children && <p className={styles.emptyText}>{children}</p>}
      {action}
    </div>
  );
}
