"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { showsShell } from "@/components/shell";

/**
 * The error and not-found pages appear both inside the signed-in frame (which
 * already provides the page's single <main>) and outside it (a bad link, say).
 * This adds the landmark only where it is missing, so there is always exactly one.
 */
export function MainLandmark({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return showsShell(pathname) ? <>{children}</> : <main>{children}</main>;
}
