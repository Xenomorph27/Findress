import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { getEventDetail, getExplorerRows, searchEventIds } from "@/lib/data/events";
import { applyFilters, DEFAULT_FILTERS, nextDeadline } from "@/lib/explore/filters";
import { PoliteFetcher, RobotsDisallowedError } from "@/lib/ingest/http";
import { extractCfp } from "@/lib/sources/cfp";
import { CONTINENTS, EVENT_TYPES, SUBFIELDS } from "@/lib/taxonomy";
import { formatInZone } from "@/lib/time/format";
import { arxivQueryUrl, parseArxivFeed } from "./arxiv";

/** Hosts the assistant may fetch (plus the current event's own website host). */
const ALWAYS_ALLOWED = ["openreview.net", "arxiv.org"];

export function isAllowedUrl(url: string, extraHosts: string[]): boolean {
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    host = u.hostname.toLowerCase();
  } catch {
    return false;
  }
  return [...ALWAYS_ALLOWED, ...extraHosts]
    .map((h) => h.toLowerCase().replace(/^www\./, ""))
    .some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`) || host === `www.${allowed}`,
    );
}

const fetcher = new PoliteFetcher();

export function buildTools({ tz, allowedHosts }: { tz: string; allowedHosts: string[] }) {
  return {
    getEvent: tool({
      description:
        "Look up one event in the FIndress archive by slug (e.g. 'icml-2026', 'neurips-2026'). Returns dates, location, ranks, every deadline (UTC and the user's timezone), workshops and the first part of the CFP.",
      inputSchema: z.object({ slug: z.string().describe("Event slug, lowercase acronym-year") }),
      execute: async ({ slug }) => {
        const e = await getEventDetail(slug.toLowerCase().trim());
        if (!e) return { found: false, slug };
        return {
          found: true,
          slug: e.slug,
          acronym: e.acronym,
          year: e.year,
          name: e.name,
          type: e.type,
          dates: e.startDate
            ? `${e.startDate} to ${e.endDate ?? e.startDate}`
            : (e.dateText ?? "not announced"),
          location: [e.venue, e.city, e.country].filter(Boolean).join(", ") || "not announced",
          ranks: { core: e.rankCore, ccf: e.rankCcf },
          website: e.website,
          deadlines: e.deadlines.map((d) => ({
            kind: d.kind,
            label: d.label,
            utc: d.dueAtUtc,
            local: `${formatInZone(d.dueAtUtc, tz, "yyyy-MM-dd HH:mm")} ${tz}`,
            published: d.originalText
              ? `${d.originalText} ${d.originalTz ?? "(no timezone)"}`
              : null,
          })),
          workshops: e.children
            .slice(0, 40)
            .map((c) => ({ slug: c.slug, acronym: c.acronym, name: c.name })),
          acceptance: e.acceptance.slice(-5),
          cfpExcerpt: e.cfpText ? e.cfpText.slice(0, 2500) : null,
          cfpUrl: e.cfpUrl,
          url: `/c/${e.slug}`,
        };
      },
    }),

    searchEvents: tool({
      description:
        "Search the FIndress archive of AI/ML conferences and workshops. All filters optional. Returns up to `limit` events sorted by nearest upcoming submission deadline.",
      inputSchema: z.object({
        query: z.string().optional().describe("Free text: acronym, name, topic or city"),
        subfield: z.enum(SUBFIELDS.map((s) => s.id) as [string, ...string[]]).optional(),
        type: z.enum(EVENT_TYPES).optional(),
        continent: z.enum(CONTINENTS).optional(),
        countryCode: z.string().length(2).optional().describe("ISO-3166 alpha-2, e.g. 'IN', 'US'"),
        deadlineFrom: z.string().optional().describe("Earliest submission deadline, YYYY-MM-DD"),
        deadlineTo: z.string().optional().describe("Latest submission deadline, YYYY-MM-DD"),
        eventMonth: z.string().optional().describe("Event start month, YYYY-MM"),
        includePassed: z
          .boolean()
          .optional()
          .describe("Include events whose deadlines have passed"),
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: async (input) => {
        let rows = await getExplorerRows();
        if (input.query?.trim()) {
          const ids = new Set(await searchEventIds(input.query.trim(), 300));
          rows = rows.filter((r) => ids.has(r.id));
        }
        const iso = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "");
        let evFrom = "";
        let evTo = "";
        if (input.eventMonth && /^\d{4}-\d{2}$/.test(input.eventMonth)) {
          const [y, m] = input.eventMonth.split("-").map(Number);
          evFrom = `${input.eventMonth}-01`;
          evTo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
        }
        const now = Date.now();
        const filtered = applyFilters(
          rows,
          {
            ...DEFAULT_FILTERS,
            subfields: input.subfield ? [input.subfield] : [],
            types: input.type ? [input.type] : [],
            continents: input.continent ? [input.continent] : [],
            countries: input.countryCode ? [input.countryCode.toUpperCase()] : [],
            window: iso(input.deadlineFrom) || iso(input.deadlineTo) ? "custom" : "",
            dlFrom: iso(input.deadlineFrom),
            dlTo: iso(input.deadlineTo),
            evFrom,
            evTo,
            showPassed: Boolean(input.includePassed),
            community: true,
          },
          now,
        );
        return {
          total: filtered.length,
          events: filtered.slice(0, input.limit ?? 12).map((r) => {
            const nd = nextDeadline(r, now);
            return {
              slug: r.slug,
              acronym: r.acronym,
              year: r.year,
              name: r.name,
              type: r.type,
              parent: r.parent ? `${r.parent.acronym} ${r.parent.year}` : null,
              location: [r.city, r.country].filter(Boolean).join(", ") || "not announced",
              dates: r.startDate
                ? `${r.startDate} to ${r.endDate ?? r.startDate}`
                : "not announced",
              nextDeadline: nd
                ? `${nd.kind} ${formatInZone(nd.at, tz, "yyyy-MM-dd HH:mm")} ${tz}${nd.passed ? " (passed)" : ""}`
                : "not announced",
              ranks:
                [r.rankCore && `CORE ${r.rankCore}`, r.rankCcf && `CCF ${r.rankCcf}`]
                  .filter(Boolean)
                  .join(", ") || "unranked",
              subfields: r.subfields,
              url: `/c/${r.slug}`,
            };
          }),
        };
      },
    }),

    fetchPage: tool({
      description: `Fetch a web page and return its main text (Readability). Only these hosts are allowed: ${[...ALWAYS_ALLOWED, ...allowedHosts].join(", ")}. Use it for pages linked from the CFP (author guidelines, workshop pages, OpenReview).`,
      inputSchema: z.object({ url: z.url() }),
      execute: async ({ url }) => {
        if (!isAllowedUrl(url, allowedHosts)) {
          return {
            ok: false,
            error: `Not allowed: only ${[...ALWAYS_ALLOWED, ...allowedHosts].join(", ")} can be fetched.`,
          };
        }
        try {
          const res = await fetcher.get(url, {
            robots: true,
            timeoutMs: 15_000,
            maxBytes: 2_000_000,
          });
          if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
          const page = extractCfp(res.text, res.url);
          return { ok: true, url: res.url, title: page.title, text: page.text.slice(0, 9000) };
        } catch (err) {
          return {
            ok: false,
            error:
              err instanceof RobotsDisallowedError
                ? "The site's robots.txt disallows fetching this page."
                : (err as Error).message,
          };
        }
      },
    }),

    searchArxiv: tool({
      description:
        "Search arXiv for the most recent papers on a topic (title, authors, date, abstract, link).",
      inputSchema: z.object({
        query: z.string().min(2).describe("Keywords, e.g. 'diffusion models protein design'"),
        max: z.number().int().min(1).max(5).optional(),
      }),
      execute: async ({ query, max }) => {
        try {
          const xml = await fetcher.getText(arxivQueryUrl(query, max ?? 5), {
            minIntervalMs: 3000,
            timeoutMs: 15_000,
          });
          return { ok: true, papers: parseArxivFeed(xml, max ?? 5) };
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      },
    }),
  };
}

export type FindressTools = ReturnType<typeof buildTools>;
