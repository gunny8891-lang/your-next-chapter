import { Check } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "@/components/ui/ui.module.css";

type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  selected: boolean;
  children: ReactNode;
};

/** A choice. The selected one is filled and ticked, so it is obvious without relying on colour alone. */
export function Chip({ selected, children, type = "button", ...rest }: ChipProps) {
  return (
    <button {...rest} type={type} aria-pressed={selected} className={styles.chip}>
      {selected && <Check size={16} strokeWidth={2.25} aria-hidden="true" />}
      {children}
    </button>
  );
}
