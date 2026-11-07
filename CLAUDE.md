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
  les « oui » suivants passent en liste d'attente. Gestion des désistements :
  à définir avec l'organisateur.
- Invitation par SMS et e-mail à tous les adhérents : présence oui/non.
- Message modèle réutilisable avec variables : date, heure, date limite
  de réponse (défaut : +48 h).
- Réponse de l'adhérent :
  - via un lien web personnel, sans compte ni mot de passe ;
  - par SMS : `OUI` / `NON`, suivi du jour du mois (`OUI 15`) quand plusieurs
    battues sont ouvertes. Messages non reconnus → file « à vérifier ».
- L'adhérent peut modifier sa réponse jusqu'à la date limite ; après,
  seul l'organisateur peut la modifier.
- Saisie/modification manuelle d'une réponse par l'organisateur.
- Relance automatique des non-répondants 24 h avant la date limite.
- Annulation d'une battue avec notification aux adhérents.
- Export PDF de la liste finale + envoi par e-mail à l'organisateur.

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

## Git
- Commits et merges faits avec le compte Git/GitHub de l'utilisateur.
- Ne JAMAIS ajouter Claude en co-auteur : pas de ligne `Co-Authored-By`,
  ni de mention « Generated with Claude Code » dans les commits, merges ou PR.

## Contraintes
- Données personnelles (noms, téléphones, e-mails) : RGPD, hébergement UE.
