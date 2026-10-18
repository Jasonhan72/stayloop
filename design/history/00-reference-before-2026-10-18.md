# CLAUDE.md 原参考区（2026-10-18 瘦身前）

瘦身前 CLAUDE.md 开头的参考区原文，含已过时的内容（旧接口、旧首页、v9 配色演变、设计对齐状态）。现行事实以 CLAUDE.md 为准。


AI-powered tenant screening SaaS for Ontario landlords. Live at **www.stayloop.ai**.

## Tech Stack

- **Framework:** Next.js 15.5.2 App Router + TypeScript + Tailwind CSS
- **Hosting:** Cloudflare Pages (`@cloudflare/next-on-pages` v1.13.16)
- **Auth:** Supabase JS v2, implicit flow (`lib/supabase.ts`, `lib/useAuth.ts`)
- **AI:** Claude Sonnet via Anthropic API (Vision + text, edge runtime)
- **Email:** Resend SMTP via Supabase Auth（注册验证邮件 / 重置密码邮件 / 应用通知；**一次性登录链接（magic link）已弃用**——用户 2026-09-27 重申「早就不要了，改为常规的几个登录方式」：Google、邮箱 + 密码登录、邮箱 + 密码注册、忘记密码。`signInWithOtp` 不得再出现在任何入口，守卫 `tests/loginMethods20260927.spec.ts`）
- **Payments:** Stripe **LIVE mode**（2026-08-26 切换，见下「支付模块」节的切换记录）
- **Maps:** Google Maps API
- **DB:** Supabase (project `uotcczsfeiptnabamzcd`, **AWS ca-central-1 蒙特利尔**；**2026-09-22 起对外地址是自定义域名 `https://auth.stayloop.ai`**（Custom Domain 附加功能 $10/月，`NEXT_PUBLIC_SUPABASE_URL` 本地与 CF 都已换；原因：Google 登录页显示「继续前往 uotcc….supabase.co」太丑。DNS 在 Cloudflare：`auth` CNAME → 项目 + `_acme-challenge.auth` / `_cf-custom-hostname.auth` 两条 TXT，全部 DNS only；Google OAuth client 已由用户加回调 `https://auth.stayloop.ai/auth/v1/callback`。REST / Storage / Auth 全走该域名，原 `*.supabase.co` 仍可用——GitHub Actions 与 ingest 脚本没改。切换后所有人重新登录一次（supabase-js 的存储键由主机名首段推导）。要让 Google 显示「继续前往 Stayloop」而非域名，还需用户在 Google Console 完成 OAuth 品牌验证）；2026-09-16 从 us-east-1 的 `upbkcbicjjpznojkpqtg` 迁入；旧项目 2026-09-17 由用户拍板删除，SQL 转储留在 `~/stayloop-backup-2026-09-16/`)

## Repo & Branches

- GitHub: `github.com/Jasonhan72/stayloop` — **public**（曾误记为 private，2026-08-02 核实；已确认仓库里没有真实密钥，只有 `.env.example` 之类的占位符）。PAT 在 `.git/config`（本地，未入库）
- Local branch: `v5.3-launch`（2026-08-02 由 `v5` 改名，与上游同名，裸 `git push` 现在就是对的目标）
- Push target: `v5.3-launch`（部署脚本仍用显式 `git push origin HEAD:v5.3-launch`）
- **GitHub 默认分支：`v5.3-launch`**（2026-08-02 从 `main` 切换）。原因：定时 workflow **只在默认分支上注册与运行**
- **分支结构（2026-08-02 整理）**：远端只有 **1 个活跃分支 `v5.3-launch`**，其余 39 个全部改名到 `archive/` 前缀（`archive/YYYYMM-<原名>`）。**没有删除任何分支**——历史提交全部保留，需要时按原名可查
- ⚠️ **`main` 已不存在**：它是 v4 时代的旧代码库（冻结于 2026-06-03，与 v5 线**无共同祖先**，是两条完全独立的历史），已改名为 `archive/v4-main-2026-06-03`。改名的直接原因是它上面的 `deploy.yml` 触发条件为 `push: branches:[main]`——只要有人推 main，就会把 2026-06-03 的代码部署到生产、覆盖线上。**现在没有叫 main 的分支，这条触发器永远不可能再命中**
- CF Pages prod branch: **`main`** — deploy always uses `--branch main`（这是 wrangler 的 CF Pages 分支标签，**与 git 分支无关**）
- ⚠️ **不要 push 到 git `main`**：那上面的 `.github/workflows/deploy.yml` 触发条件是 `push: branches:[main]`，会把 2026-06-03 的旧代码部署到生产、覆盖当前线上版本。它现在已不在默认分支上（GitHub 标为 deleted、无法通过 API disable），但**推 main 仍会从 main 那份定义执行**。部署一律走 `ship2-v53.command`

## Deploy

Double-click `ship2-v53.command` in Finder. It does:
1. `git add -A && git commit && git push origin HEAD:v5.3-launch`
2. `npx @cloudflare/next-on-pages@1` (build)
3. `wrangler pages deploy .vercel/output/static --project-name stayloop --branch main --commit-dirty=true`

**Critical:** use global `wrangler`, NOT `npx wrangler` (hangs on install prompt).

**Node 版本：本机默认 `node` 必须是 node@22 LTS**（2026-09-04 定）。此前默认是
node 26.0.0 keg，同一份代码、同一份缓存下所有 JS 进程慢 10-100 倍（tsc 150s vs 10s、
单个 vitest 文件 34s vs 0.3s、2026-09-03 那次 next-on-pages 编译 38 分钟）。已用
`brew unlink node && brew link --overwrite node@22` 切换，`ship2-v53.command` 开头
还把 `/opt/homebrew/opt/node@22/bin` 钉在 PATH 最前，防止将来 `brew upgrade` 把
`node` 重新 link 回去。node 26 keg 保留（`/opt/homebrew/opt/node/bin/node`，用户的
openclaw 网关按绝对路径用它），**不要卸载**。构建/测试再变慢时第一件事查 `node --version`。
**2026-09-24 又发生一次，且多了一层**：`brew upgrade` 把 `node` 重新 link 回 26，同时升级了 `simdutf`，而 node@22 的旧 bottle
链接的是 `libsimdutf.35.dylib`——`brew link node@22` 之后 `node` 直接 `dyld: Library not loaded`。修法：`brew reinstall node@22`
（拿链接新 simdutf 的 bottle）→ `brew unlink node && brew link --overwrite node@22`。另一个独立的慢因：**这台机只有 8 GB 内存**，
openclaw 网关（node 26，`--max-old-space-size=4096`）常驻 2.7 GB，swap 用到 2.2 GB 时文件系统读取会慢到「900 个源文件读 62 秒」，
tsc / vitest 看起来像卡死（CPU 0%）。这不是代码问题；`top -o mem` 一眼可见。

**Gate：已内置在 `ship2-v53.command` 里，不再依赖人记得。** 脚本按顺序执行并在任一步失败时中止且**不部署**：
1. `npx tsc --noEmit` + `npm test`（此前只写在本文件里，那天 `app/icon.svg` 把整站 API 打挂时它没有运行）
2. push → 清构建缓存 → `npx @cloudflare/next-on-pages@1`
3. **`_worker.js` 入口检查**——next-on-pages 产出的 `_worker.js` 是**目录**（内含 `index.js`），而原来的守卫写的是 `[ -f ]`（测试普通文件），**对目录恒为假，所以自加上之日起就在无条件中止部署**；无人察觉是因为大家改成手动逐步部署了。现已同时接受目录形态与单文件形态，并要求入口非空
4. `wrangler pages deploy`
5. **部署后 smoke，失败自动重试一次**（30s 后）。九个探针里有两个在刚部署时会合理地闪红：边缘缓存传播、以及依赖实时抓 Realtor.ca 的行情探针。真回归会两次都红——**两次都红 = 回滚信号**

Verify deploy: `curl -s 'https://www.stayloop.ai/?v=<timestamp>' | head`

## Edge Runtime Gotcha — fake `globalThis`（2026-08-21）

next-on-pages 把每个路由 chunk 包成 `(self, globalThis, global) => …` 并传入**每路由一个的代理对象**。代码里写 `globalThis.X = …` 落在代理上；而第三方包里**裸标识符**（如 pdf.js 模块顶层的 `new DOMMatrix`）走的是真 V8 全局——永远看不到。症状：`typeof globalThis.DOMMatrix === 'function'` 却仍 `ReferenceError: DOMMatrix is not defined`。这让 unpdf 文本提取在生产上**45 天 0 成功**（0/275 文件有 text_density）而本地测试全绿。解法在 `lib/forensics/pdf-text.ts`：`getRealGlobal()` 用 Object.prototype getter 技巧拿真全局（Workers 禁 eval/Function），polyfill 同时装到真全局与代理上。诊断端点 `/api/admin/diag-pdftext`（管理员 JWT）。**任何需要浏览器全局 polyfill 的边缘依赖都要按这个方式装。**

## Scheduled Jobs (GitHub Actions)

两个数据刷新任务，都在 `.github/workflows/`，都**只有 `schedule` + `workflow_dispatch` 触发器**——仓库是 public 且这两个 job 持有可绕过 RLS 的 service-role key，加 `pull_request` 会让 fork 的 PR 拿到密钥。

- `ltb-refresh.yml` — 每月 3 号 07:00 UTC，跑 `scripts/ltb_ingest.mjs`（LTB 判令目录，增 + 删）
- `refresh-ca-corp-registry.yml` — 每月 5 号 06:00 UTC，跑 `scripts/ingest-ca-corp-registry.mjs`（联邦公司注册库，deep-check 的雇主/BN 核验靠它）

**唯一需要的 secret 是 `SUPABASE_SERVICE_ROLE_KEY`。** Supabase URL 是 `NEXT_PUBLIC_`、本来就在浏览器包里，已内联进 workflow——曾经因为「需要两个 secret」而长期只配了零个：CA registry 从 2026-05 起每月失败、`ca_corp_registry` 陈旧了三个月无人察觉。两个 job 现在都有 preflight，缺 secret 时直接报可执行的错误。

**踩过的坑**：`npm ci` 在 runner 上失败而本地通过——`actions/setup-node@v4` + node 20 给的是 npm 10，而本地 npm 11 写的 lockfile 省略了 `node_modules/tsx/node_modules/esbuild` 这个嵌套条目（顶层 esbuild 被别的依赖钉在 0.15.18）。改 package.json 后要用 `npx npm@10 install --package-lock-only` 重新生成，并确认 npm 10 与 11 都能 `npm ci`。

## Env Vars

All in `.env.local` (git-ignored). Keys needed:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
CANLII_API_KEY
RESEND_API_KEY
RESEND_FROM
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PRICE_ID
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_GOOGLE_MAPS_KEY
```

Optional (guarded with `if (process.env.X)` — features degrade gracefully when absent):

```
JINA_API_KEY                # agent listing search → realtor.ca scrape (lib/agent/listingSearch.ts)；兼作 CanLII 索引检索的现役后端（s.jina.ai，lib/screening/canliiIndex.ts 提供商链第二级）
GOOGLE_CSE_KEY              # CanLII 自动检索提供商链第一级（Google CSE）。⚠️ 2026-08 实测 Google 对（新）项目关闭了此 API（项目级 403，启用/结算/新 key 都解不开），本部署实际走 Jina；key 留着无害，链会自动跳过。全链失败时回退为预填姓名的一键人工检索链接
GOOGLE_CSE_CX               # 同上——Programmable Search Engine 的引擎 ID（限定 canlii.org）。注意：索引命中是「提及」不是当事人记录，hitKind='mention'，永不进评分/total_hits
OPENCORPORATES_API_TOKEN    # deep-check / forensics arm's-length lookup (lib/forensics/arm-length.ts)
CRON_SECRET                 # gates cron mode on /api/agent/proactive; same value stored as Supabase Vault secret 'cron_secret' (pg_cron job agent-proactive-daily, 13:00 UTC)
DEEPSEEK_API_KEY            # optional · 后台模型配置用（/admin/models 槽位可选 DeepSeek 模型时需要）
MOONSHOT_API_KEY            # optional · 后台模型配置用（Moonshot/Kimi）
OPENAI_API_KEY              # optional · 后台模型配置用（OpenAI GPT-5.4 / 5.4 mini，turn 槽位；GPT-5 系列走 max_completion_tokens）
GEMINI_API_KEY              # optional · 后台模型配置用（Google Gemini 3.7 Flash / 3.1 Pro，turn 槽位；AI Studio key，走 generativelanguage .../v1beta/openai 兼容端点）
DASHSCOPE_API_KEY           # optional · 后台模型配置用（阿里 DashScope/Qwen）
ZHIPU_API_KEY               # optional · 后台模型配置用（智谱 GLM）
VERIFF_API_KEY              # optional · 申请人身份核验（Veriff 托管会话）。缺则 /verify 页身份步显示「未开通」
VERIFF_SECRET_KEY           # 同上 · 决策 webhook 的 HMAC-SHA256 共享密钥（/api/verify/webhook/veriff）
FLINKS_AUTH_KEY             # 申请人银行直连（Flinks）· `flinks-auth-key`，只用来换 Connect 必带的短效 Authorize Token（2024-10 起强制）
FLINKS_API_SECRET           # 同上 · `x-api-key`，聚合接口（Authorize / GetAccountsDetail）用。两者都缺则银行步「未开通」
FLINKS_INSTANCE / FLINKS_CUSTOMER_ID / FLINKS_API_BASE / NEXT_PUBLIC_FLINKS_CONNECT_URL   # Dashboard → Settings → 实例下拉里的 Customer ID / API domain / Connect domain；不设 instance = toolbox 沙箱（结果带 sandbox:true，评分不采信）。redirectUrl 域名（www.stayloop.ai）须请 Flinks 白名单
CREDIT_PULL_PROVIDER        # optional · 征信本人授权直拉：'equifax'（需下面的 EQUIFAX_* 才算可用）或 'mock'（仅本地 .env.development.local，fixture 走全链路，sandbox:true 不计分）。不设=征信步「未开通」
EQUIFAX_CLIENT_ID / EQUIFAX_CLIENT_SECRET / EQUIFAX_MEMBER_NUMBER / EQUIFAX_SECURITY_CODE / EQUIFAX_CUSTOMER_CODE   # Equifax 开发者门户 App + 加拿大商业协议下发；EQUIFAX_ENV=sandbox|test|production
```

Same vars are set in Cloudflare Pages dashboard for production.

## Key Files

### Core
- `lib/supabase.ts` — Supabase client (implicit flow)
- `lib/useAuth.ts` — auth hook
- `lib/useLandlord.ts` — landlord hook, calls `claim_landlord()` RPC
- `lib/i18n.tsx` — i18n (zh primary; `t(key, fallback)`)
- `middleware.ts` — apex → www 308 redirect
- `tailwind.config.ts` + `app/globals.css` — design tokens (`.sl-card`, `.sl-btn-primary`, `.orb`, role colors)

### Components
- `components/Header.tsx` — global nav: **我是** dropdown (租客/房东/经纪) · 房源 · 定价 · 租客筛查(→/screening); admins also see a 后台管理 entry in the avatar menu (Trust API NOT in nav)
- `components/Footer.tsx` — footer with v5.3 label
- `components/Logo.tsx` — wordmark `stay` + `loop.AI`（`loop.AI` 整段紫→蓝渐变；勿改成只给 `.AI` 上色）
- `components/WorkspaceShell.tsx` — all workspace pages use this (role-based theming)
- `components/RoleLanding.tsx` — shared template for /tenant /landlord /agent marketing pages
- `components/agent/*` — 9 agent UI components (AgentHeroStatus, ApprovalActionCard, etc.)

### Agent Spine
- `lib/agent/*` — types, session-loader, approval-engine, memory, audit, orchestrator, demo, prompts, guardrail, `useAgentSession` hook
- `/tenant/agent` (Luna), `/landlord/agent` (Logic), `/agent/agent` (Brief)
- `useAgentSession` has 5s render deadline + 4s RPC timeout (falls back to demo if stalled)

### Agent Brain (2026-06-16 — AI-native reasoning loop)
- **`app/api/agent/turn/route.ts`** (edge) = the Personal Agent reasoning step. STATELESS: client passes `{role, message, memories, workflow}`, route runs the configured model — 模型经 `/admin/models` 槽位可配（`app_config.models`，默认 Sonnet 4.6），登录用户可在 `/settings/models` 自选覆盖（turn/screening 两槽位；`getModelForUser`）— with a role system prompt (`lib/agent/prompts.ts` — Luna/Logic/Brief persona + 5 principles + "propose, don't decide"), returns `{reply, memory_writes, proposed_action, next_stage}`. Anthropic key stays server-side.
- **Split**: server = reasoning only; client (`runAgentTurn` in orchestrator.ts) persists via RLS-scoped browser client — implicit memory → `user_memories` (`upsertMemories`, onConflict `user_id,role,memory_type,key`; memory_type clamped to preference/profile/constraint/semantic/system), proposed action → `agent_pending_actions`, turn → `agent_audit_events`. Same pattern as existing memory.ts/approval-engine.ts.
- **Compliance Guardrail** (`lib/agent/guardrail.ts`) = deterministic server-side filter on every turn output: blocks OHRC-protected-ground rejections, flags illegal lease terms, strips false "already done" claims, demotes over-reach scope. The LLM is also instructed but the guardrail is the backstop.
- **Fallback**: anonymous/preview or any failure → canned acknowledgement (no LLM cost, no persistence). Real reasoning only for authed live sessions.
- **Self-learning（2026-08-24）**: `lib/agent/reflection.ts` — 三层机制让管家越用越懂用户。① 逐轮 `memory_writes`（原有）；② 反思整合：turn 路由在回复送出后（`getRequestContext().ctx.waitUntil`，dev 下降级为浮动 promise）用 `needsReflection` 门控（每用户每角色 ≥20h 一次）后台跑 `reflectUser`——读最近 14 天对话轨迹（`agent_audit_events` turn 事件，metadata 现在含 `reply` 片段）+ 全部记忆 + `approval_events` 批准/拒绝记录，turn 槽模型合成结构化画像（goals/preferences/constraints/style/current_focus/worked_well/avoid，禁 OHRC 受保护特征），upsert 成 `user_memories` 单行（memory_type `system`、key `user_model`、source `reflection`）；③ 每轮注入：turn 路由与快照并行取该行，`userModelToPromptBlock` 拼进 system。全程走用户自己的 RLS client。`/api/agent/reflect` 为手动/回填端点（`x-cron-secret` 全量 sweep 或用户 JWT 自刷）。测试 `tests/reflection.spec.ts`。
- **Entry IA**: login → role's `/x/agent` (was: everyone → `/dashboard`). Header workspace link + WorkspaceShell rail treat the Agent home as the primary entry; V4 pages are related flows.
- **Note**: the V4 AI-native tables (`conversations`/`messages`/`user_facts`/`tool_executions`/`pending_actions`/`audit_events`) were dropped 2026-07-08 (`20260708_drop_v4_agent_layer.sql`). Only the `agent_*` layer exists; Trust API audits also write `agent_audit_events` now.

### API Routes (all edge runtime)
- `app/api/screen-score/route.ts` — Vision OCR + 6-dim scoring + streaming progress
- `app/api/deep-check/route.ts` — deep background check
- `app/api/ltb-search/route.ts` — LTB 判令检索（走开放数据目录 `lib/ltb/`）
- `app/api/file-url/route.ts` — signed URL for file viewing
- `app/api/ai-score/route.ts` — legacy scoring
- `app/api/trust/verify/route.ts` — Trust API endpoint
- `app/api/notify-landlord/route.ts` — email notifications
- `app/api/agent/turn/route.ts` — Personal Agent reasoning step (Claude + Guardrail); durable rate limit via `bump_agent_rate_limit` RPC
- `app/api/agent/proactive/route.ts` — renewal-window scanner → pending actions; cron mode via `x-cron-secret` (service-role platform-wide sweep + month-end rent reminders), user-JWT mode on workspace load
- `app/api/agent/trreb-refresh/route.ts` — parses the TRREB quarterly Rental Market Report PDF (via Jina, fail-closed narrative cross-check) → `trreb_rent_stats` cache; pg_cron weekly (Mon 13:10 UTC); market card reads the cache for its official-benchmark line
- `app/api/agent/execute/route.ts` — executor dispatch for approved actions: send_renewal_letter (explicit A/B rent option), send_message, rent_reminder — shared claim/release/audit plumbing
- `app/api/lease/{send,sign,view}/route.ts` — e-sign flow; sign route decouples signature-write from dual-sign finalize (race-safe); form-agnostic (ontario_standard + trreb)
- `app/api/stripe/{checkout,portal,webhook}/route.ts` — billing; webhook also settles referral fees (metadata kind='referral_fee' → commission.stripe_transfer_id + referral 'fee_settled')
- `app/api/stripe/connect/{onboard,settle}/route.ts` — Connect Express onboarding (brokerages.stripe_connect_id) + referral-fee settlement (settle_referral_commission RPC → Checkout for the 25% fee)
- `app/api/classify-files/route.ts` — upload classification

### ⚠️ CanLII 不能按姓名查（2026-08-02 实测确认）

**CanLII 的 API 没有全文检索、也没有当事人检索。** 官方文档里 caseBrowse 的参数只有
`publishedBefore/After`、`modifiedBefore/After`、`changedBefore/After`、`decisionDateBefore/After`
——**没有 `fullText`**。传了会被静默忽略。

线上实测(同一 endpoint、三次请求)：不传 fullText / 传真实申请人姓名 / 传 `"zzqqxx9988nonsense"`
→ **返回结果完全相同**，都是该库最近 N 份判决。

原来的代码在 78 个安省库上跑 `caseBrowse/en/<db>/?fullText="<姓名>"`，再用姓名比对标题。
等于对**每个申请人**都拉同样那 780 份近期判决，几乎必然 0 命中，然后报 **"✓ 无记录"**——
而报告里还写着"✓ 无记录表示该库已实际检索"。一个真的被 LTB 驱逐过的租客因此显示为干净。

**已删除该检索路径**（含 `searchCanLIIDb` / `listOntarioDatabases`，-112 行），CanLII 现在
只作为"不可用"披露。`tests/ltb.spec.ts` 有回归守卫：仓库里出现任何构造 `fullText` 的代码即失败。

**真正能按姓名查的只有两个**：① 安省法院门户(Civil & Small Claims，真当事人检索)；
② LTB 开放数据目录(下节，我们自己落库建索引)。

### LTB Order Catalogue (2026-08-02)

安省 2026-07-24 把 LTB 终局判令发到开放数据（`data.ontario.ca/dataset/ltb-order-catalogue`，Open Government Licence – Ontario，可商用需署名）。当前覆盖 2026-01～2026-05 共 40,844 份判令，2021 年起的历史判令分阶段补齐，新判令签发后 2-3 个月发布。**与 CanLII 互补而非替代**——CanLII 有多年深度，目录目前只有 5 个月。

- `lib/ltb/normalize.ts` — 姓名/地址归一化，**ingest 与查询共用同一份**（两边不一致 = 记录进了库却查不到，是最难发现的假阴性）
- `lib/ltb/search.ts` — 查询 + 分类；`scripts/ltb_ingest.mjs` — 全量刷新（资源列表从 CKAN 发现，不写死 resource id，否则 2021 补齐上线时会静默停止覆盖）
- **自动刷新**：`.github/workflows/ltb-refresh.yml`，每月 3 号 07:00 UTC + 手动触发。**触发器只有 schedule/workflow_dispatch**——仓库是 public，此 job 需要 service-role key，加 `pull_request` 会让 fork 拿到密钥。需要 GitHub Secrets 里有 `NEXT_PUBLIC_SUPABASE_URL` 与 `SUPABASE_SERVICE_ROLE_KEY`
- **刷新是「增 + 删」**：目录会撤下被保密令覆盖的判令，只增不删会让我们继续展示安省已撤下的记录。每行带 `last_seen_run` 戳，本轮没见到的行会被 prune；若本轮解析出的行数不足库内一半则**拒绝删除并报错**（防截断下载清库）
- **不走他们的实时 API**（2026-08-02 二次实测复核）：CKAN 的 `q` **是词之间 AND**（`q=Florentina zzqqxx9988` → 0；此前记的「OR」是错的），真正的问题是它**搜所有列**——`q=David Park` 返回 39 行，前五行是住在 PARK ROAD 的租客 DAVID HUTCHINSON、West Park Avenue 上名叫 David Atwell 的房东、以及一个真名 David Park 的**房东**，没有一个是名叫 David Park 的租客。`filters` 是**整格精确匹配**，而 40,844 份判令里有 13,384 份把共同被申请人打包在同一格（"A and B"），精确匹配必然漏掉。`datastore_search_sql` 被站点挡掉（返回 HTML 门户页 / 429）。**结论不变：必须自己落库、按角色展开后匹配。**
- **匹配用 token 包含关系而非纯 trigram**：0.62 相似度会把 DAVID PARKER(0.71)/DAVID PARRY(0.64) 当成 David Park。
- **性能**：143,869 行时常见姓名查询 904ms（trigram 默认阈值 0.3 → 1073 个候选再逐行 filter）；改成每个分支各有索引 + 函数内 `set_limit(0.85)` 后 **19.6ms**。1.2M 行时仍要复查。
- **三条红线**（见 `lib/ltb/search.ts` 顶部注释）：① 只有「房东发起(L)且对方是租客」才算风险信号，T1/T2/T5/T6 是租客主张自身权利，只作中性上下文、绝不扣分；② 姓名命中在地址佐证前一律视为同名，只有佐证过的才进 hard gate；③ 目录**没有判决结果字段**，任何地方都不得写「已被驱逐/确认欠款」，只能说「已出判令」并给出 PDF 链接。

### Screening Module
- `app/screening/page.tsx` — main screening page with streaming progress
- `app/screening/[id]/{report,done,graph,ltb,share}/page.tsx` — sub-pages
- `lib/generateReport.ts` — PDF report (browser-print HTML)
- `lib/forensics/` — document forensics engine

## DO NOT TOUCH — Screening Module

The screening module (`app/screening/`, `app/api/screen-score/`, `app/api/deep-check/`, `lib/generateReport.ts`, `lib/forensics/`) has been through deep independent iteration. **Do not modify these files** unless explicitly asked to work on screening.

## Dual-ID Invariant (Critical)

`landlords.id` (profileId, e.g. `62d71545...`) ≠ `auth.users.id` (authId, e.g. `90138c49...`).

- Legacy `screenings.landlord_id` rows store profileId; new inserts store authId
- The `screenings → landlords` FK was **DROPPED** — PostgREST embeds (`landlord:landlords(...)`) will fail
- Plan lookups: always use `.or('id.eq.X,auth_id.eq.X')` on landlords table
- Ownership filters on screenings: rely on RLS, don't hard-filter by `user.id`
- `applications → listings → landlords` FK chain is intact

## Database Migrations

In `supabase/migrations/`:
- `20260509_v5_schema.sql` — V5 base schema
- `20260606_agent_core.sql` — 7 agent tables (`agent_configs`, `user_memories`, `task_memories`, `agent_sessions`, `agent_pending_actions`, `approval_events`, `agent_audit_events`)
- `20260606_agent_core_seed_all_roles.sql` — `seed_demo_agent_data(role)` RPC
- `20260608_billing_commission.sql` — billing/commission tables + `get_entitlements(role)` + `settle_referral_commission` (25% engine + ComplianceGuard)
- `20260608_security_fixes.sql` — security patches
- `20260708_drop_v4_agent_layer.sql` — dropped the old V4 AI-native tables (`conversations`, `messages`, `user_facts`, `tool_executions`, `pending_actions`, `audit_events`); only the `agent_*` spine remains
- `20260713_anon_rate_limit.sql` — `anon_rate_limits` table + `bump_anon_rate_limit()` (anonymous agent-turn rate limiting, service-role only)
- `20260720_app_config_models.sql` — `app_config` table (admin-only RLS via `is_stayloop_admin()`); seeds the `models` key = AI model slots read by `/admin/models`
- `20260803_households.sql` — 在管租约(households/members/invites/messages + maintenance_tickets.household_id + tenancy-files bucket + 6 个 SECURITY DEFINER RPC,均已 revoke anon)。**注意两处遗留修正**:lease_documents 的 status/form_type CHECK 已扩含 'imported';rent_payments.lease_id 原指向 lease_agreements(第三张遗留租约表,0 行零消费者)已重指 lease_documents,tenant_id 的死表 FK 已删(列存 authId)
- `20260823_ai_usage.sql` — `ai_usage`（每次模型调用一行：用户/筛查/槽位/模型/token/USD 成本/延迟；service role 写，管理员与本人可读）+ `model_catalog` 四个单价列 + `admin_ai_usage_stats(p_days)` 聚合 RPC。记账统一在 `lib/llmChat.ts`（含流式用量、Qwen OCR），价目在 `lib/modelConfig.ts` BUILTIN_PRICING / 目录行
- `20260821_model_catalog.sql` — `model_catalog`（全站模型目录，内置模型由代码 seed，同 id 行覆盖内置；authenticated 可读 enabled 行，管理员可写）+ `user_model_preferences`（每用户每槽位一行，仅本人 RLS）
- `20260802_ltb_order_catalogue.sql` — `ltb_orders`（安省开放数据 LTB 判令目录，按「每人每角色一行」展开）+ `ltb_ingest_runs` + `search_ltb_orders()` / `ltb_coverage()` RPC（SECURITY DEFINER，仅 authenticated/service_role 可执行，表本身无 policy 不可直读）

## Design Source of Truth

- **v9 全站重设计（2026-09-05 起，用户定稿）**：`design/redesign-2026-09/`（Claude Design 画布导出的四块画板：`Main.dc.html` 首页桌面、`MobileHome.dc.html` 首页手机、`Screening.dc.html` 筛查页、`Console.dc.html` 房东工作台）= 现行蓝本。方向：营销页学 SingleKey / TurboTenant 的转化式 SaaS 语言（**白底、冷灰中性色、单一强调色**）。**2026-09-05 用户改配色为 flinks.com 的墨蓝/灰系**：`brand` 令牌 = 墨蓝 #1B1B3C（主按钮、链接、进度条），`brand-bright` = 浅蓝 #00ACE4（只用于 logo 渐变尾色与首页标题强调词），紫色 #7C3AED 全站替换（`lib/roleTheme.ts` 里租客角色色除外——那是身份色，只出现在头像/徽章）；`.sl-btn-primary` 改为纯色墨蓝，wordmark 渐变改为墨蓝→浅蓝，登录后工作台学 Flinks / Veriff 控制台（**深色侧栏 #0f1b33 带文字标签、#F4F6F9 内容底、白卡**）。**2026-09-05 用户纠正：只换视觉，不动内容**——首页与筛查页恢复为原有结构、文字与 AI 对话演示（`app/page.tsx` / `app/screening/LandingBody.tsx` 取自 a4a9fff，只做配色替换与氛围纹理扁平化；画板里的分栏 hero / 报告卡等结构性改动**未采用**）。已落地的只有：`components/WorkspaceShell.tsx`（侧栏；房东栏多了「筛查」）、`tailwind.config.ts` 与 `globals.css` 的 surface/line 令牌整体由暖纸色改为冷灰（#F4F6F9 / #E2E8F0 / #CBD5E1），全站硬编码的暖纸色十六进制已批量替换。**v8 首页蓝本因此作废**，Header/Footer/logo 仍原样不改。**2026-09-05 晚二次纠正（现行）：整套配色对齐 flinks.com 本站**——用户看了对照截图后说「整个颜色和配色不对」，于是 `brand` 令牌改为 Flinks 亮蓝 **#00ACE4**（hover/strong #0094C6；主按钮、链接、chip、进度条、聊天用户气泡），文字令牌改为墨蓝系（ink/body #1B1B3C、body-2 #4A4A6A、body-3 #6E6E8A），surface/line 令牌改为蓝调浅灰（#F3F8FC / #E3F2FC / #EEF5FA；线 #D3E3EF / #9FBBD0 / #E4EEF6），首页 hero 底为 Flinks 式浅蓝渐变 `#E9F5FD→#FFFFFF`、深色数据带与工作台侧栏用墨蓝 #1B1B3C，`.sl-btn-primary/secondary/ghost` 与筛查页 CTA 改为胶囊（rounded-full）。墨蓝 #1B1B3C 只保留在：文字、侧栏、深色带、logo/wordmark 渐变的起点。全站硬编码的 #1B1B3C（原紫色替身）已批量换成 #00ACE4；`lib/roleTheme.ts` 仍不动
- **现行首页（2026-09-27 用户定稿，V0.7 · 营销 + 登录页）**：`app/page.tsx` 仍只渲染 `components/home/HomeNext.tsx`，但 Hero 不再是对话框——左侧两行标题 + 一句导语 + 两个按钮，右侧登录卡（`components/home/LoginCard.tsx`，与 `/login` 共用 `lib/auth/useLoginForm.ts`）。**已登录访客不看首页**，`HomeNext` 用登录页同一谓词 `homeForHats` 直接跳到所持帽子的助手页（服务商 → 工单页）。免登录演示搬到助手预览页；`/?role=&ask=` 由中间件 308 到 `/<r>/agent?prompt=…&send=1`。蓝本 `design/homepage-v10-marketing-login-2026-09.html`，细节见文末「首页 V0.7」一节。**Header / Footer / logo / 配色不动（用户 2026-09-27 明确：header 的菜单和位置不要动）。**
- **上一版首页（2026-09-06 至 2026-09-27，「首页就是助手」，已被 V0.7 取代；以下为当时的记录）**：`app/page.tsx` 只渲染 `components/home/HomeNext.tsx`（原 `/next` 候选路由已删）。**替换前的 v8 首页原文备份在 `design/backup/homepage-v8-2026-09-06.page.tsx.bak`**（.bak 后缀，tsc 与 tailwind 都不扫）。原则：**首页就是助手**——Hero 是可用的 `AgentChat`（`useAgentSession(role)`，匿名预览走 `/api/agent/turn`，真实房源 + TRREB 行情，按 IP 限次，不落库），角色切换 pills（租客/房东/经纪，key=role 重挂载）；页面上每一条例句（痛点区、角色 tab）都送进同一个对话并滚回 Hero；无照片、无编造的控制台数字；深色带四个数字来自 `/api/public/stats`（边缘路由，service role 只读计数，缓存 1h：screenings / ltb_orders / 可见 listings / TRREB 季度数）。文案沿用线上首页，只把不可兑现的收益改写（房东「在线收租」→「租约与续约由系统跟进」；经纪带看/佣金标「即将」）。**先前两版蓝本（Loop 卡宣传册式）已被用户否决并删除，不要再从 design/ 里的旧蓝本出发。**
- **v8 首页（2026-07-24 至 2026-09-05，已被 v9 取代）**：`design/v8-homepage.html` = 旧首页蓝本（taste-skill 探索定稿：暖纸底 #FDFBF6/#F6F3EA、Hero 氛围网格+双色雾、幽灵编号编辑部排版、通栏照片+玻璃数据条、三角色 tab 切换面板、渐变数字深色带；Header/Footer/logo 一律产线原样不改；文案沿用已批准口径，双语 COPY 机制保留）。/tenant /landlord /agent 三个角色页（components/RoleLanding.tsx）同步采用 v8 设计语言（角色色仅作点缀）。v7 蓝本已被取代（仅存档）
- **v7 首页（已取代）**：`design/v7-homepage.html` = 旧首页蓝本（「国际产品公司」方向：8pt 栅格设计系统、单主色纪律——品牌紫唯一强调、角色色仅作演示卡点缀，统一白卡/按钮/胶囊组件规范，动效只留淡入+打字机；结构=吸顶导航→Hero 产品卡→信任行→雾景照片带+浮出数据卡→三角色白卡演示段→三步→深色数据带→终幕照片 CTA；照片 `/home/hero-mist.jpg` + `/home/final-interior.jpg`；文案沿用已批准的平实口径，实现必须保留中英双语 COPY 机制）。v6 蓝本 `design/v6-homepage.html` 与 v5.4 蓝本 `design/v54-homepage.html` 已被取代（仅存档）；`design/v54-passport-stamps.html` 认证体系蓝本继续有效（「认证 N 级」→ 四枚章 + 绿勾 #6AB344，`trust_tier` 数据字段与 tier-badge CSS 类名保持不动，仅表现层改名）
- `design/v53-handbook-complete-zh.html` — full engineering handbook
- `design/v53-vol1.html` through `v53-vol8.html` + `v53-vol-arch.html` — extracted volumes
- VOL1=homepage, VOL2=workspace flows, VOL3=settings/pricing/agent, VOL4=more UI, VOL5-7=screening(skip), VOL8=disputes/LTB/legal
- **Rule: build STRICTLY to these designs — exact copy, exact routes, exact layout. Don't improvise.**
- 设计探索辅助：`.claude/skills/design-taste-frontend/`（开源 taste-skill，Leonxlnx/taste-skill@66k⭐ 的 anti-slop 前端品味规则）。**仅限**做新蓝本/新营销页的设计探索阶段（产出先落 `design/` 给用户定稿）；已定稿蓝本和产线页面一律以蓝本为准，此 skill 不得凌驾设计蓝本。它反对的 "AI 紫渐变" 默认色不适用于我们——品牌紫是既定决策。

### Design Alignment Status (as of 2026-06-16)

**Done (earlier):**
- Homepage (`app/page.tsx`) — fully aligned with real images, LunaChatDemo, JourneyIcon flow, products section
- All public/marketing pages — verified aligned
- Tenant: payments right column, maintenance NewTicketModal (pill buttons + photo grid), passport authorization cards
- Landlord: finance hero (personal greeting style + aligned KPIs)
- Agent: calendar (KPI cards + settlement section), earnings hero

**Done (2026-06-16 full alignment pass — audited all VOL1/2/3/4/8 vs implementation):**
- HIGH correctness: leases OREA Form 400 → Ontario LTB Standard Lease; rent-cap 2.5% now notes post-2018 exemption; applicants/[id] RTA anti-discrimination warning + corrected decision CTAs; finance KPI labels fixed (净利/空置率/税务待缴); passport garbled copy fixed; pricing rebuilt to design's 3-role static cards + Trust API band (removed invented paid tiers)
- Disputes (`app/disputes/page.tsx`) realigned to VOL8: 4 real cases (DSP-1J5N 骚扰投诉 replaces fabricated DSP-1Z9K, DAY x/14, 等你回 pulse), 三阶递进 stages, 4 real lawyers w/ full fields + 不抽佣 disclosure, closed-cases table, RTA notes, Logic-Legal + AI-generated warning
- New pages built: `/tenant/audit` + `/landlord/audit` (VOL3 ART30, shared `components/AuditLog.tsx`), `/notifications` (ART31), `/tenant/move-in` (VOL2 Day-1), `/agent/showings/[id]` + `/feedback` (VOL2/ART37), `/tenant/lease` signature page (第6页 + Luna SIGNING aside), landlord `RenewalPack` (Thompson A/B/C), `/dashboard/listings/new` expanded to 5 steps + one-click import (ART33/34)
- Data canon unified: Sarah Wang / Mia Chen / David Park / Unit 1207 King West $2,800 / Liberty Village 2B / RBC 8721; "Mike Park" → "Kevin Tran" (avoided David Park collision); terminology Tier N / Trust Tier → 认证 N 级 (CSS classes + data fields untouched)
- Onboarding `name` screen reworked to design (@ input, PREVIEW quote, capability grid, Chinese names, CTA → 90s 验证/tier1); homepage 02 4th "合规·可审计" card; listing detail "房客信用门槛·房东设置" + "让 Luna 替我问" / "派 Field Agent 看房 ($80)" CTAs
- `lib/agent/demo.ts` aligned to canon so agent spine renders design content (incl. RECO 授权/不授权 via data_scope/excluded_data)
- Nav wired: Header bell → `/notifications`; tenant+landlord rail 审计 icon → audit pages; lease page → move-in link; agent tasks showing → `/agent/showings/[slug]`

**Backlog 已结案（2026-08-24 与生产代码逐项核对后关闭）：**
- ~~Agent workspaces 硬编码设计件（KPI 条 / YOUR PROFILE / RECO checklist）~~ — **实现已超过蓝本**：`StatusOverview` 是按角色实读 RLS 表的活数据瓦片（蓝本那条是静态数字），`PrivateMemorySnapshot` 承担 YOUR PROFILE，再加上 2026-08-24 的 `user_model` 自学习画像。回头照静态蓝本重做是倒退，不做
- ~~Disputes ART70 / ART71~~ — **无后端可依**：全库没有任何 dispute 表，`/disputes` 是纯静态营销页；三方仲裁台还需要真人仲裁员运营。产品未到该阶段，不做。**但留一条待办见下**
- ~~Onboarding welcome/meet 去留 · `/agent/onboarding` 改名 `/agent/onboard`~~ — **已自然消解**：全站 CTA（tenant/landlord/agent 营销页、pricing、about、auth/callback）一律指向 `/onboarding/name`，`welcome`/`meet` 只有 meet 的返回键还引用 welcome，属无入口死路由（315 行，无害）；`/agent/onboarding` 被 pricing 三处链接引用，改名纯属对齐蓝本字面且会断链。都不做
- ~~Stripe Connect 出账闭环~~ — **零用户可服务**：prod 里 brokerages / referral / commission / invoice / subscription 全部 0 行，平台上没有经纪。付款路径无人可付，等有真实经纪再建
- ~~密钥旋转~~ — 用户 2026-07 已明确决定暂不处理

**核对里掉出来的两条：**
- ~~`get_entitlements` 与真实计划源脱节~~ — **已修（2026-08-24，迁移 `20260824_entitlements_plan_source.sql`，已应用 prod）**。付费门禁的真实执行方（`app/api/screen-score` 配额、`app/api/deep-check` 的 pro 门）读 `landlords.plan`，Stripe webhook 也写这一列——这条链一直是对的；出错的是 `get_entitlements`，它读 `public.subscription`（0 行、无任何写入方），于是真付费房东在 `/settings` 的「当前计划」上显示成 free。现在 landlord 分支以 `landlords.plan` 为准（`subscription` 若将来有行则优先），并把 `team` 补进解锁集合与 screen-score/deep-check 对齐。tenant/agent 没有计划存储，继续如实解析 free。已验证：pro 房东 → `plan:"pro" · full_screening:true`
- ~~`/disputes` 公开页展示编造的执业者~~ — **已加显著示范标注（2026-08-24，用户拍板）**。该页没有任何后端（全库无 dispute 表），案件/当事人/律师/执照号/评分/胜率/统计全是虚构样例，却从页脚直链且此前零标注。现在：① Header 之下、Hero 之上一条不可关闭的琥珀色 `SampleBanner`，明说整页为虚构样例并给出 LTB 与 LSO 转介的真实外链；② 八处 `SampleTag` 角标（Hero / 指标 / 进行中案件 / 案件详情 / 已结案 / LTB 表格 / 律师目录段 / 每张律师卡——律师姓名永不脱离标注渲染）；③ **真格式 LSO 号全部改成 `LSO #SAMPLE-01..04`**（原 `#L88421`/`#P22186` 等可能撞上真实执业者）；④ AI-Legal 卡加「针对虚构案件的示范分析」条；⑤ LTB 表格卡说明「一键生成尚未上线」；⑥ 不抽佣披露改成「目录上线后的规则……当前没有任何真实入驻律师」；⑦ 底部免责声明改为先声明数据虚构、`SAMPLE-NN` 不是有效 LSO 号。回归守卫 `tests/disputesSample.spec.ts`（横幅在 / 角标 ≥8 / 无真格式 LSO 号 / 目录明说虚构）

## Route Map

### Public
`/` `/pricing` `/tenant` `/landlord` `/agent` `/trust-api` `/screening` `/about` `/partners` `/contact` `/disputes` `/listings` `/listings/[slug]` `/privacy` `/terms`

### Auth
`/login` `/onboarding/welcome` `/onboarding/name` `/onboarding/meet` `/onboarding/tier1` `/auth/callback` `/apply/[slug]`

### Tenant Workspace
`/tenant/agent` `/tenant/applications` `/tenant/lease` `/tenant/maintenance` `/tenant/passport` `/tenant/payments`

### Landlord Workspace
`/landlord/agent` `/landlord/applicants` `/landlord/applicants/[id]` `/landlord/finance` `/landlord/leases` `/landlord/maintenance`

### Agent Workspace
`/agent/agent` `/agent/calendar` `/agent/clients` `/agent/earnings` `/agent/tasks`

### Admin (Stayloop back-office — gated by `admin_users` / `is_stayloop_admin()`)
`/admin` (console) `/admin/verify` (listing verification queue) `/admin/users` (member management) `/admin/usage`（AI 用量与成本看板：按天/模型/槽位/用户、单次筛查均价）`/admin/models` (AI 模型目录 + 槽位默认：管理员可添加/停用模型、设用户可选、测试连通；目录存 `model_catalog`，安全规则见 `lib/modelConfig.ts` rowToModel——key 只能是已登记的 env 名、baseUrl 主机须在该 key 白名单。**2026-08-22 起四个槽位全部开放给所有厂商**：筛查/分类/取证三个文档槽位只要求 vision=true，不再锁 Anthropic；所有模型调用统一走 `lib/llmChat.ts`（`llmChat` / `llmChatStream`），它按 `ModelDef.pdfInput` 把 PDF 转成 file 块(OpenAI/Qwen3.8)、image_url(Gemini) 或 unpdf 文本(其余)，图片转 data URL。**文本策略下的扫描件走 `lib/ocr/qwenOcr.ts`**（2026-08-22）：从 PDF 直接抽页面图（XObject 与内联 BI/ID/EI 两种；DCT 直取 JPEG、Flate 像素封 PNG；加密件先解密）→ DashScope `qwen3.5-ocr`（回退 `qwen-vl-ocr-latest`）→ 文本；文字转轮廓的矢量页 / JPX / CCITT 无法栅格化，如实标「不可读」。每份 PDF 最多 OCR 12 页、并发 3)

### Households(在管租约,2026-08-03)
`/leases/import`(任意角色导入已签租约,AI 抽取→人工确认)· `/join/[token]`(邀请落地页,公开路由;拒绝无需登录且会把 household 标记 disputed)· `/h/[id]`(共享中心:概览/对话/租金/报修)。设计:`design/household-import-plan.md`。信任模型:导入=自述数据,对方接受+确认前 `verified=false`,任何公开面不得引用未确认 household。新表 user 键一律 authId。

### Other
`/dashboard` `/settings` `/settings/models`（用户自选对话/筛查模型，存 `user_model_preferences`，服务端 `getModelForUser()` 解析，无效选择静默回退系统默认）`/lease/sign/[token]` `/landlord/leases/new` `/landlord/leases/[id]` `/register` `/auth/reset-password`

## Listing Visibility (Critical — DB-enforced)

Public surfaces show a listing only when `is_active AND (verification_status='verified' OR source='realtor')`. This is enforced at the DB (RLS policy "Public can read verified listings"), not just app filters. Landlord-published listings start `pending` and go public only after `/admin/verify` approval; Realtor.ca-imported rows (`source='realtor'`) show immediately with a source badge. A trigger (`guard_listing_trust_fields`) reverts any non-admin write to `verification_status`/`source`/`verified_at`, so landlords can't self-approve. App-layer queries use `LISTING_VISIBILITY_OR` from `lib/listingVisibility.ts` — don't re-inline the filter string.

