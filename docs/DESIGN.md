# FIndress — Design Brief

The app must feel like a premium instrument for researchers, not a template dashboard.
Concept: **"Research Observatory."** Conferences are signals across a dark sky; deadlines are
orbits closing in. Calm, precise, quietly luminous.

## Mood

Linear-level polish × Arc-browser warmth × an astronomy observatory. Calm and minimal: information that
breathes, with spacing doing the work of lines. No generic purple-gradient SaaS look, no stock illustrations,
no emoji as UI.

## Theme

Dark mode is the hero; light mode must be equally finished (toggle + system default).

Colour tokens (CSS variables on `:root`, mapped into Tailwind):

- `--bg` deep ink `#07090F`, `--surface` `#0D1119`, `--surface-2` `#141A24`, hairline borders `rgba(255,255,255,0.07)`
- `--text` `#E8ECF3`, `--muted` `#8A94A6`
- Accent **Aurora**: a teal→cyan→soft violet gradient (`#2EE6C5 → #38BDF8 → #A78BFA`), used sparingly:
  focus rings, active filters, the globe's points, primary buttons, chart highlights.
- Deadline heat scale (countdown chips + calendar): calm `#38BDF8` → warm `#F5B84B` → hot `#FF5D73`; passed `#4B5563`.
- Light mode: paper `#F7F7F4`, ink `#0E1116`, same accents slightly deepened for AA contrast.

## Typography

Clean, minimal, calm. Two families, three weights, six sizes, enforced in `src/app/globals.css`
(`@theme` clears Tailwind's defaults, so an off-scale class simply doesn't exist).

- **Geist Sans for all text**, headings included. No serif, no italics for emphasis.
- **Geist Mono only for numbers**: dates, times, countdowns, metrics, counts. It is always tabular
  (`.font-mono` sets `tabular-nums`). Words never go in mono. The one exception is literal code
  and keys (`pnpm ingest`, `<kbd>`). For a number inside a sentence or a mixed string, use Sans
  with `tabular`.
- **Weights: 400, 500, 600 only.** Body 400. Labels, buttons and emphasis are 500. Headings, plus
  heading-like labels such as acronyms and titles, are 600 via `font-heading` or the base `h1–h4`
  rule. `strong` is 600.
- **Letter-spacing:** headings −0.015em (`font-heading`). `tracking-tight` is −0.02em and
  `tracking-snug` −0.01em. `tracking-wide` (0.04em) is for tiny uppercase labels only.
- **Type scale (px):** no other sizes, and no arbitrary `text-[…]` values.

  | Class       | Size | Line-height | Use                                                |
  | ----------- | ---- | ----------- | -------------------------------------------------- |
  | `text-xs`   | 12   | 1.5         | captions, chips, tiny labels, chart ticks          |
  | `text-sm`   | 14   | 1.6         | body (dense UI), descriptions                      |
  | `text-base` | 16   | 1.6         | body (reading text), row/card titles, sub-headings |
  | `text-xl`   | 20   | 1.4         | section headings (h2), stat values                 |
  | `text-3xl`  | 28   | 1.25        | page titles on mobile, the hero on mobile          |
  | `text-5xl`  | 40   | 1.1         | page titles (`md:`), the hero                      |

  Charts use the same steps: Recharts ticks are `fontSize: 12`. An SVG that scales with its
  container sizes its labels in user units so they render at 12px (see `deadline-heatmap.tsx`).

- **No ALL CAPS** except tiny labels: `text-xs font-medium tracking-wide uppercase`, used for
  eyebrows, filter legends, Kanban column heads and the "today" marker. Captions, badges and
  statuses stay in sentence case.

## Clutter

- **At most 3 chips per row or card.** Use `ChipList` (`components/event/chips.tsx`), which
  shows up to 3 and then a muted "+N" with the rest in its tooltip. If a row already shows a type
  badge, pass `max={MAX_CHIPS - 1}`. Long topic lists on detail pages are `TopicLine` text
  ("a · b · c +12 more"), not chip walls.
- **Not everything is a chip.** Rankings (`Ranks` → "CORE A* · CCF A", top tier in accent ink),
  attendance mode and open-access model render as quiet text. Only the type badge and topic
  chips get a pill.
- **Muted colour for secondary info:** full names, publishers, captions, sources, fees and units
  (`text-muted-foreground`). Only the primary label of a row is `text-foreground`.
- **Spacing over lines.** List rows have no dividers; they get `py-4` with a rounded hover/selected
  fill. Cards have no outer border and no inner separators: a surface fill plus `p-5`/`gap-4`.
  Detail-page sections are separated by `space-y-14`, not rules. Filter-rail groups use
  `space-y-8`. Keep borders for inputs, buttons, the sticky mobile toolbar, popovers, and table
  rows where alignment needs them.

## Signature elements

1. **Hero globe** (`cobe`): slowly rotating, dotted, points at upcoming venues glowing in the accent;
   hovering a "next deadline" card pulses its point. Respect reduced motion (static render).
2. **Live countdowns**: mono digits that tick each second for deadlines < 72h; colour follows heat scale.
3. **Timeline ribbon** on detail pages: horizontal milestones on a thin luminous line, "today" marker,
   passed milestones dimmed.
4. **Command palette** (`⌘K` / `Ctrl+K`, shadcn `Command`): jump to any event, filter, or ask the assistant.
5. **Glass side sheet** for previews: subtle backdrop blur, 1px hairline border, soft inner glow.
6. **Ambient background**: very faint star-field noise + one slow aurora gradient blob behind the hero only.
7. **Assistant panel**: feels native, not a bubble widget — a docked column with suggested-prompt chips,
   streaming text with a soft caret, citations rendered as small source pills.

## Motion (Framer Motion)

- 150–250ms ease-out for UI; list items stagger in 20ms on first load only; layout animations when
  filters change; shared-element transition from list row → detail header (acronym).
- Nothing loops except the globe and the < 72h countdown.

## Layout

- Max content width 1280px; 12-col grid; generous 24–32px gutters desktop, 16px mobile.
- `/explore`: left filter rail (collapsible; becomes a bottom sheet on mobile), results centre,
  preview sheet right.
- Fully responsive down to 360px; no horizontal scroll.

## Charts (`/insights`)

- Recharts with custom theme: no gridline clutter, hairline axes, 12px mono tick labels for numbers, accent for the
  focus series and muted greys for the rest, rich tooltips.
- GitHub-style deadline heatmap for the next 12 months; world map with venue dots sized by count;
  stacked bars of events per month by subfield; line of acceptance rates for top venues.

## Quality checks before calling a page done

- Screenshot it in both themes at 390px and 1440px and compare against this brief.
- Check focus states, empty states, loading skeletons, and AA contrast.
