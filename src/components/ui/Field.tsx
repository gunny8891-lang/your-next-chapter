import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
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

type Shared = { label: string; name: string; hint?: ReactNode; error?: string | null };

function describe(id: string, hint: ReactNode, error?: string | null) {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

function Frame({ id, label, hint, error, children }: Shared & { id: string; children: ReactNode }) {
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
      {children}
      {error && (
        <p id={`${id}-error`} className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}

/** A labelled drop-down, as tall and as clear as a text box. */
export function SelectField({
  label,
  name,
  hint,
  error,
  children,
  ...select
}: Shared & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "name">) {
  const id = `field-${name}`;
  return (
    <Frame id={id} label={label} name={name} hint={hint} error={error}>
      <select {...select} id={id} name={name} className={styles.input} aria-describedby={describe(id, hint, error)} aria-invalid={error ? true : undefined}>
        {children}
      </select>
    </Frame>
  );
}

/** A labelled multi-line box. */
export function TextareaField({
  label,
  name,
  hint,
  error,
  ...area
}: Shared & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "name">) {
  const id = `field-${name}`;
  return (
    <Frame id={id} label={label} name={name} hint={hint} error={error}>
      <textarea
        {...area}
        id={id}
        name={name}
        className={`${styles.input} ${styles.textarea}`}
        aria-describedby={describe(id, hint, error)}
        aria-invalid={error ? true : undefined}
      />
    </Frame>
  );
}

/** One tick-box with its label, on a 48px row so the whole line can be tapped. */
export function CheckboxField({ label, ...input }: { label: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className={styles.check}>
      <input {...input} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}
