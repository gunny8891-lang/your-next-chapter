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
  title: "Your Next Chapter",
  description: "An AI-powered retirement concierge — a personalised weekly plan of activities, people, and places.",
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
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
