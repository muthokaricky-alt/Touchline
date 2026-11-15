import {
  ClubSchema,
  ContractSchema,
  LeagueSchema,
  PlayerAttributesSchema,
  PlayerSchema,
  type Club,
  type Contract,
  type League,
  type Player,
  type PlayerAttributes,
} from '../schemas';

// Valid fixtures; each test breaks exactly one thing.
const validPlayer: Player = {
  id: 'plr_0001',
  firstName: 'Tom',
  lastName: 'Hartley',
  dateOfBirth: '2000-04-12',
  nationality: 'ENG',
  heightCm: 182,
  preferredFoot: 'right',
  primaryPosition: 'CM',
  secondaryPositions: ['DM'],
};

const validAttributes: PlayerAttributes = {
  playerId: 'plr_0001',
  technical: { finishing: 8, passing: 15, crossing: 10, dribbling: 11, firstTouch: 13, tackling: 12, marking: 10, heading: 9 },
  mental: { vision: 14, positioning: 12, decisions: 13, workRate: 15, composure: 12, anticipation: 13 },
  physical: { pace: 11, acceleration: 12, stamina: 16, strength: 11 },
  goalkeeping: { handling: 2, reflexes: 3, aerialReach: 2, oneOnOnes: 1, kicking: 5 },
};

const validContract: Contract = {
  id: 'con_0001',
  playerId: 'plr_0001',
  clubId: 'club_kestrel_bay',
  squadNumber: 8,
  weeklyWage: 12_500,
  startDate: '2024-07-01',
  endDate: '2028-06-30',
};

const validClub: Club = {
  id: 'club_kestrel_bay',
  name: 'Kestrel Bay',
  shortName: 'KBY',
  city: 'Kestrel Bay',
  country: 'ENG',
  founded: 1889,
  reputation: 16,
  stadium: { name: 'The Lighthouse Ground', capacity: 41200 },
  colours: { primary: '#1E4FA3', secondary: '#FFFFFF' },
  finances: { balance: -100_000, transferBudget: 0, weeklyWageBudget: 300_000 },
};

const validLeague: League = {
  id: 'comp_test_league',
  type: 'league',
  name: 'Test League',
  shortName: 'Test',
  country: 'ENG',
  tier: 1,
  clubIds: ['club_a', 'club_b', 'club_c', 'club_d'],
  rules: { roundsPerOpponent: 2, points: { win: 3, draw: 1, loss: 0 }, promotionPlaces: 1, relegationPlaces: 1 },
};

describe('PlayerSchema', () => {
  it('accepts a valid player', () => {
    expect(PlayerSchema.safeParse(validPlayer).success).toBe(true);
  });

  it.each([
    ['id without the plr_ prefix', { id: 'club_0001' }],
    ['empty first name', { firstName: '' }],
    ['impossible date of birth', { dateOfBirth: '2000-02-30' }],
    ['non-ISO date of birth', { dateOfBirth: '12/04/2000' }],
    ['lowercase nation code', { nationality: 'eng' }],
    ['non-integer height', { heightCm: 182.5 }],
    ['unknown position', { primaryPosition: 'SW' }],
    ['unknown preferred foot', { preferredFoot: 'neither' }],
    ['secondary repeating primary', { secondaryPositions: ['CM'] }],
    ['duplicate secondary positions', { secondaryPositions: ['DM', 'DM'] }],
    ['unknown extra key (typo)', { heigthCm: 182 }],
  ])('rejects %s', (_label, change) => {
    expect(PlayerSchema.safeParse({ ...validPlayer, ...change }).success).toBe(false);
  });

  it('rejects a missing field', () => {
    const { lastName: _omitted, ...withoutLastName } = validPlayer;
    expect(PlayerSchema.safeParse(withoutLastName).success).toBe(false);
  });
});

describe('PlayerAttributesSchema', () => {
  it('accepts valid attributes', () => {
    expect(PlayerAttributesSchema.safeParse(validAttributes).success).toBe(true);
  });

  it.each([
    ['0 (below scale)', 0],
    ['21 (above scale)', 21],
    ['a fraction', 12.5],
  ])('rejects an attribute of %s', (_label, value) => {
    const broken = { ...validAttributes, technical: { ...validAttributes.technical, finishing: value } };
    expect(PlayerAttributesSchema.safeParse(broken).success).toBe(false);
  });

  it('accepts the scale boundaries 1 and 20', () => {
    const edges = { ...validAttributes, physical: { pace: 1, acceleration: 20, stamina: 1, strength: 20 } };
    expect(PlayerAttributesSchema.safeParse(edges).success).toBe(true);
  });

  it('rejects a missing attribute', () => {
    const { pace: _omitted, ...physical } = validAttributes.physical;
    expect(PlayerAttributesSchema.safeParse({ ...validAttributes, physical }).success).toBe(false);
  });
});

describe('ContractSchema', () => {
  it('accepts a valid contract', () => {
    expect(ContractSchema.safeParse(validContract).success).toBe(true);
  });

  it.each([
    ['end date before start date', { endDate: '2023-06-30' }],
    ['end date equal to start date', { endDate: '2024-07-01' }],
    ['negative wage', { weeklyWage: -1 }],
    ['squad number 0', { squadNumber: 0 }],
    ['squad number 100', { squadNumber: 100 }],
  ])('rejects %s', (_label, change) => {
    expect(ContractSchema.safeParse({ ...validContract, ...change }).success).toBe(false);
  });
});

describe('ClubSchema', () => {
  it('accepts a valid club (negative balance allowed)', () => {
    expect(ClubSchema.safeParse(validClub).success).toBe(true);
  });

  it.each([
    ['a 4-letter short name', { shortName: 'KBAY' }],
    ['an invalid colour', { colours: { primary: 'blue', secondary: '#FFFFFF' } }],
    ['a negative transfer budget', { finances: { ...validClub.finances, transferBudget: -1 } }],
    ['reputation above 20', { reputation: 21 }],
  ])('rejects %s', (_label, change) => {
    expect(ClubSchema.safeParse({ ...validClub, ...change }).success).toBe(false);
  });
});

describe('LeagueSchema', () => {
  it('accepts a valid league', () => {
    expect(LeagueSchema.safeParse(validLeague).success).toBe(true);
  });

  it('rejects duplicate clubs', () => {
    const broken = { ...validLeague, clubIds: ['club_a', 'club_a', 'club_b'] };
    expect(LeagueSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects promotion + relegation places covering every club', () => {
    const broken = { ...validLeague, rules: { ...validLeague.rules, promotionPlaces: 2, relegationPlaces: 2 } };
    expect(LeagueSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a league with one club', () => {
    expect(LeagueSchema.safeParse({ ...validLeague, clubIds: ['club_a'] }).success).toBe(false);
  });
});
