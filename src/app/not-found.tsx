import { Button, Page } from "@/components/ui";
import { MainLandmark } from "@/components/MainLandmark";

export default function NotFound() {
  return (
    <MainLandmark>
      <Page>
        <h1 style={{ fontSize: 34, lineHeight: 1.12 }}>We couldn&apos;t find that page</h1>
        <p style={{ marginTop: "var(--space-3)", color: "var(--color-ink-soft)", maxWidth: "36ch" }}>
          It may have moved, or the link may be a little out of date.
        </p>
        <div style={{ marginTop: "var(--space-6)" }}>
          <Button href="/today">Go to today</Button>
        </div>
      </Page>
    </MainLandmark>
  );
}
