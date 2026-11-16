import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False while rendering the static web HTML and during hydration, true on the
 * client afterwards (and always on native, which has no pre-rendered HTML).
 *
 * For screens whose content depends on something the pre-rendered HTML can't
 * know (e.g. a query string): render a neutral frame first, then the real
 * thing, without a hydration mismatch. React's recommended replacement for
 * the old `useEffect(() => setMounted(true))` pattern, which re-renders in
 * an effect (flagged by the react-hooks lint rules).
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
