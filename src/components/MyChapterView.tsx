"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Archive, Check, ChevronRight, Trash2, Users } from "lucide-react";
import { Button, Card, EmptyState, Field, IconButton, Page, PageHeader, SectionTitle } from "@/components/ui";
import styles from "@/components/MyChapter.module.css";

export type Goal = {
  id: string;
  text: string;
  target_date: string | null;
  status: "active" | "completed" | "archived";
};

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export function MyChapterView({
  goals,
  onAdd,
  onUpdateStatus,
  onDelete,
}: {
  goals: Goal[];
  onAdd: (formData: FormData) => Promise<void>;
  onUpdateStatus: (goalId: string, status: Goal["status"]) => Promise<void>;
  onDelete: (goalId: string) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const active = goals.filter((g) => g.status === "active");
  const setAside = goals.filter((g) => g.status !== "active");

  const handleAdd = () => {
    if (!text.trim()) return;
    const formData = new FormData();
    formData.set("text", text.trim());
    formData.set("target_date", targetDate);
    startTransition(async () => {
      await onAdd(formData);
      setText("");
      setTargetDate("");
    });
  };

  return (
    <Page>
      <PageHeader title="My chapter" lead="The things you'd still love to do. We'll look out for chances to help." />

      <Link href="/people" className={styles.people}>
        <Users size={22} strokeWidth={1.75} aria-hidden="true" />
        <span>The people in your chapter</span>
        <ChevronRight size={20} aria-hidden="true" />
      </Link>

      <section aria-labelledby="add-goal" className={styles.section}>
        <SectionTitle id="add-goal">What would you still love to do?</SectionTitle>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
          }}
        >
          <Field
            label="Something you'd love to do"
            name="goal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Visit Japan, learn Italian, see the Northern Lights"
          />
          <Field
            label="By when? (if you have a date in mind)"
            name="goal_date"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
          <div>
            <Button type="submit" loading={isPending} disabled={!text.trim()}>
              Add to my chapter
            </Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="your-list" className={styles.section}>
        <SectionTitle id="your-list">Your list</SectionTitle>
        {active.length === 0 ? (
          <Card>
            <EmptyState icon={<Check size={24} strokeWidth={1.75} />} title="Nothing here yet">
              Add something above and we&apos;ll keep an eye out for it.
            </EmptyState>
          </Card>
        ) : (
          <ul className={styles.list}>
            {active.map((goal) => (
              <li key={goal.id} className={styles.goal}>
                <div className={styles.goalText}>
                  <p className={styles.goalTitle}>{goal.text}</p>
                  {goal.target_date && <p className={styles.goalDate}>By {dateLabel(goal.target_date)}</p>}
                </div>
                <div className={styles.goalActions}>
                  <IconButton label={`Mark "${goal.text}" as done`} onClick={() => startTransition(() => onUpdateStatus(goal.id, "completed"))}>
                    <Check size={20} strokeWidth={1.75} aria-hidden="true" />
                  </IconButton>
                  <IconButton label={`Set "${goal.text}" aside`} onClick={() => startTransition(() => onUpdateStatus(goal.id, "archived"))}>
                    <Archive size={20} strokeWidth={1.75} aria-hidden="true" />
                  </IconButton>
                  <IconButton label={`Delete "${goal.text}"`} tone="danger" onClick={() => startTransition(() => onDelete(goal.id))}>
                    <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {setAside.length > 0 && (
        <section aria-labelledby="set-aside" className={styles.section}>
          <SectionTitle id="set-aside">Done and set aside</SectionTitle>
          <ul className={styles.list}>
            {setAside.map((goal) => (
              <li key={goal.id} className={`${styles.goal} ${styles.aside}`}>
                <p className={goal.status === "completed" ? styles.doneText : undefined}>
                  {goal.text}
                  {goal.status === "completed" && <span className="sr-only"> (done)</span>}
                </p>
                <IconButton label={`Delete "${goal.text}"`} tone="danger" onClick={() => startTransition(() => onDelete(goal.id))}>
                  <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
                </IconButton>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}
