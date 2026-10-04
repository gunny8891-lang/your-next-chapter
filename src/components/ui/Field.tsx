import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "@/components/ui/ui.module.css";

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name"> & {
  /** Always visible above the box: a placeholder is not a label. */
  label: string;
  name: string;
  /** Help that should be read before typing, e.g. "At least 6 characters". */
  hint?: ReactNode;
  error?: string | null;
};

/**
 * A labelled text box: a 52px-tall input at 17px type (which also stops phones
 * zooming in on focus), with its label, hint and error wired together for
 * screen readers. Works in Server and Client Components alike.
 */
export function Field({ label, name, hint, error, className, ...input }: FieldProps) {
  const id = `field-${name}`;
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className={styles.fieldHint}>
          {hint}
        </p>
      )}
      <input
        {...input}
        id={id}
        name={name}
        className={[styles.input, className ?? ""].filter(Boolean).join(" ")}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
      />
      {error && (
        <p id={`${id}-error`} className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}
