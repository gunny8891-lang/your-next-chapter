"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, Compass, MessageCircle, Sun, User } from "lucide-react";
import { activeTab, showsShell, TABS, type TabId } from "@/components/shell";
import { Wordmark } from "@/components/Wordmark";
import styles from "@/components/AppShell.module.css";

const TAB_ICON: Record<TabId, typeof Sun> = {
  today: Sun,
  week: CalendarDays,
  explore: Compass,
  chapter: BookOpen,
};

/**
 * The frame around the member screens: a quiet top bar (wordmark, concierge,
 * account) and the four destinations — a bottom tab bar on a phone, part of the
 * top bar on a larger screen. Purely presentational so it can be rendered on its
 * own; AppShell decides when to show it.
 */
export function ShellFrame({ active, children }: { active: TabId | null; children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.topbar}>
        <div className={styles.topInner}>
          <Link href="/today" className={styles.brand}>
            <Wordmark size={28} />
          </Link>

          <nav className={styles.tabs} aria-label="Main">
            {TABS.map((tab) => {
              const Icon = TAB_ICON[tab.id];
              return (
                <Link key={tab.id} href={tab.href} className={styles.tab} aria-current={active === tab.id ? "page" : undefined}>
                  <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className={styles.actions}>
            <Link href="/chat" className={styles.iconLink} aria-label="Concierge">
              <MessageCircle size={22} strokeWidth={1.75} aria-hidden="true" />
              <span className={styles.iconLabel}>Concierge</span>
            </Link>
            <Link href="/account" className={styles.iconLink} aria-label="Account">
              <User size={22} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className={styles.main}>
        {children}
      </main>
    </div>
  );
}

/** Wraps the member screens in the navigation; leaves the landing, sign-in, onboarding and admin pages alone. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (!showsShell(pathname)) return <>{children}</>;
  return <ShellFrame active={activeTab(pathname)}>{children}</ShellFrame>;
}
