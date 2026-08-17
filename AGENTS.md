# Repository Guidelines

## Project Structure & Module Organization

This is a pnpm 9 monorepo managed with Turborepo. Application code lives in `apps/`: `client` is the customer storefront, `admin` is the dashboard, and the remaining directories are the `product-service`, `order-service`, `payment-service`, and `auth-service` backends. Reusable code lives in `packages/`, including shared types, Kafka helpers, database clients, ESLint rules, and TypeScript configs. Frontend apps use the Next.js App Router and keep assets in `public/`; backend source under `src/` uses routes, controllers, modules, middleware, and utilities as appropriate.

## Build, Test, and Development Commands

Run these from the repository root:

```bash
pnpm install          # Install workspace dependencies
pnpm dev              # Start all apps and services
pnpm build            # Build every workspace package
pnpm lint             # Run ESLint across the monorepo
pnpm check-types      # Type-check all packages
pnpm format           # Format TypeScript, TSX, and Markdown with Prettier
```

Use `pnpm --filter <workspace> dev` to run one app or service. Turborepo generates the Prisma client during the dev pipeline; after schema changes, run `pnpm --filter @repo/product-db db:generate`, then use `db:migrate` for development migrations. Kafka must be running before services start. Local development also requires PostgreSQL, MongoDB, ngrok for Stripe webhooks, and configured per-app `.env` files; never commit secrets.

## Coding Style & Naming Conventions

Use TypeScript with strict typing, single quotes, no semicolons, and Prettier formatting. Use `camelCase` for variables/functions, `PascalCase` for React components, classes, and types, and descriptive kebab-case route or directory names where consistent with the existing app. Put cross-service types in `packages/types` and shared messaging logic in `packages/kafka`. Run `pnpm format`, `pnpm lint`, and `pnpm check-types` before submitting changes.

## Testing Guidelines

Jest scripts are currently defined only for `auth-service`:

```bash
pnpm --filter auth-service test
pnpm --filter auth-service test:e2e
pnpm --filter auth-service test:cov
```

Add tests using clear `*.spec.ts` or `*.test.ts` names, following the service’s established layout. No repository-wide coverage threshold is currently enforced.

## Commit & Pull Request Guidelines

Use English Conventional Commits, for example `feat(product-service): add category filter endpoint` or `fix(payment-service): validate webhook signature`. Keep commits focused and work on feature branches; do not push directly to `main`. Pull requests should explain the behavior change, identify affected apps/packages, list validation commands, link relevant issues, and include screenshots or recordings for UI changes. Call out migrations, new environment variables, and deployment-sensitive changes explicitly.
