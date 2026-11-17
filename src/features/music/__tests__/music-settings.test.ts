import type { createMemoryStorage } from '@/persistence/debounced-storage';
import { platformStorage } from '@/persistence/storage';

import { TRACKS } from '../tracks';

// The real platform storage can't run in Jest: memory instead (see store/__tests__/autosave.test.ts).
jest.mock('@/persistence/storage', () => {
  const { createMemoryStorage } = jest.requireActual('@/persistence/debounced-storage');
  return { platformStorage: createMemoryStorage() };
});
const memory = platformStorage as ReturnType<typeof createMemoryStorage>;

/** The settings module as a fresh app start would load it (it reads the preference once). */
function freshStart() {
  let module!: typeof import('../music-settings');
  jest.isolateModules(() => {
    module = jest.requireActual('../music-settings');
  });
  return module.useMusicSettings;
}

describe('music settings', () => {
  beforeEach(() => memory.removeItem('touchline-music'));

  it('is on by default, and remembers being turned off on this device', () => {
    const settings = freshStart();
    expect(settings.getState().enabled).toBe(true);
    settings.getState().setEnabled(false);
    expect(memory.getItem('touchline-music')).toBe('off');
    expect(freshStart().getState().enabled).toBe(false);
    freshStart().getState().setEnabled(true);
    expect(freshStart().getState().enabled).toBe(true);
  });

  it('asks the player for the next track, and lists three tracks', () => {
    const settings = freshStart();
    settings.getState().nextTrack();
    settings.getState().nextTrack();
    expect(settings.getState().skips).toBe(2);
    expect(TRACKS.map((t) => t.title)).toEqual(['Halftime Lounge', 'Late Kick-off', 'Extra Time']);
  });
});
