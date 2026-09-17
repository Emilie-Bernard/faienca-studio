# Faïença Studio

Espace privé en français : calendrier éditorial, projets, stratégie et résultats manuels. Next.js, TypeScript, Convex et Convex Auth (GitHub). L’accès est réservé à l’identifiant GitHub numérique de la propriétaire, vérifié à la connexion et dans chaque fonction serveur.

## Prise en main

1. Se connecter avec GitHub **Emilie-Bernard**. À la première connexion, l’application charge 42 contenus de septembre à décembre 2026, huit projets et douze fiches stratégiques.
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

L’environnement local `.env.local` est ignoré par Git. `NEXT_PUBLIC_CONVEX_URL` est une URL publique de service, jamais une clé. La configuration Vercel cible le déploiement Convex de production.

## Connexion GitHub à terminer

Créer une OAuth App GitHub dédiée à Faïença Studio dans le compte propriétaire :

- Homepage URL : l’adresse Vercel définitive de cette application.
- Authorization callback URL : `https://ardent-jellyfish-354.convex.site/api/auth/callback/github`.
- Dans les variables Convex **production**, définir `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` et `SITE_URL` (adresse Vercel).
- `OWNER_GITHUB_ID=56219642`, `JWT_PRIVATE_KEY` et `JWKS` sont configurés sur les deux déploiements.
- Pour le développement, utiliser une OAuth App distincte avec callback `https://vivid-boar-705.convex.site/api/auth/callback/github` et `SITE_URL=http://localhost:3100`.

Ne jamais écrire les secrets dans le dépôt ni dans une conversation. Le script `scripts/setup-auth-keys.mjs` génère les clés initiales directement dans Convex ; **ne pas le réexécuter sur un déploiement déjà utilisé**, car cela révoquerait les sessions. L’option `--prod` cible la production.

Documentation officielle : https://labs.convex.dev/auth/config/oauth et https://labs.convex.dev/auth/setup/manual.

## Publication

Créer le dépôt GitHub privé `Emilie-Bernard/faienca-studio`, y envoyer ce dossier, puis relier un projet Vercel dédié au dépôt. Framework Next.js, commande de build `npm run build`. Mettre les identifiants OAuth uniquement dans Convex. Les changements frontend déclenchent un déploiement Vercel via Git ; pour une modification des fonctions ou du schéma Convex, lancer aussi `npx convex deploy` depuis ce projet.

Les données initiales sont dans `convex/seed.json`. La mutation d’initialisation utilise un marqueur transactionnel de version. Les déploiements et connexions suivants ne réimportent ni n’écrasent les contenus, même après leur suppression volontaire. Les colonnes de la ligne du 24 décembre ont été corrigées ; chaque publication conserve aussi sa ligne d’origine pour contrôle.

## Vérifications

`npm run typecheck`, `npm test`, `npm run build`, `npm audit`.

Les tests Convex vérifient le refus des accès anonymes, le refus d’un autre compte, l’absence de propriétaire configurée, l’import unique, les 42 publications, les références de projets, la création/modification/déplacement/duplication/suppression, les conflits entre sessions, les tâches, les dates impossibles, les liens dangereux et la différence entre vide et zéro dans l’export.

À valider après connexion réelle : parcours OAuth GitHub, CRUD depuis le navigateur, rechargement, deux onglets synchronisés, rendu ordinateur/téléphone et exports sur l’adresse Vercel. Les tests automatisés ne remplacent pas ces contrôles réels.

La première version n’envoie aucune publication sur les réseaux et ne récupère aucune statistique automatiquement. La sauvegarde JSON est un export complet des données métier ; elle ne contient pas les sessions ou secrets de connexion et n’offre pas encore de restauration par bouton.
