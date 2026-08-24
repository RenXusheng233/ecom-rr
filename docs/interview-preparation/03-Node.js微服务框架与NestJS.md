# 03｜Node.js 微服务框架与 NestJS

## 学习目标

- 说清 Express、Fastify、Hono、NestJS 和 FastAPI 的定位。
- 能按团队、业务和运行环境做选型，而不是只比较 benchmark。
- 掌握 NestJS 请求生命周期、DI、模块化、横切关注点和测试方式。
- 能评价当前项目混用框架与微服务拆分的收益、成本。

建议耗时：**3 小时**。

## 1. 当前项目的四种 Node.js 框架

| 服务    | 框架      | 当前使用方式                                                   |
| ------- | --------- | -------------------------------------------------------------- |
| Product | Express 5 | Router + Controller + middleware，Prisma CRUD                  |
| Order   | Fastify 5 | route plugin + `preHandler`，Mongoose 查询与聚合               |
| Payment | Hono      | Web Standards 风格 Context + middleware，对接 Stripe/Kafka     |
| Auth    | NestJS 11 | Module + Controller + Provider + Guard，调用 Clerk Backend API |

这体现了不同框架的编程模型，但也导致鉴权、异常、日志和类型扩展方式各不相同。

## 2. 框架对比与选型

| 维度       | Express                    | Fastify                      | Hono                          | NestJS                        | FastAPI                        |
| ---------- | -------------------------- | ---------------------------- | ----------------------------- | ----------------------------- | ------------------------------ |
| 定位       | 极简 Node HTTP 框架        | 高性能、schema 驱动          | Web Standards、多运行时、轻量 | 企业级 Node 应用框架          | Python 类型驱动 API 框架       |
| 抽象层     | 低                         | 中                           | 低                            | 高                            | 中                             |
| 结构约束   | 少                         | 插件/封装作用域              | 少                            | Module/DI/Decorator 完整      | Router/Dependency/Pydantic     |
| 验证序列化 | 依赖中间件                 | JSON Schema + Ajv/serializer | 需搭配 validator              | Pipe + class-validator/Zod 等 | Pydantic 原生体验强            |
| 性能取向   | 基准                       | 较强                         | 轻量、Edge 友好               | 取决于 adapter 与业务         | Python async I/O 友好          |
| 生态       | 最大、历史长               | 成熟 Node 生态               | 快速增长、多 runtime          | 完整企业工程生态              | AI/数据/Python 生态            |
| 团队治理   | 需自建约定                 | 插件边界较好                 | 需自建架构                    | 强约束，适合多人长期维护      | 类型与依赖系统清晰             |
| 适合       | 小 API、遗留系统、自由组合 | 高吞吐 API、schema-first     | Edge、BFF、轻服务             | 中大型业务后端                | AI 服务、数据服务、Python 团队 |

### 不要用 benchmark 单点决策

多数业务 API 的瓶颈在数据库、外部服务、序列化和网络。框架每秒请求数只有在完成以下条件后才值得优先讨论：

- 相同业务逻辑、验证、序列化与日志；
- 相同 Node 版本、硬件、连接池与 keep-alive；
- 关注 p95/p99 延迟、错误率和内存，而非只看平均吞吐；
- 使用生产流量形态和依赖延迟。

选型更应看：团队熟悉度、长期维护、插件质量、错误/验证标准、部署运行时、可观测性和招聘成本。

## 3. 各框架的核心取舍

### Express

优势：稳定、生态大、心智负担低、几乎所有 Node 开发者都能接手。

劣势：结构、验证、DI、错误格式、类型安全都要团队自行统一；中间件顺序错误常隐藏在运行时。

适合：小型 API、BFF、已有大量 Express 中间件的系统。

### Fastify

优势：JSON Schema 驱动验证与序列化；插件封装作用域；生命周期 hooks 完整；性能表现通常较好。

劣势：schema 维护有成本；插件封装和 decorator 需要学习；生态规模小于 Express。

项目映射：订单路由使用 `preHandler` 做 Clerk 鉴权，但尚未为输入输出定义 schema，因此没有真正发挥 Fastify 的 schema 优势。

### Hono

优势：使用 Request/Response 等 Web Standards；体积小；同一模型适配 Node、Bun、Deno、Cloudflare Workers 等运行时；TypeScript 体验简洁。

劣势：大型企业分层需要团队自建；部分 Node 专属库在 Edge runtime 不可用；新生态的长期治理经验相对少。

项目映射：支付服务部署在 Node adapter，因为 Stripe SDK、KafkaJS 和长连接并不适合随意搬到 Edge。

### NestJS

优势：模块、DI、生命周期、验证、鉴权、文档、测试和微服务能力完整；适合多人协作和复杂业务。

劣势：Decorator/DI 有学习成本；抽象层可能掩盖底层行为；小服务显得重；request-scoped provider 使用不当会增加开销。

### FastAPI

优势：Python 类型注解 + Pydantic 自动验证/文档；依赖注入易用；与 AI、数据处理生态衔接自然；支持 async I/O。

劣势：CPU 密集任务受 Python 执行模型影响，通常需多进程或任务队列；大型项目的目录与领域边界仍需自定；与 TypeScript monorepo 共享类型不如全 TS 直接。

选择建议：AI 推理、Python 模型库或数据科学链路选 FastAPI；核心电商领域若团队主栈为 TypeScript，可继续 NestJS，通过 HTTP/Kafka 调用 AI 服务。

## 4. 为什么重心放在 NestJS

对于全栈偏前端工程师，NestJS 的价值不是“语法像 Angular”，而是把后端常见治理问题变成明确扩展点：

- 依赖与生命周期由 IoC 容器管理；
- 横切关注点放到 Guard/Pipe/Interceptor/Filter；
- Module 表达能力边界；
- Controller 只处理传输协议，Service 承担用例；
- 测试可替换 provider；
- 可在 Express/Fastify adapter 之间选择。

## 5. NestJS 核心结构

### Module

Module 决定 provider 的可见性：

- `providers`：本模块容器可创建的依赖；
- `controllers`：HTTP/传输入口；
- `imports`：引入其他模块导出的能力；
- `exports`：明确暴露给其他模块的 provider。

模块应按业务能力拆分，如 `CatalogModule`、`OrderModule`、`PaymentModule`，而不是全局 `ControllersModule`、`ServicesModule`。

### Provider 与依赖注入

Provider 默认 singleton。构造器注入让依赖显式，也便于测试替换。

```ts
@Injectable()
export class OrderService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly events: EventPublisher,
  ) {}
}
```

接口在运行时不存在，抽象依赖需要 token：

```ts
export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY')

{
  provide: ORDER_REPOSITORY,
  useClass: PrismaOrderRepository,
}
```

常用自定义 provider：`useClass`、`useValue`、`useFactory`、`useExisting`。异步数据库/SDK 初始化通常用 `useFactory` + inject 或动态模块的 `forRootAsync`。

### Provider Scope

- Singleton：默认，最省资源，大多数 Service 应使用。
- Request：每个请求创建，适合必须携带请求上下文的少数依赖，但会沿依赖链扩大创建成本。
- Transient：每次注入创建，适用很少。

日志 trace ID 更适合 AsyncLocalStorage/CLS，不应为了拿 request 到处改成 request scope。

## 6. 请求生命周期

常用顺序可记为：

```text
Middleware
  → Guard
    → Interceptor (before)
      → Pipe
        → Controller
          → Service
      ← Interceptor (after / RxJS stream)
    ← Exception Filter（异常时）
```

| 机制             | 解决的问题                                      | 项目例子                               |
| ---------------- | ----------------------------------------------- | -------------------------------------- |
| Middleware       | 通用请求预处理，通常不读取 handler metadata     | request ID、原始日志、Clerk middleware |
| Guard            | 是否允许进入 handler，可读取 decorator metadata | JWT、角色、权限                        |
| Pipe             | 参数验证和转换                                  | DTO 校验、字符串转整数                 |
| Interceptor      | 调用前后、响应映射、耗时、缓存、超时            | 统一响应、指标、审计                   |
| Exception Filter | 把异常映射为协议响应                            | 领域异常 → HTTP status/code            |

### 高频判断

- “用户能否访问”放 Guard，不放 Pipe。
- “请求体是否有效”放 Pipe，不放 Guard。
- “记录 handler 总耗时”放 Interceptor。
- “给所有请求生成 request ID”可放 Middleware。
- “数据库唯一冲突转换为 409”放 Filter 或异常映射层。

## 7. Validation 与错误设计

启用全局验证时常见配置：

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
```

- `whitelist` 移除未声明字段；`forbidNonWhitelisted` 直接拒绝，适合严格 API。
- DTO 是传输层契约，不应直接充当数据库 Entity。
- 领域 Service 抛业务异常，如 `InsufficientInventoryError`；HTTP 层映射为 409，Kafka 消费者可映射为重试/DLQ，避免领域层依赖 HTTP。

统一错误建议：

```json
{
  "code": "INVENTORY_INSUFFICIENT",
  "message": "Insufficient inventory",
  "requestId": "...",
  "details": []
}
```

不要把堆栈、SQL 或第三方原始错误返回给客户端。

## 8. NestJS 工程边界

推荐的中等规模模块：

```text
order/
├── application/        # use cases, commands, queries
├── domain/             # entity, value object, domain errors
├── infrastructure/     # Prisma repository, Kafka adapter
├── presentation/       # controller, DTO, guard mapping
└── order.module.ts
```

不必为了形式套完整 DDD。最低要求是：

- Controller 不直接写复杂 Prisma 查询；
- Service 不依赖 Express Request/Response；
- Repository 隔离复杂查询和事务细节；
- 外部 Stripe/Kafka 通过 adapter 注入；
- 事务边界围绕一个用例，不围绕一个 repository 方法。

## 9. 测试策略

| 测试        | 关注                              | 建议                                          |
| ----------- | --------------------------------- | --------------------------------------------- |
| Unit        | Service 的业务分支                | mock repository/外部 adapter，不启动 Nest app |
| Integration | Prisma 查询、事务、Kafka adapter  | 使用真实测试数据库/容器                       |
| E2E         | 路由、Pipe、Guard、Filter、序列化 | `TestingModule` + Supertest                   |
| Contract    | 服务事件/HTTP 契约兼容            | schema 校验、consumer-driven contract         |

不要只追求覆盖率。支付和订单优先覆盖：重复事件、超时、回滚、库存不足、权限越界、第三方失败。

## 10. 微服务还是模块化单体

### 拆分信号

- 团队与发布节奏可以独立；
- 领域边界清晰，跨域事务少；
- 负载和扩容模式显著不同；
- 支付/身份有合规或安全隔离要求；
- 组织能承担部署、监控、消息一致性与值班。

### 不该拆的信号

- 团队很小、领域仍快速变化；
- 服务之间大量同步调用和共享表；
- 没有自动化部署、追踪、告警和契约测试；
- 拆分只是为了使用更多框架。

**【面试表达】**

> 当前项目拆分用于实践领域边界和事件驱动，但真实小团队我会先做 NestJS 模块化单体，共享一个部署单元、按模块隔离代码和表。只有当发布、扩容、合规或团队边界出现时再抽取服务，并优先抽支付、通知等边界稳定模块。

## 11. 当前项目改进建议

1. 收敛服务模板：统一错误结构、配置校验、日志、健康检查和优雅停机。
2. 认证/授权转成框架 adapter + 共享 policy，不复制业务判断。
3. Fastify 路由补 request/response schema。
4. NestJS auth-service 返回明确 DTO，避免大量 `Promise<unknown>`。
5. 服务调用加入 timeout、重试边界与 correlation ID。
6. 先证明模块边界，再决定是否统一迁到 NestJS；不要为“统一”盲目重写。

## 12. 高频面试题

### NestJS 和 Express 是竞争关系吗？

> NestJS 是更高层应用框架，默认可运行在 Express adapter 上，也可换 Fastify。Nest 提供模块、DI 和生命周期，底层 adapter 处理 HTTP。选 NestJS 不是放弃 Express 生态，而是为大型应用增加治理结构。

### Guard 与 Middleware 有什么区别？

> Middleware 更接近底层请求管道，不知道最终 handler 的 metadata；Guard 在路由解析后执行，可通过 `ExecutionContext` 和 Reflector 读取角色/权限装饰器，因此更适合授权。

### 为什么 Fastify 可能更快？

> 它围绕低开销路由、schema 编译验证和快速 JSON 序列化设计。但业务系统瓶颈通常在 I/O，必须用包含验证、日志和真实依赖的压测验证。团队能力与正确性通常比框架 benchmark 更重要。

## 13. 自测清单

- [ ] 90 秒完成五框架选型对比。
- [ ] 画出 NestJS 请求生命周期。
- [ ] 各举一个 Guard、Pipe、Interceptor、Filter 的项目例子。
- [ ] 解释 DI token、动态模块、provider scope。
- [ ] 说明模块化单体何时优于微服务。
- [ ] 为订单模块列出 unit/integration/E2E 测试边界。

## 参考资料

- [NestJS 官方文档](https://docs.nestjs.com/)
- [NestJS：Providers](https://docs.nestjs.com/providers)
- [NestJS：Request lifecycle](https://docs.nestjs.com/faq/request-lifecycle)
- [NestJS：Microservices](https://docs.nestjs.com/microservices/basics)
- [NestJS：Testing](https://docs.nestjs.com/fundamentals/testing)
- [Express 文档](https://expressjs.com/)
- [Fastify：Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Hono：Web Standards](https://hono.dev/docs/concepts/web-standard)
- [FastAPI：Features](https://fastapi.tiangolo.com/features/)
