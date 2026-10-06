/**
 * The Lark Hour mark: a lark rising from behind a hill at sunrise (the lark sings at first
 * light), in the app's own forest green, cream and terracotta. One drawing serves every
 * place the product shows itself outside the app: the browser tab, the phone's home
 * screen, and the picture a link shows when it is shared. Drawn on a 100 x 100 grid so it
 * scales cleanly.
 *
 * `bleed` fills the whole square (for the home-screen icons, where the phone rounds the
 * corners itself, and for the "maskable" icon, where the phone may crop it to a circle).
 * Everything that matters stays well inside the middle 80% so a crop never cuts it.
 */

export const MARK_COLORS = {
  ground: "#2F4A3C",
  hill: "#52705B",
  bird: "#F5F2EB",
  sun: "#D98C68",
} as const;

export function LarkMark({ size, bleed = false }: { size: number; bleed?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <rect width="100" height="100" rx={bleed ? 0 : 22} fill={MARK_COLORS.ground} />
      {/* The sun, low on the left, half hidden by the hill. */}
      <circle cx="37" cy="68" r="19" fill={MARK_COLORS.sun} />
      {/* The hill. */}
      <path d="M0 74 C22 64 44 66 62 72 C76 76 88 72 100 66 L100 100 L0 100 Z" fill={MARK_COLORS.hill} />
      {/* The lark, rising up and to the right: two raised wings and a small body. */}
      <path d="M64 44 C60 33 50 28 41 29 C49 33 55 39 58 49 Z" fill={MARK_COLORS.bird} />
      <path d="M64 44 C68 33 78 28 87 29 C79 33 73 39 70 49 Z" fill={MARK_COLORS.bird} />
      <ellipse cx="64" cy="49" rx="4.2" ry="6" fill={MARK_COLORS.bird} />
    </svg>
  );
}
