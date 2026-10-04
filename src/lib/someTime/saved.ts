import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryName } from "@/lib/categories";
import { settingOf } from "@/lib/someTime/format";

/** One idea on the member's Saved list. */
export type SavedIdea = {
  id: string;
  title: string;
  category: CategoryName;
  address: string | null;
  priceEstimate: number | null;
  setting: "outdoors" | "indoors" | null;
};

type SavedRow = {
  activities:
    | { id: string; title: string; category: string; address: string | null; price_estimate: number | null; tags: string[] | null; status: string }
    | { id: string; title: string; category: string; address: string | null; price_estimate: number | null; tags: string[] | null; status: string }[]
    | null;
};

/** Pure: the saved ideas that can still be done. Something since removed from the catalogue just drops off. */
export function toSavedIdeas(rows: SavedRow[]): SavedIdea[] {
  const ideas: SavedIdea[] = [];
  for (const row of rows) {
    const a = Array.isArray(row.activities) ? row.activities[0] : row.activities;
    if (!a || a.status !== "active") continue;
    ideas.push({
      id: a.id,
      title: a.title,
      category: a.category as CategoryName,
      address: a.address,
      priceEstimate: a.price_estimate,
      setting: settingOf(a.tags ?? []),
    });
  }
  return ideas;
}

/** The member's Saved list, newest first. Never throws: a failed read is an empty list, not a broken page. */
export async function loadSavedIdeas(supabase: SupabaseClient, memberId: string, limit = 30): Promise<SavedIdea[]> {
  const { data, error } = await supabase
    .from("saved_ideas")
    .select("created_at, activities(id, title, category, address, price_estimate, tags, status)")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("saved: could not read the saved list:", error.message);
    return [];
  }
  return toSavedIdeas((data ?? []) as unknown as SavedRow[]);
}
