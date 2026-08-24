# Product service

Catalog writes and Stripe synchronization requests are committed together in
PostgreSQL. During the staged rollout, append this variable to the service
environment:

```dotenv
CATALOG_SYNC_ENFORCEMENT=false
```

After deploying the database migration and both catalog workers, enqueue the
existing products exactly once with:

```bash
pnpm --filter product-service catalog-sync:backfill
```

When the payment-service sync summary has no pending or failed items and the
first reconciliation reports no drift, change `CATALOG_SYNC_ENFORCEMENT` to
`true`. Public product endpoints then return only Stripe-synchronized products;
the protected `GET /products/admin` endpoint continues to return all products.

The Product migration is additive, but it must be deployed before starting the
Outbox worker. Follow the repository [`migration.md`](../../migration.md) for
backup, deployment, backfill, reconciliation, enforcement, and rollback steps.
