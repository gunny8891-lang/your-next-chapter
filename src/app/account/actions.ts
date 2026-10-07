"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { geocodeLocation } from "@/lib/geo/geocode";
import { cleanFirstName } from "@/lib/someTime/format";
import { generateAndSaveItinerary } from "@/lib/itinerary/generateAndSave";
import { planInputsChanged } from "@/lib/account/planInputs";
import { triggerDiscoveryForRegion } from "@/lib/discovery/regional";
import { googleConfig } from "@/lib/calendar/google";
import { disconnectCalendar } from "@/lib/calendar/service";

function parseTagList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function updateProfileAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The first name lives on the sign-in profile (user_metadata), not in a table, so it needs no migration.
  const firstName = cleanFirstName(formData.get("first_name"));
  await supabase.auth.updateUser({ data: { first_name: firstName } });

  const radiusRaw = formData.get("travel_radius_km");
  const budgetRaw = String(formData.get("budget_band") ?? "");
  const newLocationText = String(formData.get("location_text") ?? "").trim() || null;

  const { data: existing } = await supabase
    .from("member_profiles")
    .select("location_text, location_lat, location_lng, travel_radius_km, budget_band, dietary_preferences, mobility_notes, drives, uses_public_transport, interests, goals")
    .eq("user_id", user.id)
    .single();

  // Only re-geocode when the location text actually changed — avoids hitting
  // Nominatim on every save of an unrelated field, and avoids clobbering a
  // known-good coordinate when the text is untouched.
  let locationLat = existing?.location_lat ?? null;
  let locationLng = existing?.location_lng ?? null;
  const locationChanged = newLocationText !== (existing?.location_text ?? null);
  if (locationChanged) {
    const geocoded = newLocationText ? await geocodeLocation(newLocationText) : null;
    locationLat = geocoded?.lat ?? null;
    locationLng = geocoded?.lng ?? null;
  }

  const submitted = {
    location_text: newLocationText,
    travel_radius_km: radiusRaw ? Number(radiusRaw) : null,
    budget_band: ["low", "medium", "high", "any"].includes(budgetRaw) ? budgetRaw : null,
    dietary_preferences: String(formData.get("dietary_preferences") ?? "").trim() || null,
    mobility_notes: String(formData.get("mobility_notes") ?? "").trim() || null,
    drives: formData.get("drives") === "on",
    uses_public_transport: formData.get("uses_public_transport") === "on",
    interests: parseTagList(formData.get("interests")),
    goals: parseTagList(formData.get("goals")),
  };

  await supabase
    .from("member_profiles")
    .update({ ...submitted, location_lat: locationLat, location_lng: locationLng })
    .eq("user_id", user.id);

  // Build a fresh plan for the week only if something that decides what goes in it changed. Saving a new
  // name, or saving without changing anything, leaves the week exactly as the member left it. Even when
  // it does rebuild, outings they have already said yes to are kept (see generateAndSave.ts).
  const admin = createAdminClient();
  const rebuild = planInputsChanged(existing, submitted);
  const generated = rebuild ? await generateAndSaveItinerary(admin, user.id) : { error: null };
  // The reason goes to the server log; the member sees a kind sentence and the address carries only a flag.
  if (generated.error) console.warn("account save: could not rebuild the plan:", generated.error);

  // A new location won't have any real candidates yet if the Discovery Agent
  // has never searched it — kick that off now instead of waiting for the
  // nightly cron. This only queues activities for admin review, though; it
  // won't itself add anything to the week just generated above.
  if (locationChanged && newLocationText) {
    after(() => triggerDiscoveryForRegion(admin, user.id, newLocationText));
  }

  revalidatePath("/account");
  revalidatePath("/week");
  redirect(`/account?saved=1${rebuild ? "&planRebuilt=1" : ""}${generated.error ? "&planError=1" : ""}`);
}

export async function deleteAccountAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Deleting the auth user cascades through public.users and every FK-linked
  // table (member_profiles, preference_signals, itineraries, etc.) per the
  // "on delete cascade" constraints in the schema migrations.
  const admin = createAdminClient();

  // Withdraw our access to their Google account before the record of it is gone. Best effort: it must not stop the deletion.
  const calendarConfig = googleConfig();
  if (calendarConfig) await disconnectCalendar(user.id, { admin, config: calendarConfig }).catch(() => undefined);

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    redirect(`/account?deleteError=${encodeURIComponent(error.message)}`);
  }

  await supabase.auth.signOut().catch(() => {});
  redirect("/?deleted=1");
}
