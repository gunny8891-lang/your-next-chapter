"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { applyUnsubscribe, readUnsubscribeLink } from "@/lib/email/unsubscribeApply";

/** "Yes, stop these emails", from the confirm page. The token is checked again here: the form is not trusted. */
export async function confirmUnsubscribeAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const link = readUnsubscribeLink(token);
  if (!link) redirect("/unsubscribe");

  const done = await applyUnsubscribe(createAdminClient(), link.memberId, link.kind);
  redirect(`/unsubscribe?token=${encodeURIComponent(token)}&${done ? "done=1" : "failed=1"}`);
}
