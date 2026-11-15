import type { Club, Cup, League } from '../schemas';

/**
 * The fictional world: one country, two 20-club divisions and a cup.
 * Every name, town and stadium is invented; resemblance to real clubs is
 * unintentional.
 *
 * The original 8 clubs are hand-written below (the first division's core).
 *
 * `reputation` (1–20) controls how strong the generated squad is, so the
 * league has a clear spread from title contenders to strugglers.
 */
export const FICTIONAL_CLUBS: readonly Club[] = [
  {
    id: 'club_kestrel_bay',
    name: 'Kestrel Bay',
    shortName: 'KBY',
    city: 'Kestrel Bay',
    country: 'ENG',
    founded: 1889,
    reputation: 16,
    stadium: { name: 'The Lighthouse Ground', capacity: 41200 },
    colours: { primary: '#1E4FA3', secondary: '#FFFFFF' },
    finances: { balance: 48_000_000, transferBudget: 22_000_000, weeklyWageBudget: 320_000 },
  },
  {
    id: 'club_northmere_rovers',
    name: 'Northmere Rovers',
    shortName: 'NMR',
    city: 'Northmere',
    country: 'ENG',
    founded: 1878,
    reputation: 15,
    stadium: { name: 'Fellside Park', capacity: 36800 },
    colours: { primary: '#C8102E', secondary: '#111111' },
    finances: { balance: 31_500_000, transferBudget: 15_000_000, weeklyWageBudget: 290_000 },
  },
  {
    id: 'club_saltmarsh_athletic',
    name: 'Saltmarsh Athletic',
    shortName: 'SAL',
    city: 'Saltmarsh',
    country: 'ENG',
    founded: 1902,
    reputation: 14,
    stadium: { name: 'Tideway Stadium', capacity: 29500 },
    colours: { primary: '#0B7A5C', secondary: '#F2C94C' },
    finances: { balance: 18_200_000, transferBudget: 9_000_000, weeklyWageBudget: 250_000 },
  },
  {
    id: 'club_greywater_town',
    name: 'Greywater Town',
    shortName: 'GRW',
    city: 'Greywater',
    country: 'ENG',
    founded: 1884,
    reputation: 13,
    stadium: { name: 'Millrace Road', capacity: 24100 },
    colours: { primary: '#6B7C8F', secondary: '#FFFFFF' },
    finances: { balance: 9_800_000, transferBudget: 5_500_000, weeklyWageBudget: 220_000 },
  },
  {
    id: 'club_hollin_park',
    name: 'Hollin Park',
    shortName: 'HOP',
    city: 'Hollinford',
    country: 'ENG',
    founded: 1910,
    reputation: 12,
    stadium: { name: 'The Hollin', capacity: 21700 },
    colours: { primary: '#5B2A86', secondary: '#E8E8E8' },
    finances: { balance: 6_400_000, transferBudget: 4_000_000, weeklyWageBudget: 200_000 },
  },
  {
    id: 'club_redcliff_united',
    name: 'Redcliff United',
    shortName: 'RCU',
    city: 'Redcliff',
    country: 'ENG',
    founded: 1895,
    reputation: 11,
    stadium: { name: 'Quarry Lane', capacity: 18300 },
    colours: { primary: '#B5462F', secondary: '#1B1B1B' },
    finances: { balance: 3_100_000, transferBudget: 2_500_000, weeklyWageBudget: 180_000 },
  },
  {
    id: 'club_larkspur_city',
    name: 'Larkspur City',
    shortName: 'LKC',
    city: 'Larkspur',
    country: 'ENG',
    founded: 1921,
    reputation: 10,
    stadium: { name: 'Meadowgate', capacity: 15600 },
    colours: { primary: '#4A90D9', secondary: '#0D2340' },
    finances: { balance: 1_200_000, transferBudget: 1_500_000, weeklyWageBudget: 160_000 },
  },
  {
    id: 'club_westhaven_albion',
    name: 'Westhaven Albion',
    shortName: 'WHA',
    city: 'Westhaven',
    country: 'ENG',
    founded: 1899,
    reputation: 9,
    stadium: { name: 'Harbour Street', capacity: 12900 },
    colours: { primary: '#F28C28', secondary: '#1D2A35' },
    finances: { balance: -750_000, transferBudget: 800_000, weeklyWageBudget: 140_000 },
  },
];

// ---------------------------------------------------------------------------
// Generated clubs: a short spec each; the rest is derived deterministically.
// ---------------------------------------------------------------------------

/** [display name, 3-letter short name, reputation]. Towns are invented. */
type ClubSpec = readonly [name: string, shortName: string, reputation: number];

const FIRST_DIVISION_EXTRA: readonly ClubSpec[] = [
  ['Ravensmoor United', 'RVM', 17],
  ['Calderbrook City', 'CBC', 15],
  ['Thornwick Athletic', 'THW', 14],
  ['Fernleigh Rovers', 'FER', 13],
  ['Maplestead Town', 'MAP', 12],
  ['Brackenford United', 'BRF', 12],
  ['Oakhollow FC', 'OAK', 11],
  ['Stonemarsh Albion', 'STM', 11],
  ['Ellerton Wanderers', 'ELL', 10],
  ['Highcombe City', 'HIC', 10],
  ['Dunmere Athletic', 'DUN', 9],
  ['Coldbrook Town', 'CBT', 9],
];

const SECOND_DIVISION: readonly ClubSpec[] = [
  ['Wrenfield United', 'WRF', 10],
  ['Blackwater Vale', 'BWV', 9],
  ['Ashcombe Town', 'ASH', 9],
  ['Pellingford City', 'PEL', 8],
  ['Silverbrook Rovers', 'SIL', 8],
  ['Hollowmere Athletic', 'HOL', 8],
  ['Northcliff Town', 'NCL', 7],
  ['Brindlewood FC', 'BRW', 7],
  ['Grimsdale United', 'GRD', 7],
  ['Tidewell Albion', 'TDW', 7],
  ['Lowfield Rangers', 'LOW', 6],
  ['Eastmarsh Town', 'EAM', 6],
  ['Copperfield City', 'CPF', 6],
  ['Wolverdale Rovers', 'WVD', 6],
  ['Larchmont Athletic', 'LAR', 5],
  ['Brightwater Town', 'BWT', 5],
  ['Rookhaven FC', 'RKH', 5],
  ['Penhallow City', 'PNH', 5],
  ['Underbrook Wanderers', 'UND', 4],
  ['Glenvale Athletic', 'GLV', 4],
];

const STADIUM_SUFFIXES = ['Park', 'Road', 'Lane', 'Ground', 'Stadium', 'Meadow'] as const;
const KITS: readonly (readonly [string, string])[] = [
  ['#8E1B1B', '#F2F2F2'], ['#1B4D8E', '#F2C94C'], ['#2E7D32', '#FFFFFF'], ['#4A148C', '#E0E0E0'],
  ['#E65100', '#212121'], ['#00695C', '#FFFFFF'], ['#37474F', '#FFC107'], ['#AD1457', '#FFFFFF'],
  ['#0D47A1', '#FFFFFF'], ['#5D4037', '#FFE0B2'], ['#C62828', '#1565C0'], ['#263238', '#80CBC4'],
];

/** "Ravensmoor United" → "club_ravensmoor_united" */
export function clubIdFromName(name: string): string {
  return `club_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
}

/**
 * Builds a full Club from a spec. Capacity and money scale with reputation
 * squared (big clubs are *much* bigger); the wage budget is set comfortably
 * above what the squad generator pays (tested in fictional.test.ts).
 */
function makeClub([name, shortName, reputation]: ClubSpec, index: number): Club {
  const words = name.split(' ');
  const city = words.length > 1 ? words.slice(0, -1).join(' ') : name;
  const [primary, secondary] = KITS[index % KITS.length];
  return {
    id: clubIdFromName(name),
    name,
    shortName,
    city,
    country: 'ENG',
    founded: 1870 + ((index * 7) % 60),
    reputation,
    stadium: {
      name: `${city} ${STADIUM_SUFFIXES[index % STADIUM_SUFFIXES.length]}`,
      capacity: Math.round((3000 + reputation * reputation * 150) / 100) * 100,
    },
    colours: { primary, secondary },
    finances: {
      balance: reputation * reputation * 110_000 - 1_500_000,
      transferBudget: reputation * reputation * 55_000,
      weeklyWageBudget: Math.round((reputation * reputation * 1300 + 60_000) / 1000) * 1000,
    },
  };
}

const FIRST_DIVISION_CLUBS: readonly Club[] = [
  ...FICTIONAL_CLUBS,
  ...FIRST_DIVISION_EXTRA.map((spec, i) => makeClub(spec, i)),
];
const SECOND_DIVISION_CLUBS: readonly Club[] = SECOND_DIVISION.map((spec, i) => makeClub(spec, i + FIRST_DIVISION_EXTRA.length));

/** Every club in the fictional world, top flight first. */
export const ALL_FICTIONAL_CLUBS: readonly Club[] = [...FIRST_DIVISION_CLUBS, ...SECOND_DIVISION_CLUBS];

const LEAGUE_POINTS = { win: 3, draw: 1, loss: 0 };

export const FIRST_DIVISION: League = {
  id: 'comp_first_division',
  type: 'league',
  name: 'First Division',
  shortName: 'First Div',
  country: 'ENG',
  tier: 1,
  clubIds: FIRST_DIVISION_CLUBS.map((club) => club.id),
  rules: { roundsPerOpponent: 2, points: LEAGUE_POINTS, promotionPlaces: 0, relegationPlaces: 3 },
};

export const SECOND_DIVISION_LEAGUE: League = {
  id: 'comp_second_division',
  type: 'league',
  name: 'Second Division',
  shortName: 'Second Div',
  country: 'ENG',
  tier: 2,
  clubIds: SECOND_DIVISION_CLUBS.map((club) => club.id),
  rules: { roundsPerOpponent: 2, points: LEAGUE_POINTS, promotionPlaces: 3, relegationPlaces: 0 },
};

export const NATIONAL_CUP: Cup = {
  id: 'comp_national_cup',
  type: 'cup',
  name: 'National Cup',
  shortName: 'Cup',
  country: 'ENG',
};
