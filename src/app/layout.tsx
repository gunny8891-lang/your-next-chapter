import type { Metadata, Viewport } from "next";
import { Geist, Fraunces } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

// Geist carries the interface: clean, highly legible, contemporary.
const sans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Fraunces carries the editorial moments (headings, titles): warm, soft, human.
const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Each screen names itself ("My week · Your Next Chapter"): that is what the browser tab, history and a screen reader announce.
  title: { default: "Your Next Chapter", template: "%s · Your Next Chapter" },
  description: "You have time. Here's something good to do with it: ideas for the time you have, planned from door to home again.",
};

export const viewport: Viewport = {
  // Lets the bottom tab bar sit above a phone's home indicator (env(safe-area-inset-bottom)).
  viewportFit: "cover",
  themeColor: "#F5F2EB",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB" className={`${sans.variable} ${display.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
