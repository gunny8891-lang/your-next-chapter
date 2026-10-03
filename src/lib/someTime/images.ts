import type { SupabaseClient } from "@supabase/supabase-js";
import { loadImages } from "@/lib/imagery/store";
import type { TimeOption } from "@/lib/someTime/types";

/**
 * Adds each idea's photograph, when we have one: the place itself, or failing
 * that the place to eat that finishes the outing (the picture then says which
 * place it is, in its text). Read separately from the main candidate query on
 * purpose: if that read fails, ideas simply have no picture.
 */
export async function attachImages(supabase: SupabaseClient, options: TimeOption[]): Promise<TimeOption[]> {
  const ids = options.flatMap((o) => [o.id, o.foodStop?.id ?? null]).filter((id): id is string => id !== null);
  const images = await loadImages(supabase, ids);
  if (images.size === 0) return options;
  return options.map((o) => ({
    ...o,
    image: images.get(o.id) ?? (o.foodStop ? (images.get(o.foodStop.id) ?? null) : null),
  }));
}
