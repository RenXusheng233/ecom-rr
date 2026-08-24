### 换装效果

- nextjs + R3F + Drei(useTexture...) + Zustand

## Payment → Order 可靠性后续改造

> 本分支已经完成 Product PostgreSQL → Kafka → Payment DB → Stripe 商品目录同步的 Outbox、Inbox、幂等、重试与对账。下面只记录尚未覆盖的支付完成到订单落库链路，避免把两个一致性边界混为一谈。

- [ ] 以 Stripe `event.id` 为唯一键持久化 Webhook Inbox，重复事件安全返回 2xx。
- [ ] Webhook 只负责验签和持久化事件，不在 HTTP 请求内直接完成跨服务副作用。
- [ ] 在 payment DB 增加 Payment/Checkout 状态账本，并保存 Session、Payment Intent、金额、货币和用户/订单关联。
- [ ] 在更新支付状态的同一事务写 Payment Outbox，可靠发布订单事件；禁止无 `await` 的 fire-and-forget Kafka send。
- [ ] 为 `payment.successful` 定义稳定 event envelope、event ID、schema version、correlation ID 和 Kafka message key。
- [ ] Order Service 增加 Inbox/processed event 唯一约束，并与订单创建在同一 MongoDB 事务或等价原子边界内提交。
- [ ] 订单状态转换改为条件更新，保证重复、乱序 Webhook/Kafka 消息不会倒退状态或重复创建订单。
- [ ] 区分瞬时错误、永久契约错误与未知结果；增加有限重试、DLQ、告警和受控重放工具。
- [ ] 定期对账 Stripe Checkout/Payment Intent、payment DB 与 Order MongoDB，修复“已支付但无订单”和状态漂移。
- [ ] 补退款、取消、争议、支付失败和库存释放事件的幂等状态机。
- [ ] 增加支付成功数与订单创建数差值、Webhook 延迟、Kafka lag、Outbox 积压、retry/DLQ 数量等监控。
- [ ] 使用 Node 内置测试和独立测试数据库覆盖重复 Webhook、Kafka 重放、数据库故障、worker 崩溃窗口和对账恢复。
