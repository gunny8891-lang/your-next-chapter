import type { ElementType, ReactNode } from "react";
import styles from "@/components/ui/ui.module.css";

type CardProps = {
  as?: ElementType;
  /** "none" is for cards whose first child is an edge-to-edge photograph. */
  padding?: "none" | "sm" | "md" | "lg";
  interactive?: boolean;
  className?: string;
  children: ReactNode;
};

const PADDING = { none: styles.padNone, sm: styles.padSm, md: styles.padMd, lg: styles.padLg } as const;

/**
 * A surface: warm white, a fine border, almost no shadow. Use one level only —
 * a card never goes inside another card; group things with spacing instead.
 */
export function Card({ as: Tag = "div", padding = "md", interactive, className, children }: CardProps) {
  const cls = [styles.card, PADDING[padding], interactive ? styles.interactive : "", className ?? ""].filter(Boolean).join(" ");
  return <Tag className={cls}>{children}</Tag>;
}
