# Payment service

This service owns the payment PostgreSQL catalog ledger and the asynchronous
Stripe catalog worker. Product PostgreSQL remains the catalog source of truth.

The catalog sync worker requires these environment variables:

```dotenv
PAYMENT_DATABASE_URL=postgresql://user:password@localhost:5432/ecom_payment
STRIPE_SECRET_KEY=sk_test_...
CATALOG_SYNC_ENFORCEMENT=false
```

Create the payment database schema before starting the service:

```bash
PAYMENT_DATABASE_URL=... pnpm --filter @repo/payment-db db:deploy
PAYMENT_DATABASE_URL=... pnpm --filter @repo/payment-db db:generate
pnpm --filter payment-service dev
```

Catalog reconciliation runs every 15 minutes. Admins can also use
`POST /catalog-sync/reconcile`, inspect `GET /catalog-sync/summary`, and retry
a failed item with `POST /catalog-sync/:productId/retry`.

Keep enforcement disabled while the existing catalog is being backfilled. In
this phase Checkout resolves the legacy Stripe default Price on the server when
the payment ledger is not ready. After backfill and reconciliation reach zero
pending, failed, and drifted items, set the flag to `true`; Checkout then accepts
only the version-confirmed Price stored in the payment database.

The Stripe Webhook to Order Service path is not covered by this catalog
reliability boundary yet. Its follow-up work is tracked in the repository
`TODO.md`. For a staged database and application rollout, follow
[`migration.md`](../../migration.md).
