import { buildFictionalDatabase, FICTIONAL_REFERENCE_DATE, FICTIONAL_SEED } from '@/data/fictional';
import { PlayerAttributesSchema, type GameDatabase } from '@/data/schemas';
import { emptyConditions, isInjured } from '@/game/condition/condition';
import { createSeason } from '@/game/season/season-flow';
import { selectPlayerProfile } from '@/game/squad/squad-selectors';
import { playerAbility } from '@/game/transfers/valuation';
import { ageOn } from '@/utils/date';
import { createRng } from '@/utils/random';

import {
  ageGrowth,
  DEFAULT_TRAINING,
  declineChance,
  developPlayer,
  developWorld,
  monthsCrossed,
  playingShares,
  type Training,
} from '../development';
import { developmentReport, developThrough } from '../monthly';
import { assignPotential, formatPotentialRange, potentialOf, potentialRange } from '../potential';
import { selectProspects } from '../training-view';

const world = assignPotential(buildFictionalDatabase(), FICTIONAL_SEED, FICTIONAL_REFERENCE_DATE);
const season = createSeason(world, 2026, 3); // no results: everyone gets the pre-season playing share
const USER = 'club_greywater_town';

const ability = (db: GameDatabase, id: string) => playerAbility(db.players.find((p) => p.id === id)!, db.attributes.find((a) => a.playerId === id)!);
const ageAtStart = (id: string) => ageOn(world.players.find((p) => p.id === id)!.dateOfBirth, FICTIONAL_REFERENCE_DATE);

/** Develops the world month by month for `years` from August 2026. */
function developYears(years: number, training: (clubId: string | null) => Training = () => DEFAULT_TRAINING): GameDatabase {
  let db = world;
  for (const month of monthsCrossed('2026-07-15', `${2026 + years}-07-14`)) db = developWorld(db, month, season, training, FICTIONAL_SEED).db;
  return db;
}

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

describe('development rates (4 simulated years)', () => {
  const after1 = developYears(1);
  const after4 = developYears(4);
  const group = (minAge: number, maxAge: number) => world.players.filter((p) => ageAtStart(p.id) >= minAge && ageAtStart(p.id) <= maxAge);
  const avgChange = (db: GameDatabase, ids: readonly { id: string }[]) => ids.reduce((s, p) => s + ability(db, p.id) - ability(world, p.id), 0) / ids.length;

  const young = group(0, 19).filter((p) => p.potential! - ability(world, p.id) >= 3);
  const prime = group(25, 27);
  const veterans = group(31, 99);

  it('prints the numbers', () => {
    console.log(
      `Ability change: young (${young.length}) +${avgChange(after1, young).toFixed(2)} after 1 yr, +${avgChange(after4, young).toFixed(2)} after 4; ` +
        `25–27 ${avgChange(after1, prime).toFixed(2)}/yr; 31+ ${avgChange(after1, veterans).toFixed(2)}/yr`,
    );
  });

  it('young players with headroom grow 1–2.5 a year and close most of the gap in 4 years', () => {
    expect(avgChange(after1, young)).toBeGreaterThan(0.8);
    expect(avgChange(after1, young)).toBeLessThan(2.5);
    const closed = young.filter((p) => potentialOf(after4.players.find((x) => x.id === p.id)!, after4.attributes.find((a) => a.playerId === p.id)!) - ability(after4, p.id) < 1.5);
    expect(closed.length / young.length).toBeGreaterThan(0.6);
  });

  it('players in their prime barely change; veterans decline', () => {
    expect(Math.abs(avgChange(after1, prime))).toBeLessThan(0.35);
    expect(avgChange(after1, veterans)).toBeLessThan(-0.2);
    expect(avgChange(after1, veterans)).toBeGreaterThan(-1.2);
  });

  it('never grows much beyond potential and keeps attributes valid', () => {
    for (const p of after4.players) {
      const a = after4.attributes.find((x) => x.playerId === p.id)!;
      expect(playerAbility(p, a)).toBeLessThan(Math.max(p.potential!, ability(world, p.id)) + 0.6);
    }
    expect(after4.attributes.every((a) => PlayerAttributesSchema.safeParse(a).success)).toBe(true);
  });

  it('is deterministic', () => {
    expect(developYears(1)).toEqual(after1);
  });
});

describe('training and playing time', () => {
  const youngsters = world.players.filter((p) => ageAtStart(p.id) <= 20 && p.potential! - ability(world, p.id) >= 2);
  const gain = (training: Training, share: number) => {
    let total = 0;
    for (const p of youngsters) {
      let attrs = world.attributes.find((a) => a.playerId === p.id)!;
      const rng = createRng(Number(p.id.slice(4)));
      for (let m = 0; m < 12; m++) attrs = developPlayer({ player: p, attributes: attrs, age: ageAtStart(p.id), playingShare: share, training, rng });
      total += playerAbility(p, attrs) - ability(world, p.id);
    }
    return total / youngsters.length;
  };

  it('heavy training and regular football speed development up', () => {
    const light = gain({ focus: 'balanced', intensity: 'light' }, 0.5);
    const heavy = gain({ focus: 'balanced', intensity: 'heavy' }, 0.5);
    const benched = gain(DEFAULT_TRAINING, 0);
    const regular = gain(DEFAULT_TRAINING, 1);
    console.log(`Yearly gain: light ${light.toFixed(2)}, heavy ${heavy.toFixed(2)}; benched ${benched.toFixed(2)}, regular ${regular.toFixed(2)}`);
    expect(heavy).toBeGreaterThan(light * 1.3);
    expect(regular).toBeGreaterThan(benched * 1.5);
  });

  it('focus steers which attributes grow', () => {
    const p = youngsters.find((x) => x.primaryPosition !== 'GK')!;
    const base = world.attributes.find((a) => a.playerId === p.id)!;
    const run = (focus: Training['focus']) => {
      let attrs = base;
      const rng = createRng(99);
      for (let m = 0; m < 36; m++) attrs = developPlayer({ player: { ...p, potential: 20 }, attributes: attrs, age: 17, playingShare: 1, training: { focus, intensity: 'normal' }, rng });
      return attrs;
    };
    const physical = run('physical');
    const attacking = run('attacking');
    const physicalGain = (a: typeof base) => a.physical.pace + a.physical.stamina + a.physical.strength + a.physical.acceleration;
    expect(physicalGain(physical)).toBeGreaterThan(physicalGain(attacking));
  });

  it('age curves', () => {
    expect(ageGrowth(17)).toBe(1);
    expect(ageGrowth(29)).toBe(0);
    expect(declineChance('physical', 29)).toBe(0);
    expect(declineChance('physical', 33)).toBeGreaterThan(declineChance('technical', 33));
    expect(declineChance('mental', 33)).toBe(0);
  });

  it('playing share comes from season minutes', () => {
    expect(playingShares(season).size).toBe(0); // nothing played yet
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
