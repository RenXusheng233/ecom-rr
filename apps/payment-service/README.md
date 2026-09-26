# Payment Service

Payment Service owns the dedicated Payment PostgreSQL database and two reliable boundaries:

1. Product catalog → Stripe Product/Price synchronization.
2. Stripe Checkout/Webhook → versioned Payment state → Order lifecycle events.

## Runtime responsibilities

- Checkout validates cart options against the synchronized catalog ledger and ignores client price/name fields.
- `(userId, Idempotency-Key)` identifies one `CheckoutAttempt`; Stripe receives `checkout-session:{attemptId}:v1`.
- Saved Checkout Sessions are checked with Stripe before reuse. Confirmed expiration returns HTTP 409 / `CHECKOUT_SESSION_EXPIRED`; the client renews its request key and retries once. Ambiguous failures retain the original key, and completed Sessions never trigger automatic renewal.
- The Webhook HTTP route verifies the Stripe signature, persists `event.id`, and returns only after Inbox durability.
- A leased worker applies payment/refund/dispute transitions and writes Payment Outbox in the same Prisma transaction.
- Generic Outbox publishing uses the stored topic/key/envelope metadata.
- `order.payment.applied` acknowledgements are deduplicated and fenced by aggregate version.
- Reconciliation repairs missed Stripe state, missing lifecycle publication and missing Order acknowledgements.
- Catalog reconciliation compares the confirmed Price ID as well as amount/name/version. Orphan archiving rechecks the live ledger before each Stripe mutation and fences/requeues synchronization if a ledger entry appears during an archive.

## Reliability rules and limits

> Update · 2026-09-26: This summarizes the implemented behavior, not a record that every failure scenario has been tested.

### State and projection

Payment, refund and dispute status are independent dimensions:

| Dimension | States                                                                         |
| --------- | ------------------------------------------------------------------------------ |
| Payment   | `CREATING`, `OPEN`, `PROCESSING`, `SUCCEEDED`, `FAILED`, `CANCELED`, `EXPIRED` |
| Refund    | `NONE`, `PARTIAL`, `FULL`                                                      |
| Dispute   | `NONE`, `OPEN`, `WON`, `LOST`                                                  |

- `checkout.session.completed` means `SUCCEEDED` only when paid; otherwise it means `PROCESSING`. Old failure, cancellation or expiration events cannot regress a successful payment.
- Refund updates use the authoritative refunded amount, not an increment per event. The current reducer accepts increases only; failed/canceled refund handling and amount corrections remain unfinished. Refund and dispute updates preserve each other's status.
- State or order-visible snapshot changes increment `CheckoutAttempt.version` and write a full lifecycle snapshot to Payment Outbox in the same transaction. Repeated unchanged snapshots do not publish another lifecycle event.
- Order applies only newer snapshots. A first non-successful payment does not create an Order, but still produces an acknowledgement; replaying an already-applied version also produces an acknowledgement so Payment can recover a missing Ack.

See [the state reducer](src/utils/paymentState.ts), [Webhook projection](src/utils/stripeWebhookWorker.ts), [event contracts](../../packages/types/src/payment-order.ts) and [Order worker](../order-service/src/utils/orderWorker.ts) for the exact rules.

### Retry and recovery

- Catalog, Webhook and Order business workers use claim tokens, five-minute leases and 30-second heartbeats. Retried failures use exponential backoff starting at a five-second base, capped at a 30-minute base, plus up to 20% jitter; eight recorded failures exhaust automatic processing. Failed tasks require investigation and an appropriate admin retry or reconciliation.
- Catalog and Webhook error classification can stop processing immediately for non-retryable errors. Order's consumer stores malformed messages separately; Order worker failures follow its bounded retry policy rather than sharing the Stripe error classifier.
- Outbox publication is different: it continues retrying rather than discarding an event after eight failures. Payment Outbox uses a one-second backoff base capped at five minutes, plus up to one second of jitter. The same event ID is retained across publish retries, including when Kafka succeeds but the database confirmation fails.
- Reusing an unconfirmed Checkout creation uses the original Stripe idempotency key. There is no complete recovery protocol beyond Stripe's response-retention boundary; a confirmed expired Session and an unknown creation result must not be treated as the same case. See [remaining work](../../TODO.md).

### Retention

- Payment reconciliation deletes Webhook Inbox records in `PROCESSED` or `IGNORED` once `processedAt` is older than 30 days, in batches of up to 500 per run. Pending, processing and failed records are not included in that cleanup.
- After cleanup, the same Stripe event ID can be received again. Event-ID deduplication is therefore not permanent; state, snapshot and version checks remain necessary.
- Order's malformed-message store uses a separate 30-day TTL. This is not a blanket 30-day deletion policy for Checkout attempts, Orders or all Inbox/Outbox records.

See [payment reconciliation](src/utils/paymentReconciliation.ts) for the cleanup implementation. Never log raw Webhook payloads, client secrets, authorization tokens or customer contact/address data.

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
pnpm --filter payment-service exec tsx --test ../../apps/client/src/lib/checkoutSession.test.ts ../../apps/client/src/types.test.ts
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
