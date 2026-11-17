import extraTime from '../../../assets/music/extra-time.mp3';
import halftimeLounge from '../../../assets/music/halftime-lounge.mp3';
import lateKickOff from '../../../assets/music/late-kick-off.mp3';

/**
 * The menu music: three original jazzy lo-fi loops made by
 * scripts/make-music.mjs (synthesised from code, no samples, no licences).
 * Played in this order, then round again.
 */
export const TRACKS = [
  { title: 'Halftime Lounge', source: halftimeLounge },
  { title: 'Late Kick-off', source: lateKickOff },
  { title: 'Extra Time', source: extraTime },
] as const;
