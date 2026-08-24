# 全栈偏前端面试学习文档实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 `ecom-rr` 的真实实现，生成一套可在 7 天内完成、面向全栈偏前端岗位的中文面试学习文档。

**Architecture:** 资料采用“项目请求链路为主、专题原理为支撑、面试问答为复习入口”的三层结构。各专题独立成文，通过根目录导航和跨文档链接串联；所有项目现状都以仓库代码为依据，生产化建议与当前实现明确分开。

**Tech Stack:** Markdown、Next.js 16、React 19、Clerk、NestJS、Express、Fastify、Hono、FastAPI、PostgreSQL、MongoDB、Prisma、Mongoose、Kafka、Redis、Stripe。

**Spec:** `docs/superpowers/specs/2026-08-23-interview-preparation-design.md`

## Global Constraints

- 岗位方向为全栈偏前端，前端讲原理和性能取舍，后端以项目链路和 NestJS 为重点。
- FastAPI 仅用于框架选型对照，不展开 Python 语言基础。
- 以仓库代码为事实来源，不虚构性能指标、并发量、可靠性能力或尚未实现的功能。
- 明确区分“当前项目已实现”“生产环境建议”“扩展学习”。
- 外部资料优先使用官方文档和一手资料。
- 总学习时间控制在 18 至 24 小时，可在 7 天内完成。
- 不修改业务代码，不提交 Git。

## 文件结构

- Create: `docs/interview-preparation/README.md`：总目录、阅读方式、标记约定和模块导航。
- Create: `docs/interview-preparation/00-一周学习路线与项目介绍.md`：7 天日程、项目架构、核心链路和项目介绍模板。
- Create: `docs/interview-preparation/01-Next.js全栈前端与性能优化.md`：Next.js、前端架构、SEO、缓存、渲染和状态管理。
- Create: `docs/interview-preparation/02-Clerk认证授权与自研方案.md`：认证授权原理、Clerk 对比、自研路线和安全实践。
- Create: `docs/interview-preparation/03-Node.js微服务框架与NestJS.md`：框架对比、NestJS 机制和微服务选型。
- Create: `docs/interview-preparation/04-数据库选型建模事务与ORM.md`：数据库、建模、索引、事务和数据访问工具。
- Create: `docs/interview-preparation/05-Kafka事件驱动与可靠性.md`：Kafka 原理、项目事件链和可靠性设计。
- Create: `docs/interview-preparation/06-Redis缓存与分布式能力.md`：Redis 数据结构、缓存、一致性和项目接入点。
- Create: `docs/interview-preparation/07-系统设计改进与项目追问.md`：项目风险、架构演进、可观测性和系统设计追问。
- Create: `docs/interview-preparation/08-高频面试题与参考答案.md`：分模块面试题、回答骨架和模拟面试清单。

---

### Task 1: 建立事实清单与资料来源

**Files:**

- Read: `README.md`
- Read: `apps/client/src/**`
- Read: `apps/admin/src/**`
- Read: `apps/*-service/src/**`
- Read: `packages/kafka/src/**`
- Read: `packages/product-db/prisma/schema.prisma`
- Read: `packages/order-db/src/order-model.ts`
- Read: `packages/types/src/**`

**Interfaces:**

- Consumes: 已批准的设计规格和仓库当前代码。
- Produces: 后续全部文档使用的项目事实清单、代码路径清单和官方资料 URL 清单。

- [ ] **Step 1: 核对前端事实**

  记录 Next.js/React 版本、App Router 页面、Server/Client Component 边界、`fetch` 调用、Zustand 持久化购物车、React Hook Form/Zod、Stripe Checkout、管理后台表格与图表的实际用法。

- [ ] **Step 2: 核对后端事实**

  记录四个服务的框架、路由、鉴权中间件、数据库边界、Kafka Topic、支付 Webhook 和订单落库链路。

- [ ] **Step 3: 核对官方资料**

  使用官方站点确认 Next.js 16 缓存与 revalidation、Clerk、NestJS、PostgreSQL、MongoDB、Prisma、Kafka、Redis 和 Stripe 的当前术语与推荐实践。

- [ ] **Step 4: 检查事实与建议边界**

  为未实现项加上“建议”标记，重点包括 Redis、事务 Outbox、Kafka 幂等/重试/死信、服务端库存校验、支付事件去重、集中日志和链路追踪。

### Task 2: 创建导航与一周学习路线

**Files:**

- Create: `docs/interview-preparation/README.md`
- Create: `docs/interview-preparation/00-一周学习路线与项目介绍.md`

**Interfaces:**

- Consumes: Task 1 的事实清单和全部专题文件名。
- Produces: 全套文档的入口、每日任务、项目介绍与核心调用链，供其他章节反向链接。

- [ ] **Step 1: 编写总目录**

  写明读者定位、推荐阅读顺序、三类标记（当前实现/生产建议/面试表达）、各章节目标和建议耗时。

- [ ] **Step 2: 编排 7 天计划**

  将 18 至 24 小时分配到 7 天；每天包含阅读主题、代码回看路径、口述练习、书面输出和自测标准。

- [ ] **Step 3: 编写项目架构说明**

  描述两个 Next.js 应用、四个服务、PostgreSQL/MongoDB、Kafka、Clerk 与 Stripe 的边界，并使用 Mermaid 展示系统关系和支付下单时序。

- [ ] **Step 4: 编写项目介绍模板**

  提供 30 秒、2 分钟两个版本，以及“为什么使用微服务”“为什么混用框架”“项目最大难点”的回答骨架。

- [ ] **Step 5: 校验导航链接**

  确保 `README.md` 和学习路线中的每个相对链接均指向计划文件名。

### Task 3: 编写 Next.js 全栈前端专题

**Files:**

- Create: `docs/interview-preparation/01-Next.js全栈前端与性能优化.md`

**Interfaces:**

- Consumes: 项目前端代码事实、Next.js 16/React 19 官方资料。
- Produces: 前端核心专题，为系统设计和题库章节提供概念链接。

- [ ] **Step 1: 映射当前前端实现**

  解释 App Router、Server Component 数据获取、Client Component 交互、URL 搜索参数、Zustand 持久化、表单校验、React Query、TanStack Table 和 Recharts 的职责边界。

- [ ] **Step 2: 解释渲染与缓存模型**

  对比 CSR、SSR、SSG、ISR、Streaming；说明 Next.js 16 中 `fetch` 缓存、`cache`、`revalidate`、`revalidatePath`、`revalidateTag`、动态渲染和容易混淆的版本差异。

- [ ] **Step 3: 编写 SEO 专题**

  覆盖 Metadata API、动态 metadata、canonical、robots、sitemap、Open Graph、结构化数据、状态码以及商品详情页的 SEO 设计。

- [ ] **Step 4: 编写性能优化专题**

  按服务端瀑布、客户端 bundle、图片/字体、Suspense、缓存、状态粒度和 Core Web Vitals 分类说明定位方法与优化顺序。

- [ ] **Step 5: 解释 UI 与状态工具选型**

  对比 Zustand/Context/Redux Toolkit/React Query 的状态边界，并说明 Tailwind CSS 与 shadcn/ui 的优势、成本和可访问性责任。

- [ ] **Step 6: 添加项目改进与面试题**

  明确当前商品请求的缓存策略未显式声明等事实，给出适合商品列表、详情、用户订单和后台数据的缓存建议，并添加回答模板、自测题和官方链接。

### Task 4: 编写认证授权与自研方案专题

**Files:**

- Create: `docs/interview-preparation/02-Clerk认证授权与自研方案.md`

**Interfaces:**

- Consumes: client/admin proxy、各服务鉴权中间件、Clerk 与 NestJS 官方资料。
- Produces: 认证模型、自研实现路线和安全检查表。

- [ ] **Step 1: 解释项目认证链路**

  从用户登录、Next.js proxy、Token 获取、Bearer 传递、服务端验证到 session claims 中的角色校验，分别映射 client、admin 和四类后端框架。

- [ ] **Step 2: 对比 Clerk 与自研认证**

  按交付速度、安全维护、定制能力、供应商锁定、成本、数据合规、可用性和迁移难度形成决策表。

- [ ] **Step 3: 解释认证基础**

  对比 Session Cookie 与 JWT，覆盖 Access/Refresh Token、轮换、撤销、CSRF、XSS、CORS、密码哈希、MFA、OAuth/OIDC 和 RBAC/ABAC。

- [ ] **Step 4: 给出 NestJS 自研路线**

  以用户表、会话表、Refresh Token 哈希、Passport Strategy、Guard、装饰器、权限服务和审计日志为主线给出生产级模块拆分和请求流程。

- [ ] **Step 5: 添加项目风险与面试题**

  讨论多服务重复鉴权逻辑、角色声明更新、Token 生命周期、网关集中鉴权与服务内二次授权，并提供常见追问和官方链接。

### Task 5: 编写框架对比与 NestJS 专题

**Files:**

- Create: `docs/interview-preparation/03-Node.js微服务框架与NestJS.md`

**Interfaces:**

- Consumes: 四个后端服务入口、路由和中间件实现，以及框架官方资料。
- Produces: 框架选型矩阵、NestJS 知识树和项目服务拆分分析。

- [ ] **Step 1: 建立框架对比矩阵**

  对比 Express、Fastify、Hono、NestJS 和 FastAPI 的抽象层级、性能取向、生态、类型体验、学习成本、运行时、适用规模和测试体验。

- [ ] **Step 2: 分析当前混用框架的取舍**

  说明学习和验证价值，同时指出团队认知、错误处理、鉴权、可观测性和运维标准不一致的成本；给出实际团队中的选型原则。

- [ ] **Step 3: 深入 NestJS 核心机制**

  覆盖 Module、Controller、Provider、依赖注入、生命周期、Middleware、Guard、Pipe、Interceptor、Exception Filter、Decorator、ValidationPipe 和配置管理。

- [ ] **Step 4: 解释 NestJS 工程化与微服务**

  覆盖分层与领域边界、Repository、事务边界、测试、Swagger、日志、配置、队列、事件和 NestJS Microservices 的适用条件。

- [ ] **Step 5: 添加选型表达与面试题**

  提供“为什么主选 NestJS”“何时选择 Fastify adapter”“何时不拆微服务”“FastAPI 适合什么场景”等回答模板、自测题和官方链接。

### Task 6: 编写数据库、建模、事务与 ORM 专题

**Files:**

- Create: `docs/interview-preparation/04-数据库选型建模事务与ORM.md`

**Interfaces:**

- Consumes: Prisma Product/Category schema、Mongoose Order schema、数据库与 ORM 官方资料。
- Produces: 数据库选型、建模、事务和数据访问工具专题。

- [ ] **Step 1: 映射项目数据模型**

  分析 Product、Category 和 Order 的字段、关系、数组/JSON、金额单位、快照数据以及 PostgreSQL 与 MongoDB 的服务边界。

- [ ] **Step 2: 对比数据库类型**

  对比 PostgreSQL、MongoDB 和 Redis 的数据模型、一致性、查询、事务、扩展方式和适用业务，解释为何商品适合关系模型、订单文档何时合理。

- [ ] **Step 3: 讲解表结构与索引设计**

  覆盖主键、外键、唯一约束、范式与反范式、组合索引、最左前缀、覆盖索引、选择性、执行计划、分页和 N+1。

- [ ] **Step 4: 讲解事务与并发控制**

  覆盖 ACID、隔离级别、脏读/不可重复读/幻读、MVCC、乐观锁/悲观锁、死锁和重试，并将库存扣减与订单创建作为案例。

- [ ] **Step 5: 对比数据访问工具**

  对比 Prisma、TypeORM、Drizzle、Mongoose 和原生驱动在类型安全、迁移、查询能力、性能透明度和事务体验上的差异。

- [ ] **Step 6: 给出生产化数据模型建议**

  补充库存、SKU、订单项、支付记录、地址快照、状态机、金额整数化、审计字段、软删除和迁移策略，并明确这些属于改进方案。

- [ ] **Step 7: 添加面试题与资料**

  添加从基础到进阶的回答模板、自测题和官方链接。

### Task 7: 编写 Kafka 事件驱动与可靠性专题

**Files:**

- Create: `docs/interview-preparation/05-Kafka事件驱动与可靠性.md`

**Interfaces:**

- Consumes: `@repo/kafka`、商品事件、支付事件和订单消费者实现，以及 Kafka 官方资料。
- Produces: Kafka 原理、可靠性设计和项目演进方案。

- [ ] **Step 1: 还原项目事件链**

  说明 `product.created`、`product.deleted`、`payment.successful` 的生产者、消费者、Consumer Group 和数据流。

- [ ] **Step 2: 解释 Kafka 核心模型**

  覆盖 Broker、Topic、Partition、Replica、Leader、Producer、Consumer Group、Offset、Rebalance、消息 Key、顺序和保留策略。

- [ ] **Step 3: 解释可靠性机制**

  覆盖 `acks`、副本、ISR、幂等生产者、At-most/At-least/Exactly-once、手动提交、重试、退避、死信队列和毒消息。

- [ ] **Step 4: 分析数据库与消息一致性**

  解释双写失败、事务 Outbox、CDC、幂等消费、事件 ID、唯一约束和状态机，并应用到商品同步 Stripe 与支付创建订单。

- [ ] **Step 5: 指出当前实现风险**

  明确当前 fire-and-forget 发送、`fromBeginning`、异常吞掉、缺少事件 schema/version、幂等、重试/DLQ 和优雅停机等问题，给出按优先级排序的改进路径。

- [ ] **Step 6: 添加面试题与资料**

  提供项目化回答模板、自测题和 Kafka 官方链接。

### Task 8: 编写 Redis 专题

**Files:**

- Create: `docs/interview-preparation/06-Redis缓存与分布式能力.md`

**Interfaces:**

- Consumes: 当前项目业务场景和 Redis 官方资料。
- Produces: Redis 基础、缓存一致性、分布式能力和项目接入方案。

- [ ] **Step 1: 解释核心数据结构与持久化**

  覆盖 String、Hash、List、Set、Sorted Set、Stream、Bitmap、HyperLogLog、Geo，以及 RDB、AOF、复制、Sentinel 和 Cluster 的基本边界。

- [ ] **Step 2: 讲解缓存模式与风险**

  覆盖 Cache Aside、Read/Write Through、TTL、淘汰策略、穿透、击穿、雪崩、热 Key、大 Key 和一致性处理。

- [ ] **Step 3: 讲解分布式用法**

  覆盖 Session、限流、计数器、排行榜、Pub/Sub、Stream、延迟任务和分布式锁，并解释锁的超时、唯一值和续期问题。

- [ ] **Step 4: 设计项目接入点**

  按优先级提出商品列表/详情缓存、限流、幂等键、短期 Checkout 状态和后台统计缓存；为每项说明 Key、TTL、失效与一致性策略。

- [ ] **Step 5: 添加面试题与资料**

  提供回答模板、自测题和 Redis 官方链接，并明确项目当前未接入 Redis。

### Task 9: 编写系统设计改进与面试题库

**Files:**

- Create: `docs/interview-preparation/07-系统设计改进与项目追问.md`
- Create: `docs/interview-preparation/08-高频面试题与参考答案.md`

**Interfaces:**

- Consumes: Task 3 至 Task 8 的技术结论。
- Produces: 跨模块系统设计方案、最终复习题库和模拟面试材料。

- [ ] **Step 1: 建立风险清单**

  按 P0/P1/P2 分级整理价格可信源、库存超卖、Webhook 幂等、订单一致性、Kafka 可靠性、鉴权复用、数据约束、错误处理、日志指标和部署问题。

- [ ] **Step 2: 设计渐进式演进路线**

  给出不盲目重写的三阶段方案：先补正确性和可观测性，再补缓存与异步可靠性，最后根据规模决定网关、服务合并/拆分和数据库扩展。

- [ ] **Step 3: 编写系统设计追问**

  覆盖高并发商品读取、库存扣减、支付回调、重复消息、服务不可用、缓存一致性、数据库扩容和前端性能退化的分析框架。

- [ ] **Step 4: 建立分层题库**

  按 Next.js、认证、NestJS、数据库、Kafka、Redis、系统设计拆分基础题、进阶题和项目题；每题给出回答骨架、关键术语与容易踩坑的说法。

- [ ] **Step 5: 添加模拟面试清单**

  给出 30 分钟和 60 分钟两套模拟流程，以及自评维度：事实准确、原理解释、权衡、故障处理和落地方案。

### Task 10: 全量验证与交付

**Files:**

- Verify: `docs/interview-preparation/*.md`

**Interfaces:**

- Consumes: Task 2 至 Task 9 的全部文档。
- Produces: 可导航、可在一周内完成、无明显事实冲突的最终资料。

- [ ] **Step 1: 验证文件完整性**

  运行 `find docs/interview-preparation -maxdepth 1 -type f -name '*.md' | sort`，预期输出 `README.md` 与编号 `00` 至 `08` 的 9 份正文文件，共 10 个文件。

- [ ] **Step 2: 验证占位内容**

  运行 `rg -n 'TBD|TODO|待补充|稍后补充|placeholder' docs/interview-preparation`，预期无匹配。

- [ ] **Step 3: 验证项目事实表述**

  逐项核对框架版本、端口、Topic、数据库、鉴权与支付链路；确认 Redis、Outbox、DLQ、幂等和库存模块均未被描述为当前已有功能。

- [ ] **Step 4: 验证链接和 Markdown**

  检查内部相对链接目标全部存在，外部链接指向官方或一手资料；检查 Mermaid 代码块闭合、标题层级连续、表格可读。

- [ ] **Step 5: 验证一周工作量**

  汇总每日建议耗时应位于 18 至 24 小时，且每天均包含输入、口述、输出和自测任务。

- [ ] **Step 6: 检查 Git 差异**

  运行 `git diff -- docs/interview-preparation docs/superpowers`，确认只有已批准的文档文件发生变化，不提交 Git。
