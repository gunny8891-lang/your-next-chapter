"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { submitSuggestion } from "@/lib/suggest/suggestPlace";

/** Telling us about somewhere that is not in the app. Asks the sign-in service who is asking; see lib/suggest/suggestPlace.ts. */
export async function suggestPlaceAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const outcome = await submitSuggestion({
    memberId: user.id,
    memberEmail: user.email ?? null,
    raw: {
      name: formData.get("name"),
      kind: formData.get("kind"),
      where: formData.get("where"),
      when: formData.get("when"),
      link: formData.get("link"),
      notes: formData.get("notes"),
    },
  });

  if (outcome === "added" || outcome === "already_have") redirect(`/suggest?sent=${outcome}`);
  redirect(`/suggest?error=${outcome}`);
}
