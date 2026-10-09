# Faïença Studio

Espace privé en français : calendrier éditorial, projets, stratégie et résultats manuels. Next.js, TypeScript, Convex et Convex Auth. Deux rôles : **admin** (tout l’atelier) et **cliente** (espace brodeuses : suivi des kits, vidéos des points, questions-réponses). Les clientes créent leur compte avec e-mail et mot de passe ; le compte atelier historique se connecte toujours avec `STUDIO_PASSWORD` via le lien « Accès atelier ». Chaque fonction serveur vérifie le rôle.

## Prise en main

1. Se connecter avec le mot de passe de l’atelier. À la première connexion, l’application charge 42 contenus de septembre à décembre 2026, huit projets et douze fiches stratégiques.
2. Dans **Calendrier**, ouvrir une fiche pour modifier ses champs. Déplacer sa date dans le formulaire (mobile) ou la faire glisser vers un autre jour (ordinateur). La duplication prépare un nouveau brouillon avec résultats vides.
3. Dans **Projets**, ouvrir une carte pour changer son statut, sa priorité, sa date et ses tâches. Les contenus se rattachent au projet depuis leurs fiches.
4. Dans **Stratégie**, marquer les propositions Hypothèse, À tester ou Validé avec les preuves correspondantes. Les produits vedettes, promotions, témoignages et dates limites sont à confirmer.
5. Dans **Résultats**, renseigner les mesures manuellement. Une case vide signifie « inconnu » ; saisir 0 signifie « mesuré à zéro ».
6. Exporter le calendrier avec **CSV**, ou tout l’espace avec **Sauvegarde JSON**. Sur téléphone, la sauvegarde et la déconnexion figurent au bas de la page.

Attendre « Enregistré dans votre atelier » avant de fermer une fiche. Une erreur conserve le formulaire. Si une autre session a modifié la même fiche, copier son brouillon avant de rouvrir la fiche récente et fusionner les changements. La suppression demande confirmation ; supprimer un projet conserve ses publications.

## Développement

Node.js 22 ou 24, puis `npm ci`, `npx convex dev`, `npm run dev`. Le projet Convex doit être **faienca-studio** dans l’équipe **emilie-bernard**. Ne pas sélectionner une autre application.

- Développement : `https://vivid-boar-705.convex.cloud`
- Production : `https://ardent-jellyfish-354.convex.cloud`
- Console : https://dashboard.convex.dev/t/emilie-bernard/faienca-studio

Interface : composants [shadcn/ui](https://ui.shadcn.com) dans `components/ui` (Tailwind CSS v4, thème aux couleurs Faïença dans `app/ui.css`). L’ancien CSS (`app/globals.css`) est chargé dans le layer `legacy`, sous les utilitaires Tailwind : un composant shadcn garde toujours son style. Ajouter un composant avec `npx shadcn@latest add <nom>` puis vérifier que ses imports pointent vers `@/lib/utils`. Sous 1024 px (768 px dans l’espace cliente), la barre latérale laisse place à un menu tiroir (`components/app-nav.tsx`).

L’environnement local `.env.local` est ignoré par Git. `NEXT_PUBLIC_CONVEX_URL` est une URL publique de service, jamais une clé. La configuration Vercel cible le déploiement Convex de production.

## Mot de passe de l’atelier

Définir `STUDIO_PASSWORD` dans les variables Convex de **développement** et de **production** (dashboard ou `npx convex env set STUDIO_PASSWORD -- …`). Ne jamais l’écrire dans le dépôt ni dans une conversation.

- `OWNER_GITHUB_ID=56219642`, `JWT_PRIVATE_KEY` et `JWKS` sont configurés sur les deux déploiements.
- `SITE_URL` vaut `http://localhost:3100` en développement et l’adresse Vercel en production.

Le script `scripts/setup-auth-keys.mjs` génère les clés initiales directement dans Convex ; **ne pas le réexécuter sur un déploiement déjà utilisé**, car cela révoquerait les sessions. L’option `--prod` cible la production.

Documentation officielle : https://labs.convex.dev/auth/config/passwords et https://labs.convex.dev/auth/setup/manual.

## Publication

Créer le dépôt GitHub privé `Emilie-Bernard/faienca-studio`, y envoyer ce dossier, puis relier un projet Vercel dédié au dépôt. Framework Next.js, commande de build `npm run build`. Mettre `STUDIO_PASSWORD` uniquement dans Convex. Les changements frontend déclenchent un déploiement Vercel via Git ; pour une modification des fonctions ou du schéma Convex, lancer aussi `npx convex deploy` depuis ce projet.

Les données initiales sont dans `convex/seed.json`. La mutation d’initialisation utilise un marqueur transactionnel de version. Les déploiements et connexions suivants ne réimportent ni n’écrasent les contenus, même après leur suppression volontaire. Les colonnes de la ligne du 24 décembre ont été corrigées ; chaque publication conserve aussi sa ligne d’origine pour contrôle.

## Vérifications

`npm run typecheck`, `npm test`, `npm run build`, `npm audit`.

Les tests Convex vérifient le refus des accès anonymes, le refus d’un autre compte, l’absence de propriétaire configurée, l’import unique, les 42 publications, les références de projets, la création/modification/déplacement/duplication/suppression, les conflits entre sessions, les tâches, les dates impossibles, les liens dangereux et la différence entre vide et zéro dans l’export.

À valider après connexion réelle : mot de passe d’atelier, CRUD depuis le navigateur, rechargement, deux onglets synchronisés, rendu ordinateur/téléphone et exports sur l’adresse Vercel. Les tests automatisés ne remplaceront pas ces contrôles réels.

La première version n’envoie aucune publication sur les réseaux et ne récupère aucune statistique automatiquement. La sauvegarde JSON est un export complet des données métier ; elle ne contient pas les sessions ou secrets de connexion et n’offre pas encore de restauration par bouton.

## Espace brodeuses (rôle cliente)

- **Créer un compte** sur la page d’accueil (prénom, e-mail, mot de passe de 8 caractères minimum). Tout nouveau compte est **cliente** ; le rôle n’est jamais lu depuis le formulaire.
- **Ajouter un kit** : la cliente choisit un kit publié et saisit son code d’activation (casse, espaces et tirets ignorés). Sans code défini, l’accès est libre.
- **Suivi** : une vidéo par leçon, case « J’ai brodé ce point », pourcentage, date de fin, points appris et notes personnelles.
- **Questions et réponses** par kit ou par leçon. Une question reste privée jusqu’à la réponse, puis la réponse est visible par toutes les clientes du kit. Dix questions en attente maximum par cliente.

Côté atelier (admin), trois vues s’ajoutent au menu :

- **Kits** : titre, description, couverture, code d’activation, publication, leçons (point brodé, vidéo, conseils). Vidéo par lien YouTube (non répertorié conseillé), Vimeo, fichier `.mp4` en https, ou fichier téléversé dans Convex. Décocher « Publié » masque le kit sans effacer les progressions ; supprimer efface progressions, questions et vidéos téléversées.
- **Questions** : questions en attente, réponse ou modification, suppression.
- **Clientes** : liste des comptes et changement de rôle. Le compte atelier reste toujours admin et personne ne peut modifier son propre rôle. Pour utiliser un compte e-mail comme admin, le créer puis le promouvoir depuis le compte atelier.

**Mot de passe oublié** : depuis l’écran de connexion, la cliente reçoit par e-mail un code à 8 chiffres (valable 15 minutes) envoyé via Resend, puis choisit un nouveau mot de passe. Variables Convex (développement et production) :

- `AUTH_RESEND_KEY` : clé API Resend (`npx convex env set AUTH_RESEND_KEY -- …`, ne jamais l’écrire dans le dépôt).
- `AUTH_EMAIL_FROM` : expéditeur, par exemple `Faïença <bonjour@faienca.fr>`. Le domaine doit être vérifié dans Resend ; sans cette variable, l’adresse de test `onboarding@resend.dev` n’envoie qu’à l’adresse du compte Resend.

L’adresse e-mail n’est pas vérifiée à l’inscription.

## Newsletter et Klaviyo

Le formulaire public est sur `/newsletter`. Les inscriptions sont enregistrées dans Convex et transmises à Klaviyo (liste + consentement marketing). Depuis le Studio, vous pouvez **synchroniser** une newsletter ou un scénario vers Klaviyo en **brouillon** (icône envoi dans l’éditeur), puis relire et programmer l’envoi dans Klaviyo.

### Configuration Klaviyo (une fois)

1. Créer un compte Klaviyo et une liste **Newsletter** (double opt-in recommandé).
2. Créer une **Private API Key** avec les scopes :
   - Inscriptions : `profiles:write`, `lists:write`, `subscriptions:write`
   - Sync Studio : `templates:write`, `campaigns:write`, `flows:read`, `flows:write`
3. Noter l’ID de la liste et la clé API.

### Variables d’environnement

**Convex** (développement et production) :

- `NEWSLETTER_INGEST_SECRET` — secret partagé pour l’écriture des abonnés depuis l’API Next.js (`npx convex env set NEWSLETTER_INGEST_SECRET -- …`).
- `KLAVIYO_PRIVATE_API_KEY`, `KLAVIYO_NEWSLETTER_LIST_ID` — sync Studio → Klaviyo (campagnes + flows).
- `KLAVIYO_REVISION=2026-01-15` (optionnel)
- `KLAVIYO_FROM_EMAIL`, `KLAVIYO_FROM_LABEL`, `KLAVIYO_REPLY_TO_EMAIL` (optionnel, expéditeur des e-mails)

**Vercel / `.env.local`** (même secret + clés Klaviyo pour `/newsletter`) :

- `NEXT_PUBLIC_CONVEX_URL`
- `NEWSLETTER_INGEST_SECRET` (identique à Convex)
- `KLAVIYO_PRIVATE_API_KEY`
- `KLAVIYO_NEWSLETTER_LIST_ID`
- `KLAVIYO_REVISION=2026-01-15` (optionnel)

### Sync depuis le Studio

- **Newsletter ponctuelle** : crée ou met à jour un template HTML + une campagne brouillon sur la liste Newsletter.
- **Scénario (welcome series)** : crée ou met à jour un **Flow Klaviyo complet** (e-mails J+0, J+2… avec délais). Un flow par scénario, déclenché à l’inscription à la liste.
- Si vous changez le nombre d’e-mails ou les délais, un **nouveau flow brouillon** est créé (l’ancien reste dans Klaviyo).
- **Images** : le HTML envoyé contient des URLs (`https://…`). Klaviyo ne stocke pas automatiquement les fichiers ; hébergez les visuels sur votre site/CDN ou uploadez-les dans la bibliothèque Klaviyo.

Dans le Studio, la vue **Newsletter** liste les abonnés enregistrés.

Documentation Klaviyo : https://developers.klaviyo.com/en/v2026-01-15/reference/bulk_subscribe_profiles
