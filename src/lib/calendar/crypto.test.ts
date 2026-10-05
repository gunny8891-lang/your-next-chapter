import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "@/lib/calendar/crypto";
import { STATE_COOKIE, newState, stateMatches } from "@/lib/calendar/state";

const KEY = randomBytes(32).toString("base64");
const OTHER_KEY = randomBytes(32).toString("base64");
const TOKEN = "1//0gExampleRefreshTokenValue-abc_123";

describe("the stored credential", () => {
  it("comes back exactly as it went in", () => {
    expect(decryptToken(encryptToken(TOKEN, KEY), KEY)).toBe(TOKEN);
  });

  it("is not readable in what is stored", () => {
    const stored = encryptToken(TOKEN, KEY);
    expect(stored).not.toContain(TOKEN);
    expect(stored).not.toContain(TOKEN.slice(0, 10));
    expect(stored.startsWith("v1.")).toBe(true);
  });

  it("is stored differently every time, so equal credentials are not recognisable", () => {
    expect(encryptToken(TOKEN, KEY)).not.toBe(encryptToken(TOKEN, KEY));
  });

  it("cannot be opened with a different key", () => {
    expect(() => decryptToken(encryptToken(TOKEN, KEY), OTHER_KEY)).toThrow();
  });

  it("refuses a value that has been altered", () => {
    const [v, iv, tag, ct] = encryptToken(TOKEN, KEY).split(".");
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 1;
    expect(() => decryptToken([v, iv, tag, flipped.toString("base64url")].join("."), KEY)).toThrow();
    expect(() => decryptToken([v, iv, Buffer.alloc(16).toString("base64url"), ct].join("."), KEY)).toThrow();
  });

  it("refuses values it does not recognise", () => {
    expect(() => decryptToken("nonsense", KEY)).toThrow();
    expect(() => decryptToken("v2.a.b.c", KEY)).toThrow();
    expect(() => decryptToken("", KEY)).toThrow();
  });

  it("refuses a key of the wrong size rather than weakening", () => {
    expect(() => encryptToken(TOKEN, Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
    expect(() => encryptToken(TOKEN, "")).toThrow();
  });
});

describe("the anti-forgery value for the Google round trip", () => {
  it("is long, random and different each time", () => {
    const a = newState();
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(newState()).not.toBe(a);
  });

  it("matches only itself", () => {
    const s = newState();
    expect(stateMatches(s, s)).toBe(true);
    expect(stateMatches(s, newState())).toBe(false);
    expect(stateMatches(s, s + "x")).toBe(false);
  });

  it("never matches when either side is missing", () => {
    expect(stateMatches(undefined, "abc")).toBe(false);
    expect(stateMatches("abc", undefined)).toBe(false);
    expect(stateMatches(null, null)).toBe(false);
    expect(stateMatches("", "")).toBe(false);
  });

  it("uses a cookie name scoped to this feature", () => {
    expect(STATE_COOKIE).toMatch(/calendar/);
  });
});
