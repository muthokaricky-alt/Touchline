import { buildFictionalDatabase, FICTIONAL_REFERENCE_DATE, FICTIONAL_SEED } from '@/data/fictional';
import { assignPotential, potentialOf } from '@/game/development/potential';
import { createSeason } from '@/game/season/season-flow';
import { DEFAULT_FILTERS, searchMarket } from '@/game/transfers/market';
import { isProspectId } from '@/game/world/prospects';
import { worldFor } from '@/game/world/renewal';
import { addDays, ageOn } from '@/utils/date';

import {
  cancelRegionAssignment,
  deliverAllReports,
  deliverRegionReports,
  regionAssignmentViews,
  regionOptions,
  regionProblem,
  REGION_REPORT_DAYS,
  REPORT_PROSPECTS,
  shortlistViews,
  startRegionAssignment,
  WONDERKID_MAX_AGE,
} from '../region-scouting';
import { busyScouts, EMPTY_SCOUTING, knowledgeOf, SCOUTS, scoutingProblem, startAssignment, withoutMissingPlayers } from '../scouting';

const db = assignPotential(buildFictionalDatabase(), FICTIONAL_SEED, FICTIONAL_REFERENCE_DATE);
const USER = 'club_greywater_town';
const TODAY = '2026-08-01';
const DUE = addDays(TODAY, REGION_REPORT_DAYS);
const clubCountry = new Map(db.clubs.map((c) => [c.id, c.country]));
const clubOfPlayer = new Map(db.contracts.map((c) => [c.playerId, c.clubId]));

describe('scouting trips', () => {
  it('lists the countries that have clubs, by name', () => {
    const options = regionOptions(db);
    expect(options.map((o) => o.value)).toEqual(expect.arrayContaining(['ENG', 'KEN', 'FRA', 'GER', 'ITA']));
    expect(options.find((o) => o.value === 'KEN')?.label).toBe('Kenya');
    expect(options.map((o) => o.label)).toEqual([...options.map((o) => o.label)].sort((a, b) => a.localeCompare(b)));
  });

  it('shares the scouts with single-player assignments, rejects duplicates and unknown countries', () => {
    let state = startRegionAssignment(EMPTY_SCOUTING, db, 'KEN', 'all', TODAY);
    expect(state.regionAssignments).toEqual([{ nation: 'KEN', group: 'all', started: TODAY, due: DUE }]);
    expect(busyScouts(state)).toBe(1);
    expect(regionProblem(state, db, 'KEN', 'all')).toMatch(/already in Kenya/);
    expect(regionProblem(state, db, 'KEN', 'attackers')).toBeNull();
    expect(regionProblem(state, db, 'XXX', 'all')).toMatch(/no clubs/);

    const target = db.contracts.find((c) => c.clubId !== USER)!.playerId;
    state = startAssignment(state, db, USER, target, TODAY);
    state = startRegionAssignment(state, db, 'FRA', 'all', TODAY);
    expect(busyScouts(state)).toBe(SCOUTS);
    expect(regionProblem(state, db, 'GER', 'all')).toBe(`All ${SCOUTS} scouts are busy.`);
    expect(() => startRegionAssignment(state, db, 'GER', 'all', TODAY)).toThrow(RangeError);
    // The busy count also stops a player assignment.
    const another = db.contracts.filter((c) => c.clubId !== USER)[1].playerId;
    expect(scoutingProblem(state, db, USER, another)).toBe(`All ${SCOUTS} scouts are busy.`);

    state = cancelRegionAssignment(state, 'KEN', 'all');
    expect(regionAssignmentViews(state).map((v) => v.nation)).toEqual(['FRA']);
    expect(regionProblem(state, db, 'GER', 'all')).toBeNull();
  });

  it('brings back up to three young players from that country, scouted and on the shortlist', () => {
    const state = startRegionAssignment(EMPTY_SCOUTING, db, 'KEN', 'all', TODAY);
    expect(deliverRegionReports(state, db, USER, addDays(TODAY, REGION_REPORT_DAYS - 1))).toEqual({ state, messages: [] });

    const { state: after, messages } = deliverRegionReports(state, db, USER, addDays(TODAY, 30));
    expect(after.regionAssignments).toEqual([]);
    expect(after.shortlist).toHaveLength(REPORT_PROSPECTS);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ category: 'scouting', from: 'Chief Scout', date: DUE, title: 'Scouting trip: Kenya' });

    for (const id of after.shortlist) {
      const player = db.players.find((p) => p.id === id)!;
      expect(ageOn(player.dateOfBirth, DUE)).toBeLessThanOrEqual(WONDERKID_MAX_AGE);
      expect(clubCountry.get(clubOfPlayer.get(id)!)).toBe('KEN');
      expect(clubOfPlayer.get(id)).not.toBe(USER);
      expect(knowledgeOf(after, db, USER, id)).toBe(1);
      expect(messages[0].body).toContain(`${player.firstName} ${player.lastName}`);
    }
  });

  it('is deterministic: the same trip always finds the same players', () => {
    const state = startRegionAssignment(EMPTY_SCOUTING, db, 'FRA', 'midfielders', TODAY);
    const a = deliverRegionReports(state, db, USER, DUE);
    const b = deliverRegionReports(state, db, USER, DUE);
    expect(a).toEqual(b);
  });

  it('respects the position group', () => {
    const state = startRegionAssignment(EMPTY_SCOUTING, db, 'ENG', 'attackers', TODAY);
    const { state: after } = deliverRegionReports(state, db, USER, DUE);
    expect(after.shortlist.length).toBeGreaterThan(0);
    for (const id of after.shortlist) {
      expect(['ST', 'LW', 'RW']).toContain(db.players.find((p) => p.id === id)!.primaryPosition);
    }
  });

  it('favours talent: finds players with high potential among the young', () => {
    const state = startRegionAssignment(EMPTY_SCOUTING, db, 'ITA', 'all', TODAY);
    const { state: after } = deliverRegionReports(state, db, USER, DUE);
    const found = after.shortlist.map((id) => {
      const p = db.players.find((x) => x.id === id)!;
      return potentialOf(p, db.attributes.find((a) => a.playerId === id)!);
    });
    const pool = db.players
      .filter((p) => clubCountry.get(clubOfPlayer.get(p.id) ?? '') === 'ITA' && ageOn(p.dateOfBirth, DUE) <= WONDERKID_MAX_AGE)
      .map((p) => potentialOf(p, db.attributes.find((a) => a.playerId === p.id)!));
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean(found)).toBeGreaterThan(mean(pool));
  });

  it('two scouts in one country never bring back the same player, and a second trip skips known players', () => {
    let state = startRegionAssignment(EMPTY_SCOUTING, db, 'GER', 'all', TODAY);
    state = startRegionAssignment(state, db, 'GER', 'defenders', TODAY);
    const { state: after } = deliverRegionReports(state, db, USER, DUE);
    expect(new Set(after.shortlist).size).toBe(after.shortlist.length);

    const again = deliverRegionReports(startRegionAssignment(after, db, 'GER', 'all', DUE), db, USER, addDays(DUE, REGION_REPORT_DAYS));
    const fresh = again.state.shortlist.slice(0, REPORT_PROSPECTS);
    for (const id of fresh) expect(after.shortlist).not.toContain(id);
  });

  it('says so when a trip finds nobody new', () => {
    const state = startRegionAssignment(EMPTY_SCOUTING, db, 'ENG', 'goalkeepers', TODAY);
    const youngKeepers = db.players.filter(
      (p) => p.primaryPosition === 'GK' && clubCountry.get(clubOfPlayer.get(p.id) ?? '') === 'ENG' && ageOn(p.dateOfBirth, DUE) <= WONDERKID_MAX_AGE,
    );
    const known = { ...state, knowledge: Object.fromEntries(youngKeepers.map((p) => [p.id, 1 as const])) };
    const { state: after, messages } = deliverRegionReports(known, db, USER, DUE);
    expect(after.shortlist).toEqual([]);
    expect(messages[0].body).toMatch(/found no young goalkeepers you don't already know about/);
  });

  it('delivers player reports and trip reports together, and keeps trips when players leave football', () => {
    const target = db.contracts.find((c) => c.clubId !== USER)!.playerId;
    let state = startAssignment(EMPTY_SCOUTING, db, USER, target, TODAY);
    state = startRegionAssignment(state, db, 'KEN', 'all', TODAY);
    const { state: after, messages } = deliverAllReports(state, db, USER, addDays(TODAY, 40));
    const titles = messages.map((m) => m.title);
    expect(titles).toHaveLength(2);
    expect(titles).toContain('Scouting trip: Kenya');
    expect(titles.some((t) => /^Scouting report: /.test(t))).toBe(true);
    expect(after.assignments).toEqual([]);
    expect(after.regionAssignments).toEqual([]);

    const gone = after.shortlist[0];
    const cleaned = withoutMissingPlayers(after, { ...db, players: db.players.filter((p) => p.id !== gone) });
    expect(cleaned.shortlist).not.toContain(gone);
    expect(cleaned.shortlist).toHaveLength(after.shortlist.length - 1);
    const stillOut = startRegionAssignment(EMPTY_SCOUTING, db, 'FRA', 'all', TODAY);
    expect(withoutMissingPlayers(stillOut, db).regionAssignments).toHaveLength(1);
  });

  it('shows the shortlist with ratings and potential ranges, newest first', () => {
    const state = startRegionAssignment(EMPTY_SCOUTING, db, 'KEN', 'all', TODAY);
    const { state: after } = deliverRegionReports(state, db, USER, DUE);
    const views = shortlistViews(after, db, USER, DUE);
    expect(views.map((v) => v.id)).toEqual(after.shortlist);
    for (const v of views) {
      expect(v.age).toBeLessThanOrEqual(WONDERKID_MAX_AGE);
      expect(v.potential).toMatch(/^\d+(–\d+)?$/);
      expect(v.clubName).not.toBe('Free agent');
    }
  });

  describe('youth prospects (from the 2027 summer)', () => {
    const world = worldFor(db, FICTIONAL_SEED, 2027);
    const T = '2027-08-01';
    const D = addDays(T, REGION_REPORT_DAYS);
    const nations = regionOptions(world).map((o) => o.value);

    it('are found by trips to their country, described as unattached', () => {
      let found = 0;
      for (const nation of nations) {
        const state = startRegionAssignment(EMPTY_SCOUTING, world, nation, 'all', T);
        const { state: after, messages } = deliverRegionReports(state, world, USER, D);
        const prospects = after.shortlist.filter(isProspectId);
        found += prospects.length;
        for (const id of prospects) {
          expect(world.players.find((p) => p.id === id)!.nationality).toBe(nation);
          expect(world.contracts.some((c) => c.playerId === id)).toBe(false);
          expect(shortlistViews(after, world, USER, D).find((v) => v.id === id)!.clubName).toBe('Unattached');
        }
        if (prospects.length > 0) expect(messages[0].body).toContain('unattached');
      }
      expect(found).toBeGreaterThan(0);
    });

    it('stay off the transfer market until scouted, then show up as free agents', () => {
      const season = createSeason(world, 2026, FICTIONAL_SEED);
      let after = EMPTY_SCOUTING;
      let prospectId: string | undefined;
      for (const nation of nations) {
        after = deliverRegionReports(startRegionAssignment(EMPTY_SCOUTING, world, nation, 'all', T), world, USER, D).state;
        prospectId = after.shortlist.find(isProspectId);
        if (prospectId) break;
      }
      expect(prospectId).toBeDefined();
      const filters = { ...DEFAULT_FILTERS, scope: 'free' as const };
      const hidden = searchMarket(world, season, USER, filters, T, 5000, (id) => !isProspectId(id));
      expect(hidden.some((v) => v.id === prospectId)).toBe(false);
      const visible = searchMarket(world, season, USER, filters, T, 5000, (id) => !isProspectId(id) || after.knowledge[id] !== undefined);
      expect(visible.some((v) => v.id === prospectId)).toBe(true);
      expect(searchMarket(world, season, USER, filters, T, 5000).some((v) => v.id === prospectId)).toBe(true);
    });
  });
});
