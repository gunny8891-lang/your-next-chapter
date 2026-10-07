"use client";

import { useEffect, useId, useState } from "react";
import { Check, ChevronDown, Heart } from "lucide-react";
import { Button, Card, Chip, Cover, Timeline } from "@/components/ui";
import { doorToDoorMinutes, friendlyDuration, placeLabel, planLabelFor, priceBand } from "@/lib/someTime/format";
import { trackSeen } from "@/components/trackExperience";
import type { Surface } from "@/lib/experience/events";
import type { TimeOption } from "@/lib/someTime/types";
import styles from "@/components/ExperienceCard.module.css";

export type FeedbackReason = "not_my_thing" | "too_far" | "too_expensive" | "seen_it";

const REASONS: { value: FeedbackReason; label: string }[] = [
  { value: "not_my_thing", label: "Not my thing" },
  { value: "too_far", label: "Too far" },
  { value: "too_expensive", label: "Too expensive" },
  { value: "seen_it", label: "Been there" },
];

const SETTING_LABEL = { outdoors: "Mostly outdoors", indoors: "Indoors" } as const;

type Props = {
  option: TimeOption;
  /** Why it suits this member, in a sentence. */
  reason: string;
  /** hero: the large card at the top of Today. result: one of the ideas in the sheet. */
  variant: "hero" | "result";
  /** Where it appears, and who it is for: noted when it is shown and opened. */
  surface: Surface;
  who?: string;
  state: "idle" | "planning" | "planned";
  error?: string | null;
  onPlan: () => void;
  /** Already on the member's Saved list when the card appears. */
  saved?: boolean;
  onSave: () => Promise<{ error: string | null }>;
  /** When given, tapping Saved again takes the idea off the list. */
  onUnsave?: () => Promise<{ error: string | null }>;
  onNotForMe: (reason: FeedbackReason) => void;
};

/**
 * One idea as an invitation: a picture, a title for the whole outing, the
 * essentials, why it suits you, the plan on request, and one obvious action.
 * Used both for the hero on Today and for each idea in "I've got some time", so
 * they always look and behave the same.
 */
export function ExperienceCard({ option, reason, variant, surface, who, state, error, saved: savedProp = false, onPlan, onSave, onUnsave, onNotForMe }: Props) {
  const planId = useId();

  // Noted once per visit: this idea was put in front of them.
  useEffect(() => {
    trackSeen("shown", option.id, surface, who);
  }, [option.id, surface, who]);
  const [planOpen, setPlanOpen] = useState(false);
  // Whether it was already saved when it appeared is remembered once: a parent that tracks the
  // list updates `saved` the moment a save succeeds, and that must not hide the acknowledgement.
  const [initiallySaved] = useState(savedProp);
  const [saved, setSaved] = useState<"idle" | "saved" | "removed">(initiallySaved ? "saved" : "idle");
  const [asking, setAsking] = useState(false);

  // Once planned, the plan is the confirmation, so it is shown.
  const showPlan = planOpen || state === "planned";

  const total = doorToDoorMinutes(option.leaveBy, option.homeBy);
  const meta = [
    placeLabel(option.address),
    total ? friendlyDuration(total) : null,
    priceBand(option.estimatedCost ?? option.priceEstimate),
    option.setting ? SETTING_LABEL[option.setting] : null,
  ].filter((m): m is string => Boolean(m));

  const summary = (
    <>
      Leave {option.leaveBy} · home about {option.homeBy}
      {option.estimatedCost ? ` · about £${option.estimatedCost} each` : ""}
    </>
  );

  const save = async () => {
    // Optimistic both ways: these are tiny, quickly-undone taps, put back if the server says no.
    if (saved === "saved") {
      if (!onUnsave) return;
      setSaved("removed");
      const result = await onUnsave();
      if (result.error) setSaved("saved");
      return;
    }
    setSaved("saved");
    const result = await onSave();
    if (result.error) setSaved("idle");
  };

  return (
    <Card padding="none" className={`ync-appear ${variant === "hero" ? styles.hero : ""}`}>
      <Cover category={option.category} image={option.image} ratio={variant === "hero" ? "wide" : "banner"} />
      <div className={styles.body}>
        {option.happeningToday && <p className={styles.onToday}>On today</p>}
        <h3 className={styles.title}>{option.experienceTitle}</h3>
        {meta.length > 0 && <p className={styles.meta}>{meta.join(" · ")}</p>}
        <p className={styles.reason}>{reason}</p>
        {option.checkWhatsOn && (
          <p className={styles.checkNote}>
            Check what&apos;s on before you go.
            {option.bookingUrl && (
              <>
                {" "}
                <a href={option.bookingUrl} target="_blank" rel="noopener noreferrer">
                  Their website
                </a>
              </>
            )}
          </p>
        )}

        <button
          type="button"
          className={styles.planToggle}
          aria-expanded={showPlan}
          aria-controls={planId}
          onClick={() => {
            if (!planOpen) trackSeen("opened", option.id, surface, who);
            setPlanOpen((v) => !v);
          }}
          disabled={state === "planned"}
        >
          {showPlan ? "Hide the plan" : "See the plan"}
          <ChevronDown className={styles.chevron} size={18} aria-hidden="true" />
        </button>
        <div id={planId} className={styles.planWrap} data-open={showPlan}>
          {/* inert while closed: hidden content must not be reachable by keyboard or screen reader */}
          <div className={styles.planInner} inert={!showPlan}>
            <div className={styles.planPad}>
              <Timeline stops={option.stops} legs={option.legs} summary={summary} />
            </div>
          </div>
        </div>

        <div className={styles.actions} aria-live="polite">
          {state === "planned" ? (
            <p className={styles.planned}>
              <Check size={18} strokeWidth={2.25} aria-hidden="true" /> Added to your day
            </p>
          ) : (
            <>
              <Button fullWidth loading={state === "planning"} onClick={onPlan}>
                {state === "planning" ? "Planning…" : planLabelFor(option.stops[0]?.time ?? option.arriveBy)}
              </Button>

              <div className={styles.secondary}>
                <button type="button" className={styles.save} aria-pressed={saved === "saved"} onClick={save}>
                  <Heart className={styles.heart} size={20} strokeWidth={1.75} fill={saved === "saved" ? "currentColor" : "none"} aria-hidden="true" />
                  {saved === "saved" ? "Saved" : "Save"}
                </button>
                <Button variant="quiet" size="sm" onClick={() => setAsking((v) => !v)} disabled={state === "planning"}>
                  Not for me
                </Button>
              </div>

              {saved === "saved" && !initiallySaved && <p className={styles.ack}>Saved. We will bring you more like this.</p>}
              {saved === "removed" && <p className={styles.ack}>Taken off your saved ideas.</p>}

              {asking && (
                <div className={styles.reasons}>
                  <p className={styles.reasonsLabel}>What was it about this one?</p>
                  <div className={styles.chips}>
                    {REASONS.map((r) => (
                      <Chip key={r.value} selected={false} onClick={() => onNotForMe(r.value)}>
                        {r.label}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Card>
  );
}
