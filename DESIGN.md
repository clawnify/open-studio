---
version: alpha
name: Clawnify Apps
description: >-
  The shared design system for every app built on the Clawnify app builder
  (template-app-internal: Hono + React + Vite + tRPC + Tailwind + shadcn/ui).
  This file is the single source of truth for visuals. Every deployed app
  inherits it; an app or agency overrides individual tokens below to rebrand
  without touching component code. Lint with `npx @google/design.md lint
  DESIGN.md`; export to a Tailwind v4 @theme block with
  `npx @google/design.md export --format css-tailwind DESIGN.md > theme.css`.

colors:
  # ── Surfaces ──
  background: "#F8F9FA"        # app canvas, page background
  surface: "#FFFFFF"          # cards, tables, panels, popovers
  surface-sunken: "#F1F5F9"   # table header fill, inset wells, hover rows
  # ── Text ──
  foreground: "#1A202C"       # primary text, headings, data values — the ink
  muted: "#475569"            # secondary text, labels, captions (AA on surface-sunken)
  faint: "#94A3B8"            # placeholders, disabled text, decorative icons only
  # ── Lines ──
  border: "#E2E8F0"           # hairlines, card outlines, zone dividers
  ring: "#2563EB"             # focus ring — the ONLY blue in the chrome
  link: "#2563EB"             # inline text links (same blue as ring)
  # ── Brand action (primary = Clawnify coral, shared with the dashboard) ──
  primary: "#DD5164"          # the single coral CTA per screen — same hue as the dashboard
  primary-hover: "#C53A4E"    # darkens on hover (never lightens)
  on-primary: "#FFFFFF"
  # ── Status (muted, never pure-saturated) ──
  success: "#047857"
  success-tint: "#ECFDF5"
  warning: "#B45309"
  warning-tint: "#FFFBEB"
  danger: "#B91C1C"            # dark enough for AA even on danger-tint
  danger-hover: "#991B1B"
  danger-tint: "#FEF2F2"

  # ── Dark mode (applied via prefers-color-scheme / .dark) ──
  background-dark: "#0D1117"
  surface-dark: "#161B22"
  surface-sunken-dark: "#1C2128"
  foreground-dark: "#E6EDF3"
  muted-dark: "#9BA7B3"
  faint-dark: "#6E7681"
  border-dark: "#30363D"
  ring-dark: "#4493F8"
  link-dark: "#4493F8"
  primary-dark: "#DD5164"      # coral holds on the dark canvas (no inversion)
  primary-hover-dark: "#C53A4E"
  on-primary-dark: "#FFFFFF"
  success-dark: "#3FB950"
  success-tint-dark: "#12261E"
  warning-dark: "#D29922"
  warning-tint-dark: "#2A2210"
  danger-dark: "#F85149"
  danger-hover-dark: "#FF6A60"
  danger-tint-dark: "#2D1518"

typography:
  display:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.02em
  heading-1:
    fontFamily: Inter
    fontSize: 20px        # page / toolbar title — B2B tools keep headings small
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.01em
  heading-2:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.3
  heading-3:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Inter
    fontSize: 13px        # dense tables, list rows, card body copy
    fontWeight: 400
    lineHeight: 1.45
  data:
    fontFamily: Inter
    fontSize: 13px        # numbers in tables — tabular figures, right-aligned
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: '"tnum" 1, "cv01" 1'
  data-lg:
    fontFamily: Inter
    fontSize: 24px        # KPI / stat values — tabular, bold
    fontWeight: 700
    lineHeight: 1.1
    fontFeature: '"tnum" 1, "cv01" 1'
  eyebrow:
    fontFamily: Inter
    fontSize: 11px        # THE signature: zone titles inside cards/panels
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0.08em # always uppercase, always muted
  label:
    fontFamily: Inter
    fontSize: 12px        # column headers, field labels, metadata
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0.04em
  button:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1
  fine:
    fontFamily: Inter
    fontSize: 11px        # fine print, deltas, strikethrough comparisons
    fontWeight: 400
    lineHeight: 1.4

rounded:
  sm: 6px      # buttons, inputs, chips
  md: 8px      # cards, popovers, panels
  lg: 12px     # modals, large containers
  full: 9999px # avatars, status badges, toggles

spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  "2xl": 32px
  gutter: 16px
  zone-padding: 20px      # horizontal+vertical padding inside a card zone
  container-max: 1200px
  sidebar-width: 260px
  tap-target: 36px        # minimum interactive height (human)
  tap-target-agent: 40px  # minimum interactive height (agent mode)

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: 6px 12px
    height: "{spacing.tap-target}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    border: "1px solid {colors.border}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: 6px 12px
    height: "{spacing.tap-target}"
  button-secondary-hover:
    backgroundColor: "{colors.surface-sunken}"
  button-ghost:                # transparent at rest (no fill until hover)
    textColor: "{colors.muted}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
  button-ghost-hover:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.foreground}"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.sm}"
  button-danger-hover:
    backgroundColor: "{colors.danger-tint}"
    textColor: "{colors.danger-hover}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    border: "1px solid {colors.border}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 8px 10px
    height: "{spacing.tap-target}"
  input-focus:
    border: "1px solid {colors.ring}"
  input-placeholder:
    textColor: "{colors.faint}"
    typography: "{typography.body-sm}"
  link:
    textColor: "{colors.link}"
  card:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.md}"
  card-zone:
    padding: "{spacing.zone-padding}"
    borderTop: "1px solid {colors.border}"   # every zone after the first
  eyebrow:
    textColor: "{colors.muted}"
    typography: "{typography.eyebrow}"        # render text-transform: uppercase
  table-header:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    padding: 10px 12px
  table-row-hover:
    backgroundColor: "{colors.surface-sunken}"
  chip:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.muted}"
    border: "1px solid {colors.border}"
    typography: "{typography.fine}"
    rounded: "{rounded.sm}"
    padding: 4px 8px
  badge-success:
    backgroundColor: "{colors.success-tint}"
    textColor: "{colors.success}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: 2px 8px
  badge-warning:
    backgroundColor: "{colors.warning-tint}"
    textColor: "{colors.warning}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: 2px 8px
  badge-danger:
    backgroundColor: "{colors.danger-tint}"
    textColor: "{colors.danger}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: 2px 8px
  stat:
    textColor: "{colors.foreground}"
    typography: "{typography.data-lg}"
  stat-meta:
    textColor: "{colors.muted}"
    typography: "{typography.fine}"
  sidebar-item:
    textColor: "{colors.muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 6px 10px
  sidebar-item-active:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.foreground}"
    fontWeight: 600
---

# Clawnify Apps — Design System

## Overview

Clawnify apps are **internal tools and management platforms for mid-market companies**: catalogs, quote-to-invoice queues, CRMs, project trackers, client portals, admin panels. The buyer is an operations person or the agency serving them, not a consumer. So the look is **dense, quiet, and engineered** — the tier of Linear, Attio, and Ramp, not the tier of a vibe-coded demo.

The job of this file is twofold. First, a **floor**: enough opinion to eliminate the generic "AI-generated interface" aesthetic (purple gradients, glowing buttons, emoji section headers, oversized hero type). Second, a **signature**: a small set of recognizable moves — codified from the Clawnify pricing cards (`apps/web/src/app/pricing/page.tsx`), the most detailed surface we've shipped — so that every app, whatever its domain, is identifiably *a Clawnify app* the way every Linear screen is identifiably Linear.

The format follows the [Google Labs DESIGN.md spec](https://github.com/google-labs-code/design.md), same as the websites' `docs/DESIGN.md`. Tokens in frontmatter give agents and tooling exact values; the prose explains *why*.

## The Clawnify Signature

Five moves, applied everywhere. An app missing these looks generic; an app with all five looks like ours.

### 1. Labeled zones, not blobs

A Clawnify container is **anatomy, not a padded box**. Cards, panels, and detail views are divided into stacked zones by hairline `border` dividers (`card-zone`), and **every zone opens with an `eyebrow`** — an 11px uppercase tracked label in `muted` naming what the zone contains:

```
┌──────────────────────────────────┐
│ INVOICE                          │  ← eyebrow
│ Q3-0042 · Meridian GmbH          │
│ $4,820.00  [⬛ Mark paid]        │
├──────────────────────────────────┤  ← hairline divider
│ LINE ITEMS                       │  ← eyebrow
│ …                                │
├──────────────────────────────────┤
│ ACTIVITY                         │
│ …                                │
└──────────────────────────────────┘
```

This is the single highest-leverage move. Generic AI UIs ship one `<h3>` and a wall of content; a sectioned, self-labeled card reads as deliberately engineered. Forms group fields under eyebrows. Sidebars title their nav groups with eyebrows. Detail panes split summary / fields / history into zones.

### 2. One coral action

**The primary button is Clawnify coral (`primary` = `#DD5164`) — and there is exactly one per screen.** It darkens on hover (`primary-hover`), never lightens. This is the same coral the dashboard uses for its primary CTA, so a generated app and the dashboard read as one product — that single shared hue is what makes the whole platform feel like one SaaS. Coral is the **default**; an app or agency can override `primary`/`primary-hover` to its own brand color (see *Overriding This File*) and every button reflows.

Everything else in the chrome stays **monochrome**. The coral is rationed to that one CTA; color elsewhere is reserved for:

- **Blue (`ring`/`link`)** — focus rings and inline text links. Never buttons, never fills.
- **Status tones** — `success`/`warning`/`danger`, tinted badges and validation only.

So the rule isn't "no color in the chrome" — it's **one colored action, monochrome everything else, and color otherwise belongs to the data** (status badges, category pills, charts). Secondary and ghost actions stay neutral; a screen with two coral buttons has none. That discipline — a single brand CTA against an otherwise gray-white, ink-text interface — is what keeps a coral-buttoned app reading as a serious tool rather than a vibe-coded gradient demo.

### 3. Engineered numbers

Numbers are treated as instrumentation, not text:

- Every numeric column, KPI, and price uses `data`/`data-lg` with **tabular figures** (`"tnum"`), right-aligned in tables so digits and totals stack.
- Key numbers carry a **fine-print meta line** beneath (`stat-meta`): a delta, a comparison, a strikethrough former value ("~~$580/mo~~ · billed yearly"). Give the meta line a **fixed height** so toggling state never shifts layout — the pricing page's `h-4` trick.
- Numeric tables show a **footer aggregate** (sum / avg / count).

### 4. Chip vocabulary

Enumerable values — plan names, model tiers, file types, tags shown as facts rather than statuses — render as **chips**: `fine` type, `surface-sunken` fill, hairline border, `sm` radius. Status that demands attention gets a **badge** instead: `full` radius, tinted background (`success-tint`/`warning-tint`/`danger-tint`), colored text. Chips are facts; badges are signals. Don't conflate them.

### 5. Micro-iconography

Icons are 12–16px `lucide-react` line icons, always paired with text, never decorative. Small confirmation checks use `strokeWidth={2.5}` so they stay legible at 12px. No emoji, no filled icon sets, no icon-only primary actions.

## Colors

Neutral-dominant; the full palette ships in light and dark (`*-dark` applies under `prefers-color-scheme: dark` / `.dark`). The dark palette is GitHub-dim (`#0D1117` canvas) rather than pure black — easier on the eyes for all-day tools.

- **`background` (#F8F9FA):** the canvas. A hair off white so `surface` cards read raised without shadows.
- **`surface` (#FFFFFF):** cards, tables, panels, popovers. Content lives here.
- **`surface-sunken` (#F1F5F9):** table-header fills, hovered rows, chips, inset wells, the active sidebar item. The "one step back" tone.
- **`foreground` (#1A202C):** all primary text and data values — the ink. Never pure `#000`.
- **`muted` (#475569):** secondary text. Deliberately darker than the usual slate-500 so it passes WCAG AA (4.5:1) even on `surface-sunken` — table headers and eyebrows must stay readable.
- **`faint` (#94A3B8):** placeholders, disabled states, decorative icons. Never for text that must be read.
- **`border` (#E2E8F0):** the workhorse — card outlines, zone dividers, table separators, input borders.
- **`primary` (#DD5164) / `primary-hover` (#C53A4E):** Clawnify coral — the single brand CTA per screen, shared with the dashboard. Darkens on hover. The default; overridable per app.
- **`ring` / `link` (#2563EB):** the only chromatic blue, confined to focus indication and inline links — never a button.
- **Status triplets:** each of `success`/`warning`/`danger` has a text tone and a `*-tint` background, both with dark variants. Tints exist **so components never hardcode a hex** — `button-danger-hover` and the badges reference them.

## Typography

One family — **Inter** (fallback: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`). Hierarchy comes from **size and weight contrast**, not color or family changes. The roles that separate a real tool from a generic one:

- **`eyebrow`** — 11px / 600 / 0.08em tracking, uppercase, `muted`. The zone-naming device (signature #1).
- **`label`** — 12px / 600 / 0.04em. Column headers and field labels, set in `muted`.
- **`data` / `data-lg`** — tabular figures for every number (signature #3).
- **`fine`** — 11px fine print: meta lines, deltas, chip text, footnotes.
- **`heading-1` is only 20px.** Internal tools keep titles small; the content is the star. A 48px hero is a marketing-site move and instantly reads as "not a real tool." `display` (28px) exists for the rare empty-product splash and nothing else.

## Layout

A 1200px max-width container for table/list apps; a full-bleed flex layout with a fixed **260px sidebar** for navigation-heavy apps (CRM, multi-section dashboards). Spacing follows a strict **8px scale** with a 4px half-step — consistent rhythm is most of what makes an interface feel designed.

Standard chrome:

- **Toolbar** — sticky top bar, page title (`heading-1`) left, actions right, `border` underneath.
- **Sidebar** — `surface`, `border` on the right edge, nav groups titled with `eyebrow`, rows as `sidebar-item` with the active row in `sidebar-item-active` (sunken fill + ink text — no blue tint).
- **Cards** use `zone-padding` (20px) per zone so grouped content breathes; **table rows** stay tight (8–10px vertical). Cards relax; tables compress.

## Elevation & Depth

The interface is **nearly flat**. Hierarchy comes from `border` and the `background` → `surface` → `surface-sunken` tonal steps, not shadows. Shadows are reserved for elements that genuinely float:

- **Resting cards/tables:** no shadow — a `border` only.
- **Popovers, dropdowns, menus:** `0 4px 12px rgba(0,0,0,0.12)`.
- **Modals, toasts:** `0 8px 24px rgba(0,0,0,0.16)`.

No glows, no colored shadows, no layered drop-shadows on static content. If everything is elevated, nothing is.

## Shapes & Motion

Soft-but-engineered: **6px** on interactive atoms (buttons, inputs, chips), **8px** on containers, **12px** on modals; avatars, badges, and toggles are `full`. Don't mix a sharp 2px corner and a pill in the same view.

Transitions are quick and functional: **0.15s ease** on background/border/color. No bounce, no spring, no decorative motion. Hover states are **barely visible** — a one-step tonal shift to `surface-sunken`, never a scale or color jump.

## Components

Built on **shadcn/ui** primitives, restyled to these tokens. The shadcn defaults are a fine skeleton but ship too rounded and too gray-flat; the tokens above pull them to this tier.

- **Buttons** — `button-primary` (coral, the one CTA per screen), `button-secondary` (white, bordered — the default for most actions), `button-ghost` (toolbar/row actions), `button-danger` (red text, `danger-tint` hover). Min height 36px (40px in agent mode). Icon + label, never icon-only for a primary action.
- **Inputs** — bordered `surface` fill; focus swaps the border to `ring` plus a 2px low-opacity blue halo. No heavy glow.
- **Cards** — `card` shell + stacked `card-zone`s, each opened by an `eyebrow` (signature #1). A one-zone card is fine; it still gets its eyebrow.
- **Tables** — `surface-sunken` header in `label` type, `border` between rows, hover in `surface-sunken`, numeric columns in `data` right-aligned, footer aggregate.
- **Chips vs badges** — see signature #4.
- **Stats / KPIs** — `stat` value + fixed-height `stat-meta` line (signature #3).
- **Empty states** — never a bare "No data." One line of explanation plus the primary action: "No invoices yet. Generate your first from a quote." **Render the empty state borderless** — quiet centered text + the one action floating in generous whitespace, *not* wrapped in a bordered/`card` box. An empty bordered box reads as a broken or unloaded component; the border only earns its place once there are rows to contain. Apply the border (and zone anatomy) to the *populated* list/table, and swap to plain centered space when the count is zero.

### Category color palette (for data pills, tags, owners)

Categorical *data* values (tags, owners, company names) get a stable color by hashing the value to one of ten muted pairs — the same value always maps to the same color across the app. This is the one place chroma is welcome, because it's data, not chrome. Background / text (light mode):

`#FEF2F2`/`#DC2626` · `#ECFDF5`/`#059669` · `#EFF6FF`/`#2563EB` · `#FFFBEB`/`#D97706` · `#F5F3FF`/`#7C3AED` · `#F0FDFA`/`#0D9488` · `#FDF2F8`/`#DB2777` · `#FFF7ED`/`#EA580C` · `#FAF5FF`/`#9333EA` · `#F0FDF4`/`#16A34A`

In dark mode, render the same text color over a 12%-opacity background of itself (`color-mix(in srgb, <text> 12%, transparent)`) — don't ship light pastel fills onto dark surfaces.

```ts
function pillColor(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return PILL_COLORS[Math.abs(hash) % PILL_COLORS.length];
}
```

## The Floor: Even a Todo App

The signature is **not reserved for big apps**. The simplest possible request — "make me a todo app" — must still come out looking engineered. The minimum any Clawnify app ships with, however trivial the brief:

```
┌─ Toolbar ──────────────────────────────────────┐
│ Todos                              [▣ Add task]│  ← heading-1 + coral CTA, border below
└────────────────────────────────────────────────┘
┌─ Card ─────────────────────────────────────────┐
│ TASKS · 4 OPEN                                 │  ← eyebrow with live count
│ ☐ Send Q3 invoices            ⬡ today          │  ← 36px rows, chip for metadata
│ ☐ Review supplier quote       ⬡ tomorrow       │
│ ☑ Book freight pickup                          │  ← done: muted + strikethrough
├────────────────────────────────────────────────┤
│ COMPLETED THIS WEEK                 3          │  ← second zone, tabular count
└────────────────────────────────────────────────┘
```

Concretely, the non-negotiables for a minimal app:

1. **A toolbar** with the app name in `heading-1` and the single primary action as a coral `button-primary`. Never a floating centered `<h1>`.
2. **Content in a `card` with eyebrow-labeled zones** — even one list gets its eyebrow (`TASKS · 4 OPEN`). The count in the eyebrow is the cheapest way to make a list feel instrumented.
3. **A real empty state** — "No tasks yet. Add your first above." — not a blank card.
4. **Metadata as chips**, dates/counts in `data` type, completed items in `muted` with strikethrough.
5. **The canvas/surface split** — `background` page, `surface` card with a `border`. Never content floating directly on the canvas.
6. **Both modes** — dark palette via `prefers-color-scheme`, agent mode via `data-agent`. These come free from the tokens and template; don't strip them "because it's simple."

If the brief is trivial, spend the saved effort on these six, not on inventing layout. A todo app with a labeled, counted, chip-annotated zone card reads as a tool; the same data in a centered max-w-md gradient card reads as a demo.

### Agent & human dual-mode

Every Clawnify app runs for two callers: a human in the dashboard and an agent driving a browser. Detect agent mode (`?agent` / `mode=agent`) and set `data-agent` on `<html>`. In agent mode: bump interactive targets to `tap-target-agent` (40–44px), make every action a visible `<button>` with a descriptive `aria-label`, and hide hover-only affordances (drag handles, ellipsis menus, click-to-edit). Never gate an action behind hover or right-click in agent mode. Use semantic HTML (`<table>`/`<th>`/`<td>`, real `<button>`s, correct `<input type>`); never `alert()`/`confirm()`/`prompt()` or `localStorage`.

## Overriding This File

This is the platform default that ships inside `template-app-internal`. An individual app — or an agency white-labeling client work — overrides tokens here (swap the coral `primary` for the app's own brand color, the font, the radii) and every component reflows through the Tailwind utilities already in the markup. **No component file ever contains a raw hex code, font name, or fixed pixel value** — including tint backgrounds and active states; if a recipe needs a tone, it gets a token first. That rule is what makes one-file rebranding actually work.

## Do's and Don'ts

- **Do** open every card zone, form group, and sidebar section with an `eyebrow`. **Don't** ship a padded blob with one heading.
- **Do** keep the primary button coral (`primary`, the brand default) — exactly one per screen, hover darkens. **Don't** paint buttons blue (blue is links and focus only) or ship two coral buttons in one view.
- **Do** set numeric columns in tabular figures, right-aligned, with footer aggregates. **Don't** let digits jitter between rows.
- **Do** give key numbers a fixed-height meta line (delta, comparison). **Don't** let state toggles shift layout.
- **Do** use chips for facts and tinted badges for signals. **Don't** use a red badge as decoration.
- **Do** convey hierarchy with borders and tonal steps. **Don't** add shadows to resting cards or use colored/glowing shadows.
- **Do** keep headings small (20px page title). **Don't** ship a 48px marketing hero inside an internal tool.
- **Don't** use gradients anywhere — especially the purple/indigo gradient that flags AI-generated UI.
- **Don't** use emoji as section headers or icons; use `lucide-react` line icons at 12–16px.
- **Do** write real empty states with a next action. **Don't** leave a bare "No data."
- **Do** keep hover states one tonal step. **Don't** scale, glow, or color-shift on hover.
- **Do** maintain WCAG AA (4.5:1 body text) — `muted` is tuned to pass even on `surface-sunken`. **Don't** use `faint` for anything that must be read.
- **Do** stay responsive: stack columns on mobile, keep tap targets ≥ `tap-target`, let tables scroll horizontally. **Don't** ship a desktop-only grid.
- **Do** change branding by editing tokens in this file. **Don't** hardcode a hex, font, or pixel value in a component — tints and active states included.

> **Known lint warnings:** `npx @google/design.md lint` flags `border`/`borderTop` component sub-tokens (the spec doesn't model borders yet — we keep them because borders carry the hierarchy here) and every `*-dark` color as unreferenced (the spec doesn't model dark mode). Both are spec gaps, shared with the websites' `docs/DESIGN.md`. Any *other* warning — contrast, orphan light-mode tokens, raw hex — is a real defect; fix it.

## See Also

- **`apps/web/src/app/pricing/page.tsx`** — the canonical exemplar of the structural signature (zoned cards, eyebrows, engineered numbers, chips). Its CTA predates the coral-primary default; follow the tokens for button color, this file for everything else.
- **`docs/DESIGN.md`** — the websites' platform-default brand (same spec, marketing tier).
- **`docs/template-strategy.md`** — why there is exactly one app template.
- **[Google Labs DESIGN.md spec](https://github.com/google-labs-code/design.md)** — upstream format.
