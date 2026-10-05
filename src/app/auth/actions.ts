"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { classifyAuthError } from "@/lib/auth/messages";

async function getSiteUrl() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return `${proto}://${host}`;
}

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await getSiteUrl()}/auth/confirm` },
  });

  if (error) {
    // The provider’s wording is for us, not the member: log it, and send only a code.
    console.warn("signup failed:", error.code ?? error.status, error.message);
    redirect(`/signup?error=${classifyAuthError(error)}`);
  }

  redirect("/signup?checkEmail=1");
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.warn("login failed:", error.code ?? error.status, error.message);
    redirect(`/login?error=${classifyAuthError(error)}`);
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
    redirect(`/reset-password?error=${classifyAuthError(error)}`);
  }

  redirect("/today");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
