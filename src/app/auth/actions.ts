"use server";

import { cookies, headers } from "next/headers";
import { afterResponse } from "@/lib/afterResponse";
import { notifyNewSignup } from "@/lib/email/signupNotice";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { classifyAuthError } from "@/lib/auth/messages";
import { isNewAccount, recordAcceptance } from "@/lib/legal/acceptance";
import { PENDING_EMAIL_COOKIE, PENDING_EMAIL_OPTIONS, readPendingEmail } from "@/lib/auth/pendingEmail";
import { recordAppEvent } from "@/lib/appEvents";

async function getSiteUrl() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return `${proto}://${host}`;
}

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  // The form's box is `required`, but a form can be posted without it: no account without the agreement.
  if (formData.get("accept") !== "on") redirect("/signup?error=terms_not_accepted");

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await getSiteUrl()}/auth/confirm` },
  });

  if (error) {
    // The provider’s wording is for us, not the member: log it, and send only a code.
    console.warn("signup failed:", error.code ?? error.status, error.message);
    const code = classifyAuthError(error);
    // Only our own code, so a problem can be seen without reading server logs: never the address or the provider's words.
    afterResponse(() => recordAppEvent("signup_failed", code));
    redirect(`/signup?error=${code}`);
  }

  // Keep the record of what they agreed to and when. A failure here must not undo a sign-up that
  // worked (and the member cannot do anything about it), so it is logged for us rather than shown.
  if (isNewAccount(data.user)) {
    const recorded = await recordAcceptance(createAdminClient(), data.user.id);
    if (recorded.error) console.warn("could not record the terms agreement:", recorded.error);
    // Tell whoever runs the app, once the response has gone: a note about a new sign-up must never slow or break one.
    const registered = data.user.email ?? email;
    afterResponse(() => notifyNewSignup(registered));
  }

  // So "send it again" knows where to: kept an hour, in a cookie and not the address of the page.
  (await cookies()).set(PENDING_EMAIL_COOKIE, email.trim(), PENDING_EMAIL_OPTIONS);

  redirect("/signup?checkEmail=1");
}

/**
 * "Send it again": the same confirmation email, to the address just signed up with (or just tried to log in with, when it
 * was not yet confirmed). The provider limits how often this can be asked for, which comes back as a kind sentence.
 */
export async function resendConfirmation() {
  const email = readPendingEmail((await cookies()).get(PENDING_EMAIL_COOKIE)?.value);
  if (!email) redirect("/signup?checkEmail=1&error=nothing_to_resend");

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${await getSiteUrl()}/auth/confirm` },
  });

  if (error) {
    console.warn("resend confirmation failed:", error.code ?? error.status, error.message);
    const code = classifyAuthError(error);
    afterResponse(() => recordAppEvent("resend_failed", code));
    redirect(`/signup?checkEmail=1&error=${code}`);
  }

  redirect("/signup?checkEmail=1&resent=1");
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.warn("login failed:", error.code ?? error.status, error.message);
    const code = classifyAuthError(error);
    // A wrong password is ordinary and not worth a record; the rest (unconfirmed, refused, a failure) is.
    if (code !== "bad_credentials") afterResponse(() => recordAppEvent("login_failed", code));
    // Someone who signed up but never opened the link: remember the address so the page can offer another email.
    if (code === "unconfirmed") (await cookies()).set(PENDING_EMAIL_COOKIE, email.trim(), PENDING_EMAIL_OPTIONS);
    redirect(`/login?error=${code}`);
  }

  redirect("/today");
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const supabase = await createClient();

  // Supabase doesn't error for unknown emails here — preserves the same
  // "check your email" response either way so this can't be used to enumerate accounts.
  // Supabase appends its own token_hash + type=recovery to this redirect URL,
  // matching how /auth/confirm already handles the signup-confirmation link.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await getSiteUrl()}/auth/confirm?next=/reset-password`,
  });

  redirect("/forgot-password?checkEmail=1");
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?error=link_expired");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.warn("password update failed:", error.code ?? error.status, error.message);
    const code = classifyAuthError(error);
    afterResponse(() => recordAppEvent("reset_failed", code));
    redirect(`/reset-password?error=${code}`);
  }

  redirect("/today");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
