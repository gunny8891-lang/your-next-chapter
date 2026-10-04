/**
 * Design tokens, as plain values for the screens that still style inline.
 *
 * The same values live as CSS variables in globals.css (a test keeps the two in
 * step), so new components written with CSS can use var(--color-ink) while older
 * ones keep using T.ink. One palette, two ways to reach it.
 *
 * Contrast (checked in theme.test.ts): ink and inkSoft pass AA on bg and surface;
 * text on primary, accent and sage passes AA. primarySoft is DECORATIVE ONLY —
 * fills and borders — it is too light to carry text.
 */
export const T = {
  /** Warm stone page background. */
  bg: "#F5F2EB",
  /** Cards and sheets: a warm white, never clinical. */
  surface: "#FDFBF7",
  /** Charcoal, not black. */
  ink: "#2B2F2A",
  inkSoft: "#5A6258",
  line: "#E3DDD0",
  /** Forest green: the main action colour. */
  primary: "#2F4A3C",
  /** Light sage. Decorative only (fills, borders): fails contrast as text. */
  primarySoft: "#7C9A82",
  /** Muted clay: the single warm accent, used sparingly for the one thing to do next. */
  accent: "#A25437",
  accentSoft: "#F2E4DA",
  /** The accent, darkened enough to read as text on its own tint (accent on accentSoft is 4.4:1). */
  accentInk: "#8F4830",
  /** A sage that is dark enough to use for text and icons. */
  sage: "#52705B",
  sageSoft: "#E4EBE2",
  /** Muted blue, for secondary information. */
  mist: "#4C6879",
  mistSoft: "#E3EBF0",
  /** Errors: the clay family, deeper, so they read as care rather than alarm. */
  error: "#9A3B22",
  errorSoft: "#F6E6DF",
} as const;

/**
 * Category colours, used as text and icon colours on the surface, so each is
 * dark enough for AA there.
 */
export const CATEGORY_COLOR: Record<string, string> = {
  Move: "#3E6B52",
  Connect: "#8A5A3B",
  Learn: "#4A5C8A",
  Explore: "#8F6420",
  "Give Back": "#7A4A6B",
  Wellness: "#4E6E5F",
  Joy: "#A4502B",
};

/** The fonts are loaded in the root layout and exposed as CSS variables. */
export const FONT = {
  display: "var(--font-display), Georgia, serif",
  sans: "var(--font-sans), system-ui, sans-serif",
} as const;

/** A 4-point spacing scale. */
export const SPACE = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;

export const RADIUS = { control: 10, card: 14, pill: 999 } as const;
