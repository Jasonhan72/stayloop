# Stayloop — Project Context for Claude Code

AI-powered tenant screening SaaS for Ontario landlords. Live at **www.stayloop.ai**.

## Tech Stack

- **Framework:** Next.js 15.5.2 App Router + TypeScript + Tailwind CSS
- **Hosting:** Cloudflare Pages (`@cloudflare/next-on-pages` v1.13.16)
- **Auth:** Supabase JS v2, implicit flow (`lib/supabase.ts`, `lib/useAuth.ts`)
- **AI:** Claude Sonnet via Anthropic API (Vision + text, edge runtime)
- **Email:** Resend SMTP via Supabase Auth (magic links)
- **Payments:** Stripe (test mode)
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

**Gate：已内置在 `ship2-v53.command` 里，不再依赖人记得。** 脚本按顺序执行并在任一步失败时中止且**不部署**：
1. `npx tsc --noEmit` + `npm test`（此前只写在本文件里，那天 `app/icon.svg` 把整站 API 打挂时它没有运行）
2. push → 清构建缓存 → `npx @cloudflare/next-on-pages@1`
3. **`_worker.js` 入口检查**——next-on-pages 产出的 `_worker.js` 是**目录**（内含 `index.js`），而原来的守卫写的是 `[ -f ]`（测试普通文件），**对目录恒为假，所以自加上之日起就在无条件中止部署**；无人察觉是因为大家改成手动逐步部署了。现已同时接受目录形态与单文件形态，并要求入口非空
4. `wrangler pages deploy`
5. **部署后 smoke，失败自动重试一次**（30s 后）。九个探针里有两个在刚部署时会合理地闪红：边缘缓存传播、以及依赖实时抓 Realtor.ca 的行情探针。真回归会两次都红——**两次都红 = 回滚信号**

Verify deploy: `curl -s 'https://www.stayloop.ai/?v=<timestamp>' | head`

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
JINA_API_KEY                # agent listing search → realtor.ca scrape (lib/agent/listingSearch.ts)
OPENCORPORATES_API_TOKEN    # deep-check / forensics arm's-length lookup (lib/forensics/arm-length.ts)
CRON_SECRET                 # gates cron mode on /api/agent/proactive; same value stored as Supabase Vault secret 'cron_secret' (pg_cron job agent-proactive-daily, 13:00 UTC)
DEEPSEEK_API_KEY            # optional · 后台模型配置用（/admin/models 槽位可选 DeepSeek 模型时需要）
MOONSHOT_API_KEY            # optional · 后台模型配置用（Moonshot/Kimi）
DASHSCOPE_API_KEY           # optional · 后台模型配置用（阿里 DashScope/Qwen）
ZHIPU_API_KEY               # optional · 后台模型配置用（智谱 GLM）
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
- `components/Header.tsx` — global nav: **我是** dropdown (租客/房东/经纪) · 房源 · 定价 · 租客背调(→/screening); admins also see a 后台管理 entry in the avatar menu (Trust API NOT in nav)
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
- **`app/api/agent/turn/route.ts`** (edge) = the Personal Agent reasoning step. STATELESS: client passes `{role, message, memories, workflow}`, route runs the configured model — 模型经 `/admin/models` 槽位可配（`app_config.models`，默认 Sonnet 4.6）— with a role system prompt (`lib/agent/prompts.ts` — Luna/Logic/Brief persona + 5 principles + "propose, don't decide"), returns `{reply, memory_writes, proposed_action, next_stage}`. Anthropic key stays server-side.
- **Split**: server = reasoning only; client (`runAgentTurn` in orchestrator.ts) persists via RLS-scoped browser client — implicit memory → `user_memories` (`upsertMemories`, onConflict `user_id,role,memory_type,key`; memory_type clamped to preference/profile/constraint/semantic/system), proposed action → `agent_pending_actions`, turn → `agent_audit_events`. Same pattern as existing memory.ts/approval-engine.ts.
- **Compliance Guardrail** (`lib/agent/guardrail.ts`) = deterministic server-side filter on every turn output: blocks OHRC-protected-ground rejections, flags illegal lease terms, strips false "already done" claims, demotes over-reach scope. The LLM is also instructed but the guardrail is the backstop.
- **Fallback**: anonymous/preview or any failure → canned acknowledgement (no LLM cost, no persistence). Real reasoning only for authed live sessions.
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
- **不走他们的实时 API**：CKAN 的 `q` 是「词之间 OR + 搜所有列」，`q=David Park` 会返回名叫 David 的房东、Park Road 的地址。必须自己落库匹配。
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
- `20260802_ltb_order_catalogue.sql` — `ltb_orders`（安省开放数据 LTB 判令目录，按「每人每角色一行」展开）+ `ltb_ingest_runs` + `search_ltb_orders()` / `ltb_coverage()` RPC（SECURITY DEFINER，仅 authenticated/service_role 可执行，表本身无 policy 不可直读）

## Design Source of Truth

- **v8 首页（2026-07-24 起）**：`design/v8-homepage.html` = 首页唯一蓝本（taste-skill 探索定稿：暖纸底 #FDFBF6/#F6F3EA、Hero 氛围网格+双色雾、幽灵编号编辑部排版、通栏照片+玻璃数据条、三角色 tab 切换面板、渐变数字深色带；Header/Footer/logo 一律产线原样不改；文案沿用已批准口径，双语 COPY 机制保留）。/tenant /landlord /agent 三个角色页（components/RoleLanding.tsx）同步采用 v8 设计语言（角色色仅作点缀）。v7 蓝本已被取代（仅存档）
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

**Remaining (next session — deferred deliberately):**
- Agent workspaces: hard-author the design's fixed KPI strip / YOUR PROFILE aside / RECO checklist as components (currently fed via demo data through the intentional spine — true rebuild conflicts with spine architecture, needs a design call)
- Disputes: ART70 three-party arbitration workbench + ART71 4-step LTB prefill wizard (deeper net-new flows; rest of disputes aligned)
- Onboarding: design has 2 screens (name → tier1); we kept extra `welcome` + `meet` screens — decide whether to remove
- `/agent/onboarding` vs design route `/agent/onboard` — reconcile name; rework into Brief-voiced ART35 flow (RECO pledge, 3 steps, 画 3 个小区)
- Stripe Connect: fee-collection loop is live in test mode (Express onboarding + settle → Checkout → webhook fee_settled). Still open: outbound transfers to connected accounts (no flow pays agents through the platform yet), reconciling the two plan stores (`landlords.plan` written by the webhook vs the `subscription` table read by `get_entitlements` — entitlements currently always resolve 'free'), and spreading `get_entitlements` beyond the settings surface

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
`/admin` (console) `/admin/verify` (listing verification queue) `/admin/users` (member management) `/admin/models` (AI 模型槽位配置)

### Other
`/dashboard` `/settings` `/lease/sign/[token]` `/landlord/leases/new` `/landlord/leases/[id]` `/register` `/auth/reset-password`

## Listing Visibility (Critical — DB-enforced)

Public surfaces show a listing only when `is_active AND (verification_status='verified' OR source='realtor')`. This is enforced at the DB (RLS policy "Public can read verified listings"), not just app filters. Landlord-published listings start `pending` and go public only after `/admin/verify` approval; Realtor.ca-imported rows (`source='realtor'`) show immediately with a source badge. A trigger (`guard_listing_trust_fields`) reverts any non-admin write to `verification_status`/`source`/`verified_at`, so landlords can't self-approve. App-layer queries use `LISTING_VISIBILITY_OR` from `lib/listingVisibility.ts` — don't re-inline the filter string.

## Preferences

- No comments inside copyable command blocks — put explanations outside the code block
- Design is authoritative — production should match the design HTML volumes exactly
- Chinese (zh) is the primary UI language
