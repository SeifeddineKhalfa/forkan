# UI guide — theme «رَقّ» and ergonomics

How the interface looks and why, so new screens stay consistent. Arabic, right-to-left,
used mostly on phones by teachers and on a desktop at the association's office.

## Theme

Parchment, ink-green and gilt, after the colours of a mushaf page. Defined once as CSS
variables in `frontend/src/app/globals.css`, with a lamplit dark variant under `.dark`.
Light / dark / follow-the-device is chosen from the sun/moon button (next-themes).

| Token | Use |
|---|---|
| `background`, `card`, `muted` | Warm parchment surfaces |
| `primary` | Ink green: main buttons, links, selected state |
| `gold` (`text-gold`, `bg-gold`) | The ۞ mark, highlights, "today", accents — use sparingly |
| `accent` | Pale gold panels (notices, quotes) |
| `sidebar*` | Deep ink-green panels: sidebar, banners, hero, footer, player |
| `success` / `warning` / `info` / `destructive` | Statuses (present / late / excused / absent, overdue…) |

Rules:

- Never hard-code Tailwind palette colours (`emerald-600`, `red-700`…); use the tokens so both themes work.
- Dark ink-green panels (`bg-sidebar` + `girih-overlay`) are for one hero element per page at most.
- Numbers, codes and phones inside Arabic text: wrap in `dir="ltr"` / `<bdi>`.

## Type

- **Reem Kufi** (`font-heading`): page titles, card titles, big figures. `h1`/`h2` get it by default.
- **IBM Plex Sans Arabic** (`font-sans`): everything else.

## Motif

- `components/brand/star-mark.tsx` — `<StarMark>`: the rub el hizb ۞, the sign that opens
  every thumn (the unit the hifz tracker counts in). Logo, page-title ornament, empty images.
- `girih-overlay` utility: a faint lattice of eight-pointed stars in the current text colour,
  drawn behind a dark panel's content.

## App shell (`components/app-shell/`)

- **Sidebar** (desktop): sections التعليم / الطلبة والإطار / المالية / الموقع / الإدارة,
  defined in `nav.ts` (`group`). Active page: gold bar + gold icon. Collapses to an icon
  rail; the choice is kept per browser (`localStorage`, best effort).
- **Search palette**: `Ctrl+K` or `/` — pages, and for the office students by name or code
  (`command-palette.tsx`). Arabic matching ignores hamza forms, ta marbuta and harakat.
- **Phone tab bar**: the four pages a role uses most + «المزيد» (full menu).
  Office: dashboard, students, attendance, payments. Teachers: dashboard, imla'at, attendance, hifz.
  Anything fixed to the bottom of a page must sit above it: use `sticky bottom-[4.75rem] lg:bottom-4`
  inside the content, never `fixed bottom-0` (see the attendance save bar).

## Ergonomics rules

- Touch targets ≥ 36 px (buttons/inputs are `h-9`; primary actions `size="lg"` = 40 px;
  attendance status buttons 40 px).
- Daily flows take the fewest taps:
  - Attendance: week strip (Saturday → Friday) to change day, everyone starts present, tap
    the absent ones, one save bar with live counts.
  - Payment: pick student → "full amount due" chip → method as buttons → save.
  - Students: whole row opens the student; on phones a card list with a call button.
- Choices with ≤ 5 options: segmented buttons, not a dropdown.
- Lists show skeletons while loading and a dashed empty state, never a blank area.
- Destructive actions are separated (end of row / ghost red) and confirmed.

## Components touched

`ui/button`, `ui/input`, `ui/select`, `ui/textarea`, `ui/card`, `ui/table`, `ui/tabs` were
resized/restyled in place (shadcn files are ours to edit). `page-header.tsx` carries the
title ornament and the back button.
