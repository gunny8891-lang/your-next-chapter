import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { T } from "@/lib/theme";
import { DOG_ACCESS } from "@/lib/opportunities/facts";

export type AdminPlace = {
  id: string;
  title: string;
  address: string | null;
  category: string;
  dog_access: string;
  dog_restrictions: string | null;
  dog_confidence: string;
  dog_source: string | null;
};

const ACCESS_LABEL: Record<string, string> = {
  unknown: "Unknown (not recorded)",
  allowed: "Dogs allowed",
  outdoor_only: "Dogs allowed outdoors only",
  selected_areas: "Dogs allowed in some areas",
  assistance_dogs_only: "Assistance dogs only",
  not_allowed: "No dogs",
};

const inputStyle = { padding: "9px 11px", borderRadius: 8, border: `1.5px solid ${T.line}`, fontSize: 14, width: "100%", boxSizing: "border-box" as const };
const labelStyle = { fontSize: 12, fontWeight: 600, color: T.inkSoft, display: "block", marginBottom: 4 };

/** Where dogs can and cannot go, place by place: what we know, and a way to record what the place itself says. */
export function AdminPlaces({
  places,
  total,
  recorded,
  query,
  showAll,
  savedId,
  openId,
  error,
  onSave,
}: {
  places: AdminPlace[];
  total: number;
  recorded: number;
  query: string;
  showAll: boolean;
  savedId: string | null;
  openId: string | null;
  error: string | null;
  onSave: (formData: FormData) => Promise<void>;
}) {
  const back = `/admin/places${query || showAll ? `?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(showAll ? { show: "all" } : {}) }).toString()}` : ""}`;

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <div style={{ background: T.primary, padding: "20px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <Link href="/account" style={{ color: "#EAE3D0", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
            <ChevronLeft size={16} aria-hidden="true" /> Account
          </Link>
          <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", color: "#fff", fontSize: 24, margin: "6px 0 0" }}>Places and dogs</h1>
          <p style={{ color: "#EAE3D0", fontSize: 13, margin: "6px 0 0" }}>
            Dog access is recorded for {recorded} of {total} places. Nothing is recorded without a source: a link for verified, a note of where it was heard for reported.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 20px 60px" }}>
        <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
          <input name="q" defaultValue={query} placeholder="Search by name" aria-label="Search places by name" style={{ ...inputStyle, flex: "1 1 220px", width: "auto" }} />
          <label style={{ fontSize: 14, color: T.ink, display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" name="show" value="all" defaultChecked={showAll} /> Include places already recorded
          </label>
          <button type="submit" style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: T.primary, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Show
          </button>
        </form>

        {error && (
          <p role="alert" style={{ background: "#FBEDE7", color: "#8A3B1C", borderRadius: 8, padding: "10px 12px", fontSize: 14 }}>
            {error}
          </p>
        )}

        {places.length === 0 && <p style={{ color: T.inkSoft, fontSize: 15 }}>No places match.</p>}

        {places.map((place) => (
          <details
            key={place.id}
            open={openId === place.id}
            style={{ background: T.surface, border: `1px solid ${savedId === place.id ? T.primary : T.line}`, borderRadius: 14, padding: "14px 18px", marginBottom: 10 }}
          >
            <summary style={{ cursor: "pointer", listStyle: "none" }}>
              <span style={{ fontWeight: 600, color: T.ink, fontSize: 15 }}>{place.title}</span>
              <span style={{ display: "block", fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
                {[place.category, place.address].filter(Boolean).join(" · ")}
              </span>
              <span style={{ display: "block", fontSize: 12.5, color: place.dog_access === "unknown" ? T.inkSoft : T.primary, marginTop: 2 }}>
                {savedId === place.id ? "Saved. " : ""}
                {ACCESS_LABEL[place.dog_access] ?? place.dog_access}
                {place.dog_access !== "unknown" ? ` (${place.dog_confidence})` : ""}
              </span>
            </summary>

            <form action={onSave} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
              <input type="hidden" name="id" value={place.id} />
              <input type="hidden" name="back" value={back} />
              <div>
                <label style={labelStyle} htmlFor={`access-${place.id}`}>
                  Dogs
                </label>
                <select id={`access-${place.id}`} name="dog_access" defaultValue={place.dog_access} style={inputStyle}>
                  {DOG_ACCESS.map((a) => (
                    <option key={a} value={a}>
                      {ACCESS_LABEL[a]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle} htmlFor={`conf-${place.id}`}>
                  How sure
                </label>
                <select id={`conf-${place.id}`} name="dog_confidence" defaultValue={place.dog_confidence === "unknown" ? "verified" : place.dog_confidence} style={inputStyle}>
                  <option value="verified">Verified: the place or its owner says so</option>
                  <option value="reported">Reported: heard from someone else</option>
                </select>
              </div>
              <div>
                <label style={labelStyle} htmlFor={`src-${place.id}`}>
                  Source (a link for verified; where it was heard for reported)
                </label>
                <input id={`src-${place.id}`} name="dog_source" defaultValue={place.dog_source ?? ""} placeholder="https://" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle} htmlFor={`rules-${place.id}`}>
                  Rules, in a few words (optional)
                </label>
                <input id={`rules-${place.id}`} name="dog_restrictions" defaultValue={place.dog_restrictions ?? ""} maxLength={120} placeholder="e.g. on a lead; not in the house" style={inputStyle} />
              </div>
              <button type="submit" style={{ padding: "11px", borderRadius: 8, border: "none", background: T.primary, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Save
              </button>
              <p style={{ fontSize: 12.5, color: T.inkSoft, margin: 0 }}>Choosing Unknown clears the record.</p>
            </form>
          </details>
        ))}
      </div>
    </div>
  );
}
