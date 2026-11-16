import type { ClubId, CompetitionId, GameDatabase, PlayerId } from '@/data/schemas';
import { formatDate } from '@/utils/format';

import type { NewMessage } from '../inbox/inbox';
import type { Fixture, Season } from '../season/season';
import { fullName } from '../squad/squad-selectors';

/**
 * Suspensions, DERIVED from the season's results (never stored).
 *
 * Every stored fixture result already lists its cards, with the fixture's
 * competition and date, so "who is banned for this fixture?" can be worked
 * out from the results played before it, just like the league table. No new
 * saved state, and bans can never disagree with the match history.
 *
 * Rules (user's choice: realistic, served in the same competition):
 * - second yellow: the next 1 match in that competition;
 * - straight red: the next 3;
 * - LEAGUE yellows, with deadlines like real leagues: a 5th yellow by the
 *   halfway matchday (19 of 38) → the next 1; a 10th by matchday 32 of 38
 *   → the next 2. Later yellows don't lead to a ban. Yellows in a match
 *   where the player was sent off don't count; cup yellows never do.
 *
 * Why deadlines: measured over a simulated season, "every 5th yellow, all
 * season" gave 8.8 accumulation bans per club (12.6 bans in all), because
 * the engine's ~74 yellows a club fall mostly on a few defenders. With the
 * deadlines it's ~3 (~7 in all), close to real football.
 * A ban is served in the competition it was earned in (a league red doesn't
 * rule anyone out of a cup tie) and lapses when the season ends. Bans that
 * overlap are served one after the other.
 *
 * "The next N matches" are the next N fixtures, in that competition, of the
 * club the player was booked for. Leagues play every Saturday, so a player
 * who moves club within the league misses the same dates.
 */

export type BanReason = 'second-yellow' | 'red' | 'yellows';

export const BAN_MATCHES = { 'second-yellow': 1, red: 3 } as const;

/** Yellow-card thresholds; `by` is the deadline as a share of the league's matchdays (19/38, 32/38). */
export const YELLOW_THRESHOLDS = [
  { yellows: 5, by: 19 / 38, matches: 1 },
  { yellows: 10, by: 32 / 38, matches: 2 },
] as const;

/** The last matchday on which a threshold's yellow still counts, in a league of `matchdays`. */
export const yellowDeadline = (by: number, matchdays: number) => Math.round(by * matchdays);

export type Ban = {
  playerId: PlayerId;
  competitionId: CompetitionId;
  clubId: ClubId;
  reason: BanReason;
  /** The fixture where it was earned. */
  fixtureId: string;
  date: string;
  matches: number;
  /** For 'yellows': the threshold reached (5 or 10). */
  yellows?: number;
  /** Matches still to serve: the ban's fixtures that haven't been played (or drawn) yet. */
  remaining: number;
};

type Discipline = {
  bans: Ban[];
  /** `${competitionId}|${date}` → players banned from that competition's fixtures on that date. */
  bannedOn: Map<string, Set<PlayerId>>;
  /** `${competitionId}|${playerId}` → yellows counted towards accumulation (leagues only). */
  yellows: Map<string, number>;
  /** Matchdays per league competition, for the yellow-card deadlines. */
  leagueLength: Map<CompetitionId, number>;
};

/** Seasons are immutable, so a cache keyed by the season object can't go stale (like the AI setup cache). */
const cache = new WeakMap<Season, Discipline>();

const byDate = (a: Fixture, b: Fixture) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1);

function computeDiscipline(season: Season): Discipline {
  const leagueIds = new Set(season.leagues.map((l) => l.competitionId));
  const fixtures = [...season.fixtures].sort(byDate);
  const leagueLength = new Map<CompetitionId, number>();
  for (const f of fixtures) {
    if (leagueIds.has(f.competitionId)) leagueLength.set(f.competitionId, Math.max(leagueLength.get(f.competitionId) ?? 0, f.matchday));
  }

  // Each club's fixtures per competition (played or not), in date order: where bans are served.
  const schedule = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    for (const clubId of [f.homeId, f.awayId]) {
      const key = `${f.competitionId}|${clubId}`;
      const list = schedule.get(key);
      if (list) list.push(f);
      else schedule.set(key, [f]);
    }
  }

  // 1. What each played fixture triggered.
  type Trigger = { playerId: PlayerId; clubId: ClubId; reason: BanReason; fixture: Fixture; matches: number; yellows?: number };
  const triggers: Trigger[] = [];
  const yellows = new Map<string, number>();
  for (const f of fixtures) {
    if (!f.result) continue;
    const cardsBy = new Map<PlayerId, { side: 'home' | 'away'; cards: string[] }>();
    for (const card of f.result.cards) {
      const entry = cardsBy.get(card.playerId) ?? { side: card.side, cards: [] };
      entry.cards.push(card.card);
      cardsBy.set(card.playerId, entry);
    }
    for (const [playerId, { side, cards }] of cardsBy) {
      const clubId = side === 'home' ? f.homeId : f.awayId;
      if (cards.includes('red')) triggers.push({ playerId, clubId, reason: 'red', fixture: f, matches: BAN_MATCHES.red });
      else if (cards.includes('second-yellow')) {
        triggers.push({ playerId, clubId, reason: 'second-yellow', fixture: f, matches: BAN_MATCHES['second-yellow'] });
      } else if (leagueIds.has(f.competitionId)) {
        const key = `${f.competitionId}|${playerId}`;
        const before = yellows.get(key) ?? 0;
        const after = before + cards.filter((c) => c === 'yellow').length;
        yellows.set(key, after);
        const length = leagueLength.get(f.competitionId) ?? f.matchday;
        for (const t of YELLOW_THRESHOLDS) {
          if (before < t.yellows && after >= t.yellows && f.matchday <= yellowDeadline(t.by, length)) {
            triggers.push({ playerId, clubId, reason: 'yellows', fixture: f, matches: t.matches, yellows: t.yellows });
          }
        }
      }
    }
  }

  // 2. Which fixtures each ban covers. Overlapping bans queue up: the next starts where the last ends.
  const bans: Ban[] = [];
  const bannedOn = new Map<string, Set<PlayerId>>();
  const queueEnd = new Map<string, string>(); // `${competitionId}|${playerId}` → date of the last fixture already covered
  for (const t of triggers) {
    const key = `${t.fixture.competitionId}|${t.playerId}`;
    const after = [t.fixture.date, queueEnd.get(key) ?? ''].reduce((a, b) => (a > b ? a : b));
    const upcoming = (schedule.get(`${t.fixture.competitionId}|${t.clubId}`) ?? []).filter((f) => f.date > after);
    const matches = t.matches;
    const covered = upcoming.slice(0, matches);
    for (const f of covered) {
      const dateKey = `${f.competitionId}|${f.date}`;
      const set = bannedOn.get(dateKey);
      if (set) set.add(t.playerId);
      else bannedOn.set(dateKey, new Set([t.playerId]));
    }
    if (covered.length) queueEnd.set(key, covered[covered.length - 1].date);
    bans.push({
      playerId: t.playerId,
      competitionId: t.fixture.competitionId,
      clubId: t.clubId,
      reason: t.reason,
      fixtureId: t.fixture.id,
      date: t.fixture.date,
      matches,
      ...(t.yellows ? { yellows: t.yellows } : {}),
      remaining: matches - covered.filter((f) => f.result !== null).length,
    });
  }
  return { bans, bannedOn, yellows, leagueLength };
}

function discipline(season: Season): Discipline {
  let d = cache.get(season);
  if (!d) {
    d = computeDiscipline(season);
    cache.set(season, d);
  }
  return d;
}

const NO_ONE: ReadonlySet<PlayerId> = new Set();

/** Players (of any club) who may not play in this fixture. */
export function suspendedFor(season: Season, fixture: Fixture | null): ReadonlySet<PlayerId> {
  if (!fixture) return NO_ONE;
  return discipline(season).bannedOn.get(`${fixture.competitionId}|${fixture.date}`) ?? NO_ONE;
}

/** A player's bans still being served this season (any competition). */
export function activeBans(season: Season, playerId: PlayerId): Ban[] {
  return discipline(season).bans.filter((b) => b.playerId === playerId && b.remaining > 0);
}

/** Yellows counting towards a ban in a league (resets each season). */
export function leagueYellows(season: Season, playerId: PlayerId, competitionId: CompetitionId): number {
  return discipline(season).yellows.get(`${competitionId}|${playerId}`) ?? 0;
}

export type YellowOutlook = { untilBan: number; byMatchday: number; matches: number };

/**
 * The next yellow-card ban a player can still earn in a league, for a match on
 * `matchday`: how many more yellows, by which matchday, and its length. Null
 * when no threshold is reachable any more (its deadline has passed).
 */
export function nextYellowBan(season: Season, playerId: PlayerId, competitionId: CompetitionId, matchday: number): YellowOutlook | null {
  const d = discipline(season);
  const length = d.leagueLength.get(competitionId);
  if (!length) return null;
  const count = leagueYellows(season, playerId, competitionId);
  for (const t of YELLOW_THRESHOLDS) {
    const byMatchday = yellowDeadline(t.by, length);
    if (count < t.yellows && matchday <= byMatchday) return { untilBan: t.yellows - count, byMatchday, matches: t.matches };
  }
  return null;
}

/** Bans earned in one fixture. */
export function bansFrom(season: Season, fixtureId: string): Ban[] {
  return discipline(season).bans.filter((b) => b.fixtureId === fixtureId);
}

// --- Words for the UI and the inbox ------------------------------------------------------

export function banReasonLabel(ban: Pick<Ban, 'reason' | 'yellows'>): string {
  if (ban.reason === 'red') return 'straight red card';
  if (ban.reason === 'second-yellow') return 'second yellow card';
  return `${ban.yellows} yellow cards`;
}

/** "the next league match", "the next 3 cup ties". */
export function matchesLabel(count: number, isCup: boolean): string {
  const noun = isCup ? (count === 1 ? 'cup tie' : 'cup ties') : count === 1 ? 'league match' : 'league matches';
  return count === 1 ? `the next ${noun}` : `the next ${count} ${noun}`;
}

/**
 * Assistant manager messages after the user's match: each new ban, and a
 * warning for anyone one league booking away from one.
 */
export function disciplineMessages(db: GameDatabase, season: Season, fixture: Fixture, clubId: ClubId, date: string): NewMessage[] {
  if (!fixture.result) return [];
  const nameOf = (id: PlayerId) => {
    const p = db.players.find((x) => x.id === id);
    return p ? fullName(p) : id;
  };
  const isCup = fixture.competitionId === season.cupId;
  const side = fixture.homeId === clubId ? 'home' : 'away';
  const bans = bansFrom(season, fixture.id).filter((b) => b.clubId === clubId);
  const banned = new Set(bans.map((b) => b.playerId));

  const banMessages = bans.map((b) => ({
    date,
    category: 'squad' as const,
    from: 'Assistant Manager',
    title: `${nameOf(b.playerId)} suspended`,
    body: `${b.reason === 'yellows' ? 'Reaching' : 'His'} ${banReasonLabel(b)} against ${db.clubs.find((c) => c.id === (side === 'home' ? fixture.awayId : fixture.homeId))?.name ?? 'them'} on ${formatDate(fixture.date)} means he misses ${matchesLabel(b.matches, isCup)}. He’ll be left out of your lineup automatically when those matches come up.`,
  }));

  const booked = new Set(fixture.result.cards.filter((c) => c.side === side && c.card === 'yellow').map((c) => c.playerId));
  const warnings = isCup
    ? []
    : [...booked].flatMap((id) => {
        const outlook = nextYellowBan(season, id, fixture.competitionId, fixture.matchday + 1);
        if (banned.has(id) || outlook?.untilBan !== 1) return [];
        return [
          {
            date,
            category: 'squad' as const,
            from: 'Assistant Manager',
            title: `${nameOf(id)} is one booking from a ban`,
            body: `That was his ${leagueYellows(season, id, fixture.competitionId)}th league yellow card of the season. One more by matchday ${outlook.byMatchday} and he misses ${matchesLabel(outlook.matches, false)}.`,
          },
        ];
      });
  return [...banMessages, ...warnings];
}

// --- Player profile ---------------------------------------------------------------------

export type DisciplineView = {
  /** e.g. "Suspended for the next 2 league matches (straight red card)". */
  bans: string[];
  /** League bookings this season and the next ban they could lead to; null without a contract in a league. */
  leagueYellows: { count: number; next: YellowOutlook | null } | null;
};

export function selectDiscipline(db: GameDatabase, season: Season, playerId: PlayerId): DisciplineView {
  const bans = activeBans(season, playerId).map(
    (b) => `Suspended for ${matchesLabel(b.remaining, b.competitionId === season.cupId)} (${banReasonLabel(b)})`,
  );
  const clubId = db.contracts.find((c) => c.playerId === playerId)?.clubId;
  // Looked up here rather than via season-flow, which imports this module.
  const leagueId = clubId ? season.leagues.find((l) => l.clubIds.includes(clubId))?.competitionId : undefined;
  if (!leagueId) return { bans, leagueYellows: null };
  const unplayed = season.fixtures.filter((f) => f.competitionId === leagueId && !f.result).map((f) => f.matchday);
  const next = unplayed.length ? nextYellowBan(season, playerId, leagueId, Math.min(...unplayed)) : null;
  return { bans, leagueYellows: { count: leagueYellows(season, playerId, leagueId), next } };
}
