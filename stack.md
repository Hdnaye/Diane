# Stack — options étudiées

> Document de travail pour le POC. Prix indicatifs relevés en novembre 2026,
> à revérifier sur les sites officiels avant tout achat (Hetzner et OVH ont
> augmenté leurs tarifs en avril 2026).

## 1. Backend

| Option | Ce que c'est | Pour | Contre |
|---|---|---|---|
| **PocketBase** (recommandé) | Un seul binaire Go, base SQLite intégrée | Installation en 1 commande, ~30 Mo de RAM, interface d'admin incluse, auth, temps réel, tâches planifiées, sert aussi les pages web | Pas encore en v1.0 (changements cassants possibles entre versions), un seul serveur (suffisant ici) |
| Supabase auto-hébergé | Postgres + auth + API, ~10 conteneurs Docker | Très complet, Postgres | Lourd à installer et maintenir, 2-4 Go de RAM |
| Backend sur mesure (Node/Fastify + SQLite) | On code tout | Contrôle total | Auth, admin, temps réel, cron à écrire soi-même : beaucoup plus long |

### PocketBase en bref

| Fonction | Détail | Usage dans Diane |
|---|---|---|
| Base de données | SQLite (fichier unique), « collections » définies dans l'interface d'admin | Adhérents, battues, invitations, réponses |
| Interface d'admin | Tableau de bord web inclus | Voir/corriger les données à la main pendant le POC |
| Authentification | E-mail/mot de passe, OTP, OAuth2 | Connexion de l'organisateur |
| Règles d'accès | Règles par collection (qui lit/écrit quoi) | L'organisateur ne voit que ses données |
| Temps réel | Abonnements aux changements (SSE) | Les réponses apparaissent en direct dans l'app |
| Extensions | Hooks en JavaScript (`pb_hooks/`) ou utilisation comme framework Go | Logique métier : envoi des invitations, analyse des SMS |
| Routes personnalisées | `routerAdd(...)` | Webhook de réception des SMS, page de réponse adhérent |
| Tâches planifiées | `cronAdd(...)` | Relance 24 h avant la date limite, clôture |
| E-mail | Client SMTP intégré | Invitations et envoi du PDF |
| Fichiers statiques | Dossier `pb_public/` | Formulaire web de réponse des adhérents |
| Sauvegardes | Sauvegardes planifiées intégrées (local ou S3) | Ne pas perdre les données de l'asso |
| SDK | SDK JavaScript officiel, compatible React Native | Appels depuis l'app Expo (temps réel : polyfill EventSource nécessaire) |
| Licence | MIT, gratuit | — |

## 2. Hébergement

| Option | Coût | Pour | Contre |
|---|---|---|---|
| Machine perso (PC allumé en permanence) | 0 € + électricité : ~50 W 24h/24 ≈ **~90 €/an** | Déjà disponible | Disponibilité (coupures, box, mises à jour), exposition du réseau perso, IP qui change |
| Machine perso économe (Raspberry Pi, mini-PC) | ~5-10 W ≈ **~10-20 €/an** (+ achat si pas déjà possédé) | Peu coûteux à faire tourner | Mêmes contraintes de disponibilité |
| **VPS Hetzner** (CX23, Allemagne/Finlande) (recommandé) | **~4,80 €/mois ≈ 58 €/an** | Toujours en ligne, IP fixe, largement assez pour PocketBase | Petit coût fixe, administration Linux minimale |
| VPS OVH (France) | ~4-8 €/mois selon offre | Données en France, support en français | Souvent un peu plus cher que Hetzner à ressources égales |

### Exposer le serveur sur Internet (lien de réponse + webhook SMS)

| Option | Coût | Remarques |
|---|---|---|
| VPS + nom de domaine + HTTPS (Caddy / Let's Encrypt) | ~10 €/an (domaine) | Le plus propre, URL stable et lisible |
| VPS + sous-domaine gratuit (DuckDNS…) | 0 € | Fonctionne, URL moins rassurante pour les adhérents |
| Machine perso + Tailscale Funnel | 0 € | URL stable en `*.ts.net`, rien à ouvrir sur la box |
| Machine perso + Cloudflare Tunnel | ~10 €/an (domaine sur Cloudflare requis) | URL personnalisée, rien à ouvrir sur la box |

## 3. Envoi des SMS

| Option | Coût initial | Coût récurrent | Lien dans le SMS | Réponse par SMS | Remarques |
|---|---|---|---|---|---|
| **A. Android dédié + SIM, servant de passerelle** (retenu) | 0-40 € | ~2 €/mois | ✅ | ✅ | Indépendant du téléphone de l'organisateur. Vérifier les limites anti-spam du forfait |
| B. Passerelle sur l'Android de l'organisateur | 0 € | 0 € | ✅ | ✅ | Android uniquement, son propre numéro. Même logiciel que A |
| C. API SMS (OVH, SMSFactor…) | 0 € | ~0,07 €/SMS ≈ 150-250 €/saison | ✅ ou ❌ | ❌ ou ✅ | Lien et réponse incompatibles dans un même SMS (numéro court) |
| D. Pas de SMS (e-mail seul) | 0 € | 0 € | — | — | Exclut les adhérents sans e-mail |

## 4. Envoi des e-mails

| Option | Coût | Limite gratuite | Remarques |
|---|---|---|---|
| SMTP d'une boîte existante (Gmail + mot de passe d'application) | 0 € | ~500/jour | Le plus simple pour démarrer ; risque d'arriver en spam |
| **Brevo** (français) | 0 € | 300/jour | Bonne délivrabilité, SMTP standard |
| Resend | 0 € | 100/jour, 3 000/mois | Orienté développeurs |
| Boîte mail liée au nom de domaine (OVH…) | souvent incluse avec le domaine | variable | Adresse `diane@mondomaine.fr` plus crédible ; configurer SPF/DKIM |

## 5. Application organisateur

| Option | Coût | Pour | Contre |
|---|---|---|---|
| **Web app installable (PWA)**, via Expo export web | 0 € | iPhone et Android avec le même code, aucun compte Apple ni store, mises à jour automatiques, servie directement par PocketBase (`pb_public/`) | Installation manuelle sur iPhone (Partager → « Sur l'écran d'accueil »), notifications iPhone seulement une fois installée, modules Expo limités côté web (`expo-sms`, `expo-mail-composer`, `expo-print` partiel) |
| **Expo Go** (point de départ) | 0 € | Rien à compiler, on scanne un QR code | Modules natifs limités au SDK Expo ; Expo Go suit la dernière version du SDK : un projet resté sur une ancienne version cesse de s'ouvrir après une mise à jour d'Expo Go ; partage à un tiers (surtout iOS) à vérifier |
| Dev build Android (APK) | 0 € (EAS Build, offre gratuite, ou build local) | App autonome installée sur le téléphone, tous modules natifs | Installation d'un APK hors Play Store |
| Dev build / TestFlight iOS | **99 $/an** (compte Apple Developer) | App autonome sur iPhone | Coût annuel, procédure Apple |

### Expo Go vs dev build

- **Expo Go** : une app générique publiée par Expo sur les stores. Elle contient un
  ensemble fixe de modules natifs ; notre code JavaScript est chargé dedans. Pas
  de compilation, mais impossible d'ajouter un module natif absent, et elle dépend
  de la version du SDK.
- **Dev build** (*development build*) : notre propre app compilée (nom, icône,
  modules natifs de notre choix), avec les mêmes outils de développement
  qu'Expo Go (rechargement à chaud). On la compile via EAS Build (cloud) ou en
  local, puis on l'installe sur le téléphone. Le code reste le même : on peut
  commencer en Expo Go et passer en dev build plus tard sans réécrire.

### Faisabilité de la PWA sur iPhone (fonctionnalités de base)

Toute la logique lourde (envois SMS/e-mail, relance, analyse des SMS, génération
et envoi du PDF) tourne sur le serveur ; l'app organisateur n'est qu'une interface.

| Fonctionnalité | iPhone (Safari / PWA installée) |
|---|---|
| Gestion des adhérents, calendrier, création/annulation de battue | ✅ |
| Déclenchement des invitations (exécuté par le serveur) | ✅ |
| Suivi des réponses en direct (SSE) | ✅ |
| Saisie manuelle d'une réponse, file « à vérifier » | ✅ |
| PDF : envoi par mail (serveur) ou téléchargement / partage (Web Share API) | ✅ |
| Notification « nouvelle réponse » (hors fonctionnalités de base) | ⚠️ seulement si la PWA est installée sur l'écran d'accueil (iOS 16.4+) |
| Session de connexion | ⚠️ Safari peut effacer les données d'un site non installé après quelques semaines sans usage → reconnexion ; pas de problème une fois installée |

Note UE : Apple avait annoncé en février 2024 la suppression des web apps
installées en UE (DMA), puis a fait marche arrière avant iOS 17.4. À confirmer par
un test rapide sur un vrai iPhone au démarrage du POC.

## 6. Scénarios de coût (POC, par an)

| Poste | Minimal | Raspberry Pi + PWA | Recommandé (VPS) | Avec iPhone hors Expo Go |
|---|---|---|---|---|
| Hébergement | Machine perso déjà allumée : 0 € | Raspberry Pi : ~5-10 € (électricité) | VPS Hetzner : ~58 € | VPS Hetzner : ~58 € |
| Exposition | Tailscale Funnel : 0 € | Tailscale Funnel : 0 € | Domaine : ~10 € | Domaine : ~10 € |
| SMS (option A) | Vieux téléphone + SIM : ~24 € | Vieux téléphone + SIM : ~24 € | Vieux téléphone + SIM : ~24 € | ~24 € |
| E-mail | Gmail SMTP : 0 € | Brevo gratuit : 0 € | Brevo gratuit : 0 € | Brevo gratuit : 0 € |
| App | Expo Go : 0 € | PWA : 0 € | Expo Go : 0 € | Apple Developer : ~92 € (99 $) |
| **Total / an** | **~24 €** | **~30 €** | **~92 €** | **~184 €** |

Raspberry Pi : éviter de stocker la base sur la carte SD (usure, corruption en cas
de coupure) → SSD en USB (~20 €) si possible, et sauvegardes automatiques hors du Pi
dans tous les cas. Si la box ou le courant tombe, liens et SMS sont indisponibles
le temps de la coupure.

Coûts ponctuels possibles : téléphone Android reconditionné (~40 €) si aucun vieux
téléphone n'est disponible ; SSD pour le Raspberry Pi.
