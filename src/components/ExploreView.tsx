"use client";

import { useState, useTransition } from "react";
import { Clock, Heart } from "lucide-react";
import { Button, Card, Chip, ErrorNote, Page, PageHeader, SectionTitle, Skeleton } from "@/components/ui";
import { ExperienceCard, type FeedbackReason } from "@/components/ExperienceCard";
import type { TimeSheet } from "@/components/TimeSheet";
import { exploreDuration, MOOD_OPTIONS } from "@/lib/someTime/choices";
import { placeLabel, priceBand } from "@/lib/someTime/format";
import type { Mood } from "@/lib/someTime/request";
import type { SavedIdea } from "@/lib/someTime/saved";
import type { TimeOption, TimeResult } from "@/lib/someTime/types";
import { CATEGORY_COLOR } from "@/lib/theme";
import styles from "@/components/Explore.module.css";

type Flow = React.ComponentProps<typeof TimeSheet>;
type CardState = "idle" | "planning" | "planned";

const toSaved = (o: TimeOption): SavedIdea => ({
  id: o.id,
  title: o.title,
  category: o.category,
  address: o.address,
  priceEstimate: o.priceEstimate,
  setting: o.setting,
});

/**
 * Explore: ideas for today by what you feel like, and the ideas you have saved. It
 * uses the same engine and the same cards as Today, so an idea looks and behaves
 * the same wherever it turns up.
 */
export function ExploreView({
  saved: initialSaved,
  onFind,
  onAccept,
  onFeedback,
  onSave,
  onUnsave,
}: {
  saved: SavedIdea[];
  onFind: Flow["onFind"];
  onAccept: Flow["onAccept"];
  onFeedback: Flow["onFeedback"];
  onSave: (activityId: string, meta?: { surface?: string; who?: string }) => Promise<{ error: string | null }>;
  onUnsave: (activityId: string) => Promise<{ error: string | null }>;
}) {
  const [mood, setMood] = useState<Mood | null>(null);
  const [result, setResult] = useState<TimeResult | null>(null);
  const [shown, setShown] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [savedList, setSavedList] = useState<SavedIdea[]>(initialSaved);
  const [states, setStates] = useState<Record<string, CardState>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const savedIds = new Set(savedList.map((s) => s.id));

  const find = (chosen: Mood, exclude: string[]) => {
    setMood(chosen);
    setError(null);
    setResult(null);
    setStates({});
    setErrors({});
    startTransition(async () => {
      const res = await onFind({
        start: "now",
        duration: exploreDuration(new Date().getHours()),
        who: "just_me",
        mood: chosen,
        exclude,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setResult(res);
      setShown((prev) => [...new Set([...exclude, ...prev, ...res.options.map((o) => o.id)])]);
    });
  };

  const plan = async (id: string, foodStopId?: string) => {
    setErrors((e) => ({ ...e, [id]: null }));
    setStates((s) => ({ ...s, [id]: "planning" }));
    const res = await onAccept(id, { start: "now", duration: exploreDuration(new Date().getHours()) }, foodStopId, { surface: "explore" });
    if (res.error) {
      setErrors((e) => ({ ...e, [id]: res.error }));
      setStates((s) => ({ ...s, [id]: "idle" }));
    } else {
      setStates((s) => ({ ...s, [id]: "planned" }));
    }
  };

  const notForMe = (option: TimeOption, reason: FeedbackReason) => {
    void onFeedback(option.id, reason, { surface: "explore" });
    setResult((r) => (r ? { ...r, options: r.options.filter((o) => o.id !== option.id) } : r));
  };

  const save = async (option: TimeOption) => {
    const res = await onSave(option.id, { surface: "explore" });
    if (!res.error) setSavedList((list) => (list.some((s) => s.id === option.id) ? list : [toSaved(option), ...list]));
    return res;
  };

  const unsave = async (id: string) => {
    const res = await onUnsave(id);
    if (!res.error) setSavedList((list) => list.filter((s) => s.id !== id));
    return res;
  };

  const loading = isPending && !result && !error;

  return (
    <Page>
      <PageHeader title="Explore" lead="Ideas for today, whatever you feel like." />

      <section aria-labelledby="feel">
        <SectionTitle id="feel">What do you feel like?</SectionTitle>
        <div className={styles.chips} role="group" aria-label="What you feel like">
          {MOOD_OPTIONS.map((m) => (
            <Chip key={m.value} selected={mood === m.value} onClick={() => find(m.value, [])} disabled={isPending}>
              {m.label}
            </Chip>
          ))}
        </div>

        <div className={styles.results} aria-live="polite" aria-busy={loading}>
          {loading &&
            [0, 1, 2].map((i) => (
              <Card key={i}>
                <div className={styles.skeleton}>
                  <Skeleton height={130} />
                  <Skeleton height={24} width="70%" />
                  <Skeleton height={14} width="45%" />
                  <Skeleton height={16} />
                </div>
              </Card>
            ))}

          {error && <ErrorNote>{error}</ErrorNote>}

          {result?.windowLabel && (
            <p className={styles.windowLine}>
              <Clock size={14} aria-hidden="true" /> {result.windowLabel}
            </p>
          )}
          {result && result.options.length === 0 && !error && (
            <p className={styles.notice}>{result.notice ?? "Nothing suitable nearby right now. Check back soon as we find more."}</p>
          )}

          {result?.options.map((option) => (
            <ExperienceCard
              key={option.id}
              option={option}
              reason={option.why}
              variant="result"
              surface="explore"
              state={states[option.id] ?? "idle"}
              error={errors[option.id]}
              saved={savedIds.has(option.id)}
              onPlan={() => plan(option.id, option.foodStop?.id)}
              onSave={() => save(option)}
              onUnsave={() => unsave(option.id)}
              onNotForMe={(reason) => notForMe(option, reason)}
            />
          ))}

          {result && result.options.length > 0 && mood && (
            <Button variant="secondary" onClick={() => find(mood, shown)} disabled={isPending}>
              Show me different ideas
            </Button>
          )}
        </div>
      </section>

      <section aria-labelledby="saved" className={styles.saved}>
        <SectionTitle id="saved">Saved for later</SectionTitle>
        {savedList.length === 0 ? (
          <p className={styles.notice}>
            <Heart size={16} aria-hidden="true" /> Tap Save on an idea you like and it will wait for you here.
          </p>
        ) : (
          <ul className={styles.savedList}>
            {savedList.map((idea) => {
              const meta = [placeLabel(idea.address), priceBand(idea.priceEstimate)].filter(Boolean).join(" · ");
              const state = states[idea.id] ?? "idle";
              return (
                <li key={idea.id} className={styles.savedRow}>
                  <p className={styles.savedCategory} style={{ color: CATEGORY_COLOR[idea.category] }}>
                    {idea.category}
                  </p>
                  <h3 className={styles.savedTitle}>{idea.title}</h3>
                  {meta && <p className={styles.savedMeta}>{meta}</p>}
                  <div className={styles.savedActions}>
                    {state === "planned" ? (
                      <p className={styles.planned}>Added to your day</p>
                    ) : (
                      <Button size="sm" loading={state === "planning"} onClick={() => plan(idea.id)}>
                        {state === "planning" ? "Planning…" : "Plan this for today"}
                      </Button>
                    )}
                    <Button size="sm" variant="quiet" onClick={() => unsave(idea.id)}>
                      Remove
                    </Button>
                  </div>
                  {errors[idea.id] && <p className={styles.rowError}>{errors[idea.id]}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Page>
  );
}
