import { T } from "@/lib/theme";
import { CATEGORIES } from "@/lib/itinerary/schema";

type ReviewActivity = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  address: string | null;
  date_time: string | null;
  price_estimate: number | null;
  source: string;
  admin_notes: string | null;
  created_at: string;
};

const inputStyle = {
  padding: "9px 11px",
  borderRadius: 8,
  border: `1.5px solid ${T.line}`,
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box" as const,
};

const labelStyle = { fontSize: 12, fontWeight: 600, color: T.inkSoft, display: "block", marginBottom: 4 };

export function AdminActivityReview({
  activities,
  onApprove,
  onReject,
}: {
  activities: ReviewActivity[];
  onApprove: (formData: FormData) => Promise<void>;
  onReject: (formData: FormData) => Promise<void>;
}) {
  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <div style={{ background: T.primary, padding: "20px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h1 style={{ fontFamily: "Georgia, serif", color: "#fff", fontSize: 24, margin: 0 }}>Review Queue</h1>
          <p style={{ color: "#EAE3D0", fontSize: 13, margin: "6px 0 0" }}>
            {activities.length} activit{activities.length === 1 ? "y" : "ies"} awaiting review
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px 60px" }}>
        {activities.length === 0 && (
          <p style={{ color: T.inkSoft, fontSize: 15 }}>Nothing to review right now.</p>
        )}

        {activities.map((activity) => (
          <div
            key={activity.id}
            style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 14, padding: "20px 22px", marginBottom: 16 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: T.accent, letterSpacing: 0.3 }}>
                {activity.source.toUpperCase()}
              </span>
              <span style={{ fontSize: 11.5, color: T.inkSoft }}>
                {new Date(activity.created_at).toLocaleDateString("en-GB")}
              </span>
            </div>

            {activity.admin_notes && (
              <div style={{ background: T.bg, borderRadius: 8, padding: "10px 12px", marginBottom: 14, fontSize: 13, color: T.ink }}>
                {activity.admin_notes}
              </div>
            )}

            <form action={onApprove} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input type="hidden" name="id" value={activity.id} />

              <div>
                <label style={labelStyle}>Title</label>
                <input name="title" defaultValue={activity.title} style={inputStyle} />
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Category</label>
                  <select name="category" defaultValue={activity.category} style={inputStyle}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Price estimate (£)</label>
                  <input name="price_estimate" type="number" min={0} defaultValue={activity.price_estimate ?? ""} style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Address</label>
                <input name="address" defaultValue={activity.address ?? ""} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Description</label>
                <textarea name="description" defaultValue={activity.description ?? ""} style={{ ...inputStyle, minHeight: 60, resize: "vertical" as const }} />
              </div>

              {activity.date_time && (
                <p style={{ fontSize: 12.5, color: T.inkSoft, margin: 0 }}>
                  Date/time as extracted: {new Date(activity.date_time).toLocaleString("en-GB")}
                </p>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button
                  type="submit"
                  style={{ flex: 1, padding: "11px", borderRadius: 8, border: "none", background: T.primary, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                >
                  Approve
                </button>
              </div>
            </form>

            <form action={onReject} style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={activity.id} />
              <button
                type="submit"
                style={{ width: "100%", padding: "9px", borderRadius: 8, border: `1.5px solid ${T.line}`, background: "none", color: "#B0562F", fontSize: 13, cursor: "pointer" }}
              >
                Reject & delete
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
