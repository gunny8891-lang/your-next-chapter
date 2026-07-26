"use client";

import { useMemo, useState, useTransition } from "react";
import { Sun, Clock, MapPin, Banknote, Check, Sparkles } from "lucide-react";
import { T } from "@/lib/theme";
import { CATEGORY, DAYS } from "@/lib/categories";
import { Pill } from "@/components/Pill";
import { ItemDetailModal } from "@/components/ItemDetailModal";
import { SwapAlternativesPanel } from "@/components/SwapAlternativesPanel";
import { GenerateWeekButton } from "@/components/GenerateWeekButton";
import { logout } from "@/app/auth/actions";
import type { ItineraryItemView, SurpriseView, MemberAction, SwapAlternative } from "@/lib/types";

const isRealItem = (id: string) => !id.startsWith("demo-");

export function ThisWeekView({
  locationLabel,
  items,
  surprise,
  isDemo,
  onItemAction,
  onSurpriseAction,
  onGenerate,
  onGetSwapAlternatives,
  onApplySwap,
}: {
  locationLabel: string;
  items: ItineraryItemView[];
  surprise: SurpriseView;
  isDemo: boolean;
  onItemAction: (itemId: string, action: "accepted" | "swapped" | "skipped") => Promise<void>;
  onSurpriseAction: (cardId: string, response: "accepted" | "dismissed") => Promise<void>;
  onGenerate: () => Promise<{ error: string | null; usedFallback?: boolean }>;
  onGetSwapAlternatives: (itemId: string) => Promise<{ error: string | null; alternatives: SwapAlternative[] }>;
  onApplySwap: (itemId: string, newActivityId: string) => Promise<{ error: string | null }>;
}) {
  const itemsByDay = useMemo(() => {
    const map: Record<string, ItineraryItemView[]> = {};
    for (const day of DAYS) map[day] = [];
    for (const item of items) {
      (map[item.day] ??= []).push(item);
    }
    return map;
  }, [items]);

  const firstDayWithItems = DAYS.find((d) => itemsByDay[d]?.length) ?? "Mon";
  const [activeDay, setActiveDay] = useState<string>(firstDayWithItems);
  const [statuses, setStatuses] = useState<Record<string, MemberAction>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.status]))
  );
  const [surpriseStatus, setSurpriseStatus] = useState<"accepted" | "dismissed" | null>(
    surprise?.response ?? null
  );
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [swapItemId, setSwapItemId] = useState<string | null>(null);
  const [swapAlternatives, setSwapAlternatives] = useState<SwapAlternative[]>([]);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const openingSurprise = openItemId === "surprise";
  const openItem = openingSurprise ? surprise : items.find((i) => i.id === openItemId) ?? null;

  const handleAction = (action: "accepted" | "swapped" | "skipped") => {
    if (openingSurprise && surprise) {
      const response = action === "accepted" ? "accepted" : "dismissed";
      setSurpriseStatus(response);
      startTransition(() => {
        onSurpriseAction(surprise.id, response);
      });
      setOpenItemId(null);
      return;
    }

    if (openItem && action === "swapped" && isRealItem(openItem.id)) {
      // Real items get an alternatives picker instead of an immediate swap.
      setOpenItemId(null);
      setSwapItemId(openItem.id);
      setSwapAlternatives([]);
      setSwapError(null);
      setSwapLoading(true);
      startTransition(async () => {
        const result = await onGetSwapAlternatives(openItem.id);
        setSwapLoading(false);
        if (result.error) setSwapError(result.error);
        else setSwapAlternatives(result.alternatives);
      });
      return;
    }

    if (openItem) {
      setStatuses((s) => ({ ...s, [openItem.id]: action }));
      startTransition(() => {
        onItemAction(openItem.id, action);
      });
    }
    setOpenItemId(null);
  };

  const handleChooseAlternative = (alt: SwapAlternative) => {
    if (!swapItemId) return;
    setStatuses((s) => ({ ...s, [swapItemId]: "pending" }));
    startTransition(() => {
      onApplySwap(swapItemId, alt.id);
    });
    setSwapItemId(null);
  };

  const dayItems = itemsByDay[activeDay] ?? [];

  return (
    <div style={{ minHeight: "100%", background: T.bg }}>
      <div style={{ background: T.primary, padding: "22px 20px 26px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: T.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Sun size={16} color="#fff" />
              </div>
              <span style={{ fontFamily: "Georgia, serif", fontSize: 17, color: "#fff" }}>Your Next Chapter</span>
            </div>
            <form action={logout}>
              <button type="submit" style={{ background: "none", border: "none", color: "#EAE3D0", fontSize: 12.5, cursor: "pointer" }}>
                Log out
              </button>
            </form>
          </div>
          <p style={{ color: "#EAE3D0", fontSize: 13, margin: "0 0 4px", letterSpacing: 0.4, fontWeight: 600 }}>YOUR PERFECT WEEK</p>
          <h1 style={{ fontFamily: "Georgia, serif", color: "#fff", fontSize: 26, margin: 0 }}>{locationLabel}</h1>
          {isDemo && (
            <>
              <p style={{ color: "#EAE3D0", fontSize: 12.5, marginTop: 8, opacity: 0.85 }}>
                Showing a demo week — generate your real, personalised week below.
              </p>
              <GenerateWeekButton onGenerate={onGenerate} />
            </>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            {DAYS.map((d) => {
              const dItems = itemsByDay[d] ?? [];
              const cat = dItems[0]?.category;
              const color = cat ? CATEGORY[cat].color : T.line;
              const s = dItems[0] ? statuses[dItems[0].id] : undefined;
              return (
                <button
                  key={d}
                  onClick={() => setActiveDay(d)}
                  style={{
                    flex: 1,
                    padding: "10px 4px",
                    borderRadius: 10,
                    border: "none",
                    background: activeDay === d ? "#fff" : "rgba(255,255,255,0.14)",
                    color: activeDay === d ? T.primary : "#EAE3D0",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 5,
                    transition: "all 0.15s",
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>{d}</span>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: s === "skipped" ? "transparent" : color, border: s === "skipped" ? `1px solid ${color}` : "none" }} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 60px" }}>
        {dayItems.length === 0 && (
          <p style={{ color: T.inkSoft, fontSize: 14.5 }}>Nothing planned for {activeDay} yet.</p>
        )}
        {dayItems.map((item) => {
          const Icon = CATEGORY[item.category].icon;
          const color = CATEGORY[item.category].color;
          const status = statuses[item.id];
          return (
            <div
              key={item.id}
              onClick={() => setOpenItemId(item.id)}
              style={{
                background: T.surface,
                border: `1px solid ${T.line}`,
                borderRadius: 16,
                padding: "18px 20px",
                marginBottom: 14,
                cursor: "pointer",
                opacity: status === "skipped" ? 0.5 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Pill color={color}><Icon size={13} /> {item.category}</Pill>
                {status === "accepted" && <Pill color={T.primary}><Check size={12} /> Accepted</Pill>}
                {status === "skipped" && <Pill color={T.inkSoft}>Skipped</Pill>}
              </div>
              <h3 style={{ fontFamily: "Georgia, serif", fontSize: 19, color: T.ink, margin: "12px 0 8px" }}>{item.title}</h3>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, color: T.inkSoft, display: "flex", alignItems: "center", gap: 5 }}><Clock size={13} /> {item.time}</span>
                <span style={{ fontSize: 13.5, color: T.inkSoft, display: "flex", alignItems: "center", gap: 5 }}><MapPin size={13} /> {item.location}</span>
                <span style={{ fontSize: 13.5, color: T.inkSoft, display: "flex", alignItems: "center", gap: 5 }}><Banknote size={13} /> {item.cost}</span>
              </div>
            </div>
          );
        })}

        {surprise && (
          <div
            onClick={() => setOpenItemId("surprise")}
            style={{
              marginTop: 28,
              borderRadius: 18,
              padding: "20px 22px",
              background: `linear-gradient(135deg, ${T.accentSoft}, #fff)`,
              border: `1.5px solid ${T.accent}`,
              cursor: "pointer",
              opacity: surpriseStatus === "dismissed" ? 0.5 : 1,
            }}
          >
            <Pill color={T.accent}><Sparkles size={13} /> Surprise Me — this week</Pill>
            <h3 style={{ fontFamily: "Georgia, serif", fontSize: 19, color: T.ink, margin: "12px 0 6px" }}>{surprise.title}</h3>
            <p style={{ fontSize: 13.5, color: T.inkSoft, margin: 0 }}>{surprise.location} · {surprise.cost}</p>
          </div>
        )}
      </div>

      {openItem && (
        <ItemDetailModal
          item={openItem}
          status={openingSurprise ? surpriseStatus : statuses[openItem.id]}
          onClose={() => setOpenItemId(null)}
          onAction={handleAction}
        />
      )}

      {swapItemId && (
        <SwapAlternativesPanel
          isLoading={swapLoading}
          alternatives={swapAlternatives}
          error={swapError}
          onChoose={handleChooseAlternative}
          onClose={() => setSwapItemId(null)}
        />
      )}
    </div>
  );
}
