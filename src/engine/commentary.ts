import type { PlayerId } from '@/data/schemas';

import type { MatchClock, MatchEvent, Side } from './types';

/**
 * Turns engine events into commentary lines. Separate from the simulation:
 * the engine produces data, this produces words. Wording varies, but
 * deterministically (a hash of the event picks the variant), so the same
 * match always reads the same.
 *
 * Templates avoid gendered pronouns.
 */

export type CommentaryContext = {
  playerName: (id: PlayerId) => string;
  teamName: (side: Side) => string;
};

/** { minute: 45, addedTime: 2 } → "45+2'" */
export function formatClock({ minute, addedTime }: MatchClock): string {
  return addedTime ? `${minute}+${addedTime}'` : `${minute}'`;
}

export function describeEvent(event: MatchEvent, ctx: CommentaryContext): string {
  const name = ctx.playerName;
  const pick = (options: readonly string[]) => options[hash(event) % options.length];

  switch (event.type) {
    case 'kick-off':
      return `${ctx.teamName('home')} and ${ctx.teamName('away')} get us under way.`;
    case 'half-time':
      return `Half-time: ${ctx.teamName('home')} ${event.score.home}–${event.score.away} ${ctx.teamName('away')}.`;
    case 'full-time':
      return `Full-time: ${ctx.teamName('home')} ${event.score.home}–${event.score.away} ${ctx.teamName('away')}.`;
    case 'goal': {
      const scorer = name(event.scorerId);
      const assist = event.assistId ? name(event.assistId) : null;
      const team = ctx.teamName(event.side);
      const line = assist
        ? pick(GOAL_ASSISTED[event.chance]).replace('{scorer}', scorer).replace('{assist}', assist)
        : pick(GOAL_SOLO[event.chance]).replace('{scorer}', scorer);
      return `GOAL for ${team}! ${line}`;
    }
    case 'shot': {
      const shooter = name(event.shooterId);
      const defender = event.defenderId ? name(event.defenderId) : 'a defender';
      const templates =
        event.outcome === 'saved' ? SHOT_SAVED : event.outcome === 'blocked' ? SHOT_BLOCKED : SHOT_OFF_TARGET;
      const line = pick(templates).replace('{shooter}', shooter).replace('{defender}', defender);
      return event.corner ? `${line} Corner.` : line;
    }
    case 'tackle':
      return pick(['{player} wins the ball back with a well-timed tackle.', '{player} reads it and steps in to intercept.']).replace(
        '{player}',
        name(event.playerId),
      );
    case 'foul':
      return pick(['{player} brings down {victim}. Free kick.', 'Foul by {player} on {victim}.'])
        .replace('{player}', name(event.playerId))
        .replace('{victim}', name(event.victimId));
    case 'card':
      if (event.card === 'yellow') return `Yellow card for ${name(event.playerId)}.`;
      if (event.card === 'second-yellow') return `Second yellow! ${name(event.playerId)} is sent off.`;
      return `Straight red card! ${name(event.playerId)} is sent off.`;
    case 'substitution':
      return event.reason === 'goalkeeper'
        ? `${ctx.teamName(event.side)} bring on ${name(event.onId)} in goal; ${name(event.offId)} makes way.`
        : `Substitution for ${ctx.teamName(event.side)}: ${name(event.onId)} replaces ${name(event.offId)}.`;
  }
}

const GOAL_ASSISTED: Record<Extract<MatchEvent, { type: 'goal' }>['chance'], readonly string[]> = {
  'through-ball': [
    '{assist} threads it through and {scorer} finishes calmly.',
    '{scorer} races onto a perfect pass from {assist} and scores!',
  ],
  cross: ['{assist} whips in a cross and {scorer} heads home!', '{scorer} meets {assist}’s delivery at the far post.'],
  'long-ball': ['{assist}’s long ball finds {scorer}, who makes no mistake.', '{scorer} holds off the defender after {assist}’s ball over the top and scores.'],
  'long-shot': ['{assist} lays it off and {scorer} curls one in from distance!', '{scorer} lets fly from 25 yards after {assist}’s pass. What a goal!'],
  'set-piece': ['{scorer} rises highest to meet {assist}’s corner.', '{assist}’s free kick is flicked in by {scorer}.'],
};

const GOAL_SOLO: Record<Extract<MatchEvent, { type: 'goal' }>['chance'], readonly string[]> = {
  'through-ball': ['{scorer} beats the offside trap and slots it home.', '{scorer} dances past the last defender and scores!'],
  cross: ['{scorer} nods in a deflected cross.', '{scorer} gets on the end of a loose ball in the box.'],
  'long-ball': ['{scorer} chases a clearance down and finishes.', '{scorer} wins the long ball and fires in.'],
  'long-shot': ['What a strike from {scorer}! Into the top corner from distance.', '{scorer} tries their luck from range, and it flies in!'],
  'set-piece': ['{scorer} scrambles it home from a set piece.', '{scorer} curls the free kick over the wall and in!'],
};

const SHOT_SAVED = ['{shooter} forces a save from {defender}.', '{defender} gets down well to keep out {shooter}’s effort.'];
const SHOT_BLOCKED = ['{shooter}’s shot is blocked by {defender}.', '{defender} throws themselves in front of {shooter}’s strike.'];
const SHOT_OFF_TARGET = ['{shooter} fires wide.', '{shooter}’s effort flies over the bar.', '{shooter} snatches at it and misses the target.'];

/** Small deterministic string hash (djb2) of the event, for picking a template variant. */
function hash(event: MatchEvent): number {
  const text = JSON.stringify(event);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h;
}
