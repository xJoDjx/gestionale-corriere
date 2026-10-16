# GLS Padroncini — Design System

## Overview

**Product:** Gestionale Corriere — GLS Padroncini  
**Type:** Internal web application (admin/gestionale)  
**Stack:** React + TypeScript + Vite, single-page app  
**Source:** `frontend/` (mounted local codebase)

A full-featured management system for a GLS courier franchise operator. It tracks **padroncini** (owner-operator subcontractors), their assigned vehicles (flotta), handheld devices (palmari), driver codes, monthly billing calculations (conteggi), advances (acconti), EV charging records (ricariche), and audit logs.

---

## Products / Surfaces

| Surface | Description |
|---|---|
| **Web App** | Single desktop SPA at `localhost:5173`. Fixed sidebar layout, content area fills remaining space. Light + Dark theme support. |

---

## Source Files

- Codebase: `frontend/` (local mount)  
- Design tokens: `frontend/src/styles/variables.css`  
- Global styles + shared components: `frontend/src/styles/global.css`  
- Feature pages: `frontend/src/features/`  
- Layout shell: `frontend/src/components/layout/`

---

## CONTENT FUNDAMENTALS

**Language:** Italian throughout — all labels, buttons, messages, error text.

**Tone:** Professional, direct, operational. No marketing language. Pure utility.

**Casing:**
- Section headers: Title Case (e.g. "Flotta Mezzi", "Log Storico")
- Table column headers: ALL CAPS, spaced tracking (e.g. "RAGIONE SOCIALE", "DATA INIZIO")
- Buttons: Sentence case with action verb (e.g. "Crea Padroncino", "Salva Modifiche")
- Badge labels: ALL CAPS (e.g. "ATTIVO", "DISMESSO", "BOZZA")
- KPI labels: ALL CAPS, small (e.g. "MEZZI TOTALI", "DA BONIFICARE")

**Copy patterns:**
- Empty states: emoji icon + short message (e.g. "🚚 Nessun mezzo assegnato attualmente")
- Confirmation dialogs: direct question (e.g. "Rimuovere questo mezzo dal padroncino?")
- Loading states: "Salvataggio...", "Caricamento..."
- Error messages: "Errore: " + technical detail
- Dates: Italian locale `dd/mm/yyyy`
- Currency: Italian locale `€ 1.234,56` (Intl.NumberFormat it-IT)

**Emoji usage:** Yes — used sparingly as functional icons in sidebar nav, empty states, modal titles, and alert icons. Not decorative. Examples: 📊 Dashboard, 👤 Padroncini, 🚛 Flotta Mezzi, ⚡ Ricariche.

---

## VISUAL FOUNDATIONS

### Colors
- **Primary (light):** `#2563eb` — blue, used for CTAs, active nav, links
- **Primary (dark):** `#6366f1` — indigo
- **Orange accent:** `#f97316` — brand icon background, secondary highlights
- **Backgrounds (light):** `#f7f8fa` page, `#ffffff` cards/secondary, `#f0f1f4` tertiary
- **Sidebar:** `#121821` dark regardless of theme
- **Text (light):** `#0f172a` primary, `#475569` secondary, `#94a3b8` muted
- Full semantic palette: success/warning/danger/info with muted bg variants
- Badge system: 7 colors (green/orange/red/yellow/blue/purple/gray) each with bg variant

### Typography
- **Sans:** DM Sans (Google Fonts) — 400/500/600/700 weights
- **Mono:** JetBrains Mono — used for license plates (targhe), timestamps, codes
- Base size: 16px, line-height 1.5
- Font smoothing: antialiased

### Spacing
4px base unit: `xs=4 sm=8 md=16 lg=24 xl=32 2xl=48`

### Radii
`sm=6px md=8px lg=12px xl=16px` — cards use `lg`, buttons `md`, badges `999px`

### Shadows
- Card default: `0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.04)` — very subtle
- Card hover: `0 4px 12px rgba(15,23,42,0.08)`
- Dark theme: more opaque blacks

### Cards
- White bg, 1px `#e5e7eb` border, `radius-lg` (12px), subtle shadow
- Hover shadow increases
- Header: 14px/600 title, separated by 1px border-bottom
- Padding: 20–22px

### Tables
- Zebra: odd rows white, even rows `#fafbfc`
- Hover: `#f1f5f9`
- Headers: 11px, 700, uppercase, letter-spacing 0.08em, `--text-muted`
- Cell padding: 14px 16px
- Font size: 13px
- border-collapse: separate; borders on cell bottom only

### KPI Cards
- Tinted color variants: blue/red/green/orange/purple/yellow
- 30px value font, 700, letter-spacing -0.01em
- 11px uppercase muted label
- Icon: 30×30px rounded square, colored per variant

### Badges
- Pill shape (`border-radius: 999px`)
- 11px, 700, uppercase, letter-spacing 0.03em
- 7 color variants (green/orange/red/yellow/blue/purple/gray)

### Buttons
- Primary: `#2563eb` bg, white text, hover darken
- Ghost: white bg, border, hover bg-hover
- Danger ghost: white bg, red text, hover red tinted
- Height: ~34px (8px top/bottom pad + font)
- Radius: `radius-md` (8px)

### Sidebar
- Dark bg: `#121821` (light theme), `#141722` (dark)
- Active item: blue pill (`#2563eb`) with white text
- Hover: light tinted bg
- Collapsed mode: 72px wide, icons only
- Brand icon: orange square with emoji

### Animations / Transitions
- Theme switch: `background-color 0.15s ease, border-color 0.15s ease, color 0.05s ease`
- Sidebar collapse: `width 0.2s ease`
- Hover states: `background 0.12s`
- No page transitions. No bounces. No spring physics. Minimal and functional.

### Hover / Press states
- Hover: background lightens (or bg-hover)
- No scale/shrink on buttons
- Cursor: pointer on interactive elements

### Imagery / Backgrounds
- No background images or illustrations
- No gradients on backgrounds
- No textures or patterns
- Pure flat color surfaces
- Charts use Recharts library (ComposedChart with Bar + Line)

### Corner radii for specific elements
- Cards: 12px
- Buttons: 8px
- Inputs: 8px
- Badges: 999px (full pill)
- KPI icon box: 6px
- Brand icon: 8px

### Dark Mode
Full dual-theme support via `[data-theme="dark"]` attribute on `<html>`. All tokens switch. Dark uses indigo primary instead of blue.

---

## ICONOGRAPHY

**Approach:** Emoji used as functional icons throughout — sidebar navigation, modal titles, empty states, alert icons, button prefixes. No SVG icon library, no icon font, no PNG icons.

**Usage pattern:**
- Sidebar nav items each have an emoji icon (shown even in collapsed mode)
- Buttons prefix with emoji: "➕ Nuovo Padroncino", "💾 Salva Modifiche", "📎 Carica Documento"
- Alert icons inline: ⚠️ danger, 🔧 warning, 📋 info
- Empty state illustrations: single large emoji centered

**No external icon system.** No Lucide, Heroicons, FontAwesome, etc.

---

## Files Index

```
README.md                    ← This file
colors_and_type.css          ← All CSS variables (tokens)
assets/                      ← (no binary assets; emoji-based icons)
preview/                     ← Design System card HTML files
  colors-brand.html
  colors-semantic.html
  colors-badges.html
  colors-dark.html
  type-scale.html
  type-specimens.html
  spacing-tokens.html
  components-buttons.html
  components-badges.html
  components-table.html
  components-kpi.html
  components-sidebar.html
  components-cards.html
  components-alerts.html
  components-forms.html
ui_kits/
  web_app/
    README.md
    index.html               ← Full interactive prototype
    Sidebar.jsx
    Dashboard.jsx
    Padroncini.jsx
    Conteggi.jsx
    Flotta.jsx
SKILL.md
```
