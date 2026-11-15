# Touchline — Development Notes

Living document. Update it at the end of every coding session so the next
session (human or AI) can pick up without losing context.

_Last updated: 15 Nov 2026 — Milestone 1 (Foundation) complete._

---

## 1. Stack (as installed)

| Area | Choice | Version |
| --- | --- | --- |
| Framework | Expo (managed, CNG — no `android/` / `ios/` folders committed) | SDK 58 |
| UI | React Native + React Native Web | RN 0.88, React 19.3 |
| Routing | Expo Router (file-based, routes in `src/app/`) | 58 |
| Language | TypeScript, `strict: true` | 6.0 |
| State | Zustand (installed, not used yet) | 5 |
| Persistence | expo-sqlite (installed, not used yet) | 58 |
| Validation | Zod (installed, not used yet) | 4 |
| Icons | expo-symbols (SF Symbols on iOS, Material Symbols on Android/web) | 58 |
| Tests | Jest + jest-expo preset | Jest 30 |

React Compiler and typed routes are enabled in `app.json` (`experiments`).

## 2. Architecture

```
src/
  app/                 PRESENTATION: routes only (Expo Router). Keep these files thin.
    _layout.tsx          root providers + stack
    (tabs)/              bottom-tab group: index (Home), squad, tactics, fixtures, club
  components/
    ui/                  design-system primitives (AppText, Card, Button, StatTile…)
    ComingSoonScreen.tsx placeholder for tabs belonging to later milestones
  features/
    dashboard/           a feature = its screen, components, view-model types,
                         and pure helpers (+ tests)
  theme/               design tokens (colours, spacing, radii, typography, layout)
  types/               shared football primitives (grows in Milestone 2)
  utils/               pure helpers with no React imports (formatting, maths)
```

Planned (not created yet; don't create empty folders):

```
  engine/              SIMULATION ENGINE: pure TS, no React/RN imports (Milestone 5)
  game/                GAME SYSTEMS: squad, tactics, transfers, competitions (M3+)
  data/                DATA: schemas (Zod), fictional test DB, importers (M2)
  persistence/         PERSISTENCE: SQLite repositories behind interfaces (M10, earlier if needed)
  store/               Zustand stores: thin glue between game state and UI
```

### Rules that keep the layers separate

1. **Routes are thin.** A file in `src/app/` picks the data and renders a feature screen.
2. **Screens don't compute.** Feature screens receive ready-made view models
   (e.g. `DashboardSummary`) and only arrange components.
3. **Logic is pure TS.** Anything that calculates (table windows, formatting,
   later the match engine) lives in plain `.ts` files with no React imports, so
   it can be unit-tested in Node without rendering anything.
4. **No hardcoded values in components.** Colours, spacing and type sizes come
   from `src/theme/tokens.ts`; game data comes from props.
5. **Icons go through `Icon`.** Add new icons to the map in
   `src/components/ui/Icon.tsx` with an iOS and an Android/web name.

### Key decisions (and why)

- **JS tabs (`expo-router/js-tabs`) instead of native tabs.** They look the same
  on Android, iOS and web and are fully themeable. Native tabs follow each
  platform's look, which would fight the Touchline design.
- **Dark only.** `userInterfaceStyle: "dark"` in `app.json`; there's no light
  theme to maintain.
- **Static web output.** `web.output` changed from `server` to `static`. The game
  is offline/single-player, so there's no need for a server runtime. Static
  output pre-renders each route to HTML. This means **render must not depend on
  window size** (server and browser would disagree → React hydration error).
  That's why the dashboard uses flex-wrap columns instead of `useWindowDimensions`.
- **Preview data for the dashboard.** `features/dashboard/dashboard.preview.ts`
  holds clearly-labelled fictional data shaped as `DashboardSummary`. When real
  game state exists, write a selector `buildDashboardSummary(gameState)` and swap
  it in at `src/app/(tabs)/index.tsx`; the UI won't change.
- **Money as whole integers.** Avoids floating-point drift in finances.
- **Jest via jest-expo.** It's Expo's supported test setup, and it will also let
  us test components later. Pure-logic tests run fast (<1s).

## 3. Commands

```
npm install
npm start              # Expo dev server (press a for Android, w for web)
npm run android        # start + open on Android device/emulator (Expo Go)
npm run web            # start + open in browser
npm test               # Jest unit tests
npm run typecheck      # tsc --noEmit
npm run build:web      # static web export to dist/
```

Install new Expo/RN packages with `npx expo install <pkg>` so versions match the SDK.

## 4. Progress

### Milestone 1 — Foundation ✅
- Expo SDK 58 project cleaned of starter template (starter screens, hooks,
  theme, images and `reset-project` script removed).
- Design system: tokens + 10 UI primitives in `src/components/ui`.
- Navigation: root stack + 5 bottom tabs (Home, Squad, Tactics, Fixtures, Club).
- Dashboard: club header, next match, league snapshot, squad status, inbox, finances.
- Placeholder screens for future tabs, labelled with their milestone.
- Tests: 31 unit tests (formatting helpers, table window).
- Verified: `tsc` clean, tests pass, `expo export` bundles for **Android and web**,
  web build rendered and checked in a headless browser at phone and desktop widths
  with zero console errors.

### Known issues / not yet verified
- **Not yet run on a physical Android device or emulator** (bundles compile; run
  `npm start` and open in Expo Go to confirm).
- `expo-doctor` couldn't complete its online checks in the build environment;
  re-run locally: `npx expo-doctor`.
- ESLint isn't configured yet (`npm run lint` will offer to set it up).
- App icon / splash images are still the Expo defaults (backgrounds recoloured to
  Touchline navy). Replace with real Touchline artwork later.
- Fonts are system fonts. A custom typeface can be added via `expo-font` later.

## 5. Next steps — Milestone 2: Football data

1. Define Zod schemas + inferred TS types in `src/data/` for Player (identity,
   attributes 1–20, contract kept separate), Club and Competition.
2. Create a small fictional test database (e.g. 8 clubs × 22 players) as typed
   data, validated by the schemas in a test.
3. Add tests that check every generated/imported record passes validation.
4. Optionally: a `buildDashboardSummary()` selector that feeds the dashboard from
   this data instead of `dashboard.preview.ts`.

Do **not** start the match engine until Milestones 2–4 are done.
