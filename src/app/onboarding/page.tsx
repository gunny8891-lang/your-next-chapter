import { OnboardingFlow } from "@/components/OnboardingFlow";
import { saveOnboardingAction } from "@/app/onboarding/actions";

export const metadata = { title: "Welcome" };

export default function OnboardingPage() {
  return <OnboardingFlow onDone={saveOnboardingAction} />;
}
