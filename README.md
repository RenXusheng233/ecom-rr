# ECOM-RR

A full-stack e-commerce platform built with a microservices architecture. Includes a customer-facing storefront, an admin dashboard, and four independent backend services connected via Kafka.

## Architecture

```
┌─────────────┐     ┌─────────────┐
│   Client    │     │    Admin    │
│  (Next.js)  │     │  (Next.js)  │
│  :3000      │     │  :3001      │
└──────┬──────┘     └──────┬──────┘
       │                   │
       └─────────┬─────────┘
                 │ HTTP
    ┌────────────┼────────────┬────────────┐
    ▼            ▼            ▼            ▼
┌────────┐  ┌────────┐  ┌─────────┐  ┌────────┐
│Product │  │ Order  │  │Payment  │  │  Auth  │
│Service │  │Service │  │Service  │  │Service │
│Express │  │Fastify │  │  Hono   │  │NestJS  │
│:8000   │  │:8001   │  │:8002    │  │:8003   │
└───┬────┘  └───┬────┘  └────┬────┘  └────────┘
    │           │            │
    ▼           ▼            ▼
┌────────┐  ┌────────┐   Stripe
│Postgres│  │MongoDB │   Webhooks
└────────┘  └────────┘
       │         │
       └────┬────┘
            ▼
          Kafka
```

Payment Service also uses a dedicated PostgreSQL database (`PAYMENT_DATABASE_URL`) for the Stripe catalog ledger, Checkout attempts, Stripe Webhook Inbox and Payment Outbox. Order Service keeps MongoDB and requires replica-set mode so Order projection, Inbox completion and acknowledgement Outbox can commit in one transaction. See [migration.md](./migration.md) for the rollout procedure.

## Services

| Service           | Port | Framework                          | Database            | Responsibilities                         |
| ----------------- | ---- | ---------------------------------- | ------------------- | ---------------------------------------- |
| `client`          | 3000 | Next.js + Tailwind CSS             | —                   | Customer storefront, cart, checkout      |
| `admin`           | 3001 | Next.js + Tailwind CSS + Shadcn/ui | —                   | Product/order/user management dashboard  |
| `product-service` | 8000 | Express 5                          | PostgreSQL (Prisma) | Products & categories CRUD               |
| `order-service`   | 8001 | Fastify 5                          | MongoDB (Mongoose)  | Order lifecycle management               |
| `payment-service` | 8002 | Hono                               | PostgreSQL (Prisma) | Stripe payments, catalog sync & webhooks |
| `auth-service`    | 8003 | NestJS 11                          | —                   | User sync & auth events via Clerk        |

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Frontend**: Next.js, Tailwind CSS, Shadcn/ui, Zustand, React Hook Form, Zod
- **Backend**: Express, Fastify, Hono, NestJS
- **Databases**: Product and Payment PostgreSQL (Prisma ORM), MongoDB (Mongoose)
- **Messaging**: Apache Kafka (KafkaJS)
- **Authentication**: Clerk
- **Payments**: Stripe
- **Language**: TypeScript (all packages)

## Prerequisites

- Node.js >= 18
- pnpm 9.0.0
- PostgreSQL
- MongoDB
- Apache Kafka
- [ngrok](https://ngrok.com/) (for Stripe webhook testing in development)

## Getting Started

**1. Install dependencies**

```bash
pnpm install
```

**2. Configure environment variables**

Each app and service has its own `.env` file. Copy the examples below into the corresponding directories and fill in your keys.

> Clerk keys: [clerk.com/dashboard](https://dashboard.clerk.com)
> Stripe keys: [dashboard.stripe.com](https://dashboard.stripe.com)

**3. Initialize the database**

```bash
# Generate Prisma client and run migrations
pnpm --filter @repo/product-db db:migrate
PAYMENT_DATABASE_URL=postgresql://... pnpm --filter @repo/payment-db db:migrate
```

**4. Start all services**

```bash
pnpm dev
```

Or start individual services:

```bash
pnpm --filter client dev
pnpm --filter admin dev
pnpm --filter product-service dev
pnpm --filter order-service dev
pnpm --filter payment-service dev
pnpm --filter auth-service dev
```

## Environment Variables

### `apps/client/.env`

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

### `apps/admin/.env`

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

### `apps/product-service/.env`

```env
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
DATABASE_URL="postgresql://admin:123456@localhost:5432/products?schema=public"
CATALOG_SYNC_ENFORCEMENT=false
```

### `apps/order-service/.env`

```env
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
DATABASE_URL="mongodb://admin:123456@localhost:27017/orders?authSource=admin&replicaSet=rs0"
```

### `apps/payment-service/.env`

```env
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
CLIENT_APP_URL=http://localhost:3000
PAYMENT_RECONCILIATION_INTERVAL_MS=900000
PAYMENT_DATABASE_URL="postgresql://admin:123456@localhost:5432/payments?schema=public"
CATALOG_SYNC_ENFORCEMENT=false
```

### `apps/auth-service/.env`

```env
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
```

## Shared Packages

| Package                   | Description                                        |
| ------------------------- | -------------------------------------------------- |
| `@repo/kafka`             | KafkaJS producer/consumer helpers                  |
| `@repo/product-db`        | Prisma client for the products PostgreSQL database |
| `@repo/payment-db`        | Prisma client for catalog sync/payment PostgreSQL  |
| `@repo/order-db`          | Mongoose models for the orders MongoDB database    |
| `@repo/types`             | Shared TypeScript types across all services        |
| `@repo/eslint-config`     | Shared ESLint configuration                        |
| `@repo/typescript-config` | Shared tsconfig base files                         |

## Common Commands

```bash
PAYMENT_DATABASE_URL=postgresql://... pnpm build # Build all apps and services
pnpm lint           # Lint all packages
pnpm check-types    # Type-check all packages
pnpm format         # Format all .ts/.tsx/.md files with Prettier

# Database
pnpm --filter @repo/product-db db:generate   # Regenerate Prisma client
pnpm --filter @repo/product-db db:migrate    # Run dev migrations
pnpm --filter @repo/product-db db:deploy     # Deploy migrations to production
pnpm --filter @repo/payment-db db:generate   # Generate payment Prisma client
pnpm --filter @repo/payment-db db:deploy     # Deploy payment DB migrations
pnpm test:catalog-sync                       # Catalog reliability tests
pnpm test:payment-order                      # End-to-end reliability unit tests
```

## Reliable Product Catalog Sync

Product PostgreSQL is the catalog source of truth. Product create/update/delete writes the Product state and an Outbox event in one transaction. Payment Service consumes keyed, versioned events into an Inbox/Stripe ledger, performs retryable idempotent Stripe operations in a worker, publishes versioned results through a second Outbox, and reconciles drift every 15 minutes.

Checkout uses only a Stripe Price ID confirmed in the payment database. A stable client idempotency key maps to one `CheckoutAttempt` and one Stripe Checkout Session.

Stripe Webhooks are verified and persisted by `event.id` before returning 200. A leased worker applies a non-regressing payment/refund/dispute state machine and writes the versioned `payment.order.lifecycle` event to Payment Outbox in the same PostgreSQL transaction. Order Service stores the event in Mongo Inbox, applies the full snapshot and writes `order.payment.applied` in one MongoDB transaction. Payment consumes that acknowledgement with an event-ID Inbox and version fence. Both directions are at-least-once and idempotent; periodic reconciliation repairs missing Stripe state or Order acknowledgements.

Inventory reservation, fulfillment, active refund commands, retry topics/DLQ and production observability remain later stages; see [TODO.md](./TODO.md).
