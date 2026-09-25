# Order Service

Order Service consumes versioned `payment.order.lifecycle` snapshots and projects them into MongoDB.

The reliable schema does not read legacy Order documents. The fresh local `mongo-order-replset-db` database needs no legacy-data migration. If reusing an older `orders` database, isolate its legacy `orders` collection as described in the root `migration.md`; otherwise the required unique indexes can fail to build.

MongoDB must run as a replica set, including local development. A single-node `rs0` is sufficient. The service fails startup when the Mongo `hello` response has no replica-set name; it never silently falls back to non-transactional writes.

For each valid lifecycle event:

1. the Kafka handler validates the envelope/key and durably inserts `PaymentEventInbox`;
2. a leased worker opens a Mongo transaction;
3. a newer full snapshot creates/updates `Order`, while stale versions are ignored;
4. the same transaction marks Inbox processed and writes an `order.payment.applied` Outbox event;
5. the Outbox worker publishes with `orderId` as Kafka key.

Malformed messages are retained in `RejectedPaymentEvent` for 30 days. Database failures are rethrown so Kafka does not commit the offset. Payment failures are acknowledged with `orderExists=false`; only a successful payment snapshot creates an Order.

```dotenv
DATABASE_URL="mongodb://admin:YOUR_PASSWORD@localhost:27018/mongo-order-replset-db?authSource=admin&replicaSet=rs0&directConnection=true"
TEST_ORDER_DATABASE_URL="mongodb://admin:YOUR_PASSWORD@localhost:27018/mongo-order-replset-db-test?authSource=admin&replicaSet=rs0&directConnection=true"
```

The test URL must point to a separate database. `dev` loads `apps/order-service/.env`; `packages/order-db/.env` is not loaded by the service. The regular `test` command keeps integration tests optional, while `test:integration` explicitly loads the service `.env` and runs the MongoDB transaction test.

```bash
pnpm --filter order-service test
pnpm --filter order-service test:integration
pnpm --filter order-service check-types
pnpm --filter order-service dev
```

Admin endpoints:

```text
GET  /order-projection-sync/summary
GET  /order-projection-sync/:orderId
POST /order-projection-sync/:orderId/retry
```

See [`migration.md`](../../migration.md) for single-node replica-set initialization and end-to-end Test Mode verification.
