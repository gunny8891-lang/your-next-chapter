import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { AccountSettingsForm } from "@/components/AccountSettingsForm";
import { cleanFirstName } from "@/lib/someTime/format";
import { updateProfileAction, deleteAccountAction } from "@/app/account/actions";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleteError?: string; planError?: string }>;
}) {
  const { saved, deleteError, planError } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("member_profiles")
    .select("location_text, travel_radius_km, budget_band, dietary_preferences, mobility_notes, drives, uses_public_transport, interests, goals")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, status, renewal_date")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: userRow } = await supabase.from("users").select("role").eq("id", user.id).single();

  return (
    <AccountSettingsForm
      email={user.email ?? ""}
      firstName={cleanFirstName(user.user_metadata?.first_name)}
      profile={profile}
      subscription={subscription}
      isAdmin={userRow?.role === "admin"}
      saved={saved === "1"}
      planError={planError}
      deleteError={deleteError}
      onSave={updateProfileAction}
      onDeleteAccount={deleteAccountAction}
    />
  );
}
