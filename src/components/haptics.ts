import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/*
 * Haptics for a few meaningful moments only (never per frame, never the only
 * feedback: many phones have them off). Fired in the same moment as the
 * visual change. No-ops on the web; failures are ignored.
 */

const native = Platform.OS !== 'web';

/** A choice ticks over: a chip or a segment picked. */
export function hapticSelection(): void {
  if (native) void Haptics.selectionAsync().catch(() => undefined);
}

/** Something lands: a lineup swap made. */
export function hapticLand(): void {
  if (native) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

/** A big moment going your way: your team scores. */
export function hapticSuccess(): void {
  if (native) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
