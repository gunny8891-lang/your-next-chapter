import { Card, Skeleton } from "@/components/ui";
import styles from "@/components/Today.module.css";

/**
 * Shown while Today is being put together, shaped like the real page (greeting,
 * the day, the button, the hero) so nothing jumps when the content arrives.
 */
export default function Loading() {
  return (
    <div className={styles.page} role="status" aria-busy="true" aria-label="Loading your day">
      <Skeleton height={38} width="62%" radius={10} />
      <div style={{ marginTop: 12 }}>
        <Skeleton height={18} width="48%" />
      </div>

      <section className={styles.section}>
        <div style={{ marginBottom: 12 }}>
          <Skeleton height={13} width={72} />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: 16, padding: "16px 0", borderTop: "1px solid var(--color-line)" }}>
            <Skeleton height={16} width={56} />
            <Skeleton height={20} width={i === 0 ? "70%" : "30%"} />
          </div>
        ))}
        <div className={styles.cta}>
          <Skeleton height={48} radius={10} />
        </div>
      </section>

      <section className={styles.section}>
        <div style={{ marginBottom: 12 }}>
          <Skeleton height={13} width={110} />
        </div>
        <Card padding="none">
          <Skeleton height={190} radius={0} />
          <div style={{ padding: 20, display: "grid", gap: 12 }}>
            <Skeleton height={26} width="75%" />
            <Skeleton height={14} width="55%" />
            <Skeleton height={16} />
            <Skeleton height={16} width="80%" />
          </div>
        </Card>
      </section>
    </div>
  );
}
