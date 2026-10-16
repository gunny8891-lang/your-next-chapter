import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who is signed in, for the screens that only read.
 *
 * `auth.getUser()` asks Supabase's sign-in service on every call, which is a full trip over the network. `getClaims()` checks the
 * signature and expiry of the sign-in token on this server, against the project's public key (which this project signs with:
 * see /auth/v1/.well-known/jwks.json), so it costs nothing in time. The proxy has already refreshed the token if it was
 * about to run out, so what arrives here is current.
 *
 * What is lost: a sign-in ended elsewhere (signed out on another device) still counts here until the token runs out, up to an
 * hour. That is fine for showing someone their own screens. It is not fine for changing or deleting anything, so the server
 * actions keep using `getUser()`.
 */
export type SessionUser = { id: string; email: string | null; user_metadata: Record<string, unknown> };

export async function getSessionUser(supabase: SupabaseClient): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims || typeof claims.sub !== "string" || !claims.sub) return null;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    user_metadata: (claims.user_metadata as Record<string, unknown> | undefined) ?? {},
  };
}
