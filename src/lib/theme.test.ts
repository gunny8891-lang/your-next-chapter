import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATEGORY_COLOR, T } from "@/lib/theme";

// WCAG 2.x relative luminance and contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;

describe("colour contrast (WCAG AA for text)", () => {
  const surfaces = { bg: T.bg, surface: T.surface } as const;

  it.each(Object.entries(surfaces))("body and supporting text read clearly on %s", (_name, background) => {
    expect(contrast(T.ink, background)).toBeGreaterThanOrEqual(AA);
    expect(contrast(T.inkSoft, background)).toBeGreaterThanOrEqual(AA);
  });

  it("text on the filled buttons reads clearly", () => {
    expect(contrast(T.surface, T.primary)).toBeGreaterThanOrEqual(AA);
    expect(contrast(T.surface, T.accent)).toBeGreaterThanOrEqual(AA);
  });

  it("the action and accent colours work as text and icons on the page and on cards", () => {
    for (const colour of [T.primary, T.accent, T.sage, T.mist]) {
      expect(contrast(colour, T.bg)).toBeGreaterThanOrEqual(AA);
      expect(contrast(colour, T.surface)).toBeGreaterThanOrEqual(AA);
    }
  });

  it("tinted backgrounds keep their text readable", () => {
    expect(contrast(T.ink, T.accentSoft)).toBeGreaterThanOrEqual(AA);
    expect(contrast(T.primary, T.sageSoft)).toBeGreaterThanOrEqual(AA);
    expect(contrast(T.primary, T.accentSoft)).toBeGreaterThanOrEqual(AA);
    // The plain accent is a hair under AA on its own tint (4.4:1), which is why accentInk exists.
    expect(contrast(T.accent, T.accentSoft)).toBeLessThan(AA);
    for (const background of [T.accentSoft, T.surface, T.bg]) {
      expect(contrast(T.accentInk, background)).toBeGreaterThanOrEqual(AA);
    }
    expect(contrast(T.error, T.errorSoft)).toBeGreaterThanOrEqual(AA);
    expect(contrast(T.mist, T.mistSoft)).toBeGreaterThanOrEqual(AA);
  });

  it.each(Object.entries(CATEGORY_COLOR))("the %s colour is readable as a text label on a card", (_category, colour) => {
    expect(contrast(colour, T.surface)).toBeGreaterThanOrEqual(AA);
  });

  it("documents why the light sage is decorative only", () => {
    // It fails as text; the app must use T.sage where a green has to carry words or icons.
    expect(contrast(T.primarySoft, T.surface)).toBeLessThan(AA);
  });
});

describe("tokens: CSS and TypeScript agree", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const cssColour = (name: string) => css.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1]?.toUpperCase();

  it.each([
    ["bg", T.bg],
    ["surface", T.surface],
    ["ink", T.ink],
    ["ink-soft", T.inkSoft],
    ["line", T.line],
    ["primary", T.primary],
    ["primary-soft", T.primarySoft],
    ["accent", T.accent],
    ["accent-soft", T.accentSoft],
    ["accent-ink", T.accentInk],
    ["sage", T.sage],
    ["sage-soft", T.sageSoft],
    ["mist", T.mist],
    ["mist-soft", T.mistSoft],
    ["error", T.error],
    ["error-soft", T.errorSoft],
  ])("--color-%s matches the TypeScript token", (name, value) => {
    expect(cssColour(name)).toBe(value.toUpperCase());
  });

  it("is light only, so no dark scheme fights the components' own colours", () => {
    expect(css).not.toMatch(/prefers-color-scheme:\s*dark/);
  });

  it("switches animation off for people who ask for reduced motion", () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it("sets readable body text", () => {
    expect(css).toMatch(/--text-body:\s*17px/);
    expect(css).toMatch(/--text-small:\s*15px/);
  });
});
