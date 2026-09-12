# Stayloop — Project Context for Claude Code

AI-powered tenant screening SaaS for Ontario landlords. Live at **www.stayloop.ai**.

## Tech Stack

- **Framework:** Next.js 15.5.2 App Router + TypeScript + Tailwind CSS
- **Hosting:** Cloudflare Pages (`@cloudflare/next-on-pages` v1.13.16)
- **Auth:** Supabase JS v2, implicit flow (`lib/supabase.ts`, `lib/useAuth.ts`)
- **AI:** Claude Sonnet via Anthropic API (Vision + text, edge runtime)
- **Email:** Resend SMTP via Supabase Auth (magic links)
- **Payments:** Stripe **LIVE mode**（2026-08-26 切换，见下「支付模块」节的切换记录）
- **Maps:** Google Maps API
- **DB:** Supabase (project `upbkcbicjjpznojkpqtg`)

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
- **现行首页（2026-09-06 用户定稿，AI-native）**：`app/page.tsx` 只渲染 `components/home/HomeNext.tsx`（原 `/next` 候选路由已删）。**替换前的 v8 首页原文备份在 `design/backup/homepage-v8-2026-09-06.page.tsx.bak`**（.bak 后缀，tsc 与 tailwind 都不扫）。原则：**首页就是助手**——Hero 是可用的 `AgentChat`（`useAgentSession(role)`，匿名预览走 `/api/agent/turn`，真实房源 + TRREB 行情，按 IP 限次，不落库），角色切换 pills（租客/房东/经纪，key=role 重挂载）；页面上每一条例句（痛点区、角色 tab）都送进同一个对话并滚回 Hero；无照片、无编造的控制台数字；深色带四个数字来自 `/api/public/stats`（边缘路由，service role 只读计数，缓存 1h：screenings / ltb_orders / 可见 listings / TRREB 季度数）。文案沿用线上首页，只把不可兑现的收益改写（房东「在线收租」→「租约与续约由系统跟进」；经纪带看/佣金标「即将」）。**先前两版蓝本（Loop 卡宣传册式）已被用户否决并删除，不要再从 design/ 里的旧蓝本出发。**
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

## Realtor.ca 导入房源的时效（2026-09-06）

5 月导入的 3 套 Realtor 房源里有 2 套（89 Estelle Ave、1201-155 Cumberland St）全部图片在
`cdn.realtor.ca` 上已 404——Realtor 撤图 = 房源已下架，卡片只剩底色渐变。处理：`is_active=false`
（未删）。**Realtor 导入的房源没有自动下架机制**，等 TRREB 数据库接入前，发现空白卡先按这条查。
同日按用户要求补导了 6 套多大周边公寓（College / Huron / McCaul / Simcoe / Bay St，MLS C137xxx–C1374xxxx），
方法：Jina reader 读 `realtor.ca/on/toronto/<社区 slug>/apartments-for-rent` 列表页取行 → 读详情页取
图片（只留 `/highres/`）、描述、面积区间、设施、经纪公司 → Nominatim 取坐标（Google Geocoding 对本
key 返回 REQUEST_DENIED）→ 按 `8 COLVESTONE ROAD` 那行的字段形状经 REST 写入（service key 只走 header
文件）。`/listings` 顶部的「示范阶段 · TRREB 未接入」横幅（`SampleBanner text=`）接入后去掉。

## 手机端（2026-08-24 全站复核）

全部路由在 **375px 与 320px** 两个宽度上逐条量过（文档级横向溢出 + 被
`overflow:hidden` 裁掉的正文/可交互元素）。**匿名可见的 60 条路由零缺陷**——
2026-07 那次 `min-w-0` 适配的纪律一直被守着。**缺陷全部集中在登录后才渲染的页面**，
因为它们从来没被这样量过，共 4 处，均已修复并线上复验（320px 溢出归零）：

| 页面 | 320px 溢出 | 根因 | 修法 |
|---|---|---|---|
| `/admin/usage` | 102px | `lg:grid-cols-2` 的两个子项里都是带 `overflow-x-auto` 的宽表，子项默认 `min-width:auto` 被表格固有宽度撑开，滚动容器永远不生效 | 两个子项加 `min-w-0` |
| `/screening/[id]/report` | 50px | 硬门槛/风险标记行是 `flex` + 徽章 + 一行长说明，文字列没有 `min-w-0` 无法收缩 | `items-start` + 文字 `min-w-0 break-words` + `Badge` 加 `flex-none` |
| `/screening/[id]/graph` | 25px | 雷达图 `<svg width={300}>` 硬写，而 320px 屏上卡片内容宽只有 232px | `w-full h-auto` + `maxWidth:300`（viewBox 本来就在，几何坐标未动） |
| `/screening/[id]/done` | 33px | 门槛/标记 chip 在 `flex-wrap` 里，单个 chip 自身文字不换行 | chip 加 `max-w-full break-words` |

另修 `/trust-api/docs`：端点标题（`GET /v1/listings/{id}/compliance` 这类不可断的
等宽串）在 320px 下撑出 6px → `overflow-wrap: anywhere` + ≤400px 内边距 24→16。

三条现行约定，改动时别破坏：

- **宽表一律 `overflow-x-auto` 包一层，`min-w-[Npx]` 放在里面的 table/grid 上，
  而且外面那层若是 flex/grid 子项必须带 `min-w-0`。** 少了 `min-w-0` 就是
  `/admin/usage` 那个 102px——滚动容器看着写了，实际从不生效
- **手机断点上文本类表单控件必须 ≥16px**（`app/globals.css` 末尾的
  `@media (max-width:767px)`）。iOS Safari 聚焦 <16px 的控件会把整页放大且不退回，
  而共享的 `.sl-input` 是 14px——没有这条规则时站内每个表单在 iPhone 上都中招。
  勾选框/单选/滑块/文件选择已排除（它们不触发缩放，放大反而撑坏方框）。守卫：
  `tests/mobileForms.spec.ts`
- **SVG 不要硬写 width。** 有 viewBox 就用 `w-full h-auto` + `maxWidth` 封顶

**复核方法**（下次重跑用）：本地 dev 起同源 iframe、设成 375/320 宽逐条载入路由，
比 `documentElement.scrollWidth` 与 `clientWidth`，再回溯"最外层越界元素"并跳过
`overflow-x:auto/scroll` 的正当滚动容器。两个坑：① 工作台页要先
`sessionStorage.setItem('sl-show-demo','1')` 才渲染密集的演示态，否则量到的是空态；
② `middleware.ts` 的 `X-Frame-Options: DENY` 会挡住 iframe，需临时放开、量完必须还原。
**登录后的页面 iframe 量不到**（本轮是借浏览器里已登录的生产会话逐页量的，只取几何
不取文本）——这正是四个缺陷藏身之处，下次复核务必覆盖。

## 筛查上传上限（2026-08-25 · 一次真实事故）

一位房东上传 11 个文件跑筛查，报告以 `Missing or invalid v3 score: credit_health`
整单失败。表面看是模型漏字段，**真正的原因在上传层**：`tenant-files` 桶当时卡
10MB，其中两个文件被前端直接丢掉——

| 文件 | 大小 | 结果 |
|---|---|---|
| `ID_Leo.pdf` | 32.4 MB | 丢弃（Illustrator 导出，17MB 的 FlateDecode 原始位图） |
| `TU_CR_NathalieCipriani2024.pdf` | 14.0 MB | 丢弃 —— **主申请人的 TransUnion 征信报告** |

库里那条 screening 的 files 正好是 11−2=9 个，与本地文件逐一对得上。模型手上
只有同住人的征信报告、没有主申请人的，于是干脆不输出 `credit_health` 这个 key，
后端校验直接 500——取证 8 次调用、coherence、法庭检索全部白跑。

**教训：上传层静默丢文件，会在下游变成一个看起来完全无关的模型错误。** 三处修复：

- 桶上限 10MB → **25MB**，白名单加 HEIC/HEIF（`20260825_tenant_files_limits.sql`）。
  25 不是随便定的：Anthropic 单请求上限 32MB，Worker 内存 128MB，再往上会把失败
  推到更深、更难解释的地方
- 图片在**上传前**降采样（`lib/screening/prepareUpload.ts`，长边 2600px/JPEG q0.85）。
  不只是为了桶——screen-score 与取证 OCR 都是把图片**按 URL** 交给模型，各家对
  抓取的图片卡在 ~5MB。**PDF 一律不重编码**：取证读的就是 producer 串/对象结构/
  增量更新痕迹（本例中「一张 ID 由 Adobe Illustrator 导出」本身就是信号）
- 被拒文件变成**常驻的黄色警示块**（不是一闪而过的 error 字符串），并把文件名写进
  `screenings.notes` → 进 prompt，让模型知道「这份文档没看到」而不是「记录干净」

配套：prompt 增加「五个维度分数一律必填，无证据是低分+说明，不是省略 key」；
`screen-score` 在硬失败前加一次**定向补评**（同模型、同证据、同评分标准，只问缺的
维度，缺 3 个以上不补），补到的维度记在 `ai_dimension_notes._v3.repaired_dims`。

守卫 `tests/screeningUpload.spec.ts`：桶上限、前端 `MAX_UPLOAD_BYTES`、用户文案
三处的「25MB」必须一致——这三个数一旦漂移就是最难查的那类故障。

**超限 PDF 的救援路径（2026-08-25 晚补）**：>25MB 的 PDF 不再直接拒——
`lib/screening/pdfShrink.ts` 在浏览器里用 `unpdf/pdfjs`（unpdf 自带的 pdf.js
单文件 bundle，含 WorkerMessageHandler，主线程可跑，动态 import 约 1.6MB）把
每页渲染成 JPEG（长边 2600px / q0.85）再走正常上传。真实 `ID_Leo.pdf`
（32.4MB，qwenOcr 的抽图层报 unsupported——Illustrator 的编码不在它支持的
两种之内）实测 → 1 张 659KB JPEG，dev 下 ~98s（生产更快，UI 有「处理中」态罩着）。
**>12 页的超限 PDF 仍拒**（静默转一半文档 = 部分证据装完整，正是要防的事）。
转换过的文件会写进 `screenings.notes` 的 CONVERTED 块——模型和取证都知道
这是同一份文档的页图、PDF 结构分析没跑过。上传区文案已带显式提示
「单个文件 ≤ 25 MB（大照片会自动压缩）」。

## 报告打印页的屏幕版式（2026-09-06）

「下载评估报告 (PDF)」= `lib/generateReport.ts` 生成 HTML → 新标签页 → `window.print()`。
此前新标签页本身按视口宽度平铺（body 无边距、页眉的负 margin 只在 @page 边距下成立），
与打印出来的 A4 PDF 完全两样，用户以为是两份东西。现在 `@media screen` 下整份文档包在
`.sheet`（210mm 宽、内边距 = @page 边距、灰底居中带阴影）里，顶部一条 `.toolbar.no-print`
提供「打印 / 保存为 PDF」按钮（打印对话框被关掉后仍可再触发）；`@media print` 去掉这层框，
PDF 输出不变。本地核对办法：scratchpad 里用 tsx 桩掉 Blob/window.open 把 HTML 落盘再开浏览器看。

## 筛查写库的空字符（2026-09-11 · 一次真实事故）

房东 14 个文件跑筛查，页面只弹一句 `unsupported Unicode escape sequence`。这是 PostgreSQL
的 22P05：jsonb/text 不能存 U+0000。来源是 pdf.js 对无法映射的字形吐出的 U+0000——
2026-08-21 修好真全局 polyfill 之后文本抽取才真的在生产上工作，`text_sample` 一份最长
5 万字，里面一个空字符就让整行写入失败。更糟的是 38% 处那次 stage 写入（取证结果 +
status=scoring）**不检查错误**、静默失败，30 秒后最终写入再失败才把 Postgres 原话甩给用户；
行停在 `status='uploading'`。修法：`lib/screening/jsonSafe.ts stripNul()` 深度去空字符，
`pdf-text.ts` 在源头清一次，`screen-score` 三处 jsonb 写入全部套一层并把 stage 写入的错误
报 Sentry。**任何新增的、把外部文本（PDF 抽取、OCR、模型输出）写进 jsonb 的路径都要过
`stripNul`。** 守卫 `tests/jsonSafe.spec.ts`。

## 取证误判：银行对账单排版引擎（2026-09-11 · Scotiabank 真件被判伪造）

Carlos 案 14 个文件：三份 Scotiabank 网银下载的对账单被三条规则同时打成伪造，叠成 `doc_tampering`
硬门槛、分数封顶 55、结论「建议拒绝」。三条规则的前提都错了：
① Scotiabank 白名单只写了 iText，而它的对账单归档由 **Crawford Technologies PRO** 渲染
（Producer `CrawfordTech PDF Driver`、Creator `PRO HLCAPI`、Author `Pro API`、Title `PRO Document`；
Scotiabank 是 CrawfordTech 官网列出的客户，库里 8 月的 CIBC 投资对账单同一指纹零告警）；
② `Pro API` 被人名正则当成个人署名；③ 三份对账单创建时间相隔 2 分钟被当成批量伪造——按需渲染
的引擎在点下载那一刻才盖 CreationDate，一次下载三个月本来就是这样。另外 `deposits_too_clean`
（入账与工资单净额分毫不差 = 可疑）逻辑不成立：直存就是净额。
修法：`source-specific.ts` 新增 `STATEMENT_ENGINES`（CrawfordTech / Exstream / Quadient / EngageOne /
Papyrus，任一识别出的银行都接受，并写入 `statement_engine`）；`pdf-metadata.ts` 作者规则先排除
含全大写缩写 token 或软件词汇的值，信任列表加这些引擎；`index.ts` 把 `statement_engine` 当作
portal 来源喂给时间戳聚类（与 Workday/ADP 同一豁免）；`cross-doc.ts` 入账精确匹配改为 info 级
`deposits_match_paystub_net` 佐证。守卫 `tests/forensicsStatementEngine.spec.ts`。**本机核对办法**：
`.forensics-tmp/scotia-check.mts`（gitignored）对真实文件跑 metadata + source-specific + 聚类。

## 工资流水深读层（2026-09-11 · 与人工核对对齐）

同一 Carlos 案，取证误判修完后重跑，报告仍把「付款方 Osv ≠ 雇主 Acciona」当成工资来源不符
（付款能力 35、附条件通过），把 4 月一笔 $21,035 入账当成异常，把 6 次查询当成密集申贷。人工
逐份读文件的结论相反：OSV = OneSource Virtual，Workday 工资外包商，工资单 Producer 里就写着
Workday；4 月大额 = 常规净薪 + 雇佣函所述奖金 $30,418.41 的税后 46%；Acciona 本身在流水上付报销款；
每月 1 号 $4,000 支票 = 现租；Equifax 6 次查询只有 1 次硬查询。落成规则：
- `lib/forensics/payroll-deposits.ts`（确定性，只产 info 佐证，从不产怀疑）：`PAYROLL_PROCESSORS`
  付款方→代发商→平台映射（OSV/ADP/Ceridian/Payworks/Wagepoint/Rise/Humi/Nethris/Paychex…），
  `payroll_processor_recognized`（付款方是代发商，且工资单 Producer 与其平台一致时说明同一流水线）、
  `employer_counterparty_on_statement`、`cross_doc_bonus_corroborated`（函件奖金 = 工资单 YTD Bonus 行，
  支持 30.418,41 欧式格式）、`bonus_deposit_reconciled`（大额工资入账 = 常规净薪 + 奖金×42–78%）、
  `recurring_rent_like_payment`（连续 ≥2 个月月初同额支出，须有余额列判断方向）。在 `runForensics`
  的 `reconcileIncomeAcrossDocs` 之后调用，进 `cross_doc_flags` → 提示词「TRUST THESE」块
- `screen-score` 确定性覆盖：`payroll_processor_recognized` + （`deposits_match_paystub_net` 或
  `bonus_deposit_reconciled`）→ `income_corroboration.verdict='corroborated'`，模型的「付款方不符」不再
  压 ability_to_pay；提示词加外包发薪与姓氏在前（PR 卡 / T4 / 护照）的规则
- 征信查询分硬软：`CreditReport.inquiries[].hard`（Equifax「May affect scores」列），
  `creditAnalysis.hardInquiries12mo`，只有硬查询 ≥5 才算密集申贷；报告页与打印版显示「硬/全部」
- `coherenceReview` 提示词加「EXPECTED PATTERNS」清单（外包发薪、奖金入账、CPP/EI 封顶后净薪上升、
  雇主报销、姓氏在前、T4 事后打印与平台更换、Equifax 无雇佣记录、局方地址日期≠搬入日期、软查询、联名户）
守卫 `tests/forensicsPayrollDeposits.spec.ts`；本机核对 `.forensics-tmp/payroll-check.mts` 对真实文本跑。

## 法庭检索只查申请人 + 报告细读修正（2026-09-11 第三轮）

第三次重跑（88 分、建议通过）读出的问题与修法：
- **法庭/LTB 只查申请人与共同申请人。** 模型的 `extracted_names` 把 HR 签署人、两任前房东、经纪都
  列进来，每人跑一遍法院门户 + LTB，一位房东 2017 年作为**原告**的小额诉讼就以「1 条记录命中」红字
  出现在申请人总览上。`lib/screening/coApplicants.ts selectCoApplicantNames`：主申请人的任何字序/重音
  变体不重查；署名人、申报房东、租约/推荐/其他类文件里的人名一律排除；有身份证件名单时只查证件上的
  名字。补充检索的每一行 source 都带上姓名。总览行「法院 / LTB 记录」只在 `court_record_*` / `ltb_*`
  硬门槛存在时红；同名但非被告方/未佐证的命中写成说明。**房东和经纪不是筛查对象。**
- **生产文本没有换行。** pdf.js/unpdf 把整页拼成一行，第一版工资流水解析按行切，线上把整份对账单当成
  「付款方」打进报告。现在 `splitStatementTransactions` 按「Mon D」日期标记切交易（`May 1, 2026` 这类
  散文日期排除），付款方取余额之后的尾串，上限 60 字。**任何新写的对账单文本解析都不能依赖换行**，
  测试要同时覆盖扁平文本。
- **工资单没印年薪就别信模型的年薪。** `applyStubAnnualFromPeriod`：文本无 per year/annual 字样时
  年薪 = 单期毛收入 × 期数（两次运行分别给出 287,932 / 286,052，真值 263,679.84）。
  `extractOneOffYtd` 汇总 Bonus / Higher Duties / Retro / Commission 等一次性行的 YTD，
  `checkPaystubMath` 第三参数扣除后 0.8–1.2× 即发 info `paystub_ytd_one_off_reconciled`。
- **电话必须可拨。** `isDialableNanp`：区号与局号首位 2–9，排除 800/888 等免费号；对账单参考号
  （0438022026）与 1-800-4-SCOTIA 不再当申请人电话。
- **一致性审查两道确定性后闸**（`sanitizeCoherenceOutput`）：薪资「不符」若两数是同一薪资的
  月/半月/双周/周换算（±3%）即丢弃；姓名「不符」若引文人名去重音、排序后同一 token 集即丢弃。
  提示词再加：申请表住址历史先旧后新、电信账户不属于财务负债、OREA 双页码、先做换算与月数算术。
- Equifax 标记核实的信用报告不再报 `pdf_producer_unknown`（Skia/PDF 是浏览器打印）；Aspose.Words 进
  「已识别」生成器名单。守卫 `tests/coApplicants.spec.ts` + `forensicsPayrollDeposits.spec.ts` 扁平文本组。

## 评分表深化（2026-09-12 · 用上已经测到的事实）

`lib/screening/rubric.ts` 原来只用了流水线测出的一小部分事实（收入倍数、信用分档、推荐人电话个数、
文件齐全度），审视 Carlos 案后按五条改：
- **付款能力**：倍数档位不变，新增总负担比（租金 + 债务）÷ 已佐证收入（≥50% −20 / ≥40% −12 /
  ≥32% −5，取代原 DSR）、流动储备（`analyzeStatementLiquidity` 从带余额列的对账单读最低余额，
  折成目标租金月数：≥6 +6 / ≥3 +3 / <1 −6；NSF/退票/透支行 −6/−12）、当前实付房租 ≥ 目标租金 +4
  （`findRecurringMonthlyPayment`）、任职 <3 月 −8 / ≥24 月 +3（`coherence.documents.key_facts.employment_start`）
- **信用**：当前逾期 −18（≥2 户 −25）、仅有迟付史 −8、硬查询 ≥5 −6、薄档案（<2 户或历史 <12 月）封顶 62。
  事实来自 `creditAnalysis`（`creditPastDue / creditLateAccounts / hardInquiries12mo / tradelineCount /
  creditHistoryMonths`）
- **租务**：流水里连续 ≥2/≥3 个月的规律付租 +5/+8，申报住址总年限 ≥24 月 +4；推荐人覆盖度一律
  `action_pending`（电话没打过不算实测）
- **核验**：文件齐全只给底分 70（原 90），佐证码每个 +5、最多 +25（`CORROBORATION_CODES` 白名单：
  代发商识别、入账等于净薪、雇主注册在册、扣缴封顶、奖金三方对账、雇主报销、YTD 一次性项对账）；
  证件姓名覆盖申请人姓名 +5，不一致 −20；矛盾只认取证引擎的确定性代码（`contradictionDetails`，
  critical −20 / high −12 / medium −6，合计封顶 −36），模型自报的 `cross_doc_contradictions` 红旗不再动分；
  空栏计数排除第二申请人/配偶/担保人类栏目（`countMaterialBlanks`）
- **收入优先取工资单算术**：`stubMonthlyIncome` = 各工资单年化（单期毛收入 × 期数）中位数 ÷ 12，
  模型的 `detected_monthly_income` 只做回退
新字段全部可选，老夹具照常评分。守卫 `tests/rubricDepth.spec.ts`（Carlos 夹具 ≥95、各规则逐条）。

## 人工 vs 模块对照校准（2026-09-12 · 受薪专业人士类）

把 Carlos 全套原件逐份人工读一遍（PR 卡、申请表、Offer、薪酬函、工资单、T4、三月流水、Equifax）与
模块 96 分报告逐维对照。分数接近（人工 94–96），差在**定性**：一致性审查仍产出四条假矛盾——
申请表旧址当现址（high）、三种生日打印格式当冲突（high）、已结清的 Kia 车贷当未披露负债、局方多一个
电话当漏报——由此生出「生日住址矛盾」警告、身份一致性 72/100 和一条让房东去核对不存在矛盾的清单项。
修法（全部确定性，`lib/screening/coherenceReview.ts` 后闸 + `lib/screening/periods.ts`）：
`isSameDobClaim`（`parseDateLoose` 解析 MAY-14-1979 / 14 MAY / MAI 79 / 1979-xx-14，掩码部分不算冲突）、
`isAgreedAddressClaim`（同一街道在 ≥2 条引文出现 = 各文件一致）、`isClosedAccountOmission`
（引文含 Date Closed / Account paid 即无需申报）、`isExtraPhoneClaim`（申请表电话在局方名单内）。
`screen-score` 新增测得的身份一致性：证件姓名覆盖申请人 + 各文件生日一致 → `identity_match_score`
下限 90（不一致则上限 40）。Workday 工资单按 Producer 识别（不再报「不属于常见工资系统」）。
信用报告龄扣分改分级：>90 天 −2、>180 天 −6（原 91 天即 −6 的悬崖）。
**类校准夹具** `tests/calibrationSalariedProfessional.spec.ts`：该类应 proceed、总分 ≥93、各维度下限，
并含七个单变量扰动的单调性断言（逾期 / NSF / 付款方未知 / 收入未佐证 / 伪造 / 薄档案 / 租金 45%）——
以后改评分规则先跑它。

## 「纸面一致」与「第三方核验」分开计价（2026-09-12 · 96 分是否偏高）

六个合成画像跑评分表（典型 3.25x/690/1 房东 → 74 proceed；优秀 → 96；边缘 2.6x/640/无房东 → 46
conditional；收入未佐证 + 催收 → 30 decline；无信用报告的新移民 → 64 review；8x 但当前逾期 → 80）
分布合理，Carlos 的 96 就事实而言不虚高——虚高的是**确定性**：全部佐证都是申请人自己上传的文件互证，
没有任何第三方核验（身份未 Veriff、银行未 Flinks、推荐人未致电），却读成 100/100 核验、94 租务。改法：
- `RubricFacts.externalVerifications {identity, bank, references}`（路由取 `verifiedFacts.id/bank.status`；
  推荐人致电尚无产品功能，恒 false）：每项 +5；**没有任何一项时核验维度封顶 90**
  （`no_external_verification`），文件齐全底分 70→60
- 有推荐人但未致电：租务封顶 88（`references_uncalled`）
- 当前逾期 >0：band 最高 review（8x 收入也不能直接 proceed）
- 报告页与打印版在「证据充足度」下加一行「外部核验 N/3 · 身份 ✓/✗ · 银行 ✓/✗ · 推荐人 待致电」，
  为 0 时明说「评分基于文件互证，尚无第三方核验」
Carlos 类夹具现为 94（A100 / C92 / R88 / V90），仍是优质档，但读者能看出这是纸面分。

## 法庭记录漏检 + 扫描件 OCR（2026-09-12 · Cipriani / Quiroga 案）

一份两位申请人的档案在模块里显示「未发现不良记录」，而安省法院门户实际有：共同申请人
**QUIROGA, LEONARDO (ALFREDO)** 六件被告方案件（2018–2024，两件未结，含 CIBC、Capital One、Home Trust
起诉）；主申请人 **NATHALI, CRISTINE CIPRIANI CAMPINS** 一件 2026 年未结的小额法庭债务人记录
（Lu v. LEONARDO et al，两人同案）。四个原因叠加：
1. 门户查询 8 秒超时、无重试，两次运行都超时；前端把 `unavailable` 渲染成「✓ 无记录」，汇总写「未找到法院记录」。
2. 共同申请人被 9 月 11 日新加的第三方过滤误判：他的 NOA 是 kind `other`，名字进了第三方名单。
3. 姓名匹配要求每个词逐字出现且姓氏等于 sortName 的姓——法院省略中间名（QUIROGA, LEONARDO）、
   书记员少打一个字母（NATHALI）、把名当姓归档，都会被过滤掉。
4. 第一层命中即返回：找到 1 条带中间名的记录后不再查「LEONARDO QUIROGA」，其余五条永远看不到。
修法：`lib/screening/portalMatch.ts`（纯函数）——`matchPortalParty`：名必须在、姓氏取 sortName 逗号前、
允许缺一个中间名/第二姓氏、≥5 字母的词容忍 1 个编辑距离；三个词全部对上即 `strong`，否则 `name_only`；
`planPortalQueries` 列出全部查询（各字序精确、名+每个姓精确、全名模糊、双姓模糊）**全部执行后合并去重**；
`corroborateByCoParties` 让与 strong 记录共享对方当事人的 name_only 记录升级为 strong。路由：门户超时 15s
+ 重试一次；**strong 且被告/债务人/被申请人方的记录进硬门槛**（1 条 defendant / ≥2 multi / 有未结案
active），name_only 仍只展示 + 红旗；第三方名单不再取 `other` 类文件，且证件上出现的名字永不算第三方。
前端 `CourtRecordDetail`：unavailable/timeout/skipped 显示琥珀色「未能检索」，任一数据源未完成时不再显示
绿色「未发现不良记录」，并列出未完成的数据源；LTB 目录行常显。
**扫描件 OCR**：Haiku 文档 OCR 预算从固定 30s 改为 30s + 8s/页（上限 120s），失败重试一次，再失败走
`ocrPdfScan`（DashScope 抽页图）；OCR 文本合并进 `text_density.text_sample` 供所有确定性检查使用
（此前只用于来源指纹）；`lib/forensics/scan-flags.ts`：OCR 内容识别出发行方（银行/征信局/文件类型）
时撤销只适用于文字型 PDF 的 `pdf_oversized_for_text / pdf_unusually_short / pdf_producer_unknown`，
换成 info `scan_content_recognized`；编辑证据（consumer tool 等）不动。
守卫 `tests/portalMatch.spec.ts`。本机复现 `.forensics-tmp/portal-probe4.mts`（直接打门户 API）。

## 逐文件「房东解读」层（2026-09-12 · 对标 SingleKey / TransUnion / 银行审贷）

用户要求：报告里每份 PDF 的解读要多写房东和经纪关心的实际内容，少写技术细节。调研口径：SingleKey
报告分信用（分数、付款史、催收、月债务）/ 租史（驱逐、房东推荐）/ 收入（3 倍惯例、工资单 + 在职信 +
流水）/ 身份；TransUnion 给 tradeline 的按时/逾期计数、催收、公共记录、查询；Naborly 给身份/雇佣/收入/
信用与「迟付/损坏/驱逐/早退」预测；银行审贷看流水的：工资入账与雇主匹配、入账规律、NSF 单次可放过
但成模式即问题、超过月收入一半的入账要说明来源、储备按月数、未申报的固定债权人付款、结算前余额突增。
落地在 `lib/forensics/landlord-reading.ts`（确定性）：
- **对账单**：联名户判断（户名块两个不同的名字；同名印两遍不算）、工资入账笔数/合计/付款方（识别代发商）、
  按月折算对比申报收入、**工资以支票/e-Transfer 而非工资直存到账**（入账金额 = 工资单净额 ±1%，
  正是自制工资单配的入账方式）、大额非工资入账（>50% 月收入，排除工资）、月初房租形态支出（多月用
  `findRecurringMonthlyPayment`，单月找 1–5 日 ≥$800 的支票/转账）、按揭/车贷/信用卡还款、发薪日贷款
  （Money Mart / Cash Money / easyfinancial / Fairstone / goeasy…）、博彩（OLG / Proline / casino /
  bet365 / BetMGM…）、加密交易所、催收机构 / 扣押、国际汇款（Remitly / Wise / WU）、最低余额折合租金月数、
  期末余额趋势、NSF 计数。**TD 的 OCR 有三种排版**（行内 `E-TRANSFER 3,547.21 SEP03 26,683.44`、
  竖排一字段一行、竖线分隔含存/取两列），`parseTdStyleRows` 全部支持，取/存列给出方向，其余按余额
  差推断，都不行时按描述词（`inferDirection`）。**解析必须拿原始带换行的文本**，不能先扁平化。
- **工资单**：雇主、频率、本期毛/净、折合月净、年化、YTD 与进度（一次性项说明）、福利/退休金/工会扣款
  = 正式雇员、工资扣押 / FRO、兼职工时。
- **信用报告**：分数档、当前逾期、迟付史、使用率（>100% 说「已超额度」）、月债务 + 申请租金占毛收入
  （银行 44% 上限）、硬查询、催收、破产、账户数与最早开户、档案上的雇主。多份报告时只有主申请人那份
  用转录数据，其余标「共同申请人的报告，请单独核对」。
- **证件**：类型、有效期（过期提示）、姓名与申请人/共同申请人对照、证件地址。
- **在职/Offer 信**：职位、入职、雇佣性质（只认短语，`Contract Awards` 不算合同工）、联系邮箱是否公司域名、
  薪酬通知 ≠ 在职证明。**税单/NOA**：年份、总收入（T4 无标签时取最大的「元 空格 分」）对比申报年收入。
  **申请表**：可致电的房东、搬离原因（房东方原因）、空栏。
- 模型侧：`coherenceReview` 的 `documents[]` 新增 `landlord_read_zh/en`（2–5 条，每条必须带页面上的数字）
  与 `ask_zh/en`；`mergeModelReadings` 去重后并入，标 `AI`。
- 渲染：报告页与打印版每张文件卡片下「房东解读 · 这份文件说明了什么」+「建议追问」，✓/⚠/✗/· 四种语气。
守卫 `tests/landlordReading.spec.ts`（含 Scotiabank 扁平文本、TD 三种 OCR 排版、压力档案）。
本机预览 `.forensics-tmp/reading-preview.mts <screening_id>` 对库里真实档案输出解读。

## 信用分析层（2026-08-26 · 对标 SingleKey 二轮）

用户拿 SingleKey 30 页双局报告逐页对比后的结论：我们的**转录**早就齐了
（score/tradelines/collections/bankruptcies/inquiries 全在 `CreditReport`），
缺的是转录之上的**分析层**。补法分两半，边界刻意划死：

- **算术一律确定性代码**：`lib/screening/creditAnalysis.ts`（纯函数，
  `tests/creditAnalysis.spec.ts` 9 条钉死）。分数档位（SingleKey 五档
  300-559/560-639/640-699/700-759/760+）、DTI、循环利用率（用 `credit_limit`，
  缺失回退 `high_credit`——104.7% 超限真实案例是它的存在理由）、按类别聚合
  （分期/按揭/车贷**不算利用率**——摊还本金 ≈ 原额是常态，新学生贷会假报 100%）、
  三种逾期信号（past_due / late 计数 / R9-I9-M5 状态码）任一命中即 delinquent、
  查询次数以 report_date 锚定只数 12 个月内。房东要拿这些数对银行口径，
  **不能出自模型之口**
- **叙述才归模型**：prompt 新增 `credit_report.analysis_en/zh`（3-5 句、
  必须点名具体账户与趋势）；`credit_health` 的 details 上限从 15 字放宽到
  45 字（其余维度的 SPEED 上限不动）。渲染在报告页与打印版
  （`app/screening/[id]/report/page.tsx` 信用节 + `lib/generateReport.ts`）：
  档位刻度条、四块 KPI、衍生风险行、类别卡（利用率进度条）、逾期聚焦、AI 叙述框

**存量报告立即受益**（分析层从已存的 `_v3.credit_report` 现算）；AI 叙述只有
新筛查才有。`unreliable`（身份对不上的报告）不进分析层——已宣布非证据的数字
不能再穿一层「分析」外衣。干净档案输出一条 ✓ info 而不是沉默。

## 支付模块（2026-08-26 全链路审计 + 真金 E2E）

**真实用户路径已端到端验证**（浏览器走完 test 收银台 4242 卡付款）：
checkout 路由（含 `claim_landlord` 自愈）→ Stripe 托管页 → `checkout.session.completed`
webhook → `landlords.plan='pro'` → portal 路由（billing.stripe.com URL 正常）→
取消订阅 → `plan='free'`。探针（用户/landlord 行/Stripe customer/订阅）已全部清理。

**本轮修的三处真伤：**

1. **`NEXT_PUBLIC_SITE_URL` 烤进生产的是 `localhost:3000`**。Next 在构建时内联
   `NEXT_PUBLIC_*`，而 ship 脚本在本机构建、`.env.local` 里是 localhost——
   CF Pages 后台配的值对内联变量**不生效**。受污染 8 处：Stripe checkout/portal/
   connect 回跳、租约 sign/send 链接、household 邀请、notify-landlord 邮件链接
   ——**生产所有邮件链接和付款回跳都指向 localhost**（真实付款照样入账、plan 照样
   翻 pro，只是用户落在打不开的页面）。修法：`.env.local` 持 prod URL（构建用），
   `.env.development.local` 持 localhost（只有 `next dev` 读，优先级更高）。
   **教训：`.env.local` 里任何 NEXT_PUBLIC_* 都会进生产构建**
2. **pricing 页 Pro 写 $19/月，Stripe 实收 $29 CAD/月**（dashboard 弹窗也是 $29）。
   已把页面对齐到实收 $29；**若想真卖 $19 需在 Stripe 建新价并换
   `NEXT_PUBLIC_STRIPE_PRICE_ID`**。CTA 原链到 `/dashboard/listings/new`（到不了
   付款），已改 `/dashboard?upgrade=1`（打开升级弹窗）；团队版无 Stripe 价，CTA
   暂指 `/contact`
3. **同一 URL 注册了两个 test webhook 端点**，各有各的签名密钥；实测（订阅取消
   事件被处理）证明匹配生产密钥的是 3 事件端点（缺 `customer.subscription.created`），
   另一个的投递永远验签 400。已给匹配端点补上第 4 个事件（更新不换密钥）、删除
   死端点。注意：重建端点的脚本会被 auto-mode 分类器拦（动支付基础设施+密钥），
   这个窄修复（改事件列表+删死端点）不动密钥所以能过

**已知非阻断**：`checkout.session.completed` 不写 `plan_current_period_end`（那是
subscription.created/updated 的活），而 created 事件可能先于 completed 到达、
按 `stripe_customer_id` 匹配不到行（行里还没写 customer id）——首月 period_end
可能为空，下一次任何 subscription.updated 会补上。代码注释已记录该竞态。

**已切 LIVE（2026-08-26，用户提供 live key 后执行）**：
- live price 用户已建好（`price_1TJagqPEHyIrPd1QtIWw0NSH`，$29 CAD/月），直接采用
- live webhook `we_1U8rFTPEHyIrPd1QnDuOl9p0`（4 事件）已注册；live 账单门户默认配置
  `bpc_1U8rESPEHyIrPd1Qze4FFOnj` 已建（live 模式原本没有，portal 路由会 500）
- 密钥三处同步：`.env.local`（构建用）+ CF Pages `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`
  （运行时用，wrangler pages secret put，需重部署生效——已部署）。**test 密钥保留**在
  `.env.local` 的 `STRIPE_TEST_SECRET_KEY` / `STRIPE_TEST_WEBHOOK_SECRET`
- test 模式的 webhook 端点已**停用**（未删）——生产现在用 live 密钥验签，test 事件只会 400
- 部署后验证（探针已清）：checkout session `livemode:true` · CA$29.00 · 回跳 stayloop.ai；
  portal 返回 billing.stripe.com。真实付款的 webhook 投递已由用户一笔真卡付款
  验证（2026-08-27：`plan='pro'` 落库 → API 退款 → 取消 → `plan='free'`）
- 分类器注意：创建 live webhook + 推 CF 密钥的脚本会被 auto-mode 拦，拆成
  「不含密钥的步骤」+「密钥只走文件/stdin 不过 shell」的窄脚本可过

**订阅管理卡 v2（2026-09-03，蓝本 `design/subscription-card-v2.html`）**：
`/settings` 的 `components/settings/SubscriptionCard.tsx` 是计划的**唯一展示处**
（原「关于我」里的「当前计划」行读 `get_entitlements`、与卡片数据源不同，已删）。
原则不变：应用只展示状态、开门，操作本体在 Stripe Portal。四个状态由
`lib/billing/subscriptionState.ts` 的纯函数 `resolveSubscriptionState` 判定
（`tests/subscriptionState.spec.ts`）——**不要在别处再按 `plan` 字段推状态**：

| 状态 | 判定 | 主操作 |
|---|---|---|
| `past_due` | `plan_status ∈ {past_due, unpaid}` 且有 `stripe_customer_id`——**优先于 plan**（webhook 扣款失败即写 `plan='free'`，按 plan 判会给催款中的房东再卖一份） | 更新付款方式（portal `payment_method_update` flow） |
| `free` | 非付费 plan | 升级（checkout） |
| `comped` | 付费 plan 但无 `stripe_subscription_id`（Stayloop 直接开通） | 无 |
| `canceling` | 付费 + `plan_cancel_at_period_end` | 恢复订阅（`/api/stripe/resume`，唯一的应用内账单变更：翻 `cancel_at_period_end=false`，portal 无此 deep-link） |
| `active` | 其余付费 | 三扇门：更新付款方式 / 发票收据（portal 首页）/ 取消订阅（portal `subscription_cancel` flow） |

配套：迁移 `20260903_landlord_billing_state.sql` 给 `landlords` 加
`plan_cancel_at_period_end`（Stripe 在期末前一直报 `active`，没这列就永远显示
「下次续费」）与 `plan_card_brand/last4`（webhook 从订阅或客户的默认付款方式
best-effort 取，失败不影响投递）。portal 路由 body 接 `{return, flow}`，flow 完成后
`after_completion` 回跳同页。`.or(id,auth_id)` 双行问题统一走 `pickLandlordRow`
（优先 auth_id 行，webhook 写的是它），不再 `.limit(1)`。

**按申请人单次解锁（2026-09-04，竞品对照 P0-1）**：免费档本来就有**每月 5 次筛查**
（含取证与信用分析；`screen-score` 按 `landlords.plan` 计月配额），Pro 真正锁住的是
深度核查（`/api/deep-check` 的 `enforceProGate`）与不限次数。竞品按次 $17–45 且可
转给租客付，所以加了一扇不动订阅的门：

- Stripe live 一次性价 `NEXT_PUBLIC_STRIPE_UNLOCK_PRICE_ID`（CA$14.99，产品
  `prod_VCYjEnThGXgTd2`，`.env.local` 构建内联）。身份/银行/征信直连上线后，这个 SKU
  就是「验证包」，届时建新价换 env 即可（$34.99 是对照报告里的建议）
- `/api/stripe/unlock`：`{screening_id?, payer:'landlord'|'tenant', tenant_email?}` →
  `mode:'payment'`，metadata `kind='unlock'`。房东付=复用其 Stripe customer；
  租客付=游客结账、24 小时过期、链接由房东转发，解锁仍落在房东的筛查上
- webhook：`kind='unlock'` 先写 `stripe_events` 账本（唯一冲突=已处理，**这是本路由
  第一个非幂等处理器**），再写 `screenings.unlocked_at/unlock_paid_by` 或
  `landlords.unlock_credits += 1`（无 screening_id 时的预付额度）
- 消费：`deep-check` 门 = plan pro/team **或** 该 screening 已 `unlocked_at` **或**
  RPC `consume_unlock_credit(screening_id)`（SECURITY DEFINER，校验归属、原子扣 1 并
  盖 `unlocked_at`）。`screen-score` 对 `unlocked_at` 的筛查按 pro 处理（不计免费月配额）
- 筛查页：免费用户点深度核查弹 `UnlockModal`（我来付 / 生成租客付款链接 / 升级 Pro）；
  回跳 `?screening=<id>&unlocked=1` 自动重开该记录。迁移
  `20260904_applicant_unlock.sql`

**申请人本人核验链路（2026-09-04，竞品对照 P0-2 / P0-3 / P1-1；设计 `design/verification-flow-plan.md`）**：
房东在筛查记录上生成 `/verify/<token>` 链接（`VerificationCard`，门与深度核查同一扇：
Pro / 已解锁 / 额度，`lib/billing/access.ts hasProAccess`），申请人本人先签**版本化同意**
（`lib/verify/consent.ts`，`v1-2026-09`，写目的/内容/谁看/保留/撤回）再逐步授权：
身份 Veriff（托管 URL，决策 webhook 走 HMAC，只留证件末四位）、银行 Flinks Connect
（iframe → loginId → 服务端 Authorize → GetAccountsDetail Days90 → **只存确定性摘要**：
掩码账号、持有人、循环入账、`payroll_monthly_estimate`、NSF 次数；原始流水不落库）、
征信（**供应商已定 Equifax**，2026-09-05：`lib/verify/providers/equifax.ts`——申请人在
`/verify` 页填姓名/出生日期/现住址（**不收 SIN**），`/api/verify/<token>/credit` 拉取，
结果落成与上传报告**同一个 `CreditReport` 形状**，`screen-score` 里 `creditReport` IIFE
优先取它、丢弃模型对 PDF 的转录、只保留模型按 prompt 里的局方事实写的
analysis_en/zh；报告页「已核验事实」栏加征信卡。传输层的请求/响应映射
`buildInquiry`/`mapReport` 是**临时版本**，等 Equifax 加拿大 API 参考拿到后按规格定稿；
`CREDIT_PULL_PROVIDER=mock` 用 fixture 走全链路，`tests/verifyCredit.spec.ts` 钉住
fixture → 分析层）。表 `verification_requests`（房东只读自己的行，
所有写入 service role），完成态快照进 `screenings.verification`。收入识别
`lib/verify/income.ts` 是纯函数（`tests/verifyIncome.spec.ts`）——同信用分析层，
**数字不出自模型**；沙箱结果 `sandbox:true` 一律不进评分。评分接入：`screen-score`
把 `screenings.verification` 渲染成「APPLICANT-AUTHORISED VERIFICATION」事实块进
prompt，并在后端**确定性覆盖** `income_corroboration`——银行持有人与申请人同名
（`namesMatch` 宽松 token 匹配）且有 `payroll_monthly_estimate` 时，verdict 按
银行入账 / 自报收入的比例定（≥75% corroborated、≥50% partial、否则 uncorroborated），
模型对流水 PDF 的判断被替换；持有人不是申请人则不动模型结论。快照同时写进
`_v3.verification` 与响应。报告页 `VerifiedFactsSection` 单独成「已核验事实」栏
（绿底、标「非模型推断」、沙箱打标），放在跨文档核验之前——这是 P1-2「事实/推断分栏」的第一步。

**报告的「事实 / 推断」分层与申请人通知（2026-09-04，竞品对照 P1-2 / P1-4 / P1-3）**：
- 报告页 `VerifiedFactsSection`（绿底「已核验事实 · 非模型推断」）在跨文档核验之前；
  LTB 披露节**无论有无命中**都显示琥珀色「收录范围」条（`ltb.coverage`），明说
  「未查到」只覆盖目录当前窗口（目前 2026-01～05），不等于「从未涉诉」
- `/screening/[id]/notice`：可打印的申请人通知信（zh/en）。勾选依据、说明实际参考了什么
  （本人提交文件 + 公开记录；**声明未向消费者报告机构购买报告**——我们不是 CRA）、
  告知查阅/更正/争议途径（privacy@stayloop.ai）与「未考虑 OHRC 受保护特征」。
  争议通道 v1 = 该邮箱 + 信件日期与地址作为参照；表单化留到有真实量时再做
- `/screening` 营销页新增「和按份出售的筛查报告有什么不同」对照表（`copy.ts COMPARISON`，
  右列写「典型按份产品」的一般做法、不点名）与「申请人本人授权核验」数据源卡；
  征信那张卡仍如实写「Stayloop 不直连征信局」

## 示范数据标注（2026-09-06 全站核对）

用户拿 `/tenant/payments` 的「立即支付」问「这还是演示吧」——是：全站没有任何租金收付通道
（Stripe 路由只有房东订阅/按次解锁；`rent_payments` 唯一写入方是 `/h/[id]` 的自述「标记已付」），
那颗按钮只是把一句话预填给管家，管家生成的 `payment_authorization` 待办在 `execute` 路由里
**没有执行器**（返回 `no_executor_for_type`）。于是定下规则：**凡是页面主体仍是设计样例
（Mia Chen / Sarah Wang / Unit 1207…）或按钮做不到它所写的事，必须挂 `components/SampleNotice.tsx`
的琥珀色 `SampleBanner`**（文案明说「按钮不会执行真实操作，只会交给助手生成待确认卡片」）。

- 工作台路由由 `components/WorkspaceShell.tsx` 统一处理，不逐页改：`DEMO_GATE`（默认诚实空态 +
  「查看产品演示」，演示态顶部挂 SampleBanner，可带 per-route `note`——payments 的 note 直说
  「在线收租尚未上线，立即支付不会扣款」）现覆盖 15 条路由（新增 `/tenant/passport/sharing`、
  `/tenant/audit`、`/landlord/audit`、`/agent/showings/*`——键以 `/*` 结尾为前缀匹配）；
  `SAMPLE_NOTE` 给「真实功能 + 样例段落」混合页常驻横幅并写明哪部分是真的
  （`/tenant/passport` 只有分享链接与候补是真；`/tenant/lease` 只有在管租约列表是真）
- 样例 id 打开的详情页（`/landlord/applicants/<非 UUID>`、`/landlord/leases/L-xxx`）在组件内自挂横幅
- `/disputes` 沿用它自己更重的 SampleBanner/SampleTag；营销页（首页对话演示、角色页）是产品插图，不标
- 守卫 `tests/sampleNotice.spec.ts`：新加纯样例工作台页而没进 `DEMO_GATE`/`SAMPLE_NOTE` 即红

## 语言初始化与水合（2026-09-07）

`lib/i18n.tsx` 的 `LanguageProvider` **客户端首屏一律用 zh 水合**（与 SSR 一致），再在
`useLayoutEffect`（绘制前）里切到 localStorage / navigator 解析出的语言。此前用惰性初始
state 直接按浏览器语言渲染，英文访客每个页面都报 React #418（水合文字不匹配），React 随即
丢弃服务端 HTML 整树重渲染——既慢，又有 zh→en 闪动。**不要**再把语言判断放回 useState 初始
值，也不要在别的组件里用 localStorage / navigator 决定首屏文字（同样会触发 #418）；需要
客户端才知道的值，一律先渲染服务端默认再在 effect 里更新。`app/layout.tsx` 的首屏内联脚本只
负责提前设置 `<html lang>` 与 `data-lang`，与此规则配合。

## Terminology(2026-08-03 定稿)

产品动作一律叫「**租客筛查 / 筛查**」(英文 Screening 不变),不叫「背调/背景调查」。依据:O. Reg. 290/98 与 OHRC 租房政策的语汇是 tenant screening/selection(许可的工具=信用参考/租史/信用检查/收入信息);而「背景调查」一词指向安省《消费者报告法》所规管的含 personal information(品行/声誉/生活方式)的 consumer report——报告法务节明确声明我们**不是**该法意义上的报告机构,产品名不能与免责声明打架。`tests/complianceCopy.spec.ts` 有语料守卫:UI 代码出现 背调/背景调查/背景核查/背景审查 即红。「筛选」保留给房源过滤器语境。

## Preferences

- No comments inside copyable command blocks — put explanations outside the code block
- Design is authoritative — production should match the design HTML volumes exactly
- Chinese (zh) is the primary UI language
