"use client";

import { useState, useTransition } from "react";
import { CalendarHeart, Trash2 } from "lucide-react";
import { Button, Card, EmptyState, ErrorNote, Field, IconButton, SectionTitle, SelectField } from "@/components/ui";
import { DATE_KINDS, dateLabel, inOrder, type DateKind, type ImportantDate } from "@/lib/dates/importantDates";
import styles from "@/components/MyChapter.module.css";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Dates to remember: birthdays, anniversaries, a day to remember. Added in a few plain boxes (a name, what it is, the day and the
 * month, and the year only if they like), listed with the next to come first and how far away it is. Today shows the ones
 * coming up. Nothing here is shared with anyone.
 */
export function ImportantDates({
  dates,
  today,
  onAdd,
  onDelete,
}: {
  dates: ImportantDate[];
  /** Today in London, so "in 5 days" is counted from the right day. */
  today: string;
  onAdd: (input: { title: string; kind: DateKind; month: number; day: number; year: string }) => Promise<{ error: string | null }>;
  onDelete: (id: string) => Promise<{ error: string | null }>;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<DateKind>("birthday");
  const [month, setMonth] = useState("1");
  const [day, setDay] = useState("");
  const [year, setYear] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ordered = inOrder(dates, today);

  const add = () => {
    setError(null);
    startTransition(async () => {
      const res = await onAdd({ title, kind, month: Number(month), day: Number(day), year });
      if (res.error) {
        setError(res.error);
        return;
      }
      setTitle("");
      setDay("");
      setYear("");
    });
  };

  const remove = (id: string) => {
    setError(null);
    startTransition(async () => {
      const res = await onDelete(id);
      if (res.error) setError(res.error);
    });
  };

  return (
    <section aria-labelledby="dates" className={styles.section}>
      <SectionTitle id="dates">Dates to remember</SectionTitle>
      <p className={styles.aside}>Birthdays, anniversaries, a day you want to keep in mind. We&apos;ll show them on Today as they come up. Only you can see them.</p>

      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Field label="Whose, or what" name="date_title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Margaret's birthday, our anniversary" />
        <SelectField label="What kind of day" name="date_kind" value={kind} onChange={(e) => setKind(e.target.value as DateKind)}>
          {DATE_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </SelectField>
        <SelectField label="Month" name="date_month" value={month} onChange={(e) => setMonth(e.target.value)}>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </SelectField>
        <Field label="Day of the month" name="date_day" type="number" inputMode="numeric" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} placeholder="e.g. 14" />
        <Field
          label="Year (only if you like)"
          name="date_year"
          type="number"
          inputMode="numeric"
          min={1900}
          value={year}
          onChange={(e) => setYear(e.target.value)}
          hint="So we can say &ldquo;turning 70&rdquo; or &ldquo;40th anniversary&rdquo;. Leave it blank if you would rather not."
        />
        {error && <ErrorNote>{error}</ErrorNote>}
        <div>
          <Button type="submit" loading={isPending} disabled={!title.trim() || !day}>
            Remember this date
          </Button>
        </div>
      </form>

      {ordered.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarHeart size={24} strokeWidth={1.75} />} title="No dates yet">
            Add one above and it will appear on Today when it is coming up.
          </EmptyState>
        </Card>
      ) : (
        <ul className={styles.list}>
          {ordered.map((d) => (
            <li key={d.id} className={styles.goal}>
              <div className={styles.goalText}>
                <p className={styles.goalTitle}>{d.title}</p>
                <p className={styles.goalDate}>
                  {dateLabel(d)} · {d.when}
                  {d.note ? ` · ${d.note}` : ""}
                </p>
              </div>
              <div className={styles.goalActions}>
                <IconButton label={`Remove "${d.title}"`} tone="danger" onClick={() => remove(d.id)}>
                  <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
