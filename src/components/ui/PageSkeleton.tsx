import { Page } from "@/components/ui/Page";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Shown while a screen is being put together, shaped like the real thing (a heading,
 * a line under it, then a list) so nothing jumps when the content arrives. Announced
 * to screen readers as loading.
 */
export function PageSkeleton({ label, rows = 4 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      <Page>
        <Skeleton height={38} width="45%" radius={10} />
        <div style={{ marginTop: 12, marginBottom: 32 }}>
          <Skeleton height={18} width="70%" />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} style={{ display: "grid", gap: 10, padding: "20px 0", borderTop: "1px solid var(--color-line)" }}>
            <Skeleton height={22} width={i % 2 === 0 ? "65%" : "50%"} />
            <Skeleton height={16} width="40%" />
          </div>
        ))}
      </Page>
    </div>
  );
}
