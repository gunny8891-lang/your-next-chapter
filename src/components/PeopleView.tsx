"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, Users, Heart, Trash2, CalendarCheck } from "lucide-react";
import { T } from "@/lib/theme";

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

const inputStyle = {
  padding: "11px 13px",
  borderRadius: 10,
  border: `1.5px solid ${T.line}`,
  fontSize: 15,
  width: "100%",
  boxSizing: "border-box" as const,
};

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
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <div style={{ background: T.primary, padding: "20px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <Link href="/week" style={{ color: "#EAE3D0", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
            <ChevronLeft size={14} /> Back to This Week
          </Link>
          <h1 style={{ fontFamily: "Georgia, serif", color: "#fff", fontSize: 24, margin: "10px 0 0", display: "flex", alignItems: "center", gap: 10 }}>
            <Users size={22} /> People
          </h1>
          <p style={{ color: "#EAE3D0", fontSize: 13.5, margin: "6px 0 0" }}>
            The people who matter — we&apos;ll look for natural chances to help you see them.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px 60px" }}>
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            style={{ width: "100%", padding: "14px", borderRadius: 12, border: `1.5px dashed ${T.line}`, background: T.surface, color: T.ink, fontSize: 15, fontWeight: 600, cursor: "pointer", marginBottom: 20 }}
          >
            + Add someone
          </button>
        ) : (
          <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: "22px", marginBottom: 20 }}>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: 17, color: T.ink, margin: "0 0 14px" }}>Add someone</h2>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={{ ...inputStyle, marginBottom: 10 }} />
            <input
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              placeholder="Relationship (e.g. Friend, Sister, Neighbour)"
              style={{ ...inputStyle, marginBottom: 10 }}
            />
            <input
              value={sharedInterests}
              onChange={(e) => setSharedInterests(e.target.value)}
              placeholder="Shared interests (comma-separated, e.g. golf, restaurants)"
              style={{ ...inputStyle, marginBottom: 10 }}
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth remembering — recent chats, plans mentioned..."
              style={{ ...inputStyle, minHeight: 70, resize: "vertical" as const, marginBottom: 12 }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: T.ink, marginBottom: 16, cursor: "pointer" }}>
              <input type="checkbox" checked={wantsToSeeMore} onChange={(e) => setWantsToSeeMore(e.target.checked)} />
              I&apos;d like to see them more often
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowForm(false)}
                style={{ flex: 1, padding: "12px", borderRadius: 10, border: `1.5px solid ${T.line}`, background: "none", color: T.ink, fontSize: 14, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={isPending || !name.trim()}
                style={{ flex: 2, padding: "12px", borderRadius: 10, border: "none", background: name.trim() ? T.primary : T.line, color: "#fff", fontSize: 14, fontWeight: 600, cursor: name.trim() ? "pointer" : "default" }}
              >
                Add
              </button>
            </div>
          </div>
        )}

        {people.length === 0 && (
          <p style={{ fontSize: 14, color: T.inkSoft, textAlign: "center", padding: "20px 0" }}>
            No one added yet — start with someone you&apos;d like to see more of.
          </p>
        )}

        {people.map((person) => {
          const gap = daysSince(person.last_seen_date);
          const overdue = person.wants_to_see_more && (gap === null || gap >= RECONNECT_GAP_DAYS);
          return (
            <div key={person.id} style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 14, padding: "18px 20px", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <p style={{ fontFamily: "Georgia, serif", fontSize: 17, color: T.ink, margin: 0, fontWeight: 500 }}>{person.name}</p>
                  {person.relationship && <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "2px 0 0" }}>{person.relationship}</p>}
                </div>
                <button
                  title={person.wants_to_see_more ? "You'd like to see them more often" : "Mark as someone to see more often"}
                  onClick={() => startTransition(() => { void onToggleWantsToSeeMore(person.id, !person.wants_to_see_more); })}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: person.wants_to_see_more ? T.accent : T.line,
                  }}
                >
                  <Heart size={18} fill={person.wants_to_see_more ? T.accent : "none"} />
                </button>
              </div>

              {person.shared_interests.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {person.shared_interests.map((tag) => (
                    <span key={tag} style={{ fontSize: 11.5, padding: "3px 9px", borderRadius: 20, background: T.bg, color: T.inkSoft }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {person.notes && <p style={{ fontSize: 13.5, color: T.ink, margin: "0 0 10px", lineHeight: 1.5 }}>{person.notes}</p>}

              <p style={{ fontSize: 12.5, color: overdue ? T.accent : T.inkSoft, margin: "0 0 12px", fontWeight: overdue ? 600 : 400 }}>
                {lastSeenLabel(person.last_seen_date)}
                {overdue && " — it's been a while, worth reaching out?"}
              </p>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => startTransition(() => { void onMarkSeenToday(person.id); })}
                  style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1.5px solid ${T.line}`, background: "none", color: T.ink, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  <CalendarCheck size={14} /> Saw them today
                </button>
                <button
                  onClick={() => startTransition(() => { void onDelete(person.id); })}
                  style={{ padding: "9px 14px", borderRadius: 8, border: `1.5px solid ${T.line}`, background: "none", color: "#B0562F", cursor: "pointer" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
