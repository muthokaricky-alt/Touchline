import { useMemo } from 'react';

import type { ClubId, PlayerId } from '@/data/schemas';
import { buildAiTeam } from '@/game/ai/opponent';
import { availabilityFrom, conditionOn } from '@/game/condition/condition';
import { selectProspects } from '@/game/development/training-view';
import { lineupStrength } from '@/game/match/build-match-team';
import { competitionName, leagueOfClub, nextFixtureFor, roundLabel } from '@/game/season/season-flow';
import { MAX_SQUAD, MIN_USER_SQUAD, releaseCost, renewalYears, squadSize, transferProblems, wageBill } from '@/game/transfers/complete';
import { liveOffers } from '@/game/transfers/offers';
import { searchMarket, type MarketFilters } from '@/game/transfers/market';
import { askingPrice, personalTerms, playerContext } from '@/game/transfers/negotiation';
import { transferWindow } from '@/game/transfers/window';
import {
  findClub,
  fullName,
  groupSquad,
  selectPlayerProfile,
  selectSquad,
  selectSquadCandidates,
} from '@/game/squad/squad-selectors';
import { selectPlayerPicker, selectTeamSheet, type PickerTarget } from '@/game/squad/team-sheet';
import { analyseTactics } from '@/game/tactics/analysis';
import { matchPlayingStyle } from '@/game/tactics/presets';

import { conditionAtKickOff, useGameStore } from './game-store';

/**
 * React hooks that turn store state into view models.
 *
 * Pattern: subscribe to *raw* state slices (stable references), then build
 * the view model with useMemo. The view model is only rebuilt when one of
 * those slices actually changes. See the note in game-store.ts for why we
 * don't build objects inside the Zustand selector.
 */

export function useUserClub() {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  return useMemo(() => findClub(database, clubId), [database, clubId]);
}

/** Every player's fitness, morale and injuries as of today (recovery since the last matchday applied). */
export function useConditionToday() {
  const condition = useGameStore((s) => s.condition);
  const date = useGameStore((s) => s.currentDate);
  return useMemo(() => conditionOn(condition, date), [condition, date]);
}

/** Condition as it will be at the user's next kick-off: what team selection should judge players by. */
export function useConditionAtKickOff() {
  const condition = useGameStore((s) => s.condition);
  const currentDate = useGameStore((s) => s.currentDate);
  const season = useGameStore((s) => s.season);
  const userClubId = useGameStore((s) => s.userClubId);
  return useMemo(() => conditionAtKickOff({ condition, currentDate, season, userClubId }), [condition, currentDate, season, userClubId]);
}

export function useSquadGroups() {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const date = useGameStore((s) => s.currentDate);
  const today = useConditionToday();
  return useMemo(() => groupSquad(selectSquad(database, clubId, date, today)), [database, clubId, date, today]);
}

export function usePlayerProfile(playerId: PlayerId) {
  const database = useGameStore((s) => s.database);
  const date = useGameStore((s) => s.currentDate);
  const clubId = useGameStore((s) => s.userClubId);
  const today = useConditionToday();
  return useMemo(() => selectPlayerProfile(database, playerId, date, today, clubId), [database, playerId, date, today, clubId]);
}

/** The user's young players and their potential, for the Training screen. */
export function useProspects() {
  const database = useGameStore((s) => s.database);
  const date = useGameStore((s) => s.currentDate);
  const clubId = useGameStore((s) => s.userClubId);
  return useMemo(() => selectProspects(database, clubId, date), [database, clubId, date]);
}

export function useTeamSheet() {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const lineup = useGameStore((s) => s.lineup);
  const atKickOff = useConditionAtKickOff();
  return useMemo(() => selectTeamSheet(database, clubId, lineup, availabilityFrom(atKickOff)), [database, clubId, lineup, atKickOff]);
}

/** Other clubs in the user's league this season, strongest first: friendly opponents. */
export function useLeagueOpponents() {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const season = useGameStore((s) => s.season);
  return useMemo(() => {
    const leagueId = leagueOfClub(season, clubId);
    const members = new Set(season.leagues.find((l) => l.competitionId === leagueId)?.clubIds ?? []);
    return database.clubs
      .filter((c) => c.id !== clubId && members.has(c.id))
      .sort((a, b) => b.reputation - a.reputation || a.name.localeCompare(b.name))
      .map((c) => ({ id: c.id, name: c.name, reputation: c.reputation }));
  }, [database, clubId, season]);
}

/** How the AI opponent would line up against the user's current XI (formation + style), or null. */
export function useOpponentPreview(opponentId: ClubId | null) {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const lineup = useGameStore((s) => s.lineup);
  return useMemo(() => {
    if (!opponentId) return null;
    const ai = buildAiTeam(database, opponentId, lineupStrength(lineup, selectSquadCandidates(database, clubId)));
    return `${ai.lineup.formationId} · ${matchPlayingStyle(ai.tactics)?.name ?? 'Custom'}`;
  }, [database, clubId, lineup, opponentId]);
}

/** The user's next fixture in any competition, shaped for the pre-match screen, or null when they have none left. */
export function useNextFixture() {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const season = useGameStore((s) => s.season);
  return useMemo(() => {
    const fixture = nextFixtureFor(season, clubId);
    if (!fixture) return null;
    const nameOf = (id: ClubId) => findClub(database, id)?.name ?? id;
    const venue = fixture.homeId === clubId ? ('home' as const) : ('away' as const);
    return {
      fixtureId: fixture.id,
      competitionName: competitionName(database, fixture.competitionId),
      isCup: fixture.competitionId === season.cupId,
      roundLabel: roundLabel(season, fixture),
      date: fixture.date,
      venue,
      opponentId: venue === 'home' ? fixture.awayId : fixture.homeId,
      homeName: nameOf(fixture.homeId),
      awayName: nameOf(fixture.awayId),
    };
  }, [database, clubId, season]);
}

/** The user's transfer position: window, budgets, wage room, squad size. */
export function useTransferBudget() {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const date = useGameStore((s) => s.currentDate);
  return useMemo(() => {
    const club = findClub(database, clubId);
    const bill = wageBill(database, clubId);
    return {
      window: transferWindow(date),
      transferBudget: club?.finances.transferBudget ?? 0,
      balance: club?.finances.balance ?? 0,
      wageBill: bill,
      wageBudget: club?.finances.weeklyWageBudget ?? 0,
      wageRoom: Math.max(0, (club?.finances.weeklyWageBudget ?? 0) - bill),
      squadSize: squadSize(database, clubId),
      maxSquad: MAX_SQUAD,
    };
  }, [database, clubId, date]);
}

export function useTransferMarket(filters: MarketFilters) {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const season = useGameStore((s) => s.season);
  const date = useGameStore((s) => s.currentDate);
  return useMemo(() => searchMarket(database, season, clubId, filters, date), [database, season, clubId, filters, date]);
}

/**
 * Everything the profile and negotiation screens need about a possible
 * signing, or null for the user's own players / unknown ids.
 */
export function useTransferTarget(playerId: PlayerId) {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const date = useGameStore((s) => s.currentDate);
  return useMemo(() => {
    const ctx = playerContext(database, playerId, date);
    const buyer = findClub(database, clubId);
    if (!ctx || !buyer || ctx.club?.id === clubId) return null;
    return {
      ctx,
      name: fullName(ctx.player),
      askingPrice: ctx.club ? askingPrice(ctx) : 0,
      terms: personalTerms(ctx, buyer),
      /** Problems with the cheapest possible deal (asking price, demanded wage). */
      blockers: transferProblems(database, {
        playerId,
        buyerId: clubId,
        fee: ctx.club ? askingPrice(ctx) : 0,
        weeklyWage: 0,
        years: 1,
        date,
      }).filter((p) => !/transfer budget/.test(p)), // budget is shown separately: you might still bid lower
    };
  }, [database, clubId, playerId, date]);
}

/**
 * One of the user's own players, for the profile's contract card: terms he'd
 * renew on, what releasing him costs, whether he's listed and any live offers.
 * Null for other clubs' players (they get useTransferTarget instead).
 */
export function useOwnPlayerContract(playerId: PlayerId) {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const date = useGameStore((s) => s.currentDate);
  const listed = useGameStore((s) => s.transferListed);
  const offers = useGameStore((s) => s.offers);
  return useMemo(() => {
    const ctx = playerContext(database, playerId, date);
    const club = findClub(database, clubId);
    if (!ctx || !club || !ctx.contract || ctx.club?.id !== clubId) return null;
    const size = squadSize(database, clubId);
    const terms = personalTerms(ctx, club);
    return {
      contract: ctx.contract,
      value: ctx.value,
      isKeyPlayer: ctx.isKeyPlayer,
      renewal: terms.willing ? { ...terms, years: renewalYears(ctx.contract, date, terms.maxYears) } : terms,
      releaseCost: releaseCost(ctx.contract, date),
      canRelease: size > MIN_USER_SQUAD,
      minSquad: MIN_USER_SQUAD,
      listed: listed.includes(playerId),
      offers: liveOffers(database, clubId, offers, date)
        .filter((o) => o.playerId === playerId)
        .map((o) => ({ ...o, clubName: findClub(database, o.fromClubId)?.name ?? o.fromClubId })),
      windowOpen: transferWindow(date).open,
    };
  }, [database, clubId, playerId, date, listed, offers]);
}

/** Inbox messages (newest first), with the live offer attached to offer messages. */
export function useInbox() {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const date = useGameStore((s) => s.currentDate);
  const inbox = useGameStore((s) => s.inbox);
  const offers = useGameStore((s) => s.offers);
  return useMemo(() => {
    const live = new Map(liveOffers(database, clubId, offers, date).map((o) => [o.id, o]));
    return inbox.map((message) => ({ message, liveOffer: message.offerId ? (live.get(message.offerId) ?? null) : null }));
  }, [database, clubId, date, inbox, offers]);
}

/** Lookup from player id to full name, for commentary and ratings. */
export function usePlayerNames() {
  const database = useGameStore((s) => s.database);
  return useMemo(() => {
    const names = new Map(database.players.map((p) => [p.id, fullName(p)]));
    return (id: PlayerId) => names.get(id) ?? 'Unknown player';
  }, [database]);
}

/** Current tactics, the playing style they match (null = custom) and the assistant's notes. */
export function useTacticsView() {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const lineup = useGameStore((s) => s.lineup);
  const tactics = useGameStore((s) => s.tactics);
  return useMemo(
    () => ({
      tactics,
      style: matchPlayingStyle(tactics),
      notes: analyseTactics(tactics, lineup, selectSquadCandidates(database, clubId)),
    }),
    [database, clubId, lineup, tactics],
  );
}

export function usePlayerPicker(target: PickerTarget | null) {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const lineup = useGameStore((s) => s.lineup);
  const atKickOff = useConditionAtKickOff();
  return useMemo(
    () => (target ? selectPlayerPicker(database, clubId, lineup, target, availabilityFrom(atKickOff)) : null),
    [database, clubId, lineup, target, atKickOff],
  );
}
