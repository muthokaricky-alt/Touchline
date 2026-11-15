import { buildFictionalDatabase, FICTIONAL_REFERENCE_DATE } from '@/data/fictional';
import { autoPickLineup, clearSlot, removeFromLineup, type Lineup } from '@/game/lineup';

import {
  fullName,
  groupSquad,
  selectPlayerProfile,
  selectSquad,
  selectSquadCandidates,
  shortName,
} from '../squad-selectors';
import { parsePickerTarget, selectPlayerPicker, selectTeamSheet } from '../team-sheet';

const db = buildFictionalDatabase();
const CLUB = 'club_greywater_town';
const DATE = FICTIONAL_REFERENCE_DATE;
const lineup: Lineup = autoPickLineup(selectSquadCandidates(db, CLUB), '4-4-2');

describe('names', () => {
  it('formats full and short names', () => {
    const p = { firstName: 'Tom', lastName: 'de Groot' };
    expect(fullName(p)).toBe('Tom de Groot');
    expect(shortName(p)).toBe('T. de Groot');
  });
});

describe('selectSquad', () => {
  const squad = selectSquad(db, CLUB, DATE);

  it('returns only players contracted to the club', () => {
    const clubPlayers = new Set(db.contracts.filter((c) => c.clubId === CLUB).map((c) => c.playerId));
    expect(squad).toHaveLength(22);
    squad.forEach((p) => expect(clubPlayers.has(p.id)).toBe(true));
  });

  it('includes squad numbers, ages and whole-number ratings', () => {
    for (const p of squad) {
      expect(p.squadNumber).not.toBeNull();
      expect(p.age).toBeGreaterThanOrEqual(17);
      expect(Number.isInteger(p.rating)).toBe(true);
      expect(p.rating).toBeGreaterThanOrEqual(1);
      expect(p.rating).toBeLessThanOrEqual(20);
    }
  });

  it('returns an empty list for an unknown club', () => {
    expect(selectSquad(db, 'club_nowhere', DATE)).toEqual([]);
  });
});

describe('groupSquad', () => {
  const groups = groupSquad(selectSquad(db, CLUB, DATE));

  it('orders groups GK → DEF → MID → ATT with the template counts', () => {
    expect(groups.map((g) => [g.group, g.players.length])).toEqual([
      ['goalkeepers', 3],
      ['defenders', 8],
      ['midfielders', 7],
      ['attackers', 4],
    ]);
  });

  it('sorts players by rating within a group', () => {
    for (const group of groups) {
      const ratings = group.players.map((p) => p.rating);
      expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
    }
  });

  it('drops empty groups', () => {
    const onlyKeepers = selectSquad(db, CLUB, DATE).filter((p) => p.group === 'goalkeepers');
    expect(groupSquad(onlyKeepers).map((g) => g.group)).toEqual(['goalkeepers']);
  });
});

describe('selectPlayerProfile', () => {
  const squad = selectSquadCandidates(db, CLUB);
  const keeper = squad.find((c) => c.player.primaryPosition === 'GK')!.player;
  const striker = squad.find((c) => c.player.primaryPosition === 'ST')!.player;

  it('joins identity, club and contract', () => {
    const profile = selectPlayerProfile(db, striker.id, DATE)!;
    expect(profile.fullName).toBe(fullName(striker));
    expect(profile.club?.id).toBe(CLUB);
    expect(profile.contract?.squadNumber).toBeGreaterThan(0);
  });

  it('lists ratings for primary then secondary positions', () => {
    const profile = selectPlayerProfile(db, striker.id, DATE)!;
    expect(profile.positionRatings.map((r) => r.position)).toEqual([striker.primaryPosition, ...striker.secondaryPositions]);
    expect(profile.positionRatings[0].fit).toBe('natural');
  });

  it('shows goalkeeping attributes first for keepers and hides them for outfielders', () => {
    expect(selectPlayerProfile(db, keeper.id, DATE)!.attributeGroups[0].group).toBe('goalkeeping');
    expect(selectPlayerProfile(db, striker.id, DATE)!.attributeGroups.map((g) => g.group)).toEqual([
      'technical',
      'mental',
      'physical',
    ]);
  });

  it('has null club and contract for a free agent', () => {
    const freeAgentDb = { ...db, contracts: db.contracts.filter((c) => c.playerId !== striker.id) };
    const profile = selectPlayerProfile(freeAgentDb, striker.id, DATE)!;
    expect(profile.club).toBeNull();
    expect(profile.contract).toBeNull();
  });

  it('returns null for an unknown player', () => {
    expect(selectPlayerProfile(db, 'plr_9999', DATE)).toBeNull();
  });
});

describe('selectTeamSheet', () => {
  it('places players in all 11 slots with a full bench and no errors', () => {
    const sheet = selectTeamSheet(db, CLUB, lineup);
    expect(sheet.slots).toHaveLength(11);
    expect(sheet.slots.every((s) => s.player !== null)).toBe(true);
    expect(sheet.substitutes).toHaveLength(sheet.benchSize);
    expect(sheet.benchFull).toBe(true);
    expect(sheet.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(sheet.averageRating).toBeGreaterThan(5);
  });

  it('shows empty slots and their errors', () => {
    const sheet = selectTeamSheet(db, CLUB, clearSlot(lineup, 'GK'));
    expect(sheet.slots.find((s) => s.slotId === 'GK')!.player).toBeNull();
    expect(sheet.issues.map((i) => i.code)).toContain('empty-slot');
  });
});

describe('parsePickerTarget', () => {
  it('accepts bench and slots in the formation only', () => {
    expect(parsePickerTarget('bench', '4-4-2')).toEqual({ kind: 'bench' });
    expect(parsePickerTarget('LB', '4-4-2')).toEqual({ kind: 'slot', slotId: 'LB' });
    expect(parsePickerTarget('DM', '4-4-2')).toBeNull();
    expect(parsePickerTarget(undefined, '4-4-2')).toBeNull();
  });
});

describe('selectPlayerPicker', () => {
  it('for a slot: lists everyone but the occupant, best first, with fit', () => {
    const picker = selectPlayerPicker(db, CLUB, lineup, { kind: 'slot', slotId: 'LB' });
    expect(picker.position).toBe('LB');
    expect(picker.current?.id).toBe(lineup.starters.LB);
    expect(picker.options).toHaveLength(21);
    expect(picker.options.every((o) => o.fit !== null)).toBe(true);
    const ratings = picker.options.map((o) => o.rating);
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
  });

  it('for the bench: leaves out current substitutes and has no fit', () => {
    const smallerBench = removeFromLineup(lineup, lineup.substitutes[0]);
    const picker = selectPlayerPicker(db, CLUB, smallerBench, { kind: 'bench' });
    expect(picker.position).toBeNull();
    expect(picker.options).toHaveLength(22 - smallerBench.substitutes.length);
    expect(picker.options.every((o) => o.fit === null && o.status.kind !== 'substitute')).toBe(true);
  });

  it('reports each option status', () => {
    const picker = selectPlayerPicker(db, CLUB, lineup, { kind: 'slot', slotId: 'GK' });
    const kinds = new Set(picker.options.map((o) => o.status.kind));
    expect(kinds).toEqual(new Set(['starter', 'substitute', 'reserve']));
  });
});
