"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { generateAndSaveItinerary } from "@/lib/itinerary/generateAndSave";

export async function generateWeekItineraryAction(): Promise<{ error: string | null; usedFallback?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();
  const result = await generateAndSaveItinerary(admin, user.id);
  if (!result.error) revalidatePath("/week");
  return { error: result.error, usedFallback: result.usedFallback };
}
