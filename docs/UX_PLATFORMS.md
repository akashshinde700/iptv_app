# StreamKaro — platform UX, navigation & Back behaviour

One shared app (same components, API layer, business logic and theme tokens) with five
interaction models. The platform is decided once at start-up in `src/lib/platform.ts`
and stored in `useAppStore` (`platform`, `isNativeShell`, `isElectron`).

Native shells are detected two ways: Capacitor (`Capacitor.isNativePlatform()` — Android /
Android TV) and the injected `window.StreamKaroNative` object (the iOS app in `ios/`, built
with xtool). Both set `isNativeShell: true`, so the web UI drops install nags, skips the
service worker and uses the in-app "Exit StreamKaro?" prompt at the root.

| Platform | Detected by | Layout | Input |
|---|---|---|---|
| **Android TV** | Android shell + `AppUpdater.getInfo().isTv` (no touch screen as the first guess); smart-TV browsers by user agent; **TV Mode** toggle on the web | `TvHeader` (Home · Live TV · Search · Favorites │ Plan · Profile · Settings), 10-foot type scale (`html.tv-mode`), no footer / ads / bottom tabs | D-pad, OK, Back, Play/Pause, channel keys |
| **Android mobile** | Android shell with a touch screen; phones in a browser | `MobileHeader` + `BottomNav` (Home · Channels · Search · Favorites · Profile), filter bottom sheet, category chips | Touch, back gesture |
| **iPhone / iPad (app)** | `window.StreamKaroNative.platform === "ios"` (native SwiftUI shell) | `MobileHeader` + `BottomNav`; portrait browsing, landscape video, left-edge swipe = Back, Picture-in-Picture + AirPlay | Touch |
| **Windows** | Electron user agent | `SideNav` sidebar + content, no footer | Mouse + keyboard (arrow-key focus navigation, `/`, Esc, Space/K, F11, mouse Back) |
| **Web** | everything else | Sidebar from `md` (icon rail) / `lg` (full), header + bottom tabs below `md`, footer | Mouse, keyboard, touch |

`?platform=tv|mobile|desktop|web` forces a mode for the browser session (QA / demos),
`?platform=auto` clears it. In development `?shell=native` simulates the Android app
(Back → exit prompt).

## Navigation map

```
Home
├── Live TV (Channels)  ── category rail · Favorites · Recently watched · filters
│   └── Player
├── Search ── results
│   └── Player
├── Favorites ── Player
├── History ── Player
├── Subscription (plans)
├── Profile (login when logged out)
└── Settings ── Admin panel (web / Windows only)
```

* `navigate(view)` — top-level sections reset the stack to `Home → section`; everything
  else (the player, a similar channel) is pushed on top.
* `replace(view)` — previous / next channel (does not grow the stack).
* `goBack()` — pops one screen and hands the saved **scroll offset + focused item**
  (`data-focus-key`) back to `AppShell`, which restores both once the list has rendered.
* Filters, the search query and the channel list the player was opened from live in the
  store, so Back returns to the same category, page, results and card.

## Back — one pipeline (`src/lib/back.ts`)

Every source calls `handleBack()`: the Android shell (`MainActivity` →
`window.__skBack()`), Escape / TV remote back keys (`AppShell`), and the browser /
Electron back button (a single history "guard" entry while the stack is deeper than
Home).

1. close the top overlay (dialog, filter sheet, dropdown, exit prompt)
2. leave fullscreen
3. screen handlers registered with `useBackHandler`
4. pop the navigation stack
5. at Home: Android app → **"Exit StreamKaro?"** prompt (Cancel focused); web → browser default

| Screen | Back |
|---|---|
| Player (TV, full-screen native player) | → the list it was opened from (same card focused) |
| Player (web player) | exits fullscreen first, then → previous list |
| Channels / Search / Favorites / History / Subscription / Profile / Settings | → Home |
| Filter panel, any dialog | closes it, stays on the screen |
| Login | → previous screen (Home) |
| Home (Android app) | exit prompt — Back again = Cancel, **Exit** closes the app |
| Home (web) | browser default (leaves the site) |

If the page cannot answer (not loaded, very old site), `MainActivity` falls back to the
system default.

## Remote control map (Android TV)

| Key | Action |
|---|---|
| D-pad ↑ ↓ ← → | move focus to the nearest item in that direction (stays inside open dialogs; entering the category rail / a row returns to the item last focused there) |
| OK | activate; on the web player: play / pause |
| Back | see the table above |
| Play/Pause | play / pause |
| Channel ▲ / ▼, Next / Previous | next / previous channel in the list the channel was opened from |
| Menu (native player) | jump to the player's option buttons |

Every screen puts focus on its most logical element (`data-autofocus`): Home → first
channel (or **Log in** for guests), Channels → first card, Search → search box, Login →
Login ID. If a focused item disappears (a filter swaps the results), focus moves to the
same region instead of being lost.

## Player: zapping, reconnect, errors

* TV, focus on the player (controls hidden in the native player): **↑ / ↓ = previous / next
  channel** from the list the channel was opened from. OK shows the controls. The web
  player also has ⏮ ⏭ buttons; keyboards use PageUp / PageDown, remotes Channel ▲ / ▼.
* Loading states say what is happening: "Connecting to channel…", "Buffering…",
  "Reconnecting… 1/3" (web player, max 3 spaced retries; native player 3 retries).
* After that: "This channel is currently unavailable." with **Retry**, **Try next
  source** (when the channel has more), **Next channel**. No raw technical errors.
* Back online after a failure → the player retries by itself; the app shows
  "Connection restored" (offline banner while disconnected).

## Search, reminders, first run

* Search remembers the last 8 searches that found something ("Recent searches", Clear),
  offers category shortcuts, and "Clear search" on no results.
* Home and Subscription show "Your plan expires in N days" from 7 days before expiry.
* First TV launch: one "Using your remote" screen (arrow keys, OK, Back, zapping), never again.
* Windows / web keyboards: `/` or Ctrl+F opens Search.

## Audio

* Default: **sound on**. `readMutedPreference()` is `false` unless the viewer muted.
* Mute / unmute and volume are saved only when the viewer changes them
  (`src/lib/player-prefs.ts`) and survive channel changes, player reloads and app resume.
* Browser autoplay policy: if the browser refuses playback with sound, the web player
  starts muted **without saving that**, and shows a "Tap to unmute" button.
* Android app / Windows app allow autoplay with sound (WebView
  `setMediaPlaybackRequiresUserGesture(false)`, Electron `autoplayPolicy`).
* Settings → Playback → "Start channels with sound" switches the saved preference.

## TV design system (`src/app/globals.css`)

* Root font size `clamp(16px, 1.45vw, 30px)` — all rem sizes, spacing and card grids
  scale together on 720p / 1080p / 4K TVs.
* Minimum text 0.75rem; no hover-only affordances.
* Focus: thick outline + offset on everything; channel cards also lift (scale 1.06) with
  a ring + shadow; nav / rail items fill with the brand colour. Selected = persistent
  tint + side bar. Disabled = 45 % opacity.
* Focused items keep a scroll margin so they never sit under the screen edge.

## QA

Automated browser QA covering remote-only TV flows, the Android Back/exit behaviour
(via `?shell=native`), Windows keyboard, mobile touch, browser Back and 13 resolutions
(360×640 … 3840×2160) is described in the worklog (audit-13). Things that need a real
device: the hardware Back key path through `MainActivity`, the TV IME, the native
player and autoplay on specific TV WebViews.
