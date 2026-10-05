import { LegalPage } from "@/components/LegalPage";
import { privacySections } from "@/lib/legal/privacy";

export const metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy notice"
      lead="What we keep about you, why, who else sees it, and how you stay in control. In plain English."
      sections={privacySections()}
      other={{ href: "/terms", label: "Terms of use" }}
    />
  );
}
