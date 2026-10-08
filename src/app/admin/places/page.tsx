import { requireAdmin } from "@/lib/admin/requireAdmin";
import { AdminPlaces, type AdminPlace } from "@/components/AdminPlaces";
import { setDogAccessAction } from "@/app/admin/places/actions";

export const metadata = { title: "Places and dogs" };

const MAX_SHOWN = 60;

export default async function AdminPlacesPage({ searchParams }: { searchParams: Promise<{ q?: string; show?: string; saved?: string; open?: string; error?: string }> }) {
  const { q, show, saved, open, error } = await searchParams;
  const supabase = await requireAdmin();

  const query = (q ?? "").trim().slice(0, 80);
  const showAll = show === "all";

  // Counts for the line at the top, then the places themselves: only those with nothing recorded unless asked.
  const [{ count: total }, { count: recorded }] = await Promise.all([
    supabase.from("activities").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("activities").select("id", { count: "exact", head: true }).eq("status", "active").neq("dog_access", "unknown"),
  ]);

  let places = supabase
    .from("activities")
    .select("id, title, address, category, dog_access, dog_restrictions, dog_confidence, dog_source")
    .eq("status", "active")
    .order("title")
    .limit(MAX_SHOWN);
  if (!showAll) places = places.eq("dog_access", "unknown");
  // A search term is matched as plain text: the characters that mean something to a filter are removed.
  const term = query.replace(/[%_,()*\\]/g, " ").trim();
  if (term) places = places.ilike("title", `%${term}%`);
  const { data } = await places;

  return (
    <AdminPlaces
      places={(data ?? []) as AdminPlace[]}
      total={total ?? 0}
      recorded={recorded ?? 0}
      query={query}
      showAll={showAll}
      savedId={saved && /^[0-9a-f-]{36}$/i.test(saved) ? saved : null}
      openId={open && /^[0-9a-f-]{36}$/i.test(open) ? open : null}
      error={error ? error.slice(0, 200) : null}
      onSave={setDogAccessAction}
    />
  );
}
