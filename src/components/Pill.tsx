import type { ReactNode } from "react";

export function Pill({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.3,
        color,
        background: color + "1A",
        borderRadius: 999,
        padding: "4px 10px",
      }}
    >
      {children}
    </span>
  );
}
