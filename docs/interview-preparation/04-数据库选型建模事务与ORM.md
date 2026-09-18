# 04｜数据库选型、建模、事务与 ORM

> **Reliability Update · 2026-08-24**
>
> **Reliability Update · 2026-09-18：** 当前分支除 Product/Payment 两套 PostgreSQL 目录模型外，还增加 CheckoutAttempt、Stripe Webhook Inbox、Payment lifecycle Outbox、Order Ack Inbox，以及 Mongo Payment Inbox/Order/Outbox 事务边界。原有数据库理论保持不变，更新区块用于区分改造前风险与当前事实。

## 学习目标

- 根据访问模式选择 PostgreSQL、MongoDB 或 Redis。
- 能设计商品、SKU、库存、订单和支付结构。
- 掌握索引、执行计划、事务隔离、锁与并发更新。
- 理解 Prisma、TypeORM、Drizzle、Mongoose 和原生驱动的取舍。

建议耗时：**3.5 小时**。

## 1. 先从当前数据模型出发

### 【当前实现】PostgreSQL + Prisma

`Product` 包含名称、描述、整数价格、sizes/colors 数组、images JSON、分类外键；`Category.slug` 唯一。

**Reliability Update · 2026-08-24：** `Product` 还包含单调递增的 `catalogVersion`、`stripeSyncStatus`、`stripeSyncedVersion`、`stripeSyncedAt` 和 `stripeSyncError`。同库的 `ProductOutboxEvent` 保存事件 ID、商品 ID、版本、UPSERT/ARCHIVE 完整期望快照、发布状态、重试、lease 和错误。

Payment Service 使用独立 PostgreSQL：`CatalogInboxEvent` 按 event ID 去重，`StripeCatalogItem` 保存期望/已应用版本及 Stripe Product/Price ID，`PaymentOutboxEvent` 可靠发布同步结果。Product PostgreSQL 仍是商品期望状态的唯一事实源，Payment DB 是 Stripe 已应用状态与 Checkout Price 的本地账本。

**Payment → Order Update · 2026-09-18：** Payment DB 还保存 `CheckoutAttempt`、按 Stripe `event.id` 唯一的 `StripeWebhookInboxEvent` 和按 Ack event ID 唯一的 `OrderProjectionInboxEvent`。支付状态更新、aggregate version 递增和生命周期 Outbox 在同一 PostgreSQL 事务提交。Order 继续使用 MongoDB，但要求 replica set；worker 在同一 Mongo transaction 提交 Payment Inbox 完成、版本化 Order 全快照和 `order.payment.applied` Outbox。本地单节点 replica set 已满足事务要求，不等于生产必须固定三节点。

优点：

- Category/Product 关系和唯一约束适合关系数据库。
- Prisma schema 提供生成类型与迁移。
- 商品查询支持分类、名称模糊搜索、价格/时间排序。

限制：

- `sizes`、`colors` 与 `images` 适合展示，但无法表达“红色 M 库存 3、蓝色 L 库存 0”的 SKU 组合。
- 没有库存、SKU、品牌、上下架状态、货币和软删除。
- 名称 `contains` 搜索规模增大后需要专用索引或搜索引擎。
- 商品列表常用的 `categorySlug/name/price/createdAt` 尚未显式设计组合索引。

### 【改造前基线】MongoDB + Mongoose

订单文档包含 `userId`、email、amount、status、products 数组、address 和 timestamps。

优点：

- 订单项作为快照嵌入，一次读取即可展示历史订单。
- 商品后来改名或改价，不影响历史记录。
- 单文档写入具有原子性。

限制：

- 状态只有 success/failed，不能表达 pending、paid、fulfilling、shipped、cancelled、refunded。
- 没有 Stripe event/session/payment intent ID 唯一约束，无法天然去重。
- 没有订单号、货币、地址结构化字段、退款和状态历史。
- `userId`、`createdAt`、`status` 应根据查询建立索引。

**Reliability Update · 2026-09-18：** 当前 `Order` 已改为服务端支付快照投影，包含 `orderId/paymentAttemptId/Stripe IDs/paymentVersion` 唯一边界、支付/退款/争议三个状态、分单位金额、货币、结构化 shipping 和商品选项。`stripePaymentIntentId` 使用 partial unique index。`PaymentEventInbox`、Order 更新与 `OrderOutboxEvent` 在 replica-set transaction 中提交，旧版本快照不会覆盖新版本；履约状态和库存仍未建模。

## 2. PostgreSQL、MongoDB、Redis 怎么选

| 维度     | PostgreSQL                   | MongoDB                          | Redis                               |
| -------- | ---------------------------- | -------------------------------- | ----------------------------------- |
| 模型     | 表、关系、约束               | BSON 文档、嵌入/引用             | 内存数据结构                        |
| 强项     | 事务、Join、复杂查询、约束   | 聚合文档、灵活结构、水平扩展工具 | 低延迟、TTL、原子操作               |
| 一致性   | 强事务能力                   | 单文档原子；支持多文档事务       | 单命令原子；持久化/一致性取决于配置 |
| 查询     | SQL，优化器成熟              | 文档查询与 aggregation           | 以 key 和数据结构命令为主           |
| 典型用途 | 订单、支付、库存、商品关系   | 内容、事件快照、灵活聚合文档     | 缓存、session、限流、排行榜         |
| 不适合   | 无限制水平写扩展并非自动获得 | 强关系、多 Join、严格跨文档约束  | 作为默认唯一事实库承载关键交易      |

### 面试选型方法

从访问模式而不是 JSON 长相出发：

1. 事务里需要同时修改哪些数据？
2. 哪些约束必须由数据库保证？
3. 主要查询路径和排序是什么？
4. 数据是一对多嵌入读取，还是需要独立检索和更新？
5. 数据量、增长率、保留期和冷热分布如何？
6. 团队能否运维分片、复制、备份和恢复？

### 订单是否应该放 MongoDB？

可以，但不是因为“订单是 JSON”。订单需要强一致的状态、支付唯一性和库存事务时，PostgreSQL 往往更直接。MongoDB 的嵌入订单项适合快照读取，且单文档原子；一旦库存、支付、退款分散到多集合，仍要处理多文档事务和一致性。真实项目选择要看领域边界和团队经验。

## 3. 生产化电商模型

### 【生产建议】关系模型示意

```text
products
  id, name, description, category_id, status, created_at, updated_at

product_variants (SKU)
  id, product_id, sku(unique), color, size, price_minor,
  currency, version, created_at, updated_at

inventories
  variant_id(PK/FK), available, reserved, version, updated_at

orders
  id, order_no(unique), user_id, status, currency,
  subtotal_minor, discount_minor, shipping_minor, total_minor,
  email_snapshot, address_snapshot(jsonb), created_at, updated_at

order_items
  id, order_id, variant_id(nullable), sku_snapshot, name_snapshot,
  attributes_snapshot(jsonb), unit_price_minor, quantity

payments
  id, order_id, provider, provider_payment_id(unique),
  amount_minor, currency, status, created_at, updated_at

payment_events
  provider_event_id(unique), type, payload_hash, processed_at

outbox_events
  id, aggregate_type, aggregate_id, event_type, payload,
  status, created_at, published_at
```

### 为什么订单项要存快照

`variant_id` 用于追踪当前 SKU，但历史订单不能依赖当前商品名称/价格。订单项同时保存 sku/name/price/attributes 快照，保证审计与售后可重现。

### 金额怎么存

- 使用最小货币单位整数，例如 `$19.99 → 1999` cents，避免浮点误差。
- 同时保存 currency；不是所有货币都有两位小数。
- 折扣、税、运费分别存，不能只存 total，否则难以对账。

## 4. 范式与反范式

- 第一范式：字段原子；不要把可查询关系塞进逗号字符串。
- 第二/第三范式：减少依赖与重复，避免更新异常。
- 反范式：为明确读取路径复制数据，换取少 Join；必须定义谁是权威源、如何同步。

电商常见组合：商品与 SKU 规范化；订单项保存商品快照属于有意反范式。

## 5. 索引：不是越多越好

索引是一份额外有序数据结构，提升读但增加写入、存储和维护成本。

### B-tree 常见能力

适合等值、范围、排序和前缀条件。组合索引 `(user_id, created_at DESC)` 适合“某用户按时间倒序查订单”。

### 组合索引顺序

通常把等值过滤、选择性和排序需求一起考虑：

```sql
CREATE INDEX idx_orders_user_created
ON orders (user_id, created_at DESC);
```

能支持 `user_id = ?`，也支持再按 `created_at` 范围/排序；通常不能高效支持只按 `created_at` 的所有查询。所谓最左前缀是简化理解，最终以执行计划为准。

### 当前项目建议索引

```text
Product: categorySlug + createdAt
Product: categorySlug + price
Product search: lower(name) 或 pg_trgm GIN（模糊包含查询）
Order: userId + createdAt(desc)
Order: status + createdAt
Payment/Event: providerEventId unique
```

### EXPLAIN 关注什么

- Seq Scan 是否合理（小表顺扫不一定差）；
- 估算 rows 与实际 rows 是否偏差大；
- Index Scan/Bitmap Scan；
- Sort 是否落盘；
- loop 次数是否暴露 N+1；
- 总耗时、buffer hit/read。

生产环境谨慎使用 `EXPLAIN ANALYZE`，它会真实执行语句；对写语句尤其小心。

## 6. 分页与 N+1

### Offset 分页

简单、可跳页；深页需要扫描/丢弃大量行，数据变化时可能重复或遗漏。

### Cursor/Keyset 分页

```sql
WHERE (created_at, id) < (:last_created_at, :last_id)
ORDER BY created_at DESC, id DESC
LIMIT 20
```

性能稳定，适合无限滚动和大订单表；不能轻易跳到第 N 页。排序字段需要稳定且带唯一 tie-breaker。

### N+1

先查 N 个订单，再逐个查用户/商品，形成 1+N 次请求。处理方式：Join/include、批量 `IN`、DataLoader、适当嵌入或预计算。不要无脑 include 全关系，以真实字段和查询为准。

## 7. 事务基础

### ACID

- Atomicity：全部成功或全部回滚。
- Consistency：约束和业务不变量保持有效；数据库不会自动理解全部业务规则。
- Isolation：并发事务的相互可见性受控。
- Durability：提交后在承诺的故障范围内可恢复。

### 常见并发现象

- 脏读：读到未提交数据。
- 不可重复读：同一事务两次读同一行不同。
- 幻读：同一条件两次查询出现/消失行。
- 丢失更新：两个事务基于旧值更新，后者覆盖前者。
- 写偏差：两个事务分别更新不同记录，合起来破坏跨行约束。

### PostgreSQL 隔离级别

- Read Committed：默认，每条语句看到开始时已提交快照；同一事务两次查询可能不同。
- Repeatable Read：事务内稳定快照；PostgreSQL 实现还能阻止标准中部分幻读，但并非所有业务不变量自动安全。
- Serializable：模拟串行效果，可能抛 serialization failure，应用必须重试整个事务。

MVCC 通过行版本让读写尽量少互相阻塞，但旧版本需要 vacuum 回收；MVCC 不等于没有锁或没有并发异常。

## 8. 库存扣减案例

### 原子条件更新（优先简单方案）

```sql
UPDATE inventories
SET available = available - :qty,
    version = version + 1
WHERE variant_id = :id
  AND available >= :qty;
```

检查 affected rows：0 表示库存不足或 SKU 不存在。条件判断和更新在数据库同一语句完成，比“先 select 再 update”安全。

### 悲观锁

```sql
SELECT available
FROM inventories
WHERE variant_id = :id
FOR UPDATE;
```

适合冲突高、临界区短的场景。事务必须尽快结束，按固定顺序锁多个 SKU 以降低死锁；发生死锁仍需重试。

### 乐观锁

读取 `version`，更新时 `WHERE id=? AND version=?`。冲突则重新读取和重试。适合读多写少、冲突较低场景。

### 库存预占

支付不是瞬时完成。常见流程：创建订单 → 预占库存并设置过期 → 支付成功转实扣 → 超时释放。需要状态机、定时/延迟任务和幂等；Redis 可辅助过期调度，但数据库仍应保存权威状态。

## 9. 本地事务与分布式一致性

数据库事务只能覆盖同一个事务管理器，不能直接把 PostgreSQL、Stripe、Kafka 和 MongoDB 一起原子提交。

错误方式：数据库 commit 后直接发 Kafka；进程在两步之间崩溃会丢事件。

更可靠方式：在同一数据库事务写业务数据与 `outbox_events`；后台 publisher 读取未发送事件发布 Kafka，成功后标记。消费者仍必须幂等，因为 publisher 可能在“发送成功但标记前”崩溃。

### Reliability Update · 2026-08-24：当前项目如何落地

- Product 创建、更新与删除把业务变更和 `ProductOutboxEvent` 放进同一 Prisma 事务；更新/删除先锁定商品行，版本在锁内单调递增，避免并发请求生成相同或倒退版本。
- Product dispatcher 的 lease 认领和发布确认是短数据库事务；Kafka 网络 I/O 不占用业务事务。发布成功但确认失败只会重复发送，不会丢事件。
- Payment consumer 在一个事务中写 Inbox 并更新 `StripeCatalogItem` 的期望版本，随后允许提交 offset。Stripe 调用由 worker 在事务外执行，避免长网络调用持锁。
- Stripe 成功后，worker 通过“仍是当前期望版本”的条件更新确认结果，并在同一事务写 `PaymentOutboxEvent`；旧版本执行结果不能覆盖新版本。
- Stripe Webhook HTTP handler 只验签并持久化 Inbox；worker 锁定 `CheckoutAttempt` 后更新支付/退款/争议三个正交维度，任何对外投影变化都会递增版本并同事务写 Outbox。
- Mongo Order worker 用 `paymentVersion` fence 应用完整快照；旧版本不覆盖新订单，但同版本重放仍生成 Ack，以修复“Order 已提交、Ack 丢失”的窗口。
- 这条链路的原子性只存在于各自 PostgreSQL 内部；跨 Kafka/Stripe 依赖 at-least-once、唯一键、Stripe idempotency key、版本条件和对账收敛。

详见 [Kafka 章节](./05-Kafka事件驱动与可靠性.md)。

## 10. MongoDB 建模与事务

### 嵌入还是引用

嵌入适合：一起读取、生命周期一致、数量有界。订单项通常适合嵌入。

引用适合：独立更新/查询、多对多、集合可能无界。用户全部订单不能无限嵌入 User 文档。

MongoDB 单文档操作原子；也支持 replica set/sharded cluster 上的多文档事务，但事务成本不应替代合理建模。

需要关注：

- 文档 16MB 限制；
- 大数组持续增长；
- shard key 是否均匀且匹配查询；
- read concern / write concern；
- 事务重试与 transient error。

## 11. ORM/ODM/Query Builder 选型

| 工具         | 优势                                                       | 成本                                | 适合                           |
| ------------ | ---------------------------------------------------------- | ----------------------------------- | ------------------------------ |
| Prisma       | schema 驱动、生成类型、迁移、DX 好                         | 特殊 SQL/高级能力需 raw；抽象要理解 | TS 团队、常规关系业务          |
| TypeORM      | Entity/Decorator、Data Mapper/Active Record、Nest 集成成熟 | 类型与运行时映射复杂，历史 API 较多 | 偏 OOP、既有 Nest 项目         |
| Drizzle      | 接近 SQL、类型推导、轻量                                   | 高层关系能力和生态取舍需评估        | 希望保留 SQL 控制的 TS 团队    |
| Mongoose     | Mongo schema、middleware、validation、模型成熟             | 与 Mongo 原生行为多一层抽象         | Node + MongoDB                 |
| 原生驱动/SQL | 控制和透明度最高                                           | 样板、映射、迁移治理自行承担        | 性能关键、复杂 SQL、基础设施层 |

### 选型回答

> ORM 提升常规 CRUD、类型与迁移效率，但不能替代 SQL 和数据库知识。我会让 80% 常规查询走 ORM，对复杂聚合和性能关键路径使用受测的 raw SQL/query builder；通过 repository 隔离工具，所有慢查询都用执行计划验证。

### Migration 基本原则

- 迁移文件进入版本控制，生产使用 deploy，不在启动时自动做破坏性变更。
- 大表采用 expand/contract：先加可空字段 → 双写/回填 → 切读 → 加约束 → 删除旧字段。
- 索引可考虑并发创建，避免长时间阻塞；具体能力取决于数据库与迁移工具。
- 备份必须配合恢复演练；“有备份”不等于“能恢复”。

本分支采用 additive schema 与分阶段开关：先部署 Product/Payment migration，再以 `CATALOG_SYNC_ENFORCEMENT=false` 启动 worker，回填存量商品并对账，最后开启强制可售。具体命令、回滚边界与发布顺序见仓库根目录 [`migration.md`](../../migration.md)。

## 12. 高频面试题

### 为什么不能先查库存再更新？

> 两个并发请求都可能读到相同库存并成功扣减。可以用带 `available >= qty` 条件的原子 UPDATE，或在事务中使用行锁/乐观锁。数据库约束和 affected rows 是最终正确性判断，分布式锁最多作为减少竞争的辅助。

### MongoDB 有事务，为什么还强调文档建模？

> 多文档事务有额外协调成本，而且 MongoDB 的优势之一是把一起读取和更新的数据嵌入单文档，利用单文档原子性。事务是必要能力，不应成为忽略访问模式和文档边界的理由。

### 索引失效是什么意思？

> 更准确的说法是优化器判断某索引成本不优或索引无法支持条件，例如函数作用在列上、前导列缺失、选择性太低、隐式类型转换、通配符前缀等。是否使用索引必须看 EXPLAIN，不应只背规则。

## 13. 自测清单

- [ ] 画出生产化商品/SKU/库存/订单/支付模型。
- [ ] 为项目 5 个查询设计索引并说明列顺序。
- [ ] 解释四个隔离级别与应用重试。
- [ ] 写出防超卖原子 UPDATE。
- [ ] 解释订单项为什么同时需要 variant ID 和快照。
- [ ] 对比 Prisma、TypeORM、Drizzle 与原生 SQL。
- [ ] 说明本地事务为什么不能解决 Kafka 双写。

## 参考资料

- [PostgreSQL：Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [PostgreSQL：Indexes](https://www.postgresql.org/docs/current/indexes.html)
- [PostgreSQL：Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)
- [MongoDB：Data Modeling](https://www.mongodb.com/docs/manual/data-modeling/)
- [MongoDB：Transactions](https://www.mongodb.com/docs/manual/core/transactions/)
- [Prisma ORM 文档](https://www.prisma.io/docs/orm)
- [Prisma：Transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)
- [Prisma：Indexes](https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes)
- [Mongoose：Transactions](https://mongoosejs.com/docs/transactions.html)
- [Drizzle ORM 文档](https://orm.drizzle.team/docs/overview)
