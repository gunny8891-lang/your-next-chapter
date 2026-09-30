"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, Compass, Check, Archive, Trash2 } from "lucide-react";
import { T } from "@/lib/theme";

export type Goal = {
  id: string;
  text: string;
  target_date: string | null;
  status: "active" | "completed" | "archived";
};

const inputStyle = {
  padding: "11px 13px",
  borderRadius: 10,
  border: `1.5px solid ${T.line}`,
  fontSize: 15,
  width: "100%",
  boxSizing: "border-box" as const,
};

function iconButton(color: string) {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 8,
    border: `1.5px solid ${T.line}`,
    background: "none",
    color,
    cursor: "pointer",
  };
}

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
  const completed = goals.filter((g) => g.status !== "active");

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
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <div style={{ background: T.primary, padding: "20px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <Link href="/week" style={{ color: "#EAE3D0", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
            <ChevronLeft size={14} /> Back to This Week
          </Link>
          <h1 style={{ fontFamily: "Georgia, serif", color: "#fff", fontSize: 24, margin: "10px 0 0", display: "flex", alignItems: "center", gap: 10 }}>
            <Compass size={22} /> My Chapter
          </h1>
          <p style={{ color: "#EAE3D0", fontSize: 13.5, margin: "6px 0 0" }}>
            The things you&apos;d still love to do — we&apos;ll look out for chances to help.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px 60px" }}>
        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: "22px", marginBottom: 20 }}>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 17, color: T.ink, margin: "0 0 14px" }}>
            What would you still love to do?
          </h2>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="e.g. Visit Japan, learn Italian, see the Northern Lights"
            style={{ ...inputStyle, marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={handleAdd}
              disabled={isPending || !text.trim()}
              style={{
                padding: "0 20px",
                borderRadius: 10,
                border: "none",
                background: text.trim() ? T.primary : T.line,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: text.trim() ? "pointer" : "default",
              }}
            >
              Add
            </button>
          </div>
        </div>

        {active.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            {active.map((goal) => (
              <div
                key={goal.id}
                style={{
                  background: T.surface,
                  border: `1px solid ${T.line}`,
                  borderRadius: 14,
                  padding: "16px 18px",
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <p style={{ fontSize: 15.5, color: T.ink, margin: 0, fontWeight: 500 }}>{goal.text}</p>
                  {goal.target_date && (
                    <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "4px 0 0" }}>
                      By {new Date(goal.target_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    title="Mark as done"
                    onClick={() => startTransition(() => onUpdateStatus(goal.id, "completed"))}
                    style={iconButton(T.primary)}
                  >
                    <Check size={15} />
                  </button>
                  <button
                    title="Archive"
                    onClick={() => startTransition(() => onUpdateStatus(goal.id, "archived"))}
                    style={iconButton(T.inkSoft)}
                  >
                    <Archive size={14} />
                  </button>
                  <button
                    title="Delete"
                    onClick={() => startTransition(() => onDelete(goal.id))}
                    style={iconButton("#B0562F")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {active.length === 0 && (
          <p style={{ fontSize: 14, color: T.inkSoft, textAlign: "center", padding: "20px 0" }}>
            Nothing here yet — add something above and we&apos;ll keep an eye out for it.
          </p>
        )}

        {completed.length > 0 && (
          <div>
            <h3 style={{ fontFamily: "Georgia, serif", fontSize: 15, color: T.inkSoft, margin: "0 0 10px" }}>
              Done and set aside
            </h3>
            {completed.map((goal) => (
              <div
                key={goal.id}
                style={{
                  fontSize: 14,
                  color: T.inkSoft,
                  padding: "10px 14px",
                  borderBottom: `1px solid ${T.line}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  textDecoration: goal.status === "completed" ? "line-through" : "none",
                }}
              >
                {goal.text}
                <button onClick={() => startTransition(() => onDelete(goal.id))} style={{ ...iconButton("#B0562F"), border: "none" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
