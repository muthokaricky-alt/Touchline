# Touchline

A modern, cross-platform football management game for Android, iOS and the web,
built with Expo, React Native and TypeScript.

> Status: **Milestone 1 (Foundation)** complete: design system, navigation and the
> manager dashboard. See [DEVELOPMENT.md](./DEVELOPMENT.md) for architecture,
> progress and next steps.

## Getting started

```
npm install
npm start
```

Then press **a** to open on Android (Expo Go or emulator) or **w** for the web.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run android` / `npm run web` | Start and open on that platform |
| `npm test` | Run unit tests (Jest) |
| `npm run typecheck` | Type-check the project |
| `npm run build:web` | Export a static web build to `dist/` |

## Project layout

- `src/app/`: screens/routes (Expo Router)
- `src/components/ui/`: reusable design-system components
- `src/features/`: feature screens, view models and pure helpers
- `src/theme/`: design tokens
- `src/utils/`, `src/types/`: pure TypeScript helpers and shared types

All club and player names in the app are fictional.
