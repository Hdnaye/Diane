# Diane — app organisateur

App Expo (SDK 58, expo-router, TypeScript) utilisée via **Expo Go** et exportable en web.

## Prérequis

- Node.js **22.13+** (exigé par Expo SDK 58) et npm.
- Sur le téléphone : **Expo Go** à jour (App Store / Play Store), compatible SDK 58.

```bash
cd app
npm install
```

## Connexion au serveur (PocketBase)

L'app parle au back-end PocketBase de `backend/` (voir `backend/README.md`) et s'authentifie
**silencieusement** au démarrage avec le compte organisateur : aucun écran de connexion.

```bash
cp .env.example .env    # jamais commité (couvert par .gitignore)
```

Puis renseigner dans `app/.env` :

| Variable                            | Valeur                                                                                                                                                                                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_DIANE_API_URL`         | adresse de PocketBase vue du téléphone : l'IP de l'ordinateur sur le réseau local (ex. `http://192.168.1.20:8090`, lancer alors le back avec `npm run dev -- --http=0.0.0.0:8090`), pas `127.0.0.1` dans Expo Go ; `http://127.0.0.1:8090` convient pour le web sur la même machine |
| `EXPO_PUBLIC_DIANE_ORGANIZER_EMAIL` | la même valeur que `DIANE_ORGANIZER_EMAIL` de `backend/.env`                                                                                                                                                                                                                        |
| `EXPO_PUBLIC_DIANE_ORGANIZER_KEY`   | la même valeur que `DIANE_ORGANIZER_KEY` de `backend/.env`                                                                                                                                                                                                                          |

Relancer `npm start` (ou refaire l'export web) après un changement : Expo intègre ces variables
au moment du build.

**La clé est embarquée dans l'app** (et dans l'export web) : tout ce qui commence par
`EXPO_PUBLIC_` est lisible par qui a l'app. Acceptable pour la démo du POC (CLAUDE.md, « Accès
organisateur ») ; à remplacer par une vraie authentification avant toute distribution.

Si une variable manque ou si le serveur ne répond pas, l'accueil affiche « Connexion au serveur
impossible… » avec un bouton « Réessayer » (« Créer une battue » est alors désactivé).

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
- Données : les écrans passent par TanStack Query (`src/data/hunt-queries.ts`) vers l'interface
  `HuntRepository` (`list`, `create`), fournie par `HuntRepositoryProvider` avec la connexion au
  serveur. Dans l'app : PocketBase (`src/data/app-backend.ts`, SDK JS officiel `pocketbase`,
  JS pur, compatible Expo Go et web) ; dans les tests : une implémentation en mémoire, et un faux
  `fetch` pour tester le client PocketBase (aucun appel réseau).
  - Authentification (`src/data/pocketbase-session.ts`) : `auth-with-password` sur `organizers`,
    une seule à la fois (double montage compris), réessayée sur 429 (le back limite les
    authentifications à 2 par 3 s), renouvelée quand le jeton expire ou sur un 401. Jeton gardé
    en mémoire seulement.
  - Jeton révoqué (ex. `npm run setup` relancé dans `backend/`, qui régénère le `tokenKey`) :
    PocketBase le traite en invité (liste vide, création refusée en 400), jamais en 401. Le
    serveur revalide donc le jeton (`auth-refresh`) si la dernière validation date de plus de
    60 s (`VALIDATION_INTERVAL_MS`), et après une réponse douteuse (liste vide, création
    refusée sans erreur de champ, 403) : jeton refusé → nouvelle authentification et un seul
    nouvel essai.
  - Les requêtes sont réessayées une fois (`src/lib/query-client.ts`) : serveur injoignable
    signalé en 2 s environ.
  - Types : `src/data/types.ts` dérive ceux de pocketbase-typegen
    (`src/lib/pocketbase-types.ts`, généré par `npm run typegen` dans `backend/`) ; seul écart,
    `max_participants` vaut `null` côté app quand il n'y a pas de limite (`0` dans PocketBase).
  - Un jour déjà pris (index unique sur `date`) devient `HuntDayTakenError`, affichée par le
    formulaire.
- Adhérents (`src/app/members/`, accès par le bouton « Adhérents » de l'accueil) : liste triée par
  nom (accents et casse ignorés), ajout, modification, suppression après confirmation (le back
  supprime aussi les réponses : droit à l'effacement) ou « Ne plus inviter » (adhérent inactif).
  Interface `MemberRepository` (`list`, `create`, `update`, `remove`, `setActive`), PocketBase
  (`src/data/pocketbase-member-repository.ts`, même session et même détection du jeton révoqué
  que les battues ; une modification ou suppression en invité répond 404) ou en mémoire.
  Téléphone saisi librement (« 06 39 98 00 01 », « +33 6… »), envoyé en E.164 et affiché au
  format national (`src/lib/phone.ts`, même règle que le back). Le formulaire
  (`src/lib/member-form.ts`) vérifie tout en une fois ; les refus du back (numéro invalide,
  doublon de téléphone ou d'e-mail, aucun contact) deviennent des messages français sous les
  champs (`src/lib/member-messages.ts`). Aucune donnée d'adhérent n'est journalisée.
- Calendrier : `HuntCalendar` (react-native-calendars, 100 % JS), locale française construite
  avec date-fns, semaine commençant le lundi ; jours rendus par un composant à classes NativeWind
  (aujourd'hui cerclé, battue en `accent-light`, sélection en `primary`).
- Dates : `src/lib/dates.ts` (date-fns, locale `fr`) ; un jour est une clé `yyyy-MM-dd`.
  Jours, heures de rendez-vous et dates limites sont **en heure de Paris**, quel que soit le
  fuseau du téléphone (`src/lib/paris-time.ts`, même règle que le back : heure d'été de l'UE
  appliquée directement). Les tests tournent avec le « téléphone » à New York
  (`jest.config.js`) pour le vérifier.
- Saisie heure / date limite : `StepperField`, gros boutons « − 1 h / + 1 h »… plutôt qu'un
  sélecteur natif (`@react-native-community/datetimepicker` ne fonctionne pas sur le web).
  Date limite par défaut (`src/lib/hunt-form.ts`, même règle que le back) : J+2 à 20 h 00
  heure de Paris (J = aujourd'hui) ; si ce n'est pas strictement avant la battue, la veille de
  la battue à 20 h 00 (si c'est déjà passé, le formulaire l'indique). Elle suit le jour et
  l'heure choisis tant que l'organisateur ne l'a pas modifiée.
- Les couleurs sont définies directement dans la config Tailwind, sans variables CSS, afin
  d'avoir une seule source (aussi lue par le thème de navigation). `components.json` garde
  quand même `cssVariables: true` : avec `false`, la CLI (basée sur shadcn) remplacerait les
  classes sémantiques des composants ajoutés (`bg-primary`…) par des couleurs fixes et
  contournerait le thème. Conséquence attendue : `reusables doctor` signale 3 « variables
  CSS manquantes », à ignorer.
