# Payment 到 Order 可靠化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents unless the repository owner explicitly requests delegation.

**Goal:** 将 Stripe Checkout、Webhook、Kafka 和 MongoDB Order 串成可重试、幂等、可对账且可观察的 Payment → Order 最终一致链路。

**Architecture:** Payment PostgreSQL 持久化 CheckoutAttempt、Stripe Webhook Inbox、通用 Outbox 和 Order 回执 Inbox；Order MongoDB replica set 持久化 Payment Event Inbox、Order projection 和 Order Outbox。Kafka 使用 `orderId` key，事件携带完整快照和 aggregate version，所有跨系统步骤按 at-least-once 交付并由 Inbox、唯一约束和版本 fence 消除重复与乱序影响。

**Tech Stack:** TypeScript 5、Node.js `node:test`、Hono、Fastify、Prisma 7/PostgreSQL、Mongoose 9/MongoDB replica set、KafkaJS、Stripe SDK 20、Next.js 16、React 19、Clerk、pnpm 9/Turborepo。

**Spec:** `docs/superpowers/specs/2026-09-18-payment-order-reliability-design.md`

## Global Constraints

- Payment PostgreSQL 和 Order MongoDB 之间不创建同步数据库依赖或跨库事务。
- MongoDB 必须运行在 replica set；不支持事务时 Order Service 启动失败。
- 不实现旧 Client、旧 Checkout Session、旧 `payment.successful` 消息或历史 Order 兼容。
- 不实现库存、履约或主动退款 API。
- 金额全部使用 USD cents 和安全整数。
- 自动测试不访问 Stripe；使用 fake gateway/repository。
- 不引入 Jest、Vitest、Testcontainers、stripe-mock、CDC、Debezium 或 RocketMQ。
- `.env` 只追加变量；不读取、打印或提交真实 secret。
- 不自动删除或重置开发数据库；唯一索引被旧数据阻塞时停止并报告冲突。
- 不运行 `git commit`；全部完成后只提供英文 Conventional Commit 信息，由仓库所有者提交。
- 新增或实质修改的代码注释使用英文。

## File Structure

### Shared contracts and Kafka

- Create `packages/types/src/payment-order.ts`: payment/refund/dispute enums、Checkout DTO、Kafka envelope、Zod runtime schemas。
- Modify `packages/types/src/order.ts`: 移除对 `@repo/order-db` 的 DTO 反向依赖，定义可序列化 Order DTO。
- Modify `packages/types/src/index.ts`: 导出 payment-order contracts。
- Modify `packages/types/package.json`: 移除不再需要的 `@repo/order-db` 依赖。
- Modify `apps/payment-service/package.json`: 将运行时使用的 `@repo/types` 放入 dependencies。
- Modify `apps/order-service/package.json`: 将运行时使用的 `@repo/types` 放入 dependencies 并增加 test script。
- Modify `pnpm-lock.yaml`: 只更新以上 workspace importer dependency 分类。
- Modify `packages/kafka/src/constants.ts`: 新 topic constants，最终移除 `payment_successful`。
- Modify `packages/kafka/src/consumer.ts`: handler 接收 Kafka topic/partition/offset/key metadata。
- Modify `packages/kafka/src/consumer.test.ts`: metadata 和 retry/skip 行为测试。

### Product/catalog bridge

- Modify `packages/types/src/catalog-sync.ts`: Catalog snapshot 增加 sizes/colors。
- Modify `apps/product-service/src/utils/catalogSync.ts`: 生成完整可售快照。
- Modify `apps/product-service/src/controllers/product.controller.ts`: Outbox 传递 sizes/colors。
- Modify `apps/product-service/src/scripts/backfillCatalogSync.ts`: 幂等地为旧快照提升 catalog version 并生成新 UPSERT。
- Modify `apps/product-service/src/utils/catalogSync.test.ts`: 快照和幂等回填决策测试。
- Modify `apps/payment-service/src/utils/subscriptions.ts`: Payment catalog ledger 保存 sizes/colors。
- Modify `apps/payment-service/src/utils/checkoutCatalog.ts`: 强制同步目录并校验商品选项，删除 legacy Stripe fallback。
- Modify `apps/payment-service/src/utils/checkoutCatalog.test.ts`: size/color 和强制同步测试。

### Payment persistence and domain

- Modify `packages/payment-db/prisma/schema.prisma`: CheckoutAttempt、Webhook Inbox、Order Ack Inbox、通用 Outbox 和目录选项字段。
- Create `packages/payment-db/prisma/migrations/20260918000000_add_payment_order_reliability/migration.sql`: additive PostgreSQL migration 和现有 Catalog Outbox 回填。
- Regenerate `packages/payment-db/generated/prisma/**` with Prisma CLI。
- Create `apps/payment-service/src/utils/checkoutRequest.ts`: cart normalization、SHA-256 request hash。
- Create `apps/payment-service/src/utils/checkoutSession.ts`: 幂等 Checkout orchestration 和 gateway/repository seams。
- Create `apps/payment-service/src/utils/checkoutSession.test.ts`: Checkout idempotency 单元测试。
- Create `apps/payment-service/src/routes/session.route.test.ts`: header、error code 和 session ownership route 测试。
- Modify `apps/payment-service/src/routes/session.route.ts`: 新 POST/GET contracts 和认证。
- Create `apps/payment-service/src/utils/paymentState.ts`: 正交支付/退款/争议状态机。
- Create `apps/payment-service/src/utils/paymentState.test.ts`: 重复、乱序和非法回退测试。
- Create `apps/payment-service/src/utils/stripeWebhookEvent.ts`: Stripe event normalization。
- Create `apps/payment-service/src/utils/stripeWebhookEvent.test.ts`: event mapping 测试。
- Modify `apps/payment-service/src/routes/webhooks.route.ts`: 验签后只写 Inbox。
- Create `apps/payment-service/src/routes/webhooks.route.test.ts`: signature、duplicate 和 DB failure response 测试。
- Create `apps/payment-service/src/utils/stripeWebhookWorker.ts`: lease、heartbeat、状态事务和 Outbox。
- Create `apps/payment-service/src/utils/stripeWebhookWorker.test.ts`: worker crash/retry/fence 测试。
- Create `apps/payment-service/src/utils/paymentReliability.integration.test.ts`: 可选 Payment PostgreSQL 事务集成测试。
- Modify `apps/payment-service/src/utils/paymentOutboxWorker.ts`: dynamic topic/key、通用重试。
- Create `apps/payment-service/src/utils/paymentOutboxWorker.test.ts`: publish/confirm crash window 测试。
- Create `apps/payment-service/src/utils/orderProjectionAck.ts`: Order ack validation and persistence。
- Modify `apps/payment-service/src/utils/subscriptions.ts`: 同时消费 catalog requested 和 order applied。
- Create `apps/payment-service/src/utils/paymentReconciliation.ts`: Stripe 和 Order ack 对账。
- Create `apps/payment-service/src/utils/paymentReconciliation.test.ts`: missing webhook/outbox/ack 修复测试。
- Create `apps/payment-service/src/routes/paymentOrderSync.route.ts`: Payment 管理接口。
- Modify `apps/payment-service/src/index.ts`: 启动/关闭新 workers、route 和 reconciliation。

### Order persistence and workers

- Modify `packages/order-db/src/connection.ts`: await 连接并验证 replica set。
- Modify `packages/order-db/src/order-model.ts`: 可靠 Order projection schema 和唯一索引。
- Create `packages/order-db/src/payment-event-inbox-model.ts`: durable Mongo Inbox。
- Create `packages/order-db/src/order-outbox-model.ts`: Mongo Outbox。
- Create `packages/order-db/src/rejected-payment-event-model.ts`: poison event store。
- Modify `packages/order-db/src/index.ts`: 导出模型和 session helper。
- Create `apps/order-service/src/utils/paymentEvent.ts`: runtime validation and projection decision。
- Create `apps/order-service/src/utils/paymentEvent.test.ts`: envelope 和 version fence 测试。
- Modify `apps/order-service/src/utils/subscriptions.ts`: Kafka handler 只持久化 Inbox/rejected event。
- Delete `apps/order-service/src/utils/order.ts`: 移除直接创建 Order 的 legacy helper。
- Create `apps/order-service/src/utils/orderWorker.ts`: claim、lease、Mongo transaction 和 ack Outbox。
- Create `apps/order-service/src/utils/orderWorker.test.ts`: duplicate/out-of-order/rollback 测试。
- Create `apps/order-service/src/utils/orderOutboxWorker.ts`: ack publisher。
- Create `apps/order-service/src/utils/orderOutboxWorker.test.ts`: duplicate publish and lease recovery。
- Create `apps/order-service/src/utils/orderReliability.integration.test.ts`: 可选 Mongo replica-set 事务集成测试。
- Create `apps/order-service/src/routes/orderProjectionSync.ts`: Order 管理接口。
- Modify `apps/order-service/src/routes/order.ts`: 新 Order DTO 和统计口径。
- Modify `apps/order-service/src/index.ts`: 正确启动连接、consumer 和 workers。
- Modify `apps/order-service/package.json`: 增加 test script。
- Modify `packages/order-db/package.json`: 增加 check-types script。

### Client, Admin and documentation

- Modify `apps/client/src/components/CartForm/StripePaymentForm.tsx`: 稳定 Idempotency-Key 和精简 cart。
- Modify `apps/client/src/components/CartForm/CheckoutForm.tsx`: submit semantics and error handling。
- Create `apps/client/src/components/PaymentReturnStatus.tsx`: authenticated polling and cart cleanup。
- Modify `apps/client/src/app/return/page.tsx`: 使用可靠本地状态 UI。
- Modify `apps/client/src/types.ts`: Checkout/return DTO types。
- Modify `apps/admin/src/app/(dashboard)/orders/columns.tsx`: payment/refund/dispute columns。
- Create `apps/admin/src/app/(dashboard)/payment-sync/page.tsx`: Payment/Order reliability dashboard。
- Create `apps/admin/src/app/(dashboard)/payment-sync/PaymentSyncActions.tsx`: retry/reconcile actions。
- Modify `apps/admin/src/components/AppSideBar.tsx`: 添加可靠性页面入口。
- Modify root `package.json`: 增加 `test:payment-order`。
- Modify `README.md`, `migration.md`, `TODO.md`, service READMEs and relevant `docs/interview-preparation/*.md`。

---

### Task 1: Shared payment-order contracts and Kafka metadata

**Files:**

- Create: `packages/types/src/payment-order.ts`
- Modify: `packages/types/src/order.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `packages/types/package.json`
- Modify: `apps/payment-service/package.json`
- Modify: `apps/order-service/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/kafka/src/constants.ts`
- Modify: `packages/kafka/src/consumer.ts`
- Modify: `packages/kafka/src/consumer.test.ts`
- Test: `packages/kafka/src/consumer.test.ts`

**Interfaces:**

- Produces `PaymentStatus`, `RefundStatus`, `DisputeStatus`, `CheckoutRequest`, `PaymentOrderEvent`, `OrderPaymentAppliedEvent`, `paymentOrderEventSchema`, `orderPaymentAppliedEventSchema` from `@repo/types`.
- Produces `KafkaMessageMetadata = { topic: string; partition: number; offset: string; key: string | null }` and an optional invalid-message handler from `@repo/kafka`.
- Produces topics `payment_order_lifecycle` and `order_payment_applied`.

- [ ] **Step 1: Extend the Kafka consumer test with handler metadata**

Add a test that captures the second handler argument:

```ts
test('passes Kafka coordinates and key to the handler', async () => {
  let metadata: KafkaMessageMetadata | undefined
  await harness.consumer.subscribe([
    {
      topicName: 'payment.order.lifecycle',
      topicHandler: async (_value, context) => {
        metadata = context
      },
    },
  ])

  await harness.eachMessage()({
    topic: 'payment.order.lifecycle',
    partition: 2,
    message: {
      key: Buffer.from('order-1'),
      value: Buffer.from('{"id":"event-1"}'),
      timestamp: '0',
      attributes: 0,
      offset: '17',
      headers: {},
    },
    heartbeat: async () => undefined,
    pause: () => () => undefined,
  })

  assert.deepEqual(metadata, {
    topic: 'payment.order.lifecycle',
    partition: 2,
    offset: '17',
    key: 'order-1',
  })
})
```

Add a second test with a non-JSON value and assert `invalidMessageHandler(rawValue, metadata, error)` is called instead of blocking before the application can persist the poison message.

- [ ] **Step 2: Run the focused Kafka test and confirm the red state**

Run:

```bash
pnpm --filter @repo/kafka test
```

Expected: the new test fails because `topicHandler` accepts only one argument and `KafkaMessageMetadata` is not exported.

- [ ] **Step 3: Add contracts and runtime schemas**

Define the shared state types as literal tuples, and define Zod schemas with strict objects:

```ts
export const paymentStatuses = [
  'CREATING',
  'OPEN',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'CANCELED',
  'EXPIRED',
] as const

export const refundStatuses = ['NONE', 'PARTIAL', 'FULL'] as const
export const disputeStatuses = ['NONE', 'OPEN', 'WON', 'LOST'] as const

export type EventEnvelope<TType extends string, TData> = {
  id: string
  type: TType
  schemaVersion: 1
  occurredAt: string
  aggregateId: string
  aggregateVersion: number
  correlationId: string
  causationId: string
  data: TData
}
```

Use discriminated literal event types from the spec, enforce safe integer cents and quantities in Zod, and export the inferred types. Rewrite `OrderType` as a shared serializable DTO so `@repo/types` no longer imports `@repo/order-db`.

Move `@repo/types` into runtime dependencies for Payment and Order Service, remove `@repo/order-db` from `@repo/types`, and update only the affected pnpm lockfile importers:

```bash
pnpm install --lockfile-only
```

- [ ] **Step 4: Pass Kafka metadata to handlers without changing existing error semantics**

Change the handler signature to:

```ts
topicHandler: (message: unknown, metadata: KafkaMessageMetadata) =>
  Promise<void>
```

Add this optional topic callback:

```ts
invalidMessageHandler?: (
  rawValue: string,
  metadata: KafkaMessageMetadata,
  error: Error,
) => Promise<void>
```

Existing handlers may ignore the second parameter. Preserve `errorPolicy: 'retry'` rethrow behavior and default skip behavior. If invalid-message persistence fails under retry policy, rethrow so Kafka does not commit the offset. Add the two topic constants and exports.

- [ ] **Step 5: Verify shared packages**

Run:

```bash
pnpm --filter @repo/kafka test
pnpm --filter @repo/kafka check-types
pnpm --filter @repo/types check-types
git diff --check
```

Expected: all commands pass. Review that no payload or PII is logged in the consumer helper.

---

### Task 2: Extend the catalog snapshot with valid sizes and colors

**Files:**

- Modify: `packages/types/src/catalog-sync.ts`
- Modify: `apps/product-service/src/utils/catalogSync.ts`
- Modify: `apps/product-service/src/utils/catalogSync.test.ts`
- Modify: `apps/product-service/src/controllers/product.controller.ts`
- Modify: `apps/product-service/src/scripts/backfillCatalogSync.ts`
- Create: `apps/product-service/src/utils/catalogBackfill.ts`
- Create: `apps/product-service/src/utils/catalogBackfill.test.ts`

**Interfaces:**

- Extends `CatalogProductSnapshot` with required `sizes: string[]` and `colors: string[]` for UPSERT events.
- Produces `needsCatalogOptionBackfill(payload: unknown): boolean` for idempotent backfill decisions.

- [ ] **Step 1: Write snapshot and backfill-decision tests**

Update the UPSERT fixture to require:

```ts
product: {
  name: 'Trail shoe',
  unitAmount: 12900,
  currency: 'usd',
  sizes: ['8', '9'],
  colors: ['black'],
}
```

Add assertions that old payloads without both arrays require a new catalog version, while a current payload with both arrays is skipped:

```ts
assert.equal(needsCatalogOptionBackfill({ product: { name: 'Old' } }), true)
assert.equal(
  needsCatalogOptionBackfill({
    product: { sizes: ['8'], colors: ['black'] },
  }),
  false,
)
```

- [ ] **Step 2: Run product-service tests and confirm failure**

Run:

```bash
pnpm --filter product-service test
```

Expected: snapshot assertions fail because sizes/colors are absent and the helper does not exist.

- [ ] **Step 3: Produce complete catalog events**

Change `CatalogSyncEventInput` and Product controller inputs to include `sizes` and `colors`. Copy arrays into the event to avoid later mutation:

```ts
product: {
  name: name as string,
  unitAmount: (price as number) * 100,
  currency: 'usd',
  sizes: [...(sizes as string[])],
  colors: [...(colors as string[])],
}
```

ARCHIVE remains a null tombstone.

- [ ] **Step 4: Make the backfill idempotently create a new version**

For each Product, run a Prisma transaction that locks the row, reads the UPSERT Outbox at the current version, and:

1. skips when its payload already has sizes/colors;
2. otherwise increments `Product.catalogVersion` by one;
3. resets Stripe sync state to PENDING;
4. inserts a new UPSERT Outbox containing the complete snapshot.

Do not update an already-published Outbox payload in place. A second execution must see the new current-version payload and skip it.

- [ ] **Step 5: Verify Product changes**

Run:

```bash
pnpm --filter product-service test
pnpm --filter product-service check-types
git diff --check
```

Expected: tests pass and the script contains no destructive Product deletion or database reset.

---

### Task 3: Add Payment PostgreSQL reliability schema and migration

**Files:**

- Modify: `packages/payment-db/prisma/schema.prisma`
- Create: `packages/payment-db/prisma/migrations/20260918000000_add_payment_order_reliability/migration.sql`
- Regenerate: `packages/payment-db/generated/prisma/**`
- Modify: `apps/payment-service/src/utils/subscriptions.ts`
- Modify: `apps/payment-service/src/utils/catalogWorker.ts`
- Modify: `apps/payment-service/src/utils/checkoutCatalog.ts`
- Modify: `apps/payment-service/src/utils/checkoutCatalog.test.ts`

**Interfaces:**

- Produces Prisma models `CheckoutAttempt`, `StripeWebhookInboxEvent`, `OrderProjectionInboxEvent`.
- Extends `StripeCatalogItem` with `desiredSizes String[]` and `desiredColors String[]`.
- Extends `PaymentOutboxEvent` with required topic/messageKey/eventType/schemaVersion and nullable correlation/causation IDs.

- [ ] **Step 1: Write failing Checkout catalog option tests**

Replace the old fallback expectations with strict server-side validation:

```ts
const result = buildCheckoutSnapshot(
  [
    {
      productId: '42',
      quantity: 2,
      selectedSize: '9',
      selectedColor: 'black',
    },
  ],
  [syncedCatalogItem],
)

assert.equal(result.items[0]?.stripePriceId, 'price_synced')
assert.throws(
  () =>
    buildCheckoutSnapshot(
      [
        {
          productId: '42',
          quantity: 1,
          selectedSize: '13',
          selectedColor: 'black',
        },
      ],
      [syncedCatalogItem],
    ),
  /Invalid size/,
)
```

Also assert archived, unsynced, invalid quantity and invalid color rejection.

- [ ] **Step 2: Define the Prisma schema and SQL migration**

Use these exact enum dimensions:

```prisma
enum PaymentStatus {
  CREATING
  OPEN
  PROCESSING
  SUCCEEDED
  FAILED
  CANCELED
  EXPIRED
}

enum RefundStatus {
  NONE
  PARTIAL
  FULL
}

enum DisputeStatus {
  NONE
  OPEN
  WON
  LOST
}
```

Implement all fields and unique/index constraints from spec section 6. Define desired sizes/colors with empty-array defaults so existing ledger rows migrate safely. In migration SQL, add new Outbox routing columns as nullable, backfill every existing row with Catalog values, then apply `NOT NULL`. Keep correlationId and causationId nullable for historical Catalog rows.

- [ ] **Step 3: Generate Prisma client**

Run with the configured local Payment database environment:

```bash
pnpm --filter @repo/payment-db db:generate
```

Expected: generated client includes the new models and enums. Generation must not modify unrelated lockfile content.

- [ ] **Step 4: Persist catalog options and remove legacy Checkout fallback**

Validate sizes/colors on incoming catalog events, write them to `StripeCatalogItem`, and replace `buildCheckoutLineItemsWithFallback` with:

```ts
export const buildCheckoutSnapshot = (
  cart: CheckoutItemInput[],
  catalogItems: CheckoutCatalogItem[],
): {
  lineItems: Array<{ price: string; quantity: number }>
  items: CheckoutItemSnapshot[]
}
```

The snapshot must use `desiredName`, `desiredUnitAmount`, `desiredCurrency`, `stripePriceId`, and validated options from Payment DB. Remove `resolveLegacyStripePrice` usage. Update every existing Catalog worker Outbox insert with topic `catalog.product.sync.result`, messageKey `productId`, eventType `catalog.product.sync.result` and schemaVersion `1` so Payment Service still type-checks immediately after the schema is generated.

- [ ] **Step 5: Verify schema and strict Checkout catalog behavior**

Run:

```bash
pnpm --filter payment-service test
pnpm --filter @repo/payment-db check-types
pnpm --filter payment-service check-types
git diff --check
```

When `TEST_PAYMENT_DATABASE_URL` is available, additionally deploy the migration to that database and inspect that existing `PaymentOutboxEvent` rows have topic/key/type/version populated.

---

### Task 4: Implement idempotent Checkout Session creation

**Files:**

- Create: `apps/payment-service/src/utils/checkoutRequest.ts`
- Create: `apps/payment-service/src/utils/checkoutSession.ts`
- Create: `apps/payment-service/src/utils/checkoutSession.test.ts`
- Create: `apps/payment-service/src/routes/session.route.test.ts`
- Modify: `apps/payment-service/src/routes/session.route.ts`
- Modify: `apps/payment-service/src/utils/stripe.ts`

**Interfaces:**

- Produces `normalizeCheckoutRequest(request): NormalizedCheckoutRequest`.
- Produces `hashCheckoutRequest(request): string` using SHA-256 of canonical JSON.
- Produces `createOrResumeCheckout(input, dependencies): Promise<CheckoutSessionResult>`.
- Produces `createSessionRoute(dependencies)` for route tests and a default route wired to real dependencies.
- Stripe gateway method: `createSession(input, idempotencyKey): Promise<StripeCheckoutSessionResult>`.

- [ ] **Step 1: Write failing normalization and idempotency tests**

Cover duplicate-line merging, stable ordering, bad quantities/options, same key/same hash, same key/different hash, Stripe timeout and replay:

```ts
test('returns the original session for the same user key and request hash', async () => {
  const first = await createOrResumeCheckout(input, fakeDependencies)
  const second = await createOrResumeCheckout(input, fakeDependencies)

  assert.equal(first.paymentAttemptId, second.paymentAttemptId)
  assert.equal(
    first.checkoutSessionClientSecret,
    second.checkoutSessionClientSecret,
  )
  assert.equal(fakeStripe.createCalls.length, 1)
})

test('rejects reuse of a key with another cart', async () => {
  await createOrResumeCheckout(input, fakeDependencies)
  await assert.rejects(
    createOrResumeCheckout(changedInput, fakeDependencies),
    /IDEMPOTENCY_KEY_REUSED/,
  )
})
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
pnpm --filter payment-service exec tsx --test src/utils/checkoutSession.test.ts
```

Expected: test fails because the new modules are absent.

- [ ] **Step 3: Implement canonical request handling and repository seam**

Normalize by `(productId, selectedSize, selectedColor)`, merge quantities using safe-integer overflow checks, sort lexicographically, and hash only normalized input. Define dependency interfaces so tests do not import Stripe or a real database:

```ts
type CheckoutDependencies = {
  findCatalogItems(productIds: string[]): Promise<CheckoutCatalogItem[]>
  findAttempt(
    userId: string,
    clientRequestId: string,
  ): Promise<StoredAttempt | null>
  createAttempt(input: NewAttempt): Promise<StoredAttempt>
  confirmSession(input: ConfirmSessionInput): Promise<void>
  createStripeSession(
    input: StripeCheckoutInput,
    idempotencyKey: string,
  ): Promise<StripeCheckoutSessionResult>
}
```

Handle the unique-constraint race by re-reading `(userId, clientRequestId)` and applying the same request-hash decision. Route tests must assert the missing-header 400, mismatch 409, retryable 503, authenticated ownership lookup and another user's 404 result so Session existence is not disclosed.

- [ ] **Step 4: Replace the Session POST and secure the GET route**

Require an `Idempotency-Key` UUID and return stable errors:

```text
400 INVALID_CHECKOUT_REQUEST
400 IDEMPOTENCY_KEY_REQUIRED
409 IDEMPOTENCY_KEY_REUSED
409 CATALOG_SYNC_PENDING
503 CHECKOUT_CREATION_RETRYABLE
```

Call Stripe with `checkout-session:{attemptId}:v1`, set Session and PaymentIntent metadata, and use `CLIENT_APP_URL` for the return URL. Export a dependency-injected route factory and instantiate the production route with Prisma/Stripe adapters. Add `shouldBeUser` to GET and query `stripeCheckoutSessionId + userId` in Payment DB instead of retrieving Stripe directly.

- [ ] **Step 5: Verify Checkout behavior**

Run:

```bash
pnpm --filter payment-service test
pnpm --filter payment-service check-types
git diff --check
```

Expected: fake Stripe tests prove one Session per user key/request hash and no client name/price is consumed.

---

### Task 5: Persist Stripe Webhooks and implement the pure payment state machine

**Files:**

- Create: `apps/payment-service/src/utils/paymentState.ts`
- Create: `apps/payment-service/src/utils/paymentState.test.ts`
- Create: `apps/payment-service/src/utils/stripeWebhookEvent.ts`
- Create: `apps/payment-service/src/utils/stripeWebhookEvent.test.ts`
- Modify: `apps/payment-service/src/routes/webhooks.route.ts`
- Create: `apps/payment-service/src/routes/webhooks.route.test.ts`

**Interfaces:**

- Produces `applyPaymentTransition(current, command): PaymentTransitionResult`.
- Produces `normalizeStripeEvent(event): NormalizedPaymentCommand | IgnoredStripeEvent`.
- Produces `createWebhookRoute(dependencies)` for Hono request tests.
- Webhook route persists `StripeWebhookInboxEvent` and performs no Stripe reads/Kafka writes.

- [ ] **Step 1: Write state-machine tests**

Include these exact invariants:

```ts
assert.deepEqual(
  applyPaymentTransition(openState, {
    type: 'CHECKOUT_COMPLETED',
    paid: false,
  }).next.paymentStatus,
  'PROCESSING',
)

assert.equal(
  applyPaymentTransition(succeededState, {
    type: 'PAYMENT_FAILED',
  }).changed,
  false,
)

const refundedAndDisputed = applyPaymentTransition(
  { ...succeededState, refundStatus: 'PARTIAL' },
  { type: 'DISPUTE_OPENED' },
).next
assert.equal(refundedAndDisputed.refundStatus, 'PARTIAL')
assert.equal(refundedAndDisputed.disputeStatus, 'OPEN')
```

Also cover full refund, dispute won/lost, duplicate final state and amountRefunded bounds.

- [ ] **Step 2: Write Stripe event normalization tests**

Build minimal typed fixtures for every event in spec section 10 and assert normalized commands contain event ID, Stripe created time, Session/PaymentIntent identifiers, authoritative amounts and collected email/shipping. Assert unrelated events return `IGNORED`.

- [ ] **Step 3: Run focused tests and confirm failure**

Run:

```bash
pnpm --filter payment-service exec tsx --test src/utils/paymentState.test.ts src/utils/stripeWebhookEvent.test.ts
```

Expected: tests fail because the state machine and normalizer do not exist.

- [ ] **Step 4: Implement state machine and durable Webhook HTTP boundary**

Use pure functions for all transitions. Change the route to:

```ts
const body = await c.req.text()
const event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
await paymentPrisma.stripeWebhookInboxEvent.upsert({
  where: { id: event.id },
  create: normalizedInboxRow,
  update: {},
})
return c.json({ received: true })
```

Return 400 only for signature/input failure and 500 for database failure. Use `STRIPE_WEBHOOK_SECRET`; remove `listLineItems` and direct `producer.send`. Export a dependency-injected route factory; route tests use a fake verifier/repository seam and assert a duplicate event still returns 200 while a persistence failure returns 500.

- [ ] **Step 5: Verify Webhook boundary**

Run:

```bash
pnpm --filter payment-service test
pnpm --filter payment-service check-types
rg -n "listLineItems|payment_successful|producer.send" apps/payment-service/src/routes/webhooks.route.ts
```

Expected: tests pass and the final search returns no matches.

---

### Task 6: Implement the Stripe Webhook worker and transactional Payment Outbox

**Files:**

- Create: `apps/payment-service/src/utils/paymentRetry.ts`
- Create: `apps/payment-service/src/utils/stripeWebhookWorker.ts`
- Create: `apps/payment-service/src/utils/stripeWebhookWorker.test.ts`
- Create: `apps/payment-service/src/utils/paymentReliability.integration.test.ts`
- Create: `apps/payment-service/src/utils/paymentLifecycleEvent.ts`
- Create: `apps/payment-service/src/utils/paymentLifecycleEvent.test.ts`
- Modify: `apps/payment-service/src/index.ts`

**Interfaces:**

- Produces `runStripeWebhookBatch()` and `startStripeWebhookWorker()`.
- Produces `createPaymentLifecycleEvent(attempt, causationId): PaymentOrderEvent`.
- Uses `applyPaymentTransition` from Task 5 and writes `CheckoutAttempt + PaymentOutboxEvent + StripeWebhookInboxEvent` in one transaction.

- [ ] **Step 1: Write worker contract tests with fake repository**

Cover duplicate event, missing attempt, valid transition, no-op transition, transaction failure, expired lease, lost claim, retry exhaustion and a later `checkout.session.completed` event that adds shipping/email after an earlier success event:

```ts
test('commits the state change, outbox and processed inbox atomically', async () => {
  await processStripeWebhookJob(job, fakeDependencies)

  assert.equal(repository.attempt.paymentStatus, 'SUCCEEDED')
  assert.equal(repository.outbox.length, 1)
  assert.equal(repository.inbox.status, 'PROCESSED')
  assert.equal(repository.commits, 1)
})

test('does not acknowledge the inbox when the transaction fails', async () => {
  repository.failCommit = true
  await assert.rejects(processStripeWebhookJob(job, fakeDependencies))
  assert.equal(repository.inbox.status, 'RECEIVED')
  assert.equal(repository.outbox.length, 0)
})
```

- [ ] **Step 2: Run the focused worker tests and confirm failure**

Run:

```bash
pnpm --filter payment-service exec tsx --test src/utils/stripeWebhookWorker.test.ts src/utils/paymentLifecycleEvent.test.ts
```

Expected: modules are absent.

- [ ] **Step 3: Implement claim, heartbeat and retry policy**

Use constants:

```ts
const MAX_ATTEMPTS = 8
const LEASE_MS = 5 * 60 * 1000
const HEARTBEAT_MS = 30 * 1000
const MAX_RETRY_MS = 30 * 60 * 1000
```

Transient Stripe errors are connection errors, 429 and 5xx. Permanent mapping, ownership, amount or currency failures mark Inbox FAILED immediately. Clear heartbeat in `finally` and condition every completion update on claimToken.

- [ ] **Step 4: Implement the fenced transaction**

Inside Prisma transaction:

1. lock CheckoutAttempt using `SELECT ... FOR UPDATE`;
2. re-read current state;
3. apply pure transition and merge authoritative Stripe IDs/email/shipping into the attempt;
4. if any projected field changes, including shipping/email/Stripe IDs while status is unchanged, increment version and create full-snapshot Outbox with topic `payment.order.lifecycle` and key `orderId`;
5. mark Inbox PROCESSED;
6. if no state change, mark Inbox PROCESSED without Outbox.

Perform any Stripe retrieve outside this transaction. Add worker startup after Payment DB/Kafka connections. Retain every interval handle and add SIGINT/SIGTERM shutdown that stops workers, closes the HTTP server, disconnects Kafka and then disconnects Prisma.

- [ ] **Step 5: Verify worker behavior**

Run:

```bash
pnpm --filter payment-service test
pnpm --filter payment-service check-types
git diff --check
```

With `TEST_PAYMENT_DATABASE_URL`, run the integration test that deliberately throws after attempt update and assert neither attempt nor Outbox commits.

---

### Task 7: Generalize Payment Outbox and consume Order acknowledgements

**Files:**

- Modify: `apps/payment-service/src/utils/paymentOutboxWorker.ts`
- Create: `apps/payment-service/src/utils/paymentOutboxWorker.test.ts`
- Create: `apps/payment-service/src/utils/orderProjectionAck.ts`
- Create: `apps/payment-service/src/utils/orderProjectionAck.test.ts`
- Modify: `apps/payment-service/src/utils/subscriptions.ts`
- Modify: `apps/payment-service/src/utils/catalogWorker.ts`

**Interfaces:**

- `runPaymentOutboxBatch()` publishes each row's stored `topic`, `messageKey`, `eventType`, `schemaVersion` and payload.
- `persistOrderProjectionAck(event)` atomically deduplicates ack and advances `orderAppliedVersion/orderExists`.

- [ ] **Step 1: Write dynamic routing and ack-fence tests**

Assert the worker calls:

```ts
await producer.send(event.topic, event.payload, {
  key: event.messageKey,
  headers: {
    eventType: event.eventType,
    schemaVersion: event.schemaVersion.toString(),
  },
})
```

Ack tests must prove duplicate event IDs and lower applied versions do not overwrite a higher `orderAppliedVersion`.

- [ ] **Step 2: Run focused tests and confirm the old hard-coded behavior fails**

Run:

```bash
pnpm --filter payment-service exec tsx --test src/utils/paymentOutboxWorker.test.ts src/utils/orderProjectionAck.test.ts
```

Expected: old worker publishes only `catalog.product.sync.result` and ack handler is missing.

- [ ] **Step 3: Generalize Outbox without weakening Catalog reliability**

Update every Catalog Outbox create call to set routing fields. Preserve lease/claim behavior. Add capped jitter to retries and keep rows PENDING on failure. A Kafka success followed by DB update failure must leave the event publishable again with the same event ID.

- [ ] **Step 4: Subscribe to `order.payment.applied` with retry semantics**

Validate with `orderPaymentAppliedEventSchema`, then in one Prisma transaction insert `OrderProjectionInboxEvent` and conditionally advance the attempt. Invalid messages are logged by ID/type only and skipped; transient database errors are rethrown with `errorPolicy: 'retry'`.

- [ ] **Step 5: Verify Catalog and payment lifecycle publishing**

Run:

```bash
pnpm --filter payment-service test
pnpm test:catalog-sync
pnpm --filter payment-service check-types
git diff --check
```

Expected: existing Catalog tests stay green and new topic/key tests pass.

---

### Task 8: Add MongoDB replica-set persistence models and startup checks

**Files:**

- Modify: `packages/order-db/src/connection.ts`
- Modify: `packages/order-db/src/order-model.ts`
- Create: `packages/order-db/src/payment-event-inbox-model.ts`
- Create: `packages/order-db/src/order-outbox-model.ts`
- Create: `packages/order-db/src/rejected-payment-event-model.ts`
- Modify: `packages/order-db/src/index.ts`
- Modify: `packages/order-db/package.json`
- Modify: `apps/order-service/package.json`
- Create: `apps/order-service/src/utils/orderDbModels.test.ts`

**Interfaces:**

- Exports `Order`, `PaymentEventInbox`, `OrderOutboxEvent`, `RejectedPaymentEvent`, `startOrderDbSession`, `connectOrderDB`, `disconnectOrderDB`.
- Order fields and unique/partial indexes match spec section 12.

- [ ] **Step 1: Add schema/index assertions**

Test Mongoose schema metadata without a database:

```ts
assert.equal(Order.schema.path('orderId').options.required, true)
assert.ok(
  Order.schema
    .indexes()
    .some(([keys, options]) => keys.paymentAttemptId === 1 && options.unique),
)
assert.ok(
  Order.schema
    .indexes()
    .some(
      ([keys, options]) =>
        keys.stripePaymentIntentId === 1 &&
        options.unique &&
        options.partialFilterExpression,
    ),
)
```

Also assert event ID, Outbox ID and rejected Kafka coordinate uniqueness.

- [ ] **Step 2: Run Order tests and confirm failure**

Add `"test": "tsx --test src/**/*.test.ts"` to Order Service and run:

```bash
pnpm --filter order-service test
```

Expected: new exports and schemas are missing.

- [ ] **Step 3: Implement additive Mongo models**

Use focused files and timestamps. `stripePaymentIntentId` uses a partial unique index for string values. Inbox indexes `(status, nextAttemptAt, leaseUntil)`; Outbox indexes the equivalent publish fields; rejected events use unique `kafkaCoordinate`.

Add `expiresAt` to `RejectedPaymentEvent` with a 30-day TTL index. Do not add TTL to failed Inbox jobs.

Do not log payloads from model hooks or connection code.

- [ ] **Step 4: Await connection and fail without replica-set capability**

Implement:

```ts
await mongoose.connect(databaseUrl)
const hello = await mongoose.connection.db?.admin().command({ hello: 1 })
if (!hello?.setName) {
  await mongoose.disconnect()
  throw new Error('Order MongoDB must run as a replica set')
}
```

Only set the connected flag after both operations succeed. Export session and disconnect helpers for worker/tests.

- [ ] **Step 5: Verify Order DB types and model tests**

Run:

```bash
pnpm --filter order-service test
pnpm --filter @repo/order-db check-types
pnpm --filter order-service check-types
git diff --check
```

With `TEST_ORDER_DATABASE_URL`, connect to the single-node replica set and commit/abort one empty test transaction before proceeding.

---

### Task 9: Persist Kafka lifecycle events in the Order Inbox

**Files:**

- Create: `apps/order-service/src/utils/paymentEvent.ts`
- Create: `apps/order-service/src/utils/paymentEvent.test.ts`
- Modify: `apps/order-service/src/utils/subscriptions.ts`
- Delete: `apps/order-service/src/utils/order.ts`
- Modify: `packages/kafka/src/constants.ts`

**Interfaces:**

- Produces `parsePaymentOrderEvent(value): PaymentOrderEvent`.
- Produces `persistPaymentInbox(event)` and `persistRejectedPaymentEvent(value, metadata, reason)`.
- Kafka handler returns only after Mongo durable insert or duplicate detection.

- [ ] **Step 1: Write validation and persistence tests**

Test a valid complete snapshot, missing event ID, mismatched aggregate/order ID, unsafe amounts and wrong Kafka key. Add fake repository tests proving duplicate event IDs return successfully while database failures reject.

```ts
await assert.doesNotReject(persistPaymentInbox(validEvent, fakeRepository))
await assert.doesNotReject(persistPaymentInbox(validEvent, fakeRepository))
assert.equal(fakeRepository.inboxRows.length, 1)
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```bash
pnpm --filter order-service exec tsx --test src/utils/paymentEvent.test.ts
```

Expected: parser and Inbox repository do not exist.

- [ ] **Step 3: Implement strict parsing and durable poison-message storage**

Use the shared Zod schema and additionally require Kafka key to equal `event.aggregateId`. Register `invalidMessageHandler` for malformed JSON. Store invalid raw value and a bounded error summary in `RejectedPaymentEvent` under `topic:partition:offset`, set `expiresAt` to 30 days, and never log the raw payload.

- [ ] **Step 4: Replace the legacy subscription**

Subscribe to `topics.payment_order_lifecycle`, await `consumer.subscribe`, and set `errorPolicy: 'retry'`. The handler must only persist Inbox/rejected records; delete the direct `new Order(...).save()` helper and remove the `payment_successful` topic constant after both producer and consumer references are gone.

- [ ] **Step 5: Verify safe consumer semantics**

Run:

```bash
pnpm --filter order-service test
pnpm --filter order-service check-types
rg -n "payment_successful|createOrder\(" apps/order-service/src
```

Expected: tests pass and the search returns no legacy subscription path.

---

### Task 10: Implement transactional Order projection and acknowledgement Outbox

**Files:**

- Create: `apps/order-service/src/utils/orderProjection.ts`
- Create: `apps/order-service/src/utils/orderProjection.test.ts`
- Create: `apps/order-service/src/utils/orderWorker.ts`
- Create: `apps/order-service/src/utils/orderWorker.test.ts`
- Create: `apps/order-service/src/utils/orderOutboxWorker.ts`
- Create: `apps/order-service/src/utils/orderOutboxWorker.test.ts`
- Create: `apps/order-service/src/utils/orderRetry.ts`
- Create: `apps/order-service/src/utils/orderReliability.integration.test.ts`
- Modify: `apps/order-service/src/index.ts`

**Interfaces:**

- Produces `decideOrderProjection(current, event): { apply: boolean; next: OrderProjection | null }`.
- Produces `runOrderInboxBatch()`, `startOrderInboxWorker()`, `runOrderOutboxBatch()`, `startOrderOutboxWorker()`.

- [ ] **Step 1: Write pure projection tests**

Cover:

```ts
assert.equal(decideOrderProjection(null, processingEvent).next, null)
assert.equal(decideOrderProjection(null, succeededV2).next?.paymentVersion, 2)
assert.equal(decideOrderProjection(existingV3, succeededV2).apply, false)
assert.equal(
  decideOrderProjection(partiallyRefundedOrder, disputeOpenedV4).next
    ?.refundStatus,
  'PARTIAL',
)
```

Assert all mutable Order fields come from the complete snapshot and not from previous client input.

- [ ] **Step 2: Write worker crash-window tests**

Use fake transaction dependencies to prove:

- Order, Inbox PROCESSED and OrderOutbox commit together;
- transaction failure leaves all three uncommitted;
- an equal-version replay still emits a fresh ack;
- expired lease can be reclaimed;
- lost claim cannot finalize another worker's job.

- [ ] **Step 3: Run focused tests and confirm failure**

Run:

```bash
pnpm --filter order-service exec tsx --test src/utils/orderProjection.test.ts src/utils/orderWorker.test.ts src/utils/orderOutboxWorker.test.ts
```

Expected: modules are absent.

- [ ] **Step 4: Implement Mongo transaction and Outbox publisher**

Claim outside the transaction, then use `session.withTransaction` to:

1. load Inbox by eventId/claimToken;
2. conditionally upsert Order using paymentVersion fence;
3. mark Inbox PROCESSED;
4. insert an `order.payment.applied` Outbox event with `orderExists` and appliedVersion.

The Outbox worker publishes with key `orderId`, persists PUBLISHED only under claimToken, and retries publish-confirm unknown results with the same event ID.

- [ ] **Step 5: Start workers only after dependencies and verify**

Start Mongo, producer, consumer, subscription, Inbox worker and Outbox worker in that order. Add shutdown handling for intervals, Kafka, Fastify and Mongo.

Run:

```bash
pnpm --filter order-service test
pnpm --filter order-service check-types
git diff --check
```

With `TEST_ORDER_DATABASE_URL`, run the real transaction rollback and duplicate unique-index integration tests.

---

### Task 11: Add reconciliation and protected operational APIs

**Files:**

- Create: `apps/payment-service/src/utils/paymentReconciliation.ts`
- Create: `apps/payment-service/src/utils/paymentReconciliation.test.ts`
- Create: `apps/payment-service/src/routes/paymentOrderSync.route.ts`
- Create: `apps/payment-service/src/routes/paymentOrderSync.route.test.ts`
- Create: `apps/order-service/src/routes/orderProjectionSync.ts`
- Create: `apps/order-service/src/routes/orderProjectionSync.test.ts`
- Modify: `apps/payment-service/src/index.ts`
- Modify: `apps/order-service/src/index.ts`

**Interfaces:**

- Produces `runPaymentOrderReconciliation(): Promise<ReconciliationSummary>` and 15-minute scheduler.
- Payment routes: `/payment-order-sync/summary`, `/:orderId`, `/:orderId/retry`, `/reconcile`.
- Order routes: `/order-projection-sync/summary`, `/:orderId`, `/:orderId/retry`.

- [ ] **Step 1: Write reconciliation scenario tests**

Test stale CREATING resume, missing Webhook state detected from Stripe Session, missing lifecycle Outbox creation, missing Order ack replay with a new event ID/same aggregate version, and no-op healthy attempts.

```ts
assert.equal(summary.replayedOrderEvents, 1)
assert.equal(repository.latestReplay.aggregateVersion, attempt.version)
assert.notEqual(repository.latestReplay.id, originalEventId)
```

- [ ] **Step 2: Write protected route tests**

Assert non-admin requests return 401/403, retry only resets FAILED jobs, response payloads omit webhook payload/client secret, and manual reconcile returns bounded counts rather than raw records.

- [ ] **Step 3: Run focused tests and confirm failure**

Run:

```bash
pnpm --filter payment-service exec tsx --test src/utils/paymentReconciliation.test.ts src/routes/paymentOrderSync.route.test.ts
pnpm --filter order-service exec tsx --test src/routes/orderProjectionSync.test.ts
```

Expected: routes and reconciliation are absent.

- [ ] **Step 4: Implement reconciliation through existing reliable paths**

Use the Stripe gateway for current Session/PaymentIntent truth, then call the same transition/outbox functions as Webhook processing. Never write Order directly. For missing ack, create one replay lifecycle event only when no PENDING replay exists for the same order/version.

Delete PROCESSED/IGNORED Stripe Webhook Inbox records older than 30 days in bounded batches; retain FAILED records. Expose counts by status, oldest pending age, failed job count and unconfirmed successful attempt count. Add interval cleanup on shutdown.

- [ ] **Step 5: Verify operational controls**

Run:

```bash
pnpm --filter payment-service test
pnpm --filter order-service test
pnpm --filter payment-service check-types
pnpm --filter order-service check-types
git diff --check
```

Expected: admin endpoints are protected and neither service gains direct database access to the other service.

---

### Task 12: Update Client checkout idempotency and reliable return status

**Files:**

- Modify: `apps/client/src/types.ts`
- Modify: `apps/client/src/components/CartForm/StripePaymentForm.tsx`
- Modify: `apps/client/src/components/CartForm/CheckoutForm.tsx`
- Create: `apps/client/src/components/PaymentReturnStatus.tsx`
- Modify: `apps/client/src/app/return/page.tsx`

**Interfaces:**

- Client sends `CheckoutRequest` and stable UUID `Idempotency-Key`.
- Return component polls authenticated `GET /sessions/:sessionId` until terminal payment or current Order confirmation.

- [ ] **Step 1: Extract deterministic client request helpers**

Create client-local helpers in `types.ts` or the component module:

```ts
export const toCheckoutRequest = (cart: CartItemType[]): CheckoutRequest => ({
  cart: cart.map((item) => ({
    productId: item.id.toString(),
    quantity: item.quantity,
    selectedSize: item.selectedSize,
    selectedColor: item.selectedColor,
  })),
})
```

Use a sessionStorage key such as `checkout-idempotency-key`. Generate with `crypto.randomUUID()` only when no active key exists.

- [ ] **Step 2: Send the required header and surface stable API errors**

Change CheckoutProvider's client-secret callback to send the compact request and header. If the response is not OK, throw an Error containing the server error code instead of returning undefined.

Prevent the Checkout `<button>` from submitting the form implicitly by using `type="button"` or a form submit handler with `preventDefault()`.

- [ ] **Step 3: Implement authenticated return polling**

`PaymentReturnStatus` uses `useAuth().getToken()`, polls every two seconds, and renders four states:

```text
PROCESSING/OPEN        -> Payment is processing
SUCCEEDED + PENDING   -> Payment received, creating your order
SUCCEEDED + CONFIRMED -> Order confirmed
FAILED/CANCELED/EXPIRED -> Payment not completed
```

Stop polling on CONFIRMED or terminal payment failure. Clear cart and the sessionStorage idempotency key only on CONFIRMED.

- [ ] **Step 4: Make the return page a thin server boundary**

Validate `session_id` and render the client polling component. Do not perform an unauthenticated server fetch. Keep user-facing error text free of internal exception details.

- [ ] **Step 5: Verify Client**

Run:

```bash
pnpm --filter client check-types
pnpm --filter client lint
pnpm --filter client build
git diff --check
```

Expected: no missing Suspense/build error and the Checkout request contains no client price/name.

---

### Task 13: Update Order APIs and Admin reliability views

**Files:**

- Modify: `apps/order-service/src/routes/order.ts`
- Modify: `packages/types/src/order.ts`
- Modify: `apps/admin/src/app/(dashboard)/orders/page.tsx`
- Modify: `apps/admin/src/app/(dashboard)/orders/columns.tsx`
- Create: `apps/admin/src/app/(dashboard)/payment-sync/page.tsx`
- Create: `apps/admin/src/app/(dashboard)/payment-sync/PaymentSyncActions.tsx`
- Modify: `apps/admin/src/components/AppSideBar.tsx`

**Interfaces:**

- Order list returns shared `OrderType` with payment/refund/dispute dimensions and cents/currency.
- Admin reliability page calls both services with Clerk admin token and joins summaries by orderId only for detail rendering.

- [ ] **Step 1: Update Order DTO and query projections**

Define `OrderType` from shared primitives rather than Mongoose inference. Map `_id` to string and expose `orderId`, `paymentStatus`, `refundStatus`, `disputeStatus`, `amountTotal`, `amountRefunded`, `currency`, timestamps and product snapshots.

Change order-chart success count to `paymentStatus = SUCCEEDED`, not the removed legacy `status = success`.

- [ ] **Step 2: Update Order table columns**

Replace legacy amount/status accessors with:

```text
orderId
email
amountTotal / currency
paymentStatus
refundStatus
disputeStatus
updatedAt
```

Use existing Badge/cn utilities and explicit color mappings for every enum value; do not infer success from a truthy string.

- [ ] **Step 3: Add the reliability dashboard and actions**

Server page fetches protected summary endpoints. Client action component sends admin-authenticated retry/reconcile requests, disables buttons while pending, and refreshes the page after success. Display pending/failed counts, oldest task age and successful payments awaiting Order confirmation.

- [ ] **Step 4: Add navigation and verify auth behavior**

Add a `Payment Sync` item to the existing Admin sidebar. Keep page under the authenticated dashboard layout; service endpoints still enforce role claims independently.

- [ ] **Step 5: Verify Admin and Order API**

Run:

```bash
pnpm --filter order-service test
pnpm --filter order-service check-types
pnpm --filter admin check-types
pnpm --filter admin lint
pnpm --filter admin build
git diff --check
```

Expected: Admin renders all orthogonal states and no legacy `OrderStatus[0]` or `status === 'success'` remains.

---

### Task 14: Documentation, migration guide and complete verification

**Files:**

- Modify: `package.json`
- Modify: `turbo.json`
- Modify: `README.md`
- Modify: `migration.md`
- Modify: `TODO.md`
- Modify: `apps/payment-service/README.md`
- Create: `apps/order-service/README.md`
- Modify: `docs/interview-preparation/README.md`
- Modify: `docs/interview-preparation/00-一周学习路线与项目介绍.md`
- Modify: `docs/interview-preparation/04-数据库选型建模事务与ORM.md`
- Modify: `docs/interview-preparation/05-Kafka事件驱动与可靠性.md`
- Modify: `docs/interview-preparation/07-系统设计改进与项目追问.md`
- Modify: `docs/interview-preparation/08-高频面试题与参考答案.md`
- Modify: any other interview-preparation document whose current factual statement says Payment → Order is still unreliable.

**Interfaces:**

- Produces root command `pnpm test:payment-order`.
- Produces a complete local migration/runbook for Payment PostgreSQL, Kafka topics, Catalog backfill and Mongo single-node replica set.

- [ ] **Step 1: Add the repository test command**

Set:

```json
"test:payment-order": "pnpm --filter @repo/kafka test && pnpm --filter product-service test && pnpm --filter payment-service test && pnpm --filter order-service test"
```

Replace `STRIPE_WEBHOOK_SECRECT` with `STRIPE_WEBHOOK_SECRET` in Turborepo's declared environment and add `CLIENT_APP_URL` plus `PAYMENT_RECONCILIATION_INTERVAL_MS` so build/dev cache inputs reflect the runtime contract.

- [ ] **Step 2: Rewrite migration.md as a combined current migration guide**

Preserve the existing Catalog rollout content and add exact local steps:

```text
1. Stop Order Service.
2. Restart the existing Mongo container with --replSet rs0 --bind_ip_all.
3. Run rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]}).
4. Append replicaSet=rs0 to Order DATABASE_URL.
5. Deploy/generate Payment Prisma migration.
6. Create payment.order.lifecycle and order.payment.applied topics.
7. Run Catalog backfill and confirm zero pending/failed.
8. Start Order, Payment, Client and Admin.
9. Configure Stripe Test Mode webhook events.
```

Include separate hostname guidance when MongoDB runs inside Docker and the application runs on the host. Do not embed real credentials.

- [ ] **Step 3: Update project and interview documentation with a dated Reliability Update**

Change factual baselines to describe the implemented CheckoutAttempt, Webhook Inbox, Payment Outbox, Mongo Inbox/transaction/Outbox, aggregate version, ack and reconciliation. Preserve historical “before” explanations where useful and label inventory Saga as the next stage.

Mark Payment → Order tasks complete in root `TODO.md`; leave inventory reservation/release, fulfillment and active refund API unchecked.

- [ ] **Step 4: Run complete automated verification**

Run:

```bash
pnpm test:catalog-sync
pnpm test:payment-order
pnpm check-types
pnpm lint
pnpm build
pnpm exec prettier --check "**/*.{ts,tsx,md}"
git diff --check
```

If an environment-backed integration test is skipped, record the missing `TEST_PAYMENT_DATABASE_URL` or `TEST_ORDER_DATABASE_URL` and run it before claiming full completion.

- [ ] **Step 5: Run the local infrastructure and Stripe Test Mode smoke checklist**

Verify in order:

1. Mongo `hello` reports `setName: rs0` and a test multi-document transaction commits.
2. Product backfill yields synchronized catalog options.
3. Repeating one Checkout request with the same Idempotency-Key returns one Stripe Session.
4. A successful Stripe Test Mode payment creates one Order and Payment records the Order ack.
5. Stopping Kafka before Outbox publish and restarting it eventually creates the Order.
6. Stopping Order Service after Kafka publish and restarting it eventually processes the Inbox.
7. Re-sending the Stripe event does not create another Order.
8. A refund updates refundStatus without clearing disputeStatus; a dispute updates disputeStatus without clearing refundStatus.
9. Session status cannot be queried by another user.
10. Admin retry/reconcile exposes no raw Webhook payload or client secret.

- [ ] **Step 6: Perform final review and prepare the owner commit message**

Inspect:

```bash
git status --short
git diff --stat
git diff --check
git diff -- . ':(exclude)packages/payment-db/generated/prisma/**'
```

Review generated Prisma output separately for expected models only. Do not stage or commit. If all verification is green, suggest:

```text
feat(payment): make payment to order flow reliable
```
