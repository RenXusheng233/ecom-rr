# 06｜Redis 缓存与分布式能力

## 学习目标

- 了解常用数据结构、持久化与高可用边界。
- 掌握 Cache Aside、TTL、淘汰和缓存三大风险。
- 能解释限流、Session、幂等、Stream 和分布式锁。
- 为当前项目设计具体 Redis Key 与一致性策略。

建议耗时：**1.5 小时**。

> **【当前实现】项目尚未接入 Redis。** 本章全部项目方案都属于生产化建议，面试时不能描述为已完成。

## 1. Redis 是什么

Redis 是内存数据存储，提供多种数据结构、原子命令、TTL、复制与持久化。它可用于缓存、会话、计数、限流和消息场景，但“在内存”不等于“绝不丢数据”，也不应默认替代交易数据库。

### 常用数据结构

| 类型        | 特征                                    | 电商场景                                |
| ----------- | --------------------------------------- | --------------------------------------- |
| String      | 字符串/二进制/整数，支持 INCR、bit 操作 | 页面缓存、计数、幂等标记                |
| Hash        | 一个 key 下多个 field                   | 商品摘要、用户 session                  |
| List        | 双端队列                                | 简单队列；可靠消费更适合 Stream/专用 MQ |
| Set         | 无序唯一集合                            | 标签、去重、共同关注                    |
| Sorted Set  | member 唯一 + score 排序                | 热销榜、延迟调度时间索引                |
| Stream      | append-only entries + consumer groups   | 轻量事件流/工作队列                     |
| Bitmap      | 位操作                                  | 日活、签到                              |
| HyperLogLog | 近似去重计数                            | UV，节省内存但非精确                    |
| Geo         | 地理位置查询                            | 附近仓库/门店                           |

## 2. 持久化与高可用

### RDB

周期快照，文件紧凑、恢复快；快照间隔内数据可能丢失，fork/COW 也会带来资源压力。

### AOF

记录写命令，可配置 fsync 策略；通常数据损失窗口更小，但文件和恢复成本更高。AOF rewrite 压缩历史。

### 两者结合

可同时启用，恢复时通常以更完整的 AOF 为准。作为纯可重建缓存也可不持久化；作为 session/幂等数据则要明确可接受的数据损失。

### Replication、Sentinel、Cluster

- 主从复制提升读扩展和故障副本，但通常异步，故障切换可能丢最近写入。
- Sentinel 提供监控与自动主从切换，不做数据分片。
- Cluster 通过 hash slots 分片并提供副本/故障转移；多 key 操作需要考虑相同 slot（hash tag）。

高可用不等于强一致。关键交易最终仍由数据库约束确认。

## 3. Cache Aside

最常见模式：

```text
读：先 Redis → miss 查 DB → 写 Redis + TTL → 返回
写：先更新 DB → 删除 Redis key
```

为什么常用“删缓存”而不是“更新缓存”：删除简单，下一次读取重建，减少多处结构更新错误。但 DB 更新成功与缓存删除之间仍有窗口，且并发读写可能把旧值回填。

改善手段：

- TTL 限制陈旧上界；
- 写后删除，必要时延迟双删；
- 通过 Outbox/CDC 发失效事件；
- 对严格一致读取绕过缓存；
- 版本号/更新时间防旧值覆盖新值。

缓存是一致性与性能的权衡，不能只说“加 Redis 提速”。

## 4. 穿透、击穿、雪崩

### 缓存穿透

持续查询不存在 key，所有请求打到 DB。

方案：参数校验；不存在结果短 TTL 空值缓存；Bloom Filter；接口限流。Bloom Filter 有假阳性，且删除/更新需要策略。

### 缓存击穿

单个热点 key 失效，大量并发同时回源。

方案：互斥重建、singleflight、逻辑过期 + 后台刷新、热点永不过期但事件失效。锁必须有超时和失败降级。

### 缓存雪崩

大量 key 同时过期或 Redis 整体故障，数据库被压垮。

方案：TTL 加随机抖动、分批预热、多级缓存、熔断限流、Redis 高可用、数据库容量保护与降级页面。

## 5. 热 Key、大 Key 与淘汰

- 热 Key：单 key 请求集中到一个 shard。可本地缓存、拆 key、复制读、请求合并，但要处理失效。
- 大 Key：单次网络/删除/序列化成本高，阻塞事件循环。拆分、分页、渐进删除并监控 memory usage。
- 淘汰策略：`noeviction`、allkeys/volatile 下的 LRU/LFU/random/TTL 等。缓存常用 allkeys-lfu/lru；同时承载不可丢 session 时不应与可淘汰缓存混在同一实例/策略。

## 6. 限流

### 固定窗口

`INCR` + `EXPIRE`，简单但窗口边界可能瞬时翻倍。需要 Lua/MULTI 保证首次设置 TTL 与自增的原子性。

### 滑动窗口

Sorted Set 保存时间戳，删除窗口外记录后计数；更准确但内存和命令成本更高。

### Token Bucket

按速率补充 Token，允许一定突发，适合 API。Lua 脚本在 Redis 内完成读-算-写以保证原子。

项目优先场景：登录/找回密码、创建 Checkout Session、管理写接口、搜索接口。

## 7. 分布式锁

单实例基本模式：

```text
SET lock:resource <unique-token> NX PX <ttl>
```

释放时必须“值仍等于我的 token 才删除”，用 Lua 或当前 Redis 支持的条件删除命令，不能直接 `DEL`，否则可能删除别人后来获得的锁。

还要考虑：

- TTL 太短：任务没完成锁已过期；需要有限续期。
- TTL 太长：持有者崩溃后长时间不可用。
- 网络暂停/GC：旧持有者恢复后可能继续写；关键系统使用 fencing token 让下游拒绝旧持有者。
- 主从异步切换：刚写的锁未复制即主节点故障，另一客户端可能再次获取。

**结论：** 分布式锁是协调工具，不替代数据库唯一约束、条件更新或事务。库存扣减优先数据库原子更新。

## 8. Pub/Sub、Stream 与 Kafka

| 能力           | Redis Pub/Sub      | Redis Streams | Kafka              |
| -------------- | ------------------ | ------------- | ------------------ |
| 持久保留       | 无，离线丢失       | 有            | 有，面向日志保留   |
| Consumer Group | 无                 | 有            | 有                 |
| 重放           | 无                 | 可按 ID       | 强                 |
| 规模与生态     | 实时通知           | 中小型工作流  | 大规模事件平台     |
| 典型用途       | 在线通知、缓存失效 | 轻量队列      | 跨服务事件、审计流 |

当前项目已有 Kafka，不应仅因为 Redis 已部署就把关键事件迁到 Pub/Sub。Redis 更适合缓存、限流和短生命周期协调。

## 9. 本项目 Redis 接入设计

### P1：商品公共缓存

| 项目  | 设计                                                           |
| ----- | -------------------------------------------------------------- |
| Key   | `product:v1:{id}`、`products:v1:{queryHash}`                   |
| Value | JSON 摘要/列表，避免存超大图片内容                             |
| TTL   | 详情 5～30 分钟；列表 1～5 分钟；加入随机抖动                  |
| 写入  | Cache Aside                                                    |
| 失效  | 商品 CRUD 后删详情 + 相关列表；可发 `product.cache.invalidate` |
| 降级  | Redis 超时快速回 DB；使用 singleflight 防击穿                  |

注意：Next.js Data Cache 与 Redis 是两层缓存，必须定义各自失效。简单部署可先只用 Next.js 缓存；多实例/多消费者共享缓存再引入 Redis，避免重复复杂度。

### P1：接口限流

| Key      | `rate:{route}:{userId-or-ip}:{window}`                                        |
| -------- | ----------------------------------------------------------------------------- |
| 算法     | Checkout 用 token bucket；普通 API 用滑动/固定窗口                            |
| TTL      | 与窗口一致                                                                    |
| 失败策略 | 支付写接口可 fail closed 或保守限流；普通读接口可有限 fail open，需按风险决定 |

### P1：幂等键

`idempotency:stripe-event:{eventId}` 可作为快速挡板，TTL 覆盖 Stripe 重试周期。但最终还要数据库唯一索引，因为 Redis 数据可能被淘汰或故障丢失。

### P2：后台统计缓存

- Key：`analytics:orders:8m:v1`。
- TTL：1～5 分钟。
- 支付/订单事件后删除或允许短期陈旧。
- 后台页面可显示“更新时间”，避免把近实时误认为强实时。

### 不推荐优先做

- 把整个购物车只放 Redis：当前匿名购物车 localStorage 足够；登录后跨设备购物车才需要服务端权威模型。
- 用 Redis 锁解决所有库存：先补库存表、条件更新和事务。
- 用 Pub/Sub 替代支付 Kafka 事件：缺少离线持久与可靠重放。

## 10. 高频面试题

### 数据库更新后缓存删除失败怎么办？

> TTL 提供最终收敛；关键场景可把缓存失效事件写入与业务同事务的 Outbox，由 worker 重试删除。读取回填要防并发旧值覆盖，可带版本号。强一致读取直接查数据库，不能承诺 Cache Aside 天然强一致。

### Redis 为什么快？

> 主要数据在内存，核心命令的数据结构与实现高效；命令处理模型减少共享内存锁竞争；I/O 使用事件驱动。但网络、序列化、慢命令、大 key、Lua 和持久化都会影响延迟，不能简单说“因为单线程所以快”。现代 Redis 也使用辅助线程处理部分 I/O/后台任务。

### Redis 锁能绝对防超卖吗？

> 不能。锁可能过期、网络分区或故障切换，客户端也可能停顿。数据库条件更新/唯一约束是最终保障；锁可以减少热点竞争。若下游支持，应配 fencing token 拒绝过期持有者。

## 11. 自测清单

- [ ] 说出 6 种数据结构及本项目用法。
- [ ] 对比 RDB/AOF、Sentinel/Cluster。
- [ ] 画出 Cache Aside 的并发不一致窗口。
- [ ] 区分穿透、击穿、雪崩并各给两种方案。
- [ ] 解释 Redis 锁的 token、TTL、续期和 fencing。
- [ ] 为商品缓存、限流、幂等写出 Key/TTL/失效策略。

## 参考资料

- [Redis：Data types](https://redis.io/docs/latest/develop/data-types/)
- [Redis：Persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
- [Redis：Key eviction](https://redis.io/docs/latest/develop/reference/eviction/)
- [Redis：Rate limiter](https://redis.io/docs/latest/develop/use-cases/rate-limiter/)
- [Redis：Distributed locks](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)
- [Redis：Streams](https://redis.io/docs/latest/develop/data-types/streams/)
