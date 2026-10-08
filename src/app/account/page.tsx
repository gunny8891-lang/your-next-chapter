import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { googleConfig } from "@/lib/calendar/google";
import { isConnected } from "@/lib/calendar/service";
import { disconnectCalendarAction } from "@/app/calendar/actions";
import { AccountSettingsForm } from "@/components/AccountSettingsForm";
import { cleanFirstName } from "@/lib/someTime/format";
import { updateProfileAction, deleteAccountAction } from "@/app/account/actions";
import { clearLearningAction } from "@/app/account/learningActions";
import { saveEmailPreferencesAction } from "@/app/account/emailActions";

export const metadata = { title: "Account" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleteError?: string; planError?: string; planRebuilt?: string; calendar?: string }>;
}) {
  const { saved, deleteError, planError, planRebuilt, calendar: calendarNotice } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("member_profiles")
    .select("location_text, travel_radius_km, budget_band, dietary_preferences, mobility_notes, drives, uses_public_transport, interests, goals, has_dog, dog_name, dog_usually_comes, email_weekly_plan, email_reminders")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, status, renewal_date")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: userRow } = await supabase.from("users").select("role").eq("id", user.id).single();

  // Shown only once Google Calendar has been switched on (the keys are set).
  const calendar = googleConfig() ? { connected: await isConnected(createAdminClient(), user.id) } : null;

  return (
    <AccountSettingsForm
      email={user.email ?? ""}
      firstName={cleanFirstName(user.user_metadata?.first_name)}
      profile={profile}
      subscription={subscription}
      isAdmin={userRow?.role === "admin"}
      saved={saved === "1"}
      planRebuilt={planRebuilt === "1"}
      planError={planError}
      deleteError={deleteError}
      onSave={updateProfileAction}
      onDeleteAccount={deleteAccountAction}
      onClearLearning={clearLearningAction}
      emailPrefs={{ weeklyPlan: profile.email_weekly_plan !== false, reminders: profile.email_reminders !== false }}
      onSaveEmailPrefs={saveEmailPreferencesAction}
      calendar={calendar}
      calendarNotice={calendarNotice}
      onDisconnectCalendar={disconnectCalendarAction}
    />
  );
}
