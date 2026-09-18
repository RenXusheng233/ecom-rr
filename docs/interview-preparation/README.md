# ECOM-RR 全栈偏前端面试学习手册

这套资料面向拥有 5 年以上前端经验、正在补齐 Node.js 后端能力的工程师。目标不是背完技术百科，而是能围绕当前项目讲清楚：**做了什么、为什么这样设计、哪里还不够、生产环境如何改进**。

> **Reliability Update · 2026-08-24**
>
> **Reliability Update · 2026-09-18：** 当前分支已完成 Product → Stripe 目录同步和 Stripe Webhook → Payment → Order 两条可靠性链路。本目录的 `00`、`04`、`05`、`07`、`08` 均保留改造前基线并追加当前实现标注，便于面试时讲清 before/after；库存预占、履约 Saga、retry topic/DLQ 和生产监控仍是下一阶段。

总学习时间约 **21 小时**，建议 7 天完成。

## 使用约定

文档中使用四种标记：

- **【当前实现】**：可以在仓库代码中验证，面试时可以作为已完成工作描述。
- **【生产建议】**：项目尚未实现，但应能说明设计方案与优先级。
- **【面试表达】**：可直接练习的回答骨架，理解后用自己的语言复述。
- **Reliability Update · 日期**：本次可靠性改造后的增量事实；标记附近的“原始认识”用于保留改造前分析。

不要把“生产建议”说成项目已有能力。高级工程师的可信度，往往来自准确说明边界，而不是堆叠名词。

## 文档导航

| 文档                                                                | 核心内容                                   |             建议时间 |
| ------------------------------------------------------------------- | ------------------------------------------ | -------------------: |
| [00｜一周学习路线与项目介绍](./00-一周学习路线与项目介绍.md)        | 架构、业务链、项目介绍、7 天计划           |               2 小时 |
| [01｜Next.js 全栈前端与性能优化](./01-Next.js全栈前端与性能优化.md) | App Router、渲染、缓存、SEO、Zustand、性能 |               4 小时 |
| [02｜Clerk 认证授权与自研方案](./02-Clerk认证授权与自研方案.md)     | Session/JWT、RBAC、安全、自研认证          |               3 小时 |
| [03｜Node.js 框架与 NestJS](./03-Node.js微服务框架与NestJS.md)      | 框架选型、NestJS 核心机制、微服务边界      |               3 小时 |
| [04｜数据库、建模、事务与 ORM](./04-数据库选型建模事务与ORM.md)     | PostgreSQL、MongoDB、索引、事务、建模      |             3.5 小时 |
| [05｜Kafka 事件驱动与可靠性](./05-Kafka事件驱动与可靠性.md)         | 分区、消费组、交付语义、幂等、Outbox       |             2.5 小时 |
| [06｜Redis 缓存与分布式能力](./06-Redis缓存与分布式能力.md)         | 缓存、一致性、限流、锁、项目接入           |             1.5 小时 |
| [07｜系统设计改进与项目追问](./07-系统设计改进与项目追问.md)        | 风险分级、支付一致性、演进方案、可观测性   |               1 小时 |
| [08｜高频面试题与参考答案](./08-高频面试题与参考答案.md)            | 分层题库、回答骨架、模拟面试               | 0.5 小时起，多次复习 |

## 推荐学习方式

每个主题采用同一循环：

1. **读文档**：先建立知识框架，不追求记住所有细节。
2. **看代码**：找到文档列出的项目文件，确认真实调用链。
3. **闭卷口述**：用 2 分钟回答“为什么这样选、还有什么问题”。
4. **写关键词**：每道题只记 4～6 个关键词，不背整段答案。
5. **做反向追问**：回答后继续问自己“失败怎么办”“并发怎么办”“为什么不用另一个方案”。

## 面试回答公式

对于项目题，优先使用下面的五段式：

> **背景与约束 → 方案 → 核心机制 → 权衡 → 改进方向**

示例：

> 项目包含前台、后台和四个服务，需要统一用户身份但不希望把时间耗在登录注册、OAuth 和会话安全上，所以接入 Clerk。Next.js 通过 middleware/proxy 保护页面，服务端通过 SDK 校验 Bearer Token，并从 session claims 读取角色做 RBAC。优势是交付快、安全能力完整；代价是供应商依赖、成本和深度定制受限。如果业务对数据合规和账号体系控制要求更高，我会在 NestJS 中自建短期 Access Token、可撤销 Refresh Session、密码哈希和审计模块。

## 学习完成标准

一周后，你应该能做到：

- 在 2 分钟内说明完整架构和支付下单链路；
- 解释 Next.js Server/Client Component、渲染策略和缓存策略；
- 对比 Clerk 与自研认证，并画出 NestJS 自研流程；
- 说明 NestJS 的请求生命周期以及 Guard、Pipe、Interceptor、Filter 的职责；
- 用商品、SKU、订单、支付举例说明关系建模、索引和事务；
- 解释 Kafka 为什么可能重复消费，以及如何用幂等和 Outbox 处理；
- 说明 Redis 在本项目中的三个优先接入点及一致性策略；
- 主动指出当前项目的不足，并按优先级给出演进方案。

## 项目事实基线

- Monorepo：pnpm 9 + Turborepo。
- 前端：两个 Next.js 16 / React 19 应用，分别是商城与管理后台。
- 后端：Express 商品服务、Fastify 订单服务、Hono 支付服务、NestJS 认证/用户服务。
- 数据：Product PostgreSQL + Prisma 存商品与 Product Outbox；独立 Payment PostgreSQL + Prisma 存目录账本、CheckoutAttempt、Webhook Inbox、Payment Outbox 和 Order Ack Inbox；MongoDB replica set + Mongoose 存 Payment Inbox、版本化 Order 和 Ack Outbox。
- 外部服务：Clerk、Stripe、Cloudinary。
- 异步通信：KafkaJS，三个本地 KRaft Broker；商品目录使用 `catalog.product.sync.requested` / `catalog.product.sync.result`，支付订单链仍使用 `payment.successful`。
- 商品目录链路已实现 Outbox/Inbox、message key、版本防乱序、Stripe 幂等重试、同步结果和定期对账。
- 支付订单链路已实现 Stripe event ID 去重、Payment/Order 双向 Outbox/Inbox、完整快照版本栅栏、Ack 与对账。
- 当前未使用 Redis；仍未实现库存/SKU、主动退款/履约 Saga、retry topic/DLQ 和生产级可观测性。

最后更新：2026-08-24。
