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
- Thème « lisible » (couleurs, police, tailles de texte, hauteurs tactiles, arrondis) :
  `src/theme/tokens.js`, source unique utilisée par `tailwind.config.js`, le thème de navigation
  (`src/lib/theme.ts`) et le chargement de la police (`src/theme/fonts.ts`). Tailwind ne propose
  que ces couleurs et tailles : aucune valeur en dur dans les composants.
- Contrastes : `src/__tests__/theme-contrast.test.ts` vérifie que chaque paire texte/fond du thème
  atteint 4,5:1 (WCAG AA) ; une couleur qui casse la lisibilité fait échouer les tests.
  Les couleurs de `app.json` (splash, fond d'icône Android) sont vérifiées contre les tokens.
  Règle : l'accent (`accent`, #4CB572) n'est **jamais** une couleur de texte ni un fond sous du
  texte blanc (contraste < 4,5:1, vérifié par un cas négatif du même test) ; pour du texte sur
  fond vert, utiliser `accent-light` avec `text-foreground` ou `text-primary`.
- Police : Atkinson Hyperlegible (`font-sans`, `font-sans-bold` ; pas de `font-bold`, chaque
  graisse est une famille), chargée au démarrage, l'écran de lancement restant affiché d'ici là.
- Statuts de réponse : `StatusBadge` (icône + libellé, jamais la couleur seule).
- Les couleurs sont définies directement dans la config Tailwind, sans variables CSS, afin
  d'avoir une seule source (aussi lue par le thème de navigation). `components.json` garde
  quand même `cssVariables: true` : avec `false`, la CLI (basée sur shadcn) remplacerait les
  classes sémantiques des composants ajoutés (`bg-primary`…) par des couleurs fixes et
  contournerait le thème. Conséquence attendue : `reusables doctor` signale 3 « variables
  CSS manquantes », à ignorer.
