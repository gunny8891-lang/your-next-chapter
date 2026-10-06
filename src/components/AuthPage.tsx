import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import { Wordmark } from "@/components/Wordmark";
import styles from "@/components/AuthPage.module.css";

/**
 * The frame for signing up, logging in and resetting a password: the wordmark, a
 * heading, and a quiet card. One layout so the four pages feel like one place.
 */
export function AuthPage({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          <Wordmark size={40} />
        </Link>
        <Card padding="lg" className={`${styles.card} ync-appear`}>
          <h1 className={styles.title}>{title}</h1>
          {lead && <p className={styles.lead}>{lead}</p>}
          {children}
        </Card>
        <nav aria-label="Legal" className={styles.legal}>
          <Link href="/privacy">Privacy notice</Link>
          <Link href="/terms">Terms of use</Link>
        </nav>
      </div>
    </main>
  );
}

/** The small links under a form ("Forgot your password?"). */
export function AuthLinks({ children }: { children: ReactNode }) {
  return <div className={styles.links}>{children}</div>;
}

/** One such link, with a 44px-tall target. */
export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={styles.link}>
      {children}
    </Link>
  );
}
