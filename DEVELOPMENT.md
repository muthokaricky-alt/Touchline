# Touchline — Development Notes

Living document. Update it at the end of every coding session so the next
session (human or AI) can pick up without losing context.

_Last updated: 15 Nov 2026 — Milestone 3 (Squad management) complete._

---

## 1. Stack (as installed)

| Area | Choice | Version |
| --- | --- | --- |
| Framework | Expo (managed, CNG — no `android/` / `ios/` folders committed) | SDK 58 |
| UI | React Native + React Native Web | RN 0.88, React 19.3 |
| Routing | Expo Router (file-based, routes in `src/app/`) | 58 |
| Language | TypeScript, `strict: true` | 6.0 |
| State | Zustand (`src/store/game-store.ts`) | 5 |
| Persistence | expo-sqlite (installed, not used yet) | 58 |
| Validation | Zod (schemas in `src/data/schemas`) | 4 |
| Icons | expo-symbols (SF Symbols on iOS, Material Symbols on Android/web) | 58 |
| Tests | Jest + jest-expo preset | Jest 30 |

React Compiler and typed routes are enabled in `app.json` (`experiments`).

## 2. Architecture

```
src/
  app/                 PRESENTATION: routes only (Expo Router). Keep these files thin.
    _layout.tsx          root providers + stack (tabs, player profile, picker modal)
    (tabs)/              bottom tabs: index (Home), squad, tactics (team selection),
                         fixtures, club
    player/[id].tsx      player profile (exports generateStaticParams for web)
    select-player.tsx    modal picker: ?target=<slotId>|bench
  components/
    ui/                  design-system primitives (AppText, Card, Button, ListRow,
                         RatingBadge, PositionBadge, ChoiceChips, PageHeader…)
    ComingSoonScreen.tsx placeholder for tabs belonging to later milestones
  features/
    dashboard/           a feature = its screen, components, view-model types,
    squad/               and pure helpers (+ tests)
    player/
    team/                team selection screen, Pitch, player picker
  game/                GAME SYSTEMS: pure TS, no React imports
    positions.ts         position groups and names
    ratings.ts           positionRating(): weighted 1–20 suitability per position
    formations.ts        5 formations as 11 slots with pitch coordinates
    lineup.ts            Lineup schema + immutable ops, autoPick, validateLineup
    squad/               positionFit/effectiveRating, view-model selectors
  store/               Zustand: game-store.ts (state + actions), hooks.ts (view-model hooks)
  data/                DATA: pure TS, no React imports
    schemas/             Zod schemas + inferred types (Player, PlayerAttributes,
                         Contract, Club, League, GameDatabase)
    integrity.ts         cross-record checks (references, duplicates)
    load.ts              parseDatabase(unknown) → result; entry point for outside data
    fictional/           hand-written clubs/league + seeded squad generator
  theme/               design tokens (colours, spacing, radii, typography, layout)
  types/               small shared primitives (MatchOutcome)
  utils/               pure helpers with no React imports (formatting, maths,
                       dates, seeded RNG)
```

Planned (not created yet; don't create empty folders):

```
  engine/              SIMULATION ENGINE: pure TS, no React/RN imports (Milestone 5)
  persistence/         PERSISTENCE: SQLite repositories behind interfaces (M10, earlier if needed)
```

Data flow: `buildFictionalDatabase()` → **store** (raw state) → **selectors**
in `src/game` (pure) → **view models** → feature **screens**. Store actions only
call pure functions from `src/game` and save the result.

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

### Data model (Milestone 2)

- **Zod schema is the source of truth; types come from `z.infer`.** Never
  hand-write a type that duplicates a schema. Zod guards data coming from
  outside (imports, saves); TypeScript guards our own code.
- **`z.strictObject` everywhere** so unknown keys (typos in imported data) fail.
  No `.transform()`, so a schema's input and output types are identical.
- **A player is three records linked by `playerId`:** `Player` (identity),
  `PlayerAttributes` (1–20, grouped technical/mental/physical/goalkeeping) and
  `Contract` (club, squad number, wage, dates). Each system only writes its
  own record; each maps to its own SQLite table later.
- **No `clubId` on Player.** A player's club comes from their contract; no
  contract = free agent. Squad number lives on the contract too.
- **Derived, not stored:** age (`ageOn(dob, gameDate)`), market value (M7),
  career stats (M5/M6, own record type).
- **Goalkeeping attributes** (handling, reflexes, aerialReach, oneOnOnes,
  kicking) added beyond the brief's list; every player has them, outfielders low.
- **Two-stage validation:** Zod per record, then `checkIntegrity()` for
  cross-record rules. `parseDatabase(raw: unknown)` runs both and returns
  `{ ok, database } | { ok: false, errors }` rather than throwing.
- **Database is flat arrays + a `version` field**, the same layout as future
  SQLite tables; bump `DATABASE_VERSION` on shape changes.
- **Fictional players are generated, not hand-written**, by a seeded RNG
  (`utils/random.ts`, mulberry32). Same seed → identical database (tested).
  Attributes = club level (from reputation) + position profile + noise.
  Changing the generator reshuffles players; that's fine until careers
  snapshot the database into a save (M10).
- **Competition is a league only.** `CompetitionSchema` becomes a
  discriminated union on `type` when cups arrive (M6).

### Squad management (Milestone 3)

- **User club = Greywater Town** (`DEFAULT_USER_CLUB_ID` in the store) until a
  new-career flow exists (M9).
- **Zustand selector rule:** select *raw* slices (`s.database`, `s.lineup`)
  and build view models in `useMemo` (see `store/hooks.ts`). Building a new
  object inside a Zustand selector makes every render look like a change →
  infinite re-render loop.
- **Lineup = `{ formationId, starters: slotId → playerId|null, substitutes }`**,
  with a Zod schema ready for saving. All lineup functions are immutable
  (return new objects) so React/Zustand detect changes by reference.
- **Ratings:** `positionRating` = weighted average of the attributes each
  position cares about. `effectiveRating` subtracts a familiarity penalty:
  natural 0, accomplished (secondary position) 1, unfamiliar 5. The penalty
  was raised from 3 to 5 after a test caught auto-pick playing a right winger
  at LM over a natural LM: with 3, position choice barely mattered.
- **Auto pick is greedy:** fill the scarcest slots first with the best
  remaining player; bench = backup GK + 6 best. Deterministic (ID tie-break).
- **Changing formation keeps the same XI** and re-seats them; it doesn't
  auto-pick. Out-of-position players then show as warnings.
- **Validation severity:** errors make a lineup unplayable (empty slot,
  duplicates, other club's player, bench > 7); warnings don't (outfielder in
  goal, unfamiliar position).
- **Team selection lives on the Tactics tab**; M4 adds instructions there.
- **Static web and dynamic routes:** `player/[id]` exports
  `generateStaticParams` (the seeded DB makes the list deterministic). The
  picker uses a search param instead of a path segment, and on web renders an
  empty frame until mounted, because its pre-rendered HTML has no query
  string (otherwise: hydration error on direct load).
- **Dashboard:** `buildDashboardSummary(db, clubId, preview)` uses real club,
  league/club names, squad size and finances; standings, form, dates and inbox
  stay preview until M6/M8. Preview standings are mapped onto real clubs by
  reputation so the user's club always appears.
- **Typed routes need generated types:** `.expo/types` (git-ignored) is created
  when `npx expo start` runs. On a fresh clone, start the dev server once
  before `npm run typecheck`, or route paths won't be type-checked.

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

### Milestone 2 — Football data ✅
- Zod schemas + inferred types: Player, PlayerAttributes (23 attributes in 4
  groups), Contract, Club, League, GameDatabase (`src/data/schemas`).
- `checkIntegrity()` (8 cross-record rules) and `parseDatabase()` loader.
- Fictional database: 8 invented clubs (reputation 9–16), 1 league
  ("First Division", 2 rounds, 3/1/0 points, 2 relegated), 176 generated
  players from a fixed seed. `buildFictionalDatabase(seed?)` in `src/data/fictional`.
- Utils: seeded RNG (`createRng`), ISO date helpers (`ageOn`, `parseIsoDate`, `toIsoDate`).
- Tests: 111 total (80 new): schema accept/reject cases, each integrity rule,
  fictional DB validity/determinism/realism, RNG, dates.
- No UI changes. Dashboard still uses `dashboard.preview.ts` (selector deferred
  to M3, when the squad screen needs real data).

### Milestone 3 — Squad management ✅
- Game logic (`src/game`): position ratings, position fit, 5 formations,
  lineup model + operations, auto pick, validation, squad/profile/team-sheet/
  picker selectors.
- Zustand store with the fictional database, user club, current date and lineup.
- Screens: Squad tab (grouped list), player profile (stack screen), Tactics
  tab = team selection (formation chips, pitch, bench, issues, auto pick),
  player picker (modal).
- New UI primitives: RatingBadge, PositionBadge, FitPill, IconButton,
  ChoiceChips, PageHeader; ListRow can be tapped; Screen `bottomInset`.
- Dashboard partly real (see decisions). `formatDate` util.
- Generator fix: no repeated surnames within a club (seen as four
  "Pemberton"s on the pitch). This reshuffled the fictional players.
- Tests: 216 total (105 new).
- Verified: `tsc` clean (with generated typed-route types), tests pass,
  Android + web exports bundle (web pre-renders all 176 player pages), web
  build driven in headless Chrome at 412px and 1280px: squad → profile, slot →
  picker → assign, formation change, direct loads of profile and picker. Zero
  console errors, no horizontal overflow.

### Known issues / not yet verified
- **Not yet run on a physical Android device or emulator** (bundles compile; run
  `npm start` and open in Expo Go to confirm).
- `expo-doctor` couldn't complete its online checks in the build environment;
  re-run locally: `npx expo-doctor`.
- ESLint isn't configured yet (`npm run lint` will offer to set it up).
- App icon / splash images are still the Expo defaults (backgrounds recoloured to
  Touchline navy). Replace with real Touchline artwork later.
- Fonts are system fonts. A custom typeface can be added via `expo-font` later.
- **Lineup isn't saved**: it resets to the auto-picked XI on app reload
  (persistence is M10, or earlier if it becomes annoying).
- The modal picker and profile were checked on web only; native gestures
  (swipe-to-dismiss on iOS, Android back button) still need checking in Expo Go.
- Long names are truncated in the picker when a fit pill is shown (acceptable,
  full name is in the accessibility label).

## 5. Next steps — Milestone 4: Tactics

Agree the plan with the user before coding. Likely shape:

1. `Tactics` model + Zod schema in `src/game/tactics.ts`: mentality, passing
   style, defensive line, pressing intensity, tempo/width (small enums or 1–5
   scales). Store it alongside the lineup.
2. Pure helpers that describe a tactic's effects as numbers the match engine
   (M5) will consume (e.g. risk, possession bias, stamina cost), with tests.
   Keep them simple; tune in M5.
3. Tactics UI on the Tactics tab (replace the "Coming in Milestone 4" card),
   reusing `ChoiceChips`.
4. Possibly presets ("Balanced", "Counter", "High press") to make it quick.

Do **not** start the match engine until Milestone 4 is done.
