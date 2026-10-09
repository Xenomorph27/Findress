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

- Chrome `#03050A` / header `#080C14`, `--bg` deep ink `#0A0E16`, `--surface` `#0D121B`, `--surface-2` `#151B26`, hairline borders `rgba(255,255,255,0.07)` (see Lighting system)
- `--text` `#E8ECF3`, `--muted` `#8A94A6`
- Accent **Aurora**: a teal→cyan→soft violet gradient (`#2EE6C5 → #38BDF8 → #A78BFA`), used sparingly:
  focus rings, the globe's points, primary buttons, chart highlights. Per-route tints (active filters, selection,
  nav) come from `--screen` (see Lighting system).
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

## Lighting system

Replaces the star-field. Implemented in `src/app/globals.css`, `src/lib/theme/route-accents.ts` and
`src/components/shell/app-shell.tsx`.

**A. One accent per route: `--screen`.** `AppShell` sets `style={{"--screen": accent}}` once on the
root. The accent comes from the route's first segment (`useSelectedLayoutSegment`), which is
static, so prerendered shells already carry the right tint. Everything below reads
`var(--screen)`; there is no prop threading.

| Route              | Accent                                    |
| ------------------ | ----------------------------------------- |
| `/` landing        | `#2EE6C5` teal                            |
| `/explore`, `/c/*` | `#38BDF8` cyan                            |
| `/j/*`             | `#A78BFA` violet                          |
| `/insights`        | `#2EE6C5` teal                            |
| `/workspace`       | `#F5B84B` amber                           |
| `/sources`         | `#8A94A6` grey                            |
| `/login`           | `#F25BD0` pink (matches the crystal ball) |

Nav neighbours stay at least 49° apart in OKLCH hue: Explore 233°, Insights 177°, Workspace 79°,
and Sources is near-grey. Elsewhere 24° is enough.

**B. Tint ladder.** Every tint is `color-mix(in oklab, var(--screen) N%, transparent)`. Oklab makes
11% amber and 11% violet look equally strong, so one ladder fits every hue. Mixing against
transparent means the same class works on any surface. Tints are gradient layers
(`background-image`), so they stack over solid cards too.

| Class                         | Strength  | Use                                                               |
| ----------------------------- | --------- | ----------------------------------------------------------------- |
| `tint-surface`                | 3%        | working surfaces, segmented controls                              |
| `tint-col` / `tint-col-hover` | 5%        | column hover, Kanban drop target, card hover                      |
| `tint-header`                 | 9%        | table header rows                                                 |
| `tint-row-hover`              | 11%       | list rows, nav links, menu rows (hover)                           |
| `tint-selected`               | 21%       | selected row, active tab, active nav, active filter, count badges |
| `hairline-screen`             | 100%, 2px | header hairline only (under table headers)                        |

`tint-selected` also raises `--muted-foreground` to `--muted-on-tint` (dark `#a9b2c1`, light
`#4a5262`), so secondary text stays at or above 4.5:1 on the strongest tint of every accent. There
are no ad-hoc `hover:bg-*` colours. Selection markers use `bg-screen` / `border-screen`.

**C. Atmosphere glow.** `.glow-screen` is on `<main>` on every page. It is a 220px radial wash of the
screen hue from the top, with `isolation: isolate` so the `z-index:-1` layer can't escape. It ends
at 70%, so the lower page and the data stay neutral. Strength is 13% in dark and 7% in light
(about half).

**D. Grain.** A fixed inline-SVG `feTurbulence` film on `body::after`, at opacity 0.035 with
`pointer-events: none`. 0.06 looks dirty; 0.02 does nothing.

**E. Lift.** Raised surfaces use `lift`: cards, sheets, popovers, dialogs, selects, chart tooltips
and the login card. In dark it is `inset 0 1px 0 0 rgba(255,255,255,.055), 0 1px 2px rgba(0,0,0,.45)`.
In light it is `inset 0 1px 0 0 rgba(255,255,255,.7), 0 1px 2px rgba(14,17,22,.1)`. No big soft shadows.

**F. Chrome darker than content.** In dark mode the data reads as the lit surface.

| Layer                                       | Dark      | Light     |
| ------------------------------------------- | --------- | --------- |
| `--chrome` (footer, explore filter sidebar) | `#03050a` | `#e9e9e4` |
| `--chrome-header` (header/nav)              | `#080c14` | `#efefea` |
| `--bg` (page content)                       | `#0a0e16` | `#f7f7f4` |
| `--surface` (panels, cards)                 | `#0d121b` | `#ffffff` |
| `--surface-2`                               | `#151b26` | `#f0f0eb` |

AA: body text is at least 14.5:1 and muted text at least 5.4:1 on every layer. Muted text on the
21% selected tint is at least 4.9:1 (via `--muted-on-tint`).

## Signature elements

1. **Crystal globe** (`cobe` inside React Bits CrystalizedBall): slowly rotating, dotted, venue
   clusters glowing; drag, hover, click for a venue popover; hovering a "next deadline" card pulses
   its point. Reduced motion: no spin, still ball. See WebGL scenes.
2. **Live countdowns**: mono digits that tick each second for deadlines < 72h; colour follows heat scale.
3. **Timeline ribbon** on detail pages: horizontal milestones on a thin luminous line, "today" marker,
   passed milestones dimmed.
4. **Command palette** (`⌘K` / `Ctrl+K`, shadcn `Command`): jump to any event, filter, or ask the assistant.
5. **Glass side sheet** for previews: subtle backdrop blur, 1px hairline border, soft inner glow.
6. **Ambient background**: the lighting system below (route tint, top glow, grain), plus one slow aurora gradient blob behind the hero only. The old star-field is gone.
7. **Assistant panel**: feels native, not a bubble widget — a docked column with suggested-prompt chips,
   streaming text with a soft caret, citations rendered as small source pills.

## WebGL scenes (React Bits)

Four React Bits components live in `src/components/react-bits/`. They were installed unchanged from
the registry (`npx shadcn@latest add @react-bits/<Name>-TS-TW`). Only `Strands.tsx` carries the
allowed edits: it pauses off-screen, in hidden tabs and under reduced motion, and uses a
ResizeObserver. The folder is excluded from Prettier (`.prettierignore`) and ESLint (`pnpm lint`
passes `--ignore-pattern`), so the vendored source stays as published. It isn't git-ignored, so
Tailwind scans it; no `@source` is needed.

| Where               | Component                                                             | Notes                                                                         |
| ------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `/` hero            | CrystalizedBall (`plasma`, `#F25BD0`, size 0.7) behind the cobe globe | "Crystal globe": the ball is decoration; the globe does all the interaction   |
| `/login` left panel | RippleDistortion over `public/hero.jpg`                               | Uses `hero-placeholder.jpg` until a real `hero.jpg` exists (checked at build) |
| after sign-in       | PixelSwap, white → `#0a0e16`, full screen                             | `trigger="manual"`, then `router.replace(next)`; reduced motion skips it      |
| site footer         | Strands band, 180px mobile / 260px desktop                            | On `--chrome`, masked in from the top; text sits on a chrome scrim            |

Rules for every WebGL scene:

- Load with `next/dynamic({ ssr: false })`. Only the page that needs a canvas mounts one: the ball
  only on `/`, the ripple only on `/login`, and Strands once the footer is within 400px of the
  viewport.
- `useWebGLMode()` returns `"static"` without WebGL2 or under `prefers-reduced-motion`, and the
  scene then shows still art: a CSS glow ball, the greyscale hero image, or a blurred gradient band.
- Decorative scenes start late (`useDeferredStart`): on the first pointer, key, touch or scroll, or
  3s after load. This keeps shader compiles off the critical path (Lighthouse mobile ≥ 85).
- **Crystal globe interaction:**
  - Drag rotates, with inertia.
  - Hover shows a tooltip: city, country and event count.
  - A click converts the point to lat/lng through cobe's projection
    (`src/lib/landing/globe-math.ts`, unit-tested) and opens a popover for the nearest venue cluster
    within 5°. Open ocean does nothing.
  - The popover lists acronym, dates and next deadline, links to `/c/…`, and ends with "See all"
    (→ `/explore?country=…&q=city`).
  - Keyboard: arrows rotate, Tab walks a "Browse by location" list (the top 30 cities), and Enter
    opens the popover.
  - Markers sit on the surface (`markerElevation: 0`), and the globe fits its box from 360 to 1920px.
    On mobile it sits below the hero text.
- cobe wraps its canvas in its own div, so React renders an empty host and the canvas is created
  inside it imperatively.

## Motion (Framer Motion)

- 150–250ms ease-out for UI; list items stagger in 20ms on first load only (CSS `row-in`, so it starts at first paint); layout animations when
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
