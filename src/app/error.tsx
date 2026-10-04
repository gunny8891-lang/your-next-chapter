"use client";

import { useEffect } from "react";
import { Button, Page } from "@/components/ui";
import { MainLandmark } from "@/components/MainLandmark";

/**
 * What a member sees when something breaks while a screen is being built. It says
 * plainly that it is not their doing, offers to try again, and gives a reference
 * (the error's digest) that can be matched to the server's logs if they get in touch.
 */
export default function Error({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <MainLandmark>
      <Page>
        <h1 style={{ fontSize: 34, lineHeight: 1.12 }}>Something didn&apos;t go to plan</h1>
        <p style={{ marginTop: "var(--space-3)", color: "var(--color-ink-soft)", maxWidth: "36ch" }}>
          That&apos;s on our side, not yours. Please try again, and if it keeps happening, come back in a little while.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginTop: "var(--space-6)" }}>
          <Button onClick={() => unstable_retry()}>Try again</Button>
          <Button href="/today" variant="secondary">
            Go to today
          </Button>
        </div>
        {error.digest && (
          <p style={{ marginTop: "var(--space-8)", fontSize: "var(--text-small)", color: "var(--color-ink-soft)" }}>Reference: {error.digest}</p>
        )}
      </Page>
    </MainLandmark>
  );
}
