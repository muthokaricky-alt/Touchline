import { z } from 'zod';

import type { Position } from '@/data/schemas';

/**
 * Formations are static game content: a list of 11 slots. Each slot has an
 * id (unique within the formation), the position it asks for, and pitch
 * coordinates for drawing it.
 *
 * Coordinates: x 0 = left touchline → 1 = right; y 0 = own goal → 1 = opponent's goal.
 * Milestone 4 builds tactics on top of these.
 */
export type FormationSlot = {
  id: string;
  position: Position;
  x: number;
  y: number;
};

export const FORMATION_IDS = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '5-3-2'] as const;
export const FormationIdSchema = z.enum(FORMATION_IDS);
export type FormationId = z.infer<typeof FormationIdSchema>;

export type Formation = { id: FormationId; slots: readonly FormationSlot[] };

export const DEFAULT_FORMATION_ID: FormationId = '4-4-2';

const slot = (id: string, position: Position, x: number, y: number): FormationSlot => ({ id, position, x, y });

const GOALKEEPER = slot('GK', 'GK', 0.5, 0.08);
const BACK_FOUR = [
  slot('LB', 'LB', 0.12, 0.28),
  slot('LCB', 'CB', 0.37, 0.24),
  slot('RCB', 'CB', 0.63, 0.24),
  slot('RB', 'RB', 0.88, 0.28),
];
const BACK_THREE = [
  slot('LCB', 'CB', 0.25, 0.25),
  slot('CB', 'CB', 0.5, 0.22),
  slot('RCB', 'CB', 0.75, 0.25),
];
const STRIKE_PAIR = [slot('LST', 'ST', 0.37, 0.84), slot('RST', 'ST', 0.63, 0.84)];

export const FORMATIONS: Record<FormationId, Formation> = {
  '4-4-2': {
    id: '4-4-2',
    slots: [
      GOALKEEPER,
      ...BACK_FOUR,
      slot('LM', 'LM', 0.12, 0.55),
      slot('LCM', 'CM', 0.37, 0.52),
      slot('RCM', 'CM', 0.63, 0.52),
      slot('RM', 'RM', 0.88, 0.55),
      ...STRIKE_PAIR,
    ],
  },
  '4-3-3': {
    id: '4-3-3',
    slots: [
      GOALKEEPER,
      ...BACK_FOUR,
      slot('DM', 'DM', 0.5, 0.42),
      slot('LCM', 'CM', 0.3, 0.56),
      slot('RCM', 'CM', 0.7, 0.56),
      slot('LW', 'LW', 0.15, 0.78),
      slot('ST', 'ST', 0.5, 0.86),
      slot('RW', 'RW', 0.85, 0.78),
    ],
  },
  '4-2-3-1': {
    id: '4-2-3-1',
    slots: [
      GOALKEEPER,
      ...BACK_FOUR,
      slot('LDM', 'DM', 0.37, 0.42),
      slot('RDM', 'DM', 0.63, 0.42),
      slot('LW', 'LW', 0.15, 0.66),
      slot('AM', 'AM', 0.5, 0.64),
      slot('RW', 'RW', 0.85, 0.66),
      slot('ST', 'ST', 0.5, 0.86),
    ],
  },
  '3-5-2': {
    id: '3-5-2',
    slots: [
      GOALKEEPER,
      ...BACK_THREE,
      slot('LWB', 'LWB', 0.1, 0.5),
      slot('DM', 'DM', 0.5, 0.42),
      slot('LCM', 'CM', 0.32, 0.58),
      slot('RCM', 'CM', 0.68, 0.58),
      slot('RWB', 'RWB', 0.9, 0.5),
      ...STRIKE_PAIR,
    ],
  },
  '5-3-2': {
    id: '5-3-2',
    slots: [
      GOALKEEPER,
      slot('LWB', 'LWB', 0.1, 0.34),
      ...BACK_THREE,
      slot('RWB', 'RWB', 0.9, 0.34),
      slot('LCM', 'CM', 0.3, 0.55),
      slot('CM', 'CM', 0.5, 0.52),
      slot('RCM', 'CM', 0.7, 0.55),
      ...STRIKE_PAIR,
    ],
  },
};

export const FORMATION_LIST: readonly Formation[] = FORMATION_IDS.map((id) => FORMATIONS[id]);

export function getFormation(id: FormationId): Formation {
  return FORMATIONS[id];
}

export function findSlot(formation: Formation, slotId: string): FormationSlot | undefined {
  return formation.slots.find((s) => s.id === slotId);
}
