import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Root HTML for the website (web only; rendered in Node.js during the static
 * export, so no browser APIs here). Expo Router's default, plus what makes
 * the site installable as an app (PWA): the web manifest, the theme colour,
 * the home-screen icon for iOS, and a navy background so there's no white
 * flash before the app draws. The service worker that makes it work offline
 * is generated after the export (scripts/build-sw.mjs) and registered by the
 * root layout.
 *
 * SDK 58: custom HTML must render the values from useServerDocumentContext().
 */
export default function Root({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();

  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="description" content="Touchline: a football management game. Build your squad, set your tactics and manage your way across six countries." />
        <meta name="theme-color" content="#101820" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Touchline" />
        {/* The app's background colour from the first paint. */}
        <style dangerouslySetInnerHTML={{ __html: 'html,body{background-color:#101820;}' }} />
        {/* Disables body scrolling so ScrollView behaves as on native. */}
        <ScrollViewStyleReset />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
