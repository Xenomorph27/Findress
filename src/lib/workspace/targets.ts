import { z } from "zod";

/**
 * What a bookmark, note or chat can point at. Client-safe (no DB imports): the key format
 * "<kind>:<id>" is shared by the bookmark store, the Kanban and the API.
 */
export const TARGET_KINDS = ["event", "journal", "special"] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

export interface Target {
  kind: TargetKind;
  id: number;
}

export const targetKey = (t: Target) => `${t.kind}:${t.id}`;

export function parseTargetKey(key: string): Target | null {
  const [kind, id] = key.split(":");
  const n = Number(id);
  return (TARGET_KINDS as readonly string[]).includes(kind) && Number.isInteger(n) && n > 0
    ? { kind: kind as TargetKind, id: n }
    : null;
}

/** Accepts the new `{ kind, id }` shape and the original `{ eventId }` shape. */
export const TargetInput = z.union([
  z.object({ kind: z.enum(TARGET_KINDS), id: z.number().int().positive() }),
  z.object({ eventId: z.number().int().positive() }).transform((v) => ({
    kind: "event" as const,
    id: v.eventId,
  })),
]);

export function targetFromSearchParams(sp: URLSearchParams): Target | null {
  const legacy = Number(sp.get("eventId"));
  if (Number.isInteger(legacy) && legacy > 0) return { kind: "event", id: legacy };
  const kind = sp.get("kind");
  const id = Number(sp.get("id"));
  if (!kind || !(TARGET_KINDS as readonly string[]).includes(kind)) return null;
  return Number.isInteger(id) && id > 0 ? { kind: kind as TargetKind, id } : null;
}
