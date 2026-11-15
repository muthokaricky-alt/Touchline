# Touchline — Development Notes

Living document. Update it at the end of every coding session so the next
session (human or AI) can pick up without losing context.

_Last updated: 15 Nov 2026 — Autosave step complete (after Milestone 6); next is Milestone 7 (Transfers)._

---

## 1. Stack (as installed)

| Area | Choice | Version |
| --- | --- | --- |
| Framework | Expo (managed, CNG — no `android/` / `ios/` folders committed) | SDK 58 |
| UI | React Native + React Native Web | RN 0.88, React 19.3 |
| Routing | Expo Router (file-based, routes in `src/app/`) | 58 |
| Language | TypeScript, `strict: true` | 6.0 |
| State | Zustand (`src/store/game-store.ts`) | 5 |
| Persistence | Zustand `persist` → expo-sqlite kv-store (native) / localStorage (web) | 58 |
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
    match.tsx            match day: league fixture or friendly → live replay → report
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
    match/               FixtureSetupScreen (league), MatchSetupScreen (friendly),
                         MatchCentreScreen, timeline.ts (pure), useReplay
    fixtures/            FixturesScreen (fixtures / table / stats), season-view.ts (pure)
  game/                GAME SYSTEMS: pure TS, no React imports
    positions.ts         position groups and names
    ratings.ts           positionRating(): weighted 1–20 suitability per position
    formations.ts        5 formations as 11 slots with pitch coordinates
    lineup.ts            Lineup schema + immutable ops, autoPick, validateLineup
    squad/               positionFit/effectiveRating, view-model selectors
    tactics/             Tactics schema, playing-style presets, assistant analysis
    ai/opponent.ts       AI club setup: best formation + style for the strength gap
    match/               buildMatchTeam, lineupStrength, prepareFriendly, newMatchSeed
    season/              Season/Fixture schemas, fixture generator, table, cup
                         (draws, rounds, ties), running player stats, season flow
                         (date-ordered play, promotion/relegation, roll over)
  engine/              SIMULATION ENGINE: pure TS, seeded, no React/store imports
    simulate.ts          minute loop: possession → fouls → chance/shot → fatigue → subs
    team-state.ts        on-pitch players, energy, unit strengths, replacements
    tactical-effects.ts  instructions → numeric modifiers
    summarise.ts         events → score, team/player stats, ratings (one source of truth)
    ratings.ts, commentary.ts, penalties.ts (shootout), types.ts
    __fixtures__/        test helpers (outside __tests__ so Jest doesn't run them)
  store/               Zustand: game-store.ts (state + actions + persist), hooks.ts (view-model hooks)
  persistence/         autosave: save.ts (schema + load checks), debounced-storage.ts,
                       storage.ts / storage.web.ts (platform storage), save-status.ts,
                       use-hydration.ts (load after mount, flush on background)
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
  (save slots / cloud saves: M10)
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

### Match screen (Milestone 5b)

- **Simulate instantly, replay visually.** `playFriendly` runs the engine and
  stores `lastMatch`; the screen reveals the finished timeline item by item
  (`useReplay`, one `setTimeout` per step so pause/skip/unmount never leak a
  timer). The engine knows nothing about the replay.
- **Seeds come from the clock in the store action** (`newMatchSeed`), never
  inside the engine. Tests pass an explicit seed.
- **Route state:** `/match` has no params. No `lastMatch` → setup; otherwise
  match centre (keyed by seed + clubs so a new match restarts the replay).
  Opponent/venue choice lives in the route so "Play another" remembers it.
- **Feed filtering** (`buildTimeline`): goals, cards, subs, whistles, and
  shots that were on target, blocked or a decent chance (xG ≥ 0.15). Tackles
  and plain fouls (~50 a match) are left out.
- **AI preview:** setup shows how the opponent will line up
  (`buildAiTeam` against the user's current XI strength).
- **Kick-off is blocked** while the lineup has errors (empty slots etc.).
- Friendlies aren't recorded anywhere.

### Competitions (Milestone 6)

- **Season state** (`src/game/season/season.ts`, Zod schemas ready for
  saving): label, start year, competition, seed, fixtures. Each fixture
  stores a **compact result** (score, goals, cards, per-player lines, POTM),
  not the engine's full event list. The table and player season stats are
  **always derived** from results, never stored.
- **Fixture generator:** polygon/circle method. Venue rule gives at most 2
  home/away in a row; the second leg is mirrored *and rotated one round*
  (plain mirroring created 3-in-a-row at the half-way point; reversing
  would schedule the same tie on consecutive weekends). Found by a probe
  across league sizes after the first version gave a club 7 home games
  in a row. Club order is shuffled per season with the season seed.
- **Dates:** Saturdays weekly from the first Saturday on/after 8 August.
  Date maths in UTC (`addDays`, `weekdayOf`) so time zones can't shift days.
- **Table order:** points → GD → goals for → head-to-head points among the
  tied clubs → club id. Zones: champion (tier 1, 1st), promotion, relegation.
- **Determinism:** fixture seed = hash(season seed, fixture id); next season's
  seed derives from the previous. Same season seed + same user choices →
  identical season (tested over a full season).
- **Flow:** `playUserFixture` plays the user's fixture, records it, then plays
  the matchday's AI-v-AI games (`buildAiTeam` both sides). Matchdays must be
  completed in order. `startNextSeason` only when complete.
- **Store:** `season`, `lastMatchFixtureId`, `playNextFixture`,
  `startNextSeason`; `currentDate` moves to the matchday's date.
- **Match route modes:** league fixture pre-match by default when one is due
  (opponent/venue fixed), "Play a friendly instead" toggle; after a league
  match the report adds the matchday's other results and "Continue". After
  the final matchday, Continue returns to the dashboard's season summary.
- **Dashboard** is now real apart from manager name, kick-off time,
  fitness/morale/injuries and inbox (preview until M8).

#### 6b: world size, multi-competition seasons, cup

- **World (user's decision):** one country, two 20-club divisions (38
  matchdays, 3 up / 3 down) + a 40-club National Cup. The model supports
  many countries; the other "major leagues" come as data in M7/M9 when
  transfers/job offers make them matter. 12 + 20 new clubs are short
  specs (`[name, short, reputation]`) expanded deterministically
  (`makeClub`); towns are invented. 880 players.
- **`Competition` is a discriminated union** (`league` | `cup`); `isLeague` /
  `isCup` narrow it. Adding it made `tsc` list every place that assumed
  "competition = league", which became the to-do list for the change.
- **Season = memberships + fixtures + running stats.** `leagues` holds this
  season's clubs per league (promotion changes it); `leagueForSeason`
  overlays them on the db league. `playerStats` are running totals per
  player per competition (per-match player lines would make a save ~4 MB;
  a full season now serialises well under 1 MB, tested).
- **Play is ordered by date** across competitions (league Saturdays, cup
  Wednesdays). `advanceToUserFixture` plays earlier dates AI-only first;
  `playRemaining` finishes a season once the user has no fixtures left
  (dashboard "Play out the season").
- **Cup:** drawn round by round (seeded) when the previous round completes;
  non-power-of-two fields get a first round from the lowest tier (40 → 32).
  Level ties → `simulateShootout` (pure, seeded; kick success clamped
  55–92%; stops as soon as decided, then sudden death), taken by the players
  who finished the match. Penalties live on `MatchResult.penalties` and the
  compact fixture result.
- **AI setup cache:** `aiSetup(db, clubId)` memoises squad/lineup/strength
  in a `WeakMap` keyed by the (immutable) database object, so it can't go
  stale and is freed with the db. Kick-off for a 20-match Saturday:
  ~48 ms in desktop Chrome.
- **Seeds:** `mixSeed` derives league/cup/next-season seeds. Bug caught by
  `SeasonSchema`: XOR results are signed in JS, giving a negative seed;
  fixed with `>>> 0` and tested over thousands of inputs.
- **Web export:** only the user's squad profiles are pre-rendered (23 pages,
  4.4 MB, was 177 pages / 12 MB); others open via in-app navigation.
- **Tests that encoded old assumptions** were rewritten to the real rules:
  auto-pick may play a clearly better player out of position, but never
  over an equally good unused natural; weak clubs' keepers are still
  clearly keepers (margin 2.5, not 4).

### Autosave (after Milestone 6)

- **One autosave slot**, Zustand `persist` on the game store. Saved:
  `worldSeed`, user club, date, lineup, tactics, season (`partialize`).
  Not saved: the database (rebuilt from its seed; must be saved once M7/M8
  change it, with a `SAVE_VERSION` bump + migration) and `lastMatch`.
- **Storage per platform** via Metro file extensions: `storage.ts` (native,
  `expo-sqlite/kv-store` sync API, in Expo Go) and `storage.web.ts`
  (`localStorage`). Not expo-sqlite on web: it needs wasm + COOP/COEP
  headers on every host.
- **Debounced writes** (`createDebouncedStorage`, 1 s): persist writes on
  every change and saves reach ~1 MB late in a season. Reads see pending
  values; `flushSave()` on AppState background (web: page hidden), tested
  in the browser by reloading inside the debounce window. Storage errors
  become a notice, never a crash.
- **Load validation** (`checkSave`): Zod `GameSaveSchema` + cross-checks
  (club exists, lineup players are the user's, season clubs/competitions
  exist, user in a league). Failure → keep the new game + notice. Other
  `SAVE_VERSION` → `migrate` returns a marker that `merge` rejects. No save
  at all (first launch) → silent: persist calls `merge(undefined)`, which
  was first mistaken for a damaged save (caught by a test).
- **Hydration:** `skipHydration` + `rehydrate()` after mount in the root
  layout (`useSaveHydration`); nothing renders until loaded (native keeps
  the splash screen via `expo-splash-screen`; web shows "Loading your
  career…", which is also the pre-rendered HTML, so no mismatch).
- **Save status is a separate small store** (`useSaveStatus`): putting
  "last saved at" in the persisted store would make each save trigger
  another save.
- **Tests:** platform storage is replaced with `jest.mock` + in-memory
  storage created *inside* the factory (jest.mock is hoisted above imports).
  `restartWith(file)` simulates an app restart faithfully (a reset is
  itself a change persist would save).
- UI: Club tab (club facts + Career save card with last-saved time and a
  two-step "Start new game"); dashboard notice banner; new `danger`
  Button variant for destructive actions.

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

### Milestone 5 — Match engine ✅
**5a — Engine ✅**
- `src/engine`: simulation, team state/fatigue/subs, tactical effects,
  summary/ratings, commentary. `src/game/ai/opponent.ts`, `src/game/match`.
- `rng.pickWeighted` added to the seeded RNG.
- Tests: 318 total (61 new): invariants over 150 matches, determinism, input
  guard, module tests, AI tests, statistical calibration incl. tactics.

**5b — Match screen ✅**
- Dashboard "Play match" → `/match`: choose opponent (default: dashboard's
  next opponent) and venue, see the AI's expected setup, kick off.
- Match centre: scoreboard (live/paused/half-time/full-time, screen-reader
  live region), live commentary feed with pause/resume and skip, then report
  tabs: timeline, stats bars, ratings (POTM). "Play another" / "Done".
- Store: `lastMatch`, `playFriendly`, `clearMatch`. Hooks:
  `useLeagueOpponents`, `useOpponentPreview`, `usePlayerNames`.
- Tests: 338 total (20 new).
- Verified: `tsc` clean, tests pass, Android + web export, full flow driven
  in headless Chrome at 412px and 1280px (setup → kick off → live → pause →
  skip → stats/ratings → play another remembers choice → done; direct load
  of `/match`). Zero console errors, no overflow.

### Milestone 6 — Competitions ✅
**6a — League season ✅**
- `src/game/season`: schemas, fixtures, table (+ tiebreakers), player season
  stats, season flow. Date utils (`addDays`, `weekdayOf`, `nextWeekday`),
  `formatMatchDate`.
- Store + dashboard on real season data; season-complete card with "Next
  season". Fixtures tab: matchdays, full table with zones + legend, top
  scorers / assists. League pre-match screen; friendly still available.
- Tests: 385 total (47 new) incl. a full simulated season (totals
  consistent, deterministic, rollover).
- Verified: `tsc` clean, tests pass, Android + web export; a complete
  14-matchday season played in headless Chrome at 412px and 1280px, then
  rolled over to 2027/28. Zero console errors, no overflow.

**6b — Two divisions, promotion/relegation, cup ✅**
- 40 clubs (2 × 20), 38-matchday leagues, National Cup (6 rounds, penalties).
- Season model: memberships, date-ordered play across competitions,
  running player stats, promotion/relegation at rollover.
- Engine: `simulateShootout`. AI setup cache.
- UI: Fixtures tab with competition chips, matchday pager, cup rounds
  view with penalties and the user's cup status; dashboard cup ties,
  "Play out the season", season summary with promoted/relegated and cup
  winner; cup pre-match ("Cup tie"), penalties line in the match report.
- Tests: 479 total (94 new) incl. a full two-division season with cup.
- Verified: `tsc` clean, tests pass, Android + web export; a complete
  2026/27 season (38 league + cup tie) played in headless Chrome at 412px
  and 1280px: user relegated, cup final decided on penalties, 2027/28
  starts in the Second Division. Zero console errors, no overflow.

### Autosave ✅
- `src/persistence` + persisted store; Club tab with save card; dashboard
  save notice; `startNewGame`; `danger` button.
- Tests: 502 total (23 new): debounced storage (fake timers), save
  validation cases, store round-trip/tamper/version/corrupt-JSON/first
  launch/new game.
- Verified: `tsc` clean, tests pass, Android + web export; in headless
  Chrome at 412px and 1280px: 2 matches → reload keeps matchday 3; reload
  inside the debounce keeps the match; tampered save → notice + new game;
  start new game → fresh after reload. Zero console errors.
- **Not yet verified on a device:** the native SQLite path and splash
  screen gate only run on Android/iOS (Expo Go).

### Known issues / not yet verified
- **Not yet run on a physical Android device or emulator** (bundles compile; run
  `npm start` and open in Expo Go to confirm).
- `expo-doctor` couldn't complete its online checks in the build environment;
  re-run locally: `npx expo-doctor`.
- ESLint isn't configured yet (`npm run lint` will offer to set it up).
- App icon / splash images are still the Expo defaults (backgrounds recoloured to
  Touchline navy). Replace with real Touchline artwork later.
- Fonts are system fonts. A custom typeface can be added via `expo-font` later.
- Pre-season, the table is in alphabetical order (all on 0 points), so the
  user's club can appear "1st" before a ball is kicked.
- Web only: directly loading the URL of a player profile from another club
  isn't supported (only the user's squad is pre-rendered); opening it
  within the app works.
- Squads are 22 players for 38 league games + cup; fine until injuries and
  suspensions arrive (M8), when 24–25 may be needed.
- The modal picker and profile were checked on web only; native gestures
  (swipe-to-dismiss on iOS, Android back button) still need checking in Expo Go.
- Long names are truncated in the picker when a fit pill is shown (acceptable,
  full name is in the accessibility label).

## 5. Next steps — Milestone 7: Transfers

Agree the plan with the user before coding. Likely shape and open questions:
1. **The database becomes mutable** (players change clubs, contracts
   change). It must then be **saved** (today it's rebuilt from its seed):
   bump `SAVE_VERSION`, add a migration from v1 (rebuild db from seed), and
   re-measure save size (880 players × attributes ≈ 0.5–1 MB on top of the
   season; consider saving only *changes* vs the generated world). The AI
   setup cache is keyed by the db object, so a new db object after a
   transfer naturally invalidates it.
2. **Other countries' leagues as data** (decided in 6b): when and how many,
   simulated or "dormant" until relevant.
3. Player **valuation** (age, ability, potential?, contract length,
   reputation) as a pure, tested function.
4. Transfer market: search/filter, bids, AI accept/reject/counter,
   **transfer windows** (summer/winter dates in the calendar), budgets.
5. Contracts & wages: offers, renewals, expiry → free agents; wage budget
   enforcement. AI clubs also buy/sell (keep it simple first).
6. Later ideas: `npm run test:calibration` if the suite gets slow (~30 s);
   user substitutions during a match; injuries (M8); save slots (M10).
