import { ImageResponse } from "next/og";
import { LarkMark } from "@/lib/brand/mark";

// The browser-tab icon.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<LarkMark size={64} />, { ...size });
}
