import { describe, expect, it, vi } from "vitest";
import { labelSlug, milestoneUids } from "@/lib/data/milestones";
import type { WorkspaceItem } from "@/lib/data/workspace";

// feedback F08: one calendar entry per milestone, keyed by its identity, not by its time.
const state = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock("@/lib/auth/owner", () => ({ icsFeedToken: async () => "fixture-token" }));
vi.mock("@/lib/auth/session", () => ({ isOwnerRequest: async () => true }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/data/workspace", () => ({ listWorkspace: async () => state.items }));
import { GET } from "@/app/api/workspace/ics/route";

const item = (over: Partial<WorkspaceItem>): Partial<WorkspaceItem> => ({
  status: "interested",
  year: 2027,
  deadlines: [],
  ...over,
});
const dl = (dueAtUtc: string, extra: object = {}) => ({
  kind: "paper",
  label: null,
  dueAtUtc,
  originalTz: null,
  ...extra,
});
async function calendar(items: Partial<WorkspaceItem>[]) {
  state.items = items;
  const text = await (await GET(new Request("https://findress.test/api/workspace/ics"))).text();
  return {
    text,
    uids: [...text.matchAll(/^UID:(.+)$/gm)].map((m) => m[1].trim()),
  };
}

describe("workspace calendar (F08)", () => {
  it("keeps two unrelated events whose deadlines fall at the same moment", async () => {
    const { text, uids } = await calendar(
      ["AAA", "BBB"].map((acronym, i) =>
        item({
          key: `event:${i + 1}`,
          kind: "event",
          targetId: i + 1,
          acronym,
          href: `/c/${acronym.toLowerCase()}-2027`,
          deadlines: [dl("2027-01-20T12:00:00Z")],
        }),
      ),
    );
    expect(uids).toEqual(["event-1-paper@findress", "event-2-paper@findress"]);
    expect(text).toContain("AAA 2027");
    expect(text).toContain("BBB 2027");
  });

  it("a special issue bookmarked directly and via its journal is one entry", async () => {
    const call = dl("2027-03-01T23:59:59Z", { label: "Special issue: LLMs", specialIssueId: 7 });
    const { uids } = await calendar([
      item({
        key: "journal:3",
        kind: "journal",
        targetId: 3,
        acronym: "TPAMI",
        href: "/j/tpami",
        deadlines: [call],
      }),
      item({
        key: "special:7",
        kind: "special",
        targetId: 7,
        acronym: "TPAMI",
        href: "/j/tpami#si-7",
        deadlines: [call],
      }),
    ]);
    expect(uids).toEqual(["special-7-paper-special-issue-llms@findress"]);
  });

  it("skips rejected items", async () => {
    const { uids } = await calendar([
      item({
        key: "event:1",
        kind: "event",
        targetId: 1,
        acronym: "X",
        href: "/c/x",
        status: "rejected",
        deadlines: [dl("2027-01-01T00:00:00Z")],
      }),
    ]);
    expect(uids).toEqual([]);
  });
});

describe("milestoneUids", () => {
  it("is the same after an extension (no time in the UID)", () => {
    const before = milestoneUids("event-1", [dl("2027-01-20T12:00:00Z")]);
    const after = milestoneUids("event-1", [dl("2027-01-27T12:00:00Z")]);
    expect(after).toEqual(before);
  });

  it("separates labelled rounds and numbers unlabelled repeats in date order", () => {
    const uids = milestoneUids("event-1", [
      dl("2027-05-01T00:00:00Z"),
      dl("2027-01-01T00:00:00Z", { label: "Cycle 1" }),
      dl("2027-04-01T00:00:00Z", { label: "Cycle 2" }),
      dl("2027-02-01T00:00:00Z"),
    ]);
    expect(uids).toEqual([
      "event-1-paper-2@findress",
      "event-1-paper-cycle-1@findress",
      "event-1-paper-cycle-2@findress",
      "event-1-paper@findress",
    ]);
  });

  it("slugs labels safely", () => {
    expect(labelSlug("Round 2 (Feb) — Résumé")).toBe("round-2-feb-resume");
    expect(labelSlug(null)).toBe("");
  });
});
