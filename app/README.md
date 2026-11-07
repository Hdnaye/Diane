# Diane — app organisateur

App Expo (SDK 58, expo-router, TypeScript) utilisée via **Expo Go** et exportable en web.

## Prérequis

- Node.js **22.13+** (exigé par Expo SDK 58) et npm.
- Sur le téléphone : **Expo Go** à jour (App Store / Play Store), compatible SDK 58.

```bash
cd app
npm install
```

## Lancer dans Expo Go

```bash
npm start
```

Scanner le QR code affiché (appareil photo sur iPhone, Expo Go sur Android).
Le téléphone et l'ordinateur doivent être sur le même réseau ; sinon `npm start -- --tunnel`.

## Lancer en web

```bash
npm run web                          # serveur de développement
npx expo export --platform web       # build statique dans dist/ (non versionné)
```

## Tests et qualité

```bash
npm test               # jest-expo + React Native Testing Library
npm run lint           # ESLint (eslint-config-expo + testing-library)
npm run typecheck      # TypeScript strict
npm run format         # Prettier (classes Tailwind triées)
npm run format:check
```

## Repères

- Écrans : `src/app/` (expo-router). Tests : `src/__tests__/`.
- Composants react-native-reusables : `src/components/ui/` (ajout :
  `npx @react-native-reusables/cli@latest add <composant>`).
- Thème « lisible » (couleurs, tailles de texte, hauteurs tactiles) :
  `src/theme/tokens.js`, utilisé par `tailwind.config.js`. Aucune valeur en dur dans les composants.
- Les couleurs sont définies directement dans la config Tailwind, sans variables CSS, afin
  d'avoir une seule source (aussi lue par le thème de navigation). `components.json` garde
  quand même `cssVariables: true` : avec `false`, la CLI (basée sur shadcn) remplacerait les
  classes sémantiques des composants ajoutés (`bg-primary`…) par des couleurs fixes et
  contournerait le thème. Conséquence attendue : `reusables doctor` signale 3 « variables
  CSS manquantes », à ignorer.
