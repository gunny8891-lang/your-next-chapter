import { ImageResponse } from "next/og";
import { LarkMark } from "@/lib/brand/mark";

// The icon a phone uses when the site is added to its home screen. The phone rounds the corners.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<LarkMark size={180} bleed />, { ...size });
}
