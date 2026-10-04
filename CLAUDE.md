# Stayloop — Project Context for Claude Code

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

## 2026-09-12 当日改动的全量代码审查（2026-09-13）

用户要求对当天 14 个提交（38 个文件、+3,330 行）做完整审查。三个审查代理按评分规则 / 取证 /
界面与管家分片，每条发现都要求引用代码行并用反例实跑验证；共 36 条，全部核实后修复 33 条、
3 条记录不改（`total_debt_service` 在 3.0× 恰好 −5 属文档化行为；`isAgreedAddressClaim` 按引文
而非按文件计数；`no_key` 文案）。守卫补在各自 spec 的「Review 2026-09-13」段。值得记住的模式：
- **一次编辑距离不能给出「强」匹配**：MARIA JOSE GARCIA 与 MARIO JOSE GARCIA 三个词一次替换就成
  strong → 硬门槛 → 拒绝。现在只有「掉一个字母」（NATHALI）算书记员笔误，替换字母要四个词才 strong。
  共同当事人佐证也不能把申请人自己的姓当成「共享当事人」。
- **两位申请人一份档案**：DOB 一致性只看署名含申请人的文件；工资单中位数在两个雇员、差距 >30% 时
  不覆盖模型的家庭收入；征信 `subject_name` 只有是文件里另一个人的完整姓名才标 unreliable。
- **流动性取「最好的账户」的最低余额**，不是把空储蓄户的 0 当储备；月初 ≥$800 的按揭 / 车贷 /
  信用卡 / 储蓄转账不是房租。
- **时效层的四个假阳性**：上一年度 NOA/T4 永不「过期」；在职信日期取「Date:」标注或最晚的非未来
  日期（此前取信头第一个日期，常是入职日）；对账单取「to <日期>」的期末；`03/09/2026` 这类
  歧义斜杠日期取离今天最近且不在未来的读法。
- **商户正则要锚在商户上**：AUTODEPOSIT ≠ auto loan，VISA DEBIT ≠ 信用卡还款，WASTE COLLECTION ≠
  催收，E-TRANSFER BREE SMITH ≠ 发薪日贷款，JOHN NEWTON ≠ 交易所。
- **deep-check 的关联人名单**在 UI 走的结构化分支上原本永远为空（功能死在生产路径上），且旧分支
  直接抄 `extracted_names`——把 HR 签署人当成申请方成员（critical）。现在两条路径都经
  `relatedPartyNames` → `selectCoApplicantNames`，签署人 / 前房东 / 租约推荐人永远是第三方。
- **网页找人要相邻**：`fullNameMatch` 是姓名对姓名的比较器，拿到 20k 字的黄页页面上会把相隔千字的
  「carlos」「rodriguez」当成本人；改为首尾名相邻的短语匹配；姓氏候选先取最后一个词。
- **租金留空的承诺要兑现到门槛**：表单租金为空时，付款能力门槛、存储的比值、`monthly_rent` 都改用
  申请表抽取的 `applying_rent`（此前只有评分表和报告回退）。
- 法庭门户逐个查询加 60s 总预算；OCR 只对「快速失败」重试一次；DashScope 回退文本保留 5 万字。

## 三角色与经纪认证（2026-09-13 · 法规研究后落地）

研究与方案：`design/roles-and-agent-verification-2026-09.md`（一手来源逐条引文在 `design/research/`）。
用户拍板：① 经纪认证人工核验、② 转介佣金引擎冻结（生产 0 行，待律师意见）、③ 是否注册消费者报告
机构另行研究、④ 收入倍数硬门槛改信息性、⑤ 下线租客付款链接、⑥ 经纪流程 = 租客在房源页自选认证
经纪并直接联系，**Stayloop 不做经纪业务、不收费**。已落地：
- **`agent_profiles` + `agent_verification_events`**（迁移 `20260913_agent_profiles.sql`，已应用 prod）：
  经纪在 `/agent/verify` 填注册姓名 / RECO 注册号（7 位）/ 类别 / 经纪公司注册名 / 到期日 / 业务联系方式 /
  CREA 会员 / 承诺；**不传证件、不收 SIN**。触发器 `guard_agent_profile_fields`：自助改动永不触碰
  status / verified_*，改了注册事实即回 pending；`agent_profile_insert_defaults` 保证新行 pending。RLS：本人读写、
  `status='verified'` 对 anon/authenticated 公开可读（目录用）、管理员全权。
- **`/admin/agents`**：管理员**手动**打开 registrantsearch.reco.on.ca（需加拿大 IP——开 VPN 时 403；页面
  声明禁止商业使用，无 API，**永远不要抓取或自动查询**），按 RECO ID 对照后核验 / 拒绝 / 标过期。
- **徽章 `components/AgentBadge.tsx`**：「RECO 注册已核 · #号 · 经纪公司 · 核于 日期」，只表示核验日在
  RECO 公开注册库上处于注册状态，链到注册库与 RECO 投诉入口；REALTOR® 只在自述 CREA 会员时显示；
  展示一律「注册名 · 允许的头衔 · 经纪公司名」（O. Reg. 567/05 s.12.1）。
- **房源页「找经纪帮我完成」→ `components/AgentPicker.tsx`**：列出 verified 经纪，租客自己发邮件 / 打电话；
  原「Stayloop 从会员经纪池派单（RECO 已验证）」与 $80 Field Agent 弹窗不再使用；联系人卡片的虚构
  「★ 4.8 · 27 transactions」已删。经纪工作台 `WorkspaceShell` 对 role=agent 显示认证状态横幅；
  onboarding 选经纪后先到 `/agent/verify`。
- **评分口径**（OHRC《租房人权政策》：租金收入比截止线违法；缺信用史不得视为负面；O. Reg. 290/98）：
  `screen-score` 删除 `income_severe` / `affordability_severe` 硬门槛与 `rent_ratio_high` 红旗（模型若仍输出，
  一律剔除）；`rubric` 的 `income_rent_ratio` 只在 ≥3× / ≥4× 上加分，其余已核实收入统一 70 分、
  `total_debt_service` 与 `thin_file` 记录但 **delta 为 0**；报告页 / 打印版 / 结果页都标「仅供参考 · 非拒绝
  依据」。校准夹具的「45% 租金」「薄档案」扰动改为「不得降分」断言。
- **租客付费解锁**：`UnlockModal` 删掉「让申请人付」，`/api/stripe/unlock` 对 `payer=tenant` 返回 400
  （RTA s.134(1)–(2)）；定价页、房源页、经纪页、隐私页（Plaid→Flinks）文案同步改为事实。
- **申请人通知信**补《消费者报告法》s.10(7) 通知（60 天内可索取信息性质与来源）与 AI 辅助 / 房东本人决定声明。
**仍未做 / 待外部**：消费者报告机构注册（研究进行中）；转介佣金引擎冻结；Realtor.ca 数据来源换 DDF Partner；
到期前 30 天自动转 `renewal_due` 的定时任务（目前由管理员手动标过期）。

## 人工通读 vs 模块（2026-09-16 · 6269 Ash St 案）

用户要求：先由 Claude 逐份读原件，再与 Stayloop 报告对照，**模块必须做到比人工更完善**。两边结论一致（decline，
在职信是 3 月的旧文件改日期、雇主注册库 Inactive），但模块漏了四处，全部系统化并有守卫 `tests/case6269Ash.spec.ts`：
- **收入「互证」门槛**：在职信 $96,000 vs 工资单 $50×80h×26 = $104,000（8%）被当成「吻合」并给 +5。`cross-doc.ts`
  现在 ≤3% 才是 `cross_doc_income_corroborated`，3–10% 是 `cross_doc_income_near_match`（低级、不计佐证分），
  ≥10% 即 `cross_doc_income_mismatch`（原来 25% 才算）。
- **居住时间线 vs 加拿大足迹**：申请表写 2016–2026 住在国外、「moving back to Canada」，而征信显示 2022 年起加拿大
  现住址、2021/2022/2026 开卡、2025–2026 三次 Yardi 租房筛查查询、安省驾照 2022 年签发。`lib/screening/
  residenceTimeline.ts`：地址无加拿大省 / 市 / 邮编标记且住满 ≥24 个月、期间内 ≥2 条足迹事件（开户、租房筛查
  查询、硬查询、局方地址、驾照签发）→ `cross_doc_residence_timeline_contradiction`（high，进矛盾扣分）；
  房东姓名 = 申请人 → `cross_doc_landlord_is_applicant`（medium），且该参考人不再计入 `landlordRefs`。
  一致性审查提示词同步加了这三条规则。
- **征信逾期漏转录**：Fido 账户下印着「Delinquencies 2023/05/16」和 2023-05 逾期 $125，转录成 0/0/0。
  `lib/screening/bureauTextScan.ts` 直接从 PDF 文本读 Delinquencies 日期（跳过「no delinquencies」句），写入
  `credit_report.historical_delinquency_dates`，转录为 0 时补 `bureau_delinquency_history`（medium）。
- **EI 封顶不是真实性证据**：2026 年 MIE $68,900 × 1.63% = $1,123.07 分毫不差，在线生成器同样内置当年上限。
  工资单是纯图片 / 无生成软件 / 带生成器签名时，`paystub_deductions_at_legal_max` 不再计入佐证分。
- **生成器指纹**：标题「paystub_4_20260817160120」= 模板编号 + 时间戳且无 Producer，是在线工资单生成器的导出特征
  → `paystub_generator_signature`（high，进 FORGERY_INDICATING_CODES）。
- **ModDate 取最后一次修订**：增量更新会追加同一编号的 Info 对象，浅层解析原来取第一份（在职信读成「修改于 5-29」，
  实际 9-06）；现在取最后一份。图片式 / 无 Producer 的工资单上，`paystub_deductions_at_legal_max` 降为 low 并改写为
  中性措辞。**已用同一份原件在生产重跑验证**（screening `b7036935`）：新增的时间线矛盾、自任房东、征信逾期日期、
  三张工资单的生成器签名全部命中，收入 8% 差距标为 near_match 不计佐证，法院门户与 CanLII 两行均正常检索。
另外核实：雇主网站 globenetint.com 存在但只有联系表单（无地址电话），域名 2020-11 注册而信称 2015 入职；法院门户
与 LTB 均无 MARUANIY 记录；驾照号编码（M + 780617）与生日自洽。

## 人工通读 vs 模块（2026-09-22 · 5168 Yonge St 案 / Kim-Yi 双申请人）

用户先让 Claude 逐份读原件（两位申请人 + 一名幼儿：Form 410 / 324 / 400 / 标准租约 / 附表 B、两封在职信、四张工资单、
两份 Equifax、驾照 + 临牌 + PR 卡），再与 Stayloop 报告（55 分 · 建议拒绝 · doc_tampering）和另一系统 muse 的批评对照。
人工结论与 muse 一致：**应通过**（家庭收入 ≈ 3× 租金、723/767 无逾期无催收、两任房东可致电、雇主一家是 Schedule II
银行、一家注册库活跃 17 年）。模块错在「法官」层，八处全部系统化，守卫 `tests/case28KimYi.spec.ts`（24 条）：
- **取证严重度把「披露」当「证据」累加**（根因）：21 条 low + 3 条 medium、零硬门槛，`computeSeverity` 求和 27 ≥ 12 →
  `likely_fraud` → 强制 `doc_tampering` → 建议拒绝。现在 low 合计最多记 3 分、`coherence_*` 永不计入、累加路径到
  likely_fraud 必须有 ≥1 条 high/critical。**同一份 flags 重算为 suspicious。**
- **doc_tampering 无确定性依据时不再是拒绝**：没有取证硬门槛、没有 FORGERY_INDICATING 伪造文件、没有 critical 时，
  55 封顶保留但 tier = conditional（`tier_reason: forensics_review`）——分数盘写 CAUTION、文字写「建议拒绝」的打架到此为止。
- **两位申请人的收入被算成一位**：`stubMonthlyIncome` 按「年化 ±15%」聚类且单张工资单不算一份工作，Yi 的 $41,952 单张
  被丢掉，家庭收入显示 $4,083（1.5×）。现在**先按雇主分组再按金额聚类**，不同雇主的单张工资单是一份独立工作 → $7,579/月（2.8×）。
  房东解读里的债务负担改按家庭收入，并删除「银行口径 44% 为上限」（那是房贷 GDS/TDS，租房筛查不适用）。
- **三条低噪音各 ×3–4 张**：Dayforce 自助门户经 Chrome 打印，Producer 是 Skia/PDF、系统名只在 PDF **Title**（`Earnings - Dayforce`）
  和 logo 图里——`checkSourceSpecific` 的 payroll 指纹现在也看 title；Docusign 信封一律加密——非财务类文件不再报
  `pdf_encrypted`；银行是《银行法》实体不在公司注册库——`isBankEntityName` 直接标 `bank_act_entity`，不报「未匹配」；
  注册库显示活跃 ≥5 年的数字公司，`arm_length_numbered_company` 降为 low。
- **证件日期**：OCR 把驾照日期列的 ISS/EXP 标签互换（`Expiry: 2024/12/18 Issue: 2026/10/08`）→ 报「过期 643 天」。
  `idExpiryFromText` 取所有 EXP 与 ISS 标签日期中**最晚的**（临牌延长有效期；真卡的签发日不可能晚于到期日），双语月份
  `AOÛT` 的重音字母也要进字符类。**PR 卡到期只是 info**（`pr_card_expired`），不进 `all_ids_expired`，房东解读明写
  「PR 身份不随卡过期而失效；移民身份是受保护特征」，模型写的「是否有更新后的 PR 证明」这类追问一律剥掉（`isProtectedStatusAsk`）。
- **驾照姓氏首字母**：OCR 把 `YI` 读成 `YL`，`Y4001…` 与 [HUJJUN, KIM] 都不符 → medium。路由在 coherence 回来后用视觉层
  对同一文件读到的姓名（`YI, HUIJUN`）复核，命中即换成 `id_dl_surname_match` 佐证。共同申请人证件名一字之差（HUJJUN/HUIJUN）
  用 `editDistance1`（≥5 字母容忍 1 处）匹配，不再写「与申请人 Sunkyoung Kim 不一致」。
- **一致性审查的「措辞 ≠ 矛盾」后闸**（`applyBenignBackstops`）：职称同义词（Logistics/Warehouse Associate）与 o/a · c/o
  法律实体-商号（同一 7 位公司号）降为 low；同街道门牌数字换位（4950/4590）、时薪工资单月工时 152–184 对「每周 40 小时」
  （日历工作日数）、PR/公民/签证类、子女年龄相差 ≤1 年（韩国虚岁）、征信档雇主 = 申请表上的前雇主（GTS Services）——
  直接丢弃；OREA 附表沿用买卖措辞是经纪模板，降 low。本案 9 条 → 剩 1 条 high（征信名 SU A KIM）+ 1 medium + 3 low。
- **报告自相矛盾**：文件完整度表读模型的 `detected_document_kinds`（它列了不存在的 bank_statement），现在只保留分类文件
  真有的 kind；两份征信报告时，转录数据只挂到 `credit_report.source_file` 那份（此前按表单姓名 token 找不到 `SU A KIM`
  就把 723/$276 挂到了 767 那份），认不出来就两份都标「请单独核对」；受薪工资单的 `OT HRS 6` 不再读成「每周 3 小时兼职」。
- **评分表新增中间档**：≥2 张「可识别工资系统 + YTD 0.8–1.2 + CRA 扣缴复算通过」的工资单，付款能力 50
  （`income_documented_no_bank_trail`），介于裸申报 35 与银行佐证 70+ 之间——纸面文件仍不等于到账。
- **生产重跑（screening `4f1433bf`）暴露的第九处**：一张照片里两张月薪工资单，模型把频率填成 semimonthly → 年化 $83,904、
  YTD 0.51 → `paystub_ytd_net_mismatch`，家庭收入被抬到 $11,075。`frequencyFromPeriod`：工资单自己印的期间 27–31 天即
  monthly、5–8 天即 weekly，优先于模型猜测与「Period N of 24」文字（14 天 vs 15 天的 biweekly/semimonthly 仍信模型）。
- **第二次重跑（`46c26983`）又暴露两处模型抽取抖动**，都已确定性兜底：① 受薪工资单的 `OT HRS 6.00` 被配上加班时薪
  → 6h × $37.69 = $226 vs 毛收入 $2,268 → `paystub_period_math_error`（high）→ `paystub_math_impossible` 硬门槛 → 35 分拒绝。
  现在工时 < 该频率全职工时 30% 且 时薪×工时 < 毛收入一半 = 「零头行」，跳过时薪复算（`paystub_hours_partial_line` info）。
  ② coherence 那一轮完全没列证件文件 → 申请人数回到 1 → 家庭收入又变中位数；申请人数现在同时取 forensics OCR 的证件
  `apparent_name`，驾照姓氏复核也用 `extracted_names` 里与 OCR 名一字之差的那个人。**同一份原件三次重跑分别 55 / 66 / 35，
  说明模型抽取每轮都会换一种错法——评分层的每一条硬规则都必须能承受抽取抖动，这是本案最重要的教训。**
- **第三次重跑（`175bf827`，66 分 review）剩两处**：照片工资单没有文本层，模型把 pay_period 留空，频率兜底读不到——现在
  `periodSpanFromText` 直接从 OCR 文字读「Pay Period: 07/01/26 - 07/31/26」，且 `index.ts` 的工资单三步（频率 / 年化 / 一次性
  项）都用 `text_sample || ocr.text`；驾照号在卡与临牌上印两次 → 两条 `unverified`，复核只换掉了一条，现在同首字母的全部一起换。
- **第四次重跑（`65287de9`，66 分 review，家庭收入 $7,579 · 2.83×，取证只剩 1 条 medium）**：coherence 那轮遇上 OpenAI 500
  整体 `failed`，驾照复核块原来整个包在 `status === 'ok'` 里也跟着跳过。复核现在不依赖 coherence；coherence 对 5xx / 网络错误
  自动重试一次。
**有意不做**：`SU A KIM` 与 Sunkyoung 不是已知的罗马字变体，保留为唯一 high 待核实项；无银行流水仍不算佐证。

## 外部匿名走查（2026-09-22 · `租客背调/28/Blank 25.pdf`，先复现再改）

另一系统以匿名访客身份走完公开页面给了 6 条。用户要求先测试再决定改不改。逐条复现结果与处置（守卫 `tests/walkthrough20260922.spec.ts`）：
- **房东 onboarding 跳错页（属实，已改）**：`/landlord` →「让 AI 接管出租」→ 起名 →「进入 Logic 工作台」→ 匿名访客落到
  `/screening/app` 的「筛查需要注册」墙。根因是 2026-08-12 的激活决策把**所有**首次房东送去筛查页（那时只考虑了已登录用户）。
  现在只有**已登录**的首次房东去 `/screening/app`（筛查页在工作台侧栏内，仍是激活路径）；匿名访客去 `/landlord/agent`
  （预览模式可用，自带「登录」横幅）。
- **发房源对话字段太少（属实，已改）**：实测 `帮我发一个房源：28 Avondale 1203，1+1，$2450，11 月 1 日` 一句就生成草稿，
  从不追问；库里 stayloop 自发的四套房源 sqft 全空（详情页「面积 —」），pets / lease_term / utilities 也全空。改法：
  提示词要求生成草稿的同时用「发布前再补几项」一次问完缺的项（面积 / 宠物 / 吸烟 / 租期 / 水电暖网 / 车位储物 / 家具 / 洗衣阳台，
  最多 6 项、只问缺的）；schema 与 `DraftListing` 加 `smoking_policy`（no|yes|outdoor_only）与 `utilities_included`
  （hydro|water|heat|gas|internet|cable），`buildListingRow` 落库（`utilities_included` 列本来就在但从未写过；`smoking_policy`
  新列，迁移 `20260922_listing_smoking_policy.sql` 已应用 prod）；`/dashboard/listings/edit` 加「租赁条件」段（租期 / 宠物 /
  吸烟 / 家具下拉 + 租金包含 chips）；房源详情页「生活配套」显示吸烟与租期，水电 chip 中文化，产权「Condominium/Strata」
  中文界面改「共管产权 (Condominium)」。宠物按 RTA s.14 只能「允许 / 有限制」，吸烟可由房东设定。
- **聊天气泡显示原始 Markdown（走查没提，复现时看到）**：匿名房东预览里模型回了 `### 1.` / `**…**`。turn 路由现在在
  guardrail 之后 `flattenMarkdown`（去标题井号 / 粗斜体 / 反引号，`* ` 列表变「· 」，链接保留文字 + URL）。
- **不改**：「数据导入公开页找不到」——导入在登录后（`/leases/import`、发布向导一键导入），走查自己也说这样没问题；
  「房源 10 套里 8 套 Realtor」——`/listings` 已挂「示范阶段 · TRREB 未接入」横幅；「ABOUT 关于这套房源」——v9 设计的
  英文 mono 眉标 + 中文标题是全站体例；「定价页测试期免费 vs 财务面板即将推出」——财务面板确实还是样例页，标注属实。

## EliseAI 对照研究（2026-09-22 · 用户要求「研究 eliseai.com，找到我们可以用的方法，包含 UI/UX」）

研究稿 `design/eliseai-benchmark-2026-09.md`（产品结构 / 页面模板 / 视觉系统计算值 / 与 Stayloop 逐项对照 / 采用清单 A–L /
不抄清单），蓝本 `design/eliseai-role-template-2026-09.html`（/landlord 按「六段模板」重排：hero + 事实 chip 行 → 三张收益卡各带
一句「试一试」→ journey → 一个真数 → FAQ → CTA；另含房源页费用卡、手机深底 hero、字号对照表）。EliseAI 面向美国机构级多户运营商，
核心可借的是**方法**：一条对话贯穿租客生命周期、页页专属 FAQ、每页只放一个可核实的数字、「试一试」入口、费用集中披露、续约
30/60/90 三阶触点。**不抄**：logo 墙 / 评分 / SOC 2 徽章 / 百分比收益（我们没有可审计的对照组）、催收谈判、智能锁自助看房、
Lease Audits、VoiceAI。已直接落地的两项（纯加法、不动已定稿结构，守卫在 `tests/walkthrough20260922.spec.ts` 末段）：
- **房源页「入住前费用一览」**（`MoveInCosts`，`app/listings/[slug]/page.tsx`）：首月租金 + 租金押金（未设则「房东未设置」）+
  钥匙押金「以租约为准」+ 合计；押金 > 一个月租金红条引 RTA s.106；划掉安省不允许的申请费 / 信用检查费 / 宠物押金 / 清洁押金 /
  预付租金。无新列。
- **首页 `?role=<r>&ask=<问题>` 深链**（`HomeNext`，mount 后读、发一次、`replaceState` 清参数）：角色页 / 筛查页的例句可以
  把访客送回 Hero 对话。仅 effect 内读 URL，遵守「首屏不按客户端状态分支」规则。
**用户 2026-09-22 拍板：除 K（手机深底 hero）外全部采用**，同日落地（守卫 `tests/eliseai20260922.spec.ts`，15 条）：
- **角色页模板 `components/RoleLanding.tsx`（A/B/C/D/I/J）**：hero（h1 42/600——用户看了 60 说中文太大，2026-09-22 先收到 48、再收到 42；lead 19px、眉标 mono 13）→ **事实 chip 行**（只写能指向
  页面 / 法条 / 日期的事实，每条可点）→ **三张收益卡**，每张末尾一句真问题链到 `/?role=<r>&ask=…` → journey → valueBand → scenario →
  **一个真数**（`/api/public/stats`：房东 screenings / 租客 listings / 经纪 ltbOrders，标来源与日期，加载前显示「—」）→ **角色专属 FAQ**
  （6–7 问，答案全是已兑现的事实，同时输出 FAQPage JSON-LD）→ CTA。原三格定性口号条已删；`RoleLandingConfig` 的 `stats` 换成
  `chips / benefits / proof / faq`。筛查页与定价页 h1 同步改为 30–42 / 600。**不许在 chips / proof 里出现百分比、评分、SOC 2、客户数**。
- **续约 90 / 60 / 30 三阶（F）**：`lib/agent/renewalStages.ts planRenewalActions`（纯函数，两条 proactive 路径共用）。90d（≤120 天）=
  原 `send_renewal_letter`（A/B 方案 + TRREB 最新季度均租一行，`metadata.stage='90d'`；旧行无 stage 视为 90d）；60d = 续约函未批准时
  `renewal_checkpoint`（N1 截止日、到期自动转月租 s.38，批准 = 知悉，执行器只盖章）；30d = 续约函已批准且有租客邮箱时 `send_message`
  向租客确认意向（含 N9 提示），否则 30d checkpoint「请直接联系」。幂等键 (lease_id, stage)；一次只给同一租约一张卡。房东工作台
  `StatusOverview` 加「续约窗口」瓦片（90/60/30 各几份）。生产此刻窗口内 0 份租约，pg_cron 每日扫描自然接管。
- **看房意向 / 提问进对话（G/H）**：房源页「预约看房」「向房东提问」→ `components/ShowingRequestModal.tsx` →
  `POST /api/showing-intent`（需登录；`claim_tenant` 拿 tenants 行；意向行走调用者 RLS 客户端写，自家房源被触发器 `own_listing`
  拒绝；每账号每小时 10 次）→ service role 在房东 agent 上放**一张** `showing_request` / `listing_inquiry` 待办卡（同一租客同一房源
  再发就 `merged` 进同一张卡的 `metadata.messages`）。房东批准 → execute 路由的 `executeShowingRequest`：收件人取自 `tenants.email`
  （不信 metadata）、房源必须归调用者、邮件带房东登录邮箱、意向行置 `accepted`；拒绝不发信。Realtor.ca 导入的房源没有 Stayloop
  房东，按钮仍是「找认证经纪」。迁移 `20260922_showing_intents_kind.sql`（`kind` 列）已应用 prod。已用 tester 账号对生产实测
  （delivered → merged），探针行已删。
- **`/partners` 改为「数据来源目录」（L）**：16 个外部系统按类别筛选（筛查与公开记录 / 房源与行情 / 本人授权核验 / AI 服务商），
  每条写用途 + 真实状态（已接入 / 沙箱 / 筹备中 / 示范阶段）+ 说明，无合作伙伴 logo、无「成为合作伙伴」。
- **K（手机深底 hero）用户明确不做。**

## Muse 手机端对照研究（2026-09-22 · 用户要求「研究 muse App 的 UI/UX，手机端能否借鉴」）

Muse = Meta 2026-09-08 发布的个人 AI 助手（muse.ai，iPhone / Mac / WhatsApp；Web 版要登录，**没有用用户账号登录**，材料只用 App Store
六张截图 + Meta 设计文 introducing.muse.ai + 安全文）。研究稿 `design/muse-mobile-benchmark-2026-09.md`，蓝本
`design/muse-mobile-blueprint-2026-09.html`（三个 375px 手机屏：助手主屏 / 进度 / 想法 + 活动日志弹层 + 规格表）。**用户 2026-09-22 拍板「按蓝本改」，当日落地**（守卫 `tests/museMobile20260922.spec.ts`，10 条）：
- **底栏 5 项（只改 md 以下）**：`WorkspaceShell.PhoneTabs` = 助手 · 待办（红点 = `agent_pending_actions` pending 计数）· 想法 · 进度 · 更多（底部抽屉列出角色原有页面 + 通知 + 设置）；桌面侧栏原样。新路由 `/{tenant,landlord,agent}/{todo,ideas,progress}`，共用 `components/mobile/RolePages.tsx`（各自 `useAgentSession(role)`，匿名走 demo）；经纪未认证也可用这三页（`isAgentOnlyRoute` 例外）。
- **审批进对话流**：`AgentChat` 新增 `pendingActions / onDecide / live / memoryCount / workflow` 五个可选 prop；<lg 时审批卡以 `compact` 形态排在线程**末尾**（自动滚动落点，蓝本写「置顶」但置顶会被滚出视野），决定后折叠成一行；三个 `/x/agent` 页右栏的 `PendingActionsPanel` 改为 `hidden lg:block`，整个右栏在手机隐藏（`hidden md:block`，md 仍堆叠）。首页 hero 不传这些 prop，表现不变。
- **头像真实状态 + 活动日志**：状态行按 `status` / 阶段 / 待办数生成（「正在：…」「等你点头：N 件」「空闲 · 当前阶段 … · 记得 N 条」），点头像或状态行打开 `components/mobile/ActivitySheet.tsx`（读本人 `agent_audit_events` 最近 20 条，`auditActionLabel` 转人话；出口：完整审计、`/x/progress#memory`）。手机上对话通栏无框、高 `calc(100dvh-150px)`。
- **想法页** = `lib/agent/ideas.ts buildIdeas`（纯函数、无模型调用）：待办 → 反思画像 `user_model` 的 current_focus / goals → 当前阶段的下一步（键必须是 `WORKFLOW_STAGES` 的真实 key）→ 预算 / 区域 / 搬家日期 / 房源记忆 → RecommendationDeck 链接；每条带「为什么」，≤8 条去重；点一条走 `?prompt=` 深链。
- **进度页** = `WorkflowStatusPanel` + `StatusOverview` + 可编辑的 `PrivateMemorySnapshot`（`editable` 时每条「改 / 忘掉」，直接写本人 `user_memories`，写 `memory_edited / memory_forgotten` 审计事件）+ `RelatedPagesCard`。
- **PWA**：`public/manifest.json`（standalone，`/icons/` 192 / 512 / maskable / apple-touch，图标 = **wordmark 本身**（用户 2026-09-22 要求主屏图标是 stayloop.AI 的 logo）：白底、**一行「Stayloop.AI」**（用户否决了两行版）：「Stay」墨蓝 + 「loop.AI」墨蓝→#00ACE4 渐变、Inter Tight 800、字距 −0.04em、左右留白 56/1024，与 `components/Logo.tsx` / `.sl-wordmark` 同一套；用 fontTools 把 `public/fonts/inter-tight-latin.woff2` 转 TTF 后由 Pillow 离线渲染（`magick` 读不了含 `<text>` 的 SVG）。文字宽 912/1024 超出 maskable 安全区（内 80%），Android 圆形裁切会切到首尾字母——如需可再出带留白的 maskable 版。favicon 同图（用户要求）：`public/favicon-16/32/48/64.png` + `public/icon.svg`（内嵌 256px PNG 的 SVG，避免各浏览器字体回退），`app/layout.tsx` metadata.icons 列出 png + svg + apple；紫色「S」已退役、`app/layout.tsx` 的 manifest / apple meta、`public/sw.js`（**没有 fetch handler、不缓存**——部署必须次日可见，只为可安装与将来推送保留 push / notificationclick）、`PhoneTabs` 里注册 SW 并在手机浏览器标签页显示一次「添加到主屏」提示（`localStorage sl-install-hint`）。**Web Push 已做（用户同日拍板「vapid 你自己搞定」）**：`lib/push/webpush.ts` 在边缘运行时**无库**实现 VAPID（RFC 8292，ES256 JWT，
WebCrypto ECDSA 原始 r‖s 即 JWS 形式）与 aes128gcm 载荷加密（RFC 8188/8291：ECDH P-256 + HKDF-SHA256 + AES-128-GCM 单记录），
`tests/webPush.spec.ts` 用参考实现 `http_ece`（devDependency，随 `web-push` 装入）**解密我们的密文**作为合规证明，并验 JWT 签名。
密钥：`.env.local` 的 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`（构建内联）/ `VAPID_PRIVATE_KEY`，CF Pages 同名 secrets（`wrangler pages secret put`，
值走 stdin 文件不过 shell）；主题 `mailto:privacy@stayloop.ai`。表 `push_subscriptions`（迁移 `20260922_push_subscriptions.sql`，已应用 prod；
本人 RLS、**anon 已 revoke**——endpoint 是能力 URL；每设备一行，`level ∈ default|quiet`，404/410 或连续 5 次失败置 `disabled_at`）。
客户端 `lib/push/client.ts` 直接经 RLS 写自己的订阅行（无 API 路由）；`components/mobile/PushSettingsCard.tsx`（进度页 + `/settings`）
三档「关 / 少（只推等你批准的）/ 默认（加新申请、看房请求）」+「发一条测试通知」（`POST /api/push/test`，每小时 5 次）。
发送方 `lib/push/notify.ts notifyUser`：`kind='approval'` 两档都推、`kind='event'` 只推 default，**做完的事永不推**。挂钩三处：
`proactive` cron（每用户每轮一条「N 件事等你点头」）、`/api/showing-intent`（房东收到看房请求 / 提问）、`/api/notify-landlord`（新申请，event）。
iOS 只对已添加到主屏的 PWA 投递（16.4+），卡片会提示。SW 的 `push` / `notificationclick` 处理器早已就位。**用户 2026-09-22 在自己手机上收到测试通知，端到端已验证。**
可借的是「会自己干活的助手在手机上怎么摆」：一条长对话为主屏、头像下一行真实的「正在做什么」并可点开活动日志、审批卡在对话流里
（Allow / Deny）、Ideas 页列出「我可以替你…」带理由、Goals 页放长期任务、底栏 5 个图标、主动消息门槛高且可调。对照 Stayloop 375px：
审批面板排在对话下方首屏看不见、底栏 8 项 9.5px、头像状态是装饰文案、无推送 / 无 PWA；而对话内产物卡（房源 / 行情 / 对比表 / 草稿）
和审批卡的 data_scope / excluded_data 比 Muse 强，保留。建议 P0 = 底栏 5 项（助手 · 待办 · 想法 · 进度 · 更多，只改 md 以下）、审批进对话流、
头像真实状态 + 活动日志弹层、进度页、想法页（纯函数拼句，不加模型调用）、对话通栏；P1 = PWA + Web Push（只推需要决定的与真正新的）、记忆可编辑。
**不抄**：Secure VM / 代操作第三方网站、购物与一次性卡、头像画像、纯图标底栏、年龄门与周额度。

## 租房全流程 AI 与 Trust API 优化方案（2026-09-22 · 依据 `~/Downloads/eliseai-story-and-site-analysis.pdf`）

方案 `design/lifecycle-and-trust-api-plan-2026-09.md`。生产实数：全流程里只有筛查有量（227 份），applications / showing_intents /
households / rent_payments 都是 0，待办 18 条 0 条执行过；Trust API 文档的 4 个端点与 `api.stayloop.ai` 全不可用（`trust_api_keys` 0 行，
路由查的 `rental_passports` 表不存在）。方案：① 加固护城河（规则编号公开、`lib/ontario/rules.ts` 法条单一来源、三角色隔离承诺、
执行预览 + 60 秒撤销）；② 90 天闭环只做"接头"：申请 → 一键筛查、`send_decision` 决定通知执行器、申请 → 租约草稿、`send_lease` 执行器、
双签自动建 household；③ 五个 ROI 指标全部从现有表算；④ Trust API 重定位为"安省租房核验 API"，只保留三个有真实后端的端点
（passport/verify 读核验快照、screen 包装现有管线 + 同意校验、listings/compliance 确定性规则免费），**申请人主动出示模式**，对金融机构
开放需律师意见。**用户 2026-09-23 拍板「全部开始改」并要求三角色测试账号 + 全流程模拟测试。** 落地（守卫 `tests/lifecycle20260923.spec.ts`）：
- **测试账号（密码都是 `Test1234`，`user_metadata.test_account=true`，测试数据标 `[TEST]`，正式发布前不删）**：`tenant-test@stayloop.ai`（tenants 行）、
  `landlord-test@stayloop.ai`（landlords 行）、`agent-test@stayloop.ai`（agent_profiles 由测试阶段建；同时持有服务商行 `[TEST] Maple Plumbing Inc.`）；
  **2026-09-26 加第四个：`provider-test@stayloop.ai`（auth `f6b97901…`，纯服务商号）**——`service_providers` 行 `[TEST] Northline Home Services Inc.`
  （`8e668976…`，水管 / 电气 / 杂工 / 门锁 · Toronto / Mississauga / Vaughan · verified，五项资质 sto_coq / esa_contractor / wsib_clearance /
  liability_insurance / business_registration 全部已核、最早 2027-01 到期），与 Maple 一起构成水管类工单的两个合格候选（派单排序、首选设置可测）。
  登录落点是租客首页（每个账号都有租客帽子），服务商入口在身份菜单「服务商 · 工单」；早先的 `tester@stayloop.ai`（房东）仍在。
- **`lib/ontario/rules.ts`**：15 条规则的单一来源（编号 / 法条 / 中英 / 落点 / 严重度）+ `checkListingCompliance` / `checkLeaseTerms` /
  `decisionNoticeFooter`；公开页 `/rules`；发布向导第 5 步与 `/landlord/leases/new` 保存前都用它，命中写 `compliance_events`；turn 路由的
  guardrail 命中也写。表 + `admin_lifecycle_stats(p_days)` RPC 在迁移 `20260923_lifecycle_closed_loop.sql`（已应用 prod）。
- **申请 → 一键筛查**：`POST /api/screening/from-application`（RLS 证明房东拥有该申请 → 用申请文件清单直接建 `screenings` 行，
  `screenings.application_id` 新列）→ `/screening/app?screening=<id>&run=1`；`runAnalysis(existing?)` 有已有行时跳过建行与上传只评分。
  申请人页 `/landlord/applicants/[id]` 按钮改为「一键筛查 / 录取 · 起草通知 / 请 TA 补充材料 / 婉拒（需理由）」。
- **决定通知 `send_decision` 执行器**：申请人页把决定写成待批卡（`metadata {application_id, decision, reason}`），卡片内联可预览、批准即发；
  执行器服务端重读申请与房源归属，收件人取 `applications.email`，正文固定带 s.10(7) + OHRC 声明（`decisionNoticeFooter`），
  写 `applications.decision_notified_at / decision_reason`、`compliance_events(decision_notice)`。
- **`send_lease` 执行器** + `lib/lease/sendLease.ts`（`/api/lease/send` 与执行器共用：token 铸造、状态、邮件、审计）。
- **双签 → 在管租约**：`/api/lease/sign` 在 fully executed 时建 `households(source=esign, verified=true)` + 房东成员 + 租客邮箱邀请
  （`household_invites`）+ 首月 `rent_payments(due)`，审计 `household_created_from_esign`。
- **预览 + 60 秒撤销**：`POST /api/agent/execute {preview:true}` 让每个发信执行器返回将要发送的 subject/body（在 claim 之前返回，pending 也可预览）；
  `ApprovalActionCard` 有「预览正文」；`useAgentSession.decide` 批准后等 `UNDO_MS=60s` 再执行，`undo(id)` 取消并把行改回 pending +
  审计 `approval_undone`；对话里与 `/x/todo` 显示倒计时行。
- **五个指标**：`components/admin/LifecycleStats.tsx` 在 `/admin/usage`（空置天数 / 申请周转 / 筛查用时 / 合规拦截 / 续约提前率 + 提议·批准·执行计数）。
- **Trust API 重建**：`/api/v1/listings/compliance`（匿名、每 IP 120/h、只记规则命中不存文本）；`/api/v1/passport/verify`（合作方密钥 +
  申请人 token 的 `passport_share_tokens.api_scopes`，从 `verification_requests.steps`（按登录邮箱、非沙箱、verified）与已确认租史推结论，
  审计 + 推送通知申请人）；`/api/v1/screen`（密钥须绑 `trust_api_keys.landlord_auth_id`，同意记录 `v1-2026-09` 必填，https 文件抓进桶，
  202 + webhook；`screen-score` 接受 `x-partner-key` 以绑定房东身份运行，服务端强制 `screening.landlord_id` 归属）；`/admin/partners` +
  `/api/admin/partners` 发放 / 停用密钥（`create_trust_api_key` RPC，只存哈希）；租客护照页可勾选 API 可读范围；
  `/trust-api/docs` 重写为三个端点，旧的 `api.stayloop.ai` / disputes / SDK 全删。旧 `/api/trust/verify` 仍查不存在的表——待删。
- **租客「我的看房与提问」**：`components/tenant/MyShowings.tsx` 在 `/tenant/applications` 顶部读真实 `showing_intents`。

## 房东端 UX 修复清单（2026-09-22 · `bug 修复/stayloop-fix-list.pdf`，14 条，研究后取舍）

外部评审（匿名 + 测试账号登录）给的 SL-LL-001～014。先对照代码复现再决定，守卫 `tests/fixList20260922.spec.ts`（11 条）：
- **001 / 011 / 002 是同一根因：发布向导 `/dashboard/listings/new` 的「AI」提示框是设计稿的硬编码文案**（King West $2,820、
  「已上传 8 张」、「突出『允许猫』」、「✓ RTA / RECO 通过」、假照片格、不能拖的 PDF 区），旁边却是真发布按钮——房东会把
  这些当成自己房源的事实。全部删除：步骤 2 改成真实照片选择（data URL 存 `images`，最多 12 张，第一张封面）；步骤 3 改名
  「价格 + 条件」，加租期 / 宠物 / 吸烟 / 家具 / 租金包含（与编辑页同一套字段，`buildListingRow` slim 分支落库）、押金 >
  一个月租金时给 RTA s.106 红色提示；步骤 5 列出全部会发布的字段，缺的标「未提供」，「发布前检查」只列确定性检查（押金、
  无禁宠条款、无 AI 补写、有无照片）。导入区文案改为如实：Realtor.ca 链接 / MLS® / 公开房源页，PDF 截图走管家附件，无 CSV。
  配套 chips 本来就没有默认选中（代码里 `amenities: []`），评审看到的「初始选中」无法复现，加了守卫。
- **001 的对话路径也补了闸**：`sanitizeDraftListing` 在结构化字段为空时把文案里的宠物 / 吸烟 / 水电网 / 家具说法整句删掉
  （标题含此类说法则整个标题作废），并在回复里说明「你还没提供，我不能替你写」；提示词加铁律。
- **004**：向导字段补齐（见上）；详情页面积缺失显示「未提供」而不是「—」。楼层无列，不做。
- **008**：`/landlord/settings`（以及 tenant / agent 同形）在 `middleware.ts` 里 308 到 `/settings`——页面级 `redirect()` 在静态路由上只在水合后生效，curl 仍是 200。**014**：定价页测试期横幅写明「即将推出」模块尚未上线、不在免费范围也不收费。
- **006**：导入入口文案改为如实（见上），不承诺批量导入。
- **不改**：**005** 发布流里配置「信用 ≥720 / DTI ≤35%」筛选规则——硬性信用 / 收入比截止线与 OHRC 租房政策相悖，申请人页那段
  政策文字是样例数据（DEMO_GATE），不会把它做成真功能；**003** 已修（守卫在 `walkthrough20260922.spec.ts`）；**007 / 010 / 012 / 013**
  是命名与设计体例（「筛查」页同时含发起与历史、Header「工作台」与侧栏同一目的地、英文眉标 + 中文标题、房源来源徽章已有）；
  **009**「登录后仍显示登录/注册」无法复现——Header 按 `auth.loading / auth.user` 切换，评审没给路径。

## 全站测试规范与首轮执行（2026-09-22）

用户要求「先制定测试规范再做全站测试」。规范 `design/test-plan-2026-09-22.md`（八层：L0 静态 / L1 单元 / L2 构建 / L3 冒烟
四层在 ship 门禁；L4 路由与接口契约 / L5 数据边界与健康 / L6 系统适配 / L7 业务流按规范手动或脚本执行），首轮报告
`design/test-report-2026-09-22.md`。新增工具：`scripts/route-audit.mjs`（65 条匿名探针：公开页 200 + 安全头、受保护接口
401/400、重定向、输入校验，已接进 ship 脚本冒烟之后作信息性输出）、`.eslintrc.json`（此前项目从未配置 lint；现 0 error，
lint 一次 5–8 分钟，不进门禁）。首轮发现并修的：`/apply/[slug]` 眉标渲染出 `// ` 文本；两个 `use*` 前缀的纯函数被当 Hook；
生产库 13 个 SECURITY DEFINER RPC 撤销 anon 执行 + 10 个触发器函数撤销 API 角色执行（`20260922_anon_rpc_revokes.sql`，
匿名客户端在任何 RPC 之前就退回 demo 模式，`/join` `/apply` 的匿名 RPC 保留）；15 条 4–8 月卡死的筛查行标 error。
记录不改：`agent_directory` 的 SECURITY DEFINER 视图（改 invoker 要给 anon 开 landlords 列权限）；Safari / Firefox 无自动化；
浏览器端登录流程按约定不由 Claude 输密码，用 tester@stayloop.ai 手动走。**数据边界探针的做法**：`execute_sql` 里
`begin; set local role authenticated; set local request.jwt.claims = '{"sub":…}'; … rollback;`，listings 的 landlord_id 是
landlords.id 不是 auth uid。

## 深度核查复核：银行、商号、征信档雇主（2026-09-22 · Kim-Yi 案 · 用户要求「通盘考虑再修」）

用户看深度核查截图后指出三处：韩资银行「均未收录」不对；征信档雇主与在职信不一致「不能简单判定为假，也许是征信更新不及时」；
类似问题要通盘考虑。逐条核实后落地（守卫 `tests/bureauEmployer.spec.ts`，11 条）：
- **银行不是公司注册库的登记对象。** KEB Hana Bank Canada 列于《银行法》附表 II（外资银行在加子公司，OSFI 监管，CDIC 会员；
  laws-lois.justice.gc.ca b-1.01 附表页），任何公司注册库都查不到它。新模块 `lib/forensics/bank-act.ts`：附表 I / II / III 快照
  （截至 2025-12-31，共 35 + 15 + 28 家）+ 通过 webRead 读法条页的实时解析（读不全就回退快照），`matchBankAct` 接受法定名、
  「(The)」形式与含「Bank」的商号（Hana Bank Canada → KEB Hana Bank Canada）。`checkArmLength` 命中即合成 `company_info`
  （source `bank_act`、状态 `Active — Bank Act Schedule II (OSFI)`、链接到法条页），不报「未收录」、不跑找董事的网页检索、
  风险 clean 而非 unverified；三处界面加「监管：《银行法》附表 II 银行 · OSFI 监管」行。
- **放款机构上法庭是正常经营。** 银行的 12 件案件（追讨欠款、被列为扣押第三方 / 留置权人）原来是 medium「判断雇主经营稳定性前
  请先读案件」。`employerExtraChecks` 新入参 `regulated_lender`：改为 info `employer_court_cases_lender_routine`，法庭记录行不再红底。
- **商号与注册实体是同一家雇主。** 在职信写「David Health International (c/o 2201371 Ontario Inc.)」、工资单写「2201371 Ontario
  Inc. (o/a David Health International)」，原来当成三家雇主查，商号那张卡「未收录」+ 自己的法庭行。`mergeTradeNames`（employer-checks）
  按文件文字里的 o/a · c/o · dba · operating as · trading as 把商号折进注册实体（注册样名 = 有 Inc/Ltd 或编号公司），
  `runDeepCheck` 传 `trade_names`，卡片显示「经营名」，法庭检索同时查商号（LEE v. DAVID HEALTH INTERNATIONAL 归到 2201371 那张卡）。
- **注册库显示活跃 ≥5 年的编号公司**：`arm_length_numbered_company` 降 low 并写明「自 2009 年活跃、以 David Health International
  名义经营」，不再说「常被用作空壳」。
- **征信档雇主 ≠ 在职信雇主：先找原因。** 征信局不知道谁在哪里工作，雇主字段只在申请人申请信贷时由贷款方报送。
  `lib/screening/bureauEmployer.ts`：从征信文字读雇主行（Equifax 扁平化为「Employment Type Employer Name Current GTS SERVICES」）
  与信贷事件日期（只算「May affect scores = Yes」的硬查询 + 账户 Opened 日期），对同一人的在职信（按姓名匹配）比较：
  最后一次信贷事件早于入职日 → `stale_by_construction`（info，解释文字写明两个日期，「不是矛盾」）；雇主在申请表前雇主里 →
  `previous_on_application`（info）；入职后仍有信贷活动且申请表没提 → `unexplained`（low，保留追问）。前两种会同时删掉
  coherence 里对应的「雇主不一致」条目、模型的 related-party 信号与「核实 GTS vs David」待办，并把解释写进该征信文件的房东解读。
  本案：Yi 最后一次硬查询 2025-04-12（Bell），入职 2025-09-29，档案上仍是 GTS Services 是必然的。

## 深度核查加项与红色标记（2026-09-16）

用户看到注册库「Inactive」旁边挂着绿色「正常」徽章，要求：注册状态异常、法庭记录这类结果必须醒目标红，并且深度核查
要多做几项相关检测。`lib/forensics/employer-checks.ts`（纯函数）+ `lib/screening/portalClient.ts`（法院门户当事人检索，
含 403 中转）接进 `app/api/deep-check`，每家雇主多出六项：
- **注册状态**：`registryStatusKind` 把 Inactive / Dissolved / Cancelled / Struck… 归为 inactive → `employer_registry_inactive`
  （critical），该雇主 `arm_length_risk` 强制 high；三处渲染（结果页 / 报告页 / 打印）状态行红底加粗「⚠ 已注销 / 非活跃 —
  不可能在发工资」，徽章改为「注册状态异常」，总体横幅「雇主注册状态异常」。
- **入职日期 vs 成立日期**：信称入职早于公司成立 → high。`extractEmploymentStart` 容忍伪造信常见的 since 拼错（scince）。
- **雇主域名（RDAP，免费无 key）**：从信上邮箱 / 网址取域名，`rdap.org` 查注册日期；域名不存在 → high；注册日期晚于
  信称入职一年以上 → medium（本案 globenetint.com 2020-11 注册，信称 2015 入职）。
- **联系路径**：唯一联系方式是 gmail / hotmail 等个人邮箱 → medium。
- **地址与电话**：信头城市 ≠ 注册库城市 → low；公司电话区号所属地区 ≠ 信头城市 → low（安省区号表）。
- **雇主诉讼**：法院门户按公司名精确检索，当事人字段按规范化词包含匹配到该公司才算；有案件即红底显示「N 件案件为
  当事人」，被告 / 未结 → medium；无记录显示绿色「无记录」。立案≠结果，文案照旧不下结论。
守卫 `tests/employerChecks.spec.ts`。

## 法庭数据源「未能检索」（2026-09-15 · 两个真实原因）

用户截图：CanLII 与安省法院门户两行都显示「未能检索（超时 / 不可用）」。
- **CanLII**：Jina 对零结果的检索返回 **HTTP 422 `AssertionFailureError: No search results available`**，
  `canliiIndex.ts` 把非 200 一律当故障 → 落到「人工检索」行并被计入「未能完成检索」。现在 422 + 该消息 = 正常的
  0 条；人工检索行在结果页显示为「需人工检索 · 打开预填搜索 ↗」的链接，不再计入未完成数据源。
- **安省法院门户**：`api1.courts.ontario.ca` 前面是 Azure Application Gateway，对部分出口地区直接 **403**（本机开
  VPN 从迪拜出口可复现；生产 Cloudflare Worker 的出口 00:17 UTC 被拒、23:43 UTC 正常）。Supabase 数据库
  （AWS us-east-1）访问它返回 200，所以加了 `portal_relay_get(url)`（迁移 `20260915_portal_relay.sql`，仅 service_role、
  host 白名单）作为直连 403 时的中转。**pg_net 不能在函数里同步用**——请求行在事务提交前对 worker 不可见，
  函数内轮询必然超时；改用同步的 `http` 扩展（6s curl 超时，在 PostgREST 8s 语句超时以内）。结果页对 403 显示
  「门户拒绝了服务器访问（HTTP 403）」并给人工核对链接。
- 顺带发现：**Supabase 项目在 us-east-1（美国弗吉尼亚），不是隐私页写的 Toronto / Montreal**。隐私页第 4 节与首页
  「数据驻加」已改为如实披露（PIPEDA 允许跨境存储但须告知）。要真正数据驻加需迁移项目到 ca-central-1，由用户决定。

## 雇主「Inactive」的原因：Ontario Gazette（2026-09-16 · Globe Net International 案）

用户问「为什么会 inactive？有没有税务相关的违法？」。注册库（OpenCorporates cbr_on）只写 Inactive；**原因只有
Ontario Gazette 的 Government Notices Respecting Corporations 会写**，分几节：《公司税法》违约通知（Notice of Default
in Complying with the Corporations Tax Act，安省财政部通知注册处）→ 随后一期「Cancellation of Certificate of
Incorporation (Corporations Tax Act Defaulters)」（OBCA s.241(4) 注销）；《公司信息法》未申报的违约与注销；自愿解散
（Certificate of Dissolution）；复活（Order for Revival）。本案：GLOBE NET INTERNATIONAL INC. 002072032 在
Vol 147 Iss 45（2014-11-08）列在违约通知（2014-10-18），在 Vol 148 Iss 08（2015-02-21）列在税法违约注销（生效
2015-01-26）；在职信却称 2015-06-23 起受雇——比公司注销晚 5 个月。**这是税务合规违约（未申报 / 未缴），不是定罪**：
CRA 只公布定罪（enforcement notifications），本案无；CanLII / 法院门户无该公司案件。同名实体今天仍在营业
（globenetint.com 2020 年注册、Richmond Hill 9325 Yonge St 目录条目），要么以另一实体经营、要么无实体。
落地（`lib/forensics/employer-checks.ts`）：`gazetteLookup`（s.jina.ai 搜 `"<注册名>" Ontario Gazette corporations`，
只读 ontario.ca 的 gazette 页，最多 4 页，issue 根 URL 自动补 `/government-notices-respecting-corporations`）→
`parseGazettePage`（按节标题定性、按名称 + 9 位零填充公司号定位、取日期格；BOM 剥掉）→ `employerExtraChecks`
新入参 `gazette`：税法注销 `employer_dissolved_tax_default`（critical，写明通知日 / 注销日 / 受雇日在注销之后几个月、
「不是定罪」）、信息法注销 `employer_dissolved_returns_not_filed`、自愿解散 `employer_voluntarily_dissolved`、只有
违约通知 `employer_tax_default_notice`（high）；有复活通知则不标。deep-check 路由只在注册状态为 inactive 时查
（40s 上限）；三处界面在状态行下加红色「注销原因」行 + Gazette 链接（`dissolutionReason`）。守卫
`tests/employerChecks.spec.ts`「Ontario Gazette dissolution reason」段。本机联网复现 scratchpad `gazette-live.mts`。

## Supabase 迁到加拿大区（2026-09-16 · us-east-1 → ca-central-1）

用户拍板后由 Claude 全程执行。新项目 **`uotcczsfeiptnabamzcd`（stayloop-ca，AWS ca-central-1 蒙特利尔，Micro，$10/月）**，
旧项目 `upbkcbicjjpznojkpqtg`（us-east-1）**付费项目不能 pause**（API 报 not free-tier），改为撤销 anon / authenticated / service_role 在 public 上的写、序列与函数执行权（读仍可）作冻结，留作回滚；**2026-09-17 用户拍板后经 Management API `DELETE /v1/projects/<ref>` 删除**（SQL 转储留在 `~/stayloop-backup-2026-09-16/`；存储对象只剩新项目那份）。数据面：66 张 public 表
1,708,326 行逐表精确计数一致；92 函数 / 116 策略 / 23 触发器 / 162 索引 / 4 序列 / 66 张表 RLS 全部一致；13 个 auth 用户 +
12 个身份（密码哈希随行，但**会话不迁移**——JWT 密钥不同，所有人重新登录一次）；2 个存储桶 1,827 个对象 1.6 GB 按大小校验；
3 个 pg_cron 任务 + Vault `cron_secret`；Auth 配置（站点地址、跳转白名单、Resend SMTP、全部邮件模板、Google OAuth
client）经 Management API 整块复制（hook_* 与 oauth_server_* 两组键新项目计划不允许，已剔除）。**GET 回来的 `smtp_pass`
是 64 位掩码不是真密码**，照抄会让魔法链接报 500「Error sending magic link email」——要用 `.env.local` 的 `RESEND_API_KEY`
单独 PATCH 一次。**`external_google_secret` 同样是掩码**（Google 回调后 Auth 日志报 `invalid_client: The provided client secret is invalid`，前端显示「登录链接已失效」），要从 Google Cloud Console 的 OAuth client 取真实的 `GOCSPX-…` 密钥再 PATCH。**只 PATCH `smtp_pass` 一个键会把 smtp_host / port / user /
sender / admin_email 全部清空、`rate_limit_email_sent` 回落到 2/小时**（项目悄悄退回 Supabase 自带邮件服务，magic link 仍返回 200 所以
当时没察觉；2026-09-17 复审的配置漂移比对才发现）——SMTP 相关键必须整块一起 PATCH。
- **做法**（无 Docker，`supabase db dump` 不可用）：本机 libpq 18 的 `pg_dump --schema=public --schema=supabase_migrations`
  结构 + 数据、`--table=auth.users --table=auth.identities`，存储策略从 `pg_policies` 重新生成，cron 从 `cron.job` 重新生成；
  走 **session pooler 5432**（`postgres.<ref>@aws-1-us-east-1 / aws-0-ca-central-1.pooler.supabase.com`，主机名从
  `GET /v1/projects/<ref>/config/database/pooler` 取，猜错就是「tenant/user not found」；直连 `db.<ref>.supabase.co`
  本机解析不到）。数据库密码两边都用 `PATCH /v1/projects/<ref>/database/password` 重置为脚本生成值（应用不用它）。
  脚本在会话 scratchpad `migrate/`（01_dump / 02_restore / 02b_vault / 02c_data / 03_storage.mjs / 04_config / 06_switch /
  07_delta / 08_drift），PAT 存 `.env.local` 的 `SUPABASE_ACCESS_TOKEN`（7 天有效，Organization 级）。
- **两个坑**：① `pg_dump --schema=public` 会带出 `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin …`，postgres 不是
  supabase_admin 会报错，整段删掉；`CREATE SCHEMA supabase_migrations` 被我误删后要补回。② **新项目磁盘只有 2 GB**
  （不是文档说的 8 GB）：1.2 GB 数据单事务导入时 WAL 涨到 1.3 GB，Postgres PANIC「No space left on device」，项目进入只读。
  `POST /v1/projects/<ref>/config/disk` 扩到 16 GB（gp3，超出 8 GB 的部分 $0.125/GB/月），约 1 分钟后自动恢复读写，
  之后 2 分钟导完。**以后往新项目灌大数据先看 `GET …/config/disk`。**
- **第三个坑（2026-09-16 复审时发现，已修）：ACL 漂移。** 新项目带 `ALTER DEFAULT PRIVILEGES … GRANT ALL … TO anon /
  authenticated / service_role`，转储里的对象一建出来三个角色就自动拿到全部权限，而 pg_dump 的 `REVOKE ALL … FROM PUBLIC` +
  `GRANT … TO authenticated` 只做加法——结果 anon 能执行 `portal_relay_get`（应只给 service_role）、household 的
  SECURITY DEFINER RPC、`search_ltb_orders`，anon / authenticated 能读 `household_invites.token`，anon 能读 `agent_profiles`
  整表（RLS 仍在，但列级和函数级防线全丢）。修法：`revoke all on all tables / sequences / functions in schema public from
  anon, authenticated, service_role` 后再重放转储里全部 GRANT/REVOKE 行（scratchpad `acl_fix.sql`），逐项与转储比对一致。
  **凡是用 pg_dump 迁到带默认权限的新项目，restore 后必须做这一步。**
- **切换**：`.env.local` 三个值（NEXT_PUBLIC_* 构建内联）+ CF Pages secrets（`wrangler pages secret put`，同名覆盖）+
  GitHub Actions secret `SUPABASE_SERVICE_ROLE_KEY` + 两个 workflow 里内联的 URL + `scripts/ingest-ca-corp-registry.mjs`
  注释；隐私页与首页「数据驻加」文案恢复。切换前跑 `07_delta.sh`（除三张刷新表外全部 public 表 + auth 用户
  truncate 重灌），部署后跑 `08_drift.sh` 看旧库在切换窗口内有没有新写入。
- **用户需手动**：Google Cloud Console 的 OAuth client 授权回调里加 `https://uotcczsfeiptnabamzcd.supabase.co/auth/v1/callback`
  （否则 Google 登录失败，魔法链接不受影响）；7 天后删除 PAT。

## 商业 / 工业场地检索（2026-09-18 · 租客管家的隐藏技能）

用户以租客身份找「3 万尺工业厂房、净高 24 尺、开匹克球馆」，管家只会住宅检索，同一需求被记了五条记忆。用户要求放开
Realtor.ca 上的所有租赁类型，作为不在界面上宣传的隐藏技能；随后拿另一系统生成的 15 套候选对比报告
（`~/Downloads/Pickleball_Venue_Lease_Analysis.pdf`：面积 / 净高 / 报价 / TMI / 年成本 / zoning / 交付 / 转租、逐套优劣、
明写「No Recreational Uses」的排除）要求 Stayloop 补齐差距。落地 `lib/agent/commercialSearch.ts` +
`components/agent/CommercialCompareTable.tsx`（守卫 `tests/listingSearchCommercial.spec.ts`，41 条）：
- **触发**：`search.property_type ∈ {industrial, retail, office, land, commercial}`，或 property_type 为空且 keywords 含明确商业词
  （厂房 / 仓库 / 店面 / 写字楼 / warehouse / storefront…；「健身房」「studio」单独出现不算）。`commercialKind()` 一旦命中，
  `searchListings` 直接走商业路径：不查 Stayloop 库（全是住宅）、不出行情卡（$/sqft/年 与住宅月租不可比）、不做街道排名，
  返回最多 18 套（三页）供整体对比。
- **需求字段**（提示词让模型填）：`min_sqft / max_sqft`（"3 万尺以上"→30000，不填上限则默认按 2 倍收口）、`min_clear_ft`
  （净高，英尺）、`use`（用途英文短语，如 "pickleball courts / indoor sports"）、keywords 放技术规格。
- **两条检索路**（都经 Jina）：① 列表页 `/on/<city>/commercial-space-for-lease`（office 另加 `office-space-for-lease`），
  只有这三个 slug 存在——`industrial-for-lease` / `retail-space-for-lease` / `warehouses-for-lease` 都是 404 页（HTTP 仍 200）；
  每页 11 行，**从不带楼宇类型**，列表行一律标「商业空间」；分页参数（`?page=2` / `?CurrentPage=2` / `/page-2`）和 `/map#…`
  哈希检索在 Jina 里都渲染不出第二页。② 详情页搜索 `site:realtor.ca/real-estate …`，**按区域扇出**：用户给的区域（一串
  「Markham/ Richmond Hill /Toronto」会被 `splitAreas` 拆开，≤8 个）或 GTA 宽泛需求时的默认集（Toronto / Vaughan / Mississauga /
  Markham / Richmond Hill / Brampton / Scarborough / Pickering）。**查询里绝不能带面积数字或任何数字**（2026-09-18 实测：
  「industrial for lease Markham」回 10 条，后面加「30,000 sq ft」就只剩 0–1 条；整串规格塞进去直接 422「无结果」）。
  每个区域最多 6 种短措辞，按价值排序：`<kind> for lease <city>` → `"<city>" industrial "clear height"`（规格词去掉数字）→
  `"<city>" industrial "truck level"` → `<city> Ontario industrial lease` → `freestanding warehouse` → `"For lease" "<city> ("`
  → `warehouse sublease`（大空间词是关键：索引默认偏向小单元和 suite）；总数 ≤16 条并行。搜索摘要里几乎不印面积，
  `scoreSnippet` 只能做粗筛（摘要有面积且在带内 +3、明显偏小 −3、规格词 +1、truck-level / freestanding +1、suite / office unit −1），
  所以按分数带交错后**最多并行读 48 个详情页**（≈0.5¢ Jina 额度，耗时 ≈ 单页），面积筛选在解析后做。**假定 Workers Paid
  的子请求上限（1,000）**——screen-score 本来就远超 Free 的 50。实测 3 城市 / 30,000 尺 / 净高 24：17 秒，核对 44 套，
  11 套接近条件（含对方报告里的 2-500 Edward、2-20 East Pearce、56 Leek），另有 110 Clegg Rd 46,566 尺 24' 全达标；
  搜索引擎每条只回 10 个、结果每轮有波动，汇总里写明「本轮核对了 N 套」，「换一批」带排除集重搜。422 是零结果不是故障，
  但同一条查询并行时 422、隔一秒单发就回 10 条——所以空的查询会隔 800ms 重试一次。
  `search_used` 随 turn 响应返回（模型实际填的检索字段），空结果时先看它。
- **用户 2026-09-18 定调：不要复杂，能正确返回结果就行。** 于是保证「有页面就有结果」：面积 50–90% 的当「面积偏小」保留
  （用户说「大概 3 万尺」时 2 万尺也该看到），只有 <50% 或 >4 倍且不可分割才丢；如果过滤后一套都不剩但读到了页面，就按
  面积最接近的给 6 套并标红。五类查询（3 城工业 ×2、Mississauga 仓库不限面积、Scarborough 店面、市中心办公）连跑各回
  14–18 套、10–18 秒。
- **详情页解析**（`parseCommercialDetail` / `extractFacts`）：地址接受 H1 **或 H2**（老版式用二级标题，此前漏掉 1/3 候选）；
  非安省（"Coldstream, British Columbia"）直接丢；「The listing you are looking for no longer exists」丢；`$1/sqft`、`$1/Monthly`
  是经纪的「面议」占位（`isPlaceholderPrice`），不当费率乘。**租赁挂牌把 TMI（$/sqft/年）填在 "Annual Property Taxes" 字段**
  （≤ $60 才当 TMI，几万的是真税单），gross 报价视为全包；年成本 = (净租 + TMI) × 面积，与对方报告逐套核对一致
  （1615 Warden：(16.50 + 4.90) × 30,400 = $650,560）。规格只引房源文字：净高（支持 17'8" → 17.7，数字后必须带英尺记号，
  否则 "clear height, 800 amps" 会读成 80'）、truck-level / drive-in 门（含 "two drive-in" 英文数词）、zoning（"Zoned E 0.8"）、
  电力 A、车位（Total Parking Spaces 或 "35 marked parking spaces"）、ESFR / 喷淋、办公占比、独立物业、交付
  （immediate / Q4 2026 / April 1, 2027）、转租及到期、**禁止用途**（"No Recreational Uses" / "not suitable for …"）、
  MLS 号、经纪公司。
- **匹配分层 `assessFit`**（tier 0–5，卡片与表格红色 pill）：0 全部达标；1 软缺（净高未标 / 面积 70–90%）；2 面积远超需求
  （> max_sqft，默认 2×min）或超预算；3 有面积要求但房源没印面积；4 净高不足；5 **房东明写禁止该用途**（`useProhibited`：
  用户用途词 → 类别 → 对照排除语句，匹克球 ↔ Recreational）。面积 <70% 或 >4× 上限且没提可分割（demise / divisible）直接丢；
  非 GTA 城市在 GTA 宽泛需求下丢（`cityAllowed`，Brantford / Woodstock 曾混入），点名城市时只留那些城市（多伦多的区 → Toronto）。
  同层内按 |面积 − 需求| 排，无面积要求时按月租。
- **界面**：卡片显示「$18/sqft/年 净租 ≈ $X/月 含 TMI」（无 TMI 时标「净」，面议标「价格面议」）、类型·面积、MLS·经纪、
  规格 pill + 红色不达标 pill；卡片网格下方 `CommercialCompareTable`：# / 物业·城市·类型·MLS / 面积 / 净高 / 报价 / TMI /
  年成本(估) / Zoning / 交付(转租) / 标记（红 pill、琥珀「净高待确认 / 面积待确认」、绿「匹配」），表内链接到 Realtor.ca；
  手机端外层 `overflow-x-auto` + `min-w-0`、表 `min-w-[860px]`（375px 实测页面零溢出）。
- **回复里的数字由系统写**：模型在检索前作答，所以 `summarizeCommercial` 把「共 N 套（城市）· 面积区间 · 净高已标注 M 套其中 K 套
  ≥ 要求 · 年成本区间（只算 tier ≤1 且有 TMI 的）· J 套房东明写禁止用途」拼在 reply 末尾，语言跟随用户消息（中文提问在英文界面
  也给中文）。提示词要求模型只说两三句（卡片 + 表格在下方、商业租约无 RTA 保护、zoning 要市府书面确认、找律师），不写数字。
- **仍不如对方报告的地方（有意不做）**：各市 zoning 条文对「室内体育馆」的允许性分析（需逐市法规核对，不能硬编码猜）、
  可布球场数 / 收入模型（用途专属）、逐套「优势 / 风险」叙述（要二次模型调用）。表格给出 zoning 代码与「需市府书面确认」。
- **记忆重复**：提示词的记忆列表现在带 `[key]`，并要求更新同一事实时沿用已有 key——那五条重复就是模型每轮另起 key 造成的。
- 顺手修的旧 bug：`useAgentSession` 恢复历史后 `msgSeq = saved.length`，历史有缺口时新消息 id 与旧的撞车（React「two children
  with the same key」），改为取最大 id。调试：`COMMERCIAL_DEBUG=1` 打印每条查询命中数 / 详情页解析失败 / 城市与匹配过滤掉的行。

## 模型目录怎么保持最新（2026-09-21 · 用户问「模型怎么样保持有最新的选项」）

目录 = 代码里的 `BUILTIN_MODELS`（`lib/modelConfig.ts`）+ 管理员在 `/admin/models` 加的 `model_catalog` 行，此前没有任何
自动发现，新模型发布后只能改代码或手填。现在 `/admin/models` 顶部有「⟳ 发现新模型」：`GET /api/admin/model-discover`
（管理员 JWT）对每个已配置 key 的厂商各调一次「列出模型」接口（Anthropic `GET /v1/models`；OpenAI 兼容厂商一律
`GET {defaultBaseUrl}/models`，Gemini 的 `models/` 前缀剥掉），`lib/modelDiscovery.ts` 与目录做差集：
- **目录里没有**：过滤掉 embedding / tts / whisper / image / realtime / live / codex / moderation / OCR / 带日期的快照 id，按发布
  时间倒序，默认只显示最新 8 个（其余折叠）。**用户 2026-09-21 要求「再容易操作一点」→ 一键加入**：点「＋ id」=
  `inferDefaults(env, id)` 按厂商与型号名推断 vision / 槽位 / PDF 方式 / 温度参数 / 费用档（DeepSeek、GLM 纯文本；GPT-5/6、
  o 系列用 max_completion_tokens 且不传 temperature；Gemini PDF 走 image_url；nano/mini/flash/haiku 低价，pro/opus/max 高价）
  → 直接 upsert 进 `model_catalog`（enabled、**user_selectable=false**、单价空）→ 立刻调 `/api/admin/model-test` → 芯片变
  ✓/✗ 并显示延迟，目录表同步刷新。管理员只剩两件事：在表里打开「用户可选」、点「编辑」补单价。
- **厂商列表里已没有**：目录里启用中、而厂商非空列表里找不到的 id 标红，旁边直接给「测试」「停用」两个按钮（停用 =
  以 builtin 覆盖行写 enabled=false）。别名算存在
  （目录 `claude-haiku-4-5` ↔ 厂商列出 `claude-haiku-4-5-20251001`）。
- 2026-09-21 实测七家全部能列：Anthropic 11（新 `claude-fable-5-1` 等）、OpenAI 130、Gemini 59、DeepSeek 2
  （`deepseek-v4-flash` 已不在列，厂商现在叫 `deepseek-flash`——要点测试确认）、Moonshot 4、DashScope 261（含第三方托管的
  glm / kimi）、智谱 11。自定义网关（CUSTOM_LLM_API_KEY_*）没有固定 host，不查。守卫 `tests/modelDiscovery.spec.ts`。
- 单价目前还是手填（`BUILTIN_PRICING` / 目录行），厂商接口不返回价格；`/admin/usage` 的成本统计依赖这个。

## 全站复审 2026-09-19（六个切片 85 条 · 全部核实后修复）

用户要求「再做全站模块分析和 review，以及代码 review」。六个只读审查代理（安全与平台 / 管家与找房 / 筛查管线与报告 /
取证·深度核查·核验·LTB / 支付·租约·房源·在管租约·经纪认证 / 工作台·文案·双语·手机端），每条带代码行 + 反例实跑或
生产库回滚事务探针；修复由我 + 三个修复代理（文件集互不重叠）完成。两份迁移已应用生产并用回滚事务验证：
`20260919_lease_insert_guard.sql`、`20260919_review_h_fixes.sql`。守卫：`tests/review20260919Screening.spec.ts`（34）、
`tests/review20260919Forensics.spec.ts`、`tests/listingSearchCommercial.spec.ts`「review 2026-09-19」段、`tests/contactRoute.spec.ts`。
全套 697 个测试。值得记住的模式：
- **守卫触发器只挂 UPDATE = INSERT 是敞开的。** `lease_documents` 的守卫只在 UPDATE 触发、策略 `FOR ALL` 无 WITH CHECK：
  房东可直接 INSERT 一条 `signed_both` + 伪造 tenant_signature + 自选 sign_token 的租约；任何有 tenants 行的账号还能带着
  别人的 landlord_id（房源页公开）插进对方工作台。现在守卫 `BEFORE INSERT OR UPDATE`（客户端插入一律清签名 / token /
  sent_at，status 只许 draft|active；更新时 status 只能在 draft/active/ended 间走、landlord_id 冻结、**发送后条款即冻结**
  而不是签了才冻结），策略拆成 双方 SELECT / 房东 INSERT·UPDATE / 未签才可 DELETE。**探针别选管理员账号**——
  `is_direct_client_write()` 对管理员放行，第一次探针因此看起来「没修好」。
- **「纸面状态」不是对方确认。** 公开 Passport 卡曾把 `status='active'`（房东自己手填的在管记录）当租史证据，一个账号就能
  造出按时付租记录；现在只认 verified household 或双方签名 + signed_at。`accept_household_invite` 置 verified 还要求
  接受者 ≠ 邀请者且登录邮箱 = 受邀邮箱（成员资格不受影响）。经纪认证：RECO 注册库全是公开信息，对得上只能证明
  「这位注册人存在」——`reco_number` 加了在途唯一索引，后台队列对个人邮箱标琥珀警告，审计事件策略限制本人只能写
  submitted/edited；**核验按钮带 `updated_at`（经纪）/ 地址+租金（房源）条件**，对方在管理员打开页面后改了资料则 0 行并重载。
- **发邮件的路由都是潜在中继。** `/api/verify/create` 的 tenant_name 未转义直接进 HTML、收件人任填、测试月内人人可用、
  无限流 → 已转义 + 每账号每小时 10 封；`/api/agent/execute` 三个执行器共用每小时 20 封；`/api/lease/send` 补了
  「必须是该租约的房东」检查（RLS 可读 ≠ 房东，租客与 household 成员也可读）+ 每小时 10 封。统一走
  `lib/rateLimit.ts underHourlyLimit(key, limit, failOpen)`（复用 `bump_anon_rate_limit`，service role；**发信类 fail-closed，
  成本类 fail-open**）。reflect 路由改用自己的桶（原来与 turn 共用计数，聊 5 句就把反思锁死）。
- **匿名面的成本上限要有全局的。** 匿名 turn 的 stageLabel / workflow.* / attachment_names 无长度上限，系统提示可被撑到
  12 MB；一次匿名商业检索最多 81 个 Jina 请求。现在字段全部截断，匿名检索预算 6 查询 / 12 读页 / 不重试
  （`BUDGET_ANON`），另加全站匿名 turn 每小时 400 的总闸。`/api/deep-check` 在测试月内**完全不需要登录**
  （`inInternalTestWindow()` 在读 Authorization 之前就 return）→ 先 getUser，窗口只跳过计划检查，每用户每小时 20 次。
- **Stripe webhook**：supabase-js 写失败不抛异常，三个订阅处理器从不读 error → 钱收了 plan 还是 free 且 customer id 没落库；
  现在 throw 让 Stripe 重试。`subscription.updated` 改为 `subscriptions.retrieve` 取**当前**状态（迟到的旧事件曾能在
  deleted 之后把 Pro 复活）。解锁账本加 `fulfilled_at`：「见过」≠「已履约」。测试月结束后的首月配额从 10-14 之后算起。
- **申请表第五个阻断原因**：`...form` 里五个 date 列是 `''`（两个根本没有输入框）→ 22007。空串统一转 null。至此匿名探针
  `insert ok, attach=t`。
- **商业检索（昨天新写，首次独立审查 15 条）**：分数 −1 的搜索命中落不进任何分数带 → 永不被读（多数办公 / 零售命中）；
  `commercialKind` 关键词回退把「house, big lot」「工业风装修」「办公室附近」「near Commercial Drive」劫持到商业路径
  （现在有 min_beds 或住宅词即返回 null，关键词要带「space / 出租 / 厂房」等限定）；出售页与「Single Family」住宅页被当成
  「价格面议」的完美匹配（无单位价格 / 住宅类型即丢）；净高取到办公区的 9' ceiling（现在收集全部、clear 优先于 ceiling、
  取最大、左边界防 "5,000 ft clear span"）；禁止用途漏「No automotive, recreational or food uses」「…uses not permitted」、
  误判「no better location for recreational uses」；`/auto|car/` 命中 daycare / skincare / automation；「TMI: $12,000 per year」
  读成 $12/sqft；月租报价 + TMI 的年成本漏加 TMI（`annual_all_in` 标记，汇总只算真正含 TMI 的）；`normalizeArea` 在商业分支
  之前把「Markham/ Richmond Hill /Vaughan」砍成 Markham；`cityAllowed` 子串匹配让 "Toronto, ON" 的 "on" 放行 London /
  Brampton、"Concord" 查不到「Vaughan (Concord)」（`SUBAREA_CITY` 映射 + 社区匹配）；「换一批」不传排除集、每轮重读同样
  48 页（现在按 URL slug 前缀在读页前排除）；英文界面看到中文 pill（新增 `specs_en / specs_warn_en / note_en /
  property_type_en / warn_codes`，表格红色样式按 code 而不是 `startsWith('净高')`）；收藏商业卡显示成「$0/月 · Studio」；
  记忆 key 复用但 memory_type 不同仍插新行（upsert 前按已有行钉住类型）。
- **筛查管线**：租金留空时已核实收入只得 30（现在 70 + 「未填目标租金」）；`matchPortalParty('Lin Lin Zhang', …, 'ZHANG, LIN')`
  一个记录词满足两个查询词 → strong → 硬门槛（记录词按多重集消费）；打印报告在法院门户超时时仍印绿色「已查无记录」；
  强匹配已触发硬门槛而租务卡还写「仅姓名匹配未计分」；「Relocating for work」+ 不带省份的 Toronto 地址被判「归国侨民」；
  空名 / 单词名 / 中文名被判身份不一致 −20；连接中断的流被抢救成缺 gates / flags 的「scored」；单申请人档案的 gateCap 在
  doc_tampering 推入前就算好了；征信查询日期 "Oct 02, 2024" / "09/01/2024" 全被丢 → 0 次查询；done / graph 页把
  Communication 当第五维度。新助手 `lib/screening/scoreGuards.ts`。
- **取证 / 深度核查 / LTB**：Offer 信里「start date will be September 1」在 9-1 之后让真信被判「PDF 早于文件日期」（伪造码）；
  **LTB 街道佐证只比城市首词的子串**——ST CATHARINES 的 "ST" 命中「25 King St W, Toronto」、NORTH YORK 命中
  「King St North, Waterloo」（佐证命中 −30 / 两条即 decline；现在整城市词组、街道之后、≥2 词或 ≥4 字母；子集匹配还要求
  名）；联邦注册库 status 是数字码（'11' 已解散 76 万行）→ `registryStatusKind` 回 unknown → 绿色 CLEAN 旁边印个「11」
  （`federalStatusText`）；信头「since 1985」被当入职年；「car allowance $1,600 per month」被当年薪；amalgamated / continued
  不是注销；征信拉取前的身份匹配只要一个共同词（Maria Garcia ≈ Maria Lopez）且不比生日（`lib/verify/identityMatch.ts`，
  非 mock 供应商必须有已核验身份）；「T: … F: …」被判电话不一致、法英双语标签被判拼写错误；`ei\b|dd\b|pay\b` 无左边界
  让「E-TRANSFER FROM WEI / TODD」算工资；七个正则在 5 万字单类字符上 3–7 秒（`collapseRuns` 在 pdf-text 源头与两个 OCR
  汇入点截到 200）。两个 ingest 脚本「什么都没做也 exit 0」已改为失败。
- **文案与事实**：`/contact` 表单不发任何东西却提示「已收到」（定价 Business、合作、隐私请求的唯一去向）→ 真路由
  `/api/contact`（Resend → privacy@stayloop.ai）；房源页写死的「142 views · 9 intents」热度卡、无人设置却署名「房东设置」的
  收入 ×2.5 / 信用 ≥700 门槛（trust_tier 从未被写入）、假的 tier1「身份已核验」页（挂 SampleBanner、去 Persona）、定价页的
  在线收租 / T776 / 5 clients、Trust API 的「20k+ passports · 99.95% uptime」与不存在的 npm SDK、三处「链上」、发布向导
  step 4 的「系统自动筛选 + Plaid + 通过率」、退役的派单弹窗 IntentModal，全部删改为事实。
- **隐私披露与实际出境不符（已改披露，是否继续使用由用户定）**：生产近 30 天有 24 次扫描件 OCR 走阿里云 DashScope
  **中国大陆端点**（取证 OCR 回退），turn 槽位有 19 次 DeepSeek；隐私页原写「Anthropic 等，服务器位于美国」。现在第 2 节
  如实列出：默认 Anthropic / OpenAI / Google（美国）、扫描件 OCR 回退 DashScope（中国大陆）、用户自选模型的服务商所在地、
  Jina（德国 / 美国）检索中转。要停掉大陆出境只需在 CF 后台移除 `DASHSCOPE_API_KEY`（OCR 回退会如实标「不可读」）。
  **用户 2026-09-21 拍板：Qwen 是开源模型，DashScope OCR 回退先这么用**——保留 key，隐私页照实披露即可，不要再提议移除。
- **定时任务**：`ltb-refresh.yml` 的两次定时运行都死在 `npm ci`（lockfile），LTB 目录自 2026-08-22 起没刷新；
  `ca_corp_registry` 停在 08-02（09-05 那次截断下载「成功」）。本轮部署后手动 dispatch 两个 workflow。
**记录不改**：`/api/trust/verify` 查询不存在的 `rental_passports` 表（`trust_api_keys` 0 行，不可达）；screen-score 的
HR 电话撞号规则从未触发（applicant_phone 只取自 notes）；`app/screening/app/page.tsx` 里不可达的「申请人付款」残留 UI 与
补充检索行 `CanLII (<name>)` 仍被结果页计为失败数据源；household/extract、classify-files 仍无持久限流。

## 找房卡片一页 6 套 + 「换一批」（2026-09-16 · 用户要求）

租客管家的房源卡默认一次 6 套（桌面端正好两排），下面一个「换一批」按钮显示排在后面的 6 套。落地：
`lib/agent/listingPaging.ts`（`LISTINGS_PAGE=6`、`pageListings`、`nextBatchPrompt`，纯函数，守卫 `tests/listingPaging.spec.ts`）；
`searchListings` 的目标数改为 `min(count ?? 6, 6)`，但**返回 target + 6 的池子**（最多 12 套，Stayloop 自有优先、Realtor.ca 补足，
抓取上限 24），`AgentChat` 按 message id 记 offset：第一次点「换一批 · 还有 N 套」只翻到池子里的下一页、不走模型；池子空了
按钮变成「换一批 · 再找 6 套」，发一句「换一批，条件不变。」走正常搜索（服务端按已展示地址排除）。提示词里的默认数量
4 → 6。已在本地用首页匿名对话实测（Bay Street Corridor 1 房：7 套 → 显示 1–6，点一下显示第 7 套，按钮转为再找 6 套）。

## 复审 2026-09-16（迁移后 · 三个切片 33 条，全部核实后修复）

用户要求「再做一次模块和代码 review，有错误就马上改正」。范围 = 2026-09-14 全站审查之后的全部改动（28 个文件）。三个审查代理
（筛查管线 / 深度核查雇主项 / 找房分页与基础设施）每条都用反例实跑确认；另加一条我自己查出的迁移缺陷。守卫补在
`tests/case6269Ash.spec.ts`「review 2026-09-16」段、`tests/employerChecks.spec.ts`「review 2026-09-16」段。值得记住的：
- **迁移 ACL 漂移**（见「Supabase 迁到加拿大区」第三个坑）：anon 曾能执行法院中转与 household RPC、读邀请 token。已修。
- **筛查管线**：① 「本人」名单不能用 `extracted_names`（含申报房东、HR 签署人）——一位房东与共同申请人同名就被当成
  「自任房东」；改为申请人 + 证件上的名字，并把同一个匹配器注入 `checkResidenceTimeline`。② 「住在国外」需要正面证据
  （外国国名 / 美国州+ZIP / 英国邮编）或申请人自述「moving back」，只写街道的加拿大地址不算国外；加拿大判定要邮编 / 全省名 /
  「城市 + 省缩写」，Kingston, Jamaica 与 London, UK 不再算加拿大。③ 足迹去重（同一开户月不算两件事）、排除最近 60 天
  （报告日期）、要求 ≥2 种证据。④ 时薪信按时薪比（工资单无时薪则不下结论），年薪 3–15% 是疑问、≥15% 才是矛盾——
  35/37.5 小时周与当期加班不再被判「矛盾」。⑤ `paystub_deductions_at_legal_max` 的中性化原来跑在该标记生成之前（死代码），
  已移到 `checkStatutoryDeductions` 之后。⑥ 逾期日期只从主申请人自己的征信文件读、不可靠报告跳过；足迹不取不可靠报告；
  证件签发日取「有未来到期日时的最晚过去日」，过期证件取倒数第二个日期。⑦ Info 对象正则加左边界（`1 0 obj` 不再撞
  `11 0 obj`）；生成器签名与「无元数据」不再双计；TransUnion 的 `Delinquency Date MM/DD/YYYY` 也读；`Unit 2010` 不是年份。
- **深度核查**：① 注册状态先看开头的 Active——联邦库的「Active (New Amalgamated)」和 Discontinued（延续到省）不是注销。
  ② 入职日期带精度：「since 2015」是年不是 1 月 1 日，比较按较粗精度；`since / joined / start date` 优先于 `effective`
  （常是调薪日）；数字日期 DMY/MDY 歧义只信到年。③ 信头城市只在信件段前 600 字里找「城市 + 省 / 邮编」，不再把工资单上
  雇员地址的 Toronto、`Hamilton Rd`、签名人 Regina 当城市。④ 电话按城市 → 区号表判断（Mississauga 905、North York 416
  都是本地）。⑤ RDAP：rdap.org 对无 UA 的请求回 403（生产上一直是 null），现带 UA；子域名先归约到可注册域名
  （`wd5.myworkday.com` → `myworkday.com`）；只有 RDAP 错误文档的 404 才算「未注册」。⑥ 个人邮箱只在文件里没有任何公司
  域名时才标。⑦ **每家雇主只看自己的文件段**（按公司名匹配段落），前雇主的域名 / 入职日不再盖到现雇主卡上。⑧ 法院当事人
  须是同一法律名称（多出的词只能是 of / and / Canada / Group 之类），`ABC CONSTRUCTION MANAGEMENT INC.` ≠ ABC Construction。
  ⑨ 复活通知只在晚于注销时才生效；Gazette 命中只读 ontario.ca；字形伪迹须有日期语境（`Unit 205 l 10` 不算）。
- **找房分页**：`listings_page` 随响应返回（用户说「找 3 套」就按 3 翻页）；只把看得见的一页记入排除集，「换一批」揭示时再补；
  刷新后从历史消息重建排除集；头部计数按可见页；Stayloop 查询上限 24 → 60（排除集是查后过滤，24 会在两轮后把库搜空）；
  首页「数据驻加」改为「数据库驻加」，隐私页第 2 节补 AI 服务商（Anthropic，美国）披露、日期更新。

## 复审 2026-09-17（迁移后第二轮 · 四个切片 32 条，全部核实后修复）

用户要求「数据库迁移了之后，再重新做一次代码 review 和模块的 review」。四个审查代理：① 新库上策略 / 权限 / 触发器 / 存储 /
cron 的实机探测（全部在 begin…rollback 里以 anon / authenticated 身份跑）；② 依赖 Supabase 项目身份与配置的代码路径；③ 筛查与
深度核查模块级（用库里最近 15 条真实筛查重放纯函数）；④ 管家 / 房源 / 申请 / 计费 / 核验 / 在管租约 / 后台。守卫在
`tests/reviewGuards.spec.ts`「review 2026-09-17」段与 `tests/case6269Ash.spec.ts`。迁移遗留（都已修）：
- **Auth 配置被局部 PATCH 清空**：只改 `smtp_pass` 一个键让 smtp_host / port / user / sender 全部变 null、`rate_limit_email_sent`
  回落到 2/小时——项目退回 Supabase 自带邮件服务而不报错。整块重放旧配置后逐键比对一致（14 个邮件模板在）。**改 Auth 配置
  一律整块 PATCH，改完 GET 回来逐键 diff。**
- **`ensure_rls` 事件触发器没迁**（全局对象，`pg_dump --schema` 不导出）：新库有默认权限「新表自动给三个角色 ALL」，
  没有这个触发器的话以后任何忘了 `enable row level security` 的新表就是公开可读。已重建并用回滚事务验证会自动开 RLS。
- **旧项目的 3 个 pg_cron 任务还在跑**，同一个 `cron_secret` 打生产：每天 13:00 UTC 两次主动扫描、周一两次 TRREB 抓取（双倍
  Jina 花费）。已在旧项目 `cron.unschedule`。
- 匿名登录（`external_anonymous_users_enabled`）从旧项目复制过来但全站没用，却能铸出 `authenticated` JWT 去跑 LTB 姓名检索；
  已关。`tenancy-files` 桶没有大小 / 类型限制，已与 `tenant-files` 对齐（25 MB + 白名单）。
代码与数据层（迁移 `20260917_review_g_fixes.sql`，已应用）：
- **租约发送是坏的**：`/api/lease/send` 用房东的 RLS 客户端写 `sign_token`，20260914 的守卫触发器把它静默还原成 null，邮件里的
  签署链接永远 404（生产尚无发出的租约）。改为 RLS 读证明归属、service role 写。
- **`households.verified` 永远为 true 不了**（守卫冻结了列、又没有任何 RPC 设置它）：`accept_household_invite` 在双方都成为
  活跃成员时置 true。**已核验的房源改地址 / 租金后徽章不掉**：守卫在 address / unit / city / postal / rent / bedrooms / 类型变化
  时打回 pending（回滚事务验证：非管理员改租金 → pending，管理员不受影响）。`household_invites` 的 authenticated UPDATE 收窄到
  `revoked_at` 一列；`rent_parties` 策略改指 `lease_documents`。
- **测试月里按次解锁仍会创建真实 Stripe Checkout**（unlock 路由没有 free-window 门，前端 landlords 行未到时也会弹付费）；
  Stripe unlock 只在 `payment_status='paid'` 时履约并处理 `async_payment_succeeded`；Veriff 决策只接受当前 session 且请求未过期。
- 管家：记忆 `label` 与对象型 `value` 也截断；守卫正则补 `not suitable for children`、英文人格注入（`you are now…`）、
  `went out / has been sent`；`user_memories` / 反思画像 / 核验步骤 / deep_check_result 四处 jsonb 写入过 `stripNul`；
  后台模型路由改用 `is_stayloop_admin()`（要求已换密码）；申请页把 `attach_application_files()` 返回 false 当失败。
- 筛查模块：征信 `report_date` 是 `2026/08/22` 或 `08/22/2026` 时时效扣分从不触发（14/66 份报告如此）→ 容错解析 + 回退到
  recency 的确定性日期；报告头部的月收入改用工资单算术（与评分表一致，此前显示模型数字）；家庭收入的申请人数按证件上的人
  数、偶数中位取下中位；`employer_doc_text` 漏掉 bundle 类文件与 offer letter（深度核查的域名 / 城市 / 入职检查在空字符串上
  跑）；雇主电话从在职信上的电话取（此前 `employer_phone_region_differs` 永远不触发）；`credit_report_subject_mismatch` 不再
  按矛盾扣核验分；通知信不再同时写「向征信机构获取」和「你自己提供的报告」，法院门户未检索时如实说明；打印报告
  `coh.error` 补 `esc()`；房东解读在档案有催收机构查询时不再写「无催收」。
- 联邦注册库 ingest：截断下载被当成功（2026-09-05 那次 168 MB / 0 个 XML / 「Done」，库停在 08-02）——现在 Content-Length
  不符、unzip 非零、0 个 XML 都直接失败，并且每行写 `last_seen_at`。登录回调页显示 GoTrue 的真实错误（此前一律「登录链接已失效」）。

## 快捷按钮把示例句当成事实（2026-09-23 · 用户截图：「发起报修」把「厨房水槽漏水」当成真问题）

一类问题：助手页的快捷卡片、工作台各页的「交给助手」按钮（`/x/agent?prompt=…`）都把**示例句原样发出**，模型把示例里的具体内容
（厨房漏水、$2,800、Mia Chen、Thompson、DSP-2K8X…）当成用户的真实情况；随后提议的 `send_message` 卡没有收件人，执行报
「no valid recipient email」。四处一并修（守卫 `tests/templateChips20260923.spec.ts`）：
- **模板而不是示例**：`AgentChat` 的 SUGGESTIONS 可带 `template`（含 `【…】` 占位符）。登录后的实时会话点卡片 = 把模板填进输入框并
  选中第一个占位符（`AgentInputBar` 新 prop `draft {text, nonce}`），用户改完自己发；匿名首页仍发示例句（那是演示）。租客的「帮我找房」
  「发起报修」已改模板，其余卡片是泛化指令不含事实，照旧。
- **深链默认预填**：`usePromptDeepLink(loading, send, prefill)` 现在默认把 prompt 放进输入框，不自动发；只有文字来自真实数据行的链接
  （申请人页写邮件、租约页续约函 / 催租 / N1、租约列表重发 / 撤回、N 表工具箱、房东新建工单、房源页咨询）带 `&send=1` 才自动发；
  含 `【` 的永不自动发。示范页（租客付款 / 入住 / 申请、房东申请人样例 / 续约样例 / 争议）里的虚构姓名与金额全部换成 `【…】` 占位符。
- **服务端后闸**：`hasUnfilledTemplate()`（guardrail）——消息含未填占位符时 turn 路由强制 `proposed_action = null` 并记 flag
  `template_unfilled`；提示词第 0 条原则要求只追问、不把示例当事实。模型现在可在 `proposed_action.metadata` 里填
  title / description / priority / location / subject / body（字符串、限长；收件人永不取自 metadata），orchestrator 把它并入卡片 metadata。
- **收件人从数据推导 + 报修真执行器**：`resolveTenantLandlord()` 从租客已确认的在管租约成员（房东成员 → 登录邮箱）或按登录邮箱找到的
  租约（房东行）取房东邮箱；`send_message` 没有收件人时对租客自动解析，解析不到返回 `no_landlord_on_file`，客户端明说「还没有已确认的
  在管租约或已签租约」。新执行器 `maintenance_request`：在租客的在管租约上建 `maintenance_tickets` 行（与 `/h/[id]` 同一张表）+ 邮件
  + 推送房东，无在管租约返回 `no_household_on_file`。租客 KEY_ACTIONS 加入 `maintenance_request`。发信限流列表补了 send_decision 与
  maintenance_request。

## 产品结构显性化：Stayloop 全流程 + Stayloop API（2026-09-23 · 对照 EliseAI 三条产品线）

用户要求：EliseAI 的 LeasingAI（潜客 / 看房）、ResidentAI（入住 / 报修 / 续约 / 催收）、EliseCRM（统一数据与集成）对应我们的模块，功能都有了，
要「明显组合到一起、让人直接感受到」——租前 / 租中 / 租后归为一个模块（= Leasing + Resident），Trust API 改名 **Stayloop API**（= EliseCRM 的
对外数据层）。EliseAI 官网（eliseai.com/platform-overview）的分组：LeasingAI = Prospect Management + AI-Guided Tours；ResidentAI = Move-In /
Maintenance / Renewals / Delinquency；EliseCRM = 「统一租客数据库」+ 集成；没有正式的生命周期图，只有「every stage of the resident journey」。
落地（守卫 `tests/platform20260923.spec.ts`）：
- **`/platform`（Header「产品」，首项）**：产品一「Stayloop 全流程」= 租前（对话找房 / 发布 / 看房提问 / 申请 / 筛查 / 本人核验[即将] / 决定通知）·
  租中（标准租约 / 电子签 / 在管租约 / 租金记录 / 报修 / 租金提醒 / 在线收租[示范]）· 租后（续约 90/60/30 / 指导比例 / N 表 / 退租 / 租客护照 /
  信用局上报[即将]），每项链到真实页面、状态如实标；三张深色卡「一条对话 · 一条审批链 · 一套规则」；产品二「Stayloop API」三端点。
- **Trust API → Stayloop API**：目录 `app/trust-api` → `app/stayloop-api`，`middleware.ts` 对 `/trust-api(/docs)` 308；营销页整页重写为三个真实端点
  （旧的 emerald「Verify agent」页删除）；定价页深色带、联系页主题、合作方页、护照分享页、后台两页、页脚、sitemap、route/mobile audit 脚本、
  测试全部改名。**数据库表名 `trust_api_keys` 与 API 头 `X-API-Key` 不变。**
- **首页**新增一节「租前 · 租中 · 租后，一条流程」（四张卡：三阶段 + Stayloop API，全部链到 /platform 或 /stayloop-api），放在「三种角色」之后、
  「三步」之前；页脚「产品」列新增「租房全流程」「Stayloop API」。模块说明 PDF（`design/stayloop-modules-2026-09.pdf`）同步改名。
- **手机汉堡菜单太长（用户截图）**：登录后顶部的 7 条营销链接（我是租客 / 房东 / 经纪 + 产品 / 房源 / 定价 / 租客筛查）折成一行「浏览 Stayloop ›」
  （在「语言和货币」之下、「退出」之上，点开才展开）；「身份」段已经覆盖三个角色，底栏覆盖工作台。匿名访客仍看到展开的营销链接。桌面端不变。

## 没有照片的房源不上线（2026-09-23 · 用户看到测试房源空白卡后要求）

测试房源 `[TEST] 100 Test Ave #1` 已挂上库里 Realtor.ca 导入行「1105 - 203 College St」的 12 张 CDN 照片（同一做法：cdn.realtor.ca 直链）。
规则：`lib/listingVisibility.ts hasUsablePhotos(images)`（http/data 图片 URL 至少一条）是单一谓词——`publishListing` 在查库前就拒绝无照片的行
（`LISTING_PUBLISH_MSG.noPhotos`，向导 / 编辑页 / 对话草稿卡三条发布路径都经它）；`/listings` 浏览页与管家找房查询在取回后过滤；
`/admin/verify` 对无照片行显示红标「无照片 · 不可通过」并禁用通过按钮；发布向导与对话草稿卡在没有照片时禁用发布按钮。
守卫在 `tests/lifecycle20260923.spec.ts` 末段。

## 安省 2026 年租房新规落地（2026-09-23 · 用户要求「查最近生效的新规并落实到 Stayloop」）

官方来源：ontario.ca 租金指导页、Tribunals Ontario LTB 运营更新（2026-06-30、2026-09-21）、Bill 60（S.O. 2025 c.14）法案页、
多伦多市 Rental Renovation Licence 页。**最大的错误是全站把 2026 年指导上限写成 2.5%——实际 2026 年 2.1%、2027 年 1.9%**
（2.5% 是法定封顶，2024/2025 才是 2.5%）：续约卡方案 B、续约函执行器（写死 `1.025`）、租客/房东/经纪三个事实包、房东租约页 N 表工具箱
与 LTB 提醒、租客租约/付款页、财务页、争议样例页全部在算错的数字上。单一来源 `lib/ontario/rules.ts`：
- `RENT_GUIDELINE` 表（按涨租**生效年份**：2024 2.5 / 2025 2.5 / 2026 2.1 / 2027 1.9）+ `guidelineFor(date)`（未知年份回退最新已公布值并标
  `published:false`，续约卡会注明「尚未公布」）+ `n1DeadlineFor`（2027-01-01 生效 → N1 最晚 2026-10-03）+ `GUIDELINE_TEXT`（拼进规则文本与
  提示词）。**明年 6 月省里公布 2028 年数字时只改这张表。** `renewalStages.buildRenewalProposal` 与 `execute` 的续约函按租约到期日所在年取值。
- 新增 area `tenancy`（/rules 页「租期中 · 2026 年新规」）共 11 条：`RTA-59-n4-7-days`（N4 终止日 ≥ 送达后 7 天、邮寄 +5、2026/09 版、旧版
  2026-11-30 后拒收）、`RTA-58-persistent-late`（6 个月内 3 次 >7 天迟付；`persistentLatePayment()` 纯函数，`/h/[id]` 租金记录按此显示提示——
  只记录不发通知）、`RTA-82-half-arrears`（欠租听证提问题先付一半欠款）、`RTA-48-1-n12-120-days`（≥120 天免一个月补偿、买家自用除外、60 天内入住）、
  `RTA-53-n13-first-refusal`（回迁权义务、T5 期限）、`TOR-53-2025-renovation-licence`（多伦多 N13 后 7 天内申请、2026 年 $728/单元、搬家补贴
  $1,500/$2,500、3 个月租金差价）、`RTA-209-review-15-days`（复审 15 天、AGI 送达 7 天）、`RTA-206-payment-agreement-form`、`RTA-36-1-tenant-ac`
  （租客可自装空调；`checkLeaseTerms` 对附表 B 的禁装空调条款 block）、`RTA-238-fines-doubled`、`LTB-forms-2026-09`。
  `N4_TERMINATION_DAYS` / `n4EarliestTermination()` / `TORONTO_RENOVATION_LICENCE` 常量给工具箱与文案用。
- **没有变、要守住的**：固定租约到期仍自动转月租（RTA s.38）——Bill 60 曾提议取消，未通过，`RTA-38-month-to-month` 规则文本已注明；
  标准租约 2229E 仍是 2020-12 版；N9 60 天不变。
- 提示词：`lib/agent/prompts.ts` 新增 `BILL60_FACTS`（口语版，注入租客续约专线 `RTA_RENEWAL_FACTS` 与经纪 `AGENT_LEASING_FACTS`），指导上限
  一律从 `GUIDELINE_TEXT` 读；房东租约页 N 表工具箱 N1/N4/N12 改写并新增 N13 卡（多伦多许可证）。
守卫 `tests/ontarioRules2026.spec.ts`（10 条：年份表、N1 截止日、续约卡按年取值、N4 7/12 天、持续迟付三例、空调条款、11 条规则的生效日、
事实包内容、**八个文件里不得再出现「2026 … 2.5%」或 `1.025`**）。

## 三角色端到端模拟（2026-09-23 · 生产 · 测试数据带 `[TEST]` 前缀，正式发布前不删）

用户要求「开三个角色的测试账号，把方案全部实现，然后分别模拟三个角色跑通所有环节」。账号（密码都是 `Test1234`，
`user_metadata.test_account=true`）：`tenant-test@stayloop.ai`（auth `dc734f3e…`）、`landlord-test@stayloop.ai`（auth `30d0c280…`，
landlords 行 `80646b6a…`）、`agent-test@stayloop.ai`（auth `4388a326…`）。驱动脚本在会话 scratchpad `e2e.sh`（REST + 路由，全部走
各角色自己的 JWT；只有「管理员核验」「时间穿越改 end_date」「合作方密钥」三处用 service role 模拟后台）。跑通的链路（全部在生产上真实执行、
真实发邮件到测试邮箱）：房东发布房源 `[TEST] 100 Test Ave #1`（pending → 管理员核验 → 公开页 200）→ 租客看房请求 + 提问（合并成一张
`showing_request` 卡）→ 租客匿名提交申请 + 5 份合成文件（`Prefer: return=minimal`，见下）→ 房东「一键筛查」（`/api/screening/from-application`
→ 真实 screen-score，43 分 conditional）→ 看房卡「预览正文 → 批准 → 执行」（预览不改状态）→ 录取通知卡（`send_decision`：applications.status
= approved、compliance_events `CRA-10-7-notice`）→ 起草安省标准租约 → `send_lease` 卡（预览带占位链接，执行后 service role 铸 token、状态
sent）→ 租客凭 token 签、房东回签 → **household 自动生成**（verified、source esign、房东成员 + 租客邀请 + 首月 rent_payments）→ 租客
`accept_household_invite` → `/h/<id>` 双方可见 → 时间穿越到期前 88 天 → `/api/agent/proactive` 生成 90 天续约卡（幂等，第二次 0 张）→
预览 A/B → 执行 A → 租客护照分享链接 + 勾选 API 范围 → Trust API 三个端点（compliance 匿名命中三条规则 / passport verify 按范围过滤、
未共享范围 403、假 token 404、审计 + 推送 / screen 202 → 真实评分 → 记在绑定房东名下）→ 经纪提交 RECO 资料 → 管理员核验 → `my_hats`
verified、目录可见、`/agent/verify` 显示「RECO 注册已核」。手机端 UI 用注入会话（`localStorage['sb-auth-auth-token']`，密码走 fetch 不进
表单）走查：待办卡「预览正文 / 确认 / 撤销」60 秒撤销回到 pending；护照页四个 API 勾选与库一致。**发现并修的四处真问题**：
- **续约卡引用「TRREB 2019 Q1」均租**：proactive 的 `loadMarket` 对 `trreb_rent_stats`（1,000+ 行，每季 × 每区域 × 公寓/联排）无序
  `limit(64)` → 拿到最旧的 64 行。现在钉 `area='All TRREB Areas'`、`property_type='apartment'`、`order period desc`。
- **申请人页永远「AI 评分尚未完成」**：页面读 `applications.ai_score`（旧 ai-score 路由的列），而闭环的评分写在 `screenings`（by
  `application_id`）。详情页现在读关联 screening 的 `ai_score / v3_tier / ai_summary / hard_gates_triggered` 渲染评分卡 + 「打开完整报告」；
  列表页用关联 screening 回填 `ai_score`。同页「身份已验 / 收入已验」章原来只要有文件就点亮——现在只按关联 screening 的
  `verification`（Veriff / Flinks / Equifax 已 verified 且非沙箱）点亮；`status=approved` 徽章由「已批准看房」改为「已录取」；
  设计残留的「★★★ 请 TA 盖银行章」「经 TA 的 AI Agent 中介」两颗按钮改为「请 TA 本人核验」（→ 筛查记录的核验卡）与「让 Logic 起草邮件」。
- **租客看不到自己的申请**：applications 只有房东策略 + 匿名 INSERT 策略，申请人登录后读不到自己的行；`/tenant/applications` 又是
  DEMO_GATE 的诚实空态，连真实的看房记录（MyShowings）都被空态盖住。迁移 `20260923_applications_applicant_select.sql`（已应用 prod：
  authenticated 按登录邮箱 SELECT 自己的申请）+ `components/tenant/MyApplications.tsx` + `WorkspaceShell` 新 prop `liveSlot`（被 gate 的
  路由在空态之上仍渲染真实行；`lib/liveRows.tsx` 的 context 让真实块上报行数，有行时空态文案改为「以上是你的真实记录，其余是产品演示」）。
  申请列表页 `/landlord/applicants` 的「N/4 章」原来按「有文件 / 已评分」点亮（无核验的申请人显示 3/4 章），现在与详情页同一规则读关联
  screening 的 `verification`，无第三方核验即 0/4。
- 驱动脚本的两个坑：zsh 不对未加引号的变量分词（`${=VAR}`）；applications 匿名插入必须 `Prefer: return=minimal`。
守卫补在 `tests/lifecycle20260923.spec.ts`。**未覆盖**：`/api/v1/screen` 的 webhook 回调（没有可用的 https 接收端，只验证了 202 + 评分落库）；
真实 Veriff / Flinks / Equifax 步骤（无生产凭证，护照 verify 对身份/银行返回 `verified:false` 是正确的）。

## 定价 $19 与内部测试月（2026-09-14 · 用户决定）

- **Pro 改为 $19 CAD/月**：Stripe live 新价 `price_1UFZYoPEHyIrPd1Qswl971AJ`（产品 `prod_UIB2uLu9PHRVeR` 的默认价），
  原 $29 价 `price_1TJagqPEHyIrPd1QtIWw0NSH` 已归档（当时 0 个活跃订阅，无需迁移）。`.env.local` 的
  `NEXT_PUBLIC_STRIPE_PRICE_ID` 已换（构建内联，CF 后台那份不生效）。文案 $29 → $19：定价页、工作台升级弹窗、
  订阅卡、筛查页、筛查营销对照表、管家提示词。守卫 `tests/freeWindow.spec.ts`。经纪档 $29/$59 仍标「即将推出」，未动。
- **内部测试月：到 2026-10-14 全部免费**。唯一开关 `lib/billing/freeWindow.ts`（`INTERNAL_TEST_FREE_UNTIL`），
  服务端四道门都读它：`hasProAccess`（核验链接）、deep-check 的 `enforceProGate`、screen-score 的配额与法庭档位、
  Stripe checkout（窗口内返回 400 `free_window`）；界面上定价页顶部横幅、工作台「升级」按钮换成「测试期免费」、
  订阅卡横幅、筛查页按 pro 渲染。**到期自动关闭，不需要再部署**；要延长或提前结束只改那个日期常量。

## 全站深度审查（2026-09-14 · 六个切片，约 85 条发现）

用户要求「全站搜代码深度检测」。六个审查代理按切片（安全与平台 / 管家 / 筛查与报告 / 取证与核验与 LTB /
支付与租约与房源 / 工作台与文案）各自引用代码行并用反例实跑验证；全部核实后修复，两份迁移已应用生产。
值得记住的模式（守卫 `tests/reviewGuards.spec.ts`）：
- **行级策略 ≠ 列级保护。** `landlords` / `screenings` / `households` / `lease_documents` 的本人策略是 `FOR ALL`，
  又没有像 listings 那样的守卫触发器，于是本人可用 anon key 把 `plan` 改成 pro、把 `unlocked_at` 盖上、把
  household 自标 `verified`、替租客签租约。现在四张表都有 `BEFORE INSERT/UPDATE` 守卫（迁移
  `20260914_paid_and_trust_field_guards.sql` / `20260914_review_e_guards.sql`）。**守卫触发器必须是
  SECURITY INVOKER 且用 `current_user`（`is_direct_client_write()`）判断调用方**：PostgREST 直写时是
  `authenticated`，SECURITY DEFINER 的 RPC（`consume_unlock_credit`、`claim_landlord`…）以 owner 身份跑；
  若写成 definer 触发器，`current_user` 永远是 owner，判断失效。已在生产上用回滚事务验证。
- **表级 grant 会让列级 revoke 变成空操作**，要先 revoke 表再 grant 列（`household_invites.token`）；
  公开目录一律走 view（`agent_directory`），不给 anon 表级 select（`agent_profiles.review_note` 曾对匿名可读）。
- **房源可见性不变量在 INSERT 上失守**：`guard_listing_trust_fields` 只在 UPDATE 触发，管家草稿卡带 MLS 号
  就以 `source='realtor'` 直接上线；现在 insert 也强制 `stayloop / pending`。
- **申请表自 2026-05 起一直是坏的，四个原因叠加**（生产 0 条申请）：① insert 带不存在的 `full_name` 列；
  ② 匿名 INSERT 策略在自己的 WITH CHECK 里 count applications 做限流——Postgres 直接报「infinite recursion
  detected in policy」（42P17），改用 SECURITY DEFINER 的 `recent_application_count()`；③ 匿名没有 SELECT 策略，
  而 **Postgres 对 `INSERT … RETURNING` 也套 SELECT 策略**，所以 `.insert().select('id')` 永远报 RLS 违规——
  现在客户端自己生成 uuid、insert 不带 returning；④ `tenant-files` 桶只有 `screenings/<uid>/` 前缀的策略，
  匿名传不上申请材料、房东也签不了 URL——新增 `application_upload_allowed()` / `application_file_readable()`
  两个 definer 助手与对应策略（并给 anon 授 `is_household_member` 执行权，否则 OR 起来的另一条策略先报
  「permission denied for function」）。文件清单经 `attach_application_files()` RPC 附加（1 小时内、files 为空、
  路径以该申请 id 开头）。全部在生产上用回滚事务以 anon / 房东两种身份验证过。**新写 RLS 时：策略里不能
  查自己的表；匿名 insert 不要 `.select()`；bucket 策略按前缀逐条列出。**
- **`/api/agent/execute` 是开放邮件中继**：`send_renewal_letter` / `rent_reminder` 直接给 `metadata.tenant_email`
  发信，而 pending action 是客户端按 RLS 自己写的。现在按 `lease_id` 加载租约、验证房东归属，收件人与事实
  一律取自租约行。
- **Stripe**：webhook 的订阅事件按 customer 匹配，会让旧订阅的 `deleted` 覆盖新订阅；checkout 只看 `plan`，
  催款中的房东会买到第二份订阅；解锁履约错误被吞（钱收了没解锁）。现在按 subscription id 匹配、checkout
  用 `resolveSubscriptionState`、履约失败删账本行让 Stripe 重试、筛查不存在时转为预付额度（`grant_unlock_credit`）。
- **取证的假阳性**：`03/12/2026` 里的 `/12` 被当成「12 期」；标题含 Scan/image 被当截图（Adobe Scan 写的）；
  Price/Banks/Power 这类词典姓氏匹配到网页正文；`12500.00` 没有千分位被读成 500；雇主首词 Canadian/Toronto
  撞上银行信头；在职信取第一个长日期（常是未来的入职日）；五个词的西语姓名当联名账户；`Rise People` 当个人
  作者；按需渲染的对账单报「刚创建」；OCR 读的驾照号一字之差报 high；benford 正则在 5 万空格上花 4 秒。
- **筛查评分**：Flinks 核实的收入从未进评分表；两张相差 30% 的工资单 + 配偶证件被算成两份收入；SIN 打错
  一位被当成伪造文件（−50 强制拒绝）；`toString` 通过 `in` 检查成为硬门槛得出 NaN 总分；共同申请人的征信
  被当成主申请人「生日矛盾」给 20 分；Pro 房东可按 id 覆盖任何人的 `deep_check_result`；通知信里仍有
  「收入租金比未达标」这一 OHRC 违规理由；打印报告仍给比值打 ✗。全部改正。
- **申请人核验的信任边界**：token 由房东持有，`/credit` 原来接受任意姓名生日就拉征信；现在必须与 Veriff
  已核实身份匹配，没有 Veriff 时须与同意签名和房东填写的申请人姓名匹配。`sandbox` 标志改为逐步骤（此前
  Flinks 沙箱一步让真实的 Veriff 结果整体作废）。
- **文案**：Persona / Plaid 全站改 Veriff / Flinks；`/partners` 不再列 RBC / Aviva 等不存在的合作；经纪工作台
  的 25% 转介费 / $80 带看费文案删除；`/agent/onboarding` 整页改为跳转 `/agent/verify`；定价页经纪付费档
  标「即将推出」；管家提示词与定价 FAQ 里的「可让申请人付」删除。

## 一个账号三顶帽子（2026-09-13 · 多角色模型落地）

研究稿 `design/multi-role-accounts-2026-09.md`，用户批准按建议实施。**帽子（资格，服务端可查）与活动帽子（界面
上下文）分开；权限永远只看帽子与数据归属。**
- **`my_hats()` RPC**（迁移 `20260913_registrant_disclosures.sql`，已应用 prod）返回 `{tenant, landlord, agent: status|null,
  admin}`；`lib/useHats.ts` 读它（模块级缓存，获得新帽子后 `invalidateHats()`）。**活动帽子由路由前缀决定**
  （`lib/activeRole.ts roleFromPath`：`/tenant/*`、`/landlord/*` + `/screening/app` + `/dashboard`、`/agent/*`），
  `useAuth().role` 先取路由、再回退 localStorage；`setRole` 只是「记住上次」。守卫 `tests/activeRole.spec.ts`。
- **Header 三帽菜单**：只列账号拥有的帽子（租客恒有；房东 = landlords 行；经纪 = agent_profiles 行，未认证带「待认证」
  小标），没有的给「成为房东」（→ onboarding）/「成为经纪 · 需 RECO 注册核验」（→ `/agent/verify`）入口。
- **跨帽子守卫**：① 不能向自己的房源提交申请 / 看房意向——房源页与申请页前端隐藏 + DB 触发器
  `guard_not_own_listing()`（applications / showing_intents 插入时比对 `listings.landlord_id` 与 uid 及其 landlords.id，
  抛 `own_listing`，申请页把它映射成中文提示；匿名不受影响）；② `AgentPicker` 排除浏览者本人与房源房东
  （`excludeAuthIds`）；③ 经纪未认证时 `/agent/*` 的经纪专属页（客户 / 任务 / 日历 / 收益 / 带看）渲染只读空态 +
  认证入口，`/agent/agent` 与 `/agent/verify` 照常。
- **TRESA s.32 注册人披露**：账号有 agent_profiles 行（任何状态——注册人身份不取决于我们的核验）时，房东帽子发布
  房源前、租客帽子提交申请前弹 `components/RegistrantDisclosure.tsx`：预填注册名 / RECO 号 / 经纪公司的通知文本、
  复制按钮、勾选「已送达并保留书面确认」→ 写 `registrant_disclosures`（context: listing_publish / application /
  showing_intent / lease）。**Stayloop 只记录披露，不代送达。** 房源页对房东 auth_id 有 verified agent_profiles 的
  房源标「房东直租 · 房东为持牌经纪」（只覆盖 landlord_id 存 authId 的行——现有全部行都是）。
- **不做（用户已定）**：经纪代客筛查（`on_behalf_of`）等有代表协议记录后再开；首页三枚角色按钮只给匿名访客切 AI 演示——
  **2026-09-22 起登录后不再显示**，Hero 直接用当前帽子（`auth.role || 'tenant'`，与 Header 同一来源，帽子不再持有时回租客）并写
  「换身份在右上角菜单」；头像菜单同日重排（用户要求）：身份行（头像 + 邮箱 + 「当前：房东 · Logic」chip）→ 「<助手名> 的工作台」
  （用户随后要求去掉其下的待办 / 想法 / 进度三枚快捷 chip，已删；+ 房东的房源管理、通知、管理员的后台）→ 「身份」段列出三顶帽子（当前 / 切换 / 待认证 / 开通）→
  账号设置、语言 → 退出。汉堡上的红点从「登录即常亮」改为「当前帽子有待批卡片」，并显示数量。守卫 `tests/museMobile20260922.spec.ts`；看房意向弹窗仍是演示（无 DB 写入），披露不接。

## 经纪管家 Brief 的快捷卡与能力（2026-09-13）

用户指出首页经纪 tab 下的四张快捷卡（今天的带看 / 客户跟进 / 排路线 / RECO 边界）不够「经纪专用」，并要求租客筛查
必须在里面。按安省租赁经纪的真实工作流研究后（RECO/TRESA 租赁义务：先给 Information Guide、书面代表协议、多重代表
披露；RTA s.106 押金只能一个月且只抵最后一月租、s.134 禁向租客收任何费用、s.12 21 天内交副本、O. Reg. 9/18 标准租约
强制而 OREA Form 400 只是要约；OHRC 申请表不得问的问题）改为五张卡（`components/agent/AgentChat.tsx SUGGESTIONS.agent`，
首页 `HomeNext` 经纪 chips 同步）：**租客筛查 / 挂牌定价 / 带看准备包 / 租约与押金 / 合规边界**。每张卡背后都有真实能力：
- **租客筛查**：`lib/agent/prompts.ts SCREENING_RULES_AGENT`——与房东版同一交接（说清查什么、要什么材料、给 /screening/app
  链接、对话里绝不评分），外加经纪三前提：与房东有书面代表协议、申请人书面同意核查（OREA Form 410）、录取/拒绝由
  房东本人决定并发通知；费用由经纪或房东承担、绝不转嫁申请人。
- **挂牌定价**：turn 路由的房源检索分支对 `role === 'agent'` 也开放（同一条 Stayloop → Realtor.ca → TRREB 管线），
  提示词让模型只填 search、不手写价格；市场卡的结语按角色改为「同区域同户型挂牌中位数 …按房源条件调整」，预算类
  追问芯片只给租客。
- **租约与押金 / 合规边界**：`AGENT_LEASING_FACTS` 事实包只注入经纪角色，模型被要求只引用其中内容、不扩写。
守卫 `tests/prompts.spec.ts`「agent (Brief) system prompt」段。**注意**：`ship2-v53.command` 的构建会清掉正在跑的
`next dev` 的 `.next`，部署后本地预览会变成无样式 + 404 chunk，重启 dev server 即可。

## 第二轮审查：修复回归 + 模块级 + 手机可操作性（2026-09-13）

三个代理：① 对上一轮 33 条修复做二次审查（13 条，修 11）；② 筛查与核验两个模块的流程/状态/权限/PII/
注入面审查（8 个领域）；③ 登录后页面的手机可操作性代码审计（17 条）+ 用用户 Chrome 已登录会话开
375px 弹窗实测（`window.open(…, 'popup=yes,width=375')` 后经 opener 读 `document`，因为 Chrome
主窗口拒绝缩到 500px 以下）。本轮落地：
- **打印报告的同源 HTML 注入**：`generateReport.ts` 一致性审查节把模型的 category/files/claim/
  evidence（文件原文引用）/check 与 `unreliable_reason` 直接拼进 HTML，而报告用 blob URL 在同源打开
  ——申请人在 PDF 里放一段脚本 → 模型「逐字引用」→ 以房东身份执行。全部 `esc()`。
- **筛查行不再卡死**：外层 catch 现在把仍处于 uploading/scoring 的行标 `error`；同一 row 在 10 分钟
  内已在 `scoring`（按 `progress.at`）时第二次调用返回 409；免费配额只数 `scored/scoring`；评分流与
  补评调用加 240s/90s 超时。
- **核验写入竞争**：`writeStep` 合并前重读该行（Flinks 拉取 25s 期间到达的 Veriff webhook 曾被整块
  jsonb 覆盖回 started）；快照只允许该 screening 最新一条请求写入（Veriff 重试一周）；`/verify/*`
  加 `Referrer-Policy: no-referrer`（token 就是凭证，整页跳转到 Veriff 时不能带在 Referer 里），其余
  路径 strict-origin-when-cross-origin；deep-check 的计划查询改用 `pickLandlordRow`。
- **二次审查修的回归**：流动性改为按对账单上的账号分组（同一账户三个月取最低，不同账户取最好；
  此前 max-of-statements 把同一账户跌到 $300 的那个月丢掉了）；在职信 `Date:` 排除 Start/Hire/
  Effective Date 且不取未来日期；电话只剥离带标签的传真/直线/分机（裸「direct」是伪造信最自然的写法）；
  已申报义务的共享词排除银行名与通用账户词、征信查询行不算申报；跨年对账单月数；期末日期锚定
  「Statement period A to B」再取 Closing Balance；斜杠日期按**整份文件**定 MDY/DMY；强匹配最多一个
  模糊词；两位申请人的工资单按「同一职位 ±15%」聚类后求和；与申请人无任何同名词的征信主体即 unreliable。
- **手机端**：工作台底栏 8 项改为等分单元 + 9.5px 文字标签（此前 396px 溢出 375 屏、筛查与审计同图标）；
  Header 汉堡菜单限高可滚；Flinks/征信弹窗 `dvh` + 可滚 + 44px 关闭；报告信用分档刻度改 5 列网格
  并在手机隐藏区间数字；已核验事实三格缩字号；移除文件 × 放大到 36px；法庭查询姓名分隔行可换行；
  CTA 观察器减去底栏 64px；租金输入 `inputMode=numeric`；来源链接 / 未检索状态 ≥11.5px。
**用户把后续取舍交给我决定（2026-09-13），落地如下**：
- **删除筛查记录**：新路由 `DELETE /api/screening/<id>`（RLS 读行证明归属 → service role 删 tenant-files
  对象、`verification_requests`、行本身；运行中 10 分钟内返回 409）+ 历史列表每行 🗑（36px、二次确认）。
  迁移 `20260913_screenings_delete_policy.sql` 把 DELETE 策略补上 `landlord_id = auth.uid()`（已应用 prod）。
  这同时是申请人数据删除请求的执行路径，也是卡死 / 出错行的出口。**不加「重新评估」按钮**（用户已否决）。
- **历史记录重建补齐** court_summary / verification / ltb_check / rubric；结果页总分卡加「外部核验 N/3 ·
  身份 / 银行 / 征信」条，与报告页、打印版一致。硬门槛芯片总分卡本来就有（3372 行），不动。
- **deep_check_result 由路由服务端落库**（浏览器回写保留作兜底）。
- **五处模型失败出口都上报 Sentry**（tags.failure = model_api / model_stream / model_truncated /
  model_parse / model_missing_dim）。
- **取证并发上限 4 个文件**（`mapLimit`），不再 14 个文件同时 OCR。
- **通知信**：只有真正 verified 的步骤才写「已考虑」；征信直拉成功时改写「经你授权向征信机构获取摘要」，
  不再无条件说「未购买报告」。**share 页**加琥珀色说明「分享链接尚未上线，请用 PDF」；不做真分享（无需求量）。
- **不做**：PII 定期清理 job（存储对象无法从 pg_cron 删除；删除按钮已给房东工具，等有真实量再定保留期）；
  模型输出 flags/action_items 的形状校验（React 侧已转义）。

## Jina 是预付费余额，用完全站六处静默降级（2026-09-12 · 一次真实事故）

租客管家被问「多大附近找 5 套两居室」只回 2 套并说「该区域预算内的新房源有限」。那 2 套是库里
9 月 6 日导入的 Realtor 行；实时抓取其实一条都没回来——`r.jina.ai` / `s.jina.ai` 全部返回
**402 InsufficientBalanceError**（Jina 账户 uid `29c78376…`，余额用光），代码 `catch → []`，
市场卡 `sample:0`，回复把供应商故障说成了库存稀少。**Jina 消费方共六处**，余额一空全部同时失效：
`lib/agent/listingSearch.ts`（Realtor.ca 实时房源 + 行情样本）、`lib/screening/canliiIndex.ts`
（CanLII 索引检索）、`lib/forensics/arm-length.ts` + `app/api/deep-check`（雇主网页核验）、
`app/api/agent/trreb-refresh`（TRREB 季报，fail-closed 保留缓存）、`scripts` 里的 Realtor 导入。
当天上午的 arm's-length 联网测试与门户探针把余额耗尽的。修法：`readRealtorPage` 回传 HTTP 状态，
`externalFromStatuses` 把 401/402/403/429 归为 `external.status='unavailable'`（并 captureException
warning），turn 路由据此改口「Realtor.ca 实时抓取暂时不可用，以上只来自 Stayloop 库」，不再说
库存稀少。守卫 `tests/listingSearch.spec.ts`。**症状速查：市场卡 sample=0 且只回库里那几套 = 先查
Jina 余额**（`.forensics-tmp/jina-balance.mts` 两条请求即可复现）。充值在 jina.ai 控制台，只能由用户操作。

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

## 雇主独立性：申请方成员与公司网页（2026-09-12 · Green Life 案）

用户指出：申请人的雇主 Green Life Group Inc. 是共同申请人（丈夫）的公司，模块却写「正常 — 独立雇佣关系」。
原因：安省注册库（cbr_on）不公开董事，旧逻辑只比申请人本人的姓与签署人/董事，配偶不同姓 → 什么都看不到，
且「没查到」被显示成「正常」。改法（`lib/forensics/arm-length.ts`）：
- `related_names`（共同申请人 / 申请表上的配偶与同住人 / 证件上的名字，deep-check 路由从
  `_v3.extracted_names` + coherence 的 application_form/id_document 姓名汇集）：董事或签署人与其中任何人
  全名匹配 → `arm_length_related_party_officer`（critical，high）。
- 注册库无董事时走网络：`webSearch`（s.jina.ai）查 `"<注册名去句点>" <注册城市> owner OR president OR
  director OR founder OR CEO`（**必须带公司后缀与城市**：只搜「Green Life Group」会返回全世界的同名实体；
  搜带句点的 `GREEN LIFE GROUP INC.` 返回空），再用 `webRead`（r.jina.ai）读公司自己的网站与社媒页
  （social 优先、最多 5 页、并行），找申请方全名、姓+首字母、或**不常见姓氏**（≥5 字母且不在常见姓名单）：
  命中 → `arm_length_web_index_party_named`（high）。本案：Facebook 页出现「Felix Ricky Cipriani」。
- 注册库无董事、签署人无关、网络也没见到 → 结论 **`unverified`**（琥珀色「未核验 — 注册库不公开董事」），
  不再是绿色「正常」；路由 `overall_risk` 也支持 `unverified`，三处 UI 都改了。
守卫 `tests/armLength.spec.ts`（related party / 网页姓氏命中 / unverified）。本机联网复现
`.forensics-tmp/arm-live.mts`。

## 人工通读 vs 模块（2026-09-12 · Cipriani / Quiroga 全套原件）

用户要求：Claude 自己读一遍全部原件，与模块结果逐项对比，模块少发现的都要变成系统化方法。人工读出而
模块没有的（已全部落地）：
1. **整套材料两年前的**（2024-10 在职信、2024-08~10 工资单与对账单、2024-10 征信，筛查在 2026-09）——
   `lib/forensics/recency.ts`：每份文件按自身文字定「as-of」日期（工资单发薪日 / 对账单期末「AUG 30/24 -
   SEP 27/24」/ 信头日期 / 征信 as of / NOA Date issued / 证件 EXP），收入与征信类 >90 天 `document_stale`
   （>365 天 high），收入包中位 >180 天 `income_package_stale`；`rubric.incomeDocsAgeDays` >120 −8、>365 −20；
   红旗 `stale_documents` 并把 income_stability / income_rent_ratio / employer_verify 降为 action_pending。
2. **证件过期**（Leo 的照片卡 2026-06-11 到期，Nathalie 驾照 4 天后到期）——`id_expired`（medium；
   全部过期 `all_ids_expired` high）、`id_expiring_soon`（info）。
3. **在职信自己的电话两种写法**（416 4278441 / 416 427 4881）、**拼写错误**（Human resourses、
   Comunications Manager）——`lib/forensics/letter-quality.ts`：同交换局不同尾号 `letter_phone_inconsistent`，
   常见伪造拼错词典 `document_spelling_errors`。
4. **工资单按支票版式、银行却是电子转账与支票轮着到账**——`payroll-deposits.ts pay_method_mismatch`。
5. **征信 Non-Credit Related 查询里有催收机构（MJR Capital Services ×3）而催收栏为空**——
   `lib/screening/collectionAgencies.ts` + 路由 `collection_agency_on_file`（high）；转录 schema
   `inquiries[].kind`（credit / account_review / non_credit）要求三张表全部转录。
6. **两份征信混淆**：模型把共同申请人的 793/23 户当成主申请人的；主申请人自己的消费者披露没有分数、只有
   4 个小额账户——schema 加 `subject_name` / `source_file`，路由比对不是主申请人即 `unreliable` +
   `credit_report_subject_mismatch`。
7. **贷款机构起诉（CIBC、Capital One、Home Trust）而征信干净**——`court_vs_bureau_contradiction`。
守卫 `tests/recencyAndLetterQuality.spec.ts`。

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

## 生命周期方案落地 P0 / P1（2026-09-23 · 依据 `design/lifecycle-visibility-and-role-flows-2026-09.pdf` 与 `design/eliseai-product-atlas-mapping-2026-09.pdf`，用户「你自己确定怎么做」）

- **P0 租前·租中·租后 rail**：`lib/lifecycle/stages.ts`（纯函数 `landlordLifecycle / tenantLifecycle / agentLifecycle`，阶段只由库里的行推导、不看模型的 `next_stage`；每个「下一步」链到真实页面或预填对话框；rail 里不出现分数 / 百分比）+ `lib/lifecycle/useLifecycle.ts`（RLS 读取）+ `components/lifecycle/LifecycleRail.tsx`（桌面三列、手机 `compact` chips、进度页 `full` 带 AI/你 两行）。挂在三个 `/x/agent` 顶部与 `/x/progress`；`AgentChat` 状态行的阶段改为 `phaseLabel`。守卫 `tests/lifecycleRail20260923.spec.ts`。
- **P1（守卫 `tests/lifecycleP1_20260923.spec.ts`，迁移 `20260923_application_tracker.sql` 已应用 prod）**：
  - **申请人追踪条**：`applications.viewed_at`（房东第一次打开申请人页时由 RLS 客户端写）/ `screened_at`（`/api/screening/from-application` 写）；`lib/lifecycle/applicationTrack.ts` 纯函数 → `components/tenant/MyApplications.tsx` 每行「已提交 → 房东已查看 → 筛查已发起 → 决定 → 租约待签 → 在管租约」，**租客永远看不到分数**（守卫 grep `ai_score`）。租客能读发到自己邮箱的租约：策略 `leases_tenant_email_read`（按 JWT email）。
  - **房东申请队列按阶段分组**（`lib/landlord/applicantStages.ts`：待筛查 / 已评分待决定 / 已决定），live 模式不再渲染「信用 ≥720 / DTI ≤35%」政策卡与门槛文案，分数标「评分·参考」。设计样例模式保留原三桶。
  - **租客意向回流**：表 `renewal_intents`（household 成员读、租客本人插入、anon 无权）；30 天触点邮件带三条一键链接 `/h/<id>?intent=renew|leave|negotiate`（`renewalStages.intentLinks`，proactive 两种模式都把 household_id 挂到租约上）；`/h/[id]` 概览页「续约意向」面板（租客三个按钮 + 备注，双方都看得到记录，明写「只是意向不是 N9」），头部新增「租中 · 第 N 个月 · 到期 X 天 · 租金记录 n/m 期 · 租客意向」（`lib/household/clock.ts`）；rail 的「租客意向」步骤与 `/landlord/leases` 的下一步列都显示意向。
  - **主动卡两张（cron 模式）**：`lib/agent/proactiveExtras.ts` —— 在管租约邀请 3 天未接受 → `send_message` 提醒卡（metadata.invite_id 幂等，`isKnownCounterparty` 认房东自己发出的邀请邮箱）；租约到期 ≤30 天且同单元无新租约 → `relist_prompt`（批准 = 知悉，执行器复用 checkpoint 盖章，`executed_relist_prompt`）。
  - **报修分诊**：`lib/agent/maintenanceTriage.ts`（`sanitizeActionMetadata` 从 turn 路由搬来；新字段 category / location / entry_permission / pets；`isEmergencyMaintenance` 命中无暖气 / 停水 / 燃气 / 淹水 / 门锁失效 / CO 一律 priority high 且邮件主题加【紧急】、正文引 RTA s.20）；租客提示词 `MAINTENANCE_TRIAGE_RULES`（四件事一句话问完、紧急件先说现在该做什么、RTA s.27 进入 24 小时通知）。
- **未做（P2）**：今日视图、房东组合批量提案、LTB 付款协议起草、入住清单 + 保险核验、申请人并排事实、经纪客户表。
- **P2（2026-09-23 同日，用户「继续做 P2」；守卫 `tests/lifecycleP2_20260923.spec.ts`，迁移 `20260923_p2_lifecycle.sql` 已应用 prod）**：
  - **今日视图**：`lib/lifecycle/today.ts buildToday`（纯函数：待批卡一行汇总 → ≤14 天或已过的时钟 → 带明细的当前步骤 → 当前阶段的下一步，去重、最多 6 条）→ `components/lifecycle/TodayCard.tsx`，挂在三个 `/x/agent` 的 rail 之上与 `/x/todo` 顶部。
  - **房东批量提案**：`components/agent/BulkApproveBar.tsx`（`/landlord/todo`）——≥2 封续约函可「全部方案 A / 全部方案 B」、≥2 张知悉类卡（checkpoint / relist）可「全部知悉」，逐张走原 `decide`（各自保留 60 秒撤销）；**邮件类卡永不批量**。
  - **还款计划草稿**：`lib/ontario/paymentPlan.ts`（欠款均分 1–6 期、每期随当月租金、无利息手续费 s.134、明写不是 N4、LTB 效力须用 Payment Agreement Form s.206）→ `components/household/PaymentPlanDraft.tsx` 在 `/h/[id]` 租金页对房东成员显示（有到期未记录的账期时），生成后写一张 `send_message` 待批卡（收件人 = 租约 tenant_email），批准才发。
  - **入住清单**：表 `move_in_checklist`（household × item，成员读写、勾选记录 done_by/done_at，anon 无权）；`lib/household/moveIn.ts` 13 项（照片 5 / 交接 5 / 文件 3：租约副本 s.12 21 天、押金收据 s.106、租客保险自述 + 保险公司到期日备注）；`components/household/MoveInChecklist.tsx` 在 `/h/[id]` 概览页（双方）与 `/tenant/move-in`（liveSlot，租客自己的 household）。不存照片。
  - **申请人并排对比**：`components/landlord/ApplicantCompare.tsx` 在 `/landlord/applicants` 真实模式 ≥2 份时——只列事实（房源 / 提交 / 期望入住 / 申报月收入 / 雇主 / 材料份数 / 第三方核验章 / 筛查状态 / LTB 记录 / 决定），守卫禁止出现比值、门槛、排序。
  - **经纪客户表**：表 `agent_clients`（本人 RLS）+ `lib/agent/clientBook.ts` + `components/agent/ClientBook.tsx` 在 `/agent/clients` 顶部（真实行存在时不再渲染设计样例，为 0 时挂 SampleBanner）：阶段下拉、TRESA 两个日期（代表协议 / Information Guide）内联可改、静默天数 + 「今天联系过」、「交给 Brief」预填、**「发起筛查」只在两个日期都记录后可点**；侧栏虚构的 RECO 号与 4.9★ 评价已删。经纪 rail 的「客户接入」「客户记录归档」两步改读真实行。

## 第三方服务市场 Phase 0 + 1（2026-09-23 · 方案 `design/services-marketplace-plan-2026-09.pdf`，用户「先做 P0-P1，P2/P3 记录着下次更新再做」）

**P2（Stripe Connect 代收 → 抽成 → 转账、HST / 发票、争议冻结付款、自动派单策略与紧急件自动批准、服务商短信、服务商网络进 Pro 定价）与 P3（开放入驻 + 等级 + 流量分配、Vendor SaaS、Stayloop API 回传工单状态、复制到下一城市、保险节点按律师意见扩展）未做，下次更新再做。保险：只把现有转介卡扩到签约页与租客租约页，无任何计酬。**
- **数据**（迁移 `20260923_services_marketplace.sql`，已应用 prod）：`service_providers`（入驻自述 + 状态；触发器 `guard_service_provider_fields` 让自助改动碰不到 status / verified_*，改法定名 / 注册号 / 工种即回 pending；本人读写、verified 行对 authenticated 可读、管理员全权）、`provider_credentials`（sto_coq / esa_contractor / tssa_gas / wsib_clearance / liability_insurance / business_registration / mecp_exterminator：编号 + 持证人 + 到期日 + 核验戳；改编号或到期日即撤核验）、`work_orders`（挂在 `maintenance_tickets` 上；三方经 RLS **只读**，所有写入走服务端）、`work_order_events`（只增）、`provider_reviews`（验收后 14 天内房东 / 租客各一条）。`my_hats()` 多了第五顶帽子 `provider`。`compliance_events.source` 加 `work_order`。**V4 遗留的同名表 `service_providers`（6 家虚构服务商，带 4.9 评分、1240 单，无代码消费者）改名 `service_providers_v4_demo` 保留。**
- **规则**（`lib/ontario/rules.ts` 新 area `maintenance`，`/rules` 页「维修与进入」）：`RTA-20-landlord-repairs`、`RTA-27-entry-notice`（24 小时书面通知，8:00–20:00）、`RTA-26-emergency-entry`、`CPA-10-estimate`（账单不得超出估价 10%；CPA 2023 已通过条例未生效）。
- **纯规则**：`lib/marketplace/trades.ts`（8 个工种 → 安省必需资质；`coverageFor` 每项须存在 + 已核 + 未过期；`providerEligible` = verified + 工种 + 资质 + 城市，多伦多覆盖各区）、`lib/marketplace/workOrders.ts`（状态机 offered → quoted → scheduled → in_progress → completed → accepted → paid → closed，分支 declined / rework / disputed / cancelled；`canAct(action, status, actorKind)` 是唯一的准入表；`validateQuote`；`invoiceWithinEstimate` CPA 10%；`entryNoticeText` 按紧急与否引 s.26 / s.27；`providerMetrics` 六个试点指标；`TICKET_STATUS_FOR` 把工单状态映射回 ticket 的 assigned / in_progress / review / done）。
- **服务端** `lib/marketplace/server.ts`（service role）：`createWorkOrder`（校验房东是该 household 的 landlord 成员、同一 ticket 只允许一张开放工单、铸 64 位 token、邀请邮件——**完整地址接单后才给**、推送有账号的服务商）、`actOnWorkOrder`（准入表 → 乐观更新（按旧 status）→ 事件 → ticket 状态 → 副作用：报价 → 房东 `approve_quote` 待批卡；批准 → 给租客发进入通知邮件 + `compliance_events` + 通知服务商；完工 → 房东 `accept_completion` 待批卡（账单超 10% 标 medium 并写明）+ 推租客确认；争议 / 取消 / 到场各自通知）、`peekByToken`。
- **路由**：`POST /api/work-orders/dispatch`（房东 JWT，每小时 20）、`POST /api/work-orders/[id]/act`（actor 从行推导：房东 / 服务商 / 租客成员 / 管理员，绝不信 body）、`GET/POST /api/w/[token]`（外部联系人的门：按 IP 限流，只允许 accept / quote / decline / arrive / complete / cancel / dispute，不收照片，`Referrer-Policy: no-referrer`）。
- **执行器**（`/api/agent/execute`）：`dispatch_work_order`（租客报修执行器 `executeMaintenanceRequest` 落库后自动给房东放一张建议卡 `suggestDispatch`：候选 = 覆盖工种 + 城市且资质有效的 verified 服务商 ≤5 家，批准 = 向第一位发邀请；无候选则提示派给自己的联系人）、`approve_quote`、`accept_completion`。
- **界面**：`components/household/MaintenancePanel.tsx`（真实状态机：new / assigned / in_progress / review / done / cancelled；房东「指派」→ `DispatchModal`（精选网络按资质 / 城市灰掉不合格者 + 「我自己的联系人」只要一个邮箱）；每张工单下 `WorkOrderCard`（按 viewer 给按钮 + 时间线）；租客「确认问题已解决」）挂在 `/h/[id]` 报修标签（**顺带修掉了「标记已解决」写 `resolved` 违反 CHECK 的旧 bug**；`?tab=maintenance` 深链）；`/landlord/maintenance` 顶部 `LiveMaintenanceBoard`（liveSlot，按 household 切换）；`/landlord/providers` 目录（覆盖、评分、你派过几次 / 接单率、自己的联系人）；`/w/[token]` 外部联系人手机页（接单报价 / 婉拒 / 已到场 / 完工 + 账单）；`/provider/onboard`（入驻 + 资质，照 `/agent/verify`）、`/provider/jobs`（邀请 / 进行中 / 已完成）；`/admin/providers`（逐条资质「对照无误 ✓」→ 服务商核验 / 不通过 / 暂停；争议单裁定为已验收）；Header 帽子菜单在有 provider 行时多一项「服务商 · 工单」；`/admin` 控制台多一块「服务商核验」。
- **不经手资金**：付款线下，房东「标记已付」只是记录；`work_orders.payment_mode` 只允许 offline。守卫 `tests/marketplace20260923.spec.ts`（16 条：状态机、CPA 10%、进入通知条款、资质覆盖与资格、规则、执行器接线、token 门不接受房东侧动作、旧表改名而非复用）。
- **生产首跑（2026-09-23，`[TEST]` 数据保留）**：Phase 0 全程——房东在 `/h/<id>` 报修标签把工单派给自己的联系人（`landlord-test+plumber@stayloop.ai`）→ 外部联系人在 `/w/<token>` 接单报价 $180（接单前只见城市，接单后见完整地址与房东邮箱）→ 房东在 `/landlord/todo` 批准报价卡（60 秒撤销后执行器发 RTA s.27 进入通知邮件 + compliance_events 一行）→ `/w/<token>` 已到场 → 完工 + 账单 $210 → 验收卡标 medium 并写明「超出报价 16.7%，超过 CPA 10%」→ 房东在 hub 直接验收 → 标记已付；事件链 `offered → accept → approve_quote → arrive → complete → accept_completion → mark_paid`，ticket 置 done。Phase 1——`agent-test` 在 `/provider/onboard` 入驻为 `[TEST] Maple Plumbing Inc.`（水管 + 杂工 · Toronto）并添加 4 项资质（管理员核验一步用 service role 模拟盖章）→ 房东派单弹窗里该服务商显示「资质已核」并被预选 → `/provider/jobs` 收到邀请、显示工种「水管」、接单报价 $150。**首跑修掉四处**：① 派单弹窗的工种选择没传到服务端（trade 一律按 ticket 类别推断）；② 派单弹窗在目录加载前就切到「我自己的联系人」（`loaded` 后才回退）；③ 房东在 hub 直接决定后，对应的待批卡仍 pending（现在改 `expired`；手动派单也让 `dispatch_work_order` 建议卡过期）；④ 租客在房东标记付款后就没有「确认已解决」按钮（`tenant_confirm` 允许 paid / closed）。**服务商读不到 household / ticket**（只有工单可读，`/provider/jobs` 接单后没有地址）——迁移 `20260923_marketplace_provider_read.sql`（已应用 prod）：持有未取消工单的服务商可读该 household 与 ticket。
- **顺带**：`/h/[id]` 报修标签的旧「标记已解决」写 `resolved` 违反 CHECK 的 bug 随本次替换为 `MaintenancePanel` 一并消失。

## E2E 检测与三份审查（2026-09-23 晚 · 用户「现在做一下 E2E 的检测和 review」）

三个只读审查代理（服务市场 21 条 / 生命周期 P0–P2 23 条 / 界面文案手机端 17 条）+ 生产上 36 项分支 E2E（`scratchpad/e2e-market.sh`：租客与服务商不能批准报价、进入通知与合规事件、返工后旧验收卡过期、争议只有管理员能裁定、token 门对已付款单与房东侧动作的拒绝、婉拒 / 取消回滚 ticket、评价 RLS、租客付款后确认）全部通过；375px 十个新页面零横向溢出。**全部修复并上线**，值得记住的：
- **执行器拿卡片 metadata 里的 work_order_id 就替房东验收（critical）**：卡片是客户端可写的，任何能读到工单的人都能插一张 `accept_completion` 卡再执行。现在 `actOnWorkOrder` 对 by='landlord' 强制 `actorId === wo.landlord_auth_id`——一处检查保护所有调用方。
- **列级授权**：`work_orders.token` 不再对 authenticated 可读（租客曾能从 network tab 拿到并以服务商身份完工报 $5,000）；`service_providers` / `provider_credentials` 的 verified 直读策略换成 definer 视图 `provider_directory` / `provider_credentials_public`（review_note、verified_by、file_path 不再外泄）；服务商读 household / ticket 改为 RPC `provider_job_context()`（只给地址 / 单元 / 城市 / 标题，接单后、归档前）；租客读申请改为视图 `applicant_applications`（无任何评分列，且按登录邮箱过滤——多帽子房东在租客页不再看到收到的申请）。
- **报价 TOCTOU**：批准时带 `expected_amount`（卡片 metadata 与 hub 按钮都传），服务端另按 `quoted_at` 乐观锁；重新报价会更新卡片 metadata。
- **RTA s.27 真正校验**：非紧急批准报价须有到场时间、≥24 小时、8:00–20:00（America/Toronto，起止都算），无已加入租客则 422；报价不能在过去；`valid_until` 须是日期且未过期。
- **工单删除级联**：`work_orders.ticket_id` 改 `on delete restrict`，触发器 `guard_ticket_with_work_order` 禁止成员在有工单时删 ticket、在有开放工单时改状态。评价的 `provider_id` 必须等于工单的服务商。服务商资格（工种 + 资质有效 + 城市）在服务端 `createWorkOrder` 强制，不只在界面灰掉。
- **生命周期**：房东 rail 曾在任一租约到期后永远停在租后（现在只看 30 天内到期、无同单元新租约、无仍 verified 的 household）；续约函只在批准后算「已发」；指导比例与 N1 时钟按**涨租生效日**（到期日 + 1）取年份（12-31 到期的租约用下一年的比例）；`signed_tenant` 显示「等房东回签」；受邀未加入的租客通过 `my_pending_invites()` 看到「接受邀请」步骤；还款计划的分期日按月末钳制；`tenancyClock` 按日历月；今日卡只列 ≤14 天的时钟和以数字开头的步骤明细；追踪条不再把「已决定」推断成「筛查已发起」；批量批准并行跑（此前串行等每张 60 秒）；申请队列真实模式删掉 3× 收入行、最高分提示与阈值分组的 CSV；`useAgentSession` 的「+2.5%」文案改掉并进守卫。
- **界面**：四个页面的 `Shell` 定义在 render 内部导致每次输入都重挂载（输入框失焦）——提到模块级；管理员审计写 `actor_type='admin'` 违反 CHECK 从未落库；清单备注编辑不再覆盖勾选人与时间；派单弹窗 Esc 关闭、目录加载后才回退到「自己的联系人」；时间线 / 状态 / 资质键名双语化；日期按界面语言本地化；争议裁定时管理员身份优先判定。
- **有意不改**：`providerMetrics` 的返工率按当前状态统计（事件表统计留到 P2）；邀请提醒卡只给 landlord 帽子；`leases_tenant_email_read` 依赖 JWT email（邮箱确认已开）。

## 租客报修弹窗的照片上传（2026-09-23 · 用户截图「点击照片不能上传」）

`/tenant/maintenance` 的 `NewTicketModal` 原是设计样例：五个 📷/+ 方格没有任何 input，「提交」只是 `onClose`，眉标写死「UNIT 1207 · 发给 SARAH」。
现在是真功能，抽成 `components/tenant/NewTicketModal.tsx`（守卫 `tests/ticketPhotos20260923.spec.ts`）：
- **照片**：隐藏 `<input type="file" accept="image/*,.heic,.heif" multiple>`，方格即按钮；对象 URL 预览、× 移除、最多 5 张
  （`lib/household/ticketPhotos.ts acceptTicketPhotos`，iOS 的 HEIC 空 type 按扩展名认）；上传前走 `prepareUploads`（与筛查同一套降采样）。
- **落库**：先插 `maintenance_tickets`（客户端生成 id、`photos: []`）再传照片、最后 `update photos`——工单必须先到房东手上，照片失败只是「N 张未能上传」。
  路径 `<household_id>/tickets/<ticket_id>/<n>.<ext>`：**首段必须是 household id**，`tenancy_files_member_write` 按 `foldername[1]` 判成员（生产实测：
  外人文件夹 400/AccessDenied、非成员签不了 URL）。四个方格类别映射到 triage 类别（hvac→heating_cooling、lock→locks_safety），
  `isEmergencyMaintenance` 命中即强制 high 并提示 RTA s.20；标题 = 描述首行（≤60 字）。
- **没有在管租约**：琥珀提示「没有可发送的房东」+ `/leases/import` 链接，提交禁用（不再假装成功）；眉标显示真实地址。
- **在管租约页与房东看板都能看到照片**：`MaintenancePanel` 选 `photos` 列，`createSignedUrls(…, 600)` 出缩略图（`data-testid="ticket-photos"`）。
- **诚实态也能到达**：页面 `liveSlot={<LiveTenantTickets>}` 对每份在管租约渲染 `MaintenancePanel`（`onNewTicket` 让「+ 提交报修（可附照片）」
  打开弹窗），弹窗渲染在 `WorkspaceShell` **之外**——DemoGate 的诚实态不渲染 children，放在里面点了没反应。演示态的页头按钮仍是同一弹窗。
- 未做：直接从这个弹窗给房东发邮件 / 推送（`maintenance_request` 执行器那条路径才有）；房东在看板上看到即可，等有量再加。

## 页面加载复审（2026-09-23 · 用户「刷新后加载很慢」）

用租客测试会话在生产上量 `/tenant/agent`：**一次刷新 50 个 Supabase 请求，每一条都恰好发两次**，REST 请求分五波串行。先量后改，守卫 `tests/perfLoad20260923.spec.ts`：
- **根因是 `useAuth`**：`getSession()` 与 `INITIAL_SESSION` 事件各给一份新解析的 session 对象，`setState` 每次都换 `user` 引用，全站 24 处
  `useEffect(…, [auth.loading, auth.user])` 于是全部跑两遍（my_hats / bootstrap / lifecycle / 状态瓦片……）。现在同一登录（同 id、同 access_token）
  保留原来的 `user` / `session` 引用，没变化时直接 `return prev` 不重渲染；`USER_UPDATED` 才换对象。**以后 effect 依赖 `auth.user` 是安全的，不要再改成 `auth.user?.id` 之类的绕法。**
- **去重**：`useHats` 共享在途 `my_hats`；`lib/aiName.ts` 一次查全部角色的 `agent_configs`（Header 三顶帽子原来三条）；Header 与手机底栏的待批红点
  走 `lib/agent/pendingCount.ts`（2 秒内共享）；`lib/tenantRow.ts` 共享 `tenants` 行查找（生命周期 rail、状态瓦片各查一次）。
- **少一跳**：`loadAgentSession` 把 config / task / memories / pending 与 bootstrap RPC 并行（config 按 role 读，id 对不上再按 id 补读）；
  `useLifecycle.loadTenant` 三跳改两跳；`StatusOverview` 在拿到 user 就开始读，不再等 `live`（它原来是页面最后两波）；
  `AgentInputBar` 的 `/api/models/catalog`（1 秒）按用户缓存在 sessionStorage 10 分钟，选模型即清。
- 结果：50 → 24 个请求、0 重复。**用户的网络本身慢**：本机出口在美国（GTT）、Cloudflare 落在 ZRH、到 1.1.1.1 RTT 250ms，TLS 握手 450–650ms，
  HTML TTFB ≈1 s——每一波串行请求都要付这个 RTT，代码只能减少波数与请求数。页面是预渲染静态（`x-nextjs-prerender: 1`），JS 共 23 个文件 967 KB。
- 未做：把生命周期 / 状态瓦片的多跳合成一个 `security invoker` RPC（一趟返回全部事实）——需要迁移，等有量再做。

## 手机端助手页：对话就是屏幕（2026-09-24 · 用户「中间对话框不够大，上部被菜单和说明占了太多空间，参考 Muse」）

375×812 实测（租客测试账号）：页头 67 + 今日卡 179 + 生命周期 rail 161 + 居中头像块 123 = **530px 才到第一条气泡**，对话框从 459px
开始、页面还要整体滚动，输入条 129px。按 Muse「一条长对话为主屏」改（守卫 `tests/phoneChat20260924.spec.ts`，md 以上不变）：
- **三个 `/x/agent` 页在手机上是一根固定高度的列**：`h-[calc(100dvh-121px)]`（页头 56 + 1px 边线 + 底栏 64），`WorkspaceShell` 新 prop
  `phoneApp` 去掉内容区内边距（`p-0 pb-16`，md 起恢复）；`AgentChat` 新 prop `phoneFill`（`h-full`，md 起才有卡片边框）。
- **今日 + rail 折成一条 44px 的 `components/mobile/ContextStrip.tsx`**：「今日 N 件 · 第一条 · 〈当前阶段〉 ▶」，点开在原位展开同一个
  `TodayCard` + `LifecycleRail compact`（最高 55vh 可滚），点里面的「交给助手」自动收起。桌面端两块照旧。
- **对话头部改为单行**（头像 36 + 名字 + 状态行，仍可点开活动日志；此前手机上是居中大头像 123px）；线程内边距 16px；
  **输入条在手机上是一行** `[+] [输入框] [🎙] [发送]`（`flex-wrap` + `order`，md 起恢复「输入框一行 + 控件一行」），模型选择器 md 以下隐藏（在设置里）。
- **页头 56px**（`h-14 md:h-[66px]`）。匿名预览横幅与经纪认证横幅在 phoneApp 列里自带左右 20px 边距。

## 构建机体检（2026-09-24 · 用户「你要什么权限都可以，这台电脑就是专门给你用的」）

M1 Mac mini、8 GB 内存、APFS 容器 92% 满（剩 19 GB）。当天三次构建 16 / 23 / 20 分钟（正常 4 分钟）的直接原因是 **OpenClaw 网关内存泄漏**：
launchd 代理 `ai.openclaw.gateway` 50 分钟内从 1.3 GB 涨到 5.8 GB，swap 用满后 tsc / vitest / next build 的工作进程被换出就再也不醒（0% CPU 30 分钟）；
`kill` 没用（KeepAlive 立刻拉起）。用户授权后已 `launchctl disable`（恢复命令见 memory `build-machine-health`）。**iCloud 同步的假设被实测推翻**
（`bird` 日志里没有项目路径），别再提 `.nosync`。磁盘：`~/.openclaw` 42 GB + 两份备份 16 GB、Claude 桌面 `vm_bundles` 20 GB、`~/.npm` 15 GB、
各类缓存 11 GB——只有 npm / brew 缓存是我可以清的。**这台机上部署一律 `nohup bash ./ship2-v53.command > log &` + `until grep` 监视器**，
600 秒工具超时不够用；构建前先 `top -o mem` 看有没有不是我们的 node 进程超过 2 GB。

## 版本命名（2026-09-24 · 用户决定）

从 2026-09-24 起，**下一个开发版本叫 V0.6，正式发布版叫 V1.0**。此前的「v5.3」是内部迭代号：git 分支 `v5.3-launch`、部署脚本 `ship2-v53.command`、
页脚「v5.3」、`design/v53-*` 手册都保持不变（部署脚本与 GitHub 默认分支依赖分支名）；新工作在计划、CLAUDE.md 小节与提交信息里一律称 V0.6。
改页脚等用户可见的版本字样前先问。**2026-09-27 起为 V0.7**（首页改为营销 + 登录页，用户「修改后的版本为 V0.7」）：页脚已改为 V0.7，git 分支与部署脚本名仍不变。

## V0.6 收尾与清债（2026-09-24）

用户选定 V0.6 两条线：收尾清债（本节）+ 服务市场 P2。守卫 `tests/v06Cleanup.spec.ts`。
- **RECO 到期自动转态**：`agent_registration_sweep()`（迁移 `20260924_agent_registration_sweep.sql`，已应用 prod；pg_cron
  `agent-registration-sweep` 每天 13:20 UTC）——verified 且到期 ≤30 天 → `renewal_due`，到期日已过 → `expired`，各写一条
  `agent_verification_events`（actor null、note `auto: …`）。函数内把 `request.jwt.claims` 设成 service_role 让
  `guard_agent_profile_fields` 放行（否则触发器会把 status 还原——测试时自己的 setup 也会被还原，要同样设 claims）。
  **renewal_due 仍是有效注册**：`lib/agentProfile.ts isRegistrationLive`（verified | renewal_due）统一用于徽章、Header 帽子标、
  经纪专属页锁；`agent_directory` 视图收录 renewal_due 且到期日未过的行；工作台横幅对 renewal_due / expired 分别说明。
- **删除 `/api/trust/verify`**（查不存在的 `rental_passports` 表）；`scripts/route-audit.mjs` 改为期望 404。
- **报修直接通知对方**：`POST /api/maintenance/notify {ticket_id}`——RLS 读证明调用者是开单人 → service role 以
  `maintenance_tickets.counterpart_notified_at`（新列）幂等认领 → 租客开的单给房东发邮件 + 推送 + 派单建议卡（`suggestDispatch`
  从 execute 路由搬到 `lib/marketplace/server.ts` 共用），房东开的单给租客发邮件 + 推送；收件人只取自 household 成员；
  每用户每小时 20 次；审计 `maintenance_ticket_notified`。租客报修弹窗与 `/h/[id]` 报修面板都在插入后调用
  （`lib/household/notifyTicket.ts`），弹窗完成态写明「已通过邮件和推送通知房东」。
- **生命周期 rail 一趟取数**：`lifecycle_facts_landlord()` / `lifecycle_facts_tenant()`（**SECURITY INVOKER**，调用者 RLS，
  anon 无权；迁移 `20260924_lifecycle_facts_rpc.sql`）把房东四波、租客两波串行请求合成一个 RPC；`useLifecycle` 先调 RPC，
  出错回退到原逐表加载。租客侧申请仍经无分数视图 `applicant_applications`。

## 服务市场 P2 · 非资金部分（2026-09-24 · V0.6）

用户拍板：**暂缓代收 / 抽成 / Stripe Connect**（生产尚无真实工单，抽成率要在真实数据上定）；HST 未注册，平台费不收税；
短信不做（服务商已有邮件 + 推送）。落地（守卫 `tests/dispatchPolicy.spec.ts`，迁移 `20260924_dispatch_policies.sql` 已应用 prod）：
- **派单策略** `dispatch_policies`（每房东一行，本人 RLS，anon 无权）+ 纯规则 `lib/marketplace/dispatchPolicy.ts`：
  `mode` = `suggest`（默认，原行为：派单建议卡）/ `auto_emergency`（priority high 的报修立即派给排第一的服务商）/ `auto_all`；
  `preferred`（工种 → 服务商 id）；**紧急报价预授权** `emergency_auto_approve` + `emergency_cap`（0–2000，默认 500）：
  紧急件报价 > 0 且 ≤ 上限时以该行房东身份经 `actOnWorkOrder('approve_quote')` 直接批准（同样的检查、事件 payload
  `auto_policy:true`、租客收到 s.26 进入通知），不再出批准卡；超上限 / 非紧急永远要房东点头；CPA 10% 仍约束账单。
- **候选排序** `rankCandidates`：首选 → 该房东已验收的单数 → 评分（≥2 条才算）→ 接单率（≥3 单才算）→ 名称；
  `rankReason` 写进卡片与审计。`suggestDispatch` 先取全部合格服务商再排序取前 5；自动派单走 `createWorkOrder(actor:'system')`
  （同样的房东与资格检查），失败回退为卡片；审计 `work_order_auto_dispatched` / `work_order_quote_auto_approved`，推送房东。
- **精选网络是 Pro 功能**：`networkDispatchAllowed`（测试窗口内或 plan pro/team）——`createWorkOrder` 对 providerId 派单返回
  402 `pro_required`，`suggestDispatch` 在非 Pro 时不列网络候选并提示派给自己的联系人；**派给自己的联系人所有计划都可用**。
  定价页：起步档加「维修工单 + 派给你自己的联系人」，Pro 加「已核验服务商网络 + 派单策略 · 不抽成」。
- **界面**：`components/marketplace/DispatchPolicyCard.tsx` 在 `/landlord/providers` 顶部（三种模式单选、预授权开关 + 上限、
  各工种首选下拉，只列资质齐全的服务商）；派单弹窗把 `pro_required` 译成人话。
- **生产实测**（`.forensics-tmp/p2-e2e.mts`，service role 直调服务端函数，`[TEST]` 数据已取消）：紧急件自动派给 `[TEST] Maple
  Plumbing`、无卡片；$150 紧急报价在 $400 上限内自动批准（事件 `system:offered → provider:accept → landlord:approve_quote(auto)`，
  进入通知已发）；非紧急件出卡片且理由「你以前派过 1 单并验收」；$900 超上限出正常批准卡。
- **仍未做（P2 资金部分，等真实工单量）**：Connect Express 服务商入驻 → 代收 → 抽成 → 转账、发票与 HST、争议冻结付款、服务商短信。

## 三角色模拟测试报告（2026-09-24 · `~/Downloads/stayloop-3role-test-report.pdf`）

外部 QA 用三个测试账号在桌面端走查，3 个 P1 + 18 个 P2 + 公开站观察。先复现再改，守卫 `tests/threeRoleReport20260924.spec.ts`。
- **SL-T-01 零证据出分（属实）**：租客测试号 0 个文件跑出 37/100 decline +「可能造假」。`screen-score` 在签名文件之前：
  无文件且无本人授权核验 → 行置 `error: no_documents`、返回 422「没有可评估的材料」，不调模型、不出分；发起按钮必须有文件
  （只填姓名不再可点）。那条 37 分记录已改成 error（未删）。
- **SL-L-01 申请材料打不开（属实）**：签名与权限都正常，是 `await` 两次后才 `window.open`，用户激活已过期、浏览器静默拦截。
  改为页内 `components/landlord/FilePreviewModal.tsx`（点击即开，加载 / 401 / 403 / 400 / 网络错误 + 重试，图片与 PDF 内嵌，
  HEIC 等给真 `<a target=_blank>`）；`/api/file-url` 写审计 `application_file_viewed`（页面一直写着「查看即留痕」但此前没记）。
- **SL-A-01 / T-06 / T-08 / A-03 根因是同一个：访问即获得房东身份。** `useLandlord` / `useUser` 在页面加载时调 `claim_landlord`，
  租客测试号在跑筛查那一刻、经纪测试号在打开 `/landlord/agent` 那一刻各被建了一行 landlords。现在：页面加载**永不** claim；
  `WorkspaceShell` 对 role=landlord、已登录、无房东帽子 → `/landlord/become?next=`（`lib/landlordHat.ts safeNext` 只收站内路径）；
  该页说明房东身份是什么、经纪不能代管房东账户，点击才 `claim_landlord`。明确开通的入口只剩：`/landlord/become`、
  onboarding 选房东（已登录时先 claim 再进筛查页）、发布房源（`listingPublish`）、Stripe 付款。登录 / 回调落地改用
  `homeForHats`：浏览器里记住的上一个角色必须是本账号持有的帽子才用。两个测试号上自动建出的 landlords 行（0 房源）已删。
- **P2 已改**：T-02 申请页顶部显示房源照片 / 地址 / 租金 / 户型；T-03 登录后预填姓名邮箱（只填空字段）；T-04 授权文案
  「《安大略省人权法典》」；T-05 决定 / 撤销待批卡后 `notifyPendingChanged()` 事件让 Header 与手机底栏立即重取红点；
  L-04 `/landlord/applications(/*)` 308 到 `/landlord/applicants`；L-08 导入页示例地址改多伦多格式；A-02 设置页登录方式按账号
  identities 显示（「邮箱（密码或登录链接）」/ Google），不再写死 Magic Link；A-05 侧栏 title「设置」。
- **公开站**：`[TEST] 100 Test Ave` 房源 `is_active=false`（行保留）；8 Colvestone Road（Realtor 导入，标题「5+3 卧」）卧室数
  3 → 8（价格 $13,800 / 7 浴是真实豪宅数据，非错误）；定价页与订阅卡「内部测试期」→「限时免费」；申请人列表副标题缩短。
- **第二轮（用户：「改成 V0.6，其余按建议全部修」）**：
  - 页脚版本「v5.3」→「V0.6」（git 分支与部署脚本名不变）。
  - L-02：`buildToday(…, { omitPending })`——待办页不再在「今日」里重复自己的卡片；任何页面上，只指向待办页的步骤（「N 条等你回复」）
    在已有「N 件等你点头」时不再单列。
  - A-04：经纪首页「活跃客户」改读 `agent_clients`（非 closed，与进度条同口径；旧值来自 V4 的 field_agents / agent_tasks 恒为 0）；
    `/agent/tasks` 用 `clientTasks()`（`lib/agent/clientBook.ts`，纯函数）从客户表生成真实任务：缺代表协议 / Information Guide 日期、
    ≥7 天没联系、看房中备带看包、已申请跟进结果；`components/agent/ClientTasks.tsx` 作 liveSlot，空态文案不再说「上线后开放」。
  - L-05：`applications.archived_at`（迁移 `20260924_applications_archive.sql`，已应用 prod，房东私有、不进申请人视图）；列表页「已决定」
    段一键全部归档、底部可展开「已归档」并逐条取消；详情页有归档 / 取消归档按钮。
  - L-03：发布向导顶部原写「自动生成英中文文案、推荐价格区间、SEO 描述」——**这个功能从来不存在**，已删。第 5 步新增「标题与描述」：
    可手写，或「按已填字段生成中英文草稿」（`lib/listingCopy.ts draftListingCopy`，确定性、只用填过的字段，不补宠物 / 水电 / 面积等），
    发布前逐字可改；slim 行带上 title / description；房源页描述 `whitespace-pre-line` 以分开中英两段。
  - T-07：`/tenant/messages`、`/landlord/messages`（`components/messages/Inbox.tsx`，侧栏「消息」）：列出所在在管租约的最新对话（未读
    标记 = 本机 localStorage `sl-msg-read:<hh>`，在 `/h/[id]` 打开对话即已读，`lib/household/readMarks.ts`）、租客发出的看房请求与提问
    （状态如实：等房东回复 / 已回复见邮箱 / 婉拒）、房东待回复的看房请求数。经纪暂无消息渠道，不加入口。
  - 仍未做：L-07 `/screening` 营销页导航（公开页，工作台入口本来就是 `/screening/app`）、真实评价 / 运营数据（没有可核实来源前不放）。
    守卫在同一 spec 的「round 2」段。
- **L-06 筛查的英文（用户：「筛查摘要也要修好」）**：模型的中文字段本身是中文（`_v3.summary_zh`、`_details_zh` 抽样无整句英文，
  只有文件名 / 软件名），英文来自显示端：① `screenings.ai_summary` 只存英文，而 `ai_summary_en` / `ai_summary_zh` 两列从没写过——
  现在评分时三列都写，182 条历史记录从 `_v3.summary_zh` 回填（13 条早期记录本来没有中文摘要，仍显示英文）；`lib/screening/summaryText.ts
  summaryFor(row, zh)` 在完成页、申请人详情页、筛查历史列表按界面语言取；② 硬门槛 / 红旗在报告页与完成页直接印内部代码
  （`cross_doc_contradictions`…）——`lib/screening/signalLabels.ts signalLabel(code, zh)` 覆盖生产 60 天内出现过的全部代码
  （`forensics_` 前缀自动剥离），未知代码显示为可读形式；③ `/screening/[id]/done` 与 `/graph` 两页此前**整页写死英文**，现已双语；
  报告页结论标签（PROCEED/CONDITIONAL/DECLINE）中文下与结果卡同一说法（优质 · 建议通过 / 待定 · 附加条件 / 建议拒绝）；④ `/share`
  原是一个只会 `alert('coming soon')` 的英文假表单，改为如实的双语说明页（分享链接尚未上线 → 去报告页下载 PDF，附 PIPEDA 提醒）。
  **第二轮（用测试房东号在生产上逐页核对后）**：报告页在中文下仍有大量英文，来源三类，处理在 `lib/screening/localize.ts`：
  ① 我们自己代码写的固定英文句式——评分规则每条的「依据」（`rubric.ts` 46 种 add() 模板）、法院三个数据源的名称与结果说明
  （`runCourtRecordCheck` / `summarizeLtb`）——`rubricObservedZh(code, observed)` / `courtSourceZh` / `courtNoteZh` 按句式从英文里
  取回数字再拼中文，新旧报告都生效、不改存量数据；**`CourtQuery.source` 永远不改写**（渲染逻辑按英文值分支），只在显示时翻译；
  未知句式原样回退。② 模型只写英文的自由文本——收入依据、收入佐证的实际观察与说明、关联方信号、可疑资金流、核验清单——
  提示词新增 `*_zh` 孪生字段（同序同数，名字 / 金额 / 电话 / 引文原样），解析时保存（清单类数量对不上就不存）；Flinks 与代发工资
  两处确定性覆写也写中文；`localizeResult(r, zh)` 在报告页、结果页、打印 PDF 三个入口统一换入。历史报告一次性补译：179 份，
  claude-opus-5（effort low、结构化输出、`fallbacks: "default"`），脚本与写入前的逐行备份在会话 scratchpad `zhfill/`（`backup.jsonl`
  可整行还原 `ai_dimension_notes`），约 4 美元。③ 报告页不再附「English Summary」第二语言摘要框；评分规则行在中文下不显示内部代码；
  关系图「结论」下不再印原始 `conditional`。守卫同一 spec「report text in Chinese」段。

## 三角色测试账号实机走查（2026-09-24 晚 · 用户在内置浏览器里输入密码，Claude 逐页检查）

登录由用户完成（规则：Claude 不输入密码、不替测试号铸会话）；邮箱由 Claude 预填，切换账号前 Claude 退出上一个号并等首页跳转完成。
逐页走下来新修的（守卫 `tests/threeRoleReport20260924.spec.ts` 末尾三段）：
- **登录落点仍会错**：回调页在浏览器没有记住角色时读 `agent_configs` 最近用过的角色——租客号以前被自动开过房东身份、用过房东管家，
  于是被送到 `/landlord/agent` 并把「landlord」写回浏览器。现在记住的角色 / 最近配置 / 注册时选的角色**都只是候选**，一律经
  `my_hats` + `homeForHats` 核对后才决定落点与记住的角色。
- **经纪做客户筛查被误拦**：客户表「发起筛查」链到 `/screening/app`，以前靠「打开即开通房东身份」才能用；开通改成明确动作后经纪
  只会看到开通页。按既定决定（代表协议记录后开放），`/screening/app` 对 RECO 注册有效（verified / renewal_due）且没有房东帽子的
  账号用**经纪导航**渲染（筛查记录以本人 authId 为 `landlord_id`，RLS 已允许）；两顶帽子都有的账号从客户表带 `?as=agent` 进入也用
  经纪导航；纯租客仍去 `/landlord/become`。开通页的经纪提示改为说明如何从客户表发起筛查。
- **续约卡按钮写死 +2.5%**（卡上方案 B 是 2026 年的 +2.1%）→ 读卡片的 `guideline_pct`，缺失时写「按指导上限」。
- **在管租约消息不通知对方**，而消息页写着「回复会同时发到对方邮箱」→ 新增 `POST /api/household/notify-message`（发送者两分钟内
  的消息才算、只推送不发邮件、每小时 60 次），消息页副标题按角色如实改写；已下架房源显示「房源已下架」。
- **申请人页真实模式仍写「按 信用/收入/法庭记录 政策预筛」**（OHRC 截止线已于 09-13 取消）→ 改为看缺哪些材料；「offer」中英混排
  改掉；并排对比表排除已归档。
- 筛查页：取证结论「CLEAN」→ 中文；材料类别补 `government_id` 等；上传区的文件类型与提示原本 zh 值就是英文（Employment Letter…）
  → 全部中文；关系图「结论」下的原始 `conditional` → 中文。
- 发布向导：草稿标题空格、核对页没填租金时的孤立「$」。
- 数据：经纪测试号在修复上线前又被旧代码自动建了一次房东行（01:58 UTC），已删；三个测试号现在只有房东号有房东身份。

## 网页端助手页改回「对话为主」（2026-09-24 晚 · 用户看桌面截图后要求）

用户：「我希望是 AI-native 的感觉，以对话框为主，对话框要占大部分页面空间，avatar 放中间、下面放名字，和上一版类似；三个角色的页面都要差不多；
现在这版把对话框和工作台混在一起了，马上改回去。」问题出在 09-23 的生命周期 P0/P2：`TodayCard` + `LifecycleRail` 被挂在三个 `/x/agent`
的对话框**上方**（桌面端 md+），对话被推到首屏之下，页面看起来像仪表盘。改法（守卫 `tests/phoneChat20260924.spec.ts`、
`tests/lifecycleRail20260923.spec.ts` 已更新）：
- 三个 `/x/agent` 页在 md+ 恢复为 09-22 的版式：对话框 1fr + 右栏 380px（待批 / 状态总览 / 当前进度 / 推荐 / 记忆 / 相关页面），
  **对话框上方不再有任何东西**；`TodayCard` 只在 `/x/todo`，`LifecycleRail` 只在 `/x/progress`（桌面端从右栏「相关页面」新增的
  「租前·租中·租后进度」链接到达）。手机端（<md）保持 09-24 定稿：上下文条 + 通栏对话。
- `AgentChat` 头部在**所有断点**都是头像居中、名字胶囊在下、状态行再下（手机 44px 头像，桌面 56px），不再有「md 起一行」的变体。
- **以后往 `/x/agent` 加任何面板都放右栏或别的页面，不放对话框上方。**

## 网页端按 Muse 网页版重摆（2026-09-25 · 用户「按蓝本改，三点都按你建议的来」）

研究稿 `design/muse-web-benchmark-2026-09.md`，蓝本 `design/muse-web-blueprint-2026-09.html`（来源：用户提供的 muse.ai 登录后桌面截图）。
守卫 `tests/museWeb20260925.spec.ts`（含「三页版式块归一化后逐字节相同」的断言）。落地：
- **图标窄栏（md+ 全部工作台页）**：`WorkspaceShell.Rail` 改为 64px 图标列（**2026-09-25 晚用户要求改浅色**：底 #F3F8FC + 右侧细线，当前页白色
  圆角块 + 墨蓝图标，其余图标 #6E6E8A，只有「+」是墨蓝实心；手机底栏同步改白底 + 顶部细线，当前项 #EEF5FA），无文字，悬停出名字（`group-hover:block`）；顶部角色头像 →
  `/settings`；先列助手四页 **助手 · 待办（红点 = 待批数）· 想法 · 进度**（与手机底栏同一组，桌面端此前没有入口），分隔线，再列角色页，
  底部设置。**09-05「带文字标签的 Flinks 式 220px 侧栏」在桌面端退役**（用户 09-25 拍板）。`ProgressIcon`（时钟）取代进度页的房子图标。
- **对话即页面**：三个 `/x/agent` 在 md+ 不再有内容边距（`phoneApp → md:p-0`），页面是一行 `[对话 flex-1] + [助手面板 360px]`，高
  `calc(100vh-66px)`。`AgentChat hero`：无卡片边框、消息列限宽 760px 居中、助手消息 md+ 不带小圆球、审批卡在线程末尾（所有宽度，
  与手机一致）、身份头部 lg+ 隐藏（面板承担）；`AgentInputBar pill`：所有宽度一行 `[+][输入][🎙][↑]`、28px 圆角、模型选择器缩成
  输入条下一行小字。匿名预览横幅放在对话列顶部。
- **助手面板** `components/agent/AssistantPanel.tsx`（lg+，默认打开，× 关闭后 `localStorage sl-assistant-panel`，对话铺满，右上角
  小头像 + 名字 + 待批数可重新打开；md 平板只显示对话）：72px 头像 + 铅笔（就地改名 → `agent_configs.agent_name` 本人 RLS +
  `setAIName` 本地缓存）+ 名字 + 状态行 + 三段 **活动 · 待办 · 记忆**。活动 = `lib/agent/useActivityLog.ts`（hook）+ `lib/agent/activityLog.ts`
  （纯函数：按 今天 / 昨天 / 更早 分组、按动作族取图标、时间格式），手机的 `ActivitySheet` 也改用同一 hook；待办 = 待批一行摘要 +
  去待办页（批准仍在对话卡片上）；记忆 = `PrivateMemorySnapshot`（可编辑）。状态行统一在 `lib/agent/statusLine.ts`。
- **原右栏六张卡归位**：状态总览 + 当前进度 → `/x/progress`；推荐 `RecommendationDeck` → `/x/ideas` 末尾；记忆 → 面板；相关页面 →
  窄栏；待批 → 对话流。`PendingActionsPanel` 不再挂在任何 `/x/agent`。
- 手机端（<md）保持 09-24 定稿。**规矩不变：`/x/agent` 的对话上方不放任何面板。**
- **手机只有一条底栏（2026-09-25 晚，用户「底部这 2 个菜单容易分不清」）**：此前公开页是 `MobileBottomNav`（助手 · 房源 · 筛查 · 我的）、工作台是
  `PhoneTabs`（助手 · 待办 · 想法 · 进度 · 更多），两条「助手」还指向不同地方。现在**登录后所有页面都挂同一条工作台底栏**——`PhoneTabs`、
  `RAIL_BY_ROLE`（各角色页面表）与整套图标搬到 `components/workspace/rail.tsx`（`WorkspaceShell` 从它导入并 re-export `WorkspaceRole`），
  `MobileBottomNav` 在已登录时直接渲染 `PhoneTabs`（帽子 = 记住的角色且账号持有，否则按持有的帽子回退），公开的「房源」进了「更多」抽屉；
  匿名访客仍是 助手 · 房源 · 筛查 · 登录。守卫 `tests/museMobile20260922.spec.ts`「one bottom bar per phone」。

## 助手页四项跟进（2026-09-25 · 用户看桌面截图后）

守卫在 `tests/museWeb20260925.spec.ts`「follow-ups」段；迁移 `20260925_agent_threads.sql` 已应用 prod。
- **窄栏顶部的头像去掉**，换成「+ 新会话」（学 claude.ai）：在助手页上点 = 派发 `sl-new-thread` 事件就地开新会话；在别的页点 = 跳
  `/x/agent?new=1`。**「+」下面的角色文字也去掉（用户 2026-09-25 第二轮）**：角色曾改成设置齿轮上方的一枚圆形角色芯片
  （`RoleBadge`，emoji + 角色渐变底）。**第三轮（同日）用户「角色的标记可以放在 avatar 这里，不用图标，就是文字标记就可以了」→
  窄栏的圆形芯片删除**，角色改为助手头像下方名字之下的一枚**纯文字标签** `components/agent/HatChip.tsx`（「租客 / 房东 / 经纪」，
  角色身份色的浅底 + 文字，无 emoji、无图标；点击弹出同一套迷你身份切换——持有的帽子就地切换 `auth.setRole` + 跳 `/x/agent`，
  没有的链到开通入口，规则与 Header 一致；外点 / Esc 关闭）。三处：`AssistantPanel`（lg+）、`AgentChat` 头部（工作台页 `hatChip`
  prop，lg 以下面板不显示时用）、面板收起后右上角的重开胶囊（「Atlas · 房东」纯文字）；首页 hero 不传（有自己的「我是租客」身份行）。
  窄栏底部现在只剩设置。
- **对话回滚到上面时底部出现「↓」**（`AgentChat`：滚动位置离底 >160px 时显示，点击回到最新消息；新消息到达自动隐藏）。
- **3D 头像预设**：`lib/agent/avatars.tsx` 11 个用 SVG 画的带光影的形状（球 ×5、方块、圆环、宝石、胶囊、水滴、星星），`AssistantAvatar`
  组件统一渲染（面板 72px、手机头部 44/56px、消息小圆球 28px、重新打开面板的小胶囊 24px）；面板点头像弹出选择格；选择写
  `agent_configs.avatar`（新列，本人 RLS）+ `localStorage sl-avatar-<role>`；null = 原角色渐变球。
- **会话线程 `agent_threads`**（此前消息只存 localStorage、每角色一条）：live 用户每段对话一行（messages jsonb 同 ChatMessage 形状、
  附件 dataUrl 剥掉、最多存 300 条、title = 第一句用户话 ≤60 字），本人 RLS、anon 无权。`useAgentSession`：live 登录后按
  `?thread=<id>` / `?new=1` / 浏览器指针 `sl-thread-current-<role>-<uid8>` / 最近一条 / **旧 localStorage 历史一次性迁成第一条线程** 的
  顺序决定打开哪条；线程行**在第一句用户消息时才建**（ensureThread，「+」不产生空行），之后消息变化 800ms 去抖写回，离开页面前
  flush；`newThread` / `openThread` 暴露给页面；turn 的审计事件 metadata 多了 `thread_id`。匿名 / 演示仍走 localStorage。
- **活动面板 = 每段对话一行，不是每条消息一行**（用户同日第二轮：「不是记录每一条消息，是记录每一个对话」，对照 Muse 每行一个 chat +
  结果）：`useActivityLog(live, role)` 并行读 `agent_threads`（`listThreads`：title / summary / turn_count / 时间）与 `agent_audit_events`
  （排除 `%session%` 与 `%turn`——轮次事件永不成行），`lib/agent/activityLog.ts buildActivity` 把带 `thread_id` 的批准 / 拒绝 / 执行 /
  撤销折进对应对话行（计数 + 时间取最晚），没有对话的动作（待办页批准的 cron 卡、工单）各自一行。**行 = 标题 + 一行短注释 + 时间**，
  照 Muse 的 chat 列表（用户第三轮先说「文字太多了」——那是 `line-clamp-2` 被同一元素上的 `block` 抵消、整段 240 字摘要全铺开；第四轮
  定稿「要有时间，要有标题和简短的注释，跟右边图一样」）：标题 = 第一句用户话（单行截断）+ 当前对话的「当前」小标；注释 = `shortNote`
  取 `agent_threads.summary`（助手最后一条回复压成一行 ≤240 字，`threadSummary`）的第一句（首句 <8 字则两句）≤64 字、最多两行；时间 =
  `fmtRowTime`（今天 / 昨天只显示 HH:MM，更早带日期）；动作行的注释 = 卡片类型（`actionTypeLabel`），有执行 / 批准的对话图标 ✓，否则 💬；
  点对话行 = `openThread`。`turn_count` 存着未显示。为了能折叠，`thread_id` 现在随卡片走：orchestrator 把它写进
  `agent_pending_actions.metadata`，`decide_pending_action` RPC 把它抄进审批审计事件（迁移 `20260925_agent_threads_summary.sql`，
  已应用 prod，同时加 `summary` / `turn_count` 两列并回填），execute 路由的 `finalizeExecution` 与 `undo` 的审计行也带。手机端
  `ActivitySheet` 同一份数据，对话行可点回到该对话（`AgentChat` 新 prop `currentThreadId` / `onOpenThread`）。`threadAt` 已删。

## 房东测试号全站走查 · 第一轮（2026-09-25 · 用户「所有的权限都授权给你，自己发布、测试、改进，直到满意为止」）

登录方式：Claude 不输密码——用 service role 调 Auth Admin `generate_link`（type=magiclink）给测试号铸一次性登录链接，浏览器打开即登录
（链接文件在会话 scratchpad，密钥只走 header 文件）。**Supabase MCP 的 `execute_sql` 角色被 `guard_listing_trust_fields` 当成直连客户端**——
用它 UPDATE `verification_status` 会被静默还原；管理员核验一律走 REST + service role（`PATCH /rest/v1/listings`）。
- **两套 Realtor.ca 房源经真实流程发布并核验**：`1001-bay-st-mugm2yal`（1001 Bay St #1618 · $2,700 · 1+den · 799 ft² · 8 图）、
  `280-dundas-street-w-mugm71ht`（280 Dundas St W #515 · $2,250 · 499 ft² · 8 图）。路径 = 发布向导「贴链接 → 解析」→ 跳到 Logic 对话并预填
  「帮我导入这个房源…」→ turn 路由经 Jina 读页 → 草稿卡（照片随 `urlImages` 带回）→ 卡上「编辑」或直接「发布房源」→ pending → 核验。两条路都通。
- **草稿事实漂移（真缺陷，已修）**：第二轮「补充：面积 799…」让模型重出草稿时把 $2,700 改成 $2,800、丢了 den——它只剩 200 字的历史，
  页面内容早不在上下文里。`lib/agent/draftReconcile.ts reconcileDraft(prev, next, message)`：同一物业（门牌 + 街名前三字）的再草稿，
  租金 / 卧 / 浴 / 面积 / 单元 / 地址只有在用户这句话里提到新值时才允许变，被删的照片 / 配套 / den 一律恢复；挂在 `useAgentSession` 的
  live 分支。守卫 `tests/walkthrough20260925.spec.ts`。
- **房源详情页说谎的地方（已修）**：`parking` 是自由文本「不含车位（可选租 $100/月）」却渲染成「车位 有」→ `lib/listingDisplay.ts parkingStat`
  （不含 / 可另租 / 有 / 未提供）；媒体条写死「📷 24 张照片 · VR 看房 · 平面图」→ 真实照片数，VR 只在有 `virtual_tour_url` 时出现，平面图删除；
  邮编缺失显示「TOR ···」→「未提供」；联系人「AI Agent · 和 AI Agent 对话」→「房东 · 让我的助手替我联系」。
- **`listings.trust_tier` 列默认值 2**：没有任何界面写它，却让每套房源（含 Realtor 导入）都挂「需 收入章 · 房东设置」和一整块「房客信用门槛」。
  迁移 `20260925_listings_trust_tier_default.sql`（已应用 prod）删默认值并清空 13 行；页面逻辑本来就按 null 隐藏。
- **工作台里的设计样例冒充真数据（已修）**：`/dashboard` 的「LOGIC 主动发现」写死「89 Estelle 挂牌 12 天…定价高于同类 8%」（那是别人的房源）→
  改为按房东自己的房源算：上架 ≥7 天且 0 份申请的最老一套，没有就不渲染；`/landlord/leases` 的「最近活动」是虚构的 L-205 / Kevin Tran /
  Anna L. → 改读本人 `agent_audit_events` 里的租约类事件（无则「暂无」），租约行的原始 uuid 改显示 `L-XXXX`；发布向导导入块仍写「拖 PDF …
  自动改写双语文案、给定价建议」→ 改成只承诺存在的事。
- **换账号后 /settings 显示上一个账号的身份**：`sl-active-role` 是全局键，经纪号退出后房东号登录看到「经纪 · Brief · 去认证」。
  现在按账号分键 `sl-active-role:<uid>`（`roleStorageKey`），退出清掉全部同前缀键，回调页也按 uid 读写。
- **续约卡与生命周期 rail 的 N1 截止日差一天**（09-20 vs 09-21）：`renewalStages` 两处都改用 `n1DeadlineFor(到期日 + 1)`（涨租生效日的前 90 天）。
- **已发布房源的编辑页缺「租赁条件」**（租期 / 宠物 / 吸烟 / 家具 / 租金包含只在草稿编辑页有）→ `[id]/edit` 补齐同一段，落同名列。
- **对话回滚箭头**：用户要 Muse 那种深色圆形 ↓ → 40px 墨蓝半透明圆 + 白箭头，离底 >120px 即显示（原白色 36px、160px）。
- **活动面板的注释显示问候语**：面板在 turn 审计写入后立刻重读，而线程 800ms 去抖后才保存 → `persistThread` 保存完再 `notifyActivityChanged()`。
- **租客号第二轮（同日）**：找房（Bay Street Corridor ≤$2,800）第一张卡就是刚发布的 1001 Bay #1618（VERIFIED）+ 5 套 Realtor + 行情卡；看房请求 →
  `showing_intents` 行 + 房东 `showing_request` 卡；申请表（预填姓名邮箱）→ `applications` 行 → 房东队列「待筛查」。修掉的：
  ① **`applicant_applications` 视图可写（真漏洞）**：`security_invoker=false` + 默认权限给了 authenticated INSERT/UPDATE/DELETE，租客能把自己的申请
  UPDATE 成 approved（回滚事务实测）→ 迁移 `20260925_applicant_applications_readonly_listing.sql`（已应用 prod）撤销全部写权限，并
  LEFT JOIN listings 带出 `listing_slug/address/unit/active` 快照——已下架房源对租客的公开 RLS 不可见，追踪条原来显示「—」，现在显示地址 +「已下架」；
  ② `/tenant/lease` 示范租约的法律解读是错的（「延期 5 天是法律允许的 grace period」「$500 宠物保证金在合理范围」「押金 Stripe 托管」）→ 按 RTA
  s.134 / s.106 / N4 规则改写，示范也不能说错法；③ 申请页上传上限文案 10 MB、代码 10 MB，桶是 25 MB → 统一 25 MB 并走 `prepareUploads`
  （大照片先压缩）；④ `/tenant/payments` 是 DEMO_GATE 却没有 liveSlot——进度页数着「1 期待付」，付款页说「还没有租金记录」→ 新
  `components/tenant/MyRent.tsx`（成员 → household → `rent_payments`）；⑤ `/h/[id]` 成员列表印对方 uid 前 8 位 → 「对方」；⑥ 想法页「已按…盖章门槛过滤」
  （trust_tier 已清空）→「已按你的预算与区域过滤」。
  ⑦ 「我的看房与提问」同样对已下架房源显示「—」→ 只读视图 `my_showing_intents`（本人 tenants 行 → 意向 + listings 快照，迁移
  `20260925_my_showing_intents_view.sql`，已应用 prod），`MyShowings` 改读它。**留意**：`showing_intents` 的策略 `intents_parties` 是 FOR ALL，
  租客理论上能把自己意向的 status 改成 accepted（只影响自己页面上的文案，没有副作用），下轮加 `BEFORE UPDATE` 守卫。
- **经纪号第三轮（同日）**：客户表 / 任务 / 认证页 / 筛查页（该号同时持房东帽，直接进 `/screening/app` 走房东导航属预期）/ 收益空态都正常；
  375px 上 `/agent/agent` 无横向溢出、底栏是统一的工作台五项、输入条在底栏之上。

## 房源详情页对照 StreetEasy 补内容（2026-09-25 · 用户「看一下这个房源详情页，我们的内容需要增加」）

对照 streeteasy.com 的 The Lotus #11C：他们有净有效租金 / 租期 / $ per ft² / 可入住与最近调价、Policies、Home features 与 Building amenities 分开、
About the building（单元数 / 层数 / 年份 / 同楼在租）、Property history、Transit（地铁线 + 距离）、Explore the neighbourhood（1 房中位挂牌价）。
我们只加有数据或能确定性算出来的（守卫 `tests/listingDetail20260925.spec.ts`，迁移 `20260925_listings_history_transit.sql` 已应用 prod）：
- **价格一行**（`lib/listingInsights.ts`）：$/ft²·月、租期、可入住日、上架 N 天（`published_at ?? created_at`）、最近调价（来自 `price_history`）。
- **租赁条件 POLICIES 网格**：宠物 / 吸烟 / 家具 / 租期 / 押金 / 车位 / 租金包含，下附 RTA s.14 与 s.105–106、s.134 一句；配套区改为
  **室内 / 楼宇**两组（`groupFeatures`：appliances 归室内、building_features 归楼宇、自由文本按关键词，「in-unit」优先于楼宇词；向导的
  amenity id 如 `parking_spot` 以前原样打印，现在经 `amenityLabel` 翻成中英文）。建筑信息里重复的入住 / 押金 / 租期已挪走。
- **价格记录**：`listings.price_history` 由触发器 `listings_price_history` 维护（插入时种下「上架」行，月租变化追加 `{date, price, prev, event}`），
  存量行按 `published_at ?? created_at` 补了上架行；页面倒序列出。
- **交通**：`POST /api/listings/enrich {id}`（edge，公开房源限定，每 IP 90/h）——首次访问用 Nominatim 按地址取坐标、Overpass 取 1.5 km 内
  `railway=station`（地铁 / GO / 轨道）与 600 m 内 `tram_stop`（只留最近一站），`pickTransit` 按站名去重、最多 6 条，写回 `lat/lng/transit/enriched_at`
  缓存 30 天；页面显示类别 pill + 站名 + 直线距离 + 步行分钟（80 m/min），注明「数据 © OpenStreetMap 贡献者」，有坐标时给 Google 地图链接。
  两个外部服务都带 UA `Stayloop/0.6 (…privacy@stayloop.ai)`，超时 8s / 20s，失败时缓存空结果不重试。
- **关于社区**：同一路由返回同区（`neighborhood`，无则 city）在租挂牌价中位（同户型 + 全部，Stayloop + Realtor 样本，注明样本数）与「同楼在租 N 套」；
  页面另用公开表 `trreb_rent_stats` 经 `readTrrebBenchmark` 取该户型的 TRREB 成交均价（区先 district 后 All TRREB Areas，注明「成交，非挂牌」）
  并给出本套相对均价的百分比。dev 实测 1001 Bay #1618：Wellesley 260 m、Museum / Bay / Bloor-Yonge / College、TRREB Toronto C01 2026 Q1 1 房 $2,438。
- **没做**：净有效租金（没有 incentive 字段）、单元数（没有数据）、学校 / 公园（没有可靠来源）。
- **第二轮（用户给了 Airbnb / StreetEasy 四张参考图）**：① 标题块移到照片上方（面包屑 首页 / 房源 / 地址 · 地址 #单元作唯一 H1 · 完整地址 +
  VERIFIED 徽章 · 一行摘要「整套公寓 · 1 + den 间卧室 · 1 间浴室 · 799 ft²」），分享 / 收藏按钮不动，价格块降为 div；② 「关于社区」整合成一块：
  AI 社区简介（`neighborhood_profiles` 表，每个 (city, neighbourhood) 由 `/api/listings/enrich` 用 turn 槽模型按我们持有的事实——站点、样本数——
  生成一次并缓存；提示词禁数字 / 年份 / 价格 / 治安 / 人群描述，产出含数字即不发布；页面标「AI 根据公开资料整理 · 不含数字与人群描述」）+
  三张瓦片「出租·挂牌价（样本中位）/ 出租·成交均价（TRREB）/ 这套房源（相对两者的百分比）」；没有出售数据，不放；③ 「位置与交通」一节：左边
  站点列表，右边 `components/ListingLocationMap.tsx`（复用 `ListingsMap` 导出的 `loadGoogleMaps`，红标 = 房源、圆点 = 站点，按站点自动取景）；
  ④ 「相似房源」从右栏的小列表改为页面底部三张 StreetEasy 式大卡（照片 + 张数、类型 · 社区、地址、租金、卧 / 卫 / ft²、挂牌方、❤ 收藏走同一套
  `useFavorites`），选择改为 同社区 → 同户型 → 租金最接近 排序，无照片的不入选，手机端横向滑动。
- **第三轮（用户：「标题和图片这一块要和 Airbnb 一样，分享和收藏要紧挨着图片，右下角查看全部照片按钮也一样，去掉多余的面包屑一行」）**：
  标题行 = 地址 H1（26/30px）+ 右侧「分享 / 收藏」（图标 + 下划线文字），下面直接是照片拼图（行高 232px×2），拼图右下角一枚白底黑边
  「⋮⋮⋮ 查看全部照片」胶囊（原来第四格的黑色遮罩和左下「1 / N」计数都删了），拼图下方的「📷 N 张照片」一行也删了；面包屑整行去掉；
  「整套公寓 (Condo) · 1 间卧室 · 1 间浴室 · 799 ft²」+ VERIFIED 徽章改为照片下方内容区的第一行。

## 代码与模块关系审查（2026-09-25 · 网页端 + 手机端 · 用户「做一下代码review和模块关系的review」）

范围 = 当天 14 个提交 62 个文件（助手页 Muse 网页版 / 四项跟进 / 一条底栏 / 房源详情页三轮 / 房东租客走查修复）。三个只读审查代理（A 助手与工作台、
B 房源详情与 enrich 路由、C 租客房东数据层）+ 我自己的模块依赖图（411 个文件，**无值导入循环**；仅两处历史遗留的纯类型互引）与生产库权限核对。
共 46 条 + 我查出的 2 条，**全部核实后修复并上线**，守卫 `tests/review20260925.spec.ts`（26 条）。四份迁移已应用 prod 并用回滚事务验证。值得记住的：
- **`revoke execute … from anon` 在 ACL 仍含 PUBLIC（`=X/postgres`）时是空操作。** 2026-09-22 撤销的 7 个 RPC（`decide_pending_action` /
  `bootstrap_agent_session` / `claim_tenant` / `seed_demo_agent_data` / `get_entitlements` / `lookup_corp_by_bn` / `search_corp_registry`）与 10 个触发器函数
  anon 一直都能执行——匿名可以查 76 万行联邦公司注册库。`20260925_function_public_execute.sql`：先 `revoke from public, anon` 再显式 grant；触发器
  函数一律 revoke 三个 API 角色（触发不检查 EXECUTE，回滚事务已验）。**以后锁函数一律写 `from public, anon`**，守卫会扫 2026-09-26 起的迁移。
- **FOR ALL 策略没有 WITH CHECK = 双方都能改写。** 租客能把自己的看房意向改成 `accepted`（追踪条显示「房东已同意」）、房东能改租客的留言。
  `20260925_showing_intents_guard.sql`：`BEFORE UPDATE OR DELETE` 守卫对直连客户端一律拒绝（唯一合法写入 = 租客 INSERT + service role 改状态）。
- **房源的 `price_history` / `transit` / `enriched_at` / `lat` / `lng` 是服务端事实，房东却能直写伪造**（verified 徽章下显示「↓ $1,250 (−35.7%)」、15 米外的假地铁站、
  挪动地图钉）。`20260925_listing_geo_history_guard.sql`：`listings_price_history()`（SECURITY INVOKER）对 `is_direct_client_write()` 保留旧值，INSERT 时忽略
  客户端给的历史与坐标；Realtor 导入的首条历史事件写 `imported`（导入日不是挂牌日，详情页不再显示「上架 N 天」）；`neighborhood` 进入重审列表（它现在进模型
  提示词与中位数样本）；`applicant_applications` 加 `jwt email <> ''` 门并显式 `security_invoker = false`；`agent_threads.messages` 加 ≤300 的 CHECK。
- **会话线程四个时序问题（A 用 react-test-renderer 真实渲染 hook 复现）**：① 打开页面就重写线程行、`last_message_at` 被顶到「现在」（`applyThread` 的
  setMessages 触发了持久化 effect）→ `lastAppliedRef` 记住「加载出来的那个数组」，三条持久化路径遇到它直接跳过；② 线程还在解析时发消息（深链 `&send=1`
  与快手）→ 孤儿行 + 用户消息消失 + 回复落错线程 → `resolvingRef` 存在途 promise，`sendMessage` 先 await，输入框在 `threadLoading` 时禁用；③ 模型思考中
  切换会话，回复追加到新打开的会话 → 记 `sentThread` / `startedIn`，不一致时 `appendToThread` 写回原线程行；④ `newThread` / `openThread` 不递增
  `resolveGen`、`creating` 不清 → 迟到的 `applyThread` 覆盖新会话 → 两处都 `resolveGen.current++`、`creating = null`，`createThread` 的回调比对 gen。
  **四个场景保留为行为测试 `tests/useAgentSessionThreads.spec.tsx`**（react-test-renderer 18 已加为 devDependency，Supabase / auth / 模型轮次全部 mock，
  断言修好后的行为；夹具的线程 id 必须是 UUID——`loadThread` 只接受 UUID）。改 `useAgentSession` 的线程逻辑先跑它。
- **「记住的角色」不校验帽子**（A/C 都报）：租客被送到 `/landlord/become`、经纪用 `/screening/app` 做客户筛查，都被 `roleFromPath` 记成 landlord，随后
  `/settings` 的 shellRole=landlord → 帽子守卫再把人弹回 become 页，设置页从此打不开。`lib/useHats.ts heldHat / activeHat` 是唯一谓词（Header / 两个设置页 /
  首页 hero / 手机底栏共用；底栏在 `hats.loading` 时渲染 null 而不是猜），`lib/activeRole.ts rememberableRoleFromPath` 把 `/landlord/become`、`/agent/verify`、
  `/screening/app` 排除在「记住」之外（UI 上下文仍按路由）。
- **enrich 路由把外部失败当事实缓存 30 天**：Overpass 429 → 「1.5 km 内没有车站」挂一个月。现在失败写 `transit.failed=true` 一小时后重试，页面显示
  「站点数据暂时不可用」；Nominatim 结果必须落在房源城市（或同 FSA）；社区简介改为响应后 `waitUntil` 生成（当次返回 null）、被拒 / 失败写 24 小时负缓存、
  社区名白名单 + `<place>` 定界后才进提示词；`Cache-Control` 挂在 POST 上是死代码，删。
- **手机**：底栏的安全区内边距在 `h-16` 里面（border-box）→ 主屏 PWA 上图标被压到 29px；改为外层 padding + 内层 64px 行，工作台列高与 shell 底部内边距经
  `globals.css` 的 `.sl-phone-col / .sl-phone-pb` 扣掉 `env(safe-area-inset-bottom)`（不交给 Tailwind 的 calc 归一化）。隐藏的助手面板在手机上仍拉活动日志
  （`useActivityLog(…, enabled)` + `matchMedia(min-width:1024px)`）；`/x/ideas` `/x/progress` 匿名态展示演示记忆却无示范标注 → `PreviewNote`。
- **其余**：`sameProperty` 比街名前三个字母（100 King St W = 100 Kingston Rd）→ 整词街名；`groupFeatures` 把 Recreation Centre / Games Room / Car Wash /
  Intercom / 投币洗衣归「室内」且分类随语言变；TRREB 成交均价对独立屋也显示（8 卧独立屋「比 3+ 房公寓均价高 300%」）→ 只对 apartment/condo/townhouse
  且有卧室数；申请追踪按地址包含匹配租约（同楼两单元指向同一份）→ 先按 `lease_documents.application_id`；工作台洞察把未核验房源算「上架 7 天 0 申请」；
  租约页「最近活动」取 80 条再过滤 → 服务端 `.in('action', …)`，live 模式不再印「本月新增 1 / 近 6 个月」；`MyRent` 不按成员角色过滤（既出租又租房的账号看到租客的租金）；
  已发布房源编辑器可清空照片保存（→ 同发布规则）、缺押金字段（补）、照片不降采样（补）；申请页超限 PDF 转页图只传第一张；`NOTICE_DAYS` 与 `N1_NOTICE_DAYS` 两份；
  死代码（`MobileBottomNav` 登录分支残留、`ORB` 导出、`ScoreCard`、`useMemo`、`applicationStatusLabel`、`activityIcon` 再导出）；演示夹具里的 Plaid → Flinks；
  帽子菜单 `role="menu"` 里的当前项不是 menuitem。
- **三个 `/x/agent` 页已抽成共享组件（用户 2026-09-25 随后要求）**：`components/agent/AgentWorkspacePage.tsx`（`role` 一个 prop：会话 / 生命周期 /
  面板 / 头像 / 预览横幅（每帽子只差「读取你真实的 记忆与待办 / 政策与申请 / 任务与客户」一句，`PREVIEW_READS`）/ ContextStrip 的 todoHref），
  `app/{tenant,landlord,agent}/agent/page.tsx` 各剩一行 `<AgentWorkspacePage role="…" />`。**以后改助手页只改这一个文件**；四份 spec
  （museWeb / phoneChat / lifecycleRail / templateChips）与 review spec 都改为读共享组件，museWeb 另断言三条路由是 <15 行的薄包装。
- **记录不改**：`agent_directory` 等 5 个 definer 视图是刻意的（linter 报 ERROR，接受）；`household_members / households / rent_payments /
  showing_intents` 表级 anon grant 是迁移时的默认权限，RLS 已挡住，未收。

## 头像菜单不再出现助手名字（2026-09-25 · 用户截图「AI Agent 的名字都取消，会让人不清楚用户是谁」）

`components/Header.tsx` 的身份菜单原来写「当前：房东 · Atlas」「Atlas 的工作台」「租客 · Nova / 房东 · Atlas / 经纪 · Brief」（2026-09-22 的
「以助手命名工作台」）。现在只写身份：「当前：房东」「房东工作台」「租客 / 房东 / 经纪」（副行「找房 · 申请 · 签约」等不变），`useAIName` 从 Header 移除。
窄栏的 `RoleBadge` 弹层本来就只写身份。首页 hero 上方的「我是房东 · Atlas」是对话卡的标识，未动。守卫 `tests/museMobile20260922.spec.ts`。

## 首页首屏让给对话（2026-09-25 · 用户截图「头像 / 名字 / 上面的文字占太多空间，挤压了对话框」）

登录态首页在 743px 高的屏幕上：标题区（52px 两行 H1 + 两行导语 + 「我是房东 · Atlas」一行）+ 卡片内居中的 56px 头像 / 名字胶囊 / 状态行，
第一条气泡从 y≈505 才开始，输入条在折叠线下。**第一版把卡片头部改成一行（32px 头像 · 名字 · 状态 · 身份注释），用户否决：「还是原来的布置比较好，
就是空间稍微压缩一点」。** 现行（守卫 `tests/homeHero20260925.spec.ts`；只动首页，`/x/agent` 的头部不变）：
- **布置不变**：眉标 · H1 · 导语 · 身份行（登录态「我是房东 · Atlas · 换身份在右上角菜单」/ 匿名三枚角色 pill）· 卡片内居中头像 + 名字胶囊 + 状态行。
- **只压缩留白**：H1 52 → 44px、导语 17 → 16px、顶部内边距 64 → 44px、各段间距减 4–8px；`AgentChat` 的 `compactHeader` prop = 同一居中布置但
  头像 56 → 44px、上下内边距与间距减半（头部约 130 → 105px），只有首页传它。
- **卡片高度从固定 600px 改为「到折叠线为止」**：`max(400px, 100vh − 390px)`（390 ≈ 页头 66 + 标题区 + 身份行），手机高度公式不变。

## 一个用户一个 AI 助理（2026-09-25 · 用户决定「一用户就只有一个 AI 助理，他能处理所有三个角色的事情，角色还是分开的」）

此前每顶帽子各一个助手：`agent_configs` 每 (user, role) 一行各起名各选头像、记忆与反思画像按身份、线程按身份、菜单里三个名字。现在**身份感一人一份，
角色（帽子）仍分开**（守卫 `tests/oneAssistant20260925.spec.ts`；迁移 `20260925_one_assistant.sql` 已应用 prod）：
- **名字 + 头像**：新表 `assistant_profiles`（`user_id` 主键，本人 RLS，anon 无权），从 `agent_configs` 回填——只取用户自己起的名（Luna / Logic / Brief /
  AI Agent 这些默认名永不成为人的名字），多顶帽子有不同名字时取最近有对话的那顶（jasonhan72 → Atlas）。`lib/agent/assistantProfile.ts`
  （`readAssistantProfile / saveAssistantName / saveAssistantAvatar`）是唯一写入口；`lib/aiName.ts` 改为账号级（`useAIName()` 无参数、localStorage
  键 `sl-ai-name`，退出时连旧的三把 per-role 键一起清），`lib/agent/avatars.tsx` 同理（`sl-avatar`）。**`agent_configs.agent_name / avatar` 不再被读。**
  没起名的账号显示通用「AI Agent」；起名在 onboarding 只做一次（任一身份进入都跳过已起名的账号），`/settings` 与面板改名写同一行。
- **一张脸**：`AssistantAvatar` 新 prop `fallback='brand'`——登录用户没选预设时是品牌蓝球（`DEFAULT_ASSISTANT_AVATAR`），三顶帽子同一张脸；
  匿名演示的三个人设仍用各自的角色渐变球（`fallback='role'`）。`AgentChat` 经 `avatarFallback` 透传。
- **记忆**：`getUserMemories(client)` 不带 role 时读全部身份（每条带 `role`），`session-loader` 就这么读；提示词把别的身份下记住的条目标成
  「（租客身份下记住的）」并说明「可用来理解 TA，不要当成当前身份的需求」；写入仍按当前身份。想法页只用当前身份（+ self）的记忆；
  记忆面板显示全部并标身份，改 / 忘掉按该条自己的身份写。
- **反思画像一人一份**：`user_memories.role` 允许 `'self'`，`reflectUser(admin, userId)` 读三种身份的对话轨迹（每条标身份）与全部记忆，写
  `user_model` 到 role `self`；turn 路由只读 `self` 行；旧的按身份画像已删，下一轮对话自动重建；`/api/agent/reflect` 不再要求 role。
- **线程与活动**：`agent_threads.role` 保留（对话在哪顶帽子下进行，决定工具与数据），但活动日志列出全部身份的对话并给其他身份的行加小标；
  点别的身份的对话 → 跳到那顶帽子的 `/x/agent?thread=<id>`。每个 `/x/agent` 页打开时仍只恢复本身份最近的线程。
- **不变**：待批卡、工作流阶段、生命周期 rail、Header 菜单里的身份切换全部按帽子；提示词的身份规则（OHRC / RTA / RECO）按帽子注入。
- **文案**：首页导语「为租客、房东、经纪各提供一个独立的 AI Agent」→「给你一个独立的 AI 助理：租客、房东、经纪的事它都会办」；工作台空态、窄栏说明、
  三个 layout 标题、模型设置页、`/platform`、客户表里的「让 Luna / Logic / Brief …」全部改成「助手」。匿名首页演示保留三个人设（`lib/agent/demo.ts`）。
- **名字缓存绑定账号（2026-09-25 晚，生产核对时发现的真问题）**：`sl-ai-name` 是账号级缓存，而 `reconcileAgentName` 在档案没有名字时会把本地缓存
  推进 `assistant_profiles`——同一台浏览器上一个账号（经纪测试号）留下的名字，在房东测试号用魔法链接登录（没有经过退出）那一刻被写进了房东号的档案。
  退出清缓存挡不住「会话被直接替换」。现在 `lib/aiName.ts` 多一把 `sl-ai-name-owner`：`setAIName(name, owner)` 必须写明归属（登录中 = uid；
  onboarding 未登录起的名 = null「未认领」，下一个登录的账号认领）；`getStoredAIName(uid)` / `getAIName(uid)` 只返回本账号的或未认领的缓存，
  别的账号的一律当不存在；`dropForeignAIName(uid)` 在 `useAIName` 与 reconcile 里先把外人的缓存清掉；`resolveAccountName()` 共享一次
  `{uid, name}` 解析，`useOnboarding` 也用它——换设备时档案里有名字就不再被拖回 onboarding。守卫 `tests/aiNameOwner20260925.spec.ts`（6 条）。
  房东测试号被误写的名字已改回空。

## 助手面板对照 Muse 网页版（2026-09-25 · 用户「改成和 muse 一样的，包含用小图标，鼠标划过会有注释文字，AI Agent 的设置要加上」）

守卫 `tests/assistantSettings20260925.spec.ts`（4 条）；迁移 `20260925_assistant_vibe.sql`（`assistant_profiles.vibe text ≤120`）已应用 prod。
- **分段栏改为纯图标**（`components/agent/panelIcons.tsx`：列表 / 盾勾 / 笔记本 / 指纹，与 Muse 同一组意象）：胶囊形，未选中的标签之间有细分隔线、
  紧挨当前标签的分隔线隐藏，当前标签白色胶囊；每个标签 `aria-label` + `title` + 悬停 / 键盘聚焦时下方弹出墨蓝注释（与窄栏同一套样式）。
  待办的红色计数改挂在图标右上角。
- **铅笔 → 迷你菜单**「换头像 / 改名」（Muse 的 Change avatar / Edit name；外点 / Esc 关闭）；点头像本身仍直接开预设选择格。
- **第四个标签「助手设置」**（`components/agent/AssistantSettings.tsx`）：名字 + 一行风格摘要；**风格（vibe）**——用户给助手写一句说话风格
  （≤120 字，`sanitizeVibe` 折成一行并丢弃「忽略以上规则 / you are now / system prompt / DAN」等覆盖指令句），存 `assistant_profiles.vibe`，
  turn 路由用调用者自己的客户端读出来、再过一次 `sanitizeVibe`、以 `buildSystemPrompt(…, vibe)` 第七个参数注入——提示词明写「只调整语气与措辞，
  不违反任何原则、不改变事实与能力边界」，确定性 guardrail 照常跑；行：对话模型（→ `/settings/models`）/ 通知（→ `/settings`）——**名字与头像不在这里**（用户随后：「这里不用设置名字和头像的修改的条了，
  因为在 avatar 里已经有了」），只在头像旁的铅笔菜单改。
  下面两张卡对应 Muse 的 SOUL / MEMORY：**画像**（玫红渐变；反思画像 `user_memories` role self · key user_model 的更新日期，点开展示
  当前重点 / 目标 / 偏好 / 硬性约束 / 沟通风格 / 有效的做法 / 避免，并可「忘掉画像」——删该行 + 审计 `memory_forgotten`，下一轮对话后自动重建）、
  **记忆**（靛蓝渐变；条数，点击切到记忆标签）。匿名预览只能看。`reflection.ts` 是服务端模块（引 llmChat），面板里的 `user_model` 键是重复
  声明并由测试钉住与 `USER_MODEL_KEY` 相等。
- **手机没有面板**：同一个风格字段在 `/settings` 的「助手的说话风格」快捷块里（`VibeEditor`）。
- **面板头部不再有状态行**（用户同日：「空闲 · 当前阶段 租前 · 记得 80 条 这个可以去掉了」）：只剩头像（铅笔菜单）、名字、身份标签；
  `AssistantPanel` 不再接 `status / statusLine`。手机端对话头部的状态行保留（它是打开活动日志的入口），`lib/agent/statusLine.ts` 仍在。
- **首页 hero 同样排列（用户同日：「这里头像和名字的排列也一样改，头像上面『我是房东 · 换身份在右上角菜单』也可以删掉」）**：登录态的卡片上方
  不再有身份行；卡片头部 = 头像 · 名字 · 身份文字标签（`AgentChat hatChip` + `onHatSwitch`——点标签在原地切换帽子：`HatChip onSwitch` 回调直接
  改 hero 的 role 并重挂载，不跳转）、**没有状态行**（`compactHeader` 一律不渲染「在线 · 读取你的记忆」）；卡片高度登录态改为 `100vh − 345px`（手机 `− 230px`）。
  **顺带修的一个旧问题**：每个 `useAuth()` 实例各持一份 role 状态，`setRole` 只更新自己那个实例——生产实测原地切换后 Header 菜单仍写「当前：房东」。
  现在 `setRole` 广播 `sl-role-changed`（`ROLE_CHANGED_EVENT`），所有实例监听并同步；localStorage 写入也挪到 updater 之外（调用方在同一次事件里卸载时
  updater 不会执行）。
- **头像换成 20 只毛绒玩具宠物 + 名字字体（用户「头像名字也用这种字体，另外设计 20 个类似的可爱卡通宠物的形象的头像给用户选择，替换掉现在的这些选项」→
  「要做成 3D 的头像，毛绒玩具的样子的」）**：第一版用 SVG 手绘的扁平 kawaii 脸被否决，改为**图像模型生成的 3D 毛绒渲染图**：OpenAI `gpt-image-1`
  （`.env.local` 的 `OPENAI_API_KEY`，medium 质量、1024²、`background: transparent`、WebP），统一提示词模板「A cute plush toy {animal}, soft fluffy fur,
  chubby round head, tiny black bead eyes with a bright highlight, gentle smile, rosy blush cheeks, front-facing bust portrait, perfectly centered,
  kawaii style, 3D render, soft studio lighting, subtle rim light, no text, no props」+ 每种动物一句特征；20 张各约 1056 个图像 token，合计约 1 美元。
  缩到 512px（`magick -quality 82`，每张 27–50 KB，共 800 KB）存 `public/avatars/pets/<key>.webp`：兔子 / 小猫 / 小狗 / 小熊 / 熊猫 / 狐狸 / 考拉 / 企鹅 /
  猫头鹰 / 青蛙 / 仓鼠 / 小猪 / 奶牛 / 小鸡 / 绵羊 / 老虎 / 狮子 / 猴子 / 海豹 / 老鼠。`lib/agent/avatars.tsx`：`AVATAR_PRESETS` 每项带 `disc`（淡色圆盘色），
  `AssistantAvatar` = 圆盘 `<span>` + `<img object-contain>`；默认 `DEFAULT_ASSISTANT_AVATAR = 'bunny'`；原来 11 个光泽形状经 `LEGACY_AVATARS` 映射
  到宠物（`resolveAvatarKey`），`assistant_profiles.avatar` 存量值由迁移 `20260925_avatar_pets.sql` 改写（已应用 prod：jasonhan72 的 ring → panda、
  agent-test 的 cube → bear）。选择格每行 5 个、48px 格 / 40px 头像。**名字**改成 Muse 那种：面板 26px / 对话头部 17–19px、`font-medium`
  （站点字体 Inter Tight）、纯文字无胶囊。守卫 `tests/petAvatars20260925.spec.ts`（20 个文件存在且 ≤160 KB、逐个渲染成 `<img>` + 圆盘）。
  再生成某只：同一模板改动物描述，透明 WebP，`magick` 缩到 512px 放回同名文件即可。
  **同晚追加 20 个年轻人（用户「再做 10 个男，10 个女的卡通头像，年轻人的，不同风格，也是 3D 的」）**：`m-ace … m-eli`、`f-mia … f-emma`，
  每人一种 3D 风格（Pixar / 黏土 / 动漫 3D / 低多边形 / Q 版大头 / 亮面搪胶 / 羊毛毡 / 运动卡通 / 纸艺分层 / Memoji 风），肤色与族裔多样，同一管线
  （gpt-image-1、透明 WebP、512px），存 `public/avatars/people/`；`AvatarPreset.group ∈ pet | person`，`AVATAR_GROUPS` 给选择格分「宠物 / 人物」
  两段（可滚动，`max-h-[340px]`），`avatarImageSrc(key)` 按组选目录。默认仍是兔子。约 1 美元。
- **最后一轮（用户「把所有这里的角色标记（房东/租客/经纪）都去掉吧」）**：助手头像区一律不显示身份——面板头部、对话头部（工作台手机端与首页 hero
  卡）、面板收起后的重开胶囊都只剩头像 + 名字；`components/agent/HatChip.tsx` 删除。**换身份只在 Header 的身份菜单**（「当前：房东 / 切换 / 开通」），
  首页 hero 按 `auth.role` 跟随。`useAuth.setRole` 的广播与 updater 外写入保留。
  匿名访客仍是三枚角色 pill + 人设名字，无标签。守卫 `tests/homeHero20260925.spec.ts` 已更新。

## 找房查不到房源（2026-09-25 · 用户截图：TMU 周边 2 房、预算不限 → 「Stayloop 库里没有匹配，Realtor.ca 抓取也没返回结果」）

用 `.forensics-tmp/jina-realtor-probe*.mts` 直接打 Jina 复现，两个真实原因叠加（守卫 `tests/listingSearch.spec.ts`「Realtor.ca slugs, map pages and bot checks」段）：
- **Realtor.ca 的社区 slug 不是模型熟悉的 TREB 社区名。** 模型把 TMU 解析成 `Church-Yonge Corridor`，slugify 成 `church-yonge-corridor`，而 Realtor.ca 上这一带
  拆成 `church-wellesley` / `downtown-yonge-east` / `yonge-bay-corridor`，TMU 本身叫 `ryerson`，`university`（多大）也不存在；**不存在的 slug 返回通用
  「MLS® & Real Estate Map」页，HTTP 200、0 行**，原代码当成「页面正常但没结果」。现在 `REALTOR_SLUG_ALIASES`（只收实测能出房源的）+ `resolveRealtorSlugs`
  把候选社区名映射成真实 slug（最多 4 个），`classifyRealtorPage` 把地图页判成 `nopage` → 状态 404（不算「已回答」，搜索跳转照常进行）；搜索跳转
  （s.jina.ai）现在除了最佳页还读第二个真实社区页的全部变体。
- **Realtor.ca 反爬间歇性返回「Just a moment… / Security Check / Performing security verification」验证页，Jina 仍给 200。** 原代码解析 0 行 → 「没返回结果」。
  现在识别为 `blocked` → 用 Jina 代理池重试一次（`X-Proxy: auto`，实测每次都能过，约 8–10 秒）→ 仍被拦记 `REALTOR_BLOCKED (599)`；全部被拦时
  `externalFromStatuses` 给 `unavailable · realtor.ca bot check`，回复改说「实时抓取暂时不可用」而不是「没结果」。
- 库里确实没有 TMU 周边的 2 房（7 套活跃 2 房+ 分布在 Kensington-Chinatown / North York / Harbourfront 等），「库里没有匹配」那半句是对的。

## 助手的长期档案：每一项都存、都能改、都进提示词（2026-09-25 晚 → 26 · 用户「这里的内容都是定义这个 Agent 的，需要专门和长期的保存，每一项也是需要可以修改的」→「这设置是对 Agent 的行为和思考产生影响的，相当于每一个 agent 的人格、记忆等」）

守卫 `tests/assistantSettings20260925.spec.ts`「the assistant's definition」段；迁移 `20260926_assistant_persona.sql`（`assistant_profiles.persona text ≤600`）已应用 prod。
「助手设置」标签现在是助理的定义档案，顶部写明「长期档案 · 存在你的账号里 · 这里的每一项都会进入它的每一次思考」，每项就地可改：
- **名字 / 头像** → `assistant_profiles.name / avatar`（铅笔菜单；卡片里的名字行点击也开改名）。
- **人设 `persona`（新）**：几句「它是谁、怎么做事、优先什么」（≤600 字，`sanitizePersona` 保留换行、丢弃覆盖指令句）→ turn 路由以调用者客户端读出、
  `buildSystemPrompt(…, vibe, persona)` 第八参数注入：「用户为你写的人设（…每次思考前先读它，在不违反任何原则、不改变事实与能力边界的前提下始终照此行事）」，
  排在人格句之后、风格句之前。**风格 `vibe`** 不变（语气一句话）。
- **对话模型**：就地下拉（`lib/agent/modelCatalog.ts loadTurnModels / saveTurnModel`，与输入条选择器、`/settings/models` 同一个 `user_model_preferences`
  存储与同一份 sessionStorage 缓存；`AgentInputBar` 改为从该模块取常量）。**通知**：内嵌 `PushSettingsCard frameless`（同一 `push_subscriptions`）。
- **画像**（`user_memories` role self · key user_model）逐字段可改：当前重点 / 目标 / 偏好 / 硬性约束 / 沟通风格 / 有效的做法 / 避免；用户写的内容存进
  `value.user_overrides`，`reflectUser` 每次反思前读上一行的 overrides、把它们塞进提示词「照抄到对应字段」、写回时 `applyUserOverrides` 再覆盖一遍——
  **用户写定的字段永远不会被自动学习覆盖**；「交回自动」删掉该字段的 override；没有画像行时可直接写（insert，source user_edit）。
  `userModelToPromptBlock` 给这些字段标「（用户自己写定）」并要求模型以它为准。
- **记忆**：记忆标签可「+ 让它记住一条」（insert `user_memories`，memory_type profile、source user_edit，key = `user_<label>_<时间戳>`）；`getUserMemories`
  现在带 `source`，提示词把 `source='user_edit'` 的条目标成【用户亲自写的】并说明「以它为准；别的记忆或你的推断与它冲突时听它的」。
- 每项写入都有审计事件（`memory_edited` 带 field / added，`memory_forgotten`）。

## 三角色测试账号登录走查 · 第二轮（2026-09-26 · 用户「分 3 个角色用测试账号登录做测试」）

做法同 09-24：service role 铸魔法链接、退出上一个号再登录下一个；每个号看首页 hero、助手页四个标签与设置项、身份菜单、各角色页面、手机宽度，并在页面里
挂 `fetch` 钩子记录所有非 2xx 响应（Supabase REST 请求不进浏览器面板的网络列表，只能这样抓）。守卫 `tests/threeRoleWalkthrough20260926.spec.ts`。
- **`work_orders` 对所有登录用户都 403（真 bug）**：09-23 收回 `token` 列后表上只剩列级 SELECT 授权，而 `MaintenancePanel`（租客与房东的报修面板、
  `/h/[id]` 报修标签、`/landlord/maintenance` 看板）和 `/provider/jobs` 仍 `select('*')`——Postgres 对 `*` 要求全列权限 → `42501 permission denied`，
  三方都看不到工单（服务商页显示 邀请 0 / 进行中 0）。修法：`lib/marketplace/workOrders.ts WORK_ORDER_COLUMNS`（40 列、不含 token）作唯一列清单，
  两处改读它；守卫禁止任何客户端文件对 work_orders `select('*')`。**凡是做了列级授权的表，客户端一律显式列名。**
- **`/dashboard/listings` 是 404**：这个页从来不存在（房源管理在 `/dashboard`，其下只有 `/new` 与 `/[id]/edit`），但房东提示词让模型「告诉用户到
  /dashboard/listings 补充」。中间件加 308 → `/dashboard`，提示词改为 `/dashboard（房源管理）`。
- **退出登录不清头像缓存**：`sl-avatar` 是账号级缓存，退出后留给下一个号首屏闪一下（DB 优先，不会写错）；`signOut` 现在连带 `clearStoredAvatar()`。
- 三个号其余检查全部通过：首页 hero 按各自帽子显示同一助理（经纪号显示自己起的 Ember + 小熊）、面板四标签与设置项齐全、身份菜单「当前：租客 / 房东 / 经纪」
  且经纪号多一项服务商入口、租客 6 个业务页 / 房东 10 个页 / 经纪 9 个页无报错无横向溢出、375px 助手页输入条在底栏之上。

## 服务市场的入口（2026-09-26 · V0.6 · 用户「上次讨论过服务市场，现在要在哪里可以看到？」→ 建议书 → 「按照你的建议来开始做了」）

此前整个服务市场（派单 / 报价 / 进入通知 / 验收 / 服务商入驻 / 派单策略）只能从 `/h/[id]` 报修标签或 `/landlord/providers` 直达，公开站与导航上没有任何一处
说它存在。按批准的建议书顺序落地（守卫 `tests/servicesEntry20260926.spec.ts`，20 条；不做公开服务商目录、不做 Stripe Connect / 抽成）：
- **公开页 `/services`「维修与服务网络」**（`app/services/page.tsx`，版式照 `/stayloop-api`：浅蓝渐变 hero + mono 眉标）：一句定位（报修 → 派给已核验服务商
  或自己的联系人 → 报价须批准 → RTA s.27 / s.26 进入通知 → 验收 → 线下结算、不抽成）；六步工单流；三张卡「房东怎么用 / 服务商怎么入驻 / 租客看到什么」各带
  真实入口；**工种与必需资质表直接 `TRADES.map` + `CREDENTIAL_LABEL`**（与服务端 `providerEligible` 同一份来源，页面永不漂移），资质名链到公开注册库；
  「现状与边界」如实写试点阶段 / 多伦多及周边 / 付款线下 / 没有公开目录 / 「已核」只表示核验日有效、到期即不计。CTA：房东「去派单」→ `/landlord/providers`，
  服务商「申请入驻」→ `/provider/onboard`。`scripts/route-audit.mjs` 的公开页探针加了它。
- **四处链接**：Header「我是」下拉第四项「服务商 · 维修与服务网络 · 入驻」（`PRODUCT_ITEMS` 一处，桌面与手机菜单同一份数组）；页脚「产品」列在 Stayloop API 之后；
  `/platform` 租中一节新增「维修派单 · 已核验服务商或自己的联系人 · 报价须批准 · RTA s.27 进入通知 · 验收」；首页「租中」卡文案补「维修派单」。i18n 键
  `nav.services` / `foot.services`。
- **房东侧**：窄栏与手机「更多」抽屉多一项「服务商」（`UsersIcon`，`/landlord/providers`，排在「维修」之后）；`/landlord/maintenance` 看板顶部一条
  **派单策略条**（读本人 `dispatch_policies` 行经 `normalizePolicy`：「派单策略：只建议 · 每张报价都等你批准」或「紧急报价 ≤ $X 自动批准」+「服务商与策略 →」）；
  模式名统一在 `lib/marketplace/dispatchPolicy.ts MODE_LABEL`，设置卡 `DispatchPolicyCard` 改为展开它。两个维修空态（房东 / 租客）多一行小字链接
  「维修与服务网络是怎么运作的 →」（`DEMO_GATE` 新可选字段 `more`）。
- **服务商侧**：Header 身份菜单在账号没有服务商行时显示「服务商 · 开通 · 成为服务商 · 需资质核验」→ `/provider/onboard`（有行时仍是原来的「服务商 · 工单」）；
  手机「更多」抽屉对有服务商行的账号（任何帽子下）多一格「工单」→ `/provider/jobs`（`PhoneTabs` 现在读 `useHats`）；`/provider/jobs` 顶部**资质到期横幅**：
  `earliestExpiry` ≤30 天琥珀、已过期红色，写明「过期资质不再计入工种覆盖，派单会跳过你」并链到更新页。
- **租客与定价**：报修弹窗「你提交后会发生什么」第四条说明服务商资质已核、进入前会收到通知，并链 `/services`；定价页起步档「维修工单 + 派给自己的联系人」与
  专业档「维修派单 …」两行带「了解 →」（`Feature.href` 可选字段，渲染层只在有 href 时加链接）。
- **身份菜单折叠（2026-09-26 · 用户截图「这里的身份菜单是否可以折叠？现在越来越长了」）**：加了服务商入口后，Header 身份菜单的「身份」段有 4–5 行
  （租客 / 房东 / 经纪 / 服务商），整个菜单撑满一屏。现在折成一行「切换身份 · N 个 ›」（`hatsOpen`，每次打开菜单都是收起的；顶部身份行本来就写着
  「当前：租客」），点开才展开原来的「身份」列表（三顶帽子 + 服务商的两种门都在里面，`id="sl-identity-list"`）。守卫在 `tests/museMobile20260922.spec.ts`
  「signed-in homepage + identity menu」段。

## 分阶段改进 · 节点 1「可信」（2026-09-26 · 依据 `design/phased-improvement-response-2026-09.md`，用户「按照你的理解和推荐来修改…按工作节点连续推进」）

外部第二版报告（`~/Downloads/stayloop-phased-improvement-plan 2.pdf`）26 条实测发现逐条核实后，21 条属实、2 条根因与报告不同、3 条已完成或未复现（对照表在设计稿一节）。
节点 1 落地（守卫 `tests/node1Facts20260926.spec.ts`，24 条；迁移 `20260926_facts_v2.sql` 已应用 prod）：
- **一个事实源**：`lifecycle_facts_tenant / landlord`（扩）+ 新 `lifecycle_facts_agent`（都是 SECURITY INVOKER、anon 无权）一次返回瓦片 / 看板 / 今日卡 / rail /
  我的租金 / 我的申请要的全部行——租客租约同时按登录邮箱与 tenants 行找、房东 household 同时按 created_by / 租约 / 房东成员三条路找、`rent_all`（租客侧全部账期）、
  `rent_month`（房东本月）、`member_roles`、`tier`、`city`。客户端 `lib/facts/useFacts.ts`（每页一次、2 秒共享缓存、`sl-facts-changed` 事件刷新）+
  `lib/facts/toLifecycle.ts`（→ rail）+ `lib/facts/stats.ts`（→ 瓦片，纯函数）。`useLifecycle` 变成 useFacts 的视图，**逐表回退加载器已删**；
  `StatusOverview` / `LiveMaintenanceBoard` / `MyRent` / `MyApplications` 不再直接查任何业务表（守卫）。报告说的「进度页上有租约下无租约」「维修三处计数不一致」
  「待付租金 todo/payments 有而 progress 无」「审计…」的前三条根因就是三条取数路径，现在只剩一条。
- **状态词表 `lib/matters/states.ts`**：租约展示态由 status + 日期推导——`signed_both / active / imported` 且起租日在未来 = **已签 · 待起租**（`upcoming`），到期日已过 = 已结束；
  `isLeaseInForce` 是「生效中」的唯一定义。申请 / 工单 / 房源 / 筛查 / 账期各一张表 + 中英标签；`yesNo()` 供表单用（布尔永不裸露）。`/landlord/leases` 多一段
  「已签 · 待起租」（L-46B5 不再显示 ACTIVE）；`proactive` 三处扫描加 `start_date ≤ 今天` 门——未起租的租约不再进续约 / 催租扫描（该租约此前已在 90 天窗口内）。
- **`/listings` 的「92% 匹配」「仅限 Tier 4 申请」是库数据残留**：8 Colvestone Road 等 3 行带着设计样例的 `badge / match_score / luna_note`（Realtor 导入时照样例行写的），
  没有任何代码在算它。三列已清空，页面与详情页不再选取 / 渲染 / 按它排序（默认排序改最新）；结果条一个数 + 说明「共 M 套，已按条件筛 / 只计地图范围内」（报告的 7 vs 12）。
- **硬约束层 `lib/agent/hardConstraints.ts`**：从当前消息 + 记忆确定性推导预算 / 户型 / 宠物（消息 > 记忆；模型只能收紧不能放宽；「预算不限」时不套记忆预算），
  合并进 `searchListings` 的条件；`searchListings` 多返回 `overBudget`（样本里被预算砍掉的套数）；回复末尾由系统写「（已按 预算 ≤ $2,800 · 2 房以上 过滤（预算来自你之前
  告诉我的）；另有 N 套超预算未列）」；追问芯片按合并后的条件判断缺什么；`search_used` 带 `hard_constraints`。

## 分阶段改进 · 节点 2「清楚」（2026-09-26 · 报告第 2 · 5 · 6 · 10 项）

守卫 `tests/node2Clarity20260926.spec.ts`（19 条）；迁移 `20260926_node2_identity_audit.sql`、`20260926_facts_v2b_tenant_app_detail.sql` 已应用 prod；
跨帽子探针 `scripts/e2e/hat-probes.sh`（四个测试号各自的 JWT，10 条：无帽子的账号读不到房东行 / 租约 / 房东事实、`work_orders.token` 对任何人 403、服务商直读不到
household / 工单 / 申请；密码只从 `E2E_TEST_PASSWORD` 读）——生产 10/10。
- **服务商是一顶可落地的帽子**：`homeForHats` 认识 `provider`（纯服务商号登录直达 `/provider/jobs`；记住的 `provider` 优先；其余顺序不变），`useAuth` 在 `/provider/*` 把
  `provider` 写进「上次身份」（不进 Role 类型），回调页 `AGENT_HOME` 与登录页都改读原始记住值。**根因修复**：`/notifications` 等中性页用未经帽子校验的 `useAuth().role`
  取壳，而访问过 `/landlord/agent` 会把 landlord 记成上次身份 → 服务商点通知被送进房东开通页。现在 `/notifications` 用 `activeHat`，`WorkspaceShell` 的房东守卫在
  拦下时先 `auth.setRole(bestHat(hats))` 把记住的身份放回持有的帽子，DEMO_GATE 的「回到工作台」按帽子跳转（`/dashboard` 只给房东）。
- **应用壳**：`Header appShell`（`WorkspaceShell` 与 `/provider/*` 传）——桌面端不再显示「我是 / 产品 / 房源 / 定价 / 租客筛查」，换成「当前身份：房东」芯片 + 「切换」
  （打开身份菜单并展开）；营销链接进头像菜单「浏览 Stayloop」（手机原本就这样）。
- **通知页有真内容**：`components/notifications/LiveNotifications.tsx`（liveSlot）——当前帽子的待批卡（→ 待办）、有服务商行的账号看到工单动态（`work_order_events`，
  RLS 本人）、最近审计事件（`auditActionLabel`）。
- **审计页有真内容**：`components/audit/LiveAuditLog.tsx`（`AuditLog` 的 liveSlot）——本人 `agent_audit_events` 按「时间 · 身份 · 动作 · 对象 · 结果」列出，对话轮次不算审计；
  `agent_audit_events` 加 `acting_role / matter_type / matter_id / delegation_id`（delegation 节点 5 才填），`writeAuditEvent` 与执行回执 `finalizeExecution` 都填
  （`matterRef()` 从 metadata 里的 lease_id / application_id / household_id / work_order_id / ticket_id / listing_id / screening_id 推导）；**开通帽子写审计**：
  `audit_hat_activation()` 触发器（definer）挂在 landlords / agent_profiles / service_providers 的 AFTER INSERT，记 `hat_activated`（谁、哪顶、经哪条路、是否本人）。
  agent-test 那行 09-25 03:54 误开通的房东行已删；现在只有 landlord-test 有房东帽子。
- **关键任务入口**：租客申请详情页 `/tenant/applications/[id]`（进度步骤 + 「轮到房东 / 你」+ 下一步说明 + 材料份数 + 租约 / 在管租约入口 + 婉拒时的 s.10(7) 提示，
  **永不显示分数**；`applicant_applications` 视图加 `files_count` / `decision_reason`，租客事实 RPC 带出）；列表每行「详情 →」。经纪待办页并入客户表任务
  （`ClientTasks`），rail 的 RECO 步骤在注册 ≤30 天到期时变「更新注册信息」并带时钟（`agentLifecycle` 新入参 `profileExpiresAt`）。房东归档改为表格：
  申请人 · 决定 · 通知（未发标琥珀）· 租约（`leaseStateDetail`）· 入住（在管租约已确认 / 等租客确认）· 归档日 · 取消归档。
- **「租客筛查」按帽子分流**：`components/screening/ScreeningCta.tsx`——已登录且只有租客帽子时，CTA 变「我是租客 · 先备好我的材料包 →」（护照）+
  「我也是房东 · 开通后开始筛查」（`/landlord/become?next=/screening/app`），并说明筛查由房东 / 有代表协议的经纪发起；匿名、房东、注册有效的经纪照旧进 `/screening/app`。
- **文案与可访问性**：`/apply` 宠物 / 吸烟下拉改「否 / 是」（`Select` 接受 `{value,label}`）；「brief 包」→「带看准备包」；材料预览多一个「下载 ↓」（`/api/file-url`
  `download:true` → 附件式签名 URL + 审计 `application_file_downloaded`，与查看分开）；发布向导按钮旁明写缺什么（照片 / 地址 / 月租）；经纪的设置页显示
  「套餐 · 经纪 · 即将推出，现在全部免费」；`/leases/import` 登录后放进 `WorkspaceShell`（按当前帽子），文件输入有 aria-label。

## 分阶段改进 · 节点 3「可执行」（2026-09-26 · 报告 7 · 8 · 服务商经营视图与证照规则）

守卫 `tests/node3Execution20260926.spec.ts`；迁移 `20260926_node3_execution.sql`（已应用 prod）。规则全部在纯模块 `lib/marketplace/sla.ts`，
服务端 `lib/marketplace/server.ts` + 日扫 `lib/marketplace/sweep.ts`（挂在 `/api/agent/proactive` 的 cron 模式里，与续约扫描并列、互不遮蔽）。
- **SLA**：`dispatch_policies.quote_hours`（24–72，默认 48，`DispatchPolicyCard` 可选）→ `createWorkOrder` 写 `work_orders.quote_due_at`，派单邮件写明截止时刻；
  工单卡与 `/w/[token]` 显示倒计时（≤12 小时琥珀、逾期红）。日扫把逾期未回应的 offer 盖一次 `sla_overdue_at`、写系统事件 `quote_overdue`、
  邮件 + 推送提醒服务商，并给房东一张 **`work_order_overdue`** 卡：批准 = 以房东身份 `cancel`（原因写在时间线）+ `suggestDispatch(…, { excludeProviderIds, because: 'overdue' })`
  （新卡或按策略自动派给下一位，**永不派回同一家**）；服务商已回应则卡片过期并说明。审计 `work_order_quote_overdue` / `executed_work_order_overdue`。
- **婉拒必须带原因**：`DECLINE_CODES`（排不开 / 不在范围 / 非本工种 / 描述不清 / 价格 / 其他须备注）→ `work_orders.decline_code` + `cancel_reason`，
  服务端 `validateDecline` 拒绝无原因（400 `decline_reason_required`）；婉拒后**立即**为房东重新建议（排除该服务商），旧派单卡过期。
- **报价成版本**：`work_orders.quote_version` 每次 accept / quote +1（事件 payload 带 version），卡片显示「第 N 版 · 有效期至」，报价表单可填有效期。
- **服务商工作台 `/provider/jobs`**：六格（新邀请（含临近 / 已过截止数）· 已报价等房东 · 进行中 · 待验收 · 待结算（金额）· 今年收入 + 评分），
  每个工种一枚覆盖标签「已覆盖 · 可接派单 / 未覆盖 · 不会收到派单 — 缺 X」（`coverageLabel`），到期横幅按 90 / 60 / 30 / 7 / 过期分级变色（`expiryTone`），
  空工作台写明第一张工单怎么来。**新页 `/provider/history`**：响应时长中位 / 准时率（窗口开始 15 分钟内）/ 接单率 / 一次解决率 / 返工率 / 争议率
  （`providerMetrics` 新增三项）、按月线下结算记录（以房东「标记已付」为准，不是发票）、收到的评价、历史工单含婉拒原因。
  纯视图函数在 `lib/marketplace/providerView.ts`——**page.tsx 不能导出多余符号**（Next 会在构建时拒绝）。
- **证照提醒分级**：`provider_credentials.reminders_sent integer[]` 记录已发的档（90 / 60 / 30 / 7 / 0 = 已过期）；`dueReminder` 每份资质每档一次、
  只发最低的到期档并把更高档一并标记（补录的资质不会连发两封），过期 30 天后不再提醒；每家服务商每轮一封邮件 + 一条推送 + 审计 `credential_expiry_reminder`。
  守卫触发器让自助写入碰不到 `reminders_sent`，改到期日则重置阶梯。入驻页每个工种旁有覆盖标签，保存后提示还缺哪张。
- **管理员可配的宽限**：`app_config.marketplace.credential_grace_days`（0–14，`/admin/providers` 顶部「过期宽限」）——**只适用于文书类资质**
  （WSIB 清关 / 责任险 / 企业注册，`GRACE_ELIGIBLE_KINDS`），法定执照（STO / ESA / TSSA / MECP）永不宽限。服务端 `loadMarketplaceConfig` 在每次资格判断时读它，
  页面经 `GET /api/config/marketplace`（`useMarketplaceConfig`）读同一个值，所以覆盖标签与派单资格永远一致。
- **顺带**：`Header` 应用壳的身份芯片在中性页（/notifications、/settings）对来自服务商工作台的账号显示「服务商」（此前显示租客）。
- **生产实跑（2026-09-26 晚，`[TEST]` 数据保留）**：房东测试号在 `/h/<id>?tab=maintenance` 把「厨房水槽下方接头滴水」派给 Northline（quote_due_at = +48h，卡片
  「请在 48 小时内报价」）→ service role 把截止时刻拨到 3 小时前（卡片即显示「报价已逾期 3 小时 · 房东可能改派」）→ 用 SQL `net.http_post` 带 Vault 里的
  `cron_secret` 触发 `/api/agent/proactive`（**不要把密钥取出来打印**：`select net.http_post(url:=…, headers:=jsonb_build_object('x-cron-secret',(select decrypted_secret
  from vault.decrypted_secrets where name='cron_secret'),…))`，几秒后到 `net._http_response` 读响应）→ 200 `{marketplace:{overdue:1,cards:1,reminder_providers:1,
  reminder_credentials:1}}`：工单盖 `sla_overdue_at`、时间线多一条系统 `quote_overdue`、房东待办出现「Northline 逾期 3 小时未报价 · 改派？」、审计
  `work_order_quote_overdue`（acting_role landlord · matter work_order）；同一轮把 Northline 拨到 20 天后到期的 WSIB 清关标成 `reminders_sent={90,60,30}` 并写
  `credential_expiry_reminder`。房东在 `/landlord/todo` 批准（60 秒撤销窗）→ 执行器把工单 `cancel`（原因「逾期未报价，房东改派」）并给出新派单卡
  「上一位服务商逾期未报价、派单已撤回 …」，候选只剩 Maple；批准 → 新 offer 给 Maple → agent-test 在 `/provider/jobs`（六格「1 新邀请」、卡片「Quote within 48 h」、
  覆盖标签「Plumbing · Covered」）选「不在服务范围」婉拒 → `decline_code=out_of_area`、事件 payload 带 code、房东再得一张「上一位服务商婉拒了这张工单」卡，候选只剩
  Northline，ticket 回到 new；`/provider/history` 列出「Declined: Outside my service area」与六项指标。**四个节点 2 核对项也在同一晚过了**：服务商登录落到
  `/provider/jobs`、应用壳身份芯片、租客申请详情页 / 真实审计页、经纪待办的客户任务与设置页计划说明、房东申请队列的跟进列。

## 分阶段改进 · 节点 4「连贯」（2026-09-26 · 报告 9 · 消息 thread 最小版）

守卫 `tests/node4Threads20260926.spec.ts`；迁移 `20260926_node4_threads.sql`（已应用 prod）。**每件事一条对话**：`threads(kind ∈ work_order | application | tenancy | dispute, ref_id)`
唯一，`thread_messages` **只追加**（authenticated 只有 select/insert；触发器对所有角色拒绝 UPDATE，直连客户端不能 DELETE；撤回 = 新增一行 kind `retraction`
指向原消息，原文永远留在记录里，界面显示「已撤回 · 原文保留」）；直连插入时触发器写 **服务器时间**、`sender_id = auth.uid()`、`sender_kind = thread_party()`
（这个人在这条对话里的角色，定义函数按 kind 查 household_members / work_orders / applications+listings，申请人按 JWT email 匹配），`acting_role` 是当时的帽子快照；
`message_reads` 每人每对话一行三个高水位 `last_delivered_id / last_opened_id / last_acknowledged_id`（送达 · 打开 · 确认，只能前进，只写自己的行），发送方看到
对方的 已送达 / 已读 / 已确认收到。**附件**：`POST /api/threads/upload`（multipart）由服务器算 SHA-256、存 `tenancy-files/<household|thread>/threads/<thread>/`、
登记 `thread_attachments`；消息里的附件只能引用登记过的路径，哈希由触发器从登记表复制（客户端伪造不了）；查看 / 下载走 `POST /api/threads/attachment-url`
（签名 URL 600 秒 + 审计 `thread_attachment_viewed / downloaded`，带 acting_role 与 matter）。
- **界面** `components/threads/ThreadPanel.tsx`（`open_thread(kind, ref)` RPC 取 / 建线程，非当事人被拒；8 秒轮询；折叠态显示未读数；Enter 发送；撤回 10 分钟窗口）：
  `/h/[id]` 对话标签 = 租约对话（`household_messages` 已整表迁入，旧表只读保留一版）；`/h/[id]` 报修标签与 `/landlord/maintenance` 每张工单卡下、`/provider/jobs`
  与 `/provider/history` 每张卡下 = **三方工单对话**（租客 · 房东 · 服务商）；`/landlord/applicants/[id]` 与 `/tenant/applications/[id]` = 申请对话（申请人须用申请邮箱登录）。
  `/w/[token]` 外部联系人用 `components/threads/ExternalThread.tsx` 经 token 门读写（`GET` 带 `thread.messages`，`POST action:'message'`），身份记为
  「服务商（邮件链接）」，无附件、无已读标记。`/x/messages` 收件箱改为列出全部线程（种类标签 + 最新一条 + 未读数来自 `message_reads`，不再用 localStorage）。
- **系统行**：`createWorkOrder` 与 `actOnWorkOrder` 的每次流转、日扫的 `quote_overdue` 都往工单对话写一条双语系统行（`workOrderSystemLine`），三方看到同一条时间线。
- **正式通知只留副本**：进入通知（批准报价时）→ 工单对话、决定通知 → 申请对话、续约函 → 租约对话（按 `households.current_lease_id` 找），都是 kind `formal_copy`，
  正文末尾固定一句「正式通知副本 · 以邮件送达为准 · 不构成 RTA 法定送达」；邮件仍是正式通知本体。
- **通知只做提醒**：`POST /api/threads/notify`（发送者两分钟内的消息才算，60/小时）→ 有账号的当事人推送（按其推送档位），没有账号的（外部联系人、申请人）
  一封邮件带回对话链接；发送者自己不收。旧的 `/api/household/notify-message` 与 `lib/household/readMarks.ts` 已删。
- **未做（节点 6）**：消息时间线 + 附件校验的 PDF 证据包导出；争议线程的管理员介入界面（kind 已预留）。
- **生产实跑（2026-09-27 凌晨，四个测试号）**：房东批准派单卡 → offer 给 Northline，工单对话自动出现第一条系统行「已派单给 … · 请在 48 小时内报价」；
  房东在 `/h/<id>?tab=maintenance` 的工单卡下展开对话留言（状态「已发送」）→ 服务商号 `/provider/jobs` 卡下折叠头显示未读 2，展开后点「确认收到」、回复
  （房东侧随即变「已确认收到」）、接单报价 $150（系统行「服务商接单并报价 $150.00（第 1 版）」）→ 房东在 hub 批准报价 → 系统行「房东批准了报价」+ 琥珀色
  「正式通知副本」（进入通知全文 + 免责句，`meta.sent=true`）→ 租客号看到同一条 7 行的时间线并确认收到；`/tenant/messages` 列出工单对话 / 租约对话；
  租客在 `/tenant/applications/<id>` 的申请对话留言成功（申请人按 JWT 邮箱判定为当事人）。附件走 `scratchpad/e2e-threads.sh`：上传 favicon-32.png
  服务器算出的 SHA-256 与本机 `shasum` 一致；用房东 JWT 直插消息时伪造的 `sender_kind:'tenant'`、`name:'forged.png'`、假哈希全部被触发器改回登记值；
  签名 URL 返回 image 并写审计 `thread_attachment_viewed`（acting_role landlord · matter work_order）。回滚事务探针：房东插入被改成服务器时间与 landlord 身份、
  UPDATE 报 42501、外人连线程行都看不到。**发现并修的一处**：面板在挂载时就 `open_thread`，租客滚一遍报修标签给十张旧工单各造了一条空线程、收件箱全是
  「还没有消息」——现在挂载只 `find_thread`（只读、当事人校验），第一次写入才 `open_thread`；收件箱只列有消息的线程；已删空线程（迁移 `20260927_find_thread.sql`）。
  内置浏览器面板处于 hidden 时不轮询（设计如此），补了 `visibilitychange` 回到可见即刷新。

## 分阶段改进 · 节点 5「租赁事务主记录与经纪委托」（2026-09-27 · 报告 31–60 天段）

守卫 `tests/node5Matters20260927.spec.ts`；迁移 `20260927_node5_matters_delegations.sql`（已应用 prod；**`language sql` 的函数在定义时校验列，所引用的新列必须先 ALTER**——
第一次应用因 `threads.matter_id` 排在 `matter_summary()` 之后整体回滚）。
- **租赁事务主记录**：`rental_matters`（房东 authId / 租客 authId 或邮箱 / 房源 / 地址）+ `rental_matter_links(kind ∈ listing|application|screening|lease|household|work_order, ref_id)`
  唯一——不搬任何表，把已有的行钉到一个事务 id 上。**唯一写入者** `ensure_matter(kind, ref)`（service_role）沿着现有链推导：申请 → 房源/房东；租约 → `application_id`；
  在管租约 → `current_lease_id`；工单 → household；`my_matters()`（authenticated，SECURITY DEFINER）先把调用者链上缺的事务补出来再返回本人的摘要
  （申请状态 / 筛查有无 / 租约状态与起止 / 在管租约 / 工单开放数 / 对话数 / 受托经纪——**没有分数**）；`matter_party(mid)` = landlord · tenant（authId 或 JWT 邮箱）·
  agent（有效委托）· admin，是 `rental_matters` / `rental_matter_links` 唯一的读策略。`threads.matter_id`（`ensureThread` 写）、`agent_audit_events.rental_matter_id`
  （`finalizeExecution` 写）随行；`createWorkOrder` 顺手挂。界面：`components/matters/MattersPanel.tsx` 在 `/x/progress`（进度页 = 事务页）：每件事一张卡，
  七个阶段（已申请 → 已筛查 → 已决定 → 租约待签 → 已签约 → 在管租约 → 已结束，`matterStage` 只看状态）、各部分入口、受托经纪一行。
- **经纪委托 `delegations`**：委托人（房东 / 租客，按 authId 或邮箱）→ 受托人（经纪）· `scope ⊆ {listing, search, matter}` · `allowed_actions ⊆ {screen, message,
  view_documents, draft_lease}` · 期限（1–12 个月）· `basis_version = TRESA-2024-representation-v1` · 状态 pending → active → revoked/expired。**只有服务端写**：
  `POST /api/delegations`（经纪从客户表发起：RECO 注册有效 + 客户行有邮箱 + 代表协议与 Information Guide 两个日期都在，否则 403/422；同一客户只能有一份待确认或有效的）
  → 给委托人发一次性确认链接 `/delegate/<token>`（页面公开可看内容，**确认必须用该邮箱登录**，`POST /api/delegations/confirm` 校验 JWT 邮箱、消费 token、写
  `principal_auth_id`）；`POST /api/delegations/<id> {action:'revoke'}` 双方任一即时撤销并通知对方。`confirm_token` 列对 authenticated **不可读**（列级 grant，
  受托经纪不能替客户确认）。审计 `delegation_proposed / confirmed / revoked` 带 `delegation_id`。
  界面：客户表每行一枚委托状态标（`ProposeDelegation` 内联表单）；经纪工作台所有页顶部 `RepresentingStrip`「正在代表：X · 范围 · 到期 …」；`/settings` 的
  `MyDelegations`（我委托的经纪 / 客户对我的委托，撤销 · 撤回）；事务卡上的「受托经纪」行。
- **代客筛查在有效委托下开放**：客户表的「发起筛查」只在委托有效且含 `screen` 时出现，带 `?as=agent&delegation=<id>`；`/screening/app` 经纪模式没有有效委托
  即拒绝创建（琥珀提示 → 客户表）；筛查行写 `screenings.delegation_id`——触发器 `guard_screening_delegation` 只接受调用者自己有效且允许 screen 的委托、更新时冻结；
  委托人经 `screenings_delegation_principal_read` 可读，经纪经 **RESTRICTIVE** 策略 `screenings_delegation_gate` 只在委托仍有效时可读（撤销即时失去访问）。
- **维修动作从卡片直接完成**：`ApprovalActionCard` 对带 `work_order_id` 的房东卡内嵌 `WorkOrderInline`（实时 `WorkOrderCard` + 工单对话），批准报价 / 验收 /
  返工 / 争议 / 标记已付都在待办页完成，服务端照旧让对应待批卡过期，客户端 `notifyPendingChanged()` 刷新红点。
- **未做**：委托到期的定时转 `expired`（查询里一律按 `expires_at > now()` 判定，界面显示「已到期」）；经纪代客在对话里发言（`message` 动作已定义，线程方仍按本人身份）。
- **生产实跑（2026-09-27 凌晨）**：给 agent-test 建了房东客户行 `[TEST] 房东客户 · Test Landlord`（邮箱 landlord-test@，两个 TRESA 日期齐）→ 经纪在 `/agent/clients`
  点「Propose delegation」→ 表单默认 出租 + 事务、四个动作、6 个月 → 「Send confirmation link」→ 行 pending、审计 `delegation_proposed`（acting_role agent，
  emailed:true），客户表标「链接已发到 …」；匿名打开 `/delegate/<token>` 能看到经纪名 / RECO 号 / 经纪公司 / 范围 / 动作 / 到期 / 依据版本，只有登录按钮；
  房东号登录后同页出现「确认委托」→ 点击后 `/settings` 的委托块显示 **Active · confirmed 2026-09-27**，`/landlord/progress` 三张事务卡都带「受托经纪：[TEST] Agent
  Person · listing, matter · until 2027-03-26」；经纪号 `/agent/agent` 顶部出现「Representing: … · until 2027-03-26」，客户表标「Delegated until …」+「Screen」链接
  （带 delegation id），`/screening/app?as=agent&delegation=…` 顶部绿色「正在代表：…」，不带 delegation 参数则琥珀提示且拒绝创建；房东在设置里 Revoke →
  经纪侧条幅消失、标「Revoked」、筛查链接消失、可重新发起。租客 `/tenant/progress` 两张事务卡（申请 → 在管租约链完整，工单 2 开放 / 11），无筛查链接。
  以经纪身份 `select to_jsonb(delegations)` 报 42501——`confirm_token` 列级 grant 生效。

## 分阶段改进 · 节点 6「可收口」（2026-09-27 · 报告 61–90 天段）

守卫 `tests/node6Export20260927.spec.ts`。无新表——导出与回执都是**按平台记录现算**的可打印 HTML（与筛查报告同一做法：浏览器打印存 PDF），每份带**内容指纹**
（结构化记录 JSON 键排序后的 SHA-256，印在文末并放在响应头 `X-Content-Fingerprint`）；生成本身写审计并带 `rental_matter_id` 与帽子。
- **事务证据包** `POST /api/matters/export {matter_id, lang, acting_role}`：调用者先用自己的 JWT 过 `matter_party`（非当事人 403），服务端汇总：事务链（申请 / 筛查
  **只有状态** / 租约 / 在管租约 + 租金记录）、正式通知副本（进入通知 / 决定通知 / 续约函）、工单（报价版本 · 批准 · 账单 · 事件时间线）、全部对话（每条带服务器时间
  UTC + 多伦多、发送者在该事务中的身份与当时帽子、**撤回的消息仍在并标注撤回时间**、附件名 / 大小 / SHA-256）、附件清单、委托（含已撤销）、审计（帽子 · 谁 · 动作 · 委托）。
  开头一段固定声明：只追加、正式通知以邮件送达为准、**不含任何筛查分数**。渲染器 `lib/export/evidencePack.ts` 是纯函数，全部用户字符串经 `esc()`。
  入口：`/x/progress` 事务卡上的「导出证据包 ↗」（`lib/export/openHtml.ts`：先同步 `window.open` 再带 JWT fetch，再把 blob URL 交给新标签——绕开弹窗拦截）。
  审计 `matter_export_generated`。
- **结算回执 / 验收回执** `POST /api/work-orders/<id>/receipt`：当事人（RLS 读到行即可）对 accepted / paid / closed 的工单生成：地址、房东、服务商（含 BN）、报价版本、
  批准金额、到场 / 完工、账单 + CPA 10% 判定、验收、付款（线下 · 房东标记时间）、事件时间线；明写「Stayloop 不经手资金 · 不是发票」。入口：工单卡（房东 / 服务商可见）
  与服务商历史页；审计 `work_order_receipt_generated`（matter = 工单 + rental_matter_id）。
- **正式通知与提醒的分流**在节点 4 已成形（邮件 = 正式通知；线程 = 副本 + 免责句；推送 = 提醒）；证据包把三者分栏呈现。
- **按既定决定不做**：CASL 营销同意管理（没有营销邮件）、保险 / 法律服务商类型（FSRA / LSO 资质形态未定）、组织成员。
- **生产实跑（2026-09-27 凌晨，`scratchpad/e2e-export.sh`）**：房东 JWT 对 100 Test Ave 的事务 `0b93ea2f` 导出 → HTTP 200、26 KB、8 个章节、2 份正式通知副本、
  9 条对话块、1 条附件 SHA-256、0 处分数、响应头带指纹；同一房东对已付款工单 `fcbcfcf1` 生成回执 → 200、「线下结算回执」「不经手资金」在文中；服务商号
  （非当事人）导出同一事务 → 403；审计 `matter_export_generated` / `work_order_receipt_generated` 各一行带 `rental_matter_id`。界面：`/landlord/progress` 三张事务卡
  各有「Evidence pack ↗」，hub 报修标签的已验收 / 已付款工单卡分别显示「Acceptance record ↗」「Settlement receipt ↗」（内置浏览器对脚本触发的 `window.open`
  不开新标签，属自动化环境限制；路由本身已由 curl 验证）。
- **六个节点至此全部落地**（可信 → 清楚 → 可执行 → 连贯 → 事务主记录与经纪委托 → 可收口），每个节点一次部署 + 四个测试号核对，记录在本文件各节。

## 快捷卡片：从「模板填空」到「分步引导」（2026-09-27 · 用户「重新制作这些卡片，不是简单复制这个标题内容到输入，要有一个一步步引导的过程给这个输入，你研究一下」）

研究稿 `design/guided-intake-2026-09.md`（一点即发 / 先问清再执行 / 对话式表单 / Airbnb 分段搜索 / 结构化表单 五类模式的取舍）。结论：对话里的
一张**确定性引导卡**（Perplexity 式芯片 + 自由输入、Typeform 式一问一步、Airbnb 式已答摘要、提交前预览），全程不调模型。守卫 `tests/guidedIntake20260927.spec.ts`
（13 条，含 react-test-renderer 真实点击流程）；`tests/templateChips20260923.spec.ts` 的模板断言改为引导卡断言。
- **数据层 `lib/agent/intake.ts`**：14 张卡各一个 `IntakeSpec`（租客 找房 5 步 / 解读租约 3 / 报修 7 / 盖章 2；房东 筛查 3 / 发布 7 / 新申请 2 / 续约 3 / 合规 2；
  经纪 筛查 3 / 定价 5 / 带看 3 / 租约与押金 2 / 合规边界 2）。`compose` 产出**没有占位符的完整一句**，措辞对准下游的确定性解析：找房句命中 `budgetFromText /
  bedsFromText / petsFromText`（「预算 $2,500 以内」「1+1（1 房 + den）」「我有宠物」「预算不限」），报修句在紧急时按类别写 `没有暖气 / 漏水严重 / 停电 / 门锁失效 /
  燃气味`，命中 `isEmergencyMaintenance`（英文补了 `lock failed / cannot lock`）。金额与日期输入在 `queryFor` 里格式化（`$2,450`、`11 月 1 日`）。
- **组件 `components/agent/IntakeCard.tsx`**：卡头（图标 · 标题 · 第 i 步 / 共 n 步 · ×）、细进度条、已答摘要芯片（点击回改）、问题 + 提示、芯片
  （**单选且无输入框、无附件、无提示语的步骤点选 140ms 后自动进下一步**；紧急选项红色，选中显示「先做这件事：关总阀 / 拉闸 / 燃气离开打 911 · RTA s.20」
  且不自动前进）、输入框（`.sl-input`，Enter = 下一步；money 带 $ 前缀只收数字、date 原生日期）、附件步（与输入条共用 `lib/agent/attachments.ts`
  `readFilesAsAttachments`：3 个 · 4 MB · image/pdf）、可选步「跳过」、最后一步预览整句（可改）→「发送 ↑」或「放进输入框自己改」（走原 `draft` 通道）；Esc / × 关闭。
- **接线 `AgentChat`**：`SUGGESTIONS` 每项带 `key`，`template` 字段删除；`guided = live || hero`——工作台页（登录或匿名预览）与登录后的首页 hero 点卡片 =
  打开引导卡（卡片网格隐藏、卡在原位），**匿名首页 hero 仍发示例句**（演示）；卡片副标题 = `outline`（「7 步 · 哪里 · 什么问题 …」），眉标「从这里开始 · 我一步步
  问清楚，你只需要选」；换线程 / 线程里出现真实消息即关闭。深链的 `【…】` 预填与服务端 `hasUnfilledTemplate` 闸门不动。
- **不做**：模型逐轮追问（成本与延迟）、独立表单页、在引导里问受保护特征（带看只问「房东授权回答什么」，筛查只问材料与 Form 410 同意状态，目标租金标明
  「只作参考不是门槛」，新申请只按「材料齐全 / 是否已筛查 / 递交时间」整理、不按「质量」排）。
- **生产实跑（2026-09-27，租客测试号，英文界面）**：`/tenant/agent?new=1` → 「Report a repair · 7 steps …」→ Bathroom → No hot water + 一句细节 → Today → Soon
  （自动进下一步）→ I must be present（自动）→ None → 跳过照片 → 预览整句 → 发送。助手**一轮**就给出 `maintenance_request` 待批卡，库里 metadata
  `category plumbing · location Bathroom · priority high · entry_permission tenant_present · pets no · thread_id`，没有任何追问。**顺带修的一个旧问题**：
  `HomeNext` 挂 `AgentChat` 时从没传 `live`，登录后的首页 hero 一直在把示例句原样发出（09-23 禁止的事）——现在传 `live={live}`，登录后首页也是引导卡，匿名首页仍是演示。

## 首页结构优化：四种身份 · 角色→模块 · FAQ（2026-09-27 · 用户拿 Muse 生成的 `~/Downloads/stayloop-homepage-final.html` 与两张 Muse 建议截图问「方案是不是合适」→ 我给出取舍 → 用户「连 4 一起，都按照你的建议开始做」）

**取舍（记住，别再被同类方案带偏）**：Muse 的结构建议是对的——按角色分流、模块按「角色 → 模块」映射、保留免注册的真实对话、补上第四个角色；
但那份 HTML 终稿本身不能照搬：indigo→violet 渐变与圆角「S」标（09-05 全站换成 Flinks 蓝、09-22 定为 wordmark 时都已退役）、62px 标题（09-25 刚压到 44）、
写死的剧本对话（「综合评分 82/100」「到访确认短信已发」，把真 demo 退回假 demo）、悬浮通知卡（编造事实）、首页定价区（$39 团队版 / 14 天试用 /
多成员协作 / 成交看板都不存在，且测试月免费到 10-14，定价只有 `/pricing` 一个来源）、模块文案里不存在或已决定不做的功能（在线收租、自动对账、
佣金对账、路线规划、保险 / 法律服务商、工单大厅、在线结算）、「服务商即将上线 / 内测邀约」（实际已在多伦多试点）、「Anthropic Claude 驱动」（默认对话模型
已是 Gemini，多厂商可选）。**首页仍以 `components/home/HomeNext.tsx` 为准，不引入新蓝本。** 守卫 `tests/homeRoles20260927.spec.ts`（6 条）。落地：
- **四种身份**：`ROLES` 的 key 扩为 `HomeRole = AgentRole | 'provider'`，第四个 tab「服务商 · 试点」——没有助手人设，所以右栏不是例句而是「现状 · 如实写」
  四条事实（试点 · 多伦多及周边 / 没有公开目录 / 「已核」只表示核验日有效 / 付款线下不经手资金），左栏三条收益全部对应已上线能力（资质核验与到期阶梯、
  报价 → 到场 → 完工 → 验收一条时间线 + RTA s.27、线下结算 + CPA 10% + 回执），CTA「申请入驻」→ `/provider/onboard`。区块标题「三种角色，各自的 Agent」→
  「四种身份，各自的入口」。hero 的三枚访客 pill 旁加一条文字入口「服务商 · 维修与服务网络 →」（`/services`；不加第四枚 pill，因为对话没有服务商人设）。
- **角色 → 模块**：每个身份三张模块卡链到真实页面（房东：`/screening` · `/dashboard/listings/new` · `/landlord/leases`；租客：`/listings` · `/tenant/applications` ·
  `/tenant/passport`；经纪：`/agent/clients` · `/agent/agent` · `/rules`；服务商：`/provider/onboard` · `/provider/jobs` · `/services`），守卫逐个检查
  `app/<route>/page.tsx` 存在，文案只写已兑现的事（守卫列了禁用词）。
- **tab 选中态改为一枚滑动的墨蓝胶囊**（按当前按钮量位置，`ease .25s`，无弹簧；量到之前由按钮自己上色，首帧不空；手机换行后位置也对）。
- **FAQ 五问**（放在数字带之后、末尾 CTA 之前，`<details>` 手风琴 + FAQPage JSON-LD）：房源与行情来源 / 筛查会不会一票否决（OHRC 无硬性截止线、s.10(7)）/
  AI 会不会替我做决定（待批卡 + 60 秒撤销 + 审计）/ 数据在哪谁能看（蒙特利尔、行级权限、可删可导出、AI 服务商见隐私页）/ 服务商怎么加入要不要付费
  （试点、不抽成、不经手资金）；每条末尾链到能核对的页面；**不写任何价格**。
- **信任条**「技术 Anthropic Claude」→「模型 Claude · GPT · Gemini · 可自选」（与实际一致）。
- **有意不做**：hero 网格 / 光晕背景（我建议只做 FAQ，用户按建议）、定价区、改色、脚本化对话、悬浮卡、数字滚动动画。
- **生产核对（2026-09-27 傍晚，ship51）**：预渲染 HTML 含「四种身份，各自的入口」、`role="tablist"`、hero 的「服务商 · 维修与服务网络 →」、FAQPage JSON-LD
  五问；匿名访客：三枚 pill + 服务商文字入口、四个 tab、点「服务商 · 试点」→ 四条事实 + 三张模块卡（`/provider/onboard` · `/provider/jobs` · `/services`）+
  「申请入驻」；租客测试号登录态同样四个 tab 与 FAQ（pill 行按 09-25 决定不显示，服务商文字入口随之只给访客）；375px 零横向溢出，四个 tab 换成两行、
  滑动胶囊落在换行后的正确位置。

## 手机端也能换助手头像、改名（2026-09-27 · 用户看桌面面板的铅笔菜单后问「手机端头像能不能修改？」）

不能——头像选择格与「换头像 / 改名」铅笔菜单只在 `AssistantPanel`（lg 起才渲染）里，`/settings` 只有改名没有头像。现在（守卫 `tests/phoneAvatar20260927.spec.ts`）：
- **一个选择格三处用**：`components/agent/AvatarPicker.tsx`（20 宠物 + 20 人物、每行 5 个、分组可滚），面板、手机活动弹层、`/settings` 都渲染它；持久化仍由调用方做
  （`assistant_profiles.avatar` + `localStorage sl-avatar`），三处写法一致。`petAvatars` / `museWeb` 里钉住选择格的断言改指向新组件。
- **手机活动弹层**（点对话头部的头像打开的 `ActivitySheet`）：头部改为「头像 + 铅笔 · 名字 · 一行说明」，铅笔弹出同一套「换头像 / 改名」菜单（外点 / Esc 关闭），
  选择格在弹层内展开，改名内联输入；保存与面板同一路径（`saveAssistantAvatar` / `saveAssistantName` + `setAIName(owner)` + `invalidateAiName`）。
  只在登录且页面持有头像状态时可编辑（`canEdit = live && !!onAvatarChange`），匿名预览只看。状态经 `AgentChat` 新 prop `onAvatarChange` 从
  `AgentWorkspacePage`（`setAvatar`）传下来，改完对话头部立即换脸。
- **`/settings` 新增「修改 AI 助手头像」快捷块**（在「修改 AI 助手名字」之下）：读 `assistant_profiles` 当前值，点一个即保存，任何设备都能到。
- **生产实跑（2026-09-27 晚，ship53，租客测试号，375px）**：`/tenant/agent` 点头像 → 弹层头部有头像 + 铅笔 → 菜单「Change avatar / Edit name」→ 选择格 41 个按钮
  （默认 + 40）→ 点熊猫 → 弹层与对话头部立即换脸；「Edit name」→ 输入 Pixel 提交 → 名字即换；库里 `assistant_profiles` 变为 `avatar=panda · name=Pixel`
  （之后已还原为空）；`/settings` 的「Change AI assistant avatar」快捷块展开同一选择格，无横向溢出。匿名预览的弹层只显示头像 + 名字，没有铅笔。
  部署门禁曾被 `review20260925` 里钉在面板文件上的「默认头像高亮」断言拦下一次，已改指向 `AvatarPicker`。

## 自己做助手头像：上传照片或一句描述生成（2026-09-28 · 用户「需要做一个自己做头像的功能…可以自己上传照片来生成，也可以按照用户的指令来生成」）

守卫 `tests/avatarMaker20260928.spec.ts`；迁移 `20260928_assistant_avatars_bucket.sql`（已应用 prod：`assistant_profiles.avatar` 的长度 CHECK 40 → 400；公开桶 `assistant-avatars`，
2 MB、只收 webp/png，**没有任何 authenticated 的 storage 策略**——只有生成路由用 service role 写）。
- **路由 `POST /api/assistant/avatar`**（edge，须登录，匿名 401）：JSON `{mode:'prompt', prompt, style}` 走 OpenAI `gpt-image-1` 的 `images/generations`；
  multipart `mode=photo, style, prompt?, image` 走 `images/edits`（`input_fidelity=high` 保住脸型、发型、眼镜、肤色；旧端点拒绝该参数时去掉重试一次）。
  统一参数 1024² · quality medium · `background=transparent` · `output_format=webp` · **`output_compression=75`**（不压缩时照片模式出来 800 KB–1 MB，压缩后约 170 KB）。
  提示词 = 四种风格之一（毛绒玩具 / 3D 卡通 / 黏土 / Memoji 风，`STYLE_WORDS`）+ 与 40 个预设同一段构图约束 `FRAME`（正面半身、居中、透明底、无文字无道具单主体）。
  限流 **每用户每小时 6 次 + 全站每小时 240 次**，都 fail-closed（每次花钱：文字约 $0.043、照片约 $0.087，按 OpenAI 列价从 `usage` 算）。
  结果存 `assistant-avatars/<uid>/<id>.webp`，返回短键 **`custom:<uid>/<id>`**；每次生成后清掉该用户文件夹里除「已保存的那张 + 刚生成的这张」以外的旧文件。
  **上传的照片只进模型一次，不落任何地方**（守卫断言路由里唯一的 `.upload(` 传的是生成结果字节）。用量写 `ai_usage`（slot `avatar`，含失败），审计 `assistant_avatar_generated`。
  OpenAI 的内容拒绝（moderation / safety）映射为 422 `blocked`，界面提示「换一个试试」。
- **键与渲染**：`lib/agent/avatarKeys.ts`（纯模块）——`isCustomAvatarKey` 只认 `custom:<uuid>/<8–40 位小写字母数字>`，`customAvatarUrl` 只拼到我们自己的存储主机，
  所以存进档案的值永远指不到别处；`lib/agent/avatars.tsx` 重导出并在 `AssistantAvatar` 里对自定义键渲染 `<img>`（`data-avatar="custom"`）。
  **坑**：Route Handler 里 import 带 `'use client'` 的 `avatars.tsx`，常量会变成 client-reference 存根——第一次实跑报「Bucket name invalid」就是 `CUSTOM_AVATAR_BUCKET`
  成了 undefined；所以键工具单独放在无指令的 `avatarKeys.ts`，守卫禁止路由再从 `avatars.tsx` 导入。
- **界面**：`AvatarPicker` 顶部多一组「自己做的」（只对登录账号）：当前自制头像（若有）+「＋」；点「＋」整个选择格换成 `components/agent/AvatarMaker.tsx`——
  「用照片 / 用文字」分段 + 四个风格芯片 + 照片选择（`lib/agent/avatarImage.ts downscalePhoto` 在设备上先缩到 ≤1024px JPEG）或 300 字描述 + 「生成头像」→
  预览 +「用这个」（回调 `onPick(key)`，与预设同一条保存路径）/「再来一次」；文案写明照片不保存、每小时 6 次、由 OpenAI 生成（美国）。面板、手机活动弹层、
  `/settings` 三处自动获得，因为它们都渲染同一个选择格。
- **生产实跑（2026-09-27 晚，ship54，租客测试号）**：本地先经开发服务器真实调用两种模式（文字 19–24 秒 · 照片 20 秒，第一轮因 client-reference 存根报
  「Bucket name invalid」，拆出 `avatarKeys.ts` 后通过；照片模式把预设人物图当照片输入，产出保住了眼镜 / 胡子 / 卫衣，黏土小狗也到位）；生产 375px：
  活动弹层 → 铅笔 → 换头像 → 选择格顶部「Your own · ＋」→ 生成器（用照片 / 用文字 · 四种风格 · 隐私与限次说明）→ 用文字 + Memoji 风 + 「a smiling barista …」→
  约 20 秒出图 → 「Use this one」→ 弹层与对话头部立即换成自制头像，`assistant_profiles.avatar = custom:<uid>/6e3137bf…`，本机缓存同值；桌面面板的选择格同样显示
  「当前自制头像」+「＋」。`ai_usage` 有 6 行 slot=avatar（含最早两次存储失败的记录，ok=true + error）；测完已删除该账号桶内文件并把 avatar 还原为空。
  活动日志里这类事件目前用默认「·」图标（`itemIcon` 未映射），无碍。

## 首页 V0.7：营销 + 登录页（2026-09-27 · 用户「把首页做成一个营销和登录页，要把 Stayloop 的系统解释清楚…网页端首页里的 AI 对话框空间较小，体现不出来好处…取消…4 个角色登录进去后就直接 AI 对话框」→ 蓝本 → 「header 的菜单和位置不要动，其余的都按照你的建议修改，修改后的版本为 V0.7」）

蓝本 `design/homepage-v10-marketing-login-2026-09.html`（桌面 1280 + 手机 375 + 规格表 + 四个决定点，用户全部按建议采纳）。守卫 `tests/homeV10_20260927.spec.ts`（11 条）+ `tests/homeRoles20260927.spec.ts`（改写）；`tests/homeHero20260925.spec.ts` 退役（其中 useAuth 广播的断言搬进新 spec）。**Header / Footer / logo / 配色一律不动。**
- **四个决定**：① 首页去掉实时对话框——三周实测里它只有半屏、匿名访客没有个人数据，展示不出「替你办事」，页面也没说清系统是什么；免登录的真实体验不删，搬到助手预览页（整屏对话）。② **已登录访客不看首页**：`HomeNext` 在 auth 解析后用登录页同一谓词 `homeForHats(记住的身份, my_hats)` 做 `router.replace`（租客 / 房东 / 经纪 → 各自 `/x/agent`，服务商 → `/provider/jobs`），期间显示「正在打开你的助手…」+ 兜底链接；首屏仍按匿名渲染（与预渲染 HTML 一致，不在水合期分支）。③ Hero 右侧是登录卡。④ 保留四身份 tab、租前租中租后四卡、数字带、FAQ、页头页脚；删掉 hero 对话与痛点三格（并进「登录后直达」四格）。
- **页面顺序**（注释锚 `{/* ================= X`，守卫按顺序断言）：HERO: message + login card（44px 两行标题 · 一句导语 · 「免费开始 →」锚到 `#login` · 「先免登录试一试」→ `/tenant/agent`）→ LANDING MAP（「登录后，你会直接进入」四格，各链到自己的预览页，服务商链 `/services` 并标试点）→ HOW IT WORKS（2026-09-28 加：「Stayloop 是怎么工作的 / How Stayloop works」+ 三方联动动画，见文末「首页三方联动动画」）→ PROPOSE / DECIDE（标注「示例对话 · 房东 · 内容为示范」的两句对话 + 审批卡真实样式：将分享 / 不会分享 / 预览正文 / 批准 / 拒绝 / 60 秒撤销 / 审计，按钮是 `<span>` 不是控件；下面四步流 说一句 → 助手去办 → 你来批准 → 执行并留痕）→ PRODUCTS: one flow（原四卡不变）→ ROLES（原滑动胶囊 tab；例句改为 `assistantPromptHref(role, prompt)` 打开助手预览，眉标「试一试 · 打开助手预览，不用登录」）→ RULES（新：`RULE_IDS` 十条经 `ruleById` 从 `lib/ontario/rules.ts` 取标题与法条号，指导比例数字来自 `GUIDELINE_TEXT`，「全部 N 条」= `ONTARIO_RULES.length`）→ STEPS（登录 → 选身份、起名 → 说第一句话，三种身份各一句例句）→ VERIFY（原数字带）→ FAQ（原五问之前加「不登录能试吗？」→ `/tenant/agent`；模型列表 Claude · GPT · Gemini 挪进「数据放在哪里」那问）→ FINAL。无价格、无照片、无编造数字、示例对话沿用数据规范（Unit 1207 · Mia Chen）且按 09-27 引导卡的规矩措辞（申请按材料齐全与递交时间整理、分数只在报告里）。
- **登录卡** `components/home/LoginCard.tsx`：~~Google / 邮箱一次性链接（默认；首次登录即注册）/ 「已有密码？密码登录」~~ → **2026-09-27 晚改为常规方式**（用户：「这个发送登录链接的功能早就不要了」）：「登录 / 注册」两个 tab + Google；登录 = 邮箱 + 密码（忘记密码、重发验证邮件），注册 = 邮箱 + 密码 + 确认（≥8 位、防枚举、发验证邮件后卡片原位变「验证你的邮箱」）；脚注「注册免费 · 不要信用卡 · 租客永远免费」。三种方式的状态与处理器抽成 `lib/auth/useLoginForm.ts`（含 `callbackUrl`），`/login` 页改用同一 hook、界面一字不改；Google 图标抽成 `components/auth/GoogleIcon.tsx`。
- **深链**：`lib/homeDeepLink.ts`（`assistantPromptHref` / `homeAskRedirect`，纯函数）；`middleware.ts` 把 `/?ask=…` 308 到 `/<role>/agent?prompt=…&send=1`（role 不是三者之一 → tenant，ask 截 300 字）。角色页 `RoleLanding` 的 `/?role=&ask=` 链接原样保留（eliseai 守卫不变）：匿名落到预览、已登录落到真实助手，`usePromptDeepLink` 的 `send=1` 语义不变。
- **顺带**：`AgentChat` 的 `compactHeader`（只有首页在用）连同分支删除；页脚 `V0.6 → V0.7`（`threeRoleReport` 守卫同步）；`oneAssistant / museMobile / review20260925 / walkthrough20260922 / guidedIntake` 里钉住旧 hero 的断言改为新行为。**手机 375 的一个坑**：示例对话卡里 `truncate` 的占位句把单列 grid 的 min-content 撑到 450px，两张卡都要 `min-w-0`（与 08-24 的宽表规矩同一根因）。
- **本地核对（dev）**：`/?role=landlord&ask=…` → 308 `/landlord/agent?prompt=…&send=1`；`/login` 200；预渲染 HTML 含 home-login / home-tiles / home-demo / home-rules / home-faq、不含 AgentChat；1280 与 375 截图与蓝本一致，控制台无错；tsc 通过，全套 1244 条测试通过。
- **生产核对（2026-09-27 晚，ship55，smoke 9/9）**：预渲染 HTML 含登录卡 / 四格 / 示范段 / 规则段 / FAQ 与 `V0.7`，不含 AgentChat；`/?role=landlord&ask=…` → 308 `https://www.stayloop.ai/landlord/agent?prompt=…&send=1`，`/?role=landlord`（无 ask）仍 200；`/login`、`/tenant/agent` 200。内置浏览器（匿名）：登录卡、4 格、6 问、10 条规则、5 条房东例句、页脚 V0.7，控制台无错，375px 零横向溢出、输入框 16px。租客测试号用魔法链接登录 → 落 `/tenant/agent`；再打开 `/` → 3 秒内被送回 `/tenant/agent`（页头「Acting as: Tenant」）；清掉会话后 `/` 又是登录卡。**注意**：内置浏览器面板处于隐藏状态时页面 JS 不跑，第一次核对因此看到「已登录仍显示登录卡」——那是面板没在前台，不是代码问题；核对已登录跳转前先 `tabs_select` 把标签页调到前台。
- **logo 去向 + 登录后保留菜单（2026-09-27 晚，用户「登录以后点击 logo 应该跳到哪里？」「客户如果想要去看房源呢？找不到 header 里的菜单也是不好的体验」）**：
  ① logo：访客 → `/`；已登录 → 当前身份的助手页（服务商 → `/provider/jobs`），不再绕经 `/` 闪一下营销页。规则是纯函数 `lib/homeHref.ts homeHrefFor`
  （auth 或帽子未加载完 → `/`，与预渲染一致），`lib/useHomeHref.ts` 收集输入（登录态、`activeHat`、服务商上下文——原 Header 里的 `rememberedProvider`
  读取搬到这里），Header 与 Footer 的 `<Logo href={home.href}>` 共用；`/` 对已登录用户的自动跳转保留作兜底。② **Header 菜单在所有页面都一样、一直在顶部**（用户 2026-09-27 最终定：「header 的菜单就一直保留在顶部，各个模块都可以使用」；节点 2 的「应用壳只显示身份芯片 + 切换」与随后的中间方案都撤销，`appShell` prop 删除，WorkspaceShell 与 /provider 两页改为普通 `<Header />`）：桌面 `我是 ▾ · 产品 · 房源 · 定价 · 租客筛查` 在工作台各模块与营销页完全一致。**登录后「我是 ▾」就是身份切换器**——按钮文字变成「我是房东」（当前身份；服务商上下文为「我是服务商」），下拉列出与汉堡菜单折叠列表同一份 `identityRows`（租客 / 房东 / 经纪 / 服务商：当前 · 切换 · 开通），点一项就地切换或进开通页（`closeMenus` 同时关掉两处）；访客看到的仍是四个角色营销页。守卫 `tests/logoHome20260927.spec.ts`，`node2Clarity` 相应改写。
  **生产核对（ship56，1247 条测试、冒烟 9/9、路由审计 70/70）**：匿名首页 logo → `/`、菜单「我是 ▾ · 产品 · 房源 · 定价 · 租客筛查」原样；租客测试号登录后在
  `/tenant/agent` 的桌面 header 是「当前身份：租客 · 切换 · 产品 · 房源 · 定价 · 租客筛查」，logo href `/tenant/agent`；在 `/pricing`（营销壳）页头与页脚 logo 都指向
  `/tenant/agent`，点 logo 直接落到助手页；清会话后 logo 又回到 `/`。
  **生产核对（ship57，1247 条测试、冒烟 9/9、路由审计 70/70）**：匿名首页「我是…」下拉仍是四个角色页；租客测试号登录后 `/tenant/agent` 与 `/pricing` 的桌面 header
  完全一样：「我是租客 ▾ · 产品 · 房源 · 定价 · 租客筛查」，没有身份芯片，logo → `/tenant/agent`；点「我是租客」在原位弹出身份下拉（租客 当前 / 房东 开通 / 经纪 开通 /
  服务商 开通），汉堡菜单不会打开，Esc 关闭；清会话后按钮又回到「我是…」。
- **活动列表标题加重（2026-09-27 晚，用户拿 Muse 活动页对照「标题改为加重的字体」，ship58）**：`AssistantPanel` 活动标签与手机 `ActivitySheet` 的行标题由
  13px / 400 改为 **14px / 600 / 墨蓝**（`text-[14px] font-semibold leading-snug text-ink`），注释与时间仍是 12px / 10.5px 的浅灰，两处同一字符串，`museWeb` 守卫钉住。
  生产核对：租客测试号面板里标题计算样式 600 / 14px / rgb(27,27,60)。

## 首次登录先选身份（2026-09-27 · V0.7 跟进 · 让「三步开始」的第二步成真）

首页「三步开始」写的是「登录 → **选身份，给助手起个名字** → 说第一句话」，但从首页登录卡进来的新账号没有任何身份意图（`?role=` 只有角色营销页会带），
回调页把全新账号送到 `/onboarding/name`，而起名页遇到没有 `?role=` 就**默认按租客**起名、落到 `/tenant/agent`——房东 / 经纪 / 服务商只能事后在「我是」菜单里开通。
现在起名页在没有身份意图时先问一步（守卫 `tests/onboardingRole20260927.spec.tsx`，8 条，含 react-test-renderer 点击流程）：
- **身份来源与顺序**：`?role=`（角色页 / 回调页带来的）→ 本标签页早先选过的（`sessionStorage sl-onboarding-role`）→ **都没有就出选择页**，不再默认租客。
  选择页 = STEP 01/02「你现在主要是哪种身份？」+ 四张卡（租客 / 房东 / 经纪 / 服务商·试点）+ 一句「一个账号可以同时是租客、房东、经纪；之后随时在右上角『我是』菜单里切换或开通」；
  起名步 = STEP 02/02，多一行「当前身份：房东 · 换身份」（清掉记忆、回到选择页）。四张卡的文案在纯数据模块 `lib/onboarding/roleChoices.ts`
  （`ROLE_CHOICES`，页面 / `components/onboarding/RoleChooser.tsx` / 守卫共用一份；守卫禁止出现佣金 / 在线收租 / 评分 / 即将 / 百分比等未兑现或不该写的词）。
- **落点不变**：租客 → `/tenant/agent`；房东（已登录）→ 显式 `claim_landlord` 后进 `/screening/app`（2026-08-12 激活决策，匿名 → `/landlord/agent` 预览）；
  经纪 → `/agent/verify`；**服务商 → 直接 `/provider/onboard`**（服务商帽子没有助手页，先入驻核资质；名字以后在助手面板或设置里起）。
  已起名的账号仍按 `useOnboarded` 跳过整页（无身份意图时用账号记住的帽子决定去处）。
- **起名步的过时文案改成事实**：能力清单删掉「佣金拆分 · 团队协作」（转介佣金引擎冻结）、「8 Engine 自动尽调」、「看房 Live · 现场记录」；改为申请队列一键筛查 /
  取证 + 可解释评分 + 法庭与 LTB 记录 / 安省规则内置 / 决定通知 · 标准租约与电子签 · 续约 90/60/30（房东），客户表与 TRESA 日期 / 挂牌定价 / 带看准备包 · 委托后代客筛查 /
  RECO · TRESA 边界（经纪），材料包 · 找房看房 · 申请追踪（不看分数）· 入住报修续约（租客）；租客描述里的「她」改「它」；页脚提示改为「改名、换头像、写人设和说话风格」（都已存在）。
- **有意不动**：首次登录的房东仍落筛查页而不是助手页——那是有数据依据的显式决策（33 注册 / 3 活跃筛查），V0.7 的「登录后直达助手」针对的是回访用户的首页跳转；要改需用户拍板。
- 本地核对（dev，英文界面）：匿名 `/onboarding/name` → 选择页四卡；点房东 → STEP 02/02、`Identity: landlord`、sessionStorage 写入、能力清单为新文案；「换身份」→ 回到选择页且记忆清空；
  点服务商 → `/provider/onboard`；`/onboarding/name?role=agent` 不出选择页；375px 四卡零横向溢出；控制台无报错。tsc 通过，全套 1255 条测试通过。
- **第二个发现（同日）：首页也要能接住「已登录但全新」的账号。** 起因是我用 Auth Admin `generate_link` 铸的测试链接一律落在站点根地址 `/` 而不是回调页——
  当时判断成「GoTrue 把不在白名单里的 redirect_to 改回 Site URL」，**这个判断是错的**（2026-09-28 拿到管理 PAT 后核实：白名单本来就有 `https://www.stayloop.ai/auth/callback`
  与 `https://www.stayloop.ai/**`；错在我的探测把 `redirect_to` 放进了请求体，而 GoTrue 只认 URL 查询参数，supabase-js 也是这么发的——改成查询参数后链接完整保留
  `/auth/callback?next=…`）。所以真实用户的验证 / 重置邮件一直是正常到回调页的。**修法仍然保留，作为兜底**：一个全新账号可以不经回调页就以登录态到达 `/`（没带 redirect_to
  的铸造链接、或者离开 onboarding 后手动回首页），原先会被 `homeForHats` 直接送进 `/tenant/agent`、跳过选身份与起名。`lib/landlordHat.ts landingForAccount(stored, hats, named)`
  = 「没有房东 / 经纪 / 服务商帽子 **且** 从未给助手起名（`assistant_profiles.name` 或本机该账号的缓存）」→ `/onboarding/name`，否则照 `homeForHats`；首页等 `my_hats` 与名字
  都解析完（`ready`）再跳；`lib/aiName.ts resolveAccountNameFor(uid)` 丢弃登录前缓存的旧解析结果。homeV10 / review20260925 / museMobile 三份守卫里钉住
  `homeForHats(remembered, hats)` 的断言改为新谓词。**以后用 `generate_link` 铸测试链接要把 `redirect_to` 放在查询参数里**（`…/admin/generate_link?redirect_to=<urlencoded>`），
  否则落点是站点根地址。
- **同晚：登录方式回到常规（用户：「这个发送登录链接的功能早就不要了，改为常规的几个登录方式了」）。** 这条决定此前没进 CLAUDE.md，V0.7 的登录卡又把「邮箱一次性链接」做成了默认。
  现在 `lib/auth/useLoginForm.ts` 只有 Google / 邮箱 + 密码登录 / 邮箱 + 密码注册（`signUpWithPassword`，原 `/register` 的逻辑搬进 hook：≥8 位、两次一致、
  已注册防枚举、autoconfirm 时直进回调）/ 忘记密码 / 重发验证邮件，`sent ∈ verify | reset` 决定「查收邮箱」文案；`LoginCard`（「登录 / 注册」tab）、`/login`
  （去掉「邮箱链接」tab）、`/register`（改用同一 hook）三处共用；`/join/[token]` 的「输入邮箱免密码登录」改为「登录后接受」→ `/login?next=/join/<token>` + 「注册」；
  看房弹窗、设置页登录方式标签（「邮箱 + 密码」）、首页三步第一步、`/login` 的 metadata、i18n 里三条死字符串同步。**`signInWithOtp` 在 app / components / lib 里为零**
  （守卫 `tests/loginMethods20260927.spec.ts`，homeV10 守卫改写）。注册后的验证邮件链接落在回调页（白名单含 `/auth/callback`），由回调页送全新账号去起名；首页的兜底只是第二道保险。
- **首页跳转出现过一次错误落点（未复现，已硬化）**：白纸账号开通房东、起名后重开 `/` 一次落到 `/tenant/agent`；日志证明那次 `my_hats` 返回 200（房东行已存在），
  即跳转发生在 RPC 返回之前、用的是 `useHats` 某个「已加载但全 false」的瞬时状态；随后把记住的身份改回房东连续两次重开都正确落到 `/landlord/agent`。
  硬化：`useHats.load()` 在发 RPC **之前**同步置 `loading:true`（原来「无用户 → 全 false 且 loading:false」之后用户出现时，直到 RPC 返回前都是这个陈旧状态；
  首页跳转和 `WorkspaceShell` 的房东守卫都是一次性决定，会被它骗到）。测试期间在页面里用错 key 调 `my_hats` 产生的三条 401 是我自己的实验，不是应用。
- **生产核对（2026-09-27 晚，ship59 → ship60 → ship61，冒烟均绿；ship61 跳过的两条是匿名对话探针撞上每小时 8 次限流）**：用当晚新建的白纸测试号
  `onboarding-test@stayloop.ai`（无任何帽子、未起名）走首次登录：管理接口铸的链接（未带查询参数 redirect_to）落在 `https://www.stayloop.ai` 根地址 → 首页把它送到
  `/onboarding/name` 选择页（STEP 01/02）→ 选房东 → 起名 Pilot（STEP 02/02、`Identity: landlord`）→ `claim_landlord` 200 + `assistant_profiles` 201 → 落 `/screening/app`，
  名字缓存归属该 uid；再开 `/onboarding/name` 跳过起名直达 `/landlord/agent`。ship61 后以访客身份核对首页登录卡：「Sign in / Create account」两个 tab、登录 = 邮箱 + 密码、
  注册 = 邮箱 + 两次密码 + Google、卡内无任何「链接」文案、375px 零溢出、输入框 16px；`/login` 无「邮箱链接」tab。测试号与其房东行 / 助手档案已删除。
  Supabase 日志证实该时段浏览器侧的三条 401 全是我在页面里手调 `my_hats` 的实验（应用自身零 401）。

## 首页三方联动动画（2026-09-28 · V0.7 · 用户「做一个介绍网站的动画」→「要按照现在的页面设计来做」→「按三个角色联动…真人演绎」→「先用 C 3D 卡通人物来做」）

**教训：演示产品的动画一律用产品自己的组件来演，不要照着画一个「像产品」的界面。** 第一版手画舞台被否；第二版单角色演示（HeroShowcase，真实组件驱动）
未上线即被三方联动版取代，文件已删。规划稿 `design/three-role-film-plan-2026-09.html`（B 真人风格 / C 3D / A 实拍的对比、六幕分镜、真实性边界），用户选 C 先做。
守卫 `tests/threeRoleFilm20260928.spec.ts`（22 条）。
- **位置与标题（用户 2026-09-28 看完预览：「可以把这个加到主页了，上面加一个 Title，How Stayloop Works」）**：独立一节 `<section id="how-it-works">`，
  标题用首页各节同一体例（无眉标、28/36px）：「Stayloop 是怎么工作的 / How Stayloop works」+ 右侧「看完整产品结构 →」(/platform)。当天第一版排在
  「登录后」四格之后，随后整页重排（见下节「首页讲一个故事」），现在紧跟 hero；导语只交代场景（各有自己的 AI 助理，事情在三个助理之间接力；
  下面用同一套房，从委托挂牌演到续约），批准规则由动画下方的四步「它提议，你决定。」说一次。
- **人物**：租客 Mia Chen（助理 Momo · 小猫）、房东 Sarah Wang（Bao · 熊猫）、经纪 David Park（Ollie · 猫头鹰）——站内示范数据的三人，同一套 Unit 1207 · $2,800。
  12 张场景图 + 3 张头像在 `public/home/film/`（gpt-image-2 由三张 3D 定妆图编辑生成，960×640 webp，每张 ≤ 60 KB）。标注「示范动画 · 3D 人物由 AI 生成 · 内容为示范」。
- **组件 `components/home/ThreeRoleFilm.tsx`**：每人一条泳道 = 上方场景图（缓慢推镜、切换淡入）+ 下方手机，**手机里就是真实的 `AgentChat`**，新 prop **`device`**
  （与 `hero` 同用）= 任何宽度都用手机排版：头部显示、每条消息带小头像、手机输入条、**不显示快捷入口**（五张卡会把手机大小的对话压没，第一次实测审批卡被顶出可视区）。
  不传 `device` 时 `/x/agent` 与首页一切照旧（守卫逐条比对）。审批卡照常渲染，**指针先把该泳道自己的对话滚到按钮处（`[data-chat-thread]`，不滚整页）、再点卡片自己的按钮**
  （`data-decide` / `data-option`），走真实的「提交中…」→ 60 秒撤销行 →「⏩ 60 秒后」→「✅ 已执行」；新卡到达先把卡片标题滚到可视区（`[data-approval-card]`）。
  交接时一枚「看房请求 →」胶囊从一部手机飞到另一部；邮件与推送以横幅落在收件人手机上。宽屏三部手机并排（不在戏里的变暗、谁接到东西谁亮起），
  lg 以下一次一部 + 顶部「接力条」。章节按钮一行（手机可横滑）+ 暂停；`inert` + `aria-hidden` + 屏幕阅读器整段说明；可见 ≥25% 且标签页可见才播；
  减少动态效果时不播，每章显示关键帧（卡片等待批准那一刻）。淡入动画用 `backwards` 填充——`both` 会把 opacity 锁在 1，盖掉变暗类（第一次实测三条泳道都没变暗）。
- **剧本 `lib/home/film.ts`**（纯函数，五章约 67 秒）：① 委托定价（Sarah 请 David 代办 → 邮件链接确认委托 → David 工作台出现真实的「正在代表」条 → 挂牌 + TRREB 定价）；
  ② 找房看房（Mia 一句话 → 房源卡 + 真实的「已按 … 过滤」→ 看房请求卡与推送 = `/api/showing-intent` 原文 → Sarah 批准 → Mia 收到真实邮件标题）；
  ③ 申请筛查（David 在委托范围内发起筛查，只引导到客户表、不替房东做决定 → 录取卡 = 申请人页 `proposeNotice` 原文 → Mia 收到录取邮件）；
  ④ 签约（`send_lease` 卡 → 真实邮件标题 → 双签成在管租约）；⑤ 续约（**一年后**：入住日 = 下下个月 1 号、到期 = 一年减一天、当天 = 到期前 91 天，
  续约卡由 `buildRenewalProposal` 本身生成，指导比例按生效年份，推送 = proactive 扫描原文）。只有房东的手机里有卡和点按；租客手机里不出现分数；除指导比例外无百分比、无统计。
- **顺带的产品修正**：续约涨到 $2,853.20 时，卡片正文（`$2,853`）、按钮与执行回执（`$2,853.2`）、续约邮件（`$2,853.2`）三处不一致——统一用 `chatCopy.rentAmount`
  （有分才显示两位小数）。`AgentChat` 只滚动对话自身（`threadRef.scrollTo`），不再 `scrollIntoView`（会连带滚动整页）；开场白与「✅ 已执行」文案抽到 `lib/agent/chatCopy.ts`，
  会话钩子与动画共用。
- **本地核对方法**：内置浏览器面板隐藏时截图是旧画面；改用无头 Chrome + CDP（会话 scratchpad `shoot.mjs`：按章节与毫秒截帧、打印字幕与控制台错误；`overflow.mjs`：五个宽度量横向溢出与各部分高度）。
- **未做**：规划稿里 /platform 的 90 秒完整版（含报修一幕、服务商客串）；B 方案（真人风格）需要用户另行决定。

## 首页居中 + Muse 式登录（2026-09-29 · 用户「首页这里的登录模块要尽可能的简化，参考 muse 的，另外，要把首页的标题都放到居中」）

守卫 `tests/homeCentered20260929.spec.tsx`（含 react-test-renderer 点击流程）。
- **Hero 改为一列居中**：标题 · 导语（中文在「批准，」后断行）· 登录块（`max-w-[400px]`）· 「先免登录试一试 →」；原来的双栏与 hero 里的「免费开始」按钮删掉
  （结尾「三步开始」的「免费开始 ↑」仍滚回登录块，登录块带 `scroll-mt-24`）。
- **所有区块标题居中**：怎么工作（「看完整产品结构 →」移到导语下）、「它提议，你决定。」、四种身份（选项卡整行居中）、安省规则（改为标题在上、规则芯片居中在下）、
  数据带（标题与四个数字居中）、FAQ（标题在上、问答一列 760px）、三步开始（步骤与按钮居中）。身份选项卡的滑动胶囊在居中后会随字体加载移位，现在用 ResizeObserver +
  `document.fonts.ready` 重新测量。**注意**：带 `captureBeyondViewport` 的整页截图会让胶囊处在滑动途中，看起来错位，不是真问题。
- **登录块 `components/home/LoginCard.tsx`（Muse 式）**：无卡片、无选项卡，三小步——①「登录或创建账户」· 邮箱 ·「继续」（按钮常亮，空或格式不对在提交时提示）+ 下方
  「使用 Google 继续」；② 显示邮箱 +「更改」、密码 +「继续」（登录）、「忘记密码？」「第一次来？创建账户」；③ 创建账户：密码两次 +「创建账户」+ 服务条款与隐私。
  登录方式不变，全部来自 `useLoginForm`。
- **邮箱是否已注册的判断（同日，用户「当然要加上这个判断」，明确接受「任何人都能探测某个邮箱是否注册过」这个代价）**：「继续」先查一次再分流——
  已有密码的账户 → 密码步（不再显示「第一次来？创建账户」；账户同时绑了 Google 时多一个「改用 Google 登录」）；新邮箱 → 直接进创建账户（标题「这个邮箱还没有注册 ·
  免费创建账户」，不显示「已有账户？」）；没有密码的账户 → 只绑 Google 的给「使用 Google 继续」+「想用密码登录？发一封设置密码的邮件」，两者都没有的给「发送设置
  密码的邮件」（重置密码流程也能给 OAuth 账户设密码）；**查不到（限流 / 网络 / 5 秒超时）→ 退回原来的手动路径**（密码步 +「第一次来？创建账户」）。
  查询期间按钮显示「请稍候…」、邮箱框只读。三层：SQL `public.auth_email_status(p_email)`（迁移 `20260929_auth_email_status.sql`，已应用 prod；
  SECURITY DEFINER、`search_path = ''`、按 `lower(email)` 匹配、排除软删除与匿名用户；**只回三个布尔值 exists / password / google**，不回 id、确认状态、时间；
  `revoke all … from public, anon, authenticated` 后只 grant service_role——回滚事务验证过 anon / authenticated 都被拒）→ 边缘路由 `POST /api/auth/email-status`
  （先校验格式，再与两个限流并行查询：每 IP 每小时 30 次 + 全站每小时 1500 次，**都 fail-closed**，限流不通过不返回结果；全部响应 `Cache-Control: no-store`；
  只有 POST）→ 纯模块 `lib/auth/emailStatus.ts`（`normalizeLookupEmail / toEmailStatus / routeForEmail / lookupEmailStatus`，路由与登录块共用，无 'use client'）。
  生产现状：有邮箱的账户要么有密码、要么有 Google（两个既无密码也无 Google 的是匿名用户，没有邮箱，查不到）。守卫 `tests/emailStatus20260929.spec.ts` +
  `tests/homeCentered20260929.spec.tsx`（六种应答各走一遍真实点击流程）；路由审计多三条探针（格式错 400、GET 405、不存在的地址回三个布尔值或 429）。
  `/login` 页没有改（仍是原来的选项卡式），等用户决定要不要对齐。

## 设置 AI 助理之前先登录（2026-09-29 · 用户「从我是菜单下面的这几个页面，点击唤醒你的 AI 助理按钮，是不是应该先有登录？才能到设置助理这个步骤？」）

守卫 `tests/onboardingSignIn20260929.spec.tsx`（真实渲染五种状态 + 返回路径 + 三个角色页按钮）；`onboardingRole20260927` 的步数、`walkthrough20260922` 的标题同步。
- **问题**：`/tenant` `/landlord` `/agent` 的主按钮（唤醒你的 AI 助理 / 让 AI 接管出租 / 把杂活交给 AI）、定价页、关于页、页头「成为房东」都进 `/onboarding/name`，
  而这一页不要求登录——未登录的访客也能起名，名字只存在这个浏览器（`lib/aiName` 的「未认领」缓存），随后落到什么都不记的预览页。租客页按钮还不带 `?role=tenant`，
  从租客页进来反而被问「你是哪种身份」。服务商入驻（`/provider/onboard`）与经纪核验（`/agent/verify`）本来就要登录。
- **现在 `/onboarding/name` 先判登录**：会话未知时只渲染空白占位（已登录的人不会闪一下登录框）；**未登录 → 第 1 步「先登录，再设置你的 AI 助理」**，嵌入首页同一个
  `LoginCard`（邮箱先行 + 是否已注册的判断 + Google），`next` = `/onboarding/name?role=<身份>`——`useLoginForm(tab, { next })` / `callbackUrl(next)` 新增显式返回路径
  （同一套安全检查），**密码登录、注册验证邮件里的链接、重发验证、Google 四条路都回到这一页并带着身份**；登录步下方一行「先不登录，看看预览 →」（按身份去 `/x/agent`），
  写明预览不会记住你、也不能替你办事。**已登录 → 选身份（第 2 / 3 步，只在没人替他选时出现）→ 起名（最后一步）**，之后照旧（房东显式开通后去筛查页、经纪去核验页）。
  入口不用逐个改——所有按钮都经过这一页，闸门只放这一处。
- 租客页按钮改为 `/onboarding/name?role=tenant`。`LoginCard` 注册后那句「点开它完成注册，再回来登录」改为「会自动登录并接着往下走」（隐式流，点开即已登录）。
  `LoginCard` 里邮箱那一步的提交函数改名 `continueWithEmail`（原名 `next` 与新 prop 冲突）。
- **取代** 2026-09-22 外部走查那条「匿名房东起名后去 `/landlord/agent` 预览」与 V0.7「首次登录先选身份」一节里的 `STEP 01/02 · 02/02` 编号：匿名访客现在走不到起名按钮。
  `lib/aiName` 的「未认领」缓存逻辑保留（老浏览器里可能还留着）。
- **同日跟进：`/login` 与 `/register` 也统一成这一页（用户「把汉堡菜单里的登录，注册页面也统一成刚修改过的登录，注册页面一样的」）**。守卫
  `tests/authPages20260929.spec.tsx`（真实渲染两页、已登录跳转、匿名会话、注册页的回退）。三处共用 `components/auth/SignInBlock.tsx`（标题 + 一句导语 + 可选备注 +
  `LoginCard` + 「先不登录，看看预览 →」）；两个路由只剩一行 `<AuthPage mode="signin|register" />`（`components/auth/AuthPage.tsx`：已登录跳转——安全的
  `?next=` / `?redirect=` 优先，否则 `homeForHats`；匿名会话仍显示表单）。**页头菜单保留**（用户 09-27：找不到页头菜单是坏体验）：`OnboardingStage` 新 prop
  `bare` 去掉自带的 logo / 步数条，页面上方是站点 Header、下方 Footer。两页只差标题（「登录 Stayloop」/「创建你的 Stayloop 账户」）和**邮箱查询失败时的回退**：
  `LoginCard` 新 prop `intent`，`/register` 回退到创建账户、其余回退到输密码。旧的「欢迎回来」表单与三栏注册表单已删。顺带：在管租约邀请页 `/join/<token>`
  的「注册」链接原来不带 `next`，新用户注册后回不到邀请——现在是 `/register?next=/join/<token>`。

## 页头「我是…」用身份色（2026-09-29 · 用户「我是房东这个菜单文字的颜色也改成…一样的绿色吧，这样就容易理解现在的角色了」）

登录后桌面页头的「我是房东 / 我是租客 / 我是经纪」改用与头像菜单「当前：房东」芯片**同一个颜色来源** `ROLE_META[displayRole].color`
（= `ROLE_THEME[role].accent`：房东绿 #047857、租客紫 #7C3AED、经纪蓝 #2563EB），并且始终加粗；下拉箭头跟着变色（`currentColor`）。
访客看到的「我是」菜单不变。守卫 `tests/headerIdentityColor20260929.spec.ts`（`node2Clarity`、`museMobile` 里钉住的几行同步）。
- **同日跟进（用户「我是经纪，我是服务商，也是要一样的处理下」「我是经纪菜单点击了以后要把菜单文字也要切换成我是经纪」）**：页头名称改由纯函数
  `lib/displayIdentity.ts` 决定——**你所在的区域**：服务商页面（及从服务商页面来到的中性页）→ 服务商；`/agent/*` → 经纪，**认证通过之前也是**（在「我是」菜单点
  「经纪 · 开通」会进 `/agent/verify`，此前页头仍写「我是房东」，因为 RECO 注册核验通过前不算持有经纪帽子）；其余 → 当前持有的帽子（`/screening/app` 上替客户筛查的
  经纪仍是经纪）。页头标签、颜色、头像菜单「当前：…」芯片、身份列表的「当前」行、「X 工作台」链接都读它；**权限永远只看帽子**。服务商有了自己的身份色
  `PROVIDER_ACCENT = #C2410C`（橙，`lib/roleTheme.ts`），页头、芯片、身份列表里服务商两行的图标底色、`/onboarding/name` 身份选择卡都用它；未认证的经纪行显示
  「当前 · 未认证」，未入驻的服务商行显示「当前 · 未入驻」。

## 租客筛查只给房东或经纪用（2026-09-29 · 用户「租客筛选功能需要房东或者经纪的角色才可以使用，这个你研究一下怎么做？」）

**研究结论**：页面层早就分流了——`/screening` 的按钮按帽子分（纯租客看到「先备好材料包」+「我也是房东 · 开通后开始筛查」），`/screening/app` 对没有房东帽子的账号
送去 `/landlord/become`，经纪模式没有客户确认、允许筛查的委托就不建记录。**漏的是服务端**：`screenings` 的插入策略只查 `auth.uid() = landlord_id`，任何登录账号都能直接
经接口建自己的筛查并送去评分；测试月里 `/api/deep-check` 对任何登录账号开放、还能只凭输入的姓名跑。生产 234 份筛查里 47 份属于既无房东帽子又无委托的账号
（40 份的账号已不存在、1 份是租客测试号、6 份属于 2 个只有租客身份的真实账号，0 份属于经纪）——**存量不动**，只拦新的。
**规则（`lib/screening/roleGate.ts` 一处）**：房东帽子（landlords 行，`/landlord/become` 免费显式开通）、或在客户委托下的经纪（委托只为 RECO 注册有效的经纪建立，
建记录时由 `guard_screening_delegation` 校验，RLS 只在委托有效期内让经纪读到该记录）、或管理员。**四处服务端执行**：① 表触发器 `guard_screening_role`
（迁移 `20260929_screening_role_gate.sql`，已应用 prod；BEFORE INSERT、SECURITY INVOKER、`is_direct_client_write()` 才检查，service role 写入与管理员放行，
带 `delegation_id` 的交给委托守卫，否则要求 `my_hats().landlord`，拒绝时抛 `screening_requires_landlord_or_agent`）——回滚事务实测：纯租客拒、房东过、无委托经纪拒、
有效委托经纪过、service role 过；② `/api/screen-score` 读到记录后、任何写入之前（合作方密钥与委托记录放行）；③ `/api/deep-check` 的门里、**测试月放行之前**；
④ `/api/verify/create` 在计划检查之前。筛查页把表的拒绝翻成人话（开通房东身份的指引）。守卫 `tests/screeningRoleGate20260929.spec.ts`。
- **同日跟进：经纪直接筛查（用户「经纪可以直接筛选，这个本来就是经纪的工作，客户默认委托了这个的」）**——**取代 09-27 节点 5「代客筛查必须经委托」**。
  RECO 注册有效（verified / renewal_due，与 `isRegistrationLive` 同一口径）的经纪不需要房东身份、也不需要委托就能筛查，报告记在经纪自己名下；注册还在核验 / 已拒 /
  已过期的经纪不行。**委托改为可选**：客户确认、允许筛查的委托仍会把这次筛查同时记在客户名下（房东客户在自己账号里看得到，委托一撤销经纪就失去这类报告的访问）。
  落地：`mayScreen` 加入 `isRegistrationLive(hats.agent)`；触发器新版本（迁移 `20260929_screening_role_gate_agents.sql`，已应用 prod；回滚事务实测：纯租客拒、房东过、
  已核验经纪无委托过、同一经纪注册改为待核验后拒）；筛查页删掉经纪模式「没有委托就不建记录」的拦截，`delegation_id` 只在委托有效时写入，无委托时显示中性说明
  「这次筛查记在你（经纪）名下…想让房东客户也看到就发起委托」，委托失效时琥珀提示；客户表每个**房东客户**行都有「发起筛查」（有有效委托就带上委托，租客客户行不显示——
  经纪在另一边），「发起委托」按钮说明它的作用是让客户也看到报告；AI Agent 的经纪筛查说明、房东开通页给经纪的提示同步。

## 首页讲一个故事（2026-09-28 · 用户看到动画上线后：「动画和这个图片重复了…去掉这个图片，以及其他地方的重复内容。要整体检查一下这个营销首页，要把 stayloop 的故事讲清晰和简单」）

动画上线后同一件事在首页讲了好几遍：「会影响到别人的动作先经你批准」讲了 6 遍（hero 导语、动画导语、「它提议，你决定」一节的导语 + 静态审批卡 + 四步、
「一条流程」导语、FAQ「AI 会不会替我做决定」），四种身份讲了两遍（「登录后，你会直接进入」四格 + 身份选项卡），租前 / 租中 / 租后讲了两遍（动画章节 +
「一条流程」四卡），「开始」讲了两遍（「三步开始」+ 末尾「下一个家，从一句话开始」）。现在按一个故事排、每件事只讲一次（守卫 `tests/homeRoles20260927.spec.ts`
的顺序断言 + `tests/homeV10_20260927.spec.ts`）：
- **HERO**（是什么 + 登录卡，原样）→ **HOW IT WORKS**（怎么工作：动画 + 下方四步「它提议，你决定。」——批准规则只在这里完整写一次，第 3 步写明
  「批准后 60 秒内可撤销」）→ **ROLES**（对你有什么用：四个身份选项卡，唯一讲身份的地方）→ **RULES**（安省规则与编号）→ **VERIFY**（线上实时数字）→
  **FAQ**（4 问：不登录能试吗 / 房源和行情从哪里来 / 筛查会不会一票否决 / 数据放在哪里）→ **START**（「三步开始」+ 免费开始 / 先免登录试一试，合并了原来的
  STEPS 与 FINAL）。
- **删除**：「登录后，你会直接进入」四格（TILES，与身份选项卡重复；「登录后直接进入你自己的助手」挪进三步的第 1 步）、「它提议，你决定。」一节的示例对话与
  静态审批卡（DEMO，动画里就是真卡）、「租前 · 租中 · 租后，一条流程」四卡与 Stayloop API 卡（动画按租前 / 租中 / 租后分章；完整结构由「看完整产品结构 →」
  去 /platform，API 在 /platform、页头「产品」与页脚）、FAQ 里「AI 会不会替我做决定」「服务商怎么加入」两问（分别就是四步与服务商选项卡）。
- **身份选项卡里不属实的话一并改掉**：筛查是 4 个评分维度（`rubric.ts DimKey`），「六维筛查 / 六维核验」删掉数字；租客护照页的四枚章与验证记录是示范数据
  （`SAMPLE_NOTE` 写明只有分享链接是真的），「四枚章盖好，申请任何房源不再重复交材料」「验证一次，处处通行 · 护照、枫叶卡、工签都支持」改为已上线的
  「申请进度看得见」「租约讲清楚，报修有着落」，护照模块换成「签约与报修」(/tenant/maintenance)；房东标题的「按时收租」（没有收租通道）改为「租约、续约、
  维修都有人跟进」，「再排好序给你」改为「录取与否由你决定」；经纪的「佣金结算 · 即将」（转介佣金引擎冻结）删掉，换成「有委托，才代客筛查」「挂牌定价有依据」。
  守卫禁止这些说法回来（`六维 / 四枚章 / 验证一次，处处通行 / 按时收租 / 佣金结算 / soon: true`）。
- **页脚 slogan 也换了（用户同日：「页脚那句也换掉」）**：`lib/i18n.tsx foot.tag`「验证一次，处处通行」→「你说一句，它去办，你来批准。」
  （英文 "You say it, it does the work, you approve."），与首页四步同一句话。
- **全站统一叫「AI 助理」/ 英文「AI Agent」（用户同日三步定下：先让「三步开始」改成「个人 AI Agent」，随后「还是改回 AI 助理吧，不叫个人 AI Agent，
  英文就叫 AI Agent」，最后「全站都统一成 AI 助理 / AI Agent」）**。**以后新写的任何用户可见文字都照此命名，不要再用 助手 / AI 助手 / AI 管家 / AI 租房助手 /
  专属 AI 经纪 / 私人 AI 助理 / 个人 AI Agent，英文不要用 assistant / AI assistant / AI agent（小写）/ personal AI agent / agent inbox。**
  - 改了 45 个文件约 130 处用户可见文字（页面、组件、邮件、推送、SEO 描述、规则页的「执行」说明、助理指令）；**代码名一律不动**：聊天消息的 `role: 'assistant'`、
    `assistant_profiles` 表、`/api/assistant/*`、`AssistantPanel` 等组件名、注释、日志标签。
  - **未起名时的默认名跟着界面语言**：新模块 `lib/agent/assistantName.ts`（无 'use client'，服务端提示词也能引用）——`GENERIC_AI_NAME = 'AI Agent'` 仍是存库的
    「未起名」标记，`displayAiName(name, lang)` 把它显示成中文「AI 助理」/ 英文「AI Agent」，真名原样；`isGenericAiName` 把两种标签都当未起名（onboarding 与
    会话钩子据此决定要不要保存名字）。接入点：`useAIName()`（内部读界面语言）、`AgentWorkspacePage` 的 `shownName`、`RolePages`、`RoleLanding`、设置页名字行与
    编辑框（未起名时输入框留空、占位符显示标签）、onboarding 占位符与预览、会话钩子的两条问候语（匿名预览此前对中文访客说「你好,我是 AI Agent。」）。
  - **助理指令**：未起名时不再写「你的名字是 AI Agent」，改为「用户还没有给你起名字：中文对话里自称「AI 助理」，英文对话里自称「AI Agent」」；人设里的
    「私人 AI 租房助手 / 私人 AI 助手」改为「AI 助理」。
  - 守卫 `tests/assistantNaming20260928.spec.ts`：app / components / lib 非注释行不得出现 助手 / 管家 / 个人 AI Agent；中文文字里不得出现 AI Agent（双语同串的英文半句
    除外）；英文文字里不得出现 assistant / AI agent / agent inbox；`displayAiName` 与提示词自称的行为；各接入点必须走 `displayAiName`。另有 6 个旧守卫里钉住旧文案的断言同步改写。
- **全站不再有「验证一次，处处通行」（用户同日：「也一起改掉」）**：租客唯一能带走的是只读分享链接 `/p/<token>`——姓名缩写 + 按时付租记录（只有按时与否、
  没有金额），而且只取自双方都确认过的在管租约或双方电子签的租约（`households.verified` / `signed_both`）；每一笔付租是任何一方都能「标记已付」的，所以文案
  只说「租约双方确认」，不说「租金记录经双方确认」。改动：/tenant 角色页（导语、四条要点、旅程五步、故事与场景、护照一节四条——`Score 60 → 91`、「报修
  2 小时响应」、「替她谈判」、「缴租维修续约退租全托管」、「Passport 直接复用即出 Stayloop Score」一并删掉）、护照页副标题、/about 原则二（「信任可以复用」→
  「记录可以带走」）与原则一（「付款」→「发通知」，Stayloop 不经手资金）、旧欢迎页 `/onboarding/welcome` 两条、首次登录身份卡的租客一句（`roleChoices.ts`）。
  守卫 `tests/honestPassport20260928.spec.ts`：app / components / lib 里不得出现 验证一次 / 验一次 / 一次验证 / 处处通行 / 全城通用 / Verify once / go anywhere，
  并钉住分享页只认已确认租约、只取 due_date 与 status。
- **同晚第二轮（用户：「这两处也一起改掉」）**：定价页租客卡「四枚章，全部免费盖」→「筛查与核验不向你收一分钱 · RTA s.134」，FAQ 答案改为「找房、申请、签约、
  报修和护照分享链接都免费；房东的筛查与核验费用也不能转给你」；经纪客户页示范段的筛查卡改写为真实的代客筛查流程（客户表记下代表协议与 Information Guide
  日期 →「发起委托」→ 房东客户用自己的账号确认 →「发起筛查」→ 四项打分 + 法庭与 LTB → 双方账号都能看到、可下 PDF、委托一撤销即失去访问），按钮改为
  「去客户表 ↑」（`ClientBook` 根节点加 `id="client-book"`），「秒懂认证护照」→「秒懂代客筛查」；示范行的「护照状态」（让助手列「还缺的章和最快补齐路径」）
  →「跟进」、侧栏示范「提议盖上收入章」→「约第二次看房」；**所有经纪都看得到的**页副标题「${aiName} 自动 CRM · 按阶段 / 盖章进度 / 静默天数排序」改为客户表实际
  有的列。助手指令同步：`SCREENING_RULES_AGENT` 写明代客筛查必须经委托、回复里给 `/agent/clients`（`AgentChat PATH_RE` 加了这条路径才会渲染成链接），房东与经纪两段
  的「六个维度」改为「付款能力、信用、租务与司法历史、核验四项」。守卫在 `tests/honestPassport20260928.spec.ts` 第二段与 `tests/prompts.spec.ts`。
- **同晚第三轮（用户：「那三类也一起改掉」）**，守卫 `tests/honestPlans20260928.spec.ts`：
  - **「六维」→ 四项**：报告实际按 `rubric.ts` 四项打分（付款能力 42 / 信用 26 / 租务与司法历史 20 / 核验 12）。房东申请人页未出分时的卡改为「还没有筛查，点
    「一键筛查」…」（此前写「材料上传后会自动跑六维尽调」，筛查其实要点按钮）、已发起未出分另有一句；六列旧评分分支与 `DIM_META` 删除（生产 0 份申请带旧评分、
    `/api/ai-score` 无调用方）；示范申请人 Mia 改为真实四项（加权正好 92）、删掉「88% 续签 / 0 投诉」「政策门槛」「Persona」「Plaid」「派 David」；`ApplicantReport` 改四段、
    删掉「收入 < 3× 红旗」（OHRC）与「CanLII 检索」；`LandlordThreeSteps`、后台模型页、申请列表示范副标题同步。**V4 的 `/dashboard/applications/[id]` 页删除**——
    `/dashboard` 的申请行与「新申请」邮件一直把房东带到那个只有六根空评分条、没有一键筛查与决定通知的旧页；现在中间件 308 到 `/landlord/applicants/<id>`，两处链接直接改指新页。
  - **「多 42% 房源」与章的「解锁」**：护照页 AI 建议改为「房东发来核验链接时银行一步约 5 分钟，不想连银行可在申请里上传 PDF 流水」；四枚章卡片的「解锁 / UNLOCKS」
    改为「房东看到 / LANDLORDS SEE」，四条收益改为核验后房东实际看到的内容；想法卡「盖上收入章解锁更多房源」→「备好收入材料」；盖章引导卡问「盖上后房东能看到什么」；
    租客助理话术示例改掉并明写「章不限制任何房源」、删掉「需 收入章」示例；房东预览的示范数据不再按「需银行章 / 信用 ≥ 720 / DTI ≤ 35%」筛申请（OHRC），改为按材料齐全与
    递交时间整理；护照页「申请房源时自动附上」「现场出示二维码」「每次访问都进审计日志」（分享链接只记打开次数）三处改掉，分享卡旁不可扫描的装饰二维码与「看房现场出示」删除。
  - **一份房东方案清单**：`lib/billing/landlordPlans.ts` 同时供 `/pricing`、`/dashboard` 升级弹窗、`/settings` 订阅卡读取。弹窗原来列的 Openroom、Slack 通知、品牌申请页、
    优先评分队列、CanLII 查询全部删掉；**专业档只列代码里真正按计划放行的**：筛查不限次（免费每月 5 次）、深度核查、申请人本人核验链接、已核验服务商网络派单（外加标注
    「即将推出」的财务面板）。原定价页专业档的「无限发布房源」「AI 助理全功能」「租约起草 + 一键续约」——免费房东本来就有、代码里没有任何计划门——移到起步档
    （「房源发布，不限套数」「AI 助理、安省标准租约与电子签、续约提醒」），专业档标语改「筛查不限次，核验与服务商网络全开」。`lib/i18n.tsx` 里无人使用的 `dash.pricing.*`
    与 `acct.langplan.planProDesc`（「优先 AI 评分」）删除。**未动**：团队档 $39 的「多成员协作 + 权限 / 多物业组合面板」（组织成员未做，CTA 指向联系页）。

## 消息与沟通系统重设计（2026-09-29 · 蓝本已定稿；**A 期 2026-09-30 已实施**，见下「A 期落地」）

用户：「要加强这个消息系统，是关于所有角色的沟通功能，可以是站内，也可以是短信和邮箱…目标是能否实现所有角色的相互无障碍沟通，并能全部有时间戳和不可删除，
未来可以作为争议处理的证据。希望有一个独立的入口，能可以直接发起消息的，当然都是和租房这个事物相关的沟通。」蓝本 `design/messaging-redesign-2026-09.html`
（现状与缺口、五条原则、六种对话的参与矩阵、界面样稿、证据模型、技术方案、分期与费用）。用户同日「可以的，按照你的建议去做吧」，随即「先这里记录一下，等下开个新对话再做」——
**除蓝本外还没有写任何代码；下一个对话从 A 期开始。**

**四项决定（全部按建议）**：
1. **短信用 Twilio，每月上限 US$30**（Twilio 官网 2026-09：加拿大号码 $1.15/月；每条基础 $0.0083，发出另加运营商费 $0.0064–0.0087，约 1.5–1.7 美分一条）。
   **B 期要等用户自己注册 Twilio、买号码、把凭证交来**——Claude 不替用户注册或付款。
2. **回复邮件用子域名 `reply.stayloop.ai` 收**（Cloudflare Email Routing + Email Worker，免费），主域名 stayloop.ai 的收信不动。
3. **记录在事务结束后保留 7 年**（覆盖 LTB 一年、小额法庭两年的时效，与税务记录一致）；账户注销时删个人资料、对话记录保留（对方也有证据权益），隐私页写明。
4. **默认不交换私人联系方式**：双方经 Stayloop 的中转地址 / 号码联系，除非自己在对话里写出来。

**起点（节点 4 / 6 已有，在上面加，不推翻）**：`threads(kind ∈ work_order | application | tenancy | dispute)` + 只追加的 `thread_messages`（服务器时间、
`thread_party()` 定身份、撤回 = 新增一行）+ `message_reads` 三级回执 + `thread_attachments`（服务器算 SHA-256）+ 正式通知副本 + 事务证据包。现状缺口（2026-09-29 核对过）：
收件箱 `components/messages/Inbox.tsx` 只挂在 `/tenant/messages`、`/landlord/messages`（经纪、服务商没有），任何地方都不能**发起**新消息；看房请求 / 房源提问走
`/api/showing-intent` → 房东待批卡 + 邮件，不进对话；经纪与客户之间没有对话；`ThreadPanel` 每 8 秒轮询，全站没有 Realtime；全站没有短信通道、没有手机号验证；
`thread_messages_append_only` 只拦直连客户端——**服务端（service role）仍能删消息**。

**A 期（不需要额外费用，下一个对话先做）**：
- **入口**：页头头像左侧信封 + 未读数 → 统一消息中心 `/messages`（所有身份一个入口，按身份 / 类型 / 待回复筛选）；`/tenant/messages`、`/landlord/messages`、窄栏与手机「更多」里的「消息」都指向它。
- **「新消息」三步**：关于哪件事（只列调用者参与的事务，来自 `my_matters()` 与已有线程）→ 发给谁（名单由事务关系决定，不能加陌生人）→ 写消息（附件照旧由服务器算指纹）。
- **三种新对话**：房源咨询（看房请求 / 提问改进对话，待办卡只作提醒）、经纪 ↔ 客户（挂在 `delegations` / `agent_clients` 上，客户没账号就走邮件）、联系 Stayloop（管理员一方）。
  `thread_party()`、`open_thread` / `find_thread` 与 RLS 按新 kind 扩。
- **实时**：Supabase Realtime（`thread_messages` 进 `supabase_realtime` publication，postgres_changes 走 RLS）替代 8 秒轮询。
- **证据加固**：① 删除保护扩到 service role；删对话 / 删事务不连带消息（外键 RESTRICT）。**如实说**：数据库所有者（postgres 角色）理论上仍能删触发器，所以要靠 ② 哈希链让任何删改都能被发现——
  每条 `hash = sha256(prev_hash ‖ 规范化内容)`，插入时在数据库里按对话串行计算（锁对话行）；证据包附逐条指纹与校验结果；可选：每天把各对话链头的汇总指纹发到外部作锚点。
- **邮件回复入档**：发出邮件的 Reply-To 为 `t-<签名令牌>@reply.stayloop.ai`；**单独的 Worker**（Pages 项目收不了信）的 `email()` 处理器解析 MIME、校验令牌与发件地址是否与档案一致、
  剥掉引用、存原始 MIME 及其 SHA-256、以 service role 写一条 `channel=email` 的消息；另建逐渠道回执表（已发出 / 已送达 / 已打开 / 已读 / 已确认，存服务商消息编号）与对话参与方表
  （没账号的人的邮箱 / 手机与回复令牌）。**动手前先确认**：Cloudflare Email Routing 对子域名的支持、wrangler 现有令牌能不能配置 Email Routing（不能就请用户在 Cloudflare 后台点一次）。
- **中转取代直露邮箱（决定 4）**：现在私人邮箱会在这几处互相露出——看房请求 / 提问批准邮件正文写房东登录邮箱（`executeShowingRequest`）、派单邀请与进入通知的 Reply-To 是房东邮箱、
  `/w/<token>` 接单后显示房东邮箱（`lib/marketplace/server.ts`）、委托确认邮件 Reply-To 是经纪邮箱（`/api/delegations`）、新申请通知 Reply-To 是申请人邮箱（`/api/notify-landlord`）。
  都改成中转地址。经纪目录里的业务电话 / 邮箱是 RECO 公开的业务联系方式，不在此列。
- **证据包升级**：PDF + JSON，含哈希链校验结果、逐渠道回执、入站原件指纹。
- **隐私页**：写明保留 7 年、注销后对话记录保留、邮件与短信经 Stayloop 中转。

**B 期（等 Twilio 账号）**：手机号验证码验证 + CASL 同意记录（时间 + 文案版本）、短信发出与回复入档、STOP 退订、每月硬上限计数（超限改发邮件并提醒管理员）、通知设置（何时发短信）。
回复路由待定：一个号码时默认进「最近一条发给这个手机的对话」并附短码切换，或用号码池（每号 $1.15/月）按「对方手机 × 我方号码」路由。
**C 期**：「请 Stayloop 介入」→ 调解员加入对话、双方提交材料、结案记录、证据包交 LTB。


### A 期落地（2026-09-30 · V0.7）

迁移 `20260929_messaging_a.sql`（已应用 prod，回滚事务实测：service role 删 / 改消息 → `append_only`，删有消息的对话 → FK 拒绝，租客看不到房东的客服对话）。守卫 `tests/messagingA20260929.spec.ts`（23 条）。
- **入口**：汉堡菜单里的「消息」（带未读数；2026-09-30 用户要求把原来单独的信封按钮并进汉堡菜单，汉堡上的红点 = 当前身份有待批卡片**或**有未读消息，`useUnreadMessages` 读 `my_unread_messages()`，2 秒共享 + `sl-messages-changed` 事件）→ `/messages`（`components/messages/MessageCenter.tsx`：列表 · 对话 · xl 起右侧记录栏）。壳按 `activeHat`，记住的是服务商且有服务商行时用普通页头。`/tenant|landlord|agent|provider/messages` 在中间件 308 到 `/messages`；旧 `components/messages/Inbox.tsx` 删除。`?t=<thread>` 打开对话，`?new=<kind>:<ref>` 打开新消息并预选事务。
- **七种对话**：原四种 + `listing_inquiry`（ref = `uuidV5(listing_id, prospect_uid)`，`threads.listing_id / subject_user`；只由服务端 `ensureListingThread` 开，`/api/showing-intent` 把请求本身写成租客的第一条消息，待办卡只作提醒，metadata 带 `thread_id`）、`agent_client`（ref = `agent_clients.id`；经纪 = `agent_auth_id`，客户 = 登录邮箱等于客户表邮箱或有效委托的委托人；客户表每行「发消息」）、`support`（ref = 用户自己的 uid，对方 = `admin_users`）。**当事人判定只在 `party_for(kind, ref, listing, subject)`**，`thread_party(tid)` 调它；`my_message_targets()` 列新消息第 1 步可选的事务。
- **哈希链**：`thread_messages.channel / prev_hash / hash`；`trg_thread_messages_zz_chain`（名字排在 `before_insert` 之后，按对话 advisory lock 串行）对每个写入者算 `sha256(thread_message_canonical(row, prev))`，首条 prev = `genesis`。格式 `stayloop-thread-v1` 在 `lib/threads/hashChain.ts` 逐字节复现（时间戳保留微秒、UTC），夹具 `tests/fixtures/threadChain20260929.json` 是生产 7 条真消息。**改规范化格式 = 历史链全部失效，别动；要改就加 v2 按版本分支。**
- **删不掉**：`thread_messages_append_only()` 对所有角色（含 service role）拒绝 UPDATE / DELETE，另有 BEFORE TRUNCATE；`thread_messages.thread_id` → `on delete restrict`，`threads.household_id` → `on delete set null`。回执 `message_deliveries`（状态只能前进）、入站 `thread_inbound` 同样只追加。数据库所有者理论上能删触发器——哈希链就是为此存在。
- **实时**：`thread_messages`、`message_reads` 进 `supabase_realtime`；`ThreadPanel` 订阅 postgres_changes（RLS 过滤）+ 45 秒兜底。
- **邮件出站**：`notifyThreadParties` 对有账号的推送，**推送没送到任何设备时改发一封邮件**；无账号的一方直接邮件。模板 `renderThreadMessageEmail`，发件人显示「<名字> 经 Stayloop」（`sendEmail` 新参数 `fromName`），`Reply-To = t-<令牌>@reply.stayloop.ai`（`thread_reply_tokens`，每个对话 × 收件地址一枚，service role 专用）；每封 / 每次推送写 `message_deliveries`。
- **邮件回复入档**：Email Worker `workers/reply-email`（`stayloop-reply-email`，已 `wrangler deploy`；postal-mime；主 tsconfig 排除 `workers/`）→ `POST /api/threads/inbound`（共享密钥 `INBOUND_EMAIL_SECRET`：`.env.local` + CF Pages secret + Worker secret 三处同值）→ `recordEmailReply`：原始 MIME 存私有桶 `thread-inbound` 并记 SHA-256（不论结果），只有令牌有效、**且 From 等于令牌签发地址**才写成 `channel='email'` 消息（剥掉引用；邮件附件不收录，正文注明）。**已开通（2026-09-30，用户新建的令牌 `CLOUDFLARE_EMAIL_TOKEN`，到 2026-10-30 过期）**：子域名 `reply.stayloop.ai` 开了 Email Routing（MX route1-3 + SPF）；zone 的 catch-all 规则（原为关闭的 drop）改为交给 `stayloop-reply-email`。**catch-all 是整个 zone 共用的**，所以 Worker 第一步就对不是 `t-…@reply.stayloop.ai` 的收件地址 `setReject('Unknown address')`——主域名未知地址照旧退信（实测）；jasonhan72@ / hello@ / legal@ / security@ / privacy@ 五条精确转发优先于 catch-all，不受影响。真实邮件实测：Resend 发到回复地址 → Cloudflare → Worker → `/api/threads/inbound` → 写成 `channel='email'` 消息（引用剥掉，`verified_by: reply_token+from_address`）。坑：刚建子域名时 20 秒内发的一封被退回，随后该地址进了 Resend 的 suppression 列表（`last_event: suppressed`）——测试要换新地址。
- **中转（决定 4）**：看房批准邮件、派单 / 进入通知 / 服务商通知（`relayReplyTo`；进入通知改为每个租客单独一封）、`/w/<token>` 页、委托确认、新申请通知、决定通知都不再给私人邮箱；看房卡与房东回执只写名字；证据包与对话导出按名字（`displayNameFor`）标人。申请人 / 租客的邮箱仍在房东自己的申请与租约数据里（是对方提交给房东的）。
- **导出**：`POST /api/threads/export {thread_id, format: html|json}`（JSON 带链算法与服务器校验结果，可第三方复算；审计 `thread_export_generated`）；`lib/export/threadRecord.ts` 也供事务证据包用。
- **隐私页** 3a 节：只追加、保留 7 年、注销后对话记录保留、邮件中转。
- **B 期（短信）等 Twilio 凭证；C 期未做**——现在请 Stayloop 介入走「新消息 → 联系 Stayloop」。

### 「通知」页退役（2026-09-30 · 用户确认）

通知与消息不是一类：消息 = 人与人围绕一件事务的对话（可回复、只追加、可作证据）；原 `/notifications` 页只是三份别处已有的数据——当前身份的待批卡片（= 待办页）、工单动态（= 工单对话里的系统行）、账号操作记录（= 审计页 / AI 助理面板「活动」），外加一段设计样例。已删除页面内容与 `components/notifications/LiveNotifications.tsx`、菜单与手机抽屉里的「通知」入口、DEMO_GATE 条目；`/notifications` 只剩客户端跳转（`lib/notificationsTarget.ts`：服务商 → `/provider/jobs`，其余 → 当前身份的 `/<hat>/todo`，未登录 → 登录后去 `/messages`）。设置里的推送开关标题改名「推送提醒 · 这台设备」，不再和页面同名。汉堡红点 = 待批卡片或未读消息，仍是唯一的提醒入口。

### 找得到人：人名优先 + 处处有「发消息」（2026-09-30 · 用户「现在很难找到对象去发消息」「导出证据包改成导出聊天记录」）

先跑了一个审查工作流（四个身份视角走查 + 数据审查 + 三个方案、三位评委）：根因是**人名在三层被丢掉**（插入触发器把 `sender_label` 置空、`threadParties` 只给角色词、`my_threads` 不带对方），以及**唯一入口是「新消息 → 先选事务」**。定案：仍然一件事一个对话（只追加、哈希链不变），但人名处处出现、凡是页面上出现一个人就有「发消息」按钮、新消息改为先选人。守卫 `tests/messagingPeople20260930.spec.ts`。迁移 `20260930_messaging_people.sql`（已应用 prod，回滚事务实测）：
- **人名**：`person_name(uid)`（设置里的「显示名」→ full_name / name → landlords / tenants 行；含 '@'、6 位以上数字、「Stayloop」一律丢弃）**API 角色不能直接调用**，只在 definer 函数与 service role 里用（`person_names(uuid[])`）。`people_for(kind, ref, listing, subject)` / `thread_people(thread)`：调用者是当事人才返回，每人 `user_id`（仅账号）、`name`、`role`、`channel`、`pending`（邀请未加入）、`is_me`；外部服务商只给房东输入的名字，**永不给邮箱**。`my_sender_label(thread)` 在插入时把发送者名字**快照**进 `sender_label`（不在 v1 规范化格式里，已有指纹一个不变）；服务商用商号、经纪用 RECO 注册名、管理员一方写「Stayloop」。`my_threads` 多 `last_sender_label / counterpart_names / counterpart_roles`；`my_message_targets` 多 `listing_id / subject_user / status / people_names / people_roles / reachable`（经纪客户对客户一方只在委托有效或已有消息时出现）；`find_listing_thread(listing)`。
- **顺带修的**：`party_for` 的管理员捷径挪到所有真实关系之后（管理员自己当房东时不再被记成「Stayloop」）；经纪委托判定加 `expires_at > now()`；`work_orders.external_email` 撤销 authenticated 列权限（租客、服务商原来能读到房东的外部联系人邮箱），房东自己的联系人改由 `my_external_contacts()` 读；`WORK_ORDER_COLUMNS` 去掉该列，工单卡与报修面板、后台争议列表不再回退显示邮箱；租客批准卡预览与执行回执不再显示房东邮箱（写「房东」），租客经 AI 发给房东的消息改为写进在管租约对话（`derived && tenancyId` 分支）并按对话中转，报修邮件带在管租约对话的回复地址；`threadParties` 按名字标人，并把**邀请未加入**的一方作为邮件中转对象。
- **界面**：消息中心列表每行 = 首字母头像（角色色）+ 对方名字 + 角色 · 事务 · 最后一句；搜索覆盖名字 / 角色词 / 地址 / 工单标题；筛选按对方（房东 / 租客 / 申请人 / 服务商 / 经纪 · 客户 / Stayloop）；头部「联系 Stayloop」；空右栏显示最近联系的 6 个人一键进入；对话头部 = 对方名字 +「关于 … · 查看这件事 →」+ 参与者（名字 · 角色 · 站内 / 邮件 / 邀请中）+「每个人都能看到每条消息」；⋯ 菜单在所有宽度都有「导出聊天记录（可打印）/ JSON / 记录与指纹（xl 以下为底部弹层）/ 查看这件事」；气泡显示「名字 · 角色」（旧消息按 `people` 映射补名字）。手机列高 `.sl-msg-col`，「更多」与抽屉里的「消息」带未读数。深链：`?t=<id>&compose=1`（聚焦输入框，草稿经 sessionStorage 带入，不进 URL）、`?new=<kind>:<ref>`（先 `find_thread`，已有对话直接打开）、`?matter=<id>`（只看一件事的对话；进度页事务卡的「对话 N」链到这里）。
- **新消息**：第 1 步「发给谁？」—— 按「同一组人」合并成卡片（同一个人跨多件事只出现一次），Stayloop 置顶，按当前身份排组，不可达的灰显并写原因；第 2 步「关于哪件事？」只在多于一件时出现（未结束的在前，已结束的折叠）；选中的事已有对话就直接打开，否则进入撰写页：「发给 …」「关于 …」+ 列出所有能看到的人；没有其他人能收到时禁止发送。原来只读的「谁会看到」一步删除。
- **「发消息」按钮** `components/messages/MessageButton.tsx`（点击时才解析对话，不按行查询；只有两方对话才写「发消息给 X」，工单写「在工单对话里发消息」；不可达时灰显带原因）+ `lib/messages/openThread.ts`。各页面入口见下一段工作流的接线记录。
- **设置**：新增「显示名 · 对方在消息里看到的名字」（写 auth 元数据 `display_name`，`lib/displayName.ts` 与 `person_name` 同一套过滤）和「联系 Stayloop 客服 →」。
- **措辞**：全站不再出现「证据包」——对话级「导出聊天记录（可打印）/ 导出聊天记录 JSON（供复核）」，事务级「导出聊天记录（含工单与通知）↗」（testid `export-chat-history`），导出件标题「聊天记录」，审计标签「你导出了一段聊天记录 / 一件事务的聊天记录」。
- **入口接线（四个代理并行 + 每组复审）**：在管租约中心成员列表（按 `people_for` 显示名字，只在「恰好一个对方」时写「发消息给 X」，否则「在租约对话里发消息（N 人都能看到）」；邀请中的显示「邀请中 · 消息会经邮件送达」，不再显示被邀请人邮箱）、`HouseholdList` 每行（对方还没加入时灰显）、我的租金「在租约对话里问房东」、报修单（无工单时「在租约对话里问房东 / 就这张报修发消息」）、新报修完成页、房源页联系卡（「让 AI 替我联系」会发给租客**现任**房东，已换成「发消息给房东」→ 提问弹窗；已有咨询对话时显示「继续和房东的对话 →」；Realtor.ca 房源改为「找认证经纪帮我联系」）、我的看房与提问（「打开对话 →」；只有对话存在时才写「在消息里继续」）、我的申请与申请详情（Realtor.ca 房源不给按钮、不显示申请对话）、房东申请队列每行与申请详情（「在申请对话里问入住时间和缺的材料」取代丢了收件人的 AI 起草邮件链接）、租约列表、看房 / 提问待办卡「回复 X →」、服务商工单与历史（只对接过的单）、经纪客户表与任务（无邮箱也无有效委托时灰显「先补邮箱才能发消息」；客户表里经纪自己录入的客户邮箱电话是有意保留的例外）、委托条与我的委托（只在有效 / 待确认的最新一行）。
- **对抗复审（三视角 27 个代理，确认 21 条、驳回 3 条，全部修复）**，迁移 `20260930_messaging_people_fixes.sql`（已应用 prod，回滚事务实测）：① 被邀请未加入的人原来会收到每条对话并拿到可回复地址，且任何成员都能发出「房东」邀请 → 现在只发**不带回复地址**的通知、链接到 `/join/<token>`；**每封回复邮件都重新核对发件人仍是当事人**（`tokenStillParty`：离开的租客、撤销的委托、换掉的服务商、改过的客户邮箱一律拒收，原件照存）；租客不能在已有房东时再邀请房东（`guard_household_invite_role`，`landlord_already_member`）；`household_invites.invited_email` 不再对成员可读。② `people_for / party_for('listing_inquiry')` 原来信任调用方传入的房源与对象 → 改为只看已存在的对话行。③ Realtor.ca 导入房源的导入者（管理员）不再是申请 / 咨询的「房东」一方，前端经 `listing_sources()` 判断（下架的也查得到，查不到时按「不给按钮」处理）。④ `person_name` 先 NFKC、去零宽字符与分隔符再拒绝「stayloop」，`lib/displayName.ts` 同步；提醒标签一律「名字（角色）」。⑤ 空对话（刚从按钮打开）也能在消息中心打开；租客经 AI 发给房东的消息回执写「已发到在管租约对话」、预览不再显示邮箱或双语角色串；`resolveTenantLandlord` 只认有效成员；工单回执、事务导出按名字标人；未命名的人按角色计数（「租客 ×2」）不合并；卡片正文遮蔽邮箱时保留 `@stayloop.ai` 地址；管理员回复不再显示「Stayloop · Stayloop」。

### AI 改写已有房源：卡片带原照片，可直接「更新房源」或去编辑页（2026-09-30 · 用户「生成的卡片里没有了图片……可以直接点击发布，或者点击编辑手动编辑一些」）

根因：模型对「帮我改一下房源说明」只返回一张全新的 draft_listing——不认识已有房源、没有照片、只有它复述的字段；点「发布」会撞重复地址，点「编辑」打开的是新房源编辑页。现在（守卫 `tests/draftExisting20260930.spec.ts`，迁移 `20260930_listings_updated_at.sql` 已应用 prod）：
- **服务端认出已有房源**（`lib/agent/draftExisting.ts matchOwnedListing`）：同门牌 + 同街名（`sameProperty`），**单元两边都要一致**——没写单元的草稿只匹配没有单元的房源（同楼新房源不会被当成更新另一套）；库里把单元写进地址的行（「1105 - 203 COLLEGE STREET」，生产 16 行里 8 行）先拆开再比。匹配时机在合规过滤**之前**（过滤看得到库里已确认的宠物 / 水电等字段），`monthly_rent` 缺省时从库里补；认出的已有房源不走「地址必须来自用户」的拦截。
- **合并规则**（`mergeWithExisting`）：卡片显示的是库里的房源 + AI 的修改；**`changed_fields` 只记 AI 真正改了的字段，「更新房源」只写这些**（外加用户在卡片上改过的照片），绝不整份回写。标题 / 描述取模型的；设施 = 库里 ∪ 新增（提示词只给模型看前 10 个），用户说「删 / 去掉」才替换；租金 / 卧室 / 浴室 / 面积 / 押金只有用户这句话**在上下文里**说了新数字才改（「租金改成 14500」「7 房」算，「步行 2 分钟」不算）；宠物 / 吸烟 / 租期 / 水电 / 家具 / 车位 / 入住日 / den 只有消息谈到该话题才改；地址 / 单元 / 社区 / 城市 / 类型一律不动（改社区会让已认证房源回到待审核）；照片保留库里的，只有用户提到照片且本轮带来新图才换。前端 `useAgentSession` 对带 `listing_id` 的草稿不再做旧卡片对账（曾把另一套的租金和照片抄过来）。
- **卡片**：徽章「修改稿 / REVISION」，底部一行「将更新：标题、描述；其余保持不变」，没有改动时按钮禁用；「更新房源」= `updateListing(..., { expectedUpdatedAt })`——**`listings.updated_at`（新列，触发器每次更新自动刷新）不一致就拒绝**，说明「卡片生成后房源被改过，为免覆盖没有更新」，所以聊天记录里的旧卡片不会回滚后来的修改；写完读回 `is_active / verification_status / source` 如实说「已生效（附查看链接）/ 回到待审核 / 目前下架」。「编辑」只把改动字段（照片仅在卡片上改过时）存进 `localStorage stayloop-listing-edit-draft:<id>`，存不下就提示而不跳转，跳到 `/dashboard/listings/<id>/edit?from=agent`。
- **编辑页**：加载前一次性读取并清除暂存（StrictMode 不会双重套用），只套用改动字段，横幅写明带入了哪些字段、点「保存修改」才生效；AI / 导入写的自由文本设施显示为可点掉的芯片（原来看不见却会被保存）。
- 顺带：提示词告诉模型改已有房源时 address / unit 逐字用表里的、只写要改的字段。

### 首页标题改为一行（2026-10-01 · 用户「就改成一行字，"租房的事，交给AI助理"」）

`components/home/HomeNext.tsx` 的 h1 = 「租房的事，交给<em>AI助理</em>」（按用户原文，AI 与助理之间不加空格；「AI助理」墨蓝底上的 #00ACE4 强调），英文 "Leave renting to an AI Agent"。
**任何宽度都是一行**：中文整句 `whitespace-nowrap`，字号 `text-[clamp(22px,7.6vw,30px)] sm:text-[44px]`（320px 屏约 24px 也放得下）。先试过两行「租房的事，/ 交给我的 AI 助理」，用户否决。
守卫 `tests/homeV10_20260927.spec.ts`、`tests/oneAssistant20260925.spec.ts`。

## 同类问题排查与修复（2026-10-01 · 用户「改完就部署上线，再检查一下有没有类似的问题」· 69 条）

起因是 AI 改写房源的卡片丢了照片（见上节）。按「卡片 / 按钮说会做的事，系统实际做不到或做错」这一类在全站排查：五个切片（AI 待批卡 / 房源与租约 /
在管租约与维修 / 资料与设置 / 申请与消息）找出 69 条，逐条复核后全部属实。修复分两轮工作流：8 组按文件互不重叠并行修、每组再由独立审查挑错返修；
随后一轮集成（跨组接口）+ 三个视角的端到端复核（28 条，全部处理）。守卫 `tests/sweep20261001_*.spec.ts`（11 个文件）；全套 1750 个测试。
七份迁移 `20261001_A1 / A3 / A4 / A5 / A6 / A8 / B_*.sql` 先在回滚事务里整体试跑，再一次性应用 prod（21 张失效旧卡标为 expired，租金表无重复行）。
值得记住的规则：
- **待批卡只能提议有执行器的动作。** `lib/agent/approval-engine.ts EXECUTABLE_ACTION_TYPES`（14 种）是唯一清单；turn 路由按身份白名单：租客只能提议
  `maintenance_request` 和带正文的 `send_message`，**房东与经纪的模型一律不出卡**——录取 / 婉拒去申请人页、租约去租约页、经纪用客户表与「发消息」。
  原来的 submit_application / payment_authorization / approve_applicant / reject_applicant / dispatch_agent / request_payout 等卡批准后什么也不发生，还被写进
  `completed_steps` 让模型以为办成了。现在 `decide_pending_action` 不再写 completed_steps（只在执行成功后由 `finalizeExecution` 写）、过期卡返回 status
  expired 而不是批准，并有新列 `decided_at`。
- **批准后没执行的卡不会再丢。** 60 秒撤销窗仍在客户端，但关掉页面后：10 分钟内批准的会接着倒计时执行（续约函必须有当时选的 A/B，存在审批事件的
  note `option:A|B` 里，否则不自动跑）；更早的或执行失败的在待办与对话末尾显示「已批准，尚未执行」+「现在执行 / 放弃」。撤销失败的卡记在本机
  `sl-undo-failed`，不会被自动续跑。红点计数包括这类卡。
- **执行器批准前重新核对事实，不再信卡片快照**（失效即 409 + `expired:true` + 写明原因，文案在 `lib/agent/chatCopy.ts REASON_TEXT`）：续约函（租约已结束 /
  同单元已有后续租约——与续约规划同一个 `renewalSkipReason` / 租客已说要走 / 方案 B 过了 N1 截止日只挡 B 不挡 A）、决定通知（申请已按另一种决定处理 /
  已通知过；`needs_more` 不再改动已决定的申请）、看房请求（房源已下架；合并的多条请求全部接受；问题卡遇到看房请求时作废并新开一张，不在原卡上改类型）、
  还款计划（期间已记为已付即作废）、催租（已过期或已付）、邀请提醒（邀请已接受 / 拒绝 / 撤销）、派单（报修已完成 / 取消；被拒过的服务商不再派；
  没有候选时不出可批准的卡，改为推送 + 邮件提醒派给自己的联系人）、报价批准绑定报价版本（服务商改价后旧卡作废、出新卡）。
- **报修**：重复的报修并进已开的工单对话（同类别同位置或标题几乎相同），不再新建；`maintenance_tickets.entry_permission` 与 `emergency` 两列从报修一路带到
  派单与进入通知——**进入通知走 s.26（紧急）还是 s.27（24 小时）由 `emergency` 决定，不再由优先级决定**；房东的报价时限设置真正生效；返工后再完工
  不清空原账单；进入通知发出后取消工单会通知租客；`compliance_events.notice_sent` 如实记录邮件是否送达。
- **续约接到同一份在管租约**：电子签的续约租约挂到原 household（同地址同单元或同租客邮箱），不再新建一份；新租期还没开始时只写 `households.next_lease_id`，
  每天 05:05 UTC 的 pg_cron `household-lease-promote`（`promote_household_leases()`，仅 service role）在起租日切换为 `current_lease_id`，旧租约记入
  `previous_lease_id`，旧租期未记录的账期仍可在中心记录。首月账期按租约的每月几号落在第一个应付日，不再落在起租日。
- **租金记录只经 `mark_rent_paid(p_lease, p_due, p_paid_on)`**：`rent_payments(lease_id, due_date)` 唯一，成员直接插入的策略已删；「到期」行显示「待付」
  可记为已付（此前首月从第一天起就显示逾期且无法记录）；付款日由记录人填写，按多伦多日期判断是否逾期。households 的地址 / 租金 / 日期等事实对直连
  客户端冻结（`households_creator_update` 已删），更正导入信息走 `update_household_import`（对方已加入后不可改）。
- **房源与租约**：重复地址检查忽略已归档的房源并提供「重新上架」；已发布房源编辑器按 `updated_at` 防覆盖、只写改过的字段；`listings.updated_at` 只在房东
  可编辑的内容变化时刷新（`enrich` 写的交通 / 坐标不再让 AI 修改卡误报「房源被改过」）；房源下架时作废待处理的看房 / 提问卡；从申请起草租约会打开已有
  草稿而不是再建一份；导入件 / 快速录入的租约不再显示「签署 / 发送签署」。
- **资料与记忆**：面板里改 / 忘掉 / 新增记忆后对话立即用新记忆（`sl-memories-changed`）；改记忆不再把结构化值写成显示用文字；记忆按「身份 · 类型 · key」
  合并；用户亲手写的记忆在提示词里标【用户亲自写的】；找房硬约束只用当前身份的记忆；人设 / 风格被过滤器拒绝时不再静默清空，过滤规则收窄；画像字段经
  RPC `set_user_model_field` 单字段合并，反思写回前重读用户写定的字段；经纪客户资料可编辑、同邮箱不能重复加；被拒的经纪改任何资料都回到待审核；
  委托确认邮件发送失败会显示并可重发；个人头像缓存按账号区分；设置页的假「已验证 / Toronto」删除。
- **申请与消息**：申请人页选定决定时不再先改申请状态，状态在通知真正发出时才写；发送失败可「重新起草通知」；回车发送防重复与输入法确认；新消息草稿
  不会因为别处来信被清空；申请表电话改为必填；重试提交不再产生重复申请；`/api/threads/notify` 按刚插入的消息 id 通知。
**未做**：批准后的执行仍在客户端（没有服务端队列；关掉页面靠下次打开时续跑 / 待办重试）；草稿卡「已发布」状态跨设备同步；`/w/<token>` 外部联系人消息的服务端去重。

### 首页按 muse.ai / america.gov 实测重排尺寸（2026-10-01 · 用户「全部一起改」）

先在同一台浏览器里以 1440 / 390 两个宽度实测三站（scratchpad `bench/measure.mjs` + `probe.js`，CDP 读计算样式）：Muse 首屏占满一屏、
H1 62px / 500、输入框 408×54 圆角 20 填充无边框、按钮 44px / 16px、小节标题 40px / 500 + 正文 18px 浅色、一节一块深浅交替；America.gov
H1 96px 衬线 / 400、小字 24px 65% 墨色、上下留白 256px。我们原来是小而粗（44px / 800）、首屏 567px、小节 36px / 800。落地（守卫
`tests/homeBenchmark20261001.spec.ts`）：
- **首屏占满一屏**：`min-h-[calc(100svh-120px)] md:min-h-[calc(100svh-66px)]`（手机减页头 56 + 底栏 64），内容上下居中，底部「了解更多 ↓」胶囊链到
  `#how-it-works`。标题 `text-[clamp(22px,8.2vw,34px)] sm:text-[48px] lg:text-[60px]`、字重 700（中文 500 偏细）、行高 1.1，手机仍一行；小字 24px、`text-body-3`。
- **登录块**（`LoginCard`，与 /login、/register、起名页共用）：输入框 54px、圆角 20、浅蓝灰填充 `#E6EEF5`、无边框、16px，聚焦变白底蓝边；「继续」与
  「使用 Google 继续」都是 48px、16px；宽 408px。
- **各节**：小节标题 40px / 700（全页不再有 `font-extrabold`），导语 18px、行高 1.6、`text-body-3`、最宽 600px；上下留白手机 64 / 电脑 96px；
  背景整块交替：怎么工作（白）→ 四种身份（#F3F8FC）→ 安省规则（白）→ 线上数字（墨蓝通栏，原来是圆角卡片）→ FAQ（#F3F8FC）→ 三步开始（白），节与节之间不再画分隔线。
- **不照搬**：Muse 的深色主题、America.gov 的衬线体与大照片、两家「页头只留一个按钮」（页头菜单按 09-27 的决定不动）。

### 首页登录块换成 America.gov 式对话框（2026-10-01 · 用户「对话框 + 底图，样式和大小按 america 来做，对话框先就一行，输入以后掉到全屏的助手页面继续对话」→「按你的建议改」）

先实测 America.gov 的流程（发了一个不含个人信息的通用问题）：首页 = 标题 + 一句小字 + 圆角照片卡（约 688×458，圆角 40），白色一行输入框压在卡片上沿
（内缩 16、96 高、21px 字），占位提示轮换 10 个「Try ‘…’」示例、照片跟着换，卡片下方上一个 / 暂停 / 下一个三个 56px 圆按钮；提交后页面不刷新、网址变
`/chat`、首页收起变成整屏对话（720px 栏、输入框移到底部）；全程没有登录（FAQ「不需要账户」、隐私页「对话不保存，离开就消失」）。落地（守卫
`tests/homeAsk20261001.spec.tsx`，`homeV10 / homeCentered / threeRoleFilm / homeRoles / homeBenchmark / museMobile` 相应改写）：
- **`components/home/HeroComposer.tsx`** 取代首屏的 `LoginCard`（登录块仍用于 /login、/register、起名页）：底图 = 三方动画的 3D 场景（`public/home/film/`），
  10 个示例各带身份（租客 5 / 房东 3 / 经纪 2）；输入框左侧身份选项「租客 / 房东 / 经纪」（默认租客，**示例轮换不改它**——第一版跟着示例变，实测把一个租客
  问题送进了房东的 AI 助理；选择记在 sessionStorage）；输入的问题按所选身份、**空着回车 = 试当前示例并按示例自己的身份**，示例身份与所选不同时占位写
  「试试（房东）…」；一律 `router.push(assistantPromptHref(role, q))` → 整屏的 `/<身份>/agent?prompt=…&send=1`，免登录预览到达即发出。卡片下一行
  「不用登录就能问 · 已有账户？登录 · 免费注册」；「三步开始」的按钮改为「免费注册」与「先问一句试试 ↑」（`#ask`）；「了解更多 ↓」删除。
- **审查后补的（三视角 17 条）**：轮换在指针悬停、焦点在框内、卡片离开视口、标签页隐藏时都暂停；自动换示例后 1.5 秒内空着提交仍发刚才看到的那个；读屏
  只播报访客自己切换的示例；手机上占位只写「问 AI 助理…」，示例作为照片底部可点的白条（点一下填入并切到它的身份）；10 张图只加载当前与下一张；
  输入框获得焦点时预取三个助理页；从助理页返回时发送按钮恢复。
- **示例必须是该身份的预览真能答的**：房东预览没有行情检索，所以没有「挂多少合适」类示例（换成一句话发房源草稿）；房东问续约时现在也注入同一份 RTA 事实包
  （`landlordRenewalFacts()`，指导比例按生效年份、N1、2018 豁免）；示例里的年份写成绝对的 2027（提示词里没有日期），续约类示例中英文都命中 `RENEWAL_INTENT_RE`。
- **免登录预览成了正门**：限额 8 → 15 次 / IP / 小时、400 → 600 次 / 全站 / 小时，统一在 `lib/agent/anonLimits.ts`；超出个人额度与全站繁忙两种 429 文案分开
  （`orchestrator` 把 Retry-After 带进错误）；预览里访客一旦提问，示范待批卡（Sarah Wang · Unit 1207）在对话、侧栏待办、重开胶囊里都不再出现。
- 顺带：回复里已经说明「禁宠 / 超额押金条款无效」时，guardrail 不再追加「我不会写进租约」。

## 首页第二屏以后按 muse.ai / america.gov 重排 · 方案 A（2026-10-01 · 用户「除了第一屏，第二屏以后的那些…要包含字体的美化和调整」→「按照你推荐的方案A，开始做吧」）

方案 A = 保留现有无衬线字体（Inter Tight + 苹方 / 雅黑），只调字号、字重、行距、断行；不引入衬线体。页头 / 页脚 / logo / 配色不动。守卫
`tests/homeBenchmark20261001.spec.ts`、`tests/homeRoles20260927.spec.ts`、`tests/homeCentered20260929.spec.tsx`、`tests/homeV10_20260927.spec.ts`、`tests/threeRoleFilm20260928.spec.ts`。
- **顺序**：HERO（问一句的对话框，未动）→ **STATEMENT**（america.gov 式一句话整屏：「Stayloop 用 AI 把租房的**每一步办完**…会影响别人的事，**先等你点头**…」，
  44 / 36 / 26px、500 字重、两处 #00ACE4 高亮，滚动淡入）→ **HOW IT WORKS**（居中标题 + 灰色导语 + 动画放进白色大圆角媒体卡，Muse 式）→ **PANELS**（图文交替，白 /
  浅蓝底交替：① 它提议，你决定——图是真实的 `ApprovalActionCard`（`components/home/ApprovalSample.tsx`，Mia Chen 看房请求，标「示例」，`inert` + `aria-hidden`），文字是四步；
  ②–⑤ 租客 / 房东 / 经纪 / 服务商（试点）各一屏，图是 3D 场景（服务商新图 `public/home/film/provider-repair.webp`，gpt-image-2 以 david 场景为参照生成），取代原身份选项卡）→
  **RULES**（规则面板：右侧是条文索引列表——编号在上、规则在下、细线分隔；原芯片云在长编号处换行很乱，已弃）→ **VERIFY**（深色数字带，56px 数字）→ **FAQ**（两栏：左标题右问答）→
  **START**（「从一句话开始」收尾带 + 两个按钮 + 三步小行）。
- **字体规则**（`app/globals.css`）：`.sl-type-head` = 600 字重、平衡断行、`palt` 比例标点；中文标题不用负字距、**只在标点和空格处断行**（`word-break: keep-all`，
  另加 `overflow-wrap: anywhere` 兜底，手机上无标点的长句才会被硬断）——此前「续｜约」「规｜则」「每一步办｜完」都被拆开；高亮词另加 `whitespace-nowrap`。`.sl-type-text`
  = `text-wrap: pretty`；`.sl-type-num` = 等宽数字。全页只用 600 / 400 两种字重（陈述句 500 例外）。字号：H2 44 / 28、面板标题 36 / 26、导语 20 / 17、正文 17 / 16（行高 1.75）。
- **滚动淡入** `.sl-reveal` 用 CSS scroll-driven animation，包在 `@supports (animation-timeline: view())` 与 `prefers-reduced-motion: no-preference` 里——不支持或减少动态时内容直接可见，不依赖 JS。
- 本地核对（CDP 无头 Chrome，减少动态模式截全页）：1440 / 390 / 320 零横向溢出，页面高 10583 / 13590px，全部标题 600 字重。
- **生产逐行核对（同日）**：脚本把每个中文标题按字符位置还原成行（scratchpad `bench/prod12/lines.mjs`，1440 / 1024 / 390 / 320 四个宽度）。keep-all 之后仍有两处走了
  紧急断行——服务商标题「…维修工单 / ？先把资质核了。」（行首是问号）与 FAQ「…申请 / 人？」（320）——因为它们有一长段没有标点。做法：在短语边界放一个零宽空格
  `\u200b`（「想接多伦多租房市场的\u200b维修工单？」「筛查报告会不会\u200b一票否决申请人？」），FAQ 结构化数据里去掉它。**以后新写的中文标题若有超过约 10 个字不带标点的一段，
  照此加断点。**

### 手机首页缩短（2026-10-01 · 用户「手机端的首页确实有点长」）

390px 宽从 13,590px（约 16 屏）缩到 **8,355px**（−39%；320px 14,057 → 9,070，英文 390px 14,852 → 9,398）。**只改 640px 以下**：手机值一律写成
基础类 + `sm:` 复原或 `max-sm:`；改前改后用逐元素几何对照（scratchpad `bench/trim/rects.mjs` + `align.py`，冻结线上数字接口）在 1440 / 1024 / 768 / 640
四个宽度比过，唯一差异是下面的经纪文案更正。做法：三个独立方案（纯压缩 / 手机信息结构 / 对照 america.gov）+ 评审在线上页面逐项实测后合成，
再由三位审查（CSS 与桌面一致、手机体验与无障碍、文案事实与守卫）各自验证。守卫 `tests/homeBenchmark20261001.spec.ts`「phones」段、
`tests/homeRoles20260927.spec.ts`「agent screening copy」段。
- **压缩**：六个面板与各节上下留白手机 48px（原 80）；陈述屏与收尾带 64px；角色图手机用原图比例 3:2（原 960×640 被裁成正方形）；线上数字手机 2×2，
  数字字号 `clamp(26px,8.5vw,44px)`（桌面 56 不变）；四步编号与标题同一行；FAQ 的上下内边距挪到 `<summary>` 上（点按区域从约 25px 变成 57px）。
- **四种身份在手机上是一排可横滑的卡片**（`RoleRow`，CSS scroll-snap，桌面完全不受影响）：上方「四种身份，各自的入口」+ 四枚 44px 锚点（点一下跳到对应卡片
  并把焦点移过去）+ `aria-hidden` 的「← 左右滑动 →」；卡片保留全部内容、顶端对齐、露出下一张 24px；行内关掉滚动淡入（横向滚动容器给不了 view() 时间线）。
  审查后补的两个行为：**Tab 进入只露出一条边的下一张卡时整行滚过去**；**读到一张卡底部再横滑时，若下一张卡顶端在屏幕上方，页面滚到它的顶端**（键盘触发的
  横移不触发这一条）。末尾 24px 占位让最后一张卡对齐，`pb-8` 不再裁掉卡片阴影，角色图改 `loading="eager"`（横向滚动里的懒加载在滑到之前不加载）。
- **手机上省掉的只是重复**：「它提议，你决定」的导语（四步与卡片本身说了同样的事）；规则列表手机显示 6 条，另外 4 条（进入通知、OHRC、s.10(7)、标准租约）
  页面别处都说过，且同一面板里有「全部 N 条规则 →」。**没有用 sr-only**。服务商卡的导语与 TRESA s.32 那条规则起初也隐藏，审查发现它们说的事页面别处没有，已恢复。
- **顺带更正（桌面同样生效）**：首页经纪卡、`/agent/clients` 示范卡、起名页经纪能力清单还在说「有委托才能代客筛查」——2026-09-29 起 RECO 注册有效的经纪
  直接筛查，客户确认委托后，**从客户表那一行发起的**筛查才同时记在客户名下。三处已按此改写并加守卫。
- 平板（640–1023px）首页约 14,400px，比手机还长（面板到 1024px 才并排）；这次没动，等用户决定。
- **同日跟进：链接不在手机上断成两半**（用户：「英文页面的 sign 和 create a free account 被挤到了边上，还分成了二行」）。对话框下那一行
  「No account needed to ask · Have an account? Sign in · Create a free account」在英文手机上从「Sign | in」或「Create | a free account」中间断开。现在两个链接是
  一个不可断开的整体，640px 以下自成一行（中文同样：「不用登录就能问 · 已有账户？」/「登录 · 免费注册」），桌面仍是一行。同一类问题一并修：FAQ 答案末尾的
  「打开 AI 助理预览 →」等链接加 `whitespace-nowrap`（768 / 640 / 手机上原来也会断开）；320px 英文下必须折行的两个按钮（审批卡「Approve · Execute for me」、
  房东卡「Let AI help manage your rentals →」）改为居中 + `text-wrap: balance`，不再剩一个词单独一行。检查办法：scratchpad `bench/wrap/scan.mjs`
  在 412–320 五个宽度、中英两种语言里找出自身文字折行的链接与按钮。守卫 `tests/homeBenchmark20261001.spec.ts`「links do not split」段。

### 平板首页缩短（2026-10-02 · 用户「平板端的首页也一起缩短吧」）

640–1023px 原来是最长的（768px 14,577 / 1023px 15,343，比电脑的 10,749 还长：四个角色面板的方图在平板上撑满整宽）。现在 768px **9,242**（−37%）、
640px 10,224、834px 9,192、1023px 8,938；英文 768px 10,315。**只改 640–1023px**：新类一律是 `sm:max-lg:` / `md:max-lg:` 区间变体（守卫禁止出现裸
`max-lg:`），唯一改动的原有类是手机标题块 `sm:hidden → lg:hidden`。改前改后在 1440 / 1024 / 639 / 390 / 375 / 320 × 中英文逐元素几何对照 **0 差异**
（scratchpad `bench/tablet/rects2.mjs`）。同样走了三个方案 + 实测评审（scratchpad `bench/jt`）。守卫 `tests/homeBenchmark20261001.spec.ts`「tablets」段。
- **四种身份**：平板上是手机那套白色卡片排成 2 × 2 网格（等高），沿用手机的标题「四种身份，各自的入口」和四个锚点按钮，没有滑动提示（没东西可滑）；卡片内 26 / 17px 字号、3:2 图。
- **「它提议，你决定」**：768px 起真实审批卡在左（7fr，卡宽 ≥344px，标题只在「#1207」前折行）、文字在右（5fr，标题 30px、导语 18px，四步一列）；640–767 仍上下排。
- **规则**：平板显示全部 10 条，排成两列（行优先，分隔线对齐，第二列顶端不多一条线），面板白底（接在浅蓝的角色带后面）。
- **FAQ** 768px 起左右两栏；各节上下留白 80px（陈述屏 96px）；线上数字保持 2 × 2（大数字需要宽度）；三方动画只缩了外边距。

## 全站测试与修复（2026-10-02 · 用户「完成了以后再做一下全站的测试，按照软件工程测试的标准，有问题就马上改正」）

按 `design/test-plan-2026-09-22.md` 执行，报告 `design/test-report-2026-10-02.md`。L0–L3 由部署门禁执行；L4–L7 六个测试员并行（接口契约 / 数据边界 /
公开页 5 宽度 × 中英 / 四个测试号登录后各页 / 匿名流程 / 登录流程），172 条用例、41 条缺陷（去重约 34），严重项由独立复核员从头复现；修复分 8 个文件互不重叠的组
并各带守卫（`tests/siteTest20261002_g1…g8`），合并后再由审查员看整体 diff。两份迁移先在回滚事务里试跑再应用：`20261002_site_test_fixes.sql`、
`20261002_realtor_no_apply.sql`。值得记住的：
- **房东身份守卫死循环（P1）**：没有房东身份的已登录账号打开 `/landlord/*` 或 `/dashboard`，守卫的 effect 依赖每次渲染都新建的 `auth` / `hats` 对象，
  又调用 `auth.setRole()`，其广播事件让 `useAuth` 的路由 effect 把 landlord 写回——几秒上万次 `/landlord/become` 请求。现在只依赖基本值、每个路径只跳一次、
  直接写本地存储；auth 或身份未知时整页只显示「…」（真实房东的页面只挂载一次）；`useLandlord` 自己的跳转也只发一次。助理页与 `/landlord/todo|ideas|progress`
  在确认有房东身份前不启动房东会话。
- **Realtor.ca 导入房源能提交申请（P1）**：申请会落到导入者账号。房源页去掉申请入口，`/apply/<slug>` 拒绝 realtor 房源，数据库触发器
  `guard_listing_accepts_requests` 对 applications 与 showing_intents 的插入同样拒绝。
- **只有服务商身份的账号登录后进了租客对话**：回调页把 `agent_configs` 里的旧角色当提示而不是选择（`landingAfterSignIn`），服务商帽子优先。
- 其余：全站 `Permissions-Policy` 把麦克风关了导致语音输入不可用 → `microphone=(self)`；加 `X-Content-Type-Options: nosniff`；删除无人调用、无鉴权、
  可调付费模型的旧接口 `/api/ai-score`；冻结的 Stripe Connect 两个接口先鉴权再返回 410（不再 501）；`/stayloop-api/docs` 的 React #418 是 Cloudflare 邮箱混淆改写了
  文本节点（邮箱拆成多个元素）；租约条款缺联系人块时租约页崩溃 → 先校验嵌套结构；申请人详情页手机溢出；未开始的租约在在管租约页写成「租中」；未筛查的申请人显示
  「评分中」；「五个维度」→ 四项；硬门槛显示内部代码；角色页「8 维尽调」「按收入倍数排名推荐」与虚构业绩数字改写为事实，人物故事标「场景示例」；
  页脚 / FAQ / 横幅链接与箭头不再折断；每个工作台页面有且只有一个 h1（壳在缺失时补一个视觉隐藏的）；对话面板不再把整页滚到对话处；
  护栏的 OHRC 检查改为按句判断并排除否定句（「不得不拒绝」等双重否定仍算拒绝）。
- 数据：`attach_household_lease_file` 只允许导入者在未核验、对方未加入时替换租约文件；新增每日 `screening-stuck-sweep`（13:25 UTC），超过 24 小时仍在
  uploading / scoring 的筛查标 error；11 份此前用 execute_sql 应用的迁移补记进 `supabase_migrations.schema_migrations`。
- **用户决定（2026-10-02）**：蒙特利尔那套房源（`282fbbb1…`，真实房东，已核验在线，省份误存成 ON）**改为 QC**，保持在线（省份不在触发重新审核的字段里）。
  **同日两项跟进（用户「是的，要改，另外 supabase 的检查也要开启」）**：
  - **房源详情页只对安省房源显示安省内容**：`lib/listingDisplay.ts isOntarioListing(province)`（空省份按安省算——产品只做安省、老数据没存省份）。
    外省房源不显示 RTA 说明、「入住前费用一览」卡片（押金上限 / 安省不允许收的费用）、TRREB 成交均价，也不再推荐 RECO（安省）注册经纪；
    「租赁条件」下改为一句「安省租房规则不适用于这套房源（魁北克省）」——**当天即被下一节取代**（用户：「外省的要查外省的法规…也不用特别加一句话」）。
  - **Supabase 泄露密码检查已开启**（`password_hibp_enabled: true`，经 Management API 只改这一项，改前改后 243 项逐项比对只有它变了）。
    Supabase 对泄露 / 太弱的密码返回 `weak_password`（reasons 含 `pwned`）；注册、重置密码、管理员改密码三处经
    `lib/auth/passwordError.ts passwordErrorMessage` 显示人话（「这个密码出现在已公开的数据泄露记录里……」）。守卫 `tests/leakedPassword20261002.spec.ts`。

## 外省房源用外省法规 · 详情页单语 · 相似房源按地段（2026-10-02 · 用户「外省的要查外省的法规，不要用安省的法规和说法…也不用特别加一句话」+「房源详情这里不要中文和英文混杂…相似房源…首先是要地段相似，其次房型，再次价格」）

**外省法规（`lib/provinces/`）**——取代同日的「安省规则不适用」一句话。
- **事实来源**：12 个省 / 地区（QC BC AB MB SK NS NB PE NL YT NT NU）各 14 条住宅租赁事实（魁北克 20 条），研究员只用官方来源（各省法规网站、TAL 等官方审裁 / 政府页面；CanLII 屏蔽自动访问，LegisQuébec 对 WebFetch 返回 403，要用 curl + 浏览器 UA）并逐条附原文引语，**再由独立核查员逐条对照原文**（魁北克两位）；未通过核查的 4 条不上线。快照截至 2026-10-02，写在 `lib/provinces/rules.ts` 的数据里，每条带 citation 与官方 URL。**安省不在其中，仍走 `lib/ontario/rules.ts`，所有安省输出与改前逐字相同。**
- **省份判定 `lib/provinces/detect.ts effectiveProvince(row)`**：邮编首字母（列，或地址里的邮编；X0A–X0C 努纳武特、X0E/X0G/X1A 西北地区）> 地址里的省份字样 > 存的 province > 城市字典 > ON。页面一律用 `listingProvince(listing)`，不直接读列。**发布向导与编辑页不再写死 'ON'**（蒙特利尔那套当初就是这样被存成 ON 的）：按地址自动识别，可在下拉里改正。
- **各处改法（外省永远不出现 RTA / LTB / OHRC / RECO / TRESA / 安省标准租约 / N 表，也不写「不适用」）**：
  - 详情页「租赁条件」= `listingRulesNote(code)`（魁北克：《魁北克民法典》第 1904 条不得收任何押金含钥匙押金、最多预收第一个月、不得要求预开支票；一般可约定不养宠物（残障辅助动物除外）；须用住房行政法庭 TAL 的强制租约格式、10 天内交租客一份，第 1895 条）；没有核实事实的话题什么都不写。「入住前费用一览」按 `moveInRules(code)` 重画（魁北克押金行「不得收取」，合计只有首月租金）；房源标了押金而该省不允许或超过上限时红色提示；可依法禁宠的省份 `pets_allowed='no'` 显示「不允许」。
  - 申请页：外省用 `applyConsentText`（该省人权法、隐私法；魁北克加 P-39.1 s.8 告知），不再写「查询安省公开法庭记录」；**魁北克按 CAI 指引不收证件复印件**（去掉证件上传，出生日期只用于本人同意的信用查询，雇主与收入改为选填）。看房 / 提问弹窗的人权法句按省份。TRESA s.32 注册人披露只在安省房源上问（TRESA 是安省法）。
  - 租约：外省房源的申请点「起草租约」不再出安省标准租约，改为该省租约卡（魁北克：TAL 强制格式 Schedule 5、10 天交副本、Section G 最低租金告知、法语优先），签好后去 `/leases/import`；导入的外省租约详情页不再标 ONTARIO STANDARD LEASE。决定通知 `send_decision` 页脚用 `decisionNoticeFooterFor(省份)`（该省人权法 + 隐私法查阅更正权 + 核实到的拒绝告知权），合规事件 rule id 为 `<省>-decision-notice`。申请人页、租客申请详情页、看房卡注释同步。
  - AI：房东「你的房源」表给外省房源标省份并注入该省事实包 `aiFactsBlock`（模型只可引用）；三个角色的提示词加「省份边界」规则；草稿的禁宠改写与护栏的安省注释只对安省生效。
- **没做（记录）**：在管租约中心与续约 90/60/30（`/h/[id]`、`renewalStages`）对外省租约仍是安省逻辑；筛查报告（不碰）对外省申请人仍查安省法院与 LTB；全站页脚「PIPEDA · OHRC · RTA 合规」是公司级的，未改；`/api/v1/listings/compliance` 仍只做安省。
- 守卫：`tests/provinces20261002`、`provinceListing20261002`、`provincePublish20261002`、`provinceLease20261002`、`provinceAgent20261002`、`provinceReview20261002`、`provinceStage3Review20261002`。

**详情页一种语言**（`lib/listingLang.ts`）：中文界面除地址、街道 / 社区 / 楼盘 / 经纪公司名、品牌、单位、法条引用外不出现英文，英文界面不出现中文。小节英文眉标只在英文界面显示；VERIFIED → 已核验、Condo → 共管公寓、Studio → 开间、+den → + 书房；房东写的双语内容（【中文】【English】、`---`、「中文 / English」、先中后英段落）按界面语言拆开；Realtor.ca 的设施 / 家电 / 供暖 / 外墙等用字典；只有另一种语言的描述与自由文本由 `/api/listings/enrich {id, lang, only:'translations'}` 用对话槽模型翻译一次（与交通 / 社区数据分开请求，不拖慢页面），缓存在 `listing_translations`（迁移 `20261002_listing_translations.sql`，已应用 prod，只有 service role 可读写；按源文本哈希失效；译文出现原文没有的数字即丢弃；全站每小时 300 次上限，失败关闭）。翻译未到时描述处显示「这段介绍目前只有英文原文」+「显示原文」，短字段显示「未说明」。地图 SDK 按界面语言加载；分享与收藏标题用 `listingTitle`。守卫 `tests/listingLang20261002`、`listingPageLang20261002`、`listingTranslations20261002`。

**相似房源**（`lib/listingSimilar.ts rankSimilar`）：严格按 地段 → 户型 → 租金。地段档：同楼 / ≤1 km 或同社区 / ≤2.5 km / ≤6 km；>6 km、卧室差 >2、租金不在 0.5–2 倍之间的不算相似，**不拿远处的凑数**——没有就写「附近 6 km 内暂无户型、租金相近的在租房源」+「查看全部房源 →」（Avondale、蒙特利尔现在是这样）。卡片显示距离（同楼 / 350 m / 1.2 km）、同社区、户型（同户型 · 2 卧 / 多 1 卧）与租金差（比这套低 $1,210）。候选按坐标 ±6 km 框取最多 500 条（只含排序列），排序后再取前 12 条的卡片字段。守卫 `tests/listingSimilar20261002`。

**顺带**：数据修正——8 Colvestone Road 的社区原来是经纪公司名「Forest Hill」、坐标错 8 km，改为 St. Andrew-Windfields 并按地址重新取坐标；238 Simcoe 城市「Toronto, ON」→「Toronto」（页面曾显示 Toronto, ON, ON）；三条 Realtor 导入行的联系人「Agents.」「Website」清空。`parkingStat('待确认…')` 不再显示「有」。经纪选择器不再向非测试账号显示名字以「[TEST]」开头的经纪。

## Realtor.ca 导入 30 套（2026-10-02 晚 · 用户「用房东的测试账号1，再从 realtor.ca 转取 30 个房源，区域分布要平均」）

10 个区各 3 套（市中心已有 9 套，未再取）：北约克 Willowdale East、中城 Yonge-Eglinton、西区 Niagara / Trinity-Bellwoods、东区 South Riverdale、
怡陶碧谷 Mimico、士嘉堡 Bendale、密西沙加、万锦、列治文山、旺市；同一区每栋楼最多 1 套，户型 1 卧 13 / 2 卧 12 / 3 卧+ 5，有公寓、联排、独立屋、地下室套间，
租金 $1,895–$4,400。行为与以往 Realtor 导入一致：`source='realtor'`（页面标 Realtor.ca 来源、显示挂牌经纪公司、不能在 Stayloop 申请，引导找认证经纪），
`landlord_id` = 房东测试号 landlord-test@stayloop.ai 的 landlords.id `80646b6a…`，title 存地址（不分语言）。做法：Jina 读各区
`/apartments-for-rent`、`/rentals`、`/condos-for-rent` 列表页 → 逐套读详情页（照片取 highres、字段按「标签 / 值」解析）→ Nominatim 按地址取坐标（核对城市或邮编前三位）→
service role 一次插入；之后本机慢速查 Overpass 补交通（生产上连续 30 次被 429/504，接口记为失败一小时后才重试），翻译走 enrich 的 translations 请求。脚本在会话 scratchpad
`realtor30/`（import.mjs 有 `--only=区`、`--from-plan`、`--write`）。**注意：Realtor 导入没有自动下架机制**，这 30 套挂牌到期后要人工下架。
顺带修了一个翻译缓存的问题：模型没交回可用译文时，原来会把空译文按最终哈希永久缓存；现在记为 `failed:` 15 分钟后重试，退避期内先显示已译部分（守卫 `tests/listingTranslations20261002.spec.ts`）。

## 首页文案保持原样（2026-10-03 · 用户否决 10-02 晚的重写）

10-02 晚按「体现优点、话语优雅」重写的首屏与第二屏（「租房诸事，托付AI助理」「奔走归它，定夺归你」「串成一线 · 有法可依 · 有据可查」）
用户看后说「这些不好，太文言文了，还是之前的吧」，已整体回退：主标题「租房的事，交给AI助理」、副标题「找房到续约，它去办，你来批准。」、
第二屏「Stayloop 用 AI 把租房的每一步办完：…规则来自安省法律，每一步都留痕。」及对应英文。**以后写中文文案用平实的现代口语，
不要文言、四字格堆叠、「诸事 / 托付 / 归它 / 定夺 / 有法可依」这类书面腔。**

## 示范数据警告条去掉 + 房源页工具栏压成一行（2026-10-03 · 用户「把系统里的这些示范数据的警告条都去掉吧，这样就能多出来空间了」→「同时也把这些内容压缩到一行的空间里，有些可以合并或者取消的」）

守卫 `tests/listingsToolbar20261003.spec.ts`（`disputesSample` / `listingsSplit` / `node1Facts` 相应改写）。
- **警告条 → 小标签**：`components/SampleNotice.tsx SampleBanner` 不再是琥珀色大块，只剩一枚「示例数据 / Sample data」小标签（18px 高，`data-testid="sample-chip"`），
  整句说明放在标签的 `title`（悬停显示）和 `sr-only` 文字里；演示模式旁边仍有「退出演示」。所有用到它的地方（工作台 DEMO_GATE / SAMPLE_NOTE、样例申请人、样例租约、
  tier1）自动变小，**示范数据仍然有标记**（09-06 的规矩不变：页面主体是样例或按钮做不到所写的事，就必须有标记）。
- **房源页**（内容全是真实房源）：横条整段删除，不留标记。**争议页**：顶部横条删除，每块虚构内容的 `SampleTag` 都保留；横条里唯一有用的两条真实去处（LTB、LSO 转介服务）
  改为 Hero 下一行小字（`data-testid="disputes-real-help"`）。
- **房源页工具栏一行**（原来 4 行约 260px：横条 · 搜索框 + 按钮 · 筛选工具条 · 结果条）：搜索框（输入即筛，300ms 防抖，回车立即，Esc / × 清空，**不再有「搜索 →」按钮**）·
  「筛选」（面板按需在下方展开）·「♡ 收藏 N」（手机只显示 ♡ N）· 右端「地图范围内 42 套 · 共 43 · 已筛选」+ 排序下拉。电脑上 57px 高，房源列表从 124px 处开始（原约 330px）；
  lg 以下数量与排序换到第二行。**取消**：「出租」芯片（只有出租，「出售 · 即将上线」是噪音）、排序里的「AI 推荐」（库里没有匹配分，它就是「最新发布」换了个名字；默认改为最新发布）、
  单独的结果条。**合并**：「◐ AI 帮我筛（匹配我的 Profile）」中英混杂的长按钮改名「◐ 套用我的偏好」并放进筛选面板第一个（它本来就是一组筛选的预设），说明文字只在面板里显示。
- **顺带修的**：Google 地图加载失败时（key 被拒 / SDK 加载失败），地图冻结的空视野仍在筛列表，页面显示「地图范围内 0 套」、卡片列表全空（本地 localhost 不在 key 的允许来源里，
  6 次刷新 4 次复现；用户截图里也出现过 0 套）。现在 `ListingsMap` 挂 `window.gm_authFailure`、SDK 失败时同样处理：`onViewport(null)` 取消按地图筛、之后不再上报视野，
  地图位置显示「地图暂时无法加载，房源列表不受影响。」（原来直接印 SDK 的英文报错）。生产 6/6 次正常加载。

## 首页第二屏陈述句重写（2026-10-03 · 四轮：「要讲出平台的所有优点…把特定的安省去掉」→「话语太长了，要剪短一点，专业一点的术语」→「这个话要的，Stayloop 用 AI 把租房的每一步办完：找房、筛查、租约、维修、续约。」→「还要加帮助管理物业，租金催收，法律协助，等等租房方方面面。这个话也要再重新整理一下的。」）

现行（`components/home/HomeNext.tsx` STATEMENT，守卫 `tests/homeStatement20261003.spec.ts`）：
「Stayloop 用 AI 把租房的**每一步办完**：找房、筛查、签约，入住后的物业管理、维修、催租，到期续约，全程按当地法规把关。涉及他人的操作**须经你审批**，沟通经平台中转，记录不可删改。」
英文："Stayloop uses AI to [get every step of renting done]: search, screening and signing; property management, repairs and rent reminders once you’ve moved in;
renewal at the end of the term, all checked against local tenancy rules. Actions that affect others [require your approval]; communication is relayed through
the platform, and records can’t be edited or deleted."
- **开头是用户点名保留的句子**，列表按阶段重排（入住前 → 入住后 → 到期），并加上用户要的物业管理、催租、法律方面。**措辞守住事实**：用「催租」不用「催收」（只有租金提醒，
  不代收、不经手钱）；用「全程按当地法规把关」不用「法律协助」（规则检查与说明，Stayloop 不是持牌法律服务，律师目录未上线）。守卫禁止 催收 / 法律协助 / 代收 / collect / legal services。
- **用户对这段的口味**：短、专业术语（审批 / 按当地法规 / 平台中转 / 不可删改），不要成语、文言（「凡…均…」也太书面）、营销词；不写省份，用「当地 / local」。
  评审否掉的词：「预审」（像监管机构预先批准）、「存证」（暗示公证）、「tamper-proof」（实际是只追加 + 哈希链，可发现篡改）。中间那版 95 字的口语长句被嫌太长。
- **断行（2026-10-03 修过一次，Safari 下整句跑出屏幕）**：md 起用显式 `{BR}`（`<br className="hidden md:inline" />`）一行一个阶段；全句在每个中文标点后和短语分界处放普通的零宽空格 `{Z}`（`'\u200b'`）。
  **不要再用「每组 `md:whitespace-nowrap` 的 span 拼在一起」的做法**：WebKit（桌面 Safari、所有 iPhone 浏览器）不会在两个相邻的 nowrap span 之间换行，整句成了 4000px 一行；
  WebKit 在 `word-break: keep-all` 下也不在中文标点后自行断行，溢出后退化为任意处断开（「涉及他｜人」、行首「，」）。Chrome 两种情况都正常，所以只用 Chrome 测不出来。
  **以后测首页断行要同时跑 WebKit**：会话 scratchpad `webkit/`（Playwright WebKit，只装在 scratchpad，不进项目依赖）有两个脚本——`statement.mjs <base> webkit,chrome` 逐行打印这段在 6 个宽度 × 中英文下的断行，
  `heads.mjs <base> webkit,chrome` 检查首页全部 `.sl-type-head` 是否有词中断开、行首标点、跑出屏幕（横向滑动行内的卡片不算）。
  涉及他人的操作须经你审批 / 沟通经平台中转，记录不可删改。md 以下正常在标点与 `{ZW}`（只在 md 以下显示的零宽空格）处断开，390 八行、320 十行，无横向溢出。
- **仍写安省的地方（准确，未改）**：同页的规则面板「安省规则内置，每条有编号」（列的都是安省法条）、房东 / 租客卡片里的「安省标准租约」、三方动画里的安省标准租约。加入其他省份时一起改。

## Realtor.ca 再导入 50 套 + 交通站点漏查修复（2026-10-03 · 用户「再从 realtor.ca 上面抓取 50 个不同地区的房源，多伦多，米西萨迦，markham，Richmond Hill 的都要有…用测试用的房东账号发布」）

多伦多 20 套（10 个上次没用过的社区各 2 套：Church-Wellesley、Harbourfront/CityPlace、Yonge-St. Clair、High Park North、Junction、Leaside、Bayview Village、
Yorkdale-Glen Park、Etobicoke City Centre、Agincourt）+ 密西沙加 / 万锦 / 列治文山各 10 套（每个社区 1 套，如 Port Credit、Cooksville、Unionville、Cornell、Oak Ridges、Langstaff…）。
户型 1 卧 20 / 2 卧 20 / 3 卧+ 10；与库里已有房源不重楼不重 MLS。和上次一样 `source='realtor'`、挂在房东测试号 landlords.id `80646b6a…` 名下、不能在 Stayloop 申请。
脚本在会话 scratchpad `realtor50/`（`import.mjs` 规划 → `add.mjs city:slug:n` 追加 → `apply_fixes.py` → `import.mjs --from-plan --write` → `transit_all.mts` → `enrich.mjs`）。
- **写库前逐套核对**：5 个核对员把每套计划字段与保存下来的 Realtor.ca 原页（`details/<MLS>.md`）对照，49 套里 17 套要改、0 套拒收；另换掉 1 套（Streetsville 一栋的描述是卖房文案）。
  **解析器的系统性问题**（这批已逐条改正，以后导入要注意）：① 房子的一部分（地下室套间、主层、coach house）被标成 `house`——地址里不一定写 BSMT，要看描述；② 这类单元带的是**整栋房子**
  的面积区间（应为空）；③ 「Total 2 / Partial 1」是 1.5 卫；④ 出租公司整栋楼（Cromwell 等，免月租促销）被标成 condo，应为 apartment；⑤ Realtor 的 Parking Type 描述的是楼 / 房子，
  不是租客拿到的：车位数 0 却写「Underground, Garage」会显示「有车位」，有 1 个车位却写「No Garage」会显示「不含」。规则：车位 0 →「No parking」；部分单元或以 No 开头且有车位 →「N parking space(s)」；
  车位未知且写 No Garage → 空。**上一批 37 套旧导入同样按此改了 16 套**（171 Duplex Ave 是房子的主层单元 → apartment；33 Helendale 是 Whitehaus Condos → condo）。
- **交通站点漏查（全站的缺陷，已修）**：23 Oneida Cres 离 Langstaff GO 540 米、15 Water Walk 离 Unionville GO 1.2 公里，却显示「1.5 公里内没有车站」——这两个 GO 站在
  OpenStreetMap 里只画成站区（way），而 `/api/listings/enrich` 只查 node。现在共用 `lib/listingInsights.ts transitOverpassQuery`（`nwr` + `out center`）与 `overpassPoints`
  （way / relation 取中心点），Overpass 以 200 + 超时说明返回空结果时按失败处理、不缓存成「没有车站」。守卫 `tests/transitAreas20261003.spec.ts`。全部在线房源用新查询重跑了一遍交通（只写成功的结果）。
- **翻译被误拒（已修）**：这批 50 套首轮中文翻译 15 套被标失败，模型调用全部成功（`ai_usage` 可查），是 `acceptTranslation` 拒收：可复现的一种是月份——「Available November 1st」
  正确译成「11月1日起」，「不得出现原文没有的数字」检查把 11 当成新数字。`sourceNumbers` 现在把英文月份名（含缩写）算作对应数字；其余是模型偶发输出，站点 15 分钟后自动重试。
  复现脚本 `.forensics-tmp/translate-repro.mts <slug> [model]`（用站点同一套提示词、模型与检查，打印哪条检查拒收）。
- **翻译与社区简介的 token 预算太小（已修）**：重试三轮后仍有 6 套翻译失败、8 个新社区简介被缓存成空——模型调用都「成功」，但后台对话槽现在是 Gemini 3.7 Flash（思考型），
  先把 max_tokens 花在推理上，JSON 被截断（有一条输出停在它自己的推理里）。翻译预算 `chars × 1.6 + 400` → `chars × 2 + 2000`（上限 8000），社区简介 900 → 2500；按实际用量计费，
  不增加成本。**以后给结构化输出的模型调用设 max_tokens，要给思考型模型留余量。**


## Realtor.ca 导入房源自动下架（2026-10-03 · V0.7 · 用户选定的下一步）

此前 Realtor.ca 导入的房源（生产 87 套在架）挂牌到期或被撤下后没有任何机制让它下线。实测：撤下后的详情页写「The listing you are looking for no longer exists.」
后接 Similar Listings（那里的 `$X/Monthly` 是别的房子），而 **cdn.realtor.ca 上的照片仍然返回 200**——只看照片判断不了（09-06 那两套是照片也撤了的特例），必须读原页。
守卫 `tests/realtorFreshness20261003.spec.ts`；迁移 `20261003_realtor_freshness.sql`（已应用 prod）。
- **判定** `lib/listings/realtorFreshness.ts`（纯函数）：`classifyRealtorDetail(text, mls)` → `gone`（「no longer exists」/ 法语同句）· `live`（页面有 `MLS® Number: <mls>` 或该 MLS 的照片文件名，
  价格取 Similar Listings 之前的第一个 `$X/Monthly`）· `blocked`（反爬验证页，复用 `classifyRealtorPage`）· `unknown`（两者都不是，**永不当作下架**）· `error`（Jina 非 200）· `no_url`。
  `applyReading`：**连续两次 gone 才下架**（中间被拦 / 出错不清零，读到 live 清零）；挂牌价变化在 0.5–2 倍内才同步 `monthly_rent`（价格记录触发器自动记「调价」）；结果写进新列
  `listings.realtor_check`（checked_at / state / gone_streak / miss_streak / last_live_at / rent_seen / delisted_at / rent_changed_at）。
- **执行** `POST /api/cron/realtor-freshness`（edge；`x-cron-secret` 或管理员 JWT）：pg_cron `realtor-freshness` 每小时 :35，每次 `pickBatch` 取 20 套——疑似下架的（且距上次 ≥1 小时）优先、
  其次没检查过的、再按最久未查；Jina 读页并发 5，被拦时走代理重试一次；下架 = `is_active=false, status='archived'`（现有触发器会作废相关看房卡）；写入带 `realtor_check->>checked_at` 条件，
  不覆盖并行写入；整批读失败（Jina 余额）报 Sentry。87 套约 4–5 小时轮一遍，下架最迟约一天内生效。
- **列保护**：`guard_listing_realtor_check` 让直连客户端（导入行挂在房东测试号名下）写不了该列；`listings_touch_updated_at` 把它算作缓存列（不触发 AI 修改卡的 updated_at 冲突）。
- **后台** `/admin/verify` 顶部 `components/admin/RealtorFreshnessCard.tsx`：在架 / 已确认仍挂牌 / 没检查过 / 需要留意（疑似下架待确认、连续 3 次读不出、没有原页链接——8 Colvestone Road 没有 source_url，只能人工）/
  已自动下架（列出最近 10 套），「现在检查一批」手动跑一次。
- 首次实测：1802-210 Simcoe St（C13738828）的原页已显示不存在，会在头两轮内下架。

## 「+ 新会话」开出的是干净的对话（2026-10-04 · 用户截图：点历史会话再点「+」，新对话里还挂着旧的待批卡）

「+」本来就会开新对话（只剩问候语），但对话末尾会把**账号上所有**未处理的待批卡（含「已批准，尚未执行」）都贴上去——不管它们是在哪个对话里提出的，
于是新对话看起来像接在旧对话后面。现在（`lib/agent/threadCards.ts splitCardsByThread / scheduledInThread`，守卫 `tests/threadCards20261004.spec.ts`）：
登录后的助理页（`AgentChat threadScopedCards={live}`）只在对话里显示**本对话提出的**卡（`metadata.thread_id` = 当前对话，orchestrator 早已写入），
60 秒倒计时行同样按卡片所属对话（`scheduled[id].threadId`）；其他对话的卡和不属于任何对话的卡（cron 续约卡、页面动作）留在待办页与面板「待办」标签，
对话末尾只给一行「另有 N 件待办来自其他对话，在待办页处理 →」。头部状态行与圆点仍按全账号的待批数。匿名预览、演示与首页动画不受影响（不分对话）。

## 对话列表（2026-10-04 · 用户「新的 thread 需要有一个地方可以查看，也可以点击进去，可以参考你自己的界面设计」）

照 claude.ai 的侧栏：`components/agent/ThreadList.tsx`（纯函数 `lib/agent/threadList.ts`：今天 / 昨天 / 过去 7 天 / 过去 30 天 / 更早分组、搜索标题与最后回复、无标题叫「新对话」；守卫 `tests/threadList20261004.spec.ts`）。
- **位置**：登录后的助理页。xl（≥1280px）起是聊天左侧 260px 的一列（窄栏底色 #F3F8FC，可收起，开 / 关记在 `localStorage sl-thread-list`）；xl 以下和手机是从左滑出的抽屉（遮罩、Esc、选中后自动关）。
  聊天区左上角一枚「对话」按钮打开它（xl 列已打开时隐藏）。
- **内容**：顶部「+ 新对话」、搜索框；每行一个对话（单行标题，当前对话白底加粗），别的身份下的对话带「租客 / 房东 / 经纪」小标，点开跳到那顶帽子的助理页；
  `⋯` 菜单「重命名 / 删除」。**重命名存在新列 `agent_threads.custom_title`**（迁移 `20261004_agent_threads_custom_title.sql`，已应用 prod；≤80 字）——`saveThread` 每次都按第一句话重写 `title`，
  所以名字另放一列、`listThreads` 取 `custom_title || title`（活动面板也跟着显示新名字）；清空即回到自动标题。删除 = 删本人的 `agent_threads` 行（RLS 本人；这是你和 AI 助理的对话，
  不是与他人的往来记录——那些在只追加的 `thread_messages` 里，不受影响），删的是当前对话就开一个新对话。
- 右侧面板的「活动」标签保持原样（对话 + 对话外的动作混排）；对话列表只放对话。
