import { Button, SectionTitle } from "@/components/ui";

/** The way into the admin tools, shown only to admins, on the Account page (not in the member's week). */
export function AdminLinks() {
  return (
    <section aria-labelledby="admin" style={{ marginTop: "var(--space-10)" }}>
      <SectionTitle id="admin">For admins</SectionTitle>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <Button href="/admin/activities" variant="secondary">
          Review queue
        </Button>
        <Button href="/admin/ai-costs" variant="secondary">
          Running costs
        </Button>
        <Button href="/admin/members" variant="secondary">
          Members
        </Button>
      </div>
    </section>
  );
}
