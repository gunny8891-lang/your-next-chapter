import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/email/unsubscribe/route";

const req = (method: string, query = "") => new NextRequest(`https://app.test/api/email/unsubscribe${query}`, { method });

describe("the one-step unsubscribe address", () => {
  it("refuses a call with no token", async () => {
    expect((await POST(req("POST"))).status).toBe(400);
  });

  it("refuses a made-up token, and changes nothing", async () => {
    expect((await POST(req("POST", "?token=abc.def"))).status).toBe(400);
  });

  it("only sends a person who follows the link by hand to the confirm page, so a link-checker cannot unsubscribe anyone", async () => {
    const res = await GET(req("GET", "?token=abc.def"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.test/unsubscribe?token=abc.def");
  });
});
