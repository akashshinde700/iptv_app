# 8. UI/UX & Responsive Audit

Method: component inventory + class review + rendered HTML of the dev server. **No browser
automation was available**, so viewport-specific claims are marked `needs browser` unless they
follow directly from the utility classes (e.g. `overflow-x-auto`, `hidden md:block`).

Screens reviewed: Home, Live TV, Player, Watch, Movies hub, Title/Episode, Search, Favorites,
History, Premium, Profile/Account, Settings, Downloads, admin (9 sections), platform (9 sections),
signup, admin login, platform login.

---

## 8.1 Consistency

| Axis | Observation |
|---|---|
| Colour & brand | Consistent dark `#09090b` + amber accent. The admin panel uses `zinc-900/60` cards and `amber-*`, matching the app shell — good. |
| Typography | `font-extrabold tracking-tight` headings everywhere; TV scales via `html.tv-mode` root font-size. Consistent. |
| Spacing | `space-y-4`/`-5` rhythm in panels, but the admin has a few `space-y-2` sections that read cramped next to platform screens. Minor. |
| Radii | Two idioms: `rounded-lg` (admin/platform) vs `rounded-2xl`/`3xl` (customer app). Defensible (denser admin), but a `--radius` token would remove opinion. |
| Copy tone | **Inconsistent** (UX-01): Hinglish and English mixed *within* the same screen ("Channels delete karein?" next to "Delete selected"). No i18n layer. |
| Empty states | Customer views have good ones (`StateView`); several admin tables just show an empty `<tbody>` (UX-02). |
| Loading | Skeletons only in a couple of places; elsewhere a "Load ho raha hai…" row. Acceptable, inconsistent. |
| Error states | Good in customer app (`StateView`, upsell for 403); admin relies on toasts, leaving the table blank on failure (UX-02). |
| Confirmations | Customer app uses Radix `AlertDialog`; admin uses `window.confirm` (BUG-11, fixed). |
| Icons | Lucide throughout, consistent size/stroke. Good. |

## 8.2 Destructive-action safety

* `window.confirm()` sites (4) blocked the main thread, looked alien and are unusable from a TV
  remote → replaced by a shared, keyboard-navigable `ConfirmDialog` (fixed).
* Bulk channel delete shows a count in the confirmation. Good.
* Customer delete does not mention that sessions are revoked — copy improvement suggested.

## 8.3 Forms

* Labels are real `<Label htmlFor>` pairs except two `Input`s inside the admin plan dialog that
  rely on placeholder text (accessible-name gap, OPEN/low).
* Password fields have `autoComplete="current-password"` / `new-password` — good.
* Validation messages appear inline; no field-level `aria-invalid` (OPEN/low).

## 8.4 Responsive

| Screen | 320–390 px | 390–768 | 768–1024 | ≥1024 | Evidence |
|---|---|---|---|---|---|
| App shell | 1 col + bottom tabs | same | sidebar rail | full sidebar | `md:pl-20 lg:pl-64`, `BottomNav` hidden ≥ md |
| Home | hero stacks, chips wrap | ok | 2 cols | 3–5 cols | `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` |
| Browse | filter sheet | sheet | inline filters | inline + rail | `BrowseView` |
| Player | controls wrap (fixed) | ok | ok | ok | `flex-wrap` + responsive select widths |
| Watch | stacks | ok | 2 col | player + rail | `WatchView` |
| Admin | nav becomes a horizontal scroll strip | same | same | vertical 56-wide sidebar | `overflow-x-auto lg:flex-col` |
| Admin tables | horizontal scroll | same | same | fits | `overflow-x-auto` wrappers |
| Platform tables | horizontal scroll, no sticky first column (RSP-02) | | | | `overflow-x-auto` only |
| Download cards | 1 col | 1 col | 2 col | 2 col | `sm:grid-cols-2` |
| Dialogs | `max-h` + scroll (`DialogContent`) | ok | ok | ok | shared component |
| Signup / logins | single card, `max-w-md`, 24 px padding | ok | ok | ok | |

No fixed-width element that would force horizontal page scroll was found (no bare
`w-[900px]`, `min-w-[…]` outside tables). Touch targets: icon buttons are `h-9 w-9` (36 px) in a
few places — below the 44 px recommendation for phones (OPEN/low).

## 8.5 Comprehension & "feels complicated" (the operator's own complaint)

Adopted improvements already on this branch, verified in code:

* Admin menu reduced from 11 to 9 items with one-word hints; the two near-identical "sources"
  entries became **My sources** (portals) and **Channel sources** (per-channel failover).
* Adding a source is one click (create → import → health pass → toast with counts) instead of
  three separate buttons.
* **Auto-fix** section: one "Scan & fix now" button, plain-language stats, restore list.
* Add-source dialog leads with *Playlist* and explains each tab in one sentence.
* Home hero states the automation in three chips instead of promising it in marketing copy.
* Settings gained "Watch anywhere" (playlist link + QR) and, on iOS, "App server".

Still open: an onboarding tour for a brand-new operator (their first 10 minutes are: no sources →
no channels → no plans → no customers), and a language switch (UX-01).

## 8.6 Design-system gaps

1. No `--radius` token (two idioms, see above).
2. No `Skeleton` usage discipline (only 2 screens).
3. Two toast conventions: `toast.success` vs inline `<p>` banners — both fine, but a rule would
   help ("toasts for actions, banners for state").
4. `zinc-*` hard-coded in admin/platform instead of the theme tokens used by the customer app —
   a theme switch (light mode) would not reach the panels.
