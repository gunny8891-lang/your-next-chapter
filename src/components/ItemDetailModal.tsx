"use client";

import { Clock, MapPin, Banknote, Check, RefreshCw, X } from "lucide-react";
import { T } from "@/lib/theme";
import { CATEGORY } from "@/lib/categories";
import { Pill } from "@/components/Pill";
import type { ItineraryItemView, SurpriseView } from "@/lib/types";

type Item = ItineraryItemView | NonNullable<SurpriseView>;

export function ItemDetailModal({
  item,
  status,
  onClose,
  onAction,
}: {
  item: Item;
  status: string | null | undefined;
  onClose: () => void;
  onAction: (action: "accepted" | "swapped" | "skipped") => void;
}) {
  const Icon = CATEGORY[item.category].icon;
  const color = CATEGORY[item.category].color;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(34,48,30,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "24px 24px 32px", maxHeight: "80vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <Pill color={color}><Icon size={13} /> {item.category}</Pill>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.inkSoft }}>
            <X size={20} />
          </button>
        </div>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 24, color: T.ink, margin: "0 0 16px" }}>{item.title}</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: T.inkSoft, fontSize: 15 }}><Clock size={16} /> {item.time}</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: T.inkSoft, fontSize: 15 }}><MapPin size={16} /> {item.location}</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: T.inkSoft, fontSize: 15 }}><Banknote size={16} /> {item.cost}</div>
        </div>

        <div style={{ background: T.bg, borderRadius: 12, padding: "14px 16px", marginBottom: 22 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: T.primary, margin: "0 0 4px", letterSpacing: 0.3 }}>WHY WE PICKED THIS</p>
          <p style={{ fontSize: 14.5, color: T.ink, margin: 0, lineHeight: 1.5 }}>{item.why}</p>
        </div>

        {status === "accepted" ? (
          <a
            href={item.bookingUrl ?? "#"}
            target={item.bookingUrl ? "_blank" : undefined}
            rel={item.bookingUrl ? "noopener noreferrer" : undefined}
            style={{ display: "block", textAlign: "center", width: "100%", padding: "15px", borderRadius: 12, border: "none", background: T.primary, color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer", textDecoration: "none" }}
          >
            {item.bookingUrl ? "Book this — opens provider site" : "No booking link yet"}
          </a>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => onAction("skipped")} style={{ flex: 1, padding: "14px", borderRadius: 12, border: `1.5px solid ${T.line}`, background: T.surface, color: T.inkSoft, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              Skip
            </button>
            <button onClick={() => onAction("swapped")} style={{ flex: 1, padding: "14px", borderRadius: 12, border: `1.5px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 15, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <RefreshCw size={14} /> Swap
            </button>
            <button onClick={() => onAction("accepted")} style={{ flex: 1.4, padding: "14px", borderRadius: 12, border: "none", background: T.primary, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Check size={15} /> Accept
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
