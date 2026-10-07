"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { recordAcceptance } from "@/lib/legal/acceptance";
import { AGREEMENT_COOKIE_OPTIONS, LEGAL_COOKIE, agreementCookieValue, safeNext } from "@/lib/legal/gate";

/** The member ticked the box on the agree screen: keep the record, remember it in this browser, and carry on to where they were going. */
export async function agree(formData: FormData) {
  const next = safeNext(String(formData.get("next") ?? ""));
  const back = (error: string) => redirect(`/agree?error=${error}&next=${encodeURIComponent(next)}`);

  // The box is `required` in the form, but a form can be posted without it.
  if (formData.get("accept") !== "on") back("terms_not_accepted");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const recorded = await recordAcceptance(createAdminClient(), user.id, "reaccept");
  if (recorded.error) {
    console.warn("could not record the terms agreement:", recorded.error);
    back("generic");
  }

  (await cookies()).set(LEGAL_COOKIE, agreementCookieValue(user.id), AGREEMENT_COOKIE_OPTIONS);
  redirect(next);
}
