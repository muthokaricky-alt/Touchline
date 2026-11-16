import { buildFictionalDatabase, FICTIONAL_REFERENCE_DATE, FICTIONAL_SEED } from '@/data/fictional';
import { type GameDatabase } from '@/data/schemas';
import { emptyConditions, isInjured } from '@/game/condition/condition';
import { createSeason } from '@/game/season/season-flow';
import { selectPlayerProfile } from '@/game/squad/squad-selectors';
import { playerAbility } from '@/game/transfers/valuation';
import { ageOn } from '@/utils/date';

import { DEFAULT_TRAINING, monthsCrossed } from '../development';
import { developmentReport, developThrough } from '../monthly';
import { assignPotential, formatPotentialRange, potentialRange } from '../potential';
import { selectProspects } from '../training-view';

const world = assignPotential(buildFictionalDatabase(), FICTIONAL_SEED, FICTIONAL_REFERENCE_DATE);
const season = createSeason(world, 2026, 3); // no results: everyone gets the pre-season playing share
const USER = 'club_greywater_town';

const ability = (db: GameDatabase, id: string) => playerAbility(db.players.find((p) => p.id === id)!, db.attributes.find((a) => a.playerId === id)!);
const ageAtStart = (id: string) => ageOn(world.players.find((p) => p.id === id)!.dateOfBirth, FICTIONAL_REFERENCE_DATE);

describe('potential', () => {
  it('gives every player a potential, young players more headroom', () => {
    expect(world.players.every((p) => p.potential !== undefined && p.potential >= 1 && p.potential <= 20)).toBe(true);
    const headroom = (minAge: number, maxAge: number) => {
      const group = world.players.filter((p) => ageAtStart(p.id) >= minAge && ageAtStart(p.id) <= maxAge);
      return group.reduce((s, p) => s + p.potential! - ability(world, p.id), 0) / group.length;
    };
    console.log(`Average headroom: ≤19 ${headroom(0, 19).toFixed(2)}, 20–23 ${headroom(20, 23).toFixed(2)}, 27+ ${headroom(27, 99).toFixed(2)}`);
    expect(headroom(0, 19)).toBeGreaterThan(3);
    expect(headroom(20, 23)).toBeGreaterThan(0.8);
    expect(headroom(27, 99)).toBeCloseTo(0, 1); // potential is stored to 1 decimal
  });

  it('is deterministic and does not change the generated players', () => {
    const again = assignPotential(buildFictionalDatabase(), FICTIONAL_SEED, FICTIONAL_REFERENCE_DATE);
    expect(again).toEqual(world);
    const plain = buildFictionalDatabase();
    expect(world.attributes).toEqual(plain.attributes);
    expect(world.players.map(({ potential: _p, ...rest }) => rest)).toEqual(plain.players);
  });

  it('shows the user a range that contains the true potential', () => {
    for (const p of world.players.slice(0, 300)) {
      const a = ability(world, p.id);
      for (const own of [true, false]) {
        const { low, high } = potentialRange(p.id, p.potential!, a, own);
        expect(low).toBeLessThanOrEqual(Math.round(p.potential!) + 0); // rounding can't push it past the truth
        expect(high).toBeGreaterThanOrEqual(Math.min(20, Math.round(p.potential!)) - 0);
        expect(high - low).toBeLessThanOrEqual(own ? 2 : 4);
      }
    }
    expect(formatPotentialRange({ low: 12, high: 15 })).toBe('12–15');
    expect(formatPotentialRange({ low: 14, high: 14 })).toBe('14');
  });
});

describe('monthly orchestration', () => {
  it('crosses months correctly', () => {
    expect(monthsCrossed('2026-08-29', '2026-09-05')).toEqual(['2026-09-01']);
    expect(monthsCrossed('2026-09-01', '2026-09-30')).toEqual([]);
    expect(monthsCrossed('2026-11-28', '2027-02-01')).toEqual(['2026-12-01', '2027-01-01', '2027-02-01']);
  });

  it('develops, injures some players in training and reports to the user', () => {
    const outcome = developThrough({
      db: world,
      from: '2026-08-29',
      to: '2026-09-05',
      season,
      condition: emptyConditions('2026-08-29'),
      userClubId: USER,
      userTraining: { focus: 'balanced', intensity: 'heavy' },
      seed: FICTIONAL_SEED,
    });
    expect(outcome.months).toEqual(['2026-09-01']);
    expect(outcome.changes.length).toBeGreaterThan(50);
    expect(outcome.trainingInjuries.length).toBeGreaterThan(0);
    outcome.trainingInjuries.forEach((i) => expect(isInjured(outcome.condition, i.playerId)).toBe(true));
    const report = developmentReport(outcome.db, USER, outcome, '2026-09-05');
    expect(report?.from).toBe('Head of Coaching');
    expect(report?.title).toBe('Development report: September');
  });

  it('does nothing when no month is crossed', () => {
    const outcome = developThrough({
      db: world, from: '2026-09-05', to: '2026-09-12', season, condition: emptyConditions('2026-09-05'), userClubId: USER, userTraining: DEFAULT_TRAINING, seed: 1,
    });
    expect(outcome.db).toBe(world);
    expect(outcome.trainingInjuries).toEqual([]);
  });
});

describe('views', () => {
  it("lists the user's players aged 23 or under, most headroom first", () => {
    const prospects = selectProspects(world, USER, FICTIONAL_REFERENCE_DATE);
    expect(prospects.length).toBeGreaterThan(0);
    prospects.forEach((p) => expect(p.age).toBeLessThanOrEqual(23));
    const headroom = (id: string) => world.players.find((x) => x.id === id)!.potential! - ability(world, id);
    for (let i = 1; i < prospects.length; i++) expect(headroom(prospects[i - 1].id)).toBeGreaterThanOrEqual(headroom(prospects[i].id) - 0.11);
  });

  it('profiles show a narrower potential range for your own players', () => {
    const youngster = selectProspects(world, USER, FICTIONAL_REFERENCE_DATE)[0];
    const width = (s: string) => (s.includes('–') ? Number(s.split('–')[1]) - Number(s.split('–')[0]) : 0);
    const asOwner = selectPlayerProfile(world, youngster.id, FICTIONAL_REFERENCE_DATE, undefined, USER)!;
    const asRival = selectPlayerProfile(world, youngster.id, FICTIONAL_REFERENCE_DATE, undefined, 'club_kestrel_bay')!;
    expect(width(asOwner.development.potential)).toBeLessThanOrEqual(width(asRival.development.potential));
    expect(asOwner.development.rating).toBe(youngster.rating);
  });
});
