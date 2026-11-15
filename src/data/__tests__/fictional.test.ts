import { ageOn } from '@/utils/date';

import { buildFictionalDatabase, FICTIONAL_CLUBS, FICTIONAL_REFERENCE_DATE } from '../fictional';
import { SQUAD_TEMPLATE } from '../fictional/generate-squads';
import { checkIntegrity } from '../integrity';
import { GameDatabaseSchema, type GameDatabase, type PlayerAttributes } from '../schemas';

const db = buildFictionalDatabase();

function squadOf(database: GameDatabase, clubId: string) {
  const playerIds = new Set(database.contracts.filter((c) => c.clubId === clubId).map((c) => c.playerId));
  return {
    players: database.players.filter((p) => playerIds.has(p.id)),
    attributes: database.attributes.filter((a) => playerIds.has(a.playerId)),
  };
}

/** Average of every outfield-relevant attribute (excludes goalkeeping). */
function outfieldAverage(attrs: PlayerAttributes): number {
  const values = [
    ...Object.values(attrs.technical),
    ...Object.values(attrs.mental),
    ...Object.values(attrs.physical),
  ];
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

describe('fictional database', () => {
  it('passes schema validation', () => {
    const result = GameDatabaseSchema.safeParse(db);
    if (!result.success) throw new Error(result.error.message); // shows the problems if it ever fails
    expect(result.success).toBe(true);
  });

  it('passes the integrity check', () => {
    expect(checkIntegrity(db)).toEqual([]);
  });

  it('has 8 clubs of 22 players in one league', () => {
    expect(db.clubs).toHaveLength(8);
    expect(db.players).toHaveLength(8 * 22);
    expect(db.attributes).toHaveLength(db.players.length);
    expect(db.contracts).toHaveLength(db.players.length);
    expect(db.competitions).toHaveLength(1);
    expect(db.competitions[0].clubIds).toEqual(FICTIONAL_CLUBS.map((c) => c.id));
  });

  it('is deterministic: same seed, same database', () => {
    expect(buildFictionalDatabase()).toEqual(db);
  });

  it('changes when the seed changes', () => {
    expect(buildFictionalDatabase(12345).players).not.toEqual(db.players);
  });

  it('gives every club 3 goalkeepers and the template positions', () => {
    const templatePositions = SQUAD_TEMPLATE.map((s) => s.position).sort();
    for (const club of db.clubs) {
      const { players } = squadOf(db, club.id);
      expect(players.map((p) => p.primaryPosition).sort()).toEqual(templatePositions);
    }
  });

  it('never repeats a surname within a club', () => {
    for (const club of db.clubs) {
      const surnames = squadOf(db, club.id).players.map((p) => p.lastName);
      expect(new Set(surnames).size).toBe(surnames.length);
    }
  });

  it('generates realistic ages (17–36) relative to the reference date', () => {
    for (const player of db.players) {
      const age = ageOn(player.dateOfBirth, FICTIONAL_REFERENCE_DATE);
      expect(age).toBeGreaterThanOrEqual(17);
      expect(age).toBeLessThanOrEqual(36);
    }
  });

  it('gives contracts that are active on the reference date', () => {
    for (const contract of db.contracts) {
      expect(contract.startDate <= FICTIONAL_REFERENCE_DATE).toBe(true);
      expect(contract.endDate > FICTIONAL_REFERENCE_DATE).toBe(true);
    }
  });

  it('makes goalkeepers better at goalkeeping than outfield players', () => {
    const gkIds = new Set(db.players.filter((p) => p.primaryPosition === 'GK').map((p) => p.id));
    const reflexes = (isGk: boolean) => {
      const values = db.attributes.filter((a) => gkIds.has(a.playerId) === isGk).map((a) => a.goalkeeping.reflexes);
      return values.reduce((s, v) => s + v, 0) / values.length;
    };
    expect(reflexes(true)).toBeGreaterThan(reflexes(false) + 8);
  });

  it('makes strikers better finishers than centre backs', () => {
    const avgFinishing = (position: string) => {
      const ids = new Set(db.players.filter((p) => p.primaryPosition === position).map((p) => p.id));
      const values = db.attributes.filter((a) => ids.has(a.playerId)).map((a) => a.technical.finishing);
      return values.reduce((s, v) => s + v, 0) / values.length;
    };
    expect(avgFinishing('ST')).toBeGreaterThan(avgFinishing('CB') + 5);
  });

  it('gives higher-reputation clubs stronger squads', () => {
    const strongest = FICTIONAL_CLUBS[0]; // reputation 16
    const weakest = FICTIONAL_CLUBS[FICTIONAL_CLUBS.length - 1]; // reputation 9
    const squadAverage = (clubId: string) => {
      const { attributes } = squadOf(db, clubId);
      return attributes.reduce((s, a) => s + outfieldAverage(a), 0) / attributes.length;
    };
    expect(squadAverage(strongest.id)).toBeGreaterThan(squadAverage(weakest.id) + 2);
  });

  it("keeps each club's wage bill within its wage budget", () => {
    for (const club of db.clubs) {
      const wageBill = db.contracts
        .filter((c) => c.clubId === club.id)
        .reduce((sum, c) => sum + c.weeklyWage, 0);
      expect(wageBill).toBeLessThanOrEqual(club.finances.weeklyWageBudget);
    }
  });
});
