import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "@/components/ui/ui.module.css";

type Variant = "primary" | "accent" | "secondary" | "quiet";

type Common = {
  /** primary: the main action. accent: the one warm "do this next". secondary: an alternative. quiet: low-key. */
  variant?: Variant;
  size?: "md" | "sm";
  fullWidth?: boolean;
  /** Shows the label as busy and ignores presses. */
  loading?: boolean;
  children: ReactNode;
};

type AsButton = Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { href?: undefined };
type AsLink = Common & { href: string; target?: string; rel?: string };

export type ButtonProps = AsButton | AsLink;

function classes({ variant = "primary", size = "md", fullWidth }: Common): string {
  return [styles.button, styles[variant], size === "sm" ? styles.small : "", fullWidth ? styles.fullWidth : ""]
    .filter(Boolean)
    .join(" ");
}

/** One button for the whole app. Large by default (48px) so it is easy to hit; renders a link when given an href. */
export function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    const { href, target, rel, children } = props;
    return (
      <Link href={href} target={target} rel={rel} className={classes(props)}>
        {children}
      </Link>
    );
  }

  // Pull out the styling props so only genuine button attributes reach the element.
  const { variant, size, fullWidth, loading, children, type = "button", disabled, ...rest } = props;
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes({ variant, size, fullWidth, children })}
    >
      {children}
    </button>
  );
}
