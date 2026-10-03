import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import styles from "@/components/ui/ui.module.css";

/** A calm, clear note when something went wrong. Announced to screen readers; never alarming. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className={styles.error}>
      <CircleAlert className={styles.errorIcon} size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
