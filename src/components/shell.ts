/**
 * Where the app's navigation shows, and which tab is current. Plain functions so
 * they can be tested; AppShell just applies them.
 *
 * Four destinations are enough: Today, My Week, Explore, My Chapter. People
 * lives inside My Chapter (it is about the people in the member's chapter), and
 * the concierge and account sit in the header rather than the tab bar, so the
 * product never reads as a chatbot or a settings panel.
 */

export type TabId = "today" | "week" | "explore" | "chapter";

export const TABS: { id: TabId; href: string; label: string }[] = [
  { id: "today", href: "/today", label: "Today" },
  { id: "week", href: "/week", label: "My Week" },
  { id: "explore", href: "/explore", label: "Explore" },
  { id: "chapter", href: "/chapter", label: "My Chapter" },
];

// Signed-in member screens. The landing page, sign-in, onboarding and the admin
// tools have their own full-page layouts and get no member navigation.
const SHELL_ROUTES = ["/today", "/week", "/explore", "/chapter", "/people", "/chat", "/account"];

const under = (pathname: string, route: string) => pathname === route || pathname.startsWith(`${route}/`);

export function showsShell(pathname: string): boolean {
  return SHELL_ROUTES.some((route) => under(pathname, route));
}

export function activeTab(pathname: string): TabId | null {
  if (under(pathname, "/today")) return "today";
  if (under(pathname, "/week")) return "week";
  if (under(pathname, "/explore")) return "explore";
  // People is part of My Chapter, so that tab stays lit there.
  if (under(pathname, "/chapter") || under(pathname, "/people")) return "chapter";
  return null;
}
