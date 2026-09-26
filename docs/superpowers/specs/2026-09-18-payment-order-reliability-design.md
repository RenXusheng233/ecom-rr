# Payment 到 Order 可靠化设计

**日期：** 2026-09-18  
**状态：** 已确认  
**目标分支：** `feat/catalog-stripe-reliable-sync`

> **Update · 2026-09-26 · 阅读边界：** 本文保留 2026-09-18 的已确认设计背景，不是最终验证记录；第 1 节描述的是改造前链路。核心 Inbox/Outbox、订单投影和 Ack 已有代码，本轮校对补充 Session 复用协议、实际管理 API 路径和未覆盖的恢复边界。当前导航见 [项目总览](../../项目总览与迭代规划.md)。历史实施计划保持原样。

## 1. 背景

当前支付到订单链路为：Stripe Webhook 到达 Payment Service 后，Webhook handler 立即读取 Stripe Line Items，并且不等待 Kafka `send` 完成就返回成功；Order Service 收到 `payment.successful` 后直接创建 MongoDB Order。

这条链路存在以下可靠性缺口：

1. Stripe `event.id` 没有持久化 Inbox，重复 Webhook 可能重复执行。
2. Webhook 返回成功与 Kafka 发布之间没有持久化边界，进程崩溃可能永久丢失订单事件。
3. Checkout Session 没有稳定幂等键，客户端重试可能创建多个 Session。
4. Kafka 事件没有稳定 envelope、schema version、causation ID 和同订单 message key。
5. Order 没有 Inbox、业务唯一约束和版本 fence，重复或乱序事件可能重复建单或回退状态。
6. `checkout.session.completed` 未支付时被错误地当作支付失败，异步支付、过期、退款和争议没有状态机。
7. Payment 无法判断 Kafka 消息是否最终被 Order 应用。
8. 返回页只查询 Stripe Session，可能在订单尚未创建时显示流程已完成。
9. Webhook handler 在持久化之前调用 Stripe API，增加超时和重复处理窗口。
10. 当前 Order consumer 会吞掉 handler 异常，MongoDB 写入失败后消息可能被当作成功消费。

本设计沿用商品目录可靠同步已经验证的思想：在每个数据库边界内使用本地事务，在数据库之间使用持久化 at-least-once、Inbox、Outbox、幂等、版本控制和对账实现最终一致。

## 2. 已确认的约束

- Payment Service 继续使用独立 PostgreSQL 和 `PAYMENT_DATABASE_URL`。
- Order Service 继续使用 MongoDB，不迁移到 PostgreSQL。
- MongoDB 必须启用 replica set；本地开发使用单节点 replica set。
- 本项目只有本地开发数据，不实现旧 Client、旧 Checkout Session、旧 Kafka 消息或历史 Order 的兼容适配。
- 本次直接切换到新链路，不做新旧链路双写。
- 库存预占、扣减、释放和库存补偿放到下一阶段。
- 本期可靠接收 Stripe 已发生的退款和争议并投影到 Order，但不实现主动发起退款的 Admin API。
- 货币保持 USD，所有金额使用整数 cents。
- 自动化测试不访问 Stripe，不引入 Jest、Vitest、Testcontainers 或 stripe-mock。
- 不承诺跨 PostgreSQL、Kafka、MongoDB 和 Stripe 的 exactly-once；目标是 at-least-once、端到端幂等和最终一致。
- 实施过程不由 Codex 创建 commit；完成后提供英文 Conventional Commit 信息，由仓库所有者提交。

## 3. 目标与非目标

### 3.1 目标

- 相同的一次 Checkout 请求只创建一个 Stripe Checkout Session。
- Stripe Webhook 只有持久化成功后才返回 HTTP 200。
- Payment 状态变化与 Payment Outbox 在同一个 PostgreSQL 事务中提交。
- Kafka 故障不会丢失订单事件。
- Order MongoDB 只在可靠、幂等的投影流程中创建或更新订单。
- 重复、乱序和过期事件不重复建单、不覆盖新状态。
- Payment 能确认 Order 已应用到哪个 payment aggregate version。
- 所有 worker 崩溃后都能通过 lease 重新认领任务。
- 对账能够修复缺失 Webhook、未发布 Outbox 和未确认 Order。
- Client 能区分支付处理中、支付成功但订单待创建、订单已确认和支付失败。

### 3.2 非目标

- 不实现库存 Saga。
- 不实现订单履约、发货或退货流程。
- 不实现 Admin 主动退款入口。
- 不保留旧 `payment.successful` 业务链路。
- 不为本地旧订单或旧 Stripe Session 构造兼容数据。
- 不引入 CDC、Debezium、RocketMQ 或新的消息基础设施。

## 4. 总体架构

```text
Client
  │  Authorization + Idempotency-Key
  ▼
Payment Service / PostgreSQL
  ├── CheckoutAttempt
  ├── StripeWebhookInboxEvent
  ├── PaymentOutboxEvent
  └── OrderProjectionInboxEvent
           │
           │ payment.order.lifecycle (key = orderId)
           ▼
Kafka
           │
           ▼
Order Service / MongoDB replica set
  ├── PaymentEventInbox
  ├── Order
  ├── OrderOutboxEvent
  └── RejectedPaymentEvent
           │
           │ order.payment.applied (key = orderId)
           ▼
Kafka
           │
           ▼
Payment Service 更新 orderAppliedVersion
```

跨系统没有总事务。每一段只在自己的数据库内提交事实，然后由可重试 worker 推进下一段。

## 5. 共享事件契约

### 5.1 Kafka topics

- `payment.order.lifecycle`：Payment 向 Order 发布支付生命周期快照。
- `order.payment.applied`：Order 向 Payment 发布投影确认。
- 旧 `payment.successful` 常量、producer 和 consumer 从代码中移除。

Kafka 集群中已存在的旧 topic 不要求自动删除。

### 5.2 通用 envelope

```ts
type EventEnvelope<TType extends string, TData> = {
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

字段语义：

- `id`：该次 Outbox 事件 ID；重复发布必须保持不变。
- `aggregateId`：`orderId`。
- `aggregateVersion`：`CheckoutAttempt.version`。
- `correlationId`：`CheckoutAttempt.id`。
- `causationId`：触发状态变化的 Stripe `event.id`；非 Webhook 对账事件使用 reconciliation run ID。
- Kafka message key：始终为 `orderId`。

### 5.3 Payment 生命周期事件

事件类型：

- `payment.processing`
- `payment.succeeded`
- `payment.failed`
- `payment.canceled`
- `payment.expired`
- `payment.partially_refunded`
- `payment.refunded`
- `payment.dispute_opened`
- `payment.dispute_won`
- `payment.dispute_lost`

事件携带完整 Order 投影快照，而不是差量：

```ts
type PaymentOrderSnapshot = {
  orderId: string
  paymentAttemptId: string
  userId: string
  paymentStatus: PaymentStatus
  refundStatus: RefundStatus
  disputeStatus: DisputeStatus
  amountTotal: number
  amountRefunded: number
  currency: 'usd'
  stripeCheckoutSessionId: string
  stripePaymentIntentId: string | null
  email: string | null
  shipping: ShippingSnapshot | null
  items: OrderItemSnapshot[]
}
```

`OrderItemSnapshot` 包含 `productId`、`name`、`unitAmount`、`quantity`、`selectedSize` 和 `selectedColor`。Order 不再从 Stripe 或 Product Service 二次查询订单快照。

### 5.4 Order 应用确认事件

```ts
type OrderPaymentAppliedData = {
  orderId: string
  paymentAttemptId: string
  appliedVersion: number
  orderExists: boolean
  appliedAt: string
}
```

当事件代表支付失败或过期且 Order 尚未创建时，Order 仍记录 Inbox，并返回 `orderExists: false` 的应用确认。

## 6. Payment PostgreSQL 模型

### 6.1 `CheckoutAttempt`

字段：

```text
id                       UUID primary key
orderId                  UUID unique
userId                   string
clientRequestId          string
requestHash              string
paymentStatus            PaymentStatus
refundStatus             RefundStatus
disputeStatus            DisputeStatus
version                  integer
currency                 string
amountTotal              integer
amountRefunded           integer
itemsSnapshot            json
email                    nullable string
shippingSnapshot         nullable json
stripeCheckoutSessionId  nullable unique string
stripePaymentIntentId    nullable unique string
stripeClientSecret       nullable string
lastStripeEventCreatedAt nullable datetime
orderAppliedVersion      nullable integer
orderAppliedAt           nullable datetime
orderExists              boolean
lastError                nullable string
createdAt                datetime
updatedAt                datetime
```

唯一约束：

- `(userId, clientRequestId)`。
- `orderId`。
- `stripeCheckoutSessionId`。
- `stripePaymentIntentId`，允许 null。

`stripeClientSecret` 不写日志、不进入 Kafka，只用于相同 idempotency request 返回同一 Session。

### 6.2 `StripeWebhookInboxEvent`

字段：

```text
id                 Stripe event.id primary key
eventType          string
stripeCreatedAt    datetime
payload            json
status             RECEIVED | PROCESSING | PROCESSED | IGNORED | FAILED
attempts           integer
nextAttemptAt      datetime
leaseUntil         nullable datetime
claimToken         nullable string
lastError          nullable string
receivedAt         datetime
processedAt        nullable datetime
```

Stripe 签名验证成功后保存原始解析 payload，以支持本地重放。payload 不写入应用日志，并通过定期清理限制保留时间。

### 6.3 泛化 `PaymentOutboxEvent`

在现有表上增加：

```text
topic
messageKey
eventType
schemaVersion
correlationId
causationId
```

现有 Catalog Outbox 在迁移 SQL 中回填：

- `topic = catalog.product.sync.result`
- `messageKey = aggregateId`
- `eventType = catalog.product.sync.result`
- `schemaVersion = 1`

更新后的 catalog result writer 必须显式填写这些字段。通用 Outbox worker 只读取记录中的 topic、key 和 payload，不再硬编码 Catalog topic。

Outbox 发布失败不会删除记录，也不会永久放弃；它保持可重试状态，使用 capped exponential backoff 和 jitter。连续失败超过告警阈值后仍继续低频重试，同时出现在管理接口中。

### 6.4 `OrderProjectionInboxEvent`

以 `order.payment.applied` 的 event ID 为主键，和 `CheckoutAttempt.orderAppliedVersion` 更新放在同一 PostgreSQL 事务中。重复确认直接忽略；低于当前 `orderAppliedVersion` 的确认不得覆盖新版本。

## 7. Catalog 快照扩展

现有 `CatalogProductSnapshot` 增加：

```ts
sizes: string[]
colors: string[]
```

Payment 的 `StripeCatalogItem` 增加对应的 desired snapshot 字段。它们不参与 Stripe Product/Price 更新，只用于 Checkout 输入验证和订单快照生成。

执行现有 Product Catalog backfill，为当前 Product 生成新版本 UPSERT 事件，使 Payment ledger 获得 sizes/colors。开启 Checkout 前必须确认所有可售商品均已同步这些字段。

## 8. Checkout 创建协议

### 8.1 请求

保留路由：

```text
POST /sessions/create-checkout-session
```

必需 headers：

```text
Authorization: Bearer ...
Idempotency-Key: <UUID>
```

请求体只接受：

```ts
type CheckoutRequest = {
  cart: Array<{
    productId: string
    quantity: number
    selectedSize: string
    selectedColor: string
  }>
}
```

Payment 忽略客户端提供的商品名称、价格、currency 或 Stripe Price ID。

### 8.2 规范化和 request hash

- quantity 必须为正的安全整数。
- productId 必须存在于已同步 Payment Catalog。
- selectedSize/selectedColor 必须属于目录快照允许值。
- 相同 productId、size 和 color 的行合并数量。
- 规范化后按 productId、size、color 排序。
- 对规范化 JSON 计算 SHA-256，得到 `requestHash`。

### 8.3 创建流程

1. 在 PostgreSQL 中按 `(userId, clientRequestId)` 查找或创建 `CheckoutAttempt`。
2. 已存在且 request hash 不同，返回 HTTP 409 和 `IDEMPOTENCY_KEY_REUSED`。
3. 已存在且 hash 相同、Stripe Session 已在本地确认，先向 Stripe 查询状态；`open` / `complete` 返回原 `clientSecret`，确认 `expired` 返回 `409 CHECKOUT_SESSION_EXPIRED`。无法确认状态时不自动创建替换 Session。
4. 新记录写入服务端解析的价格、商品和选项快照，初始 `paymentStatus` 为 `CREATING`、version 为 0。
5. 在数据库事务外调用 Stripe，idempotency key 为 `checkout-session:{attemptId}:v1`。
6. Stripe Session metadata 和 PaymentIntent metadata 写入 `paymentAttemptId`、`orderId`、`userId`。
7. 条件更新本地记录的 Stripe IDs、client secret 和 `OPEN` 状态。
8. Stripe 调用结果不确定时保持 `CREATING`，返回 HTTP 503 和 `CHECKOUT_CREATION_RETRYABLE`；客户端使用同一 Idempotency-Key 重试。
9. 永久 Stripe 参数错误记录为 `FAILED`，返回稳定错误码。

响应保持现有字段并增加标识：

```ts
{
  checkoutSessionClientSecret: string
  paymentAttemptId: string
  orderId: string
}
```

`return_url` 使用 `CLIENT_APP_URL`，不再硬编码 localhost。

### 8.4 Update · 2026-09-26：Session 复用与 Client 换键

- 后端复用已确认 Session 前查询 Stripe 状态；只有确认 `expired` 才返回 HTTP 409 和稳定错误码 `CHECKOUT_SESSION_EXPIRED`。`open` / `complete` 仍复用原记录，不自动开启另一笔支付。
- Client 收到这一特定错误后生成新 `Idempotency-Key`，对应新的 CheckoutAttempt；每次 helper 调用最多额外自动请求一次，不无限换键。
- 同一购物车的并发过期响应复用第一个请求生成的替换 key；如果等待期间购物车 fingerprint 已变化或 key 被清除，Client 抛出本地错误 `CHECKOUT_REQUEST_CHANGED`，不覆盖新的支付尝试。该错误不是后端 API 错误码。
- 网络失败、状态查询失败和创建结果未知时保留原 key；不能把超时当成原 Session 不存在的证据。已知过期 Session 的替换，不解决第 16.1 节的长故障恢复边界。
- 浏览器 helper 将注入的 `fetch` 解构为独立函数再调用，避免 `dependencies.fetch(...)` 将依赖对象作为 receiver 导致 `Illegal invocation`。这里没有新增数据库字段或迁移。

## 9. Stripe Webhook 接收与处理

### 9.1 HTTP handler

Webhook handler 只执行：

1. 从 raw body 和 `stripe-signature` 验证签名。
2. 以 Stripe `event.id` 插入 `StripeWebhookInboxEvent`。
3. 插入成功或 event ID 已存在时返回 HTTP 200。

签名错误返回 HTTP 400；数据库写入失败返回 HTTP 500，使 Stripe 重试。handler 不调用 Stripe API、不读取 Line Items、不直接调用 Kafka。

环境变量改为 `STRIPE_WEBHOOK_SECRET`；不保留旧拼写变量兼容。

### 9.2 Webhook worker

worker 使用 claim token、lease 和 heartbeat 认领 Inbox。处理时：

1. 从 metadata、Session ID 或 PaymentIntent ID 定位 `CheckoutAttempt`。
2. 校验 user、amount、currency 和 Stripe IDs 与本地快照一致。
3. 使用 `SELECT ... FOR UPDATE` 锁定 attempt。
4. 根据合法状态机计算新状态。
5. 只有产生对外可见变化时递增 `version`。
6. 在同一 PostgreSQL 事务内更新 attempt、写 Payment Outbox、标记 Webhook Inbox 已处理。
7. 无关 Stripe event 标记 `IGNORED`。

需要额外 Stripe 查询才能解析 PaymentIntent 或 Charge 的事件，在数据库事务外查询；查询失败按临时错误重试，不能长时间持有数据库锁。

临时错误最多自动重试 8 次，退避从 5 秒开始、30 分钟封顶并加入 jitter。结构不匹配、金额不匹配或无法归属的事件立即标记 `FAILED`，等待人工检查或对账。

## 10. 支付状态机

支付结果、退款和争议是三个正交维度，不能塞进同一个枚举，否则部分退款与争议同时存在时会覆盖信息。

`PaymentStatus`：

```text
CREATING
OPEN
PROCESSING
SUCCEEDED
FAILED
CANCELED
EXPIRED
```

`RefundStatus`：

```text
NONE
PARTIAL
FULL
```

`DisputeStatus`：

```text
NONE
OPEN
WON
LOST
```

主要映射：

| Stripe 事件                                | 条件                    | 本地变化                     |
| ------------------------------------------ | ----------------------- | ---------------------------- |
| `checkout.session.completed`               | `payment_status = paid` | `paymentStatus = SUCCEEDED`  |
| `checkout.session.completed`               | 尚未支付                | `paymentStatus = PROCESSING` |
| `checkout.session.async_payment_succeeded` | -                       | `paymentStatus = SUCCEEDED`  |
| `checkout.session.async_payment_failed`    | 未成功                  | `paymentStatus = FAILED`     |
| `checkout.session.expired`                 | 未成功                  | `paymentStatus = EXPIRED`    |
| `payment_intent.payment_failed`            | 未成功                  | `paymentStatus = FAILED`     |
| `payment_intent.canceled`                  | 未成功                  | `paymentStatus = CANCELED`   |
| `charge.refunded`                          | refund amount 小于总额  | `refundStatus = PARTIAL`     |
| `charge.refunded`                          | refund amount 等于总额  | `refundStatus = FULL`        |
| `charge.dispute.created`                   | 已支付                  | `disputeStatus = OPEN`       |
| `charge.dispute.closed`                    | won                     | `disputeStatus = WON`        |
| `charge.dispute.closed`                    | lost                    | `disputeStatus = LOST`       |

状态规则：

- `paymentStatus = SUCCEEDED` 不能被旧的失败、取消或过期事件回退。
- `amountRefunded` 只接受 Stripe 当前对象中的权威金额，不根据事件到达次数累加。
- 退款变化只修改 refund 维度，争议变化只修改 dispute 维度；两者可以同时存在。
- 重复事件由 event ID 去重。
- 不同事件导致的相同状态且完整投影快照也未变化时，不递增 version、不重复发布生命周期事件。
- 状态不变但权威 email、shipping 或 Stripe identifiers 补齐/变化时，视为投影变化，递增 version 并重新发布完整快照。
- 对账确认的状态变化和 Webhook 状态变化使用相同状态机函数。

> **Update · 2026-09-26：退款覆盖边界。** 当前基于 `charge.refunded` 和权威退款金额投影 `NONE/PARTIAL/FULL`；这不是退款请求的完整生命周期。退款失败、取消及相应对账修正仍待实现，不能把已有金额投影理解为所有退款场景都已覆盖。

## 11. Payment Outbox 发布

Payment Outbox worker：

- 使用数据库 lease 和 claim token 支持多实例。
- 按记录中的 topic 和 message key 发布。
- 同一记录重试时保持相同 envelope ID。
- 成功后条件更新为 `PUBLISHED`。
- Kafka 成功但数据库确认失败时会重复发布，由下游 Inbox 去重。
- 对同一 aggregate 优先发布较低 version；即使极端情况下发生乱序，Order 仍使用完整快照和 version fence 保证结果正确。

## 12. Order MongoDB 模型

### 12.1 连接要求

- `DATABASE_URL` 必须包含 `replicaSet=rs0` 或部署环境的 replica set 名称。
- Order Service 必须 `await mongoose.connect(...)` 成功后再启动 HTTP Server 和 Kafka consumer。
- 启动时执行一次事务能力检查；不支持事务时服务启动失败，而不是降级到非事务写入。

### 12.2 `PaymentEventInbox`

```text
eventId            unique
orderId
aggregateVersion
eventType
payload
status             PENDING | PROCESSING | PROCESSED | FAILED
attempts
nextAttemptAt
leaseUntil
claimToken
lastError
receivedAt
processedAt
```

Kafka handler 完成运行时校验后只负责插入 Inbox。插入成功或 event ID 已存在后即可提交 offset；Mongo 写入失败必须抛出异常，不得吞掉。

### 12.3 `RejectedPaymentEvent`

无法解析为 JSON 或合法 envelope 的消息不能永久阻塞 partition。Kafka consumer API 增加 topic、partition、offset、key 等 metadata，并允许 topic 注册 invalid-message handler；Order 将原始消息和验证错误写入 `RejectedPaymentEvent`，以 `topic:partition:offset` 作为唯一键。记录成功后允许提交 offset，并在管理接口中显示。

`RejectedPaymentEvent` 使用 30 天 TTL。已处理或忽略的 Stripe Webhook Inbox 同样在 30 天后由清理任务删除；FAILED Webhook 在人工处理前保留。

### 12.4 `Order`

新 Order 使用以下可靠性字段：

```text
orderId                   unique
paymentAttemptId          unique
stripeCheckoutSessionId   unique
stripePaymentIntentId     partial unique
paymentVersion
paymentStatus
refundStatus
disputeStatus
userId
email
amountTotal
amountRefunded
currency
products
shipping
createdAt / updatedAt
```

Order 保存和 Payment 相同的 `paymentStatus`、`refundStatus`、`disputeStatus`，不通过一个互斥枚举丢失组合状态。只有 `paymentStatus = SUCCEEDED` 或更晚的退款/争议事件会创建 Order。

支付失败、取消或过期不创建 Order。Order worker 仍处理并确认这些事件，使 Payment 知道下游已经应用该版本。

### 12.5 `OrderOutboxEvent`

保存 `order.payment.applied` 事件，包含 topic、message key、payload、lease、attempts、nextAttemptAt、publishedAt 和 lastError。它与 Order 更新、Inbox 完成状态在同一个 MongoDB transaction 中提交。

## 13. Order 消费与投影

### 13.1 Kafka consumer

1. 等待 MongoDB 连接成功。
2. `await consumer.subscribe(...)`。
3. JSON 解析失败时通过 invalid-message handler 写 `RejectedPaymentEvent`。
4. 校验 envelope 和 snapshot。
5. 合法事件写 `PaymentEventInbox`。
6. 结构非法事件写 `RejectedPaymentEvent`。
7. MongoDB 写入失败时重抛，让 Kafka 不提交 offset。

日志只记录 event ID、order ID、event type、version 和错误摘要，不打印 email、address 或完整 payload。

### 13.2 Order worker transaction

worker 使用 claim token、lease 和 heartbeat 认领 Inbox，然后在 MongoDB transaction 中：

1. 读取当前 Order。
2. `incomingVersion > paymentVersion` 时应用完整快照。
3. `incomingVersion <= paymentVersion` 时不修改 Order。
4. 将 Inbox 标记为 `PROCESSED`。
5. 创建 `OrderOutboxEvent` 应用确认。

即使重放事件与当前 Order version 相同，也创建针对该次 inbound event 的应用确认。这使 Payment 对账可以通过新 event ID 重放同一 version 并重新获得确认。

临时错误最多自动处理 8 次，采用 5 秒至 30 分钟的 capped exponential backoff 和 jitter。耗尽后标记 `FAILED`；管理员可以将它重置为 `PENDING`。

### 13.3 Order Outbox worker

- 使用 lease 和 claim token。
- 发布 `order.payment.applied`，key 为 `orderId`。
- 失败持续重试，不丢弃记录。
- Kafka 成功但 MongoDB 确认失败会重复发布，Payment Inbox 去重。

## 14. Order 应用确认

Payment consumer 接收 `order.payment.applied` 后，在一个 PostgreSQL 事务中：

1. 插入 `OrderProjectionInboxEvent`。
2. 仅当 `appliedVersion` 大于当前 `orderAppliedVersion` 时更新 `CheckoutAttempt.orderAppliedVersion`、`orderAppliedAt` 和 `orderExists`。
3. 重复 event ID 或过期 version 直接忽略。

因此 Payment 可以区分：

- 支付尚未完成。
- 支付已成功但订单投影待处理。
- Order 已应用最新支付 version。

## 15. Client 和查询 API

### 15.1 Client

- 每轮支付生成一个 UUID `Idempotency-Key`，保存在 `sessionStorage`。
- 相同支付尝试的网络重试继续使用同一 key。
- 用户明确返回购物车并开始新一轮支付时生成新 key。
- 发送精简 Checkout cart，不再发送整个 Product 对象。
- Order 确认前不显示最终“订单已创建”。
- Order 确认后清理 cart 和本次 idempotency key。

### 15.2 Session 状态查询

保留：

```text
GET /sessions/:sessionId
```

该接口必须认证，并以 `sessionId + userId` 查询本地 `CheckoutAttempt`，不能接受用户查询他人的 Session。响应不直接依赖 Stripe 在线可用性：

```ts
{
  paymentAttemptId: string
  orderId: string
  paymentStatus: PaymentStatus
  refundStatus: RefundStatus
  disputeStatus: DisputeStatus
  orderStatus: 'NOT_CREATED' | 'PENDING' | 'CONFIRMED'
  amountTotal: number
  currency: 'usd'
}
```

## 16. 对账与管理接口

### 16.1 自动对账

每 15 分钟执行：

- `CREATING` 长时间未确认：使用同一 Stripe idempotency key 恢复创建或确认 Session。
- `OPEN/PROCESSING`：查询 Stripe 当前 Session/PaymentIntent 状态，通过相同状态机补状态变化。
- Stripe 已成功而本地仍未成功：生成本地状态和 Outbox。
- Payment 最新 version 长时间没有 `orderAppliedVersion`：生成新的 replay Outbox event ID，携带相同完整快照和 aggregate version。
- Order Inbox/Outbox worker 自身继续处理到期任务；FAILED 任务进入管理汇总。

对账不得直接跨库修改 Order，也不得绕过 Inbox/Outbox。

> **Update · 2026-09-26：长故障恢复边界。** 同一 Stripe idempotency key 的恢复依赖第三方仍保留原响应；不能假定它永久有效。原 Session 已创建但本地未确认且超过该保留边界时，当前没有完整的“先可靠定位原 Session，再决定恢复或转人工处理”协议。上面的创建恢复与第 18 节相关保证受这一边界限制，不能承诺任意停机时长后都不会多建 Session。这与已知 Session 被确认 `expired` 后创建新 attempt 是不同问题。

### 16.2 管理接口

由各服务现有管理员认证中间件保护。Payment Service 提供：

```text
GET  /payment-order-sync/summary
GET  /payment-order-sync/:orderId
POST /payment-order-sync/:orderId/retry
POST /payment-order-sync/reconcile
```

Order Service 提供：

```text
GET  /order-projection-sync/summary
GET  /order-projection-sync/:orderId
POST /order-projection-sync/:orderId/retry
```

> **Update · 2026-09-26：** 以上是当前服务实际挂载的路径，不带 `/admin` 前缀；管理员限制由 `shouldBeAdmin` 中间件实现，不取决于路径名称。Admin 页面 `/payment-sync` 与这些后端接口路径也不是同一个概念。

Admin UI 分别读取两组接口并按 orderId 展示，不增加 Payment 到 Order 的同步 HTTP 依赖。接口展示 attempt 状态、version、Stripe IDs、Inbox/Outbox、orderAppliedVersion、最后错误和重试次数。响应不得返回完整 Webhook payload 或完整支付凭据。

## 17. 重试、错误分类与可观察性

### 17.1 临时错误

- PostgreSQL/MongoDB 临时不可用。
- Kafka 不可用。
- Stripe 网络超时、429 或 5xx。
- worker 在 lease 期间崩溃。

这些错误保留任务并退避重试。

### 17.2 永久错误

- 无法归属 CheckoutAttempt。
- amount/currency/user 不匹配。
- event 或 envelope 结构非法。
- 非法状态转换。
- Stripe 返回确定的参数或权限错误。

这些错误进入 FAILED 或 Rejected 状态，保留错误摘要，等待人工重试或对账。

### 17.3 日志与指标

日志使用 event ID、attempt ID、order ID、type、version、attempt count 和错误分类。禁止记录 Stripe Webhook 完整 payload、client secret、email、shipping address 或 authorization token。

至少提供以下汇总计数：

- Webhook Inbox RECEIVED/PROCESSING/FAILED。
- Payment Outbox PENDING 及最老事件年龄。
- Order Inbox PENDING/FAILED。
- Order Outbox PENDING 及最老事件年龄。
- SUCCEEDED 但 Order 尚未确认的 attempt 数量。
- RejectedPaymentEvent 数量。

## 18. 故障窗口保证

| 故障窗口                                  | 结果与恢复                                       |
| ----------------------------------------- | ------------------------------------------------ |
| Stripe Session 创建成功、Payment 更新失败 | 相同 Stripe idempotency key 重试返回同一 Session |
| Stripe 重复发送 Webhook                   | Stripe event ID Inbox 去重                       |
| Webhook 持久化前 Payment 崩溃             | HTTP 未成功，Stripe 重试                         |
| Webhook 持久化后 worker 崩溃              | lease 到期后重新认领                             |
| Payment 状态已提交、Kafka 不可用          | Payment Outbox 持续重试                          |
| Kafka send 成功、Outbox 确认失败          | 重复发布，下游 Inbox 去重                        |
| Kafka 重复投递 Order                      | PaymentEventInbox 去重                           |
| Order transaction 中途失败                | Order、Inbox 完成状态和 Order Outbox 一起回滚    |
| Order 成功、确认消息发布失败              | Order Outbox 持续重试                            |
| 事件乱序                                  | orderId key、完整快照和 aggregateVersion fence   |
| Stripe Webhook 丢失                       | 15 分钟对账补偿                                  |
| Payment 已成功但确认长期缺失              | replay 同 version 的新事件并重新获得 Order ack   |

## 19. 数据库和基础设施变更

### 19.1 Payment PostgreSQL

- 新增 `CheckoutAttempt`。
- 新增 `StripeWebhookInboxEvent`。
- 新增 `OrderProjectionInboxEvent`。
- 泛化 `PaymentOutboxEvent`。
- 扩展 `StripeCatalogItem` 的 sizes/colors snapshot。
- 生成 Prisma migration 和 client。

### 19.2 MongoDB

- 使用 `mongod --replSet rs0 --bind_ip_all` 启动本地 MongoDB。
- 对现有本地实例执行一次 `rs.initiate(...)`。
- 连接串增加 `replicaSet=rs0`。
- 创建 PaymentEventInbox、OrderOutboxEvent、RejectedPaymentEvent 集合及唯一/查询索引。
- 不自动删除或重置本地已有数据库；如果旧开发数据阻塞唯一索引，停止并报告精确冲突。

### 19.3 环境变量

在 example env 和迁移文档中增加：

```text
PAYMENT_DATABASE_URL
STRIPE_WEBHOOK_SECRET
CLIENT_APP_URL
PAYMENT_RECONCILIATION_INTERVAL_MS
```

Order 的 `DATABASE_URL` 示例必须包含 replica set 参数。实际 `.env` 只追加变量，不输出或提交 secret。

## 20. 测试策略

### 20.1 单元测试

使用 `node:test` 和 fake gateway/repository 覆盖：

- cart 规范化和 request hash。
- Checkout idempotency key 重用和 payload mismatch。
- Stripe timeout 后使用同一 idempotency key。
- Webhook event 校验和 Stripe 类型映射。
- `completed` 未支付进入 PROCESSING。
- 状态机合法转换和禁止回退。
- 退款金额、部分退款和争议转换。
- envelope 运行时验证。
- aggregate version fence。
- worker retry、backoff、lease 和 heartbeat。

### 20.2 PostgreSQL 集成测试

使用独立 `TEST_PAYMENT_DATABASE_URL` 验证：

- CheckoutAttempt 唯一约束。
- Webhook Inbox 去重。
- Payment 状态与 Outbox 同事务提交/回滚。
- Order ack Inbox 与 orderAppliedVersion 同事务。
- Outbox 发布失败、重复发布和 lease 重新认领。

### 20.3 MongoDB 集成测试

使用独立 Mongo replica set 测试 URL 验证：

- consumer 重复插入 Inbox。
- Order、Inbox 完成状态和 Order Outbox 的事务提交/回滚。
- 重复、乱序和过期 version。
- worker 崩溃后的 lease 重新认领。
- FAILED 任务人工重置。
- 相同 version replay 重新生成 ack。

### 20.4 Client 和人工冒烟

- 未同步目录返回 `CATALOG_SYNC_PENDING`。
- 相同 Checkout 尝试重复请求只创建一个 Stripe Session。
- Stripe Test Mode 正常支付创建一个 Order。
- 异步 payment processing 不提前显示完成。
- 人工停止 Kafka 后恢复，订单最终创建。
- 人工停止 Order Service 后恢复，Inbox 最终处理。
- Stripe Test Mode 退款/争议事件正确投影。
- 非本人 Session 状态查询被拒绝。

### 20.5 最终验证

```text
相关 node:test
Catalog Sync 回归（原设计基线为 34 个，当前数量以运行输出为准）
pnpm check-types
pnpm lint
pnpm build
Stripe Test Mode 人工冒烟
```

**Update · 2026-09-26：验证范围。** 这是验证清单，不是全部已通过的记录。`pnpm test:catalog-sync` / `pnpm test:payment-order` 当前不执行 Client helper 测试，需从仓库根目录额外运行：

```bash
pnpm --filter payment-service exec tsx --test ../../apps/client/src/lib/checkoutSession.test.ts ../../apps/client/src/types.test.ts
```

记录实际运行的命令、commit、通过/跳过数量和人工冒烟范围。未设置独立 `TEST_PAYMENT_DATABASE_URL` / `TEST_ORDER_DATABASE_URL` 时，真实数据库集成测试会跳过，不能据此宣称数据库事务或并发故障窗口已验证；fake `fetch` 测试也不能替代浏览器支付确认冒烟。

## 21. 实施与启用顺序

由于不存在正式用户和兼容要求，采用干净切换：

1. 将本地 MongoDB 转为单节点 replica set，并验证事务。
2. 应用 Payment Prisma migration 和 Mongo 索引。
3. 创建新 Kafka topics。
4. 扩展 Catalog snapshot 并执行 Product backfill。
5. 部署或启动新版 Order consumer、Inbox worker 和 Outbox worker。
6. 部署或启动新版 Payment Checkout、Webhook worker 和通用 Outbox worker。
7. 更新 Client 和 Admin。
8. 删除旧 `payment.successful` 代码路径。
9. 运行自动测试和 Stripe Test Mode 冒烟。

不实现双写，不处理切换前创建的旧 Checkout Session，不保证旧本地 Order 数据符合新模型。

## 22. 文档更新

实现完成后同步更新：

- 根目录 `README.md`。
- 根目录 `migration.md`，加入 Mongo replica set、Payment migration、Kafka topic、Catalog backfill 和启动顺序。
- 根目录 `TODO.md`，将 Payment 到 Order 可靠化标记完成，库存 Saga 保持后续任务。
- Payment、Order、Kafka 和数据库包的相关 README。
- `docs/interview-preparation` 中涉及核心业务链路、分布式事务、Kafka、Stripe 和 MongoDB 的文档，使用明显的 update 标记说明本次可靠性改造。

## 23. 完成标准

只有同时满足以下条件才视为完成：

- Checkout 重试不会创建重复 Stripe Session。
- Webhook 已持久化后才能返回成功。
- Payment 成功状态和 Outbox 事务一致。
- Kafka 和服务故障恢复后订单最终创建。
- 同一 paymentAttemptId/orderId 只存在一个 Order。
- 重复、乱序和旧版本事件不会破坏 Order。
- Order 应用确认最终回写 Payment。
- 对账可以修复故意制造的缺失状态。
- 自动测试、类型检查、lint 和 build 通过。
- Stripe Test Mode 主链路、故障恢复、退款或争议冒烟通过。
- 迁移和本地运行步骤已文档化。
