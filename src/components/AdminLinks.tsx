import { Button, Page, SectionTitle } from "@/components/ui";

/** The way into the admin tools, shown only to admins, on the Account page (not in the member's week). */
export function AdminLinks() {
  return (
    <Page>
      <SectionTitle>For admins</SectionTitle>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <Button href="/admin/activities" variant="secondary">
          Review queue
        </Button>
        <Button href="/admin/ai-costs" variant="secondary">
          Running costs
        </Button>
      </div>
    </Page>
  );
}
