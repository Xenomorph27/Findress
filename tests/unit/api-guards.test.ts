import { beforeEach, describe, expect, it, vi } from "vitest";

// feedback broader #3: the read routes check the owner session themselves (not only the proxy),
// and never let a shared cache keep their answers.
const auth = vi.hoisted(() => ({ owner: false }));
vi.mock("@/lib/auth/session", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/session")>();
  // Signed out: the real check (no cookie on the test request). Signed in: let the request through.
  return { ...real, ownerOnly: async (r: Request) => (auth.owner ? null : real.ownerOnly(r)) };
});
vi.mock("@/lib/data/events", () => ({
  withDbFallback: async <T>(_fallback: T, fn: () => Promise<T>) => ({ data: await fn() }),
  getExplorerRows: async () => [],
  searchEventIds: async () => [],
  getEventDetail: async () => ({
    id: 1,
    slug: "x-2027",
    acronym: "X",
    year: 2027,
    deadlines: [],
  }),
}));
vi.mock("@/lib/data/event-ics", () => ({ eventToIcsItems: () => [] }));
vi.mock("@/lib/data/journals", () => ({
  getJournalRows: async () => [],
  getSpecialIssueRows: async () => [],
  getJournalDetail: async () => ({ id: 1, slug: "j", abbreviation: "J", specialIssues: [] }),
}));

import { GET as events } from "@/app/api/events/route";
import { GET as event } from "@/app/api/events/[slug]/route";
import { GET as eventIcs } from "@/app/api/events/[slug]/ics/route";
import { GET as journals } from "@/app/api/journals/route";
import { GET as journal } from "@/app/api/journals/[slug]/route";
import { GET as journalIcs } from "@/app/api/journals/[slug]/ics/route";

const req = () => new Request("https://findress.test/api/x");
const ctx = { params: Promise.resolve({ slug: "x" }) } as never;
const routes: Array<[string, () => Promise<Response>]> = [
  ["/api/events", () => events(req())],
  ["/api/events/[slug]", () => event(req(), ctx)],
  ["/api/events/[slug]/ics", () => eventIcs(req(), ctx)],
  ["/api/journals", () => journals(req())],
  ["/api/journals/[slug]", () => journal(req(), ctx)],
  ["/api/journals/[slug]/ics", () => journalIcs(req(), ctx)],
];

describe("read API routes are owner-only", () => {
  beforeEach(() => {
    auth.owner = false;
  });

  it.each(routes)("%s answers 401 without a session", async (_name, call) => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it.each(routes)("%s is private and uncached for the owner", async (_name, call) => {
    auth.owner = true;
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
