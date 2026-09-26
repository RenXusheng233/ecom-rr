### 换装效果

- nextjs + R3F + Drei(useTexture...) + Zustand

## 可靠性后续阶段

> Update · 2026-09-18：Product → Stripe 目录链路和 Stripe Webhook → Payment → Order 链路均已完成持久化 Inbox/Outbox、幂等、版本栅栏、有限重试和对账。下面只记录本次边界之外的工作。

> Update · 2026-09-26：补充长故障下的未知 Checkout 创建结果、退款失败/取消两个缺口。已有核心闭环不代表覆盖所有故障；已知 Session 过期后的换键恢复也不等于未知创建结果的安全恢复。

### 已完成基线

- [x] Stripe Webhook 按 `event.id` 持久化并在落库后返回 2xx。
- [x] Checkout 使用稳定 idempotency key 和服务端商品/金额快照。
- [x] Payment 状态更新与 `payment.order.lifecycle` Outbox 同一 PostgreSQL 事务。
- [x] Kafka envelope 包含 event ID、schema version、correlation/causation ID 和 `orderId` key。
- [x] Order 使用 Mongo replica-set 事务提交 Inbox、版本化 Order 投影和 Ack Outbox。
- [x] `order.payment.applied` 在 Payment 侧按 event ID 去重并使用 version fence。
- [x] 支付、退款、争议使用三个正交状态维度；重复/乱序事件不会让成功状态倒退。
- [x] 定期对账 Stripe 状态、Payment lifecycle Outbox 和 Order Ack，并提供受保护的查询/重试入口。

### 下一阶段

- [ ] 完善长故障下未确认 Checkout Session 的安全恢复：超过 Stripe 幂等响应保留边界后，先可靠定位原 Session，再决定恢复或转人工处理；覆盖外部创建成功但本地确认失败的窗口，不能只盲目重用原 key。
- [ ] 处理退款失败/取消及相应对账修正：当前 `charge.refunded` 和金额投影不等于完整退款请求生命周期；补状态与金额修正、重复/乱序和失败退款场景测试。
- [ ] 建立 SKU/库存账本，Checkout 前预占库存；支付失败/过期释放，成功确认扣减。
- [ ] 把库存、支付、取消、退款和履约组织为显式 Saga/补偿状态机。
- [ ] 增加主动退款/取消 API；命令本身也要有 idempotency key、Inbox/Outbox 和权限审计。
- [ ] 为支付和订单链路增加 retry topic、DLQ、人工审核和受控重放；当前永久失败保存在数据库 FAILED/rejected 记录中。
- [ ] 增加支付成功数与订单确认数差值、Webhook 延迟、Kafka lag、最老 Inbox/Outbox、重试耗尽和对账修复数告警。
- [ ] 为 worker transaction/crash window 增加 CI 中的独立 PostgreSQL 与 Mongo replica-set 集成测试。
- [ ] 增加 OpenTelemetry trace/correlation 传播、结构化日志脱敏和审计留存策略。
- [ ] 设计履约/发货状态，不让退款和争议状态覆盖订单履约状态。
