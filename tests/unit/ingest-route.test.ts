import { beforeEach, describe, expect, it, vi } from "vitest";

// feedback F06: the ingest API's HTTP status tells the scheduled job whether ingestion worked.
const state = vi.hoisted(() => ({
  reports: [] as unknown[],
  busy: false,
  crash: null as Error | null,
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/auth/cron", () => ({ hasCronSecret: () => true }));
vi.mock("@/lib/auth/session", () => ({ isOwnerRequest: async () => true }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/ingest/run", async () => {
  class IngestionBusyError extends Error {}
  return {
    IngestionBusyError,
    parseSteps: () => ["merge"],
    runIngestion: async () => {
      if (state.busy) throw new IngestionBusyError("another run");
      if (state.crash) throw state.crash;
      return state.reports;
    },
  };
});
import { GET } from "@/app/api/ingest/route";

const call = () => GET(new Request("https://findress.test/api/ingest?source=merge"));
const report = (ok: boolean) => ({
  step: "merge",
  ok,
  items: 0,
  durationMs: 1,
  stats: {},
  warnings: [],
  ...(ok ? {} : { error: "fixture failure" }),
});

describe("/api/ingest status", () => {
  beforeEach(() => {
    state.busy = false;
    state.crash = null;
  });

  it("is 200 when every step is ok", async () => {
    state.reports = [report(true), report(true)];
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("is 500 (with every report) when any step failed", async () => {
    state.reports = [report(true), report(false)];
    const res = await call();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reports).toHaveLength(2);
  });

  // The outage after PR #7: every call failed before any step with an empty 500 body.
  it("is 500 with the reason when the run cannot start", async () => {
    state.crash = new Error("Failed query: insert into ingest_lease", {
      cause: new Error('relation "ingest_lease" does not exist'),
    });
    const res = await call();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/relation "ingest_lease" does not exist/);
  });

  it("is 409 when another run holds the lease", async () => {
    state.busy = true;
    const res = await call();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, skipped: true });
  });
});
