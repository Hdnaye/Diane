# Diane

Application de gestion des dianes : organisation des battues de chasse
et collecte des présences des adhérents.

## Statut
POC testé avec une seule petite association de chasse. Objectif : valider
l'idée à coût minimal. Auto-hébergé sur une machine personnelle ; pas de
sur-ingénierie, pas de multi-association.
Première étape : une démo réalisée par nous, avec Expo Go sur notre propre
téléphone. Distribution à l'organisateur (PWA, dev build) décidée après,
si l'idée prend.

## Utilisateurs
- **Organisateur** (un seul pour le POC) : utilise l'application mobile
  (iOS ou Android, plateforme inconnue → les deux doivent fonctionner).
  Gère sa liste d'adhérents, crée les battues, envoie les invitations,
  suit les réponses, exporte la liste.
- **Adhérents** : souvent âgés, peu à l'aise avec la technologie, parfois sans
  smartphone. Ils n'installent PAS l'application ; ils répondent par SMS
  ou via un lien web. Permis et habilitations sont validés par l'organisateur
  en amont (hors app).

## Périmètre du POC
- Liste d'adhérents : nom, e-mail et/ou téléphone.
- Calendrier : création de battues. Plusieurs battues par semaine possibles,
  au plus une par jour.
- Nombre maximum de participants par battue (optionnel). Une fois complet,
  les « oui » suivants passent en liste d'attente. Quand une place se libère,
  un nouveau « oui » passe derrière les adhérents déjà en liste d'attente ;
  c'est l'organisateur qui fait monter quelqu'un de la liste (pas de
  promotion automatique).
- Invitation par SMS et e-mail à tous les adhérents : présence oui/non.
- Message modèle réutilisable avec variables : date, heure, date limite
  de réponse (défaut : +48 h).
- Réponse de l'adhérent :
  - via un lien web personnel, sans compte ni mot de passe ;
  - par SMS : `OUI` / `NON`, suivi du jour du mois (`OUI 15`) quand plusieurs
    battues sont ouvertes. Ponctuation, émojis et formules de politesse d'une
    liste fermée sont tolérés ; tout message ambigu ou conditionnel → file
    « à vérifier ». Chaque réponse SMS reconnue reçoit un SMS de confirmation
    reprenant l'interprétation (ex. « Présence OUI enregistrée pour la battue
    du 15 »), pour que l'adhérent puisse corriger une erreur.
- L'adhérent peut modifier sa réponse jusqu'à la date limite ; après,
  seul l'organisateur peut la modifier.
- Saisie/modification manuelle d'une réponse par l'organisateur.
- Relance automatique des non-répondants 24 h avant la date limite.
- Annulation d'une battue avec notification aux adhérents.
- Export PDF de la liste finale + envoi par e-mail à l'organisateur.

## Accès organisateur (POC)
- Pas d'écran de connexion. L'app s'authentifie silencieusement auprès du
  back-end avec une clé secrète longue et aléatoire, envoyée à chaque requête.
- Toute route ou collection organisateur refuse les requêtes sans cette clé.
  Seules exceptions publiques : la page de réponse adhérent (accès par jeton
  d'invitation) et le webhook de la passerelle SMS (authentifié par son propre secret).
- La clé vit dans des fichiers `.env` non commités (back et app) ; `.env.example`
  avec une valeur factice. Elle est embarquée dans l'app de démo : acceptable
  pour le POC, à remplacer par une vraie authentification avant distribution.

## Hors périmètre (POC)
- Paiement : se fait en espèces, sur place. Piste future : Stripe / Apple Pay
  vers le compte de l'association.
- Invités, co-organisateurs, plusieurs associations, plusieurs battues par jour.

## Principes UX
- Friction minimale partout, pour l'organisateur comme pour les adhérents.
- Formulaire adhérent : gros boutons, aucune connexion, aucun mot de passe.

## Envoi des SMS
- Pas d'API SMS payante. Les SMS partent d'un téléphone Android servant
  de passerelle (app open source type « SMS Gateway for Android »),
  qui envoie les SMS et transmet les réponses au backend.
- Par défaut : un téléphone dédié avec sa propre SIM (forfait SMS illimités).
  Variante : le téléphone Android de l'organisateur. Le code ne doit pas
  dépendre de ce choix.

## Stack
- App organisateur : React Native + Expo, testée via Expo Go.
  → N'utiliser que des modules compatibles Expo Go (SDK Expo ou JS pur).
  → Privilégier les modules qui marchent aussi sur le web, pour pouvoir
    passer en PWA sans réécriture.
- Backend : PocketBase, auto-hébergé sur un Raspberry Pi (carte SD pour la démo,
  sauvegardes automatiques hors du Pi).
- Voir `stack.md` pour les options étudiées et les coûts.

## Conventions
- Code, nommage et commentaires en anglais ; interface utilisateur en français.

## Librairies front
- Styles : NativeWind. Couleurs, tailles et espacements définis une seule fois
  dans la config (thème « lisible » : texte de base généreux, boutons hauts,
  contrastes forts).
- Composants : react-native-reusables (shadcn/ui pour React Native), copiés dans
  le projet. Réutiliser/étendre un composant existant avant d'en créer un nouveau.
- Icônes : lucide-react-native. Calendrier : react-native-calendars.
- Formulaires : react-hook-form + zod. Données serveur : TanStack Query.
- Dates : date-fns (locale `fr`).
- Types des données : générés depuis le schéma PocketBase (pocketbase-typegen),
  jamais redéclarés à la main.
- Le formulaire de réponse des adhérents est une page de l'app Expo
  (ex. `/r/[token]`), exportée en web et servie par PocketBase.

## Tests et qualité
- TDD obligatoire : test qui échoue → code minimal → refactor (un commit par étape).
- Back : Vitest. Logique pure dans des modules isolés (tests unitaires) ;
  hooks PocketBase couverts par des tests d'intégration contre une instance
  PocketBase de test lancée à la volée.
- Front : jest-expo + React Native Testing Library.
- Une PR n'est soumise en review que si tests, lint et vérification de types passent.

## Workflow multi-agents
Agents définis dans `.claude/agents/` : `backend-dev`, `frontend-dev`,
`backend-reviewer`, `frontend-reviewer`.

**Superviseur = la session principale.** Il ne code pas. Il :
1. découpe le travail en tâches et crée une branche par tâche
   (`feat/back-<slug>`, `feat/front-<slug>`, `fix/<slug>`) ;
2. lance l'agent dev concerné dans un worktree isolé ;
3. à l'annonce « PR prête », lance le reviewer correspondant sur la PR ;
4. transmet la review à l'agent dev (en reprenant le même agent) et répète
   jusqu'à `VERDICT: APPROVED` ;
5. attend la confirmation du dev (« Review validée, PR #N prête à merger »),
   puis **demande l'accord de l'utilisateur avant chaque merge** ;
6. merge avec `gh pr merge --merge` (pas de squash : l'historique TDD est conservé)
   et tient l'utilisateur informé de l'avancement.

Les agents dev ne touchent qu'à leur dossier (`backend/` ou `app/`) ;
les reviewers ne modifient jamais le code.

## Git
- Commits et merges faits avec le compte Git/GitHub de l'utilisateur.
- Pull requests via `gh`, une PR par tâche, vers `main`.
- Ne JAMAIS ajouter Claude en co-auteur : pas de ligne `Co-Authored-By`,
  ni de mention « Generated with Claude Code » dans les commits, merges ou PR.

## Contraintes
- Données personnelles (noms, téléphones, e-mails) : RGPD, hébergement UE.

## Dépôt public : données personnelles (RGPD)
Le dépôt GitHub est PUBLIC. Tout ce qui est commité est lisible par tous et reste
dans l'historique même après suppression.
- Aucune donnée réelle d'adhérent ou d'organisateur dans le dépôt : ni nom, ni
  téléphone, ni e-mail, ni export (CSV, PDF), ni capture d'écran, ni base
  PocketBase (`pb_data/`, `*.db`), ni sauvegarde.
- Données de test et d'exemple uniquement fictives : noms inventés, e-mails en
  `@example.com` / `@example.org`, numéros de la plage fictive réservée par l'ARCEP
  (`06 39 98 xx xx` / `+33 6 39 98 xx xx`).
- Aucune donnée personnelle dans les logs (serveur, app, CI) : journaliser des
  identifiants techniques (id d'adhérent, d'invitation), jamais le nom, le
  numéro ou le contenu d'un SMS.
- Aucune donnée réelle dans les issues, PR, reviews, messages de commit ou
  artefacts de CI.
- Minimisation : ne collecter que nom, e-mail et/ou téléphone et les réponses
  aux battues. Prévoir la suppression complète d'un adhérent (droit à l'effacement).
- Les jetons des liens de réponse sont aléatoires, non devinables, liés à une
  seule invitation, et ne contiennent aucune donnée personnelle.

## Secrets
- Aucun secret dans le dépôt : clés d'API, mots de passe, jetons (passerelle
  SMS, SMTP/Brevo, Tailscale, superuser PocketBase, GitHub…), clés privées, certificats.
- Secrets locaux dans des fichiers `.env` jamais commités (couverts par
  `.gitignore`) ; fournir un `.env.example` avec des valeurs factices.
- Secrets de CI dans les GitHub Actions secrets, jamais en clair dans les workflows.
- Côté app : aucun secret dans le code Expo (tout ce qui est embarqué dans l'app
  ou l'export web est public). Les appels nécessitant un secret passent par le back-end.
- Les secrets de test sont générés aléatoirement à l'exécution.
- Si un secret est commité par erreur : le considérer comme compromis, le révoquer
  et le régénérer immédiatement, prévenir l'utilisateur ; le supprimer de
  l'historique ne suffit pas.
- Les reviewers vérifient systématiquement l'absence de secrets et de données
  personnelles dans chaque PR.
