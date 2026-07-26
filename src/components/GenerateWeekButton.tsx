"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { T } from "@/lib/theme";

export function GenerateWeekButton({
  onGenerate,
}: {
  onGenerate: () => Promise<{ error: string | null; usedFallback?: boolean }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const handleClick = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await onGenerate();
      if (result.error) {
        setMessage(`Couldn't generate your week: ${result.error}`);
      } else if (result.usedFallback) {
        setMessage("Generated using our backup picks — the AI response needed a fallback this time.");
      }
    });
  };

  return (
    <div style={{ marginTop: 14 }}>
      <button
        onClick={handleClick}
        disabled={isPending}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 18px",
          borderRadius: 10,
          border: "none",
          background: T.accent,
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: isPending ? "default" : "pointer",
          opacity: isPending ? 0.7 : 1,
        }}
      >
        <Sparkles size={14} />
        {isPending ? "Building your week…" : "Generate my real week"}
      </button>
      {message && <p style={{ color: "#EAE3D0", fontSize: 12.5, marginTop: 8 }}>{message}</p>}
    </div>
  );
}
