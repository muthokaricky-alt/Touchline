import type { GameDatabase } from './schemas';

/**
 * Cross-record rules. Zod validates each record in isolation ("is this a valid
 * contract?"); these rules check how records relate ("does the contract's
 * player actually exist?").
 */
export type IntegrityRule =
  | 'duplicate-id'
  | 'unknown-player'
  | 'unknown-club'
  | 'missing-attributes'
  | 'duplicate-attributes'
  | 'multiple-contracts'
  | 'duplicate-squad-number'
  | 'club-in-multiple-leagues';

export type IntegrityIssue = { rule: IntegrityRule; message: string };

/** Returns every problem found; an empty array means the database is consistent. */
export function checkIntegrity(db: GameDatabase): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const report = (rule: IntegrityRule, message: string) => issues.push({ rule, message });

  // Unique IDs within each collection.
  const collections = {
    player: db.players.map((p) => p.id),
    club: db.clubs.map((c) => c.id),
    competition: db.competitions.map((c) => c.id),
    contract: db.contracts.map((c) => c.id),
  };
  for (const [kind, ids] of Object.entries(collections)) {
    for (const id of findDuplicates(ids)) report('duplicate-id', `Duplicate ${kind} id "${id}"`);
  }

  const playerIds = new Set(collections.player);
  const clubIds = new Set(collections.club);

  // Exactly one attributes record per player.
  const attributedPlayers = db.attributes.map((a) => a.playerId);
  for (const playerId of attributedPlayers) {
    if (!playerIds.has(playerId)) {
      report('unknown-player', `Attributes reference unknown player "${playerId}"`);
    }
  }
  for (const playerId of findDuplicates(attributedPlayers)) {
    report('duplicate-attributes', `Player "${playerId}" has more than one attributes record`);
  }
  const attributed = new Set(attributedPlayers);
  for (const playerId of playerIds) {
    if (!attributed.has(playerId)) {
      report('missing-attributes', `Player "${playerId}" has no attributes record`);
    }
  }

  // Contracts: valid references, at most one per player, unique squad numbers per club.
  for (const contract of db.contracts) {
    if (!playerIds.has(contract.playerId)) {
      report('unknown-player', `Contract "${contract.id}" references unknown player "${contract.playerId}"`);
    }
    if (!clubIds.has(contract.clubId)) {
      report('unknown-club', `Contract "${contract.id}" references unknown club "${contract.clubId}"`);
    }
  }
  for (const playerId of findDuplicates(db.contracts.map((c) => c.playerId))) {
    report('multiple-contracts', `Player "${playerId}" has more than one contract`);
  }
  const squadNumberKeys = db.contracts.map((c) => `${c.clubId} #${c.squadNumber}`);
  for (const key of findDuplicates(squadNumberKeys)) {
    report('duplicate-squad-number', `Squad number used twice: ${key}`);
  }

  // Leagues: clubs exist, and no club plays in two leagues.
  for (const competition of db.competitions) {
    for (const clubId of competition.clubIds) {
      if (!clubIds.has(clubId)) {
        report('unknown-club', `Competition "${competition.id}" references unknown club "${clubId}"`);
      }
    }
  }
  const leagueMemberships = db.competitions
    .filter((c) => c.type === 'league')
    .flatMap((c) => c.clubIds);
  for (const clubId of findDuplicates(leagueMemberships)) {
    report('club-in-multiple-leagues', `Club "${clubId}" is in more than one league`);
  }

  return issues;
}

/** Values that appear more than once (each reported once). */
function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}
