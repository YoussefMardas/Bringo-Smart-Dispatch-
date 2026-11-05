# Bringo Smart Distribution

Application web de planification : elle répartit les commandes clients entre un nombre de pickers saisi à la main, en équilibrant le **nombre d'articles** (et non le nombre de commandes), et suggère les renforts entre pickers.

Next.js (App Router) · TypeScript · Tailwind CSS 4 · composants de style shadcn/ui · Prisma · PostgreSQL (Supabase) · déployable sur Vercel.

## Fonctionnalités (MVP)

| Priorité | Fonction | Où |
|---|---|---|
| 1 | Sidebar + sélection du magasin (le magasin choisi pilote toutes les pages) | `src/components/sidebar.tsx` |
| 2 | Import `.xlsm`, magasins automatiques, Clear Data | page *Import des données* |
| 3 | Nombre de pickers dynamique par créneau de 2 h | idem |
| 4 | Algorithme de distribution (indépendant de l'UI) | `src/lib/distribution/` |
| 5 | Séquence d'assistance, charges par picker, chronologie | `src/components/distribution/result-view.tsx` |
| 6 | Dashboard : 5 KPI par magasin / date / créneau | `src/app/(app)/[storeId]/dashboard` |
| 7 | Historique des distributions enregistrées | `.../history` |
| 8 | Authentification + 3 rôles | `src/lib/auth.ts`, `src/lib/permissions.ts` |

### Rôles

| Rôle | Magasins | Paramètres |
|---|---|---|
| Super Admin | tous (actifs ou non) | oui (magasins, utilisateurs) |
| Master Opérations E-commerce | tous les magasins actifs | non |
| Master Magasin | son magasin uniquement | non |

Il n'y a volontairement ni compte picker, ni suivi de performance individuelle.

### Import du fichier .xlsm

Menu **Import des données** (Super Admin et Master Opérations). Seuls les fichiers `.xlsm` sont acceptés ; les macros ne sont pas exécutées, seules les valeurs des cellules sont lues, dans le navigateur.

- **Colonnes** : les 46 colonnes attendues sont listées dans `src/lib/xlsm-import.ts` (`XLSM_COLUMNS`, dans l'ordre : `Order Number`, `Store`, `Creneau`, `Fraudeur`, `Number Of Products`, … `Maintenant2`). Elles sont retrouvées par leur en-tête (même si l'ordre change) ; sans en-tête, la lecture se fait par position. Toutes les colonnes sont conservées dans `Order.raw` (JSON).
- **Hyper magasins uniquement** : les lignes dont le `Store` ne commence pas par « Hyper » sont ignorées (aperçu et serveur).
- **Synchronisation automatique du fichier** : *Lier un fichier .xlsm* le mémorise (Chrome / Edge) ; il est surveillé toutes les 15 s et réimporté dès qu'il change, sans bouton « Synchroniser ». Après un rechargement, la surveillance reprend seule si l'autorisation de lecture est encore accordée. En cas d'échec, nouvelle tentative automatique (5, 10, 20, 40 puis 60 s). La page d'import doit rester ouverte.
- **Affichage** : seuls `Order Number`, `Store`, `Creneau` et `Number Of Products` apparaissent dans les tableaux.
- **Magasins** : créés automatiquement d'après la colonne `Store` et listés dans la sidebar (une section par magasin : Dashboard, Dispatch, Historique). Chaque magasin ne voit que ses propres commandes. La liste se met à jour après chaque import et après Clear Data.
- **Jour et créneau** : le créneau vient de `Creneau` (« 10h-12h » → `10:00-12:00`) ; le jour de `Day Of Delivery`, sinon `Order Date`, `Debut De Creneau`, `Order Time`.
- **Réimport** : clé = magasin + `Order Number`. Les commandes existantes sont mises à jour, les nouvelles ajoutées, sans doublon.
- **Clear Data** : supprime les commandes importées et les nombres de pickers, après confirmation. L'historique des distributions n'est supprimé que si la case est cochée. Magasins et comptes sont conservés.
- Plus d'ajout manuel de commande : les données viennent du fichier (modifier ou supprimer une commande importée reste possible).

### Comptes magasins automatiques

À chaque import, un compte **Master Magasin** est créé pour chaque magasin **Hyper** qui n'en a pas (e-mail généré : `hyper.dar.bouazza@<ACCOUNT_EMAIL_DOMAIN>`, suffixe `.2` en cas de doublon). Le mot de passe temporaire est affiché **une seule fois** (liste téléchargeable en CSV ; seul le hash est stocké) et doit être changé à la première connexion. La page **Comptes magasins** (Super Admin / Master Ops) liste tous les e-mails, crée les comptes manquants et réinitialise un mot de passe.

### Dispatch (Master Magasin)

Le Master Magasin dispose de la même page **Dispatch** que le Master Ops (génération, enregistrement, historique), limitée à son magasin ; il ne peut ni importer ni effacer les données. Toute modification de son nombre de pickers notifie les Masters Ops (message : magasin, auteur, ancienne → nouvelle valeur, créneau, date).

### Notifications et synchronisation en temps réel

Une pastille de statut (barre supérieure) indique « À jour » avec la date et l'heure de la dernière synchronisation réussie, ou l'échec et la nouvelle tentative en cours. Chaque navigateur interroge `/api/sync` toutes les 10 s ; si les données ont changé (import, modification d'un autre compte), la page se rafraîchit seule. Les Masters Ops reçoivent un toast et une cloche de notifications.

### Statuts de commande

Le statut vient de `Status Acceptation` (repli sur `Status`) et est recalculé à chaque import (`src/lib/order-status.ts`, point unique à ajuster si vos libellés diffèrent) :

| Statut | Règle |
|---|---|
| OK, Retard | dispatchée et comptée comme acceptée |
| Annulée (contient « annul » / « cancel ») | exclue du dispatch et des commandes acceptées, mais comptée dans « annulées » |
| Autre / vide | ni dispatchée ni acceptée (comptée dans « reçues ») |

Le dashboard affiche reçues / acceptées (dont retard) / annulées / distribuées ; un changement de statut dans le fichier met les compteurs à jour à la synchro suivante, et le dashboard signale une distribution à régénérer.

### Créneaux

Un créneau = magasin × jour × `Creneau`. Si `Creneau` est vide ou libre (ex. « Maintenant »), il est reconstitué depuis `Debut De Creneau` / `Fin De Creneau`. À l'import, une ligne invalide est écartée et signalée sans bloquer les autres ; les jours les plus récents (dont aujourd'hui) sont envoyés en premier et un lot en échec n'interrompt pas les suivants.

### Sessions simultanées

Master Ops / Super Admin : `https://votre-domaine/`. Master Magasin : `https://votre-domaine/magasin`. Chaque portail a son propre cookie (`bsd_ops`, `bsd_store`) : on peut être connecté aux deux dans le même navigateur, dans deux onglets, et se déconnecter de l'un sans fermer l'autre.

### Règle des 3 commandes par picker

Un picker ne reçoit jamais plus de 3 commandes (`MAX_ORDERS_PER_PICKER` dans `src/lib/rules.ts`). L'algorithme respecte cette limite pour la répartition initiale. Si le nombre de pickers est insuffisant (commandes > 3 × pickers), l'application indique le minimum nécessaire.

## Algorithme

Code : `src/lib/distribution/algorithm.ts` (TypeScript pur, sans React ni Prisma).

1. **Répartition initiale** : chaque commande est confiée à un seul picker. Deux heuristiques sont calculées :
   - *best-fit* : charge cible = total ÷ pickers. Les commandes supérieures à la cible restent seules ; les petites sont regroupées sans dépasser la cible.
   - *LPT* : plus grosse commande d'abord, sur le picker le moins chargé.
2. **Simulation avec renforts** : tous les pickers ont la même productivité. Quand un picker a terminé sa file, il rejoint la commande en cours qui a le plus d'articles restants *par préparateur*, tant que chaque participant garde au moins `seuil` articles (5 par défaut, réglable) : c'est ce seuil qui évite la fragmentation inutile.
3. **Choix** : plan au temps de fin estimé le plus court (à un seuil près), puis le moins de renforts, puis la charge initiale maximale la plus faible.

À l'enregistrement, le serveur relit les commandes en base et **recalcule** la distribution : il ne fait pas confiance au résultat envoyé par le navigateur.

Les temps sont exprimés en « articles » (1 picker = 1 article par unité de temps) puis convertis en minutes avec le paramètre *minutes par article* (1 par défaut).

### Exemple du cahier des charges

Commandes 80, 120, 20, 5, 65 avec 4 pickers → pickers `{65+5}`, `{80}`, `{20}`, `{120}` ; à 20 le picker de la commande de 20 articles renforce celui de la commande de 120. Cet exemple est dans `algorithm.test.ts`.

> **Attention** : la somme de cet exemple est **290** articles, pas 300 comme indiqué dans le cahier des charges (80+120+20+5+65). Le test vérifie 290.

## Démarrage en local

Prérequis : Node.js 20+, une base PostgreSQL (locale ou Supabase).

```bash
npm install
cp .env.example .env        # puis renseigner DATABASE_URL, DIRECT_URL, AUTH_SECRET
npm run db:deploy           # applique la migration (prisma migrate deploy)
npm run db:seed             # magasins, comptes et jeu de démonstration
npm run dev                 # http://localhost:3000
```

Comptes de démonstration (mot de passe = `SEED_PASSWORD`, `ChangeMe123!` par défaut — **à changer**) :

- `admin@bringo.local` — Super Admin
- `ops@bringo.local` — Master Opérations E-commerce
- `magasin1@bringo.local`, `magasin2@bringo.local` — Master Magasin

Le seed crée aussi, pour le « Magasin Démo 1 », l'exemple ci-dessus (5 commandes, 4 pickers) sur le créneau 08:00–10:00 du jour.

Pendant le développement : `npm run db:migrate` crée de nouvelles migrations après une modification de `prisma/schema.prisma`.

### Tests

```bash
npm test        # algorithme (exemple du cahier des charges, limite de 3 commandes, cas limites) + lecture du .xlsm
npm run typecheck
```

## Dépannage

- **Erreurs HTTP 500 après une mise à jour** : ouvrez `/api/health`. Si un contrôle est en échec, exécutez `npx prisma generate && npm run db:deploy`, puis redémarrez `npm run dev`. `/api/sync` répond alors 503 (et non 500) et le navigateur réessaie seul.
- **`ArrayBuffer.prototype.detached`** : utilisez Node.js 22 LTS (`.nvmrc`, `engines`) ; les versions plus anciennes ne supportent pas cette API requise par React 19. Après changement de version : supprimez `node_modules` et `.next`, puis `npm install`.
- **`Webpack cache: ENOENT … rename`** (Windows) : en développement le cache est gardé en mémoire (`next.config.mjs`). Évitez de placer le projet dans OneDrive/Dropbox et excluez-le de l'antivirus ; au besoin, supprimez le dossier `.next`.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Connexion de l'application. Supabase : *pooler* en mode Transaction (port 6543) avec `?pgbouncer=true&connection_limit=1`. |
| `DIRECT_URL` | Connexion directe (port 5432) utilisée par Prisma pour les migrations. En local, identique à `DATABASE_URL`. |
| `AUTH_SECRET` | Secret de signature des sessions, 32 caractères minimum (`openssl rand -base64 32`). |
| `ACCOUNT_EMAIL_DOMAIN` | Domaine des e-mails générés pour les comptes magasins (défaut `bringo.local`). |
| `SEED_PASSWORD` | Mot de passe des comptes créés par le seed (optionnel). |

## Base de données

Schéma : `prisma/schema.prisma` · Migrations : `20261102000000_init` puis `20261104000000_xlsm_import` (commandes rattachées au magasin + colonnes brutes).

- `Store`, `User` (rôle + magasin pour le Master Magasin)
- `WorkSlot` : un magasin × une date × un créneau de 2 h ; porte le nombre de pickers
- `Order` : Order Number (unique par magasin) + Number Of Products + toutes les colonnes du fichier (`raw`)
- `Distribution` : instantané de l'historique (commandes et résultat copiés en JSON → l'historique reste lisible si les commandes changent ensuite)

## Déploiement sur Vercel + Supabase

1. **Supabase** : créer un projet, puis copier les deux chaînes de connexion (*Project Settings → Database*) : *Transaction pooler* (6543) pour `DATABASE_URL`, *Session/Direct* (5432) pour `DIRECT_URL`.
2. **Migrer la base** depuis votre poste, avec ces variables dans `.env` :
   ```bash
   npm run db:deploy
   npm run db:seed        # optionnel : crée les comptes de démonstration
   ```
3. **Vercel** : importer le dépôt, framework *Next.js* détecté automatiquement. Ajouter les variables `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` (Production et Preview). Le build lance `prisma generate` puis `next build`.
4. Déployer, se connecter avec un compte seedé, **changer les mots de passe** et renommer les magasins dans *Paramètres*.

Les prochaines migrations se déploient de la même façon : `npm run db:deploy` avant (ou dans) le déploiement.

## Structure

```
prisma/                      schéma, migration, seed
src/lib/distribution/        algorithme + tests (aucune dépendance UI/DB)
src/lib/                     auth (JWT en cookie httpOnly), permissions, créneaux, lecture du .xlsm
src/components/ui/           Button, Card, Input, Table… (style shadcn/ui)
src/components/distribution/ espace de travail (commandes, génération) et vue des résultats
src/app/(app)/[storeId]/     dashboard, distribution, history
src/app/(app)/settings/      magasins et utilisateurs (Super Admin)
```

## Limites connues du MVP

- Pas de gestion de mot de passe oublié ni de modification/suppression d'utilisateurs (création seulement).
- Les renforts rejoignent uniquement une commande déjà en cours : une commande qui n'a pas encore démarré n'est jamais « volée » à la file d'un autre picker (la répartition initiale s'en charge).
- Les composants UI sont écrits à la main dans le style shadcn/ui (le CLI `shadcn` n'est pas requis) ; `components.json` permet d'en ajouter avec `npx shadcn add`.
