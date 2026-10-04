"use client";

import { useState, useTransition } from "react";
import { CalendarCheck, Heart, Trash2, Users } from "lucide-react";
import { Button, Card, CheckboxField, EmptyState, Field, IconButton, Page, PageHeader, TextareaField } from "@/components/ui";
import styles from "@/components/People.module.css";

export type Person = {
  id: string;
  name: string;
  relationship: string | null;
  shared_interests: string[];
  notes: string | null;
  wants_to_see_more: boolean;
  last_seen_date: string | null;
};

const RECONNECT_GAP_DAYS = 21;

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function lastSeenLabel(dateStr: string | null): string {
  if (!dateStr) return "Not recorded yet";
  return `Last seen ${new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
}

export function PeopleView({
  people,
  onAdd,
  onMarkSeenToday,
  onToggleWantsToSeeMore,
  onDelete,
}: {
  people: Person[];
  onAdd: (formData: FormData) => Promise<void>;
  onMarkSeenToday: (personId: string) => Promise<void>;
  onToggleWantsToSeeMore: (personId: string, value: boolean) => Promise<void>;
  onDelete: (personId: string) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [sharedInterests, setSharedInterests] = useState("");
  const [notes, setNotes] = useState("");
  const [wantsToSeeMore, setWantsToSeeMore] = useState(true);
  // Removing someone asks first: it cannot be undone.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleAdd = () => {
    if (!name.trim()) return;
    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("relationship", relationship);
    formData.set("shared_interests", sharedInterests);
    formData.set("notes", notes);
    if (wantsToSeeMore) formData.set("wants_to_see_more", "on");
    startTransition(async () => {
      await onAdd(formData);
      setName("");
      setRelationship("");
      setSharedInterests("");
      setNotes("");
      setWantsToSeeMore(true);
      setShowForm(false);
    });
  };

  return (
    <Page>
      <PageHeader title="People" lead="The people who matter. We'll look for natural chances to help you see them." />

      {!showForm ? (
        <Button variant="secondary" fullWidth onClick={() => setShowForm(true)}>
          Add someone
        </Button>
      ) : (
        <Card padding="lg" className="ync-appear">
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              handleAdd();
            }}
          >
            <h2 className={styles.formTitle}>Add someone</h2>
            <Field label="Name" name="person_name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required />
            <Field
              label="How you know them"
              name="person_relationship"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              placeholder="e.g. Friend, Sister, Neighbour"
            />
            <Field
              label="What you enjoy together"
              name="person_interests"
              value={sharedInterests}
              onChange={(e) => setSharedInterests(e.target.value)}
              hint="Separate with commas, like golf, restaurants"
            />
            <TextareaField
              label="Anything worth remembering"
              name="person_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Recent chats, plans they mentioned…"
            />
            <CheckboxField label="I'd like to see them more often" checked={wantsToSeeMore} onChange={(e) => setWantsToSeeMore(e.target.checked)} />
            <div className={styles.formButtons}>
              <Button type="submit" loading={isPending} disabled={!name.trim()}>
                Add
              </Button>
              <Button variant="quiet" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {people.length === 0 ? (
        <Card className={styles.empty}>
          <EmptyState icon={<Users size={24} strokeWidth={1.75} />} title="No one added yet">
            Start with someone you&apos;d like to see more of.
          </EmptyState>
        </Card>
      ) : (
        <ul className={styles.list}>
          {people.map((person) => {
            const gap = daysSince(person.last_seen_date);
            const overdue = person.wants_to_see_more && (gap === null || gap >= RECONNECT_GAP_DAYS);
            return (
              <li key={person.id}>
                <Card className={styles.person}>
                  <div className={styles.top}>
                    <div>
                      <h2 className={styles.name}>{person.name}</h2>
                      {person.relationship && <p className={styles.relationship}>{person.relationship}</p>}
                    </div>
                    <IconButton
                      label={person.wants_to_see_more ? `You'd like to see ${person.name} more often (tap to change)` : `Mark ${person.name} as someone to see more often`}
                      aria-pressed={person.wants_to_see_more}
                      onClick={() => startTransition(() => { void onToggleWantsToSeeMore(person.id, !person.wants_to_see_more); })}
                    >
                      <Heart size={22} strokeWidth={1.75} fill={person.wants_to_see_more ? "currentColor" : "none"} aria-hidden="true" />
                    </IconButton>
                  </div>

                  {person.shared_interests.length > 0 && (
                    <ul className={styles.tags} aria-label="What you enjoy together">
                      {person.shared_interests.map((tag) => (
                        <li key={tag}>{tag}</li>
                      ))}
                    </ul>
                  )}

                  {person.notes && <p className={styles.notes}>{person.notes}</p>}

                  <p className={overdue ? styles.overdue : styles.seen}>
                    {lastSeenLabel(person.last_seen_date)}
                    {overdue && ". It's been a while, so it might be worth getting in touch."}
                  </p>

                  {confirmingId === person.id ? (
                    <div className={styles.actions} role="group" aria-label={`Remove ${person.name}?`}>
                      <p className={styles.confirm}>Remove {person.name}?</p>
                      <Button size="sm" onClick={() => startTransition(() => { void onDelete(person.id); })}>
                        Yes, remove
                      </Button>
                      <Button size="sm" variant="quiet" onClick={() => setConfirmingId(null)}>
                        Keep
                      </Button>
                    </div>
                  ) : (
                    <div className={styles.actions}>
                      <Button size="sm" variant="secondary" onClick={() => startTransition(() => { void onMarkSeenToday(person.id); })}>
                        <CalendarCheck size={18} aria-hidden="true" /> Saw them today
                      </Button>
                      <IconButton label={`Remove ${person.name}`} tone="danger" onClick={() => setConfirmingId(person.id)}>
                        <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
                      </IconButton>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
