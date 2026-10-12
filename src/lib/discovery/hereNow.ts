import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";
import { countNearbyPlaces, isThinArea } from "@/lib/coverage/nearbyPlaces";
import { ensureOpenStreetMapPlaces } from "@/lib/discovery/osmPlaces";

/**
 * Someone asked for ideas near where they are now, somewhere we know little about (they are away from home, in a town no
 * member lives in yet). The free map layers are fetched for that place in the background, so the next ask finds more.
 * Costs nothing but is polite to the map service: once a day for each member, and only where few places are known.
 * Never throws: it runs after the answer has gone.
 */

/** The usage log row that marks it was done, so a member's second ask in a day does not fetch again. */
export const HERE_FEATURE = "here_places";
const DAY_MS = 24 * 60 * 60 * 1000;

export type HereOutcome = "fetched" | "known" | "limited" | "failed";

export type HereDeps = {
  admin?: SupabaseClient;
  now?: Date;
  count?: typeof countNearbyPlaces;
  ensure?: typeof ensureOpenStreetMapPlaces;
};

export async function ensurePlacesNearHere(memberId: string, here: { lat: number; lng: number }, deps: HereDeps = {}): Promise<HereOutcome> {
  try {
    const admin = deps.admin ?? createAdminClient();
    const found = await (deps.count ?? countNearbyPlaces)(admin, here.lat, here.lng);
    // Plenty already known (or could not be counted): nothing to do.
    if (!isThinArea(found)) return "known";

    const since = new Date((deps.now ?? new Date()).getTime() - DAY_MS).toISOString();
    const { data: recent } = await admin.from("ai_usage_logs").select("id").eq("user_id", memberId).eq("feature", HERE_FEATURE).gte("created_at", since).limit(1);
    if ((recent ?? []).length > 0) return "limited";

    await admin.from("ai_usage_logs").insert({
      user_id: memberId,
      feature: HERE_FEATURE,
      model: "none",
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      estimated_cost: 0,
      latency_ms: 0,
      success: true,
      error_message: null,
    });

    const outcome = await (deps.ensure ?? ensureOpenStreetMapPlaces)(admin, "this area", { geocode: async () => here });
    return outcome.status === "failed" ? "failed" : "fetched";
  } catch (err) {
    console.warn("places near here: could not fetch:", err instanceof Error ? err.message : err);
    return "failed";
  }
}
