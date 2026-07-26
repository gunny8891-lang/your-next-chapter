import { OnboardingFlow } from "@/components/OnboardingFlow";
import { saveOnboardingAction } from "@/app/onboarding/actions";

export default function OnboardingPage() {
  return <OnboardingFlow onDone={saveOnboardingAction} />;
}
