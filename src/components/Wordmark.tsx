import { LarkMark } from "@/lib/brand/mark";

/**
 * The mark and the name together, for every place the product signs itself on a page.
 * It renders the two as siblings: the caller's "brand" style lays them out in a row (flex,
 * centred, with a gap). The picture is decoration, hidden from screen readers, so the
 * link or heading it sits in is still announced simply as "Lark Hour".
 */
export function Wordmark({ size = 32 }: { size?: number }) {
  return (
    <>
      <span aria-hidden="true" style={{ display: "inline-flex", flexShrink: 0 }}>
        <LarkMark size={size} />
      </span>
      <span>Lark Hour</span>
    </>
  );
}
