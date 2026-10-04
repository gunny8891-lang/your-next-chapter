import type { SupabaseClient } from "@supabase/supabase-js";
import { loadImages } from "@/lib/imagery/store";
import type { TimeOption } from "@/lib/someTime/types";

/**
 * Gives each idea its best picture. In order: a photograph of the place itself;
 * the generic picture for what kind of thing it is (already on the idea); a
 * photograph of the place to eat that finishes the outing. Read separately from
 * the main candidate query on purpose: if that read fails, ideas keep whatever
 * generic picture they have.
 */
export async function attachImages(supabase: SupabaseClient, options: TimeOption[]): Promise<TimeOption[]> {
  const ids = options.flatMap((o) => [o.id, o.foodStop?.id ?? null]).filter((id): id is string => id !== null);
  const images = await loadImages(supabase, ids);
  if (images.size === 0) return options;
  return options.map((o) => {
    const own = images.get(o.id);
    if (own) return { ...o, image: own };
    if (o.image) return o;
    const food = o.foodStop ? images.get(o.foodStop.id) : undefined;
    return food ? { ...o, image: food } : o;
  });
}
