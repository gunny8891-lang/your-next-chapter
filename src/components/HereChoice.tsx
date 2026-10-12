"use client";

import { useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import { GEOLOCATION_UNSUPPORTED, geolocationMessage } from "@/lib/geo/hereMessages";
import styles from "@/components/HereChoice.module.css";

export type Here = { lat: number; lng: number };

/**
 * "Near where I am now": ideas measured from the device's position instead of from home, for when someone is out, or away.
 * The position is asked for only when this is tapped, is held in the screen's state for this search, and is never saved.
 */
export function HereChoice({ here, onChange }: { here: Here | null; onChange: (here: Here | null) => void }) {
  const [finding, setFinding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const find = () => {
    setProblem(null);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setProblem(GEOLOCATION_UNSUPPORTED);
      return;
    }
    setFinding(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFinding(false);
        onChange({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      (error) => {
        setFinding(false);
        setProblem(geolocationMessage(error.code));
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
    );
  };

  if (here) {
    return (
      <p className={styles.line}>
        <MapPin size={16} aria-hidden="true" /> Near where you are now ·{" "}
        <button type="button" className={styles.link} onClick={() => onChange(null)}>
          Back to home
        </button>
      </p>
    );
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.button} onClick={find} disabled={finding}>
        <LocateFixed size={16} aria-hidden="true" /> {finding ? "Finding where you are…" : "Near where I am now"}
      </button>
      {problem && (
        <p className={styles.problem} role="status">
          {problem}
        </p>
      )}
    </div>
  );
}
