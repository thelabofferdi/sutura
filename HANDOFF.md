# Sutura — dossier de passation

Mise à jour : 29 août 2026 — Phase 1-6 + Turnstile backend déployés sur `handsome-leopard-992`
Branche de développement : `genspark_ai_developer`

## Décision d’architecture

La vision active de Sutura est un produit web créateur **Next.js + Convex**.

- frontend et routes : `apps/web/app` ;
- composants UI : `apps/web/components` ;
- backend applicatif : `apps/web/convex` ;
- auth : `@convex-dev/auth` ;
- données et stockage : Convex ;
- recommandations : action Convex vers Imole, avec fallback local.

Le questionnaire public est accessible sans compte via `/s/:slug`. Les espaces créateur, analytics et recommandations exigent une identité authentifiée et des contrôles d’ownership.

## État livré

Le socle Convex est déployé sur `handsome-leopard-992` (`https://handsome-leopard-992.convex.cloud`) et couvre :

- profils créateur, collections, modèles, tests, questions, publication, `/s/:slug`, idempotence, analytics ;
- pipeline admin `/admin` : clés chiffrées AES-GCM v1, audit, allowlist `ADMIN_EMAILS`, nav conditionnelle ;
- recommandations : agrégation type-aware k=3, seuil externe 5, allowlist host `api.imole.app`, retry filtré, `redirect:error`, rate-limit 10/min 60/h + lock 30s, cache fingerprint `inputHash+configHash`, fallback local ;
- génération questions : `questionGeneration.preview` (Imole → fallback local) + prévisualisation UI avant insertion ;
- anti-abus : `publicSubmissionLimits` + `cleanupExpiredLimits` (cron horaire) + vérif Turnstile si `TURNSTILE_SECRET_KEY` défini.

Restant avant production : reset mot de passe Convex Auth (attend clés Resend), widget Turnstile frontend complet, tests Convex/E2E ciblés et runbook prod.

Les validations publiques sont centralisées dans `apps/web/convex/validation.ts` et testées par `apps/web/tests/validation.test.ts`.

Vérifications réalisées :

```bash
cd apps/web
npm run typecheck
npm run lint
npm run test:validation
npm run build
```

Des tests d’intégration Convex ont également vérifié une query publique, le rejet d’une question inconnue, une soumission valide et le rejeu idempotent.

## Configuration locale

```bash
cd apps/web
npm install
cp .env.example .env.local
npm run dev
```

Pour un déploiement Convex, fournir `CONVEX_DEPLOY_KEY` uniquement via l’environnement du shell ou le gestionnaire de secrets. Ne jamais le sauvegarder dans Git.

## Règles métier importantes

- Les routes publiques ne demandent pas d’authentification.
- Chaque query/mutation privée appelle `requireUserId` et vérifie l’ownership.
- Un test ne peut être publié sans modèle ni question valide.
- Les réponses publiques sont validées côté serveur Convex.
- Les profils répondants et réponses brutes ne doivent pas être transmis à Imole.
- Les fichiers `convex/_generated/` sont produits par la CLI et versionnés, mais ne doivent pas être édités à la main.

## Prochain cycle

Priorité recommandée :

1. Réglages éditables des tests.
2. Édition et réordonnancement des questions et modèles.
3. Questionnaire public visuel avec vrai classement et randomisation effective.
4. Validation des uploads et nettoyage des médias orphelins.
5. Rate limiting et protection anti-abus public.
6. Agrégation et anonymisation du payload IA, timeout/retry et validation de sortie.
7. Analytics avancées et rapport frontend.
8. Tests Playwright mobile/desktop et préparation production.

## Backend historique

`apps/api/` (NestJS/PostgreSQL), `infra/` et les anciennes spécifications restent dans le dépôt pour référence et transition. Ils ne sont plus le chemin d’exécution du frontend actuel.

- ne pas y ajouter de nouvelles fonctionnalités sans décision explicite ;
- ne pas supprimer immédiatement ces répertoires : ils contiennent des contrats et une logique métier historiques utiles à la migration ;
- marquer toute documentation ancienne comme historique plutôt que de la présenter comme l’architecture active.

## Documents historiques

Les audits et plans dans `docs/` décrivent des états antérieurs, souvent basés sur NestJS/PostgreSQL. Ils sont conservés pour la traçabilité, mais doivent être lus avec leur date et leur périmètre.
