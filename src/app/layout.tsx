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

const DESCRIPTION = "You have time. Here's something good to do with it: ideas for the time you have, planned from door to home again.";

export const metadata: Metadata = {
  // Makes the share image and other links in the page head absolute web addresses.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.larkhour.com"),
  // Each screen names itself ("My week · Lark Hour"): that is what the browser tab, history and a screen reader announce.
  title: { default: "Lark Hour", template: "%s · Lark Hour" },
  description: DESCRIPTION,
  applicationName: "Lark Hour",
  openGraph: { type: "website", siteName: "Lark Hour", locale: "en_GB", title: "Lark Hour", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "Lark Hour", description: DESCRIPTION },
  // Opened from the home screen it looks like an app, with its own name under the icon.
  appleWebApp: { capable: true, title: "Lark Hour", statusBarStyle: "default" },
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
