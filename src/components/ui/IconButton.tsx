import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "@/components/ui/ui.module.css";

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  /** Required: an icon alone says nothing to a screen reader. */
  label: string;
  /** "danger" turns red on hover, for deleting. */
  tone?: "default" | "danger";
  children: ReactNode;
};

/** A 44px round button for one icon. Pass `aria-pressed` for a toggle (a heart that fills when on). */
export function IconButton({ label, tone = "default", children, type = "button", className, ...rest }: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={label}
      className={[styles.iconButton, tone === "danger" ? styles.iconDanger : "", className ?? ""].filter(Boolean).join(" ")}
    >
      {children}
    </button>
  );
}
