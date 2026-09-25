# 商品目录与 Payment → Order 可靠性迁移手册

> Update · 2026-09-18：本手册覆盖 Product → Stripe 目录同步以及 Stripe Webhook → Payment → Order 两条可靠链路。当前项目是本地开发环境、没有正式用户，因此不提供旧支付消息和旧订单文档的双读兼容；启动新版 Order Service 前必须隔离旧 `orders` collection。
>
> Update · 2026-09-25：本地 Order MongoDB 改用新的 `mongo-order-replset-db` 单节点 replica set，映射端口 `27018`，数据持久化到 `/Users/renxusheng/Documents/sql/ecom-rr-mongo-order-replset-db`。新数据库为空时不需要迁移旧 `orders` collection；下文的旧集合处理仅适用于复用原数据库。

## 1. 本次结构变化

Product PostgreSQL 保留上一阶段的增量结构：

- `Product` 的 catalog version、同步状态和最后错误；
- `ProductOutboxEvent` 的快照、lease、claim token、重试和发布状态。

Payment PostgreSQL 在目录表之外新增：

- `CheckoutAttempt`：Checkout 幂等键、服务端商品快照、支付/退款/争议状态、Order Ack 版本；
- `StripeWebhookInboxEvent`：以 Stripe `event.id` 去重并保存处理状态；
- 泛化的 `PaymentOutboxEvent`：保存 topic、message key、事件类型和完整 envelope；
- `OrderProjectionInboxEvent`：对 `order.payment.applied` Ack 去重。

Order MongoDB 继续使用 MongoDB，但模型改为：

- `PaymentEventInbox`；
- 版本化 `Order` 完整投影；
- `OrderOutboxEvent`；
- `RejectedPaymentEvent`（30 天 TTL）。

Order 的三项写入使用 MongoDB 多文档事务，因此 MongoDB 必须运行在 replica set 中。本地只需一个 Mongo 节点，不需要三个容器。

## 2. 停机、备份和回退原则

1. 停止 Order、Payment 和 Product Service，避免迁移期间继续写入。
2. 备份 Product/Payment PostgreSQL 和需要保留的 MongoDB 数据。
3. 不执行破坏性 down migration。应用回退时保留新增表、列和事件记录；旧代码通常会忽略新增 PostgreSQL 结构，但不会继续可靠链路。
4. 当前本地使用新的 MongoDB 容器和数据目录；保留旧容器的数据卷即可保留旧订单备份，不需要将旧数据复制到新库。
5. 仅在复用旧 Order 数据库时，才需要在新版服务创建唯一索引前隔离旧 `orders` collection；旧文档缺少新版唯一键，不能与新模型共用 collection。

## 3. 本地单节点 MongoDB replica set

当前本地实例使用 `mongo:latest`、容器名 `mongo-order-replset-db`、宿主机端口 `27018` 和 replica set 名 `rs0`。`mongod` 在容器内也监听 `27018`，因此成员地址与宿主机连接地址一致。首次创建空目录时执行：

```zsh
mkdir -p /Users/renxusheng/Documents/sql/ecom-rr-mongo-order-replset-db/db
mkdir -p /Users/renxusheng/Documents/sql/ecom-rr-mongo-order-replset-db/configdb
openssl rand -base64 756 > /Users/renxusheng/Documents/sql/ecom-rr-mongo-order-replset-db/configdb/keyfile
chmod 400 /Users/renxusheng/Documents/sql/ecom-rr-mongo-order-replset-db/configdb/keyfile

read -rs 'MONGO_INITDB_ROOT_PASSWORD?MongoDB 管理员密码: '
echo
export MONGO_INITDB_ROOT_PASSWORD
docker run --name mongo-order-replset-db \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD \
  -p 127.0.0.1:27018:27018 \
  -v /Users/renxusheng/Documents/sql/ecom-rr-mongo-order-replset-db/db:/data/db \
  -v /Users/renxusheng/Documents/sql/ecom-rr-mongo-order-replset-db/configdb:/data/configdb \
  --restart unless-stopped \
  -d mongo:latest \
  --replSet rs0 --bind_ip_all --port 27018 \
  --keyFile /data/configdb/keyfile
unset MONGO_INITDB_ROOT_PASSWORD
```

当前容器已经创建时不要重复执行 `docker run`，也不要覆盖现有 keyfile。进入容器的 Mongo Shell（会提示输入管理员密码），并且只初始化一次：

```zsh
docker exec -it mongo-order-replset-db mongosh \
  --host 127.0.0.1 --port 27018 \
  --username admin --authenticationDatabase admin
```

```javascript
rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27018' }] })
rs.status()
```

Order Service 与独立的集成测试数据库分别使用：

```dotenv
DATABASE_URL="mongodb://admin:YOUR_PASSWORD@localhost:27018/mongo-order-replset-db?authSource=admin&replicaSet=rs0&directConnection=true"
TEST_ORDER_DATABASE_URL="mongodb://admin:YOUR_PASSWORD@localhost:27018/mongo-order-replset-db-test?authSource=admin&replicaSet=rs0&directConnection=true"
```

这里的 `localhost` 和 `directConnection=true` 适用于 Order Service 在宿主机运行的本地开发环境。若服务改为在另一个容器中运行，需重新配置可达的连接地址与副本集成员地址。

## 4. 环境变量

Product Service：

```dotenv
CATALOG_SYNC_ENFORCEMENT=false
```

Payment Service：

```dotenv
PAYMENT_DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/ecom_payment?schema=public
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
CLIENT_APP_URL=http://localhost:3000
PAYMENT_RECONCILIATION_INTERVAL_MS=900000
CATALOG_SYNC_ENFORCEMENT=false
```

只在各应用现有 `.env` 末尾追加缺少的变量，不提交真实 secret。旧拼写 `STRIPE_WEBHOOK_SECRECT` 已移除，不再兼容。

## 5. PostgreSQL migration 与 Prisma Client

迁移文件：

- `packages/product-db/prisma/migrations/20260824000000_add_catalog_outbox/migration.sql`
- `packages/payment-db/prisma/migrations/20260824000000_init_payment_catalog/migration.sql`
- `packages/payment-db/prisma/migrations/20260918000000_add_payment_order_reliability/migration.sql`

先在独立本地/测试数据库执行：

```bash
DATABASE_URL=postgresql://... pnpm --filter @repo/product-db db:generate
PAYMENT_DATABASE_URL=postgresql://... pnpm --filter @repo/payment-db db:generate

DATABASE_URL=postgresql://... pnpm --filter @repo/product-db db:deploy
PAYMENT_DATABASE_URL=postgresql://... pnpm --filter @repo/payment-db db:deploy
```

迁移是增量的，不删除 Product/Payment 现有目录数据。MongoDB 没有自动 migration 命令；新版 Order Service 启动时会显式创建索引，并在索引冲突或事务探针失败时停止。

新建的 `mongo-order-replset-db` 为空，不需要执行集合迁移。以下步骤仅适用于复用旧 Order 数据库：旧 `orders` 文档缺少 `orderId`、`paymentAttemptId` 和 Stripe IDs，多个旧文档会让新版唯一索引因重复的 missing/null key 构建失败。因此，在第一次启动新版 Order Service 前，需要先将旧 collection 重命名备份。示例中的数据库名和备份名需要按本地环境替换：

```javascript
// Run in mongosh against the Order database before starting the new service.
db.orders.renameCollection('orders_legacy_pre_reliability_20260918')
```

如果 `orders` 不存在则无需操作；如果备份名已存在，请换一个尚未使用的名字。新版服务随后会创建新的空 `orders` collection。旧备份不会被新版代码读取。

## 6. Kafka topics

本链路使用以下四个 topics；旧的 `product.created`、`product.deleted` 和 `payment.successful` 暂时保留，不需要删除：

```text
catalog.product.sync.requested
catalog.product.sync.result
payment.order.lifecycle
order.payment.applied
```

当前本地 Kafka 由三个 Docker broker 组成。宿主机暴露的是 `9094`、`9095`、`9096`，`9092` 仅用于容器网络；因此在 Mac 终端通过 broker 容器显式创建 topics：

```zsh
for topic in \
  catalog.product.sync.requested \
  catalog.product.sync.result \
  payment.order.lifecycle \
  order.payment.applied
do
  docker exec kafka-broker-1 /opt/kafka/bin/kafka-topics.sh \
    --bootstrap-server kafka-broker-1:9092 \
    --create --if-not-exists \
    --topic "$topic" --partitions 3 --replication-factor 3 \
    --config min.insync.replicas=2
done
```

创建后用同一工具的 `--describe --topic TOPIC_NAME` 检查分区数、副本数和 ISR。`--if-not-exists` 不会修改已存在的 topic 配置；生产环境按 broker 数量调整 replication factor，并保证同一 `orderId` 作为 key 进入同一 partition。

## 7. 目录回填与启用顺序

1. 保持 Product/Payment 的 `CATALOG_SYNC_ENFORCEMENT=false`。
2. 启动 Kafka、两个 PostgreSQL、Mongo replica set。
3. 新建空 Mongo 数据库可直接启动新版 Order Service；仅当复用旧数据库时，先确认旧 `orders` 已隔离。启动后检查 Mongo indexes、事务探针、Inbox worker 和 Outbox worker。
4. 部署/启动新版 Payment Service，使 Webhook Inbox、状态 worker、Payment Outbox 和对账任务就绪。
5. 启动 Product Service 并回填目录：

```bash
DATABASE_URL=postgresql://... pnpm --filter product-service catalog-sync:backfill
```

6. 以管理员身份检查并对账：

```text
GET  /catalog-sync/summary
POST /catalog-sync/reconcile
GET  /payment-order-sync/summary
POST /payment-order-sync/reconcile
GET  /order-projection-sync/summary
```

7. 确认目录无长期 `PENDING/PROCESSING/FAILED` 和已知 drift 后，再把 Product/Payment 的 `CATALOG_SYNC_ENFORCEMENT` 改为 `true`。

## 8. Stripe Test Mode 配置和冒烟

Webhook endpoint 指向：

```text
POST https://<ngrok-host>/webhooks/stripe
```

至少订阅：

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
payment_intent.succeeded
payment_intent.payment_failed
payment_intent.canceled
charge.refunded
charge.dispute.created
charge.dispute.closed
```

人工冒烟顺序：

1. 创建/改价商品，确认目录两侧最终 `SYNCED`。
2. Client 发起 Checkout，确认相同 `Idempotency-Key` 重试只得到一个 Session。
3. 完成 Test Mode 支付，确认 Webhook Inbox 为 `PROCESSED`。
4. 确认 Payment Outbox 发布 `payment.order.lifecycle`，Mongo Order 被创建。
5. 确认 Order Outbox 发布 Ack，`CheckoutAttempt.orderAppliedVersion == version` 且 return 页显示 `CONFIRMED`。
6. 重投同一个 Stripe event/Kafka event，确认没有重复订单且版本不倒退。
7. 暂停 Kafka 或 Order Service，再恢复并确认 lease/retry/对账最终收敛。

## 9. 自动验证

```bash
pnpm test:catalog-sync
pnpm test:payment-order
pnpm check-types
pnpm lint
PAYMENT_DATABASE_URL=postgresql://... pnpm build
```

Node 测试不访问 Stripe。本地 `apps/order-service/.env` 中的 `TEST_ORDER_DATABASE_URL` 指向独立的 `mongo-order-replset-db-test`，可用 `pnpm --filter order-service test:integration` 验证 Mongo replica-set 事务；PostgreSQL 回滚测试仍需单独设置 `TEST_PAYMENT_DATABASE_URL`。

## 10. 回退与观察

应用异常时停止新 worker，保留 Inbox/Outbox 行用于重放；回退应用版本但不删除新 schema。恢复后先运行 reconcile，再开放 Checkout。

持续观察：Webhook 验签/落库失败、Inbox 最老 pending 时间、Kafka lag、两侧 Outbox 积压、FAILED 重试数、Stripe 429/5xx、已支付但未收到 Order Ack 的数量。当前仍未覆盖库存预占、主动退款命令、履约 Saga、retry topic/DLQ 和生产级指标告警，见 [TODO.md](./TODO.md)。
