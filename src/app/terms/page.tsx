import { LegalPage } from "@/components/LegalPage";
import { termsSections } from "@/lib/legal/terms";

export const metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      lead="The few things we ask of you, and the few things we promise. In plain English."
      sections={termsSections()}
      other={{ href: "/privacy", label: "Privacy notice" }}
    />
  );
}
