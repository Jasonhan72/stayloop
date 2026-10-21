# 升级评估：Next.js 15.5 → 16.4 + React 18 → 19

日期：2026-10-21 · 分支 `claude/next16-upgrade`（只在本地提交，未推送、未部署、生产配置没动）
起因：Next 15 在 2026-10-21 出了官方两年支持期，OpenNext 拒绝构建；`ship2-v53.command` 临时加了 `--dangerouslyUseUnsupportedNextVersion`（`design/history/2026-10.md`「Next.js 15 出官方支持期」）。
日志：`design/next16-upgrade-2026-10-21/`（构建、dry-run 打包、本地冒烟脚本与结果、wrangler dev 请求记录）

## 结论先说

- **能升，而且代码几乎不用动。** 应用代码一行没改：Next 15 那一轮已经把 `params` / `headers()` 全部改成异步，React 19 删掉的旧 API（`defaultProps`、旧版 `ReactDOM.render`、字符串 ref、`forwardRef` 依赖、无参 `useRef`）项目里都没用到，也没有任何第三方 React 组件库。
- **分支上的结果**：tsc 0 错误（含 `next build` 生成的路由类型校验）；全量 vitest **214 个文件 / 2989 条全绿**；`opennextjs-cloudflare build` **不带 dangerously 标志一次构建成功**（49.6 秒，Turbopack）；本地 `wrangler dev` 冒烟 **59/59**；浏览器里页面正常水合、没有水合报错，登录卡片的受控输入和提交在真实浏览器里正常。
- **真正的工作量在测试**：react-test-renderer 在 React 19 已弃用（每次 create 都打警告，并且不包 `act` 就拿不到树），用到它的 21 个组件测试全部改成 `@testing-library/react` + jsdom，断言一条没删。
- **上线前必须做两件事**：① 全局 wrangler 升到 ≥ 4.148（OpenNext 1.20.12 的硬性要求，现在是 4.147.0）；② 从 `ship2-v53.command` 去掉 `--dangerouslyUseUnsupportedNextVersion`。
- **建议**：合并前先在一个临时 workers.dev Worker 上用测试账号跑一遍登录后的主流程（本地冒烟没有服务端密钥，覆盖不到），再按现有 ship 流程上线；回滚是 `wrangler rollback`，几秒钟，不涉及数据库。

## 1. 版本组合

| 包 | 原来 | 升级后 | 说明 |
|---|---|---|---|
| next | 15.5.28 | **16.4.2** | 16 的支持期到 2027-10-21 |
| react / react-dom | ^18 | **^19.3.1** | Next 16 的 peer 是 `^18.2 \|\| ^19`，App Router 实际跑内置的 React canary，外部包对齐 19 |
| @types/react / -dom | ^18 | ^19.3.0 | |
| @opennextjs/cloudflare | 1.20.8 | **1.20.12** | 1.20.12 才正式支持 Next 16.4，并跟进了 10-14 的 Next 安全更新；peer 要求 `next >=15.5.28 <16 \|\| >=16.4.1`、**`wrangler ^4.148.0`** |
| wrangler（项目内） | 4.147.0 | 4.151.3 | 满足 OpenNext peer；**部署用的全局 wrangler 也要升**（见第 5 节） |
| eslint / eslint-config-next | ^8 / 15.5.28 | ^9.39.5 / 16.4.2 | eslint-config-next 16 要求 ESLint ≥ 9。没上 ESLint 10：eslint-plugin-react / jsx-a11y / import 还没声明支持 10 |
| react-test-renderer + @types | ^18 | **删除** | 换成 @testing-library/react ^16.3.3 + @testing-library/dom ^10.4.2 + jsdom ^30.1.3（jsdom 要 node ≥ 22.22.2，本机与 Actions 的 node 22 都满足） |

lockfile 注意：npm 10.9.9 在**没有 lockfile 时从零解析**本项目会崩（arborist `Cannot read properties of null (reading 'edgesOut')`，升级前的 package.json 也一样）。这次是在原 lockfile 上用 `npm install <pkg>@<ver>` 逐步升级生成的，`npm ci` 通过。以后改依赖也要在已有 lockfile 上增量改，不要删 lockfile 重来。

## 2. 改动清单

### 2.1 已在分支上做的

| 文件 | 改动 | 原因 |
|---|---|---|
| `package.json` / `package-lock.json` | 见第 1 节；`lint` 脚本 `next lint` → `eslint .` | Next 16 删掉了 `next lint` |
| `next.config.js` | 删掉 `eslint: { ignoreDuringBuilds }` | Next 16 删掉了这个配置项；`next build` 本来就不再跑 lint |
| `.eslintrc.json` → `eslint.config.mjs` | 平铺配置，同样的预设（core-web-vitals + typescript）和同样的规则覆盖；忽略 `.claude/`、`.screen-patches/` 等点目录 | eslint-config-next 16 只出平铺配置；ESLint 8 默认跳过点目录，平铺配置不跳（主检出的 `.claude/worktrees/` 里是整份仓库） |
| `eslint.config.mjs` | react-hooks 7 新开的 6 条 React Compiler 规则（`set-state-in-effect` 140 处、`refs` 29、`static-components` 20、`purity` 5、`immutability` 4、`globals` 3）降为 warn | 升级前同一提交 lint 是 3 错 66 警告；不降级会变成 200 多个错误。现在是 2 错（就是原来那 2 处 `prefer-const`；原来第 3 个错误在 `next-env.d.ts`，新配置按 Next 默认忽略它）+ 297 警告（其中 201 条来自这 6 条规则）。lint 不卡构建，这些留作单独清理 |
| `tsconfig.json` | `jsx: preserve` → `react-jsx`；include 加 `.next/dev/types/**/*.ts` | `next build` 的强制改写（不改它每次构建都会改） |
| `vitest.config.ts` | 只改注释 | 说明组件测试按文件开 jsdom |
| `tests/helpers/dom.ts`（新） | `only` / `all` / `textOf` / `hexToRgb` | 保持旧渲染器 `findByType` 「恰好一个，否则抛错」的严格度；jsdom 会把颜色归一成 rgb() |
| 21 个组件测试 | react-test-renderer → RTL + jsdom（文件首行 `// @vitest-environment jsdom` + `afterEach(cleanup)`） | 见 2.2 |

`middleware.ts` **没改名**（见 2.3）。

### 2.2 测试迁移（21 个文件）

- 机械映射：`TestRenderer.create` → `render`；`root.findByType('form')` → `only(container, 'form')`；`props.onChange({ target })` → `fireEvent.change`；`props.onClick()` → `fireEvent.click`；`props.onSubmit` → `fireEvent.submit`；`n.props.href` → `getAttribute('href')`；`toJSON() === null` → `container.innerHTML === ''`。
- 每个文件改完后 `expect(` 数量都不少于原来（有两处多了一条：确认 chip 在卡片里、`/register` 页面恰好一张登录卡）。
- 超出机械映射的地方（都不是产品行为变化）：
  - 原来几个测试在 node 环境里手搓了假 `window` / `localStorage` / `location`，jsdom 下改用真的，并在 `afterEach` 里清 `localStorage` / `sessionStorage`、用 `history.replaceState` 设地址——真的 `sessionStorage` 会把上一个测试选的身份带进下一个测试，必须清。
  - 读不到组件 props 的断言（如 `LoginCard` 的 `intent` / `next`）：用一个包住**真组件**的 mock 记录收到的 props，或改测它造成的结果（点 Google 按钮，看回跳地址里的 `next`）。
  - `useAgentSessionThreads`（会话线程时序回归）：B / D 两个场景原来写 `const p = act(async () => sendMessage(...))` 不 await 就继续调别的 `act`。React 19 下外层 act 没结束时内层 act 不刷新渲染，于是拿不到最新状态。改成在 await 的 act 里启动发送、稍后再 await 它，四个场景的断言原样不动。
  - `siteTest20261002_g1`：jsdom 没有布局，「页面自己的 h1 是否可见」用 `getClientRects` 桩来表达；`MutationObserver`、窗口事件现在是真的，比原来的空操作更接近浏览器。
- 速度：全量 vitest 约 14 秒（迁移前约 11 秒，多出来的是 jsdom 启动）。

### 2.3 评估过、决定这次不做的

| 项 | 现状 | 为什么不在这次做 |
|---|---|---|
| `middleware.ts` → `proxy.ts` | Next 16 构建只给一条弃用警告，仍按 edge 中间件运行，冒烟里 7 条跳转 + 7 个安全头全对 | 改名不只是改名：`proxy` 固定跑 Node 运行时，在 OpenNext 里是另一条打包路径（「Node.js middleware」）。Next 官方迁移清单也写了「不要把 edge 中间件盲改成 proxy」。另有 10 个守卫测试按文件名读 `middleware.ts`。建议单独一个分支做，做完同样跑冒烟 + 路由审计 |
| 开 React Compiler | 没开 | 不是升级必需；先清掉上面那 200 多条 react-hooks 警告再说 |
| ESLint 10 | 停在 9.39.5（maintenance 标签） | 三个插件 peer 还不含 10 |
| `next dev` / `next build` 换 webpack | 用默认 Turbopack | Turbopack 构建成功且更快更小（见第 3 节）；万一线上发现打包问题，`build` 脚本改成 `next build --webpack` 是现成的退路 |

### 2.4 逐项核对过、不需要改的

- **Next 16**：`params` / `searchParams` / `headers()` 早已异步（所有动态页面、全部 route handler、两个 `generateMetadata`；`next build` 生成的 `.next/types/validator.ts` 经 tsc 校验通过）；没用 `next/image`（`images.unoptimized`），图片默认值变化无影响；没用 `revalidateTag` / `unstable_cache` / `'use cache'`；没有平行路由（不需要 `default.js`）；`sitemap.ts` 没用 `generateSitemaps`；没有 AMP、`serverRuntimeConfig`、`devIndicators`、`experimental.ppr/dynamicIO`；全局没设 `scroll-behavior: smooth`；fetch / 路由缓存默认值在 15 已经是不缓存，16 没再改。
- **React 19**：没有 `defaultProps` / `propTypes`、`ReactDOM.render/hydrate`、`findDOMNode`、`react-dom/test-utils`、字符串 ref、`forwardRef`、`useFormState`、读 `element.ref`；两处 ref 回调都不返回值；类型升级后 tsc 直接 0 错误。
- **第三方**：依赖里除 next / react 外没有 React 组件库；Supabase、Stripe、pdf-lib、unpdf 与 React 版本无关。
- **GitHub Actions**：三个 workflow 跑 node 22，`ltb-refresh` 用 `npm ci`（npm 10），lockfile 是 npm 10.9.9 生成的，兼容。

## 3. 构建与冒烟结果

| 项 | Next 15（10-18 迁移试验，webpack） | Next 16（本分支，Turbopack） |
|---|---|---|
| `opennextjs-cloudflare build` | 70 秒，需要 dangerously 标志（10-21 起） | **49.6 秒，无标志** |
| 静态页面 | 167 | 169（之后新增了 `/agents` 等） |
| `wrangler deploy --dry-run` | 28.4 MB / gzip 5.26 MB | **23.8 MB / gzip 5.19 MB**（上限 10 MB） |
| 服务端主包 `handler.mjs` | 22 MB | 17.9 MB |
| 静态资源 | 642 个文件 / 10 MB | 282 个文件 / 11 MB |

构建警告只有一条：「The "middleware" file convention is deprecated」。env 守卫通过（本地构建只放了 `NEXT_PUBLIC_*`，用的是 `.env.production.local`，没有私密值）。

本地冒烟（`wrangler dev`，workerd，**没有服务端密钥**；脚本 `design/next16-upgrade-2026-10-21/smoke-local.sh`）：

- 页面 33 个全部 200（首页、定价、房源、四个身份页、规则、平台、服务、关于、合作、联系、争议、登录、注册、隐私、条款、消费者权利、`/my-file`、API 介绍与文档、`/agents`、起名页、设置、消息、租客 / 房东助理页、`/dashboard`、服务商接单、房东申请人、租客申请……）；失效分享链接显示「已失效」页；`/sitemap.xml`、`/robots.txt`、`/manifest.json` 正常；不存在的路径 404；静态 chunk 200。
- 开放 API：`/api/v1/rules`、`/guideline`、`/n4/earliest-termination`、`/openapi.json` 正常，`/api/v1/*` 带 `Access-Control-Allow-Origin: *`。
- 中间件：apex → www、`screening.` 子域 → `/screening`、`/landlord/settings`、`/tenant/messages`、`/landlord/applications/*`、`/trust-api/docs`、`/?role=&ask=` 七条 308 全对；HSTS、XFO、nosniff、Permissions-Policy、Referrer-Policy（token 页 no-referrer）、页面 ACAO 钉本站、没有 `x-powered-by`。
- 动态页面（`/listings/<slug>`、`/agents/<slug>`、`/apply/<slug>`、`/h/<id>`、`/verify|lease/sign|intake/<token>`）都是 200，没有 500。
- 预期内的失败：`/api/listings/search`、`/api/listings/<slug>` 500、`/api/public/stats` 503——Worker 日志里唯一的错误就是「supabaseKey is required」，本地没给 service role 密钥，与 10-18 迁移试验的现象相同。
- 浏览器（内置浏览器打开本地 Worker）：首页完成水合（`window.next.version` = 16.4.2），7 个页面控制台没有任何水合报错；在 `/login` 输入邮箱回车，正确进入密码步骤。唯一的额外报错是 Service Worker 在 `http://127.0.0.1` 上注册失败——`/sw.js` 本身 200、类型正确，生产 https 上同一浏览器已注册成功，属于本地 http 环境限制，上线前在 https 预览上再确认一次。

**没覆盖到的**（需要密钥或登录，本地做不了）：登录后的助理对话与待批卡、租约发送 / 签署、筛查报告、Stripe 结账、Web Push、地图、邮件入站、cron。这些是 React 19 运行时差异最可能露出来的地方（大量客户端 effect），放在第 6 节的预览回归里。

## 4. 风险

| 风险 | 级别 | 说明与对策 |
|---|---|---|
| React 19 运行时差异在登录后流程里露出 | 中 | 渲染错误不再重新抛出而是报到 `reportError`、Suspense 兄弟节点不再预渲染、StrictMode 开发期 ref 回调双调用。代码没用到被删 API，单测全绿，但登录后流程没在浏览器里走过 → 预览 Worker 上用测试账号回归（第 6 节） |
| 生产构建从 webpack 换成 Turbopack | 中 | chunk 拆分、CSS 先后顺序可能不同，界面可能有细小差异。对策：预览上看首页、助理页、房东工作台、筛查报告的桌面与手机宽度；不行就 `next build --webpack` |
| 全局 wrangler 低于 OpenNext 要求 | 高（若忘了） | 部署用全局 4.147.0，OpenNext 1.20.12 要求 ≥ 4.148。上线前先升全局 wrangler 并核对版本 |
| 新版本很新 | 低 | next 16.4.2、OpenNext 1.20.12 都是 10-15 发布。版本已精确钉死在 lockfile；出问题时 `wrangler rollback` |
| `middleware` 弃用 | 低 | 16 里照常工作；17 之前要改成 `proxy`（单独做） |
| lint 警告变多 | 低 | 66 → 297 条警告（新增的主要是 201 条 React Compiler 规则警告），不影响构建；开 Compiler 前要清 |
| 本地开发方式变化 | 低 | `next dev` 默认 Turbopack，开发产物在 `.next/dev`；ship 脚本仍会 `rm -rf .next`，部署后本地预览仍要重启 dev server |

## 5. 上线前要改的部署配置（本分支没动，都在主检出 / 本机）

1. **全局 wrangler**：`npm i -g wrangler@4.151.3`，再 `wrangler --version` 核对；同时把 CLAUDE.md 里的「全局 wrangler 4.147.0」改成新版本（本分支的 CLAUDE.md 已按合并后的状态写）。
2. **`ship2-v53.command`**：构建行去掉 `--dangerouslyUseUnsupportedNextVersion` 和上面四行注释，恢复成 `npx opennextjs-cloudflare build || fail "BUILD FAILED"`。
3. **主检出**：合并后 `npm ci`（package.json 变了）。

## 6. 建议的上线方式

1. 审阅并合并 `claude/next16-upgrade` 到 `v5.3-launch`（这次没有数据库迁移，合并本身不碰生产）。
2. 主检出 `npm ci`，升级全局 wrangler（第 5 节 1）。
3. **预览回归**（推荐，约半天）：用同一份构建部署一个临时 Worker（例如 `stayloop-web-next16`，workers.dev 地址，不挂 zone 路由；`WORKER_SELF_REFERENCE` 的 service 名要跟着改），由用户在终端用 `scripts/worker-secrets-sync.sh` 给它同步密钥，然后：
   - 跑 `scripts/smoke.sh <预览地址>` 和 `node scripts/route-audit.mjs`；
   - 用 `[TEST]` 测试账号按 `design/test-cases-2026-10-17/` 的 S0/S1 用例走一遍四顶帽子的主流程（助理对话、待批卡批准与撤销、租约发送与签署、申请与筛查报告、消息、维修工单）；
   - 桌面 + 375 宽手机各看一遍首页、助理页、房东工作台、筛查报告，对照生产找样式差异；
   - https 下确认 Service Worker 注册、Web Push 订阅。
   回归完删掉临时 Worker（它的密钥一起删）。
4. 改 `ship2-v53.command`（第 5 节 2），在低峰时段按现有流程部署：tsc + vitest → 构建 → env 守卫 → `wrangler deploy` → 冒烟（重试一次）→ 路由审计。脚本会打印上一版本号。
5. 上线后 24 小时内看 Workers 日志的错误率与 `wrangler tail`，留意客户端报错（React 19 把渲染错误报到 `reportError`）。

不建议用 Workers 的按比例灰度（`wrangler versions deploy a@90% b@10%`）：两个版本的静态 chunk 不同，同一个用户的页面请求和 chunk 请求可能落到不同版本上。

## 7. 回滚方案

| 时点 | 做法 | 耗时 |
|---|---|---|
| 合并前 | 不需要：分支不影响生产 | — |
| 合并后、部署前 | `git revert` 合并提交，主检出 `npm ci`，ship 脚本保留 dangerously 标志即可继续按 Next 15 部署 | 几分钟 |
| 部署后发现问题 | `wrangler rollback --name stayloop-web -y`（或 `wrangler rollback <上一版本号> --name stayloop-web -y`）。Worker 版本自带它那一份静态资源，回滚后页面与 chunk 一起回到 Next 15 版本；这次没有数据库迁移，回滚是干净的 | 几秒 |
| 回滚后 | 在 `v5.3-launch` 上 `git revert` 合并提交、`npm ci`、ship 脚本恢复 dangerously 标志，避免下一次部署又把 16 带上去 | 几分钟 |
| 最坏情况 | `bash scripts/worker-routes.sh off` 回到 Pages（10-18 的旧代码，只在 Worker 整体不可用时考虑） | 几秒 |

回滚到 Next 15 只是回到「能用但没有安全补丁」的状态，所以发现问题后应尽快修复并重新上线 16，而不是长期停在 15。
