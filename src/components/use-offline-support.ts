/**
 * Offline support for the website (see use-offline-support.web.ts). The
 * phone app is offline already, so on native this does nothing. Metro picks
 * the .web.ts file for the web build, like persistence/storage(.web).ts.
 */
export function useOfflineSupport(): void {}
