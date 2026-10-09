import { describe, expect, it, vi } from "vitest";
import { gateDecision, loginUrl } from "./gate";
import {
  afterFailure,
  attemptsLeft,
  clientIp,
  formatLockRemaining,
  LOCK_MS,
  lockRemainingMs,
  MAX_ATTEMPTS,
} from "./lockout";
import { safeNextPath } from "./next-path";
import {
  clearedSessionCookie,
  cookieSecureFor,
  createSessionToken,
  SESSION_MAX_AGE_S,
  SESSION_ONLY_TOKEN_S,
  sessionCookie,
  verifySessionToken,
} from "./session";

describe("gate: logged out", () => {
  it.each(["/", "/explore", "/c/icml-2026", "/j/jmlr", "/insights", "/workspace", "/sources"])(
    "redirects page %s to /login with next",
    (path) => {
      const d = gateDecision(path, "", false);
      expect(d.action).toBe("redirect");
      if (d.action === "redirect")
        expect(d.location).toBe(
          path === "/" ? "/login" : `/login?next=${encodeURIComponent(path)}`,
        );
    },
  );

  it("keeps the query string in next", () => {
    expect(gateDecision("/explore", "?tab=journals&q=nlp", false)).toEqual({
      action: "redirect",
      location: `/login?next=${encodeURIComponent("/explore?tab=journals&q=nlp")}`,
    });
  });

  it.each(["/api/events", "/api/journals", "/api/chat", "/api/workspace/notes"])(
    "answers 401 for API %s",
    (path) => expect(gateDecision(path, "", false)).toEqual({ action: "unauthorized" }),
  );

  it.each([
    "/login",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/session",
    "/api/ingest",
    "/api/revalidate",
    "/api/workspace/ics",
  ])("lets public route %s through", (path) =>
    expect(gateDecision(path, "", false)).toEqual({ action: "next" }),
  );

  it("sends the old /unlock URL to /login", () => {
    expect(gateDecision("/unlock", "?next=/workspace", false)).toEqual({
      action: "redirect",
      location: "/login?next=%2Fworkspace",
    });
  });
});

describe("gate: logged in", () => {
  it("lets every route through", () => {
    for (const p of ["/", "/explore", "/api/events", "/workspace"])
      expect(gateDecision(p, "", true)).toEqual({ action: "next" });
  });

  it("lets a signed-in visitor see /login (it resumes the saved sign-in)", () => {
    expect(gateDecision("/login", "?next=/j/jmlr", true)).toEqual({ action: "next" });
  });
});

describe("gate: every fresh entry starts on /login", () => {
  it("sends typed URLs, bookmarks and new tabs to /login, signed in or not", () => {
    for (const hasSession of [true, false]) {
      expect(gateDecision("/", "", hasSession, true)).toEqual({
        action: "redirect",
        location: "/login",
      });
      expect(gateDecision("/explore", "?tab=journals", hasSession, true)).toEqual({
        action: "redirect",
        location: `/login?next=${encodeURIComponent("/explore?tab=journals")}`,
      });
    }
  });

  it("leaves in-app navigation, /login itself, APIs and public routes alone", () => {
    expect(gateDecision("/explore", "", true, false)).toEqual({ action: "next" });
    expect(gateDecision("/login", "", true, true)).toEqual({ action: "next" });
    expect(gateDecision("/api/events", "", true, true)).toEqual({ action: "next" });
    expect(gateDecision("/api/ingest", "", false, true)).toEqual({ action: "next" });
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/explore?tab=journals", "/explore?tab=journals"],
    ["/c/icml-2026#cfp", "/c/icml-2026#cfp"],
    ["", "/"],
    [null, "/"],
    ["https://evil.example/", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["\\\\evil.example", "/"],
    ["javascript:alert(1)", "/"],
    ["/%0d%0aSet-Cookie:x", "/%0d%0aSet-Cookie:x"],
    ["/explore\n", "/explore"],
    ["/ex\u0000plore", "/"],
    ["/login?next=/x", "/"],
    ["/api/events", "/"],
    ["explore", "/"],
  ])("%j → %j", (input, expected) => expect(safeNextPath(input)).toBe(expected));

  it("never produces an off-site URL", () => {
    expect(loginUrl("//evil.example")).toBe("/login");
  });
});

describe("lockout", () => {
  const t0 = new Date("2026-10-09T12:00:00Z");
  const at = (ms: number) => new Date(t0.getTime() + ms);

  it("locks on the 5th failure for 15 minutes", () => {
    let rec = null;
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      rec = afterFailure(rec, at(i * 1000));
      expect(lockRemainingMs(rec, at(i * 1000))).toBe(0);
      expect(attemptsLeft(rec)).toBe(MAX_ATTEMPTS - i);
    }
    rec = afterFailure(rec, at(5000));
    expect(lockRemainingMs(rec, at(5000))).toBe(LOCK_MS);
    expect(lockRemainingMs(rec, at(5000 + LOCK_MS - 1000))).toBe(1000);
    expect(lockRemainingMs(rec, at(5000 + LOCK_MS))).toBe(0);
  });

  it("starts fresh after the lock expires", () => {
    let rec = null;
    for (let i = 0; i < MAX_ATTEMPTS; i++) rec = afterFailure(rec, t0);
    const after = afterFailure(rec, at(LOCK_MS + 1));
    expect(after.failures).toBe(1);
    expect(after.lockedUntil).toBeNull();
  });

  it("forgets old failures after a quiet 15 minutes", () => {
    const rec = afterFailure(afterFailure(null, t0), t0);
    expect(afterFailure(rec, at(LOCK_MS + 1)).failures).toBe(1);
  });

  it("formats the countdown", () => {
    expect(formatLockRemaining(LOCK_MS)).toBe("15:00");
    expect(formatLockRemaining(61_000)).toBe("1:01");
    expect(formatLockRemaining(400)).toBe("0:01");
  });

  it("reads the client IP from the first forwarded hop", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe(
      "203.0.113.7",
    );
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("local");
  });
});

describe("session cookie", () => {
  it("remember me → 30-day Max-Age; otherwise a browser-session cookie", () => {
    const remembered = sessionCookie("tok", { remember: true, secure: true });
    expect(remembered).toContain(`Max-Age=${SESSION_MAX_AGE_S}`);
    expect(remembered).toMatch(/HttpOnly/);
    expect(remembered).toMatch(/SameSite=Lax/);
    expect(remembered).toMatch(/Secure/);
    const session = sessionCookie("tok", { remember: false, secure: true });
    expect(session).not.toMatch(/Max-Age/);
    expect(session).not.toMatch(/Expires/);
    expect(clearedSessionCookie(true)).toMatch(/Max-Age=0/);
  });

  it("is Secure on https and localhost only", () => {
    expect(cookieSecureFor("https://findress.vercel.app/api/auth/login")).toBe(true);
    expect(cookieSecureFor("http://localhost:3000/api/auth/login")).toBe(true);
    expect(cookieSecureFor("http://192.168.1.5:3000/api/auth/login")).toBe(false);
  });

  it("tokens expire: 30 days with remember me, 24 h without", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-09T00:00:00Z"));
      const long = await createSessionToken("s3cret", SESSION_MAX_AGE_S);
      const short = await createSessionToken("s3cret", SESSION_ONLY_TOKEN_S);
      vi.setSystemTime(new Date("2026-10-10T00:00:01Z"));
      expect(await verifySessionToken(short, "s3cret")).toBe(false);
      expect(await verifySessionToken(long, "s3cret")).toBe(true);
      vi.setSystemTime(new Date("2026-11-08T00:00:01Z"));
      expect(await verifySessionToken(long, "s3cret")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a token signed with another secret", async () => {
    const tok = await createSessionToken("one");
    expect(await verifySessionToken(tok, "two")).toBe(false);
  });
});
