/**
 * Minimal RFC 5545 calendar writer for deadline feeds: UTC timestamps, all-day event spans,
 * TEXT escaping, 75-octet line folding and CRLF line endings.
 */

export interface IcsItem {
  uid: string;
  title: string;
  description?: string | null;
  url?: string | null;
  /** A deadline instant (UTC). */
  at?: Date;
  /** All-day span, inclusive dates "YYYY-MM-DD". */
  allDay?: { start: string; end: string | null };
  /** Reminder before the deadline. */
  alarmMinutesBefore?: number;
}

export function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold to ≤75 octets per line (continuation lines start with a space). */
export function foldLine(line: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = bytes.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (size + n > limit) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const dateOnly = (iso: string) => iso.replace(/-/g, "");
function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function buildCalendar(name: string, items: IcsItem[], now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FIndress//Deadlines//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
  ];
  for (const it of items) {
    lines.push("BEGIN:VEVENT", `UID:${it.uid}`, `DTSTAMP:${stamp(now)}`);
    if (it.at) {
      lines.push(`DTSTART:${stamp(it.at)}`, "DURATION:PT1M");
    } else if (it.allDay) {
      lines.push(
        `DTSTART;VALUE=DATE:${dateOnly(it.allDay.start)}`,
        `DTEND;VALUE=DATE:${dateOnly(nextDay(it.allDay.end ?? it.allDay.start))}`,
      );
    } else continue;
    lines.push(`SUMMARY:${escapeText(it.title)}`);
    if (it.description) lines.push(`DESCRIPTION:${escapeText(it.description)}`);
    if (it.url) lines.push(`URL:${it.url}`);
    if (it.at && it.alarmMinutesBefore) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeText(it.title)}`,
        `TRIGGER:-PT${it.alarmMinutesBefore}M`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function icsResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^a-z0-9._-]/gi, "_")}"`,
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
