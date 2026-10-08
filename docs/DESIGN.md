# FIndress — Design Brief

The app must feel like a premium instrument for researchers, not a template dashboard.
Concept: **"Research Observatory."** Conferences are signals across a dark sky; deadlines are
orbits closing in. Calm, precise, quietly luminous.

## Mood
Linear-level polish × Arc-browser warmth × an astronomy observatory. Dense information that still
breathes. No generic purple-gradient SaaS look, no stock illustrations, no emoji as UI.

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
- Display: **Instrument Serif** (headlines, event acronyms on detail pages) — gives an academic, editorial feel.
- UI/body: **Geist Sans** (or Inter). Data, dates, countdowns: **Geist Mono / JetBrains Mono**, tabular numbers.
- Big confident type on the hero ("Every AI/ML venue on Earth. One view."), tight tracking on display.

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
- Recharts with custom theme: no gridline clutter, hairline axes, mono tick labels, accent for the
  focus series and muted greys for the rest, rich tooltips.
- GitHub-style deadline heatmap for the next 12 months; world map with venue dots sized by count;
  stacked bars of events per month by subfield; line of acceptance rates for top venues.

## Quality checks before calling a page done
- Screenshot it in both themes at 390px and 1440px and compare against this brief.
- Check focus states, empty states, loading skeletons, and AA contrast.
