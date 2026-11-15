# Touchline — Development Notes

Living document. Update it at the end of every coding session so the next
session (human or AI) can pick up without losing context.

_Last updated: 15 Nov 2026 — Milestone 5 step 5a (match engine, no UI) complete; 5b (match screen) next._

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
    (tabs)/              bottom tabs: index (Home), squad, tactics (Lineup /
                         Instructions views), fixtures, club
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
    team/                TeamSelectionPanel, Pitch, player picker
    tactics/             TacticsScreen shell, InstructionsPanel, option labels
  game/                GAME SYSTEMS: pure TS, no React imports
    positions.ts         position groups and names
    ratings.ts           positionRating(): weighted 1–20 suitability per position
    formations.ts        5 formations as 11 slots with pitch coordinates
    lineup.ts            Lineup schema + immutable ops, autoPick, validateLineup
    squad/               positionFit/effectiveRating, view-model selectors
    tactics/             Tactics schema, playing-style presets, assistant analysis
    ai/opponent.ts       AI club setup: best formation + style for the strength gap
    match/               buildMatchTeam (store state → engine input), lineupStrength
  engine/              SIMULATION ENGINE: pure TS, seeded, no React/store imports
    simulate.ts          minute loop: possession → fouls → chance/shot → fatigue → subs
    team-state.ts        on-pitch players, energy, unit strengths, replacements
    tactical-effects.ts  instructions → numeric modifiers
    summarise.ts         events → score, team/player stats, ratings (one source of truth)
    ratings.ts, commentary.ts, types.ts
    __fixtures__/        test helpers (outside __tests__ so Jest doesn't run them)
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

### Tactics (Milestone 4)

- **Six instructions, each a small ordered enum:** mentality (5 levels),
  passing, tempo, width, defensive line, pressing (3 each). Enums, not
  numbers: easy to show and explain; the engine maps them to effects in M5.
- **Formation stays on the Lineup**; `Tactics` is only *how* the team plays.
  Both live side by side in the store.
- **Playing style is derived, never stored.** `matchPlayingStyle(tactics)`
  finds the preset whose instructions match exactly, else null ("Custom").
  Six presets with our own names: Balanced, Possession, Counter-attack, High
  press, Low block, Wing play. Tested: valid, distinct, self-consistent.
- **No numeric effects yet (deliberate).** Turning tactics into engine
  numbers is M5's job, where they can be tuned against simulated results.
- **Assistant analysis** (`analyseTactics`) instead: consistency rules
  (contradictory instructions) + suitability rules comparing the instruction
  with the attributes of the unit it relies on, judged by the *slot* a player
  fills. Average < 10 → warning, ≥ 14 → positive. Weaker clubs see more
  warnings, which is intended.
- **`INSTRUCTION_OPTIONS` uses a mapped type** (`{ [K in Instruction]:
  readonly Tactics[K][] }`) so generic code can index it with a key `K` and
  get `Tactics[K][]` without casts.
- **Lineup / Instructions switch is local state**, not a URL param, for the
  same static-web hydration reason as the picker.

### Match engine (Milestone 5)

- **`simulateMatch({ home, away, seed })`** is pure and deterministic. One
  seeded RNG, consumed in a fixed order. Engine imports only `src/data` types
  and pure `src/game` modules (ratings, formations, position fit); never the
  store or UI. (`src/game/match` imports engine *types* only.)
- **Minute model:** 90' + random stoppage (1–4, 2–6). Each minute: possession
  (control strength + tactics + home edge) → both sides may foul (the side
  without the ball ×1.4) → the side with the ball may shoot (attack vs defence
  + tactics) or a defender wins it → fatigue → substitutions at 60/70/78/85'.
- **Shots:** chance type (through ball, cross, long ball, long shot, set
  piece; mix shaped by tactics) → shooter weighted by slot + skill → xG from
  type × shooter vs defenders × tactics (high line: pace gap matters) → goal
  vs keeper skill, else saved / blocked / wide.
- **Attributes as they count now** = base × position familiarity (1 / 0.93 /
  0.8) × tiredness (100% fresh → 70% at 0 energy). Red cards shrink unit
  strength by players/11.
- **Events are the single source of truth.** The simulation emits events +
  appearances + possession minutes; `summarise()` derives score, stats,
  player stats and ratings from them. Commentary is a separate pure function
  (`describeEvent`), deterministic via a hash of the event.
- **Input guard:** squads must not share player ids (they key all stats).
  Tests that need two equal sides use `mirror()` from `__fixtures__`. This
  was found because equal-team tests first used the same club twice and
  silently corrupted player stats.
- **Calibration** (`__tests__/calibration.test.ts`, fixed seeds, ~3,500
  matches): equal teams 2.6 goals, H/D/A 48/25/28, 0-0 7%, 11.7 shots/team,
  39% on target, 11% conversion, 20 fouls, 3.4 yellows, 0.16 reds, 4.2 subs.
  Strongest v weakest at home 82/11/7. AI round robin 3.1 goals.
- **Balancing lesson:** direction tests passed but effect sizes showed
  possession play winning 61% vs 48% baseline with no downside. Short/slow
  now cost chance creation per minute; style spread is now ~42–54%. Measure
  effect *sizes*, not just directions, after any tactics change.
- **AI opponent:** strongest-XI formation; style chosen from the band for the
  strength gap (favourites press/possess, underdogs counter/low block),
  scored by the M4 analysis with a preference for the band's default style.
- **Performance:** ~3–4 ms per match. The full test suite takes ~25 s, mostly
  calibration.

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

### Milestone 4 — Tactics ✅
- `src/game/tactics`: Tactics schema + `setInstruction`, 6 playing styles +
  `matchPlayingStyle`, `analyseTactics` (4 consistency + 5 suitability rules).
- Store: `tactics` state, `setInstruction` and `applyPlayingStyle` actions;
  `useTacticsView()` hook.
- Tactics tab: header summary (formation · style · avg rating), Lineup /
  Instructions switch. Instructions view: style chips (Custom badge when no
  match), assistant notes, six instruction rows with a hint for the
  selected option. `TeamSelectionScreen` became `TeamSelectionPanel`.
- New UI: `SegmentedControl`; `ChoiceChips` accepts `null` (nothing selected);
  check and assistant icons.
- Tests: 257 total (41 new).
- Verified: `tsc` clean, tests pass, Android + web export, web driven in
  headless Chrome at 412px and 1280px (style apply, instruction change →
  Custom + warnings, view switching). Zero console errors, no overflow.

### Milestone 5 — Match engine (in progress)
**5a — Engine ✅** (no UI yet)
- `src/engine`: simulation, team state/fatigue/subs, tactical effects,
  summary/ratings, commentary. `src/game/ai/opponent.ts`, `src/game/match`.
- `rng.pickWeighted` added to the seeded RNG.
- Tests: 318 total (61 new): invariants over 150 matches, determinism, input
  guard, module tests, AI tests, statistical calibration incl. tactics.

**5b — Match screen (next):** see section 5.

### Known issues / not yet verified
- **Not yet run on a physical Android device or emulator** (bundles compile; run
  `npm start` and open in Expo Go to confirm).
- `expo-doctor` couldn't complete its online checks in the build environment;
  re-run locally: `npx expo-doctor`.
- ESLint isn't configured yet (`npm run lint` will offer to set it up).
- App icon / splash images are still the Expo defaults (backgrounds recoloured to
  Touchline navy). Replace with real Touchline artwork later.
- Fonts are system fonts. A custom typeface can be added via `expo-font` later.
- **Lineup and tactics aren't saved**: they reset on app reload
  (persistence is M10, or earlier if it becomes annoying).
- The modal picker and profile were checked on web only; native gestures
  (swipe-to-dismiss on iOS, Android back button) still need checking in Expo Go.
- Long names are truncated in the picker when a fit pill is shown (acceptable,
  full name is in the accessibility label).

## 5. Next steps — Milestone 5 step 5b: Match screen

Agreed with the user (all recommendations accepted):
- Friendly vs any league club (default: dashboard's next opponent), user
  picks home/away. Nothing recorded (fixtures/table are M6).
- Engine runs instantly; the screen **replays** it as a live feed (events
  minute by minute with commentary and running score, skip to full time).
  Replay is pure UI over the finished `MatchResult`.
- Store: `lastMatch` + `playMatch(opponentId, venue)` (seed from time; AI
  opponent via `buildAiTeam(db, id, lineupStrength(userLineup))`).
- Route `src/app/match.tsx` (static, no params → no hydration issue; state
  in store), `src/features/match/`: pre-match, live feed, result (score,
  timeline, stats bars, player ratings, player of the match).
- Wire the dashboard "Play match" button. Block kick-off if the lineup has
  errors (`isLineupPlayable`).
- Open questions for later: user substitutions during a match (interactive
  mode), injuries (M8).
