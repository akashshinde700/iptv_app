# 4. Web Application Audit

Surfaces: the customer app (`/`), operator admin (`/` → Settings → Operators), platform console
(`/platform`), signup (`/signup`).

**What could be tested here:** route handlers, server modules, unit tests, lint, types, and the
rendered HTML of `/` on a local dev server. **What could not:** anything requiring a live MySQL
database (Prisma engines cannot be downloaded in this sandbox — see
`FINAL_PROJECT_AUDIT_REPORT.md` §Environment), and real-browser interaction (no browser
automation available). Statements below are therefore either source-verified or marked
`needs browser`.

---

## 4.1 Navigation

| Item | Finding |
|---|---|
| In-app view stack | Sound: top-level views reset to `Home → section`, others push; `replace()` used for next/prev channel; scroll + focused element restored per entry (`lib/store.ts`, `lib/back.ts`). |
| Back button | Centralised: overlay → fullscreen → screen handler → pop → "Exit?" (native). Verified in `lib/back.ts`. |
| Browser/desktop Back | Guard history entry pushed while depth > 1. Sound, but **no URL change** — see next row. |
| URL / deep links | Broken: no route changes, no `/watch/:id`, no `/admin`. **BUG-01, BUG-02** (fixed). |
| Admin entry | Only via Settings → Operators (or `#admin` hash). Contributes to "feels complicated". **UX-03** (fixed: `/admin` now opens the panel). |
| 404 handling | Next default page. **UX-04** (fixed). |
| Sidebar / bottom tabs / TV header | Consistent per platform; no dead items found. |
| Breadcrumbs | Not used; back + section title serve the role. Fine for this app shape. |

## 4.2 Buttons & interactive elements

Method: enumerated every `<Button>`/`<button>` and traced each `onClick` to an API call or state
change. 69 buttons in the admin module alone.

| Class | Result |
|---|---|
| Dead buttons (`onClick` does nothing) | 0 found |
| Buttons that call a non-existent endpoint | 0 found (checked every URL against `src/app/api`) |
| Buttons whose endpoint returns 404 at runtime | **3 download targets** (`/downloads/*.apk`, `*.exe`) — BUG-03 (fixed) |
| Destructive actions without confirmation | 0 (all have some confirmation) |
| Destructive confirmations that are unstyled / D-pad-hostile | 4 `window.confirm()` sites — BUG-11 (fixed) |
| Buttons stuck in a loading state on error | 0 — mutations all reset via `onSettled`/`finally` |
| Buttons that report success on failure | 1 pattern: `PortalsSection` sync used to toast success before the sync result; now driven by the API result (fixed earlier in this branch) |
| Double-submit protection | Present on the important flows (login, signup, billing) via `isPending` |

## 4.3 Forms & validation

* Client-side: required fields + inline messages on signup, admin login, customer login, plan and
  customer forms. Server re-validates everything (never trusts the client) — verified in
  `billing.ts`, `signup/route.ts`, `sources.ts`.
* **Gap UX-07:** a few admin forms allow submit with empty fields and rely on the server error.
  Cosmetic, listed, not fixed.
* **Mismatch found and fixed:** customer password minimum was 6 in the admin UI copy and 6 on the
  server (consistent) while operator signup enforces 8 — different rules for different
  principals is intentional, but the admin form now states "6+ (customers)" to avoid confusion.

## 4.4 Keyboard shortcuts

| Shortcut | Where | Verdict |
|---|---|---|
| `/` | global (not TV, not typing) | works, ignores inputs, prevents default |
| `Ctrl/⌘+F` | global | hijacks the browser's find — intentional (search), documented |
| `Escape` | global | overlay-aware: replays into Radix, never double-fires |
| Arrow keys / D-pad | TV + desktop app (`use-spatial-nav`) | works, with focus rescue |
| `F11` | desktop app | toggles fullscreen (in `desktop/main.js`) |
| `Alt+Left`, mouse back | desktop app | maps to the app's Back |
| `Space`/`K` play/pause | player | present |

No conflicting or inaccessible shortcuts found. Every handler ignores events while the user is
typing, and `handleBack()` never fires twice for one key press (`isSyntheticEscape`).

## 4.5 State & data layer

* TanStack Query keys are stable and invalidated after mutations (`invalidateQueries` in each
  section) — no stale-screen bugs found.
* `retry` is disabled for 403 so the plan upsell is not retried in a loop. Good.
* Two clients with different error contracts → **SEC-08** (fixed).
* `lib/store.ts` persisted shape has no version guard → **BUG-15** (fixed).

## 4.6 Performance observations

| Item | Detail | Status |
|---|---|---|
| Bundle | hls.js and the player are imported by `WatchView` only (no global import) — good | OK |
| Whole-catalog aggregation | `/api/meta` (10 min cache) and `computeAccessSummary` (uncached) | BUG-08 OPEN |
| List endpoints | all paginated, `pageSize` capped (60/100) | OK |
| Images | channel logos are remote; no `next/image` optimisation (remote patterns not configured) | OPEN (low) |
| Query waterfalls | `MediaTitleView` and `WatchView` fetch sequentially per id — acceptable | OK |

## 4.7 Accessibility

* Skip link: absent (app shell has no "skip to content" affordance) — OPEN.
* Focus ring: removed on a handful of custom tab buttons (UX-09) — OPEN.
* All icon-only buttons carry `aria-label` (verified by grep) — OK.
* Modals: Radix Dialog/AlertDialog with focus trap and `aria-describedby` — OK.
* Colour contrast on `text-zinc-500` over `#09090b` ≈ 4.0:1 (AA for normal text needs 4.5:1) — OPEN, low.

## 4.8 Web verdict

Functionally the web app is in good shape: navigation, back handling, optimistic UI and error
mapping are consistent and there are no dead API calls. The one systemic defect was
**routing/deep links**, which additionally broke the iOS feature set; it is fixed in this audit.
