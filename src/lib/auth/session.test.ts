import { describe, expect, it } from "vitest";
import { createSessionToken, passwordMatches, verifySessionToken } from "./session";

describe("owner session", () => {
  it("signs and verifies tokens", async () => {
    const t = await createSessionToken("secret-a");
    expect(await verifySessionToken(t, "secret-a")).toBe(true);
    expect(await verifySessionToken(t, "secret-b")).toBe(false);
  });

  it("rejects tampered, expired and malformed tokens", async () => {
    const t = await createSessionToken("s");
    const [payload, sig] = t.split(".");
    const forged = `${btoa(JSON.stringify({ exp: 9_999_999_999 })).replace(/=+$/, "")}.${sig}`;
    expect(await verifySessionToken(forged, "s")).toBe(false);
    expect(await verifySessionToken(`${payload}.${sig.slice(0, -2)}xx`, "s")).toBe(false);
    expect(await verifySessionToken(await createSessionToken("s", -10), "s")).toBe(false);
    expect(await verifySessionToken("garbage", "s")).toBe(false);
    expect(await verifySessionToken(undefined, "s")).toBe(false);
    expect(await verifySessionToken(t, undefined)).toBe(false);
  });

  it("compares passwords", async () => {
    expect(await passwordMatches("quasar-orbit", "quasar-orbit")).toBe(true);
    expect(await passwordMatches("quasar-orbi", "quasar-orbit")).toBe(false);
    expect(await passwordMatches("x", undefined)).toBe(false);
  });
});
