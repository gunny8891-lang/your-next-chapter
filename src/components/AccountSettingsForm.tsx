"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { T } from "@/lib/theme";

type Profile = {
  location_text: string | null;
  travel_radius_km: number | null;
  budget_band: string | null;
  dietary_preferences: string | null;
  mobility_notes: string | null;
  interests: string[];
  goals: string[];
};

type Subscription = { plan: string; status: string; renewal_date: string | null } | null;

const inputStyle = {
  padding: "11px 13px",
  borderRadius: 10,
  border: `1.5px solid ${T.line}`,
  fontSize: 15,
  width: "100%",
  boxSizing: "border-box" as const,
};

const labelStyle = { fontSize: 13, fontWeight: 600, color: T.ink, display: "block", marginBottom: 6 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

export function AccountSettingsForm({
  email,
  profile,
  subscription,
  saved,
  deleteError,
  onSave,
  onDeleteAccount,
}: {
  email: string;
  profile: Profile;
  subscription: Subscription;
  saved: boolean;
  deleteError?: string;
  onSave: (formData: FormData) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <div style={{ background: T.primary, padding: "20px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <Link href="/week" style={{ color: "#EAE3D0", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
            <ChevronLeft size={14} /> Back to This Week
          </Link>
          <h1 style={{ fontFamily: "Georgia, serif", color: "#fff", fontSize: 24, margin: "10px 0 0" }}>Account & Settings</h1>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px 60px" }}>
        {saved && (
          <div style={{ background: "#E7F0E9", border: "1px solid #7C9A82", borderRadius: 10, padding: "12px 14px", marginBottom: 20, fontSize: 14, color: T.primary }}>
            Your profile has been updated.
          </div>
        )}

        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: "22px 22px 8px", marginBottom: 20 }}>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 18, color: T.ink, margin: "0 0 18px" }}>Profile</h2>

          <Field label="Email">
            <input value={email} disabled style={{ ...inputStyle, background: T.bg, color: T.inkSoft }} />
          </Field>

          <form action={onSave}>
            <Field label="Location">
              <input name="location_text" defaultValue={profile.location_text ?? ""} style={inputStyle} placeholder="e.g. Near Richmond, London" />
            </Field>

            <Field label="Travel radius (km)">
              <input name="travel_radius_km" type="number" min={0} defaultValue={profile.travel_radius_km ?? ""} style={inputStyle} />
            </Field>

            <Field label="Budget band">
              <select name="budget_band" defaultValue={profile.budget_band ?? ""} style={inputStyle}>
                <option value="">Not set</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>

            <Field label="Interests (comma-separated)">
              <input name="interests" defaultValue={profile.interests.join(", ")} style={inputStyle} placeholder="e.g. gardening, history, walking" />
            </Field>

            <Field label="Goals (comma-separated)">
              <input name="goals" defaultValue={profile.goals.join(", ")} style={inputStyle} placeholder="e.g. meet_people, fitness" />
            </Field>

            <Field label="Dietary preferences">
              <input name="dietary_preferences" defaultValue={profile.dietary_preferences ?? ""} style={inputStyle} />
            </Field>

            <Field label="Mobility notes">
              <textarea name="mobility_notes" defaultValue={profile.mobility_notes ?? ""} style={{ ...inputStyle, minHeight: 70, resize: "vertical" as const }} />
            </Field>

            <button
              type="submit"
              style={{ width: "100%", padding: "13px", borderRadius: 10, border: "none", background: T.primary, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", marginBottom: 20 }}
            >
              Save changes
            </button>
          </form>
        </div>

        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: "22px", marginBottom: 20 }}>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 18, color: T.ink, margin: "0 0 12px" }}>Subscription</h2>
          {subscription ? (
            <p style={{ fontSize: 14.5, color: T.ink, margin: 0 }}>
              {subscription.plan} plan — {subscription.status}
              {subscription.renewal_date && ` · renews ${subscription.renewal_date}`}
            </p>
          ) : (
            <p style={{ fontSize: 14.5, color: T.inkSoft, margin: 0 }}>
              You&apos;re not subscribed yet — subscription management is coming soon.
            </p>
          )}
        </div>

        <div style={{ background: T.surface, border: "1px solid #E3B8A8", borderRadius: 16, padding: "22px" }}>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 18, color: "#B0562F", margin: "0 0 8px" }}>Danger zone</h2>
          <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 16px", lineHeight: 1.5 }}>
            Permanently deletes your account and all associated data — profile, itineraries, preference history.
            This cannot be undone.
          </p>

          {deleteError && <p style={{ color: "#B0562F", fontSize: 14, marginBottom: 12 }}>{deleteError}</p>}

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{ padding: "11px 18px", borderRadius: 10, border: "1.5px solid #B0562F", background: "none", color: "#B0562F", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Delete my account and data
            </button>
          ) : (
            <div>
              <p style={{ fontSize: 13.5, color: T.ink, marginBottom: 8 }}>
                Type <strong>DELETE</strong> to confirm:
              </p>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                style={{ ...inputStyle, marginBottom: 12, maxWidth: 200 }}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setConfirmText("");
                  }}
                  style={{ padding: "11px 18px", borderRadius: 10, border: `1.5px solid ${T.line}`, background: "none", color: T.ink, fontSize: 14, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <form action={onDeleteAccount}>
                  <button
                    type="submit"
                    disabled={confirmText !== "DELETE"}
                    style={{
                      padding: "11px 18px",
                      borderRadius: 10,
                      border: "none",
                      background: confirmText === "DELETE" ? "#B0562F" : T.line,
                      color: confirmText === "DELETE" ? "#fff" : T.inkSoft,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: confirmText === "DELETE" ? "pointer" : "default",
                    }}
                  >
                    Permanently delete
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
