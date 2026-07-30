# CLAUDE.md

## Project Overview

A full-stack e-commerce platform built with a microservices architecture, featuring a customer storefront, admin dashboard, and four independent backend services communicating via Kafka.

---

## Tech Stack & Architecture

### Monorepo
- **Package manager**: pnpm 9.0.0 with workspaces
- **Build orchestrator**: Turborepo 2.x

### Frontend Apps (`apps/`)
| App | Port | Framework | Notes |
|-----|------|-----------|-------|
| `client` | 3000 | Next.js + Tailwind CSS | Customer storefront, Stripe checkout, Zustand |
| `admin` | 3001 | Next.js 16 + Tailwind CSS + Shadcn/ui | Admin dashboard, Recharts, TanStack Table |

### Backend Services (`apps/`)
| Service | Port | Framework | Database | Notes |
|---------|------|-----------|----------|-------|
| `product-service` | 8000 | Express 5 | PostgreSQL (Prisma) | Products & categories |
| `order-service` | 8001 | Fastify 5 | MongoDB (Mongoose) | Order management |
| `payment-service` | 8002 | Hono | — | Stripe payments + webhooks |
| `auth-service` | 8003 | NestJS 11 | — | User sync via Clerk |

### Shared Packages (`packages/`)
| Package | Description |
|---------|-------------|
| `@repo/kafka` | KafkaJS client/producer/consumer helpers |
| `@repo/product-db` | Prisma client for PostgreSQL (products DB) |
| `@repo/order-db` | Mongoose models for MongoDB (orders DB) |
| `@repo/types` | Shared TypeScript types across services |
| `@repo/eslint-config` | Shared ESLint configuration |
| `@repo/typescript-config` | Shared tsconfig base files |

### Infrastructure
- **Authentication**: Clerk (used across all apps/services)
- **Messaging**: Apache Kafka (KafkaJS)
- **Payments**: Stripe (webhook tunneling via ngrok in dev)
- **Databases**: PostgreSQL (products), MongoDB (orders)

---

## Development Commands

```bash
# Install dependencies (run from repo root)
pnpm install

# Start all apps and services concurrently
pnpm dev

# Start a specific app or service
pnpm --filter admin dev
pnpm --filter client dev
pnpm --filter product-service dev
pnpm --filter order-service dev
pnpm --filter payment-service dev
pnpm --filter auth-service dev

# Build all
pnpm build

# Type checking (all packages)
pnpm check-types

# Lint all
pnpm lint

# Format all TypeScript/TSX/Markdown files
pnpm format
```

### Database Commands (run from repo root or `packages/product-db`)
```bash
# Generate Prisma client after schema changes
pnpm --filter @repo/product-db db:generate

# Run migrations (development)
pnpm --filter @repo/product-db db:migrate

# Deploy migrations (production)
pnpm --filter @repo/product-db db:deploy

# Reset database (development only)
pnpm --filter @repo/product-db db:reset
```

### Auth-service specific
```bash
pnpm --filter auth-service test
pnpm --filter auth-service test:e2e
```

---

## Development Environment

### Requirements
- **Node.js**: >= 18
- **pnpm**: 9.0.0 (enforced via `packageManager` field)
- **Kafka**: running locally (default broker: `localhost:9092`)
- **PostgreSQL**: running locally (default: `localhost:5432`)
- **MongoDB**: running locally (default: `localhost:27017`)
- **ngrok**: required for Stripe webhook testing in development

### Environment Variables

Each app/service has its own `.env` file. Copy and populate for each:

#### `apps/client/.env`
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/

NEXT_PUBLIC_PRODUCT_SERVICE_URL=http://localhost:8000
NEXT_PUBLIC_ORDER_SERVICE_URL=http://localhost:8001
NEXT_PUBLIC_PAYMENT_SERVICE_URL=http://localhost:8002

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

#### `apps/admin/.env`
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/

NEXT_PUBLIC_PRODUCT_SERVICE_URL=http://localhost:8000
NEXT_PUBLIC_ORDER_SERVICE_URL=http://localhost:8001
NEXT_PUBLIC_PAYMENT_SERVICE_URL=http://localhost:8002
NEXT_PUBLIC_AUTH_SERVICE_URL=http://localhost:8003
```

#### `apps/product-service/.env`
```env
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
DATABASE_URL="postgresql://admin:123456@localhost:5432/products?schema=public"
NODE_ENV="develop"
```

#### `apps/order-service/.env`
```env
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
DATABASE_URL="mongodb://admin:123456@localhost:27017/orders?authSource=admin&authMechanism=SCRAM-SHA-256"
```

#### `apps/payment-service/.env`
```env
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRECT=
```

#### `apps/auth-service/.env`
```env
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
```

#### `packages/product-db/.env`
```env
DATABASE_URL="postgresql://admin:123456@localhost:5432/products?schema=public"
```

#### `packages/order-db/.env`
```env
DATABASE_URL="mongodb://admin:123456@localhost:27017/orders?authSource=admin&authMechanism=SCRAM-SHA-256"
```

---

## Code Style & Conventions

### Formatting (Prettier)
- **Single quotes** for strings
- **No semicolons**
- Run `pnpm format` before committing

### TypeScript
- Strict mode enabled across all packages
- Shared types live in `@repo/types` — add cross-service types there, not in individual services
- Prisma-generated types come from `@repo/product-db/generated/prisma`

### File Structure
- Backend services follow a controller/route/middleware pattern under `src/`
- Frontend apps use Next.js App Router with `app/`, `components/`, `hooks/`, `lib/` directories
- Shared Kafka utilities belong in `@repo/kafka`

### Commit Messages
Follow Conventional Commits (English only):
```
feat(product-service): add category filter endpoint
fix(payment-service): handle stripe webhook signature mismatch
chore(deps): update prisma to v6
```

---

## Notes & Gotchas

- **Turborepo task order**: `dev` depends on `db:generate` — Prisma client is auto-generated before any service starts. After modifying `schema.prisma`, run `db:generate` explicitly if not restarting via turbo.
- **Kafka must be running** before starting any service. All services produce/consume events; they will fail to connect on startup without a running broker.
- **Stripe webhooks in dev**: Use ngrok to expose `payment-service` (port 8002) and register the tunnel URL in the Stripe dashboard. The webhook secret (`STRIPE_WEBHOOK_SECRECT`) must match.
- **MongoDB auth**: The local MongoDB instance requires the `admin` user with password `123456`. Create it before first run or adjust the connection string.
- **Admin uses Turbopack**: `admin` runs with `--turbopack`. If you encounter build compatibility issues, remove the flag temporarily.
- **`.env` files are gitignored**: Never commit `.env` files. Populate them manually from the templates above.
- **Do not push to `main`**: Work on feature branches; `main` is the stable branch.
