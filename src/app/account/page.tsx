import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { AccountSettingsForm } from "@/components/AccountSettingsForm";
import { updateProfileAction, deleteAccountAction } from "@/app/account/actions";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleteError?: string }>;
}) {
  const { saved, deleteError } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("member_profiles")
    .select("location_text, travel_radius_km, budget_band, dietary_preferences, mobility_notes, interests, goals")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, status, renewal_date")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <AccountSettingsForm
      email={user.email ?? ""}
      profile={profile}
      subscription={subscription}
      saved={saved === "1"}
      deleteError={deleteError}
      onSave={updateProfileAction}
      onDeleteAccount={deleteAccountAction}
    />
  );
}
