import type { Instruction, Tactics } from '@/game/tactics/tactics';

/**
 * Display text for every instruction and option. The mapped type makes
 * TypeScript check that each instruction lists exactly its own options:
 * add an option to tactics.ts and this file won't compile until it has a label.
 */
type InstructionLabels = {
  [K in Instruction]: {
    title: string;
    options: Record<Tactics[K], { label: string; hint: string }>;
  };
};

export const INSTRUCTION_LABELS: InstructionLabels = {
  mentality: {
    title: 'Mentality',
    options: {
      'very-defensive': { label: 'Very defensive', hint: 'Men behind the ball. Hard to break down, rarely threatening.' },
      defensive: { label: 'Defensive', hint: 'Safety first. Attacks with fewer players.' },
      balanced: { label: 'Balanced', hint: 'Equal weight on attack and defence.' },
      attacking: { label: 'Attacking', hint: 'More players forward and more risk on the ball.' },
      'very-attacking': { label: 'Very attacking', hint: 'All-out attack. Exposed on the counter.' },
    },
  },
  passing: {
    title: 'Passing',
    options: {
      short: { label: 'Short', hint: 'Keep the ball with safe, short passes.' },
      mixed: { label: 'Mixed', hint: 'Short or long depending on the situation.' },
      direct: { label: 'Direct', hint: 'Long, forward balls to get up the pitch quickly.' },
    },
  },
  tempo: {
    title: 'Tempo',
    options: {
      slow: { label: 'Slow', hint: 'Patient build-up; wait for the right opening.' },
      normal: { label: 'Normal', hint: 'A natural pace of play.' },
      fast: { label: 'Fast', hint: 'Move the ball quickly before the opponent sets. Tiring.' },
    },
  },
  width: {
    title: 'Width',
    options: {
      narrow: { label: 'Narrow', hint: 'Crowd the middle; fewer chances out wide.' },
      normal: { label: 'Normal', hint: 'Use the whole pitch when it makes sense.' },
      wide: { label: 'Wide', hint: 'Stretch the opponent and attack down the flanks.' },
    },
  },
  defensiveLine: {
    title: 'Defensive line',
    options: {
      deep: { label: 'Deep', hint: 'Defend close to goal. Little space behind, more pressure to absorb.' },
      standard: { label: 'Standard', hint: 'A middle-of-the-road line.' },
      high: { label: 'High', hint: 'Squeeze the space, but balls in behind become dangerous.' },
    },
  },
  pressing: {
    title: 'Pressing',
    options: {
      low: { label: 'Low', hint: 'Hold shape and let them have the ball.' },
      medium: { label: 'Medium', hint: 'Press when the moment is right.' },
      high: { label: 'High', hint: 'Hunt the ball everywhere. Costs a lot of stamina.' },
    },
  },
};
