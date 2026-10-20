# 迁移评估：@cloudflare/next-on-pages → OpenNext（@opennextjs/cloudflare）

> **状态（2026-10-19）**：已按本文方案执行完毕，生产跑在 Worker `stayloop-web` 上。实际做法与本文的差异（zone 路由而非搬自定义域名、密钥由用户终端同步、邮件 Worker 加 `global_fetch_strictly_public`）见 `design/history/2026-10.md`「生产从 Pages + next-on-pages 迁到 OpenNext Worker」。下文是迁移前的评估原文。

日期：2026-10-18 · 试验分支 `claude/opennext-trial`（未部署、未推 v5.3-launch、未改任何生产配置）
构建日志：`design/opennext-trial-2026-10-18/`

## 结论先说

- **能迁，而且代码改动是机械的。** 试验分支在本机（node 22.23.3）用 OpenNext 1.20.8 构建成功，本地 `wrangler dev`（workerd）跑起来后页面、中间件跳转、安全头、`/api/v1/*` 都正常；tsc 通过，全量 vitest 2945 条全绿（改了 7 个守卫测试文件里的 9 条断言）。
- **必须从 Pages 换到 Workers。** OpenNext 只产出 Worker（`.open-next/worker.js` + 静态资源），没有 Pages 版本。真正的工作量和风险都在「生产切换」这一步，而不是代码。
- **头号风险是密钥进包**：OpenNext 会把 `.env`、`.env.local`、`.env.development.local` 等文件的**全部值**原样写进 worker 包（`.open-next/cloudflare/next-env.mjs`）。现在的 `.env.local` 放着生产 service role、Stripe LIVE 等密钥，照现在的做法构建就会把它们打进上传的脚本。迁移前必须先拆分 env 文件（见第 4 节）。
- 建议：先在 `next.stayloop.ai`（或 workers.dev）上并行跑一个 Worker 做全量回归，再切域名；Pages 项目原样保留作回滚。

## 1. 试验结果

| 轮次 | 改动 | 结果 | 用时 |
|---|---|---|---|
| 1 | 换适配器 + 配置文件 + `getRequestContext`→`getCloudflareContext`，**保留** edge 声明 | `next build` 通过（167 个页面）；OpenNext 打包阶段报错退出：`app/agent/showings/[id]/feedback/page cannot use the edge runtime.`（遇到第一个就停，实际 120 个文件都会触发） | 177 秒 |
| 2 | 再删掉 120 处 `export const runtime = 'edge'` | **构建成功**，`Worker saved in .open-next/worker.js` | 70 秒 |

体积（`wrangler deploy --dry-run`，只在本地打包、不上传）：**总计 28.4 MB / gzip 5.26 MB**。Workers Paid 上限是 gzip 后 10 MB，还有余量；免费档（3 MB）放不下。服务端主包 `handler.mjs` 22 MB（未压缩），静态资源 642 个文件、10 MB。

本地冒烟（`wrangler dev`，没给运行时密钥）：

- 200：`/` `/pricing` `/listings` `/rules` `/screening` `/login` `/register` `/stayloop-api/docs` `/dashboard` `/tenant/agent` `/verify/abc` `/icon.svg` `/sw.js` `/manifest.json` `/api/v1/rules` `/api/v1/openapi.json`；`/nope-404` → 404；`/api/agent/execute` GET → 405（与生产一致）。
- 中间件：`/landlord/settings`→`/settings`、`/trust-api`→`/stayloop-api`、`/?role=tenant&ask=hi`→`/tenant/agent?prompt=hi&send=1`、`Host: stayloop.ai`→`www.stayloop.ai`，全部 308。
- 安全头：HSTS、X-Frame-Options、Permissions-Policy、nosniff、Referrer-Policy（`/verify/*` 为 `no-referrer`）、`Access-Control-Allow-Origin: https://www.stayloop.ai`（`/api/v1/*` 保持 `*`）都在。
- `public/_headers`：wrangler 报告「Parsed 2 valid header rules」，静态文件带 HSTS / nosniff，`! Access-Control-Allow-Origin` 的去头写法也生效（`/icon.svg` 没有 `*`）。
- `/api/public/stats` 503、`/api/listings/search` 500：日志是 `supabaseKey is required`，因为本地没给 service role key，属预期。
- 浏览器打开 `/pricing`：渲染、水合正常，控制台无错误。

## 2. 要改的地方

### 2.1 代码（试验分支已做）

| 项 | 数量 | 做法 |
|---|---|---|
| `export const runtime = 'edge'` | 120 个文件（91 个 route.ts + 29 个动态页面 / layout） | 全部删掉。OpenNext 拒绝 App Router 里的 edge 声明；Node 运行时在 workerd + `nodejs_compat` 下运行。 |
| `getRequestContext()`（`@cloudflare/next-on-pages`） | 4 个路由：`agent/turn`、`listings/enrich`、`public/stats`、`v1/screen` | 换成 `@opennextjs/cloudflare` 的 `getCloudflareContext().ctx.waitUntil`。原有的 try/catch 兜底（`next dev` 里会抛错）照旧有效。以后也可以改用 Next 自带的 `after()`，就不绑定任何适配器了。 |
| 守卫测试 | 7 个文件 9 条断言 | 「必须有 edge」改成「不得有 edge」；`node2Clarity20260926` 的全目录守卫改成禁止 page / layout / route 声明 edge（防止有人照旧习惯加回来，构建直接失败）。另有 `listingTranslations20261002` 的 mock 和 `review20260925` 的字符串断言跟着改名。 |
| `package.json` | — | 删 `@cloudflare/next-on-pages` 和它的 `overrides`；加 `@opennextjs/cloudflare@1.20.8`、`wrangler@4.147.0`（本地，精确版本，两者都已发布两周以上）；脚本 `cf:build` / `cf:preview`。lockfile 已重生成。 |
| 新文件 | — | `wrangler.jsonc`（Worker 名字故意叫 `stayloop-opennext-trial`，不会误碰生产）、`open-next.config.ts`；`.gitignore` 加 `.open-next/` `.wrangler/`。 |

不用改的：

- **Workers Cache API**（`app/api/public/stats/route.ts` 的 `caches.default`）：Workers 里同样可用，代码不动。注意它只在自定义域名上生效，workers.dev 上是空操作（现有代码已经容忍 cache 不可用）。
- **pdf.js 真全局 polyfill**（`lib/forensics/pdf-text.ts`、`lib/agent/attachmentText.ts`）：那套绕法是针对 next-on-pages 给每个路由套假 globalThis 代理的；OpenNext 下真全局就是 globalThis，`getRealGlobal()` 会直接返回同一个对象，无害。但筛查取证在 Node 运行时下的 PDF 抽取要专门回归一遍（见风险）。
- **Stripe**：`lib/stripe.ts` 已经用 `createFetchHttpClient()`，不依赖 Node http。
- **middleware.ts**：OpenNext 单独打包中间件，本地验证全部行为一致，不用改。
- 冒烟 `scripts/smoke.sh`、路由审计 `scripts/route-audit.mjs`、Email Worker `workers/reply-email`、pg_cron 回调、Stripe webhook：都只认 URL，不认适配器，不动。

### 2.2 `ship2-v53.command`（试验分支**没改**，生产脚本保持原样）

迁移时改这几段：

1. 清缓存：`rm -rf .vercel/output .next` → `rm -rf .open-next .next`
2. 构建：`npx @cloudflare/next-on-pages@1` → `npx opennextjs-cloudflare build`（保留 `NODE_OPTIONS=--max-old-space-size=4096`）
3. 入口检查：`_worker.js` 目录 / 文件两种形态的判断换成
   `[ -s .open-next/worker.js ] && [ -s .open-next/server-functions/default/handler.mjs ]`。`worker.js` 本身只有 2 KB 的转发壳，必须同时检查 `handler.mjs`，否则「只有静态资源」的事故会重演。
4. **新增密钥检查**（构建后、部署前）：`next-env.mjs` 里只允许出现 `NEXT_PUBLIC_*` 键，出现别的键就 `fail`。
5. 部署：`wrangler pages deploy .vercel/output/static --project-name stayloop --branch main` → `wrangler deploy`（读 `wrangler.jsonc`）。全局 wrangler 是 4.64.0，低于 OpenNext 要求的 ^4.125；要么升级全局 wrangler，要么脚本改用本地 `node_modules/.bin/wrangler`（npx 曾经卡住，直接调 `.bin` 路径不经过 npx 的下载逻辑）。
6. 回滚提示：「Pages → Deployments → Rollback」改成 `wrangler rollback`（或 Workers 后台 → Deployments）。
7. 冒烟、路由审计不变。

可选：用 `wrangler versions upload` 先传一个不接流量的版本拿预览地址冒烟，过了再 `wrangler versions deploy` 放量——比 Pages 现在「部署即上线、红了再回滚」更稳。

### 2.3 wrangler 配置（生产版）

在试验版 `wrangler.jsonc` 基础上：

- `name` 改成正式名（如 `stayloop-web`；Pages 项目 `stayloop` 保留回滚，不要同名）。
- `routes`：`www.stayloop.ai`、`stayloop.ai`、`screening.stayloop.ai` 用 `custom_domain: true`。
- `compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"]` 保留；`compatibility_date` 固定。
- 视需要加 `limits.cpu_ms`（助理 turn、筛查调用若有长 CPU 段；Workers Paid 默认 30 秒，最高 5 分钟）。
- `observability.enabled: true`，替代 Pages 的函数日志。
- 不需要 R2 / KV / D1 / DO：项目没有 ISR、`unstable_cache`、`revalidate`。但建议在 `open-next.config.ts` 用 `static-assets-incremental-cache`，让 167 个预渲染页面直接从静态资源读（只读、零绑定）——试验版没配，切换前补上并对比首页响应头。

### 2.4 环境变量

- **`NEXT_PUBLIC_*` 内联方式不变**：照旧由本机 `next build` 读 env 文件内联进客户端包，Cloudflare 后台那份不生效。
- **服务端密钥要从 Pages 搬到 Worker**：Pages 后台的 secrets 不会自动跟过去，切换前用 `wrangler secret bulk`（从本机文件导入，不打印）把第「环境变量」节列的全部必需项和在用的可选项装到新 Worker。漏一个的症状就是试验里看到的 `supabaseKey is required` → 500。
- 运行时 `process.env` 由 OpenNext 从 Worker 的 vars / secrets 填充，代码不用改。
- **密钥进包的处理（必须先做）**：OpenNext 把 env 文件的全部内容写进 worker 包，而且同时写 production、development 两份（所以 `.env.development.local` 的值也会进包）。做法：
  - 构建用的 env 文件只放 `NEXT_PUBLIC_*`（试验分支就是这么做的：worktree 的 `.env.local` 只抽了 7 个 `NEXT_PUBLIC_*` 键）；
  - 服务端密钥只放 Worker secrets；本地 `wrangler dev` 用 `.dev.vars`（不入库）；
  - `next dev` 需要的服务端密钥改放 `.env.development.local` 以外的地方会影响现有本地开发习惯——可以在 ship 脚本构建前把 `.env.local` 临时换成只含 `NEXT_PUBLIC_*` 的版本，构建后还原；再加上 2.2 第 4 条的检查兜底。

## 3. Pages 还是 Workers

没有选择：OpenNext 不支持 Pages。换到 Workers 的影响：

| | Pages（现在） | Workers（迁移后） |
|---|---|---|
| 部署 | `wrangler pages deploy`，部署即上线 | `wrangler deploy`，或 versions upload + 逐步放量 |
| 回滚 | 后台一键 Rollback | `wrangler rollback` / 后台 Deployments |
| 预览 | 每次部署有 `*.pages.dev` 地址 | versions 预览地址 / workers.dev |
| 静态资源 | Pages 资源服务器，`_headers` | Workers Static Assets，`_headers` 同样支持（已验证） |
| 自定义域名 | 挂在 Pages 项目 | 要从 Pages 项目解绑，挂到 Worker |
| 计费 | Workers Paid 已有，函数调用按 Workers 计 | 同一套额度，无新增订阅 |

## 4. 风险

| 风险 | 级别 | 说明与对策 |
|---|---|---|
| 密钥打进 worker 包 | 高 | 见 2.4；ship 脚本加检查，未拆分 env 前不许部署。 |
| 切域名时短暂不可用 / 证书 | 中 | 自定义域名从 Pages 移到 Worker 要先解绑再绑定，期间可能几分钟 522 / 证书签发中。选低峰；先用 `next.stayloop.ai` 验证 Worker 版。三个域名（www、apex、screening）都要搬。 |
| Node 运行时行为差异 | 中 | 120 个路由从 edge 换到 Node 运行时（workerd 上的 nodejs_compat）。最需要回归的：筛查取证的 PDF 抽取（unpdf / pdf.js 在 Node 条件导出下可能选到不同的构建）、`pdf-lib` 生成租约 PDF、助理 turn 的流式响应、Web Push（VAPID 手写签名）、Stripe webhook 验签、哈希链 `stayloop-thread-v1` 逐字节复现、`/api/threads/inbound`。筛查模块是 DO NOT TOUCH，只回归不改。 |
| Worker 启动时间 | 中 | 单个 22 MB 的服务端包，Workers 对脚本启动有时限（约 1 秒 CPU）。dry-run 不报告启动时间，要在 `wrangler versions upload` 时看。超了的话需要 OpenNext 的拆函数配置。 |
| 体积余量 | 低 | gzip 5.26 MB / 上限 10 MB。依赖继续长会逼近，ship 脚本可以打印 dry-run 体积。 |
| OpenNext 更新节奏快 | 低 | 1.20.x 两周三四个版本，peer 依赖跟 Next 小版本绑得紧（1.20.12 要 next ≥15.5.28、wrangler ≥4.148）。精确钉版本，升级单独做。 |
| 静态页每次重渲染 | 低 | 没配 incremental cache 时，预渲染页可能走服务端渲染。补 static-assets cache 后对比。 |
| 构建机内存 | 低 | 本机两轮都在 3 分钟内完成，没进 swap（next-on-pages 那一步过去是最慢的）。 |

## 5. 回滚方案

1. **切换前**：Pages 项目 `stayloop` 和它最后一个生产部署原样保留，不删、不停；ship 脚本的旧版本留一份 `ship2-v53-pages.command`。
2. **切换后出问题**：把三个自定义域名从 Worker 解绑、重新挂回 Pages 项目（Pages 上那个部署还是上线前的代码）。预计几分钟，主要耗在证书。
3. **代码回滚**：试验改动集中在一个分支 / 一个合并提交，`git revert` 即可恢复 edge 声明和 next-on-pages（next 15.5.28 + overrides 的组合已在生产验证过）。
4. Worker 内部的坏版本：`wrangler rollback` 回到上一个 Worker 版本，不用动域名。
5. 观察期（建议一周）结束、确认不再需要 Pages 后，再清理 Pages 项目。

## 6. 建议的推进顺序

1. 拆 env 文件 + ship 脚本密钥检查（先做，独立于迁移也有价值）。
2. 补 `static-assets-incremental-cache`；把 `wrangler.jsonc` 改成正式名，挂 `next.stayloop.ai`。
3. `wrangler versions upload` 到新 Worker，看启动时间；装 secrets。
4. 在 `next.stayloop.ai` 上跑 `smoke.sh`、`route-audit.mjs`、`db-matrix.sh`，以及 `design/test-cases-2026-10-17/` 里 S0 / S1 用例（重点是第 4 节列的 Node 运行时差异项）。
5. 低峰切三个域名 → 冒烟 → 观察一周 → 更新 CLAUDE.md（技术栈、部署、「API 路由全部 edge runtime」一句，以及 `_worker.js` 入口检查描述）并写 `design/history/`。
