import { ImageResponse } from "next/og";
import { LarkMark } from "@/lib/brand/mark";

// The picture a link to Lark Hour shows when it is shared in a message or on social media.
export const alt = "Lark Hour: you have time. Here's something good to do with it.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 96px",
          background: "#F5F2EB",
          color: "#2B2F2A",
        }}
      >
        <LarkMark size={240} />
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 64 }}>
          <div style={{ fontSize: 88, fontWeight: 700, color: "#2F4A3C", letterSpacing: -2 }}>Lark Hour</div>
          <div style={{ fontSize: 40, marginTop: 16, color: "#5A6258", maxWidth: 680, lineHeight: 1.3 }}>
            You have time. Here&apos;s something good to do with it.
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
