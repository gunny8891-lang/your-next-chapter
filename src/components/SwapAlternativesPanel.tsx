"use client";

import { MapPin, Banknote, X } from "lucide-react";
import { T } from "@/lib/theme";
import { CATEGORY } from "@/lib/categories";
import { Pill } from "@/components/Pill";
import type { SwapAlternative } from "@/lib/types";

export function SwapAlternativesPanel({
  isLoading,
  alternatives,
  error,
  onChoose,
  onClose,
}: {
  isLoading: boolean;
  alternatives: SwapAlternative[];
  error: string | null;
  onChoose: (alternative: SwapAlternative) => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(34,48,30,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "24px 24px 32px", maxHeight: "80vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, color: T.ink, margin: 0 }}>Swap for something else</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.inkSoft }}>
            <X size={20} />
          </button>
        </div>

        {isLoading && <p style={{ color: T.inkSoft, fontSize: 14.5 }}>Finding alternatives…</p>}
        {error && <p style={{ color: "#B0562F", fontSize: 14.5 }}>{error}</p>}
        {!isLoading && !error && alternatives.length === 0 && (
          <p style={{ color: T.inkSoft, fontSize: 14.5 }}>No alternatives available in this category right now.</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {alternatives.map((alt) => {
            const Icon = CATEGORY[alt.category].icon;
            const color = CATEGORY[alt.category].color;
            return (
              <div
                key={alt.id}
                style={{ border: `1px solid ${T.line}`, borderRadius: 14, padding: "14px 16px" }}
              >
                <Pill color={color}><Icon size={13} /> {alt.category}</Pill>
                <h3 style={{ fontFamily: "Georgia, serif", fontSize: 17, color: T.ink, margin: "10px 0 8px" }}>{alt.title}</h3>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
                  {alt.address && (
                    <span style={{ fontSize: 13, color: T.inkSoft, display: "flex", alignItems: "center", gap: 5 }}>
                      <MapPin size={13} /> {alt.address}
                    </span>
                  )}
                  <span style={{ fontSize: 13, color: T.inkSoft, display: "flex", alignItems: "center", gap: 5 }}>
                    <Banknote size={13} /> {alt.priceEstimate === 0 ? "Free" : alt.priceEstimate != null ? `£${alt.priceEstimate}` : "Price TBC"}
                  </span>
                </div>
                <button
                  onClick={() => onChoose(alt)}
                  style={{ width: "100%", padding: "11px", borderRadius: 10, border: "none", background: T.primary, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                >
                  Choose this instead
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
