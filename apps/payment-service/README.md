# Payment Service

Payment Service owns the dedicated Payment PostgreSQL database and two reliable boundaries:

1. Product catalog → Stripe Product/Price synchronization.
2. Stripe Checkout/Webhook → versioned Payment state → Order lifecycle events.

## Runtime responsibilities

- Checkout validates cart options against the synchronized catalog ledger and ignores client price/name fields.
- `(userId, Idempotency-Key)` identifies one `CheckoutAttempt`; Stripe receives `checkout-session:{attemptId}:v1`.
- The Webhook HTTP route verifies the Stripe signature, persists `event.id`, and returns only after Inbox durability.
- A leased worker applies payment/refund/dispute transitions and writes Payment Outbox in the same Prisma transaction.
- Generic Outbox publishing uses the stored topic/key/envelope metadata.
- `order.payment.applied` acknowledgements are deduplicated and fenced by aggregate version.
- Reconciliation repairs missed Stripe state, missing lifecycle publication and missing Order acknowledgements.

## Required environment

```dotenv
PAYMENT_DATABASE_URL=postgresql://user:password@localhost:5432/ecom_payment
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
CLIENT_APP_URL=http://localhost:3000
PAYMENT_RECONCILIATION_INTERVAL_MS=900000
CATALOG_SYNC_ENFORCEMENT=false
```

## Setup and verification

```bash
PAYMENT_DATABASE_URL=... pnpm --filter @repo/payment-db db:deploy
PAYMENT_DATABASE_URL=... pnpm --filter @repo/payment-db db:generate
pnpm --filter payment-service test
pnpm --filter payment-service check-types
pnpm --filter payment-service dev
```

Admin endpoints:

```text
GET  /catalog-sync/summary
POST /catalog-sync/reconcile
GET  /payment-order-sync/summary
GET  /payment-order-sync/:orderId
POST /payment-order-sync/:orderId/retry
POST /payment-order-sync/reconcile
```

The delivery guarantee is durable at-least-once plus idempotency and reconciliation, not distributed exactly-once. See [`migration.md`](../../migration.md) for Mongo replica-set, Kafka topic and staged rollout steps.
