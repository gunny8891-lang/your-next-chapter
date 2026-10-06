import { ImageResponse } from "next/og";
import { LarkMark } from "@/lib/brand/mark";

/**
 * The icons named in the web app manifest (manifest.ts): 192 and 512 pixels, plus a
 * "maskable" 512 that fills the whole square so a phone can crop it to any shape.
 */
const ICONS: Record<string, { px: number; bleed: boolean }> = {
  "192": { px: 192, bleed: false },
  "512": { px: 512, bleed: false },
  maskable: { px: 512, bleed: true },
};

export function generateStaticParams() {
  return Object.keys(ICONS).map((size) => ({ size }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const icon = ICONS[size];
  if (!icon) return new Response("Not found", { status: 404 });
  return new ImageResponse(<LarkMark size={icon.px} bleed={icon.bleed} />, { width: icon.px, height: icon.px });
}
