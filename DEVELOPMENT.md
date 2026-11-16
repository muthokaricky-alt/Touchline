# Touchline — Development Notes

Living document. Update it at the end of every coding session so the next
session (human or AI) can pick up without losing context.

_Last updated: 16 Nov 2026 — All ten milestones built, plus suspensions, in-match management, scouting and foreign leagues step A (save v10). Next: foreign leagues step B. Waiting on device testing (docs/DEVICE_TEST_CHECKLIST.md)._

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
    transfers.tsx        transfer market search
    negotiate.tsx        ?player=<id>: bid → terms → signed (snapshot of the target)
    inbox.tsx            messages; offer messages can be accepted/rejected
    training.tsx         training focus/intensity + young players' development
    new-career.tsx       manager name + club choice (tabs redirect here with no career)
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
    transfers/           TransfersScreen, NegotiationScreen, TransferCard (others'
                         players), ContractCard (own: list, renew, release, offers)
    inbox/               InboxScreen
    training/            TrainingScreen
    career/              NewCareerScreen
    club/                ClubScreen (facts, transfers, career save)
  game/                GAME SYSTEMS: pure TS, no React imports
    positions.ts         position groups and names
    ratings.ts           positionRating(): weighted 1–20 suitability per position
    formations.ts        5 formations as 11 slots with pitch coordinates
    lineup.ts            Lineup schema + immutable ops, autoPick, validateLineup
    squad/               positionFit/effectiveRating, view-model selectors
    tactics/             Tactics schema, playing-style presets, assistant analysis
    ai/opponent.ts       AI club setup: best formation + style for the strength gap;
                         rotation (aiSetupOn): rests tired starters, drops injured
    condition/           fitness, morale, injuries between matches (lazy
                         recovery, applyMatch); squad-care (lineup + medical news)
    development/         potential (assignPotential, ranges), monthly development
                         and training, monthly orchestration + coaching report,
                         training view (prospects)
    career/              manager: expectations, confidence, reputation, sacking,
                         job offers; career-flow (transitions); career-view
    world/               renewal: youth intakes (regenerated from the seed),
                         worldFor(startYear), retirement, leaving football;
                         renewal-career (user side + inbox)
    match/               buildMatchTeam, lineupStrength, prepareFriendly, newMatchSeed,
                         live (the match in progress: saved record, rebuild, changes)
    season/              Season/Fixture schemas, fixture generator, table, cup
                         (draws, rounds, ties), running player stats, season flow
                         (date-ordered play, promotion/relegation, roll over)
    transfers/           valuation, windows, negotiation (AI club + player
                         responses), complete (the only world-changing step),
                         market search, offers (AI bids for the user's players),
                         contracts (season-end expiries, warnings), career (the
                         user's transfer business as pure state transitions)
    inbox/               inbox messages: schema, add (capped), mark read
    scouting/            what the user knows about potential: assignments,
                         reports (delivered as the calendar moves), views
    discipline/          suspensions derived from season results (bans, yellow
                         accumulation with deadlines), messages, profile view
  engine/              SIMULATION ENGINE: pure TS, seeded, no React/store imports
    simulate.ts          minute loop: possession → fouls → chance/shot → fatigue →
                         injuries → subs; in-match changes, snapshots
    team-state.ts        on-pitch players, energy, unit strengths, replacements
    tactical-effects.ts  instructions → numeric modifiers
    summarise.ts         events → score, team/player stats, ratings (one source of truth)
    ratings.ts, commentary.ts, penalties.ts (shootout), types.ts
    __fixtures__/        test helpers (outside __tests__ so Jest doesn't run them)
  store/               Zustand: game-store.ts (state + actions + persist), hooks.ts (view-model hooks),
                       save-slots.ts (switch / delete / export / import slots)
  persistence/         autosave: save.ts (schema + load checks), debounced-storage.ts,
                       slot-storage.ts (slots, deflate compression, backup, index),
                       save-transfer.ts (export file format), save-file(.web).ts
                       (share/download + file picker), storage(.web).ts (platform
                       storage), save-status.ts, use-hydration.ts (open the active
                       slot, load after mount, flush on background)
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
- **Dashboard** is now real apart from kick-off time (suspensions came after M10; M8a made
  fitness, morale and injuries real; 7b the inbox; 9b the manager name and board).

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

### Transfers (Milestone 7)

Decisions (user): split 7a/7b; bid + counter then terms; AI clubs react only
(no AI-to-AI market); foreign leagues later.

- **The world is "generated base + saved changes".** Transfers only change
  contracts and club finances (a player's club *is* his contract). Players
  and attributes are still rebuilt from the seed; `getBaseDatabase()` builds
  it once; `applyWorldChanges` overlays saved contracts/finances on load.
- **Save v2** adds `contracts`, `clubFinances`, `transferHistory`.
  `migrateSave` upgrades v1 (pre-transfer saves = the generated world's
  contracts). Load runs the data layer's `checkIntegrity` on the rebuilt
  world. Unknown versions → "unsupported version" notice.
- **60 free agents** generated after all club squads from the same RNG (club
  squads unchanged; `generatePlayer` now takes a country, not a club).
- **Valuation:** `100K · e^(0.57·(ability−6))` × age factor (peak 22–28,
  then falling every year) × contract factor (≥3 yrs 1.0 … <1 yr 0.45),
  rounded to 2 significant figures. Calibrated: ability 16 at 25 ≈ €30M,
  ability 10 at 31 ≈ €0.5M. Tests check it's monotonic (caught a flat tail
  where 34- and 35-year-olds cost the same).
- **Wages** use the generator's formula (45·ability² + 250·club reputation),
  +10% for a move. Older players: max 2 years (30+), 1 year (33+).
- **AI responses are deterministic rules** (learnable, testable): asking
  price = value × 1.15, or × 1.5 for a first-team regular (in the AI's best
  XI); bid ≥ asking → accept, ≥ 70% → counter at asking, else reject.
  Players refuse a step down of > 4 reputation or a club whose reputation
  is > 5 below their ability; accept wages ≥ 95% of their demand.
- **Windows:** summer 1 Jul–31 Aug, winter January; free agents any time.
  `startNextSeason` now sets the date to 1 July (window open).
- **`completeTransfer` is the only world-changing step** and re-checks
  everything (window, budgets incl. wage bill, squad max 30, 1–5 years).
  Seller gets the fee (half back into its transfer budget) and signs the
  best same-position free agent if its squad drops below 22. New db object
  → AI setup cache refreshes automatically.
- **The store never trusts the UI:** `signPlayer` re-runs the club's and
  the player's decisions, then `completeTransfer`; any failure is a
  RangeError message shown in the negotiation screen.
- **Negotiation route snapshots its target** when talks open: after a
  successful signing the player is "ours", the live target becomes null and
  the success screen used to vanish ("No one to sign"), a bug only the
  browser walkthrough could catch.

#### 7b: selling, contracts, inbox

Decisions (user): offers for listed players + rare unsolicited bids for
starters; releasing costs 50% of remaining wages; AI clubs renew key or
under-30 players at season end; a departing lineup player is auto-replaced.

- **`TransferCareer`** (`game/transfers/career.ts`) is the slice of state
  the user's transfer business touches (db, date, lineup, transfer list,
  offers, inbox, history). Every action is a pure `career → career`
  function; the store wraps them with `transferCareer(state)` /
  `fromCareer(...)`, so it stays thin and everything is testable without it.
- **Offers happen when the calendar moves** (`afterCalendarMove`, called by
  `playNextFixture`, `finishSeason`, `startNextSeason`): expired offers
  drop, new ones may arrive (only in a window), contract warnings when
  crossing 1 Jan / 1 Apr. Listed players: 45% chance per move, fee
  0.85–1.15× value. Starters: 1% per move, 1.2–1.5× value (≈ one premium
  bid a season). A bidder must need the position (its starter there is
  weaker), afford fee + wage, have room, and be a club the player would
  join. Seeded by `mixSeed(season seed, date)`.
- **Balancing lesson (again):** the unsolicited chance was 3% and the unit
  test said "rare", but the test kept every offer pending forever, which
  capped each player at one bid. The browser showed three bids in a month.
  The test now measures the per-draw rate with nothing pending.
- **An offer is "live"** only if unexpired (10 days), the window is open
  and the player is still yours (`liveOffers`). The inbox shows Accept /
  Reject only for live offers; old ones stay as history.
- **Selling** reuses `completeTransfer` with `replaceSeller: false` (the
  user picks their own replacements). Selling or releasing can't take the
  squad below 16 (`MIN_USER_SQUAD`).
- **Release** = pay 50% of remaining wages (`releaseCost`); the player
  becomes a free agent. Not a transfer, so not in transfer history; the
  inbox records it.
- **Renewal** at the player's demand (same wage formula), lengths limited
  by age, and only lengths that **extend** the current deal
  (`renewalYears`). The browser walkthrough caught a "3-year renewal"
  shortening a contract that ran to 2030; `renewContract` now refuses it.
- **Season rollover** (`processExpiries`, before the new fixture list):
  the user's expired players leave (inbox lists them); AI clubs renew
  regulars and under-30s (2 yrs, 1 if 30+), release the rest, then refill
  missing positions from free agents (`missingPositions` vs the squad
  template). Released AI players join the free-agent pool.
- **Lineup after a departure:** `removeAndRefill` puts the best remaining
  player (effective rating for that slot) into the gap, a substitute
  moving up if he's best, and tops the bench back up from the reserves.
- **Inbox:** saved, newest first, capped at 60, ids `msg_<n>`. Offer
  messages link to their offer (`offerId`). Dashboard shows the latest 4
  and the unread count over the whole inbox.
- **Save v3** adds `transferListed`, `offers`, `inbox`. Migrations chain
  (v1 → v2 → v3), tested from both v1 and v2.

### Player development (Milestone 8)

Decisions (user): condition and development apply to **everyone** (AI clubs
too); training = team focus + intensity; potential shown as a range; 8a
(condition) before 8b (development).

#### 8a: fitness, injuries, morale

- **Engine input:** `MatchTeamInput.condition` (optional) gives each
  player's starting fitness (= starting energy, was always 100) and morale.
  Morale multiplies every attribute: `1 + 0.03 × (morale − 60) / 40`, so
  neutral (60) changes nothing and the extremes are about ±3–5%. Missing
  condition = fresh + neutral, so old tests/calibration are unchanged
  (tested: explicit neutral condition gives an identical match).
- **Injuries in the engine:** one draw per team per minute; risk per
  player 8.5e-5/min, ×(1 + (100 − energy)/50) (tired players more), keepers
  ×0.3. Event `injury` with `days` (50% 3–10, 35% 11–28, 15% 29–90); forced
  substitution if one is left, else the team goes down to ten. Measured
  0.106 injuries per team per match. Effect sizes (600 matches): 70%
  fitness → home wins 48% → 40.5%; morale 100 vs 10 → 51% vs 44%.
- **`ConditionState = { date, players }`**, stored **sparsely** (only
  players not at 100 fitness / 60 morale / uninjured) and recovered
  **lazily**: `conditionOn(state, date)` applies +7 fitness/day, morale
  drifting 3%/day back to 60, injuries healing on their return date.
  Nothing ticks daily.
- **After a match** (`applyMatch`): fitness = end-of-match energy; morale
  +4 win / +1 draw / −4 loss, ±rating bonus; squad players left out −2.
  Injuries get a name (by severity, deterministic) and a return date.
- **Season flow threads condition:** `playDate`, `advanceToUserFixture`,
  `playRemaining` take and return it. Every match on a date uses the
  condition at kick-off.
- **AI rotation** (`aiSetupOn`): if a starter is below 80% fitness or anyone
  selected is injured, re-pick in the same formation from the fit players;
  otherwise reuse the cached best setup.
- **Judge availability at the next kick-off, not today.** The first browser
  run showed starters at ~70% right after a match with "only 70% fit"
  warnings, although they'd be 100% by the next Saturday; and a 4-day knock
  took a player out of the lineup. `conditionAtKickOff` (store) is now used
  for team selection, the picker, auto pick and the post-match lineup
  clean-up. The squad list, profile and dashboard show today.
- **User side:** injured players leave the lineup after a matchday
  (`withoutInjured`, reusing `removeAndRefill`); Head of Medical inbox
  messages (new `medical` category); `validateLineup` gets an `injured`
  error (blocks kick-off) and a `low-fitness` warning (< 75%), via plain
  `isInjured`/`fitnessOf` functions so `lineup.ts` doesn't depend on the
  condition record. Morale: transfer listing −10, unlisting +5, new
  contract +5.
- **Performance:** a full season (~45 dates) takes ~5.7 s in Jest; kick-off
  in Chrome averages ~85 ms (max ~230). `matchConditions` is cached per
  state object (WeakMap), which saved ~0.8 s a season.
- **Save v4** adds `condition`; v3 → v4 starts everyone fully fit on the
  save's date. Load rejects condition records for unknown players or dated
  after the career date.
- Suspensions were added after M10 (see "Suspensions" below).

#### 8b: potential, development, training

Decisions (user): monthly development; retirement deferred to M9 (with
regens, otherwise the player pool shrinks); Training screen opened from
the Squad tab.

- **Potential is a game-layer judgement**, not generated data:
  `assignPotential(db, seed, date)` gives each player `potential` (new
  optional field on Player, ability scale 1–20) = ability + headroom by
  age (17: 3–8 … 24: 0–1.5, 27+: 0, skewed low), from a per-player seeded
  stream. It doesn't touch the generator's RNG, so every existing player
  keeps their name and attributes and old saves still match (tested). The
  data layer still never imports `src/game`. The store's base world is
  `assignPotential(buildFictionalDatabase(seed))`.
- **The user sees a range** (`potentialRange`): a fixed per-player offset,
  ±1 for their own players, ±2 for others (scouting later changed this:
  ±3 unscouted, ±1 scouted, exact with a full report); it always contains the truth,
  never starts below current ability. Scouting (M9) can narrow it later.
- **Development is a chance of ±1 per attribute per month** (attributes are
  integers): growth = 0.16 × age (1 at ≤18 … 0 from 28) × gap to potential
  (full at ≥2) × playing time (0.6 benched … 1.2 every minute, from season
  minutes) × intensity × focus (×1.6 trained / ×0.7 neglected) × relevance
  to his position (POSITION_WEIGHTS). Decline from 30 (physical), 32
  (technical/goalkeeping), 34 (mental); Physical focus slows physical
  decline. Two RNG draws per attribute always, so one outcome never shifts
  another's numbers.
- **Calibrated over 4 simulated years** (test prints them): young players
  with ≥3 headroom +1.3 after one year, +3.6 after four; ages 25–27 ±0.03;
  31+ −0.5 a year; light vs heavy 0.93 vs 1.54 a year; benched vs regular
  0.83 vs 1.58.
- **Monthly step** (`developThrough`, called by the store on every calendar
  move): develops all 880 players for each 1st crossed, training knocks
  (per player per month: light 0.5%, normal 1.2%, heavy 3.5%; AI clubs
  normal), Head of Coaching report (top improvers/decliners for the user).
  Same db object when no month is crossed (keeps the AI setup cache).
  Month-crossing kick-offs peak at ~280 ms in Chrome.
- **Valuation:** `marketValue` prices part of a young player's headroom
  (60% at ≤19, 45% at 20–21, 25% at 22–23). Takes potential as a number
  (avoids a valuation ↔ potential import cycle).
- **Save v5:** `attributeChanges` stores only attributes that differ from
  the base world, flat (`{ plr_0007: { finishing: 13 } }`, diffed on save),
  plus `training`. Unknown players / keys / out-of-range values are
  rejected on load. v4 → v5: no changes, default training.
- **A test that depended on one particular offer broke** when potential
  changed player values; it now lists four players so it tests the rule,
  not one outcome.

### Career mode (Milestone 9)

Decisions (user): youth intakes regenerated from the seed (not saved);
9a world renewal before 9b manager career; the user may start at any of
the 40 clubs; the user can be sacked, with warnings.

#### 9a: retirement and youth intakes

- **Intakes are regenerated, not saved.** `generatedIntake(clubs, seed,
  year)` depends only on (world seed, year, club index); each club gets
  2–4 youngsters aged 16–17 (`generateYouthIntake` in the data layer,
  better at bigger clubs) with potential (`assignPotential`). Ids are
  `plr_<100000 + (year−2000)·1000 + club·10 + k>`: numeric (seeds use the
  number) and disjoint from the base world's 1…~1000.
- **`worldFor(base, seed, startYear)`** = base world + every intake up to
  that season (no contracts). It's what saves are diffed against, so a
  save stores only contracts, finances, attribute changes and **`retired`**
  ids (save v6). `checkSave` takes `baseFor(startYear)`. A store test plays
  a full season, rolls over, reloads, and gets the identical world.
- **Summer order** (store `startNextSeason`): monthly development →
  retirements (30 June) → contract expiries, AI refills (1 July) → youth
  intake → new fixtures. Retirement before expiries, so AI clubs refill
  the gaps the same summer.
- **Retirement:** from 33 (8%) rising to 95% at 38+; ×1.4 for weak
  players, ×0.6 for strong ones. Free agents also **leave football**
  (weak ones 50–70% a year, decent ones 20%: moved abroad / lower
  leagues). Leavers are removed from the world entirely (players,
  attributes, contracts, condition records); the Club tab shows
  "Retired player" for old deals.
- **Intake decisions:** the user signs every youngster there's room for
  (3-year youth contract at 40% of the normal wage; release any from the
  profile, cheaply); AI clubs keep their best 2 by potential while below 26.
- **Ten-summer stability test** (`world/__tests__/renewal.test.ts`) caught
  two problems: AI clubs renewing every under-30 let squads creep to 30
  (now: key players, then the best under-30s while below
  `AI_TARGET_SQUAD` = 24), and released youngsters piled up in free agency
  (world 940 → 1,471, pool 358). With smaller intakes and the
  leave-football rule: 940 → ~1,180 levelling off, pool ~150, AI squads
  18–30.

#### 9b: manager career

Decisions (user): when sacked, choose a new job straight away (so there's
always a user club, nothing has to handle "no club"); job offers only at
season end.

- **Only the manager record is stored** (`Manager`: name, reputation 1–100,
  board confidence 0–100, warned flag, pending offers after a sacking,
  season history). Expectations and the season review are **derived** from
  club, league and season, so they can't disagree with the table.
- **Expectation** = a league position from the club's reputation rank in
  its league: tier 1 rank 1 → win the league, ≤4 top four, ≤10 top half,
  ≤14 mid-table, else avoid relegation (17th); tier 2 ≤3 promotion, ≤8
  push for promotion, … .
- **Confidence** after each league result: `3 × (points − expected ppg for
  the target)` plus a 5% pull back to 60 (without it confidence is a random
  walk and an on-target manager can drift into the sack zone by luck).
  Measured over 400 simulated seasons: on target → 0% sacked; 0.8 ppg below
  → 59%. Warning below 35 (once a season), sacked below 15 after 8 league
  games (grace period).
- **Sacking** → reputation −8, 1–3 job offers (at least one, smaller clubs
  guaranteed), play blocked until `chooseNewJob`; the season continues at
  the new club. **Season end** → review (finish vs target, trophies,
  promotion/relegation → reputation), offers from clubs near his level
  (`4 + reputation/8` ± 2 on the 1–20 club scale); badly failing seasons
  end in the sack, with offers to choose from. Deterministic per season.
- **Changing clubs at season end:** that summer every club gets the AI's
  treatment (renewals, intake) — they decided before he arrived — then he
  takes over (`switchClub`: auto-picked lineup, default tactics/training,
  empty transfer list).
- **New career:** `manager === null` until started; the tabs layout
  redirects to `/new-career` (name via the new `TextField` primitive + any
  of the 40 clubs with the board's expectation and squad rating). "Start
  new game" on the Club tab clears the manager, which brings it back.
  Static web is unaffected (nothing renders before the save loads).
- **Save v7** adds `manager` (nullable); v6 careers carry on with a default
  manager ("Manager", reputation 50). Load rejects history/offers with
  unknown clubs.

### Persistence and polish (Milestone 10)

Decisions (user): cloud saves deferred (export/import files instead; no
backend, accounts or costs yet); 3 save slots; compression (lz-string was
chosen, then replaced by fflate after measuring, with the user's OK).

#### 10a: save slots, compression, backup, export/import

- **Storage chain:** persist → debounced (≤ 1 write/s) → **slot storage**
  → platform. Slot storage compresses (`z1:` + deflate as a binary string;
  unprefixed values are older uncompressed saves and still load), copies
  the previous save to `<key>.backup` before each write, and keeps a small
  index (`touchline-slots`: manager, club, season, date per slot).
- **Measured, then chosen:** a late-season save is ~1.1 MB of JSON
  (~900 KB of it the season's fixtures and player stats). lz-string: 7.3%
  but ~950 ms per compression, a visible freeze after every autosave.
  fflate: 9.0% in ~85 ms (inflate ~10 ms). Saves are now ~40 KB early in a
  season, ~100 KB late.
- **Slots are keys** (`touchline-save-1…3`, `touchline-active-slot`).
  Switching = flush → `persist.setOptions({ name })` → `rehydrate()`.
  Hydration never writes, so loading can't overwrite a slot; an empty slot
  merges to a fresh game (manager null → new-career screen). The old
  single key moves into slot 1 on startup (`migrateLegacy`).
- **Backup recovery:** if the latest save fails its checks, `merge` tries
  the backup (same `validatePersisted` path) and says so; an unreadable
  (cut-off) save falls back to the backup in the storage layer.
- **Export/import:** a JSON wrapper (`format: "touchline-save"`, summary,
  the save uncompressed so future versions can migrate it). Import is
  validated exactly like a load before anything is written; replacing an
  occupied slot asks first. Native: expo-file-system (`File`, `Paths`) +
  expo-sharing + expo-document-picker (all in Expo Go; APIs checked in the
  SDK 58 docs; the installer added the `expo-sharing` config plugin to
  app.json). Web: a normal download and a file input.
- **Browser note:** file pickers only open from a real user gesture;
  `pickSaveFile` runs synchronously inside the tap handler, before any
  `await`. (The headless test needed `userGesture: true` to simulate it.)

#### 10b: release readiness

Decisions (user): app id `com.muthokaricky.touchline`; EAS configuration
only (the user runs `eas login` and builds); an original icon.

- **Test split:** statistical suites live in `*.calibration.test.ts`
  (engine calibration and condition statistics, four-year development
  rates, ten-summer renewal); `npm test` ignores them, `test:calibration`
  runs only them, `test:all` runs everything. The long store scenarios were
  split into `game-store-career.test.ts` so Jest runs them in parallel.
  `npm test` went from ~55 s to ~36 s. (Gotcha: `--testPathIgnorePatterns`
  takes several values and swallowed a positional filter; Jest 30 uses
  `--testPathPatterns`.)
- **Performance:** the kick-off after a month boundary took ~410 ms
  because development creates a new database object, which empties the AI
  setup cache, and every AI club re-ran its formation search; most of that
  was `positionRating` rebuilding a flattened attribute object thousands
  of times. Ratings are now cached per (immutable) attributes object in a
  WeakMap: ~180 ms after a month, ~100 ms normally, first kick-off
  ~500 → ~300 ms (Jest timings). Rejected: remembering formations across
  database changes, because a reloaded game would then choose differently
  from a continuing one (results must not depend on session history).
- **ESLint** via `npx expo lint` (eslint 9, eslint-config-expo, flat
  config). Fixed: unescaped apostrophes in JSX text (now typographic ’),
  `setState` in an effect (the picker's mounted flag → `useIsClient`, built
  on `useSyncExternalStore`: false while pre-rendering/hydrating, true on
  the client), unused imports left by the test split, a duplicate import.
- **Configuration:** `android.package` / `ios.bundleIdentifier`
  `com.muthokaricky.touchline`; `eas.json` with `preview` (internal APK)
  and `production` (store build, `autoIncrement`), `appVersionSource:
  "remote"` (EAS keeps build numbers). No `development` profile: it needs
  `expo-dev-client` and we use Expo Go.
- **Icons:** original mark (pitch outline, the left touchline bold in the
  accent green, ball on the centre spot) in `assets/images/touchline-icon.svg`,
  rendered to every size by `scripts/render-icons.mjs` (headless Chrome;
  reproduces the committed PNGs exactly). Replaced Expo's default icons and
  removed the default `assets/expo.icon`; splash image width 76 → 160.
- **expo-doctor:** 12 Expo packages were patch releases behind SDK 58 →
  `npx expo install --fix` (it also added the `expo-status-bar` and
  `expo-web-browser` config plugins). Remaining: an informational React
  Native Directory note about two transitive packages (masked-view from
  expo-router, expo-modules-core from expo), deliberately not silenced.

### Suspensions (after Milestone 10)

Decisions (user): realistic rules; a ban is served in the competition it was
earned in; then, after measuring, real-league deadlines for yellow cards.

- **Derived, never stored** (`src/game/discipline/suspensions.ts`). Every
  stored fixture result already lists its cards, so bans are worked out
  from the season's results like the table: no save change (still v7), and
  a ban can't disagree with the match history. Cached per Season object
  (WeakMap); seasons are immutable, and every match on a date reads the
  same pre-date season, so it's computed about once per matchday.
- **Rules:** second yellow → next 1 match; straight red → next 3; league
  yellows: 5th by matchday 19 of 38 → 1 match, 10th by matchday 32 → 2
  (deadlines scale with league length; later yellows don't lead to a ban).
  Yellows in a match where the player was sent off don't count; cup yellows
  never do. Bans are served in that competition, queue one after another,
  and lapse at season end.
- **"The next N matches"** = the next N fixtures in that competition of the
  club he was booked for, as dates (leagues share Saturdays, so a player who
  moves within the league misses the same dates). A cup ban waits for the
  next round to be drawn.
- **Balancing lesson (third time):** the first version used "every 5th
  yellow, all season" with an estimate of 3–5 bans a club. The season test
  measured 12.6 (8.8 from yellows): the engine's ~74 yellows a club fall
  mostly on a few defenders. A probe compared rules on the same season;
  with deadlines it's 6.9 a club (3.0 from yellows), close to real football.
- **Where it applies:** AI clubs leave banned players out (`aiSetupOn` takes
  a suspended set, like injuries). For the user, `LineupAvailability` gets
  an optional `isSuspended` → `suspended` lineup error (kick-off blocked,
  but **not for friendlies**: `useTeamReadiness('friendly')` ignores it);
  `buildFixtureInput` refuses a user lineup with a banned player (rules
  don't trust the UI); after a matchday `withoutUnavailable` (was
  `withoutInjured`) takes out players injured at, or banned from, the next
  fixture; auto pick and club takeovers skip them. A banned player can still
  be picked for a later cup tie if the ban is in the league.
- **UI:** "Suspended" tag (squad list, bench, picker, where they're sorted
  last), pitch marker, dashboard "sus" count, profile Condition card
  ("Suspended for the next 2 league matches (straight red card)" and league
  bookings with the next deadline), Assistant Manager inbox messages for
  each ban and for "one booking from a ban".
- **Tests that played a season with one fixed user lineup** now hit the
  guard; they use `playUserFixture` (`game/season/__fixtures__/play.ts`),
  which swaps banned players out first, as the store does.

### Foreign leagues, step A: the world (after Milestone 10)

Decisions (user): main leagues England (two divisions + cup), Kenya,
France, Germany, Italy and Spain, 18 clubs each, fully simulated; all as
strong as the First Division; Kenyan names = the user's five (Ndom, Topan,
Chapati, Ruhanga, Meensat FC) + invented city-based clubs (for the user to
review); "1–2 teams" countries as background clubs. Split: A = world,
leagues, simulation, viewing; B = transfers/jobs/careers abroad, tuning.

- **Old players unchanged.** England's clubs and the free agents are
  generated first, from the original random stream, exactly as before
  (checked against the previous commit's generator: all 940 players,
  attributes, contracts identical). The 102 clubs abroad come after, from
  their own stream (`seed ^ 0x5eedab0d`), numbered from 941. English
  clubs keep `FOREIGN_NATIONS` (changing that list would rename every
  player); clubs abroad use `FOREIGN_NATIONS_BY_COUNTRY`. New name pools:
  KEN, GER, ITA, POR, NGA, GHA, UGA, TAN.
- **World:** 142 clubs (40 England, 5 × 18 abroad, 12 background: two each
  from NED, POR, NGA, GHA, UGA, TAN), 3,184 players. Leagues abroad: tier
  1, no promotion/relegation, 34 matchdays on the same Saturdays.
  Background clubs are in no league: their squads develop, renew, retire
  and trade, but never play.
- **Season order:** England's leagues first (so their fixture seeds are
  what they always were), then abroad. `Season.cupEntrantLeagues`
  (optional; missing = all leagues, as in older saves) keeps the National
  Cup English; `nextMemberships` builds a pyramid per country; leagues a
  save doesn't know join at its next season.
- **Youth intakes:** the first 100 clubs keep their id scheme and random
  streams; clubs beyond use a separate range (`clubIndex · 10` would run
  into the next year's ids, `year · 100 + index` into another club-year's
  seed).
- **Step A limits:** job offers only from the manager's own country
  (`jobOffers`), the new-career screen lists England's clubs only.
  Transfers already work worldwide (offers from clubs abroad too); the
  market has an "Abroad" filter; the Fixtures tab lists every league
  (England first, then the cup, then Kenya, France… by country).
- **Bug found by the bigger world:** auto-pick broke exact rating ties on
  player id, so an unfamiliar player could beat an equally rated unused
  natural (US Morvandelle). Ties now go to the better fit, then the id.
- **Performance** (3× the matches): `selectSquadCandidates` rebuilt maps
  of every player for each team of each match (now cached per database,
  readonly so callers can't corrupt the cache); condition and season stats
  are applied once per matchday instead of once per match
  (`applyMatches`, `recordResults`, `addMatchesToStats`, same results in
  the same order). Jest kick-offs: ~300 ms normal (was ~550–870 before
  the fixes, ~100 ms before the leagues abroad), ~550 ms after a month
  boundary (development + every AI club's formation search). Desktop
  Chrome, full time incl. rendering: 230–520 ms. A late-season save is
  ~2.4 MB of JSON → ~205 KB compressed, ~170 ms to compress (deflate level
  makes little difference: measured 1–6). Not yet measured on a phone; if
  too slow there, the next step is a cheaper results model for matches
  abroad.
- **Save v10:** same fields; older saves get the generated contracts of
  the clubs abroad (only for players without one, so it's safe to re-run).

### Scouting (after Milestone 10)

Decisions (user): scouting reveals potential only (attributes stay
visible); assignments that take time; free, limited to 3 scouts.

- **Knowledge per player** (the user's only): 0 not scouted, 1 scouted,
  2 full report; own players are always at least 1. `potentialRange`
  takes the level instead of an "own" flag: ±3 / ±1 / exact, the centre
  off by a fixed per-player amount (at most half the width) so the range
  always contains the truth. Unscouted players went from ±2 to ±3, so a
  report is worth having.
- **Assignments:** "Scout player" on a profile (not your own players, not
  someone already being watched or fully known, at most `SCOUTS` = 3 at
  once); the report is due `REPORT_DAYS` = 14 days later. Nothing ticks:
  `deliverReports` runs on every calendar move (after a match, at season
  end, in the summer), raises knowledge one level and sends a Chief Scout
  message (new inbox category `scouting`) with the range and a verdict.
  Players who retire are forgotten (`withoutMissingPlayers`).
- **Only the user's view changes.** AI clubs and market values still use
  true potential (a young player's price can hint at it, as real markets
  do).
- **Save v9** adds `scouting` (assignments + sparse knowledge); load rejects
  unknown players and assignments started after the save's date; v8 saves
  start with nobody scouted.
- **UI:** Scouting card on other clubs' players' and free agents' profiles
  (status pill, due date, Scout player / Call the scout back, the reason
  when a scout can't be sent); "Scouts · n of 3 busy" card on the Transfers
  screen listing assignments (tap to open the player).

### In-match management (after Milestone 10)

Decisions (user): substitutions and instruction changes; the assistant
makes fatigue substitutions until the user's first change; a match in
progress is saved and resumed.

- **Re-simulate, don't pause the engine.** A `MatchChange` (substitution
  or new tactics) has an `after` clock and takes effect from the next tick.
  The engine plays an explicit tick list (minutes, stoppage, half-time) and
  applies pending changes before each tick, so everything up to `after` is
  identical with or without the change: same seed, same random numbers in
  the same order (tested over 32 seed × minute cases). The game re-runs the
  whole match after each change (a few ms) and the replay simply carries
  on: the timeline before the pause point can't have changed. The engine
  stays pure, and "simulate instantly, replay visually" still holds.
- **Snapshots** (`matchSnapshot(input, at)`): the engine replays up to `at`
  and reports who's on (with energy, bookings), the bench, subs left,
  current tactics and whether the manager is in charge. `changeProblem`
  validates a change against that; the engine itself silently skips an
  invalid change so a match always finishes.
- **Assistant subs:** `TeamState.manual` is set by the first change of that
  side; from then on no fatigue substitutions for it. Injury and goalkeeper
  replacements stay automatic.
- **Two-phase league match:** `kickOff` only stores `liveMatch` (fixture id
  + changes); nothing is recorded. `prepareUserFixture` builds the live
  match exactly as `advanceToUserFixture` will (earlier AI-only dates,
  condition at kick-off), and `finishMatch` (= `playNextFixture` with the
  live match's changes) records the identical result. The match centre
  calls `finishMatch` when the replay reaches full time, so the report can
  show the matchday's other results.
- **Nothing that affects the match may change in between,** because the
  live match is rebuilt from the career state: `notLive` guards lineup,
  tactics, transfers, contracts, listing, the calendar and job changes; the
  tabs layout redirects to `/match` while a match is live (like the
  new-career redirect), and the match centre hides its Back button.
- **Save v8** adds `liveMatch` (nullable; a few bytes). Load checks it's
  still the user's next fixture (or a valid friendly) and that changed
  players exist; v7 saves have no match in progress. A resumed match
  starts its replay at the last change.
- **UI:** "Manage team" pauses the replay and opens `MatchManagementPanel`
  (take off / bring on with energy and bookings, subs left, the six
  instructions with "Apply"); closing it resumes if it was playing. New
  feed kind `tactics`, commentary for manager substitutions and approach
  changes. Not done: moving players between positions mid-match (a sub
  takes the departing player's position).

## 3. Commands

```
npm install
npm start              # Expo dev server (press a for Android, w for web)
npm run android        # start + open on Android device/emulator (Expo Go)
npm run web            # start + open in browser
npm test               # Jest: everyday suite (~35 s), no statistical calibration
npm run test:calibration  # the statistical suites only (*.calibration.test.ts, ~25 s)
npm run test:all       # everything (~45 s): run before committing engine/balance changes
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint (eslint-config-expo); must be clean
npm run build:web      # static web export to dist/
node scripts/render-icons.mjs assets/images   # regenerate the icon set from its SVG design
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

### Milestone 7 — Transfers ✅
**7a — Buying, free agents, save v2 ✅**
- `src/game/transfers` (valuation, window, negotiation, complete, market);
  60 free agents; save v2 + migration; store `signPlayer`,
  `transferHistory`; Transfers screen, negotiation screen, transfer card on
  profiles, Club tab transfers + history, market button on Squad.
- Tests: 544 total (42 new) incl. a signing surviving a reload and a v1
  save upgrading.
- Verified: `tsc` clean, tests pass, Android + web export; headless Chrome
  at 412px and 1280px: bid rejected → raised → accepted → terms → signed;
  squad 22→23→24 (free agent), both surviving reloads; history on Club
  tab; after 5 matches (5 Sep) the window is closed and club players can't
  be bid for. Zero console errors.

**7b — Selling, contracts, inbox ✅**
- `src/game/transfers/{offers,contracts,career}.ts`, `src/game/inbox`,
  `removeAndRefill` in lineup, release/renew/`renewalYears` in complete.
- Store actions: `toggleTransferListed`, `acceptOffer`, `rejectOffer`,
  `releasePlayer`, `renewContract`, `markMessageRead`,
  `markAllMessagesRead`; calendar moves run the offer/warning step;
  `startNextSeason` processes expiries. Save v3.
- UI: inbox route + real dashboard inbox; "Transfer & contract" card on
  your own players' profiles (list, offers, renew, two-step release).
- Tests: 580 total (36 new).
- Verified: `tsc` clean, tests pass, Android + web export; headless Chrome
  at 412px and 1280px: list 3 players, renew (only extending lengths
  offered), release (cost shown, squad 22→21), play into August → offers
  in the inbox → accept → "sold to", squad 20, lineup without issues,
  all kept after reload. Zero console errors, no overflow.

### Milestone 8 — Player development ✅
**8a — Fitness, injuries, morale ✅**
- Engine: condition input, morale factor, injury event + forced subs.
- `src/game/condition` (condition, squad-care); AI rotation; season flow
  threads condition; lineup validation (injured / low fitness);
  `daysBetween` date util.
- Store: `condition`, `conditionAtKickOff`; injuries leave the lineup with
  medical inbox messages; auto pick skips injured; morale on listing/renewal.
  Save v4.
- UI: condition tags on squad list, bench, picker (injured last) and pitch;
  Condition card on profiles; real dashboard squad status; injuries in the
  match feed.
- Tests: 615 total (35 new) incl. engine injury/fitness/morale statistics,
  recovery, AI rotation, kick-off availability, v3 → v4 migration.
- Verified: `tsc` clean, tests pass, Android + web export; headless Chrome
  at 412px and 1280px: 12 matches → two injuries with medical messages,
  injured players out of the XI and last in the picker; forcing one back
  in → "Team not ready · … is injured" and kick-off disabled; auto pick
  fixes it; condition survives a reload. Zero console errors, no overflow.

**8b — Potential, development, training ✅**
- `src/game/development` (potential, development, monthly, training-view);
  potential in valuation; save v5 (attribute changes, training).
- Store: `training`, `setTraining`, monthly step on every calendar move;
  base world with potential.
- UI: Training screen (focus, intensity, young players with potential
  range and progress) from the Squad tab; Development card on profiles;
  monthly coaching reports and training injuries in the inbox.
- Tests: 638 total (23 new) incl. 4-year calibration, determinism,
  potential ranges, save round-trip of a developed world, v4 → v5.
- Verified: `tsc` clean, tests pass, Android + web export; headless Chrome
  at 412px and 1280px: Training (Physical/Heavy) kept after reload,
  prospects with ranges, profile Development card, August and September
  reports ("Improving: … +0.3"), training knocks reported. Zero console
  errors, no overflow.

### Milestone 9 — Career mode ✅
**9a — Retirement and youth intakes ✅**
- `src/game/world` (renewal, renewal-career); `generateYouthIntake`;
  `addContract`; AI target squad size in expiries; save v6 (`retired`,
  base = `worldFor`).
- Inbox: youth intake (with potential ranges), retirements.
- Tests: 655 total (17 new) incl. ten-summer stability, intake determinism,
  save round-trip with retirements and an intake, v5 → v6, a full season
  rollover + reload in the store.
- Verified: `tsc` clean, tests pass, Android + web export; headless Chrome
  at 412px and 1280px: a full 2026/27 season (39 matches) → 2027/28 with
  "Youth intake: 4 academy players" and expiries in the inbox; squad
  22 → 17 (9 expired, 4 youngsters) kept after reload. Zero console
  errors, no overflow.

**9b — Manager career ✅**
- `src/game/career` (manager, career-flow, career-view); store
  `manager`, `startCareer`, `chooseNewJob`, `startNextSeason(newClubId)`,
  board reaction after every matchday; save v7.
- UI: new-career screen + redirect, `TextField`; dashboard Board card
  (target, confidence, mood, reputation), sacked card with offers, season
  review + offers on the season-complete card, real manager name; Club
  tab career history.
- Tests: 674 total (19 new) incl. sacking-rate simulation, expectations,
  reviews/offers determinism, store career flow (start, sack, new job,
  season-end move), v6 → v7.
- Verified: `tsc` clean, tests pass, Android + web export; headless Chrome
  at 412px and 1280px: first launch → new career → Saltmarsh Athletic
  ("finish in the top half") → 9 matches → (confidence forced to 1 in the
  save) sacked with 2 offers, no Play match → took Stonemarsh Albion,
  season continued at matchday 11 → Club tab history "sacked" → Start new
  game → new-career screen. Zero console errors, no overflow.
- **Not browser-verified:** accepting a season-end offer (covered by a
  store test that plays a full season).

### Milestone 10 — Persistence and polish ✅ (device testing outstanding)
**10a — Save slots, compression, backup, export/import ✅**
- `persistence/slot-storage.ts`, `save-transfer.ts`, `save-file(.web).ts`;
  `store/save-slots.ts`; `validatePersisted`; Save slots card on the Club
  tab. New dependencies: fflate, expo-file-system, expo-sharing,
  expo-document-picker.
- Tests: 689 total (15 new) incl. compression, backup fallback (storage
  and semantic), slot isolation, delete, export → import round trip,
  junk/tampered imports, legacy migration.
- Verified: `tsc` clean, tests pass, Android + web export; headless Chrome
  at 412px and 1280px: two careers in slots 1 and 2, switching both ways,
  export downloaded a valid file, import into slot 3 switched to the same
  career, active slot kept after reload, all saves stored compressed
  (~40 KB). Zero console errors, no overflow.
- **Not yet verified on a device:** native export (share sheet) and import
  (document picker) only run on Android/iOS.

**10b — Release readiness ✅**
- Test split (`test:calibration`, `test:all`), rating cache, ESLint clean,
  `useIsClient`, app identifiers, `eas.json`, original icon set + render
  script, Expo packages aligned with SDK 58, `docs/DEVICE_TEST_CHECKLIST.md`.
- Tests: 689 total (unchanged; reorganised). `npm test` 653 / calibration 36.
- Verified: `tsc` clean, lint clean, `test:all` passes, expo-doctor 19/20
  (the 20th informational, see above), Android + web export; headless
  Chrome at 412px and 1280px: new career, picker by tap **and by direct
  URL** (hydration), a match, favicon served. Zero console errors.

### Suspensions ✅ (after the roadmap)
- `src/game/discipline` (bans, accumulation with deadlines, inbox
  messages, profile view); AI and season flow skip/refuse banned players;
  store clean-up, auto pick, team sheet, picker, squad list, pitch,
  dashboard and profile.
- Tests: 704 total (15 new) incl. each rule on a hand-made season, the
  store flow (ban → out of the XI → message → kick-off refused), and a
  full-season calibration (no banned player ever selected; 6.9 bans per
  club). `npm test` 666 / calibration 38.
- Verified: `tsc` clean, lint clean, `test:all` passes, web export;
  headless Chrome at 412px and 1280px: 8 matches at Greywater Town → two
  full-backs sent off: "0 inj · 2 sus" on the dashboard, inbox messages,
  "Suspended" in the squad list and picker, profile line; forcing one back
  in → "is suspended" on the pitch and issues card, league kick-off
  disabled, a friendly still allowed. Zero console errors, no overflow.

### In-match management ✅ (after the roadmap)
- Engine: `MatchChange`, tick loop, `matchSnapshot`, `changeProblem`,
  `manual` teams; `game/match/live.ts`; `prepareUserFixture`; store
  `kickOff`, `kickOffFriendly`, `makeMatchChange`, `finishMatch`,
  `abandonMatch`, `notLive` guards; save v8; match centre live mode,
  management panel, redirect to the live match.
- Tests: 717 total (13 new) incl. the prefix-invariance property, manager
  subs, assistant hand-over, tactics effect size, snapshots, validation;
  store flow (locked career, shown = recorded, order, friendly); resume
  after restart; v7 → v8 and live-match load checks. `npm test` 679 /
  calibration 38. Engine calibration unchanged by the loop rewrite.
- Verified: `tsc` clean, lint clean, `test:all` passes, web export;
  headless Chrome at 412px and 1280px: kick off → no Back button → Manage
  team at 55' → substitution + very attacking → back to the match (replay
  resumes) → loading `/squad` mid-match redirects to `/match` and resumes
  with both changes in the feed → skip to full time → report with the
  changes and other results → dashboard on matchday 2. Zero console
  errors, no overflow.

### Scouting ✅ (after the roadmap)
- `src/game/scouting`, knowledge-based `potentialRange`, store
  `scoutPlayer` / `cancelScouting` + delivery on calendar moves, save v9,
  Scouting card, Transfers screen assignments, inbox category.
- Tests: 724 total (7 new) incl. reports and ranges (wide → narrow →
  exact, always containing the truth), scout limit, cancel, retired
  targets, store flow over two matches, v8 → v9 and load checks.
  `npm test` 686 / calibration 38.
- Verified: `tsc` clean, lint clean, `test:all` passes, web export;
  headless Chrome at 412px and 1280px: Transfers → Joe Whitfield (Kestrel
  Bay) "Not scouted", potential 18–20 → Scout player (report due 15 Jul,
  Transfers card lists it) → two matches → Chief Scout report in the inbox
  → profile "Scouted", 18–19 → scout again → two matches → "Full report",
  18. Zero console errors, no overflow.

### Foreign leagues, step A ✅ (after the roadmap)
- Name pools, 90 league clubs + 12 background clubs abroad, five leagues,
  separate generation stream; per-country cup entrants and pyramids;
  intake ids/seeds beyond 100 clubs; save v10; Abroad market filter;
  Fixtures tab ordering; auto-pick tie fix; squad cache and per-matchday
  batching.
- Tests: 931 total; world shape and nationalities, leagues/cup per
  country, no promotion abroad, save size (compressed), v9 → v10 (and
  re-run safety); calibration bounds made relative to the world's size.
  `npm test` ~85 s (was ~36 s): store scenarios that play many matches
  dominate.
- Verified: `tsc` clean, lint clean, `test:all` passes, web export;
  headless Chrome at 412px and 1280px: new career → 10 matches (full time
  230–520 ms) → Fixtures tab shows Kenya, France, Germany, Italy, Spain;
  Kenyan table (Kisumu Lakeside, Chapati FC, Ndom FC…); Transfers →
  Abroad lists players at Real Castrovega, AC Valdoro, SV Eichental,
  Ndom FC. Zero console errors, no overflow.

### Known issues / not yet verified
- **Kenyan club names** (and the other invented names abroad) are waiting
  for the user's review: `src/data/fictional/clubs.ts`.
- **Performance with the leagues abroad** hasn't been measured on a phone
  (see "Foreign leagues, step A"). `npm test` takes ~85 s.
- **Not yet run on a physical Android device or emulator** (bundles compile; run
  `npm start` and open in Expo Go to confirm).
- The icon is an original placeholder-quality design; replace with
  professional artwork later (edit the SVG and rerun the render script).
- Fonts are system fonts. A custom typeface can be added via `expo-font` later.
- Pre-season, the table is in alphabetical order (all on 0 points), so the
  user's club can appear "1st" before a ball is kicked.
- Web only: directly loading the URL of a player profile from another club
  isn't supported (only the user's squad is pre-rendered); opening it
  within the app works.
- Squads are 22 players for 38 league games + cup. With injuries and rotation
  (M8a) it still works (AI clubs have 22+, injuries ~0.1/team/match), but
  watch it in long careers. With suspensions (~7 bans a club a season)
  24–25 may be needed; the season test shows AI clubs cope at 22+.
- Web/headless testing note: killing Chrome right after a save can lose
  localStorage writes Chrome hasn't flushed; reload inside the session to
  test persistence.
- The modal picker and profile were checked on web only; native gestures
  (swipe-to-dismiss on iOS, Android back button) still need checking in Expo Go.
- Long names are truncated in the picker when a fit pill is shown (acceptable,
  full name is in the accessibility label).

## 5. Next steps

All ten roadmap milestones are built. What's left before a release:
1. **Device testing** with `docs/DEVICE_TEST_CHECKLIST.md` (the user runs
   it in Expo Go; fix whatever it finds). Nothing native has been run on a
   phone yet: SQLite saves, splash gate, keyboard, gestures, share sheet,
   document picker.
2. **First EAS build** (user, needs a free Expo account): `npm install -g
   eas-cli`, `eas login`, then `eas build --platform android --profile
   preview` for an installable APK (eas.json is already set up).
3. Then choose: store submission (production profile, store listings,
   privacy policy) or more gameplay. Next: **foreign leagues step B**
   (jobs and new careers abroad incl. expectations without relegation,
   offers from clubs abroad, market/scouting by country, performance after
   the phone test, faster store tests). Parked ideas:
   season-end offer expectations using next season's league, cloud saves
   (needs a backend: accounts, costs, privacy).
