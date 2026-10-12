"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { cleanPage, submitFeedback } from "@/lib/feedbackSubmit";

export async function sendFeedbackAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const page = cleanPage(formData.get("page"));
  const outcome = await submitFeedback({ memberId: user.id, memberEmail: user.email ?? null, page, message: formData.get("message") });
  const from = encodeURIComponent(page);

  if (outcome === "sent") redirect(`/feedback?from=${from}&sent=1`);
  redirect(`/feedback?from=${from}&error=${outcome}`);
}
