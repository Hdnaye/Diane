# app/ — agent notes

Project rules (TDD, readable theme, scope, Git, GDPR, secrets) live in [`/CLAUDE.md`](../CLAUDE.md)
and take precedence over this file. This file only adds Expo-specific reminders.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. Before writing code that touches an Expo or
React Native API:

1. Read the major version of the `expo` package in `package.json` (currently SDK 58).
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt and follow its links.

## Expo Go only

The app runs in Expo Go: never add a native module outside the Expo SDK. Prefer modules that
also work on web.

## Commands

```bash
npx expo install <package>  # always use instead of npm install: resolves SDK-compatible versions
npm start                   # dev server (scan the QR code with Expo Go)
npm test
npm run lint
npm run typecheck
npm run format:check
```

All four checks must pass before a PR.

## Routing

- Expo Router: routes live in `src/app/` — every file there is a screen, `_layout.tsx` files
  define navigators. Keep non-route code (components, hooks, tests) outside `src/app/`.
- Import `Link`, `router` and `useLocalSearchParams` from `expo-router`.
