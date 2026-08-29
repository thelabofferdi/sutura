# Sutura

Sutura est un atelier de décision pour créateurs de mode : création de collections, tests publics par lien, collecte de réponses, analytics et recommandations IA.

## Architecture actuelle

La trajectoire active est **Next.js + Convex** :

- `apps/web/` — application web Next.js App Router ;
- `apps/web/convex/` — schéma, queries, mutations et actions Convex ;
- `apps/web/convex/auth.ts` — authentification Convex Auth ;
- Imole — provider IA optionnel appelé depuis une action Convex ;
- stockage Convex — médias des modèles et URLs signées.

Le questionnaire public reste accessible sans compte. Les opérations créateur, analytics et recommandations sont protégées par authentification et ownership Convex.

`apps/api/` (NestJS/PostgreSQL) est conservé temporairement comme **backend historique de référence**. Il ne constitue plus le chemin d’exécution du frontend actif et ne doit pas recevoir de nouvelles fonctionnalités sans décision d’architecture explicite.

## Démarrer le frontend Convex

Pré-requis : Node.js 22+ et un déploiement Convex de développement.

```bash
cd apps/web
npm install
cp .env.example .env.local
npm run dev
```

`npx convex dev` renseigne automatiquement les variables de déploiement nécessaires dans `.env.local`. Ne jamais committer de clé Convex, de token Imole ou de fichier `.env.local`.

Commandes utiles :

```bash
cd apps/web
npm run dev:web          # Next.js seul, si Convex est déjà lancé
npm run typecheck
npm run lint
npm run test:validation
npm run build
npm run convex:codegen
npm run convex:deploy
```

## Flux produit

1. Le créateur s’inscrit et complète son profil.
2. Il crée une collection et ses modèles.
3. Il compose un fashion test et ses questions.
4. Il publie un lien `/s/:slug`.
5. Les répondants répondent sans compte.
6. Le créateur consulte les analytics et peut générer des recommandations IA.

Les soumissions publiques sont validées côté Convex : idempotence, questions connues, types de réponses, options, classements, bornes numériques et profil répondant.

## Structure principale

```text
apps/web/
├── app/                 # routes et écrans Next.js
├── components/          # composants d’interface
├── convex/
│   ├── schema.ts        # modèle de données Convex
│   ├── auth.ts          # Convex Auth
│   ├── validation.ts    # validations métier partagées
│   └── _generated/      # bindings générés et versionnés
└── tests/               # tests ciblés
```

## Configuration

Variables principales :

- `NEXT_PUBLIC_CONVEX_URL` — URL Convex utilisée par le navigateur (Vercel) ;
- `CONVEX_DEPLOYMENT` — déploiement local/dev, renseigné par la CLI ;
- `CONVEX_SITE_URL` — URL du site utilisée par Convex Auth (doit matcher le domaine déployé) ;
- `ADMIN_EMAILS` — allowlist admin pour `/admin` (Convex env, fail-closed) ;
- `AI_KEYS_ENCRYPTION_SECRET` — secret AES-GCM des clés IA (Convex env uniquement, jamais Git) ;
- `IMOLE_API_KEY`, `IMOLE_BASE_URL`, `IMOLE_MODEL` — fallback env optionnel ; le flux normal passe par DB chiffrée ;
- `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — anti-bot public (optionnel, vérif côté Convex si défini) ;
- `RESEND_API_KEY`, `RESEND_FROM` — reset mot de passe (Phase 7, non bloquant avant).

Les secrets Convex (`ADMIN_EMAILS`, `AI_KEYS_ENCRYPTION_SECRET`, `TURNSTILE_SECRET_KEY`, `RESEND_*`) se configurent via `npx convex env set` — jamais dans Git ni dans Vercel. Seul `NEXT_PUBLIC_CONVEX_URL` va côté Vercel.

## État du produit

Le socle Convex est déployé et couvre les flux de base. Les prochains lots portent sur l’édition et le réordonnancement, les réglages avancés des tests, la protection anti-abus publique, les uploads et le durcissement de l’intégration IA.

## Documentation

- `AGENTS.md` — règles de contribution actuelles ;
- `HANDOFF.md` — état architectural et passation ;
- `BACKLOG.md` — backlog de transition et éléments historiques ;
- `docs/` — audits et plans historiques, conservés comme contexte ;
- `design/` — direction visuelle et assets.

## Règles GitHub

- Ne jamais committer de secrets ou de données de production ;
- garder le frontend et les fonctions Convex cohérents dans une même PR ;
- valider typecheck, lint, tests ciblés et build avant fusion ;
- vérifier l’ownership de chaque query/mutation privée ;
- conserver les routes publiques du questionnaire sans authentification.
