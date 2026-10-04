import { CircleCheck, Info } from "lucide-react";
import type { ReactNode } from "react";
import styles from "@/components/ui/ui.module.css";

/** A calm note about something that went well ("success") or that needs a little care ("info"). Announced politely. */
export function Notice({ tone = "success", children }: { tone?: "success" | "info"; children: ReactNode }) {
  const Icon = tone === "success" ? CircleCheck : Info;
  return (
    <div role="status" className={`${styles.notice} ${tone === "success" ? styles.noticeSuccess : styles.noticeInfo}`}>
      <Icon className={styles.noticeIcon} size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
