import { describe, expect, it } from "vitest";
import { isStillAvailable } from "@/lib/opportunities/availability";

const NOW = new Date("2026-10-02T12:00:00Z");

describe("isStillAvailable", () => {
  it("keeps standing venues and groups with no dates", () => {
    expect(isStillAvailable({ date_time: null, expires_at: null }, NOW)).toBe(true);
  });

  it("drops a one-off event once it has started", () => {
    expect(isStillAvailable({ date_time: "2026-10-01T10:30:00Z", expires_at: null }, NOW)).toBe(false);
  });

  it("keeps a one-off event that is still to come", () => {
    expect(isStillAvailable({ date_time: "2026-10-03T10:30:00Z", expires_at: null }, NOW)).toBe(true);
  });

  it("keeps an ongoing item whose sample date has passed but whose run has not ended", () => {
    expect(isStillAvailable({ date_time: "2026-09-29T11:30:00Z", expires_at: "2026-11-01T23:59:59Z" }, NOW)).toBe(true);
  });

  it("drops an ongoing item once its run has ended", () => {
    expect(isStillAvailable({ date_time: null, expires_at: "2026-10-01T23:59:59Z" }, NOW)).toBe(false);
  });
});
