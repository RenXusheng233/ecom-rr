# 01｜Next.js 全栈前端与性能优化

## 学习目标

- 能根据数据与交互边界选择 Server/Client Component。
- 能为不同页面选择 CSR、动态渲染、静态生成或缓存重验证。
- 能讲清 Next.js 16 的缓存、SEO 与性能优化方法。
- 能说明 Zustand、React Query、Tailwind CSS、shadcn/ui 的职责边界。

建议耗时：**4 小时**。

## 1. 当前项目的前端架构

### 【当前实现】Client

- App Router：`apps/client/src/app`。
- Server Components：主页、商品列表/详情、订单页直接在服务端请求后端。
- Client Components：商品规格交互、筛选、搜索、购物车、表单和 Stripe Elements。
- URL 状态：分类、搜索、排序、规格、结算步骤放在 search params 中。
- 客户端状态：Zustand + persist 将购物车存入 `localStorage`。
- 表单：React Hook Form + Zod。
- 图片和字体：`next/image`、`next/font`。
- SEO：根布局静态 `metadata`，商品详情使用 `generateMetadata`。
- 支付返回页：`PaymentReturnStatus.tsx` 轮询 `/sessions/:session_id`，区分支付成功但订单 Ack 未到的处理中状态；确认后才清空购物车。

### 【当前实现】Admin

- 页面在 Server Component 获取商品、订单、用户和统计数据。
- TanStack Query 处理新增等客户端 mutation。
- TanStack Table 处理客户端排序、选择和分页。
- Recharts 展示订单统计，shadcn/ui 作为可编辑的组件源码层。

## 2. Server Component 与 Client Component

App Router 中组件默认是 Server Component。`'use client'` 会建立客户端模块边界，其导入子树进入客户端 bundle。

| 需求                                 | 优先选择                         | 原因                          |
| ------------------------------------ | -------------------------------- | ----------------------------- |
| 读取数据库、密钥、内部服务           | Server Component                 | 逻辑不发给浏览器，减少 bundle |
| 输出可索引商品内容                   | Server Component                 | HTML 首屏完整，更利于 SEO     |
| `useState`、`useEffect`、事件处理    | Client Component                 | 需要浏览器运行时              |
| Zustand、浏览器 API、Stripe Elements | Client Component                 | 依赖客户端状态或 SDK          |
| 只做展示但父级是客户端               | 尽量作为 `children` 从服务端传入 | 避免无意扩大客户端边界        |

### 面试常见误区

- RSC 不是 SSR 的同义词。RSC 描述组件在哪里执行和传输什么；SSR 描述初始 HTML 在服务端生成。
- Client Component 也可能参与服务端预渲染，但它的交互代码仍需发送到浏览器并 hydration。
- 不能从 Client Component 直接 import Server Component；可以通过 Server Component 的 `children` 组合。
- Server Component 返回给 Client Component 的 props 必须可序列化。

### 本项目判断

- `ProductList` 服务端取数合理：商品 HTML 可直接输出，客户端 JS 更少。
- `Filter` 使用路由 search params 合理：筛选状态可分享、刷新可恢复、前进后退有效。
- `CartPage` 整页是 Client Component，功能上成立，但边界偏大。可以让页面壳与静态摘要留在服务端，只把购物车交互岛放到客户端。
- 用户订单依赖 `auth()`，属于请求时动态内容，不应该跨用户缓存。

## 3. 渲染策略：不要只背四个缩写

| 策略           | 数据时效           | 首屏/SEO     | 服务压力       | 适用场景                     |
| -------------- | ------------------ | ------------ | -------------- | ---------------------------- |
| CSR            | 页面到浏览器后请求 | 首屏可能较弱 | API 压力       | 强交互后台、用户私有面板     |
| 动态服务端渲染 | 每次请求生成       | 好           | 较高           | 个性化、实时、含 Cookie 数据 |
| 静态生成       | 构建期生成         | 好且快       | 低             | 稳定营销页、帮助页           |
| ISR/时间重验证 | 静态结果周期更新   | 好且快       | 中低           | 商品详情、分类页             |
| 按需重验证     | 变更时失效         | 好且更新及时 | 中低           | CMS、电商商品更新            |
| Streaming      | 分块返回可用 UI    | 改善感知速度 | 不改变数据成本 | 慢数据与快数据可分区页面     |

### 选型步骤

先问四个问题：

1. 是否包含用户身份、Cookie 或请求头相关数据？是则通常动态。
2. 数据允许陈旧多久？决定 TTL 或是否按需失效。
3. 页面是否需要搜索引擎直接读取？决定首屏内容是否服务端输出。
4. 写操作后哪些页面必须更新？决定 path/tag 粒度。

## 4. Next.js 16 缓存与 revalidation

### 必须先知道的版本差异

Next.js 16 的服务端 `fetch` 默认是 **auto no cache** 语义，并非“所有 GET 自动永久缓存”。如果显式使用 `cache: 'force-cache'`，请求进入 Data Cache；`cache: 'no-store'` 每次访问源站。

本项目的两个 `next.config.ts` **没有启用 `cacheComponents`**，所以不要把 `use cache`、`cacheLife` 或 Partial Prerendering 说成当前已有实现。它们可以作为 Next.js 16 的扩展学习。

### 常用 API

```ts
// 明确缓存并设置 5 分钟有效期
const product = await fetch(`${baseUrl}/products/${id}`, {
  cache: 'force-cache',
  next: { revalidate: 300, tags: [`product:${id}`, 'products'] },
})
```

- `next.revalidate: n`：缓存最多存活 n 秒。
- `next.tags`：给数据打标签，写操作后可精确失效。
- `revalidatePath('/products')`：使路径相关缓存失效，简单但粒度可能较粗。
- `revalidateTag('products', 'max')`：按标签采用 stale-while-revalidate 方式更新；不同 Next.js 版本的签名发生过变化，面试时说明以当前版本文档为准。
- `updateTag('products')`：Server Action 场景立即让后续读取看到新数据，适合 read-your-own-writes。
- React `cache(fn)`：主要是同一次服务端渲染中的请求 memoization，不等于持久 Data Cache。

### 为当前项目设计缓存

| 页面/数据     | 建议                                               | 失效方式                  |
| ------------- | -------------------------------------------------- | ------------------------- |
| 首页商品      | `force-cache` + 60～300 秒                         | 商品变更后 `products` tag |
| 商品列表      | 按 category/search/sort 自然组成 cache key；短 TTL | `products` 或分类 tag     |
| 商品详情      | 5～30 分钟 + `product:{id}` tag                    | 更新/删除时精确失效       |
| 分类          | 较长 TTL                                           | 分类 CRUD 后失效          |
| 用户订单      | `no-store` 或仅私有用户级缓存                      | 支付成功后按用户更新      |
| 后台订单/用户 | 动态或很短 TTL                                     | mutation 后失效           |

**【生产建议】** 商品服务写成功后，Admin 可调用受保护的 Next.js Route Handler/Server Action 完成 mutation 与缓存失效，避免浏览器随意触发 revalidation 接口。

### 常见缓存错误

- 对私有数据使用共享缓存，导致越权泄露。
- mutation 成功但忘记失效，页面长期显示旧数据。
- 缓存粒度太粗，一件商品更新导致整个站点重建。
- 把开发模式 HMR 缓存现象误认为生产行为。
- 同时设置冲突项，如 `cache: 'no-store'` 与正数 `revalidate`。

## 5. Streaming、Suspense 与数据瀑布

Streaming 让服务端先返回可用页面壳，再逐步发送慢区域。它改善 TTFB 后的感知过程，但不会让慢查询本身变快。

```tsx
<main>
  <ProductSummary />
  <Suspense fallback={<ReviewsSkeleton />}>
    <Reviews />
  </Suspense>
</main>
```

优化顺序：

1. 删除不必要的串行 `await`，独立请求用 `Promise.all` 或尽早启动 Promise。
2. 将慢而非关键的区域放入独立 Suspense boundary。
3. 使用 `loading.tsx` 提供路由级 fallback。
4. 再考虑缓存；不要用缓存掩盖 N+1 或无索引查询。

本项目 Admin 首页把订单统计 Promise 传给图表组件，体现了“提前启动请求、延迟消费结果”的方向；仍应为各数据区补独立错误和加载边界。

## 6. SEO：商品站点要回答“能否发现、能否理解、是否唯一”

### Metadata API

`metadata` 和 `generateMetadata` 只能从 Server Component 导出。当前商品详情已根据商品生成 title/description，这是正确基础。

建议继续补：

```ts
export async function generateMetadata({ params }): Promise<Metadata> {
  const product = await getProduct((await params).id)
  return {
    title: `${product.name} | Trend RR`,
    description: product.shortDescription,
    alternates: { canonical: `/products/${product.id}` },
    openGraph: {
      title: product.name,
      description: product.shortDescription,
      images: [getPrimaryImage(product)],
      type: 'website',
    },
  }
}
```

### 电商 SEO 清单

- `app/sitemap.ts` 输出可索引商品 URL 与更新时间。
- `app/robots.ts` 禁止抓取后台、结算、订单等私有页面。
- 商品页加入 Product JSON-LD：名称、图片、价格、币种、库存状态。
- 使用 canonical 合并颜色/尺寸 query 参数形成的重复 URL。
- 搜索无结果、已删除商品使用正确的 404，而不是返回 200 + 空页面。
- 标题和描述唯一，不用根布局的通用文本覆盖全部商品。
- 图片有准确 alt；主要内容不依赖客户端请求后才出现。
- 分类/筛选组合过多时控制索引面，避免 crawl budget 浪费。

### SEO 与性能关系

SEO 不是“用了 SSR 就完成”。搜索表现还依赖内容质量、内部链接、状态码、结构化数据、移动体验和 Core Web Vitals。

## 7. 性能优化框架

先测量，再优化：本地 Lighthouse 适合实验室数据，生产环境需要真实用户 Web Vitals。重点指标：

- **LCP**：最大内容绘制。优化首屏主图、字体、服务响应和关键资源优先级。
- **INP**：交互到下一帧。减少长任务、过大的客户端组件和无效重渲染。
- **CLS**：布局偏移。为图片/异步内容预留尺寸，避免字体和组件突然撑开。

### 服务端

- 并行独立请求，消除瀑布。
- 为稳定公共数据做缓存与按需失效。
- 数据库加索引并限制返回字段/条数。
- 设置超时、错误边界和降级，不能无限等待下游。

### 客户端

- 缩小 `'use client'` 边界。
- 动态加载重量级、非首屏组件，例如图表或编辑器。
- 避免 barrel file 导入把整套图标/组件打入 bundle；用 bundle analyzer 验证。
- Zustand selector 只订阅所需切片，避免整个 store 变化触发所有组件。
- 大列表采用服务端分页；客户端分页不能减少首次传输数据。

### 图片与字体

- `next/image` 需要正确 `sizes`，项目中多处 `sizes="auto"` 应根据布局改成实际断点表达式。
- 首屏唯一 LCP 图片设置高优先级，列表中的所有图片不应全部 `loading="eager"`。
- Cloudinary 配合尺寸、格式和质量参数，避免下载原图。
- `next/font` 可自托管字体并降低布局偏移；只加载实际字重和字符集。

## 8. 状态管理边界

| 状态类型         | 推荐工具                       | 本项目示例                             |
| ---------------- | ------------------------------ | -------------------------------------- |
| URL 可分享状态   | search params                  | 分类、搜索、排序、颜色、尺寸、结算步骤 |
| 服务端远程状态   | Server Component / React Query | 商品、订单、用户                       |
| 跨组件客户端状态 | Zustand                        | 购物车                                 |
| 局部 UI 状态     | `useState`/`useReducer`        | 表单步骤、loading                      |
| 表单状态         | React Hook Form + Zod          | 地址、商品录入                         |

### Zustand vs Context vs Redux Toolkit

- Zustand：API 小、selector 友好，适合中小型跨组件状态；治理约束较少。
- Context：适合主题、语言、稳定依赖注入；频繁变化的大状态可能扩大重渲染。
- Redux Toolkit：约束、DevTools、中间件与团队可预测性更强；简单业务样板更多。
- React Query：解决远程服务端状态、缓存、重试和失效，不应被当作购物车 UI store。

**当前购物车边界：** `localStorage` 中的名称、价格仅适合显示。支付服务现已按商品 ID 从已同步目录账本读取可信 Price、校验所选 size/color，并由服务端计算金额；尚无 SKU 库存与预占，也未对实际可售库存做验证。见 `apps/payment-service/src/utils/checkoutCatalog.ts`。

## 9. Tailwind CSS 与 shadcn/ui

### 优势

- Tailwind 将设计约束放入原子类，改动局部且构建时可裁剪。
- shadcn/ui 提供基于 Radix 的可访问交互原语，同时源码归项目所有，易定制。
- 对熟悉 React 的团队，组合速度快且没有封闭黑盒组件 API。

### 成本

- 长 className 降低可读性，需要组件封装和 `cn`/variants 管理。
- shadcn/ui 是源码，不是自动升级的传统组件包；安全、可访问性和升级由团队负责。
- 视觉一致性依赖 token、组件规范和 code review，而不是“安装组件库”自动获得。

## 10. 高频面试题

### Next.js 为什么比纯 React SPA 更适合商城？

**【面试表达】**

> 商城的商品页需要可索引首屏 HTML、按路由拆包、图片优化和缓存失效。Next.js App Router 可以把数据获取放在 Server Component，减少浏览器 JS，并用 Metadata、sitemap 和按需 revalidation 支撑 SEO 与内容更新。后台强交互区域仍可以保留客户端组件，不需要所有页面采用同一种渲染策略。

### `revalidatePath` 和 `revalidateTag` 怎么选？

> Path 面向页面，简单但可能范围大；Tag 面向数据实体或集合，同一数据被多个页面复用时更精确。商品更新可失效 `product:42` 与 `products`，让详情和列表都更新。需要注意不同 Next.js 版本的 API 语义，以项目锁定版本文档为准。

### Server Component 能否使用 Zustand？

> 不能直接使用依赖 React 客户端 hook 的 Zustand store。Server Component 应通过参数、数据库或服务端数据源获得状态；把需要交互的最小子树标为 Client Component。全局单例 store 也不应在服务端跨请求共享用户状态。

## 11. 自测清单

- [ ] 不看资料画出 RSC 与浏览器 hydration 的数据边界。
- [ ] 为首页、商品详情、订单页、后台统计分别选择渲染和缓存策略。
- [ ] 解释为什么当前 `fetch` 不能直接宣称是 ISR。
- [ ] 列出商品详情 SEO 的 8 个检查项。
- [ ] 用 Network、Performance、Lighthouse、bundle analyzer 分别定位什么问题。
- [ ] 说明为何 URL、远程数据、购物车、表单应由不同状态工具管理。

## 参考资料

- [Next.js：Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Next.js：fetch API 与 Data Cache](https://nextjs.org/docs/app/api-reference/functions/fetch)
- [Next.js：Cache Components](https://nextjs.org/docs/app/getting-started/cache-components)
- [Next.js：revalidatePath](https://nextjs.org/docs/app/api-reference/functions/revalidatePath)
- [Next.js：revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)
- [Next.js：Metadata and OG images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images)
- [Next.js：JSON-LD](https://nextjs.org/docs/app/guides/json-ld)
- [Next.js：Production checklist](https://nextjs.org/docs/app/guides/production-checklist)
- [web.dev：Core Web Vitals](https://web.dev/articles/vitals)
- [Zustand 文档](https://zustand.docs.pmnd.rs/)
- [shadcn/ui 文档](https://ui.shadcn.com/docs)
