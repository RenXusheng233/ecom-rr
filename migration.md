# Stripe 商品目录可靠同步迁移手册

本文适用于 `feat/catalog-stripe-reliable-sync` 合并到 `main` 后的首次部署。迁移目标是上线 Product Outbox、独立 payment PostgreSQL、Stripe worker、结果 Outbox 和对账，同时保证现有商品在回填期间仍可结账。

## 1. 变更范围与兼容性

Product PostgreSQL 的迁移是增量变更：

- `Product` 增加 `catalogVersion`、Stripe 同步状态、已同步版本/时间/错误和结果 revision。
- 新增 `ProductOutboxEvent` 及相关 enum、索引和 lease/claim 字段。
- 现有 Product 默认变为 `catalogVersion=1`、`stripeSyncStatus=PENDING`。

Payment PostgreSQL 是新数据库：

- `CatalogInboxEvent` 用 event ID 去重。
- `StripeCatalogItem` 保存期望版本、已应用版本、Stripe Product/Price ID、重试、lease 和 fencing 状态。
- `PaymentOutboxEvent` 可靠发布同步结果。

旧 `main` 的 Prisma Client 会忽略 Product 数据库中的新增列和表，因此增量 migration 已执行但旧代码短暂运行通常仍兼容；不过旧代码不会写 Outbox。不要在没有完整发布计划时提前迁移生产库。

## 2. 发布前准备

1. 确认代码已经合并并构建出同一 commit 的 product-service 和 payment-service 镜像。
2. 备份 Product PostgreSQL，并实际确认备份可读取；生产环境按现有平台完成恢复演练。
3. 创建独立 payment PostgreSQL 数据库和最小权限账号。
4. 确认 Kafka 可创建/使用以下 topic：
   - `catalog.product.sync.requested`
   - `catalog.product.sync.result`
5. 确认 Stripe 使用预期账户；先在 Test Mode 完成全流程冒烟。
6. 保持所有已有 `.env` 内容不变，只追加新变量。

## 3. 环境变量

Product Service 追加：

```dotenv
CATALOG_SYNC_ENFORCEMENT=false
```

Payment Service 追加：

```dotenv
PAYMENT_DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/ecom_payment?schema=public
CATALOG_SYNC_ENFORCEMENT=false
```

继续保留原有 `DATABASE_URL`、Clerk、Stripe 和 Kafka 配置。不要把真实 secret 提交到 Git。

## 4. 在非生产环境验证 migration

使用独立数据库 URL，不要指向共享生产库：

```bash
DATABASE_URL=postgresql://... pnpm --filter @repo/product-db db:generate
PAYMENT_DATABASE_URL=postgresql://... pnpm --filter @repo/payment-db db:generate

DATABASE_URL=postgresql://... pnpm --filter @repo/product-db db:deploy
PAYMENT_DATABASE_URL=postgresql://... pnpm --filter @repo/payment-db db:deploy
```

随后执行：

```bash
pnpm test:catalog-sync
pnpm check-types
pnpm lint
PAYMENT_DATABASE_URL=postgresql://... pnpm build
```

验证 Product 新字段默认值、两张 Outbox/Inbox 流转、worker lease 重新认领以及重复事件不会重复产生 Stripe 副作用。

## 5. 生产分阶段发布

### 阶段 A：扩展 schema

先执行 migration，不启用强制可售过滤：

```bash
DATABASE_URL=postgresql://... pnpm --filter @repo/product-db db:deploy
PAYMENT_DATABASE_URL=postgresql://... pnpm --filter @repo/payment-db db:deploy
```

迁移文件：

- `packages/product-db/prisma/migrations/20260824000000_add_catalog_outbox/migration.sql`
- `packages/payment-db/prisma/migrations/20260824000000_init_payment_catalog/migration.sql`

### 阶段 B：部署双 worker

部署 product-service 和 payment-service，确保两边都是：

```dotenv
CATALOG_SYNC_ENFORCEMENT=false
```

检查：

- 两个服务成功连接 Kafka。
- Payment Service 成功连接 payment PostgreSQL。
- 新建商品可产生 requested event、Stripe 对象和 result event。
- worker 日志没有持续数据库、Kafka 或 Stripe 错误。

### 阶段 C：回填现有商品

只运行一次回填命令；脚本按商品 ID/版本/操作唯一键幂等：

```bash
DATABASE_URL=postgresql://... pnpm --filter product-service catalog-sync:backfill
```

重复执行不会创建同版本的第二条 Product Outbox，但仍应记录每次执行时间和结果。

### 阶段 D：对账并清零

使用管理员身份检查：

```text
GET  /catalog-sync/summary
GET  /catalog-sync/:productId
POST /catalog-sync/:productId/retry
POST /catalog-sync/reconcile
```

进入下一阶段前必须满足：

- Product Outbox 无长期积压。
- payment ledger 无 `PENDING`、`PROCESSING` 或 `FAILED`。
- 首次全量对账 `drifted=0`。
- 已知 managed orphan 已归档；无法确认归属的历史 Stripe 对象只有报告、没有自动修改。
- 使用 Stripe Test Mode 验证创建、改名、改价、归档、429/网络恢复和手工漂移修复。

### 阶段 E：开启强制可售

把 product-service 和 payment-service 的配置同时改为：

```dotenv
CATALOG_SYNC_ENFORCEMENT=true
```

滚动发布后确认：

- 公共列表/详情只返回 `SYNCED` 且版本一致的商品。
- Checkout 只使用 payment DB 中已确认的 Stripe Price ID。
- 未同步商品返回 HTTP 409 和 `CATALOG_SYNC_PENDING`。
- Admin 仍能看到全部状态和最后错误。

## 6. 回退策略

应用异常但 schema 正常时：

1. 先把两边 `CATALOG_SYNC_ENFORCEMENT=false`，恢复 legacy server-side Stripe Price fallback。
2. 停止 catalog worker/dispatcher 的新实例，保留数据库记录用于排查。
3. 回退到上一个应用版本；新增表和列保持不动，不执行破坏性 down migration。
4. 修复后重新部署 worker、重跑 backfill 和 reconcile，再开启 enforcement。

如果 migration 本身失败，停止发布并使用数据库平台的事务/备份恢复流程。不要手工删除 enum、列或 Outbox 记录；这些操作可能让已发布 Kafka 事件失去审计依据。

## 7. 发布后观察

至少观察一个完整业务高峰和 24 小时自动对账周期：

- Product/Payment Outbox pending 数量和最老事件年龄。
- Catalog worker retry、FAILED、lease reclaim 和 stale invalidation。
- Kafka consumer lag、rebalance 和 publish error。
- Stripe 429、5xx、timeout 和 reconciliation drift。
- Checkout 409 `CATALOG_SYNC_PENDING` 比例。

Stripe Webhook → Order Service 的可靠性不在本次迁移范围，后续工作见根目录 [TODO.md](./TODO.md)。
