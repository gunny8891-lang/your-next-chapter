"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorNote } from "@/components/ui";

export function GenerateWeekButton({
  onGenerate,
}: {
  onGenerate: () => Promise<{ error: string | null; usedFallback?: boolean; itemCount?: number }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await onGenerate();
      if (result.error) {
        setError(`We couldn't plan your week just now: ${result.error}`);
        return;
      }
      if (!result.itemCount) {
        setNote("We don't have anything near you yet. We're looking now, so check back soon.");
      } else if (result.usedFallback) {
        setNote("Your week is planned from our usual favourites this time.");
      }
      // The plan just written on the server isn't in this page's props until it re-renders.
      router.refresh();
    });
  };

  return (
    <div aria-live="polite">
      <Button variant="accent" onClick={handleClick} loading={isPending}>
        {isPending ? "Planning your week…" : "Plan my week"}
      </Button>
      {error && <ErrorNote>{error}</ErrorNote>}
      {note && <p style={{ marginTop: "var(--space-3)", fontSize: "var(--text-small)", color: "var(--color-ink-soft)" }}>{note}</p>}
    </div>
  );
}
