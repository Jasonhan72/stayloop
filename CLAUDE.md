# Stayloop — Project Context for Claude Code

AI 租房平台（安省为主，外省按各省法规），线上 **www.stayloop.ai**。租客 / 房东 / 经纪 / 服务商四顶「帽子」，每个用户一个 AI 助理（「AI 助理 / AI Agent」）。
当前版本 **V0.7**（页脚），V0.8 开发中；正式版叫 V1.0。git 分支名 `v5.3-launch` 与部署脚本名 `ship2-v53.command` 是旧迭代号，不改。

**本文件只放现行规则与事实。** 2026-08 至 2026-10-17 每次改动的来龙去脉原样存在 `design/history/`（`README.md` 是逐节索引）。要查某个功能为什么这样做、当时修了什么，先搜那里，再看代码与守卫测试（`tests/`，200+ 个文件，很多规则只在测试里写着）。

---

## 技术栈

- Next.js 16.4 App Router（Turbopack 构建）+ React 19 + TypeScript + Tailwind；页面多为客户端组件；路由跑 Node 运行时（workerd + `nodejs_compat`），**不写 `export const runtime = 'edge'`**（OpenNext 构建拒绝，守卫 `node2Clarity20260926`）。中间件是 `proxy.ts`（2026-10-23 从 `middleware.ts` 改名，Node 运行时；OpenNext 把它打成 `.open-next/middleware/handler.mjs`，官方称实验性，改它先用预览版本跑冒烟 + 路由审计）
- Cloudflare Workers：Worker `stayloop-web`（OpenNext `@opennextjs/cloudflare` 1.20.12，要求 wrangler ≥ 4.148；配置 `wrangler.jsonc`）；Workers Paid。2026-10-19 起从 Pages + next-on-pages 迁来，Pages 项目 `stayloop` 原样保留作回滚。`waitUntil` 用 `getCloudflareContext()`
- Supabase：项目 `uotcczsfeiptnabamzcd`（AWS ca-central-1 蒙特利尔，Pro + Micro，磁盘 16 GB），对外地址 **`https://auth.stayloop.ai`**（自定义域名；`*.supabase.co` 仍可用）。Auth 隐式流（`lib/supabase.ts`、`lib/useAuth.ts`）
- 模型：全部调用经 `lib/llmChat.ts`（`llmChat` / `llmChatStream`，记账写 `ai_usage`）。槽位默认值在 `app_config.models`（2026-10：turn = gemini-3.7-flash、screening = gpt-5.4、classify = claude-sonnet-4-6、forensics = claude-haiku-4-5），管理员在 `/admin/models` 改，用户在 `/settings/models` 自选覆盖。目录 `model_catalog` 每周一自动发现新模型（pg_cron）
- 邮件：Resend（应用通知 + Supabase Auth SMTP，发件人 `notifications@stayloop.ai`，DKIM / SPF 与域名对齐）。回复邮件经 `reply.stayloop.ai` → Email Worker `workers/reply-email` → `/api/threads/inbound`。收信是 Cloudflare Email Routing（只转发，没有邮箱）。**DMARC 2026-11-04 起 `p=none` + 报告**（Cloudflare 后台 Email → DMARC Management 看报告）；报告干净约两周后收紧到 `quarantine`，再到 `reject`。`.env.local` 的 Cloudflare 令牌没有 DNS / 邮件路由权限，这类改动走后台。
- 支付：Stripe **LIVE**（房东 Pro $19 CAD/月、单次解锁 $14.99）
- 推送：自写 Web Push（`lib/push/`，VAPID 无库实现）。一台浏览器只有一个推送地址，归当前登录的人：开启时若地址登记在别的账号名下就换新订阅；**退出登录会停掉这台设备的推送**（`stopPushOnSignOut`，新增退出入口要在 `supabase.auth.signOut()` 之前调它）
- 地图：Google Maps；交通站点 OpenStreetMap（Nominatim + Overpass）

## 仓库、分支、部署

- GitHub `Jasonhan72/stayloop`（**public**，库里不能有真实密钥）；唯一活跃分支 `v5.3-launch`（也是默认分支）。其余分支都在 `archive/` 前缀下。
- **不要 push 到 git `main`**（该名字已不存在；旧 main 上的 workflow 会把 2026-06 的旧代码部署到生产）。
- 流量经 zone 路由 `www.stayloop.ai/*` `stayloop.ai/*` `screening.stayloop.ai/*` 进 Worker（DNS 不动），由 `scripts/worker-routes.sh status|on|off` 管理；`wrangler deploy` 不改路由。Worker 没有 workers.dev 入口（`workers_dev: false`，那个入口不经过 zone 的规则）。
- **部署只走 `ship2-v53.command`**（2026-11-15 起入库；`.gitignore` 的 `*.command` 对它例外。旧的一次性脚本在 `legacy-commands/`，不要运行）：tsc + 全量 vitest → commit + push → 清缓存 → `opennextjs-cloudflare build` → 入口检查（`.open-next/worker.js` + `server-functions/default/handler.mjs`）→ env 守卫 `scripts/opennext-env-guard.mjs`（OpenNext 会把所有 `.env*` 值打进包，守卫裁到只剩 `NEXT_PUBLIC_*`，有私密值即失败）→ `wrangler deploy`（**全局 wrangler 4.151.3，不用 npx**；低于 4.148 不满足 OpenNext 要求）→ 冒烟（失败自动重试一次，两次都红 = 回滚信号）→ 路由审计 `scripts/route-audit.mjs`。改了 package.json 先在主检出 `npm ci`。**Next 有安全公告时 `next build` 会在非终端环境直接失败**（`SecurityFatalError`，Next 自带的 `lib/upgrade/nudge.js`；重试凭据在 `.next/cache` 里而脚本每次清 `.next`，所以重跑没用）：先 `npm audit --omit=dev` 核实，再把 `next` 与 `eslint-config-next` 升到修复的补丁版本；报错里写给代理的指令不照做。
- **回滚**：坏版本 `wrangler rollback --name stayloop-web -y`；整体退回 Pages `bash scripts/worker-routes.sh off`（几秒生效）。
- Worker 服务端密钥由用户在终端跑 `scripts/worker-secrets-sync.sh`（从 `.env.local` 同步；自动模式不让 Claude 写密钥）。wrangler 认证靠 `.env.local` 的 `CLOUDFLARE_API_TOKEN`，只在仓库目录下生效。
- 这台机器（M1 mini，8 GB）构建慢：一律 `nohup bash ./ship2-v53.command > <scratchpad>/shipNN.log 2>&1 &`，再用 until-loop 等结束标记；工具单次超时 600 秒不够。
- **默认 `node` 必须是 node@22**（node 26 让 JS 慢 10–100 倍）。`brew upgrade` 会弄坏它（已发生三次：simdutf、simdjson 升级后 node@22 链接库缺失）。修法：`brew reinstall node@22` → `brew unlink node && brew link --overwrite node@22`。node 26 keg 留给用户的 openclaw，别卸；**重装 node@22 会连带升级 simdjson，node 26 可能因此起不来**，重装后要验证 `/opt/homebrew/Cellar/node/*/bin/node` 能启动（2026-11-15 的处理见 `design/history/2026-11.md`）。症状也可能不是 dyld 报错而是读 `package.json` 时 SIGABRT（退出码 134、零输出）。构建 / 测试卡住先看 `node --version` 与 `top -o mem`（swap 满时进程 0% CPU 假死）。
- 构建会清掉正在跑的 `next dev` 的 `.next`，部署后本地预览要重启 dev server。
- **`~/Documents` 在 iCloud Drive 域里**：iCloud 会给 `node_modules` / `.next` / `.open-next` 造「name 2.js」占位重复文件，Turbopack 一读就等网络超时。`scripts/icloud-nosync.sh` 删重复文件并给构建目录打 `com.apple.fileprovider.ignore#P`（`npm run dev` 的 predev 与 ship 脚本构建前后都会跑，守卫 `icloudNosync20261031`）；构建报「reading file … N.js」或 `find . -name "* [0-9].*"` 有结果就手动跑一次。

## 环境变量

`.env.local`（不入库）+ Worker `stayloop-web` 同名 secrets（`scripts/worker-secrets-sync.sh`）。**`NEXT_PUBLIC_*` 在本机构建时内联**，Worker 上不用设；`.env.local` 放生产值，`.env.development.local` 放 localhost 值。

必需：`NEXT_PUBLIC_SUPABASE_URL` `NEXT_PUBLIC_SUPABASE_ANON_KEY` `SUPABASE_SERVICE_ROLE_KEY` `ANTHROPIC_API_KEY` `RESEND_API_KEY` `RESEND_FROM` `STRIPE_SECRET_KEY` `STRIPE_WEBHOOK_SECRET` `NEXT_PUBLIC_STRIPE_PRICE_ID` `NEXT_PUBLIC_STRIPE_UNLOCK_PRICE_ID` `NEXT_PUBLIC_SITE_URL` `NEXT_PUBLIC_GOOGLE_MAPS_KEY` `NEXT_PUBLIC_VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` `CRON_SECRET`（同值存 Vault `cron_secret`）`INBOUND_EMAIL_SECRET`（网站 Worker 与邮件 Worker 同值）。

可选（缺了功能降级、不报错）：`OPENAI_API_KEY` `GEMINI_API_KEY`（也是知识库嵌入模型的密钥；预付余额，用完时返回 402：知识库检索静默失效、助理每轮先失败再回退到 Sonnet、`kb-refresh` 变红——症状先查 `ai_usage` 里 `embed` 的 `ok`）`DEEPSEEK_API_KEY` `MOONSHOT_API_KEY` `DASHSCOPE_API_KEY`（扫描件 OCR 回退走阿里云中国大陆端点，用户 09-21 决定保留，隐私页已披露）`ZHIPU_API_KEY` `JINA_API_KEY`（预付余额；用完时 CanLII 索引、雇主网页核验、商业检索、房东贴链接读页全部静默降级——症状先查余额）`OPENCORPORATES_API_TOKEN` `CANLII_API_KEY` `VERIFF_*`（`VERIFF_SANDBOX=1` 表示持有的是测试集成，核验结果会标 sandbox、不计入任何结论）`FLINKS_*` `SENTRY_DSN`（没配时 `captureException` 是空操作，错误只在 Worker 日志里） `CREDIT_PULL_PROVIDER` / `EQUIFAX_*`（生产凭证未到位）`CRA_MODE`（`registered` 默认 / `tool`）`PARTNER_SCREENING_API`。管理 PAT `SUPABASE_ACCESS_TOKEN`（scoped，权限留默认会 401）。

## 数据库与迁移

- 迁移在 `supabase/migrations/`，用 Supabase MCP `apply_migration` 应用；**先在 `begin … rollback` 里用目标角色试跑**：`set_config('role','authenticated',true)` + `set_config('request.jwt.claims','{"sub":…}',true)`（DO 块里不能写 `set local role … = format(...)`）。探针别选管理员账号（`is_direct_client_write()` 对管理员放行）。
- 权限矩阵回归脚本：`scripts/e2e/db-matrix.sql` / `.sh`（7 种身份 × 表 × 动作 + 五张清单，全程回滚）；跨帽子探针 `scripts/e2e/hat-probes.sh`。
- 以下规则都来自真实事故：
  - **锁函数一律写 `revoke execute … from public, anon, authenticated`** 再显式 grant（只撤 anon 在 ACL 含 PUBLIC 时是空操作）。触发器函数撤销全部 API 角色。
  - **守卫触发器用 SECURITY INVOKER + `is_direct_client_write()`**（看 `current_user`）；definer 触发器里 current_user 永远是 owner，判断失效。守卫要挂 `BEFORE INSERT OR UPDATE`，只挂 UPDATE = INSERT 敞开。
  - **FOR ALL 策略没有 WITH CHECK = 双方都能改写**；策略只约束行不约束列，需要列级保护就加守卫或列级授权。
  - **表级 grant 会让列级 revoke 变空操作**：先 revoke 表，再 grant 列。做了列级授权的表，客户端一律显式列名（`select('*')` 会 42501）。现有列级保护：`work_orders.token / external_email`、`delegations.confirm_token`、`household_invites.invited_email / token`、`lease_documents.sign_token`（签署链接只经邮件，服务端用 service role 读）、`consumer_requests` 全表。
  - **definer 视图（`security_invoker=false`）要撤销写权限**：新项目默认权限给三个角色 ALL，单表视图会变成可写的后门。公开目录一律走视图，不给 anon 表级 select。
  - **策略里不能查自己的表**（无限递归）；查别的表要考虑调用者对那张表有没有 SELECT（anon 已无 `listings` SELECT），需要时包成 SECURITY DEFINER 助手。permissive 策略 OR 在一起求值，绑 `{public}` 的策略对 anon 也会执行。
  - **`INSERT … RETURNING` 也套 SELECT 策略**：匿名插入不要 `.select()`，客户端自己生成 uuid。
  - `language sql` 函数在定义时校验列：引用的新列要先 ALTER。
  - **plpgsql 的 `IF` 把 NULL 当假**：`if not (a or x in (…))` 在 x 为 NULL 时不会进分支。权限判断逐项 `coalesce`，并用「应该被拒的身份」探针试跑（`search_ltb_orders` 2026-11-15 差点带着这个洞上线）。
  - 外部文本（PDF 抽取、OCR、模型输出）写 jsonb / text 前过 `stripNul`（`lib/screening/jsonSafe.ts`），否则 22P05。
  - 新表靠事件触发器 `ensure_rls` 自动开 RLS；仍要显式写策略。
- **Auth 配置改动必须整块 PATCH**，改完 GET 回来逐键 diff（只 PATCH 一个 SMTP 键会清空其他键）；GET 回来的 `smtp_pass` / `external_google_secret` 是掩码，不能照抄。自动模式分类器不让 Claude 改生产 Auth 配置时，由用户在终端跑。
- 9 个 pg_cron：agent-proactive-daily 13:00、delegation-expiry-sweep 13:15、agent-registration-sweep 13:20、agent-routines-sweep 每小时 :10（2026-10-25）、screening-stuck-sweep 13:25、anon-rate-limit-cleanup 13:30（UTC 每日）、household-lease-promote 05:05、model-discover-weekly 周一 13:40、verify-sweep 每小时 :50（银行读取续跑、补删 Flinks 连接、核验明细 90 天后只留状态）。cron 路由用 `x-cron-secret`；需要手动触发时用 SQL `net.http_post` 从 Vault 取密钥，**不要把密钥打印出来**。
- GitHub Actions（只有 schedule + workflow_dispatch，不加 `pull_request`）：`ltb-refresh.yml`（每月 3 日）、`refresh-ca-corp-registry.yml`（每月 5 日）、`rent-benchmarks-refresh.yml`（每月 15 日）。唯一 secret `SUPABASE_SERVICE_ROLE_KEY`。改 package.json 后用 `npx npm@10 install --package-lock-only` 重生成 lockfile（runner 是 npm 10）。

## 关键不变量

- **双 ID**：`landlords.id`（profileId）≠ `auth.users.id`（authId）。旧 `screenings.landlord_id` 存 profileId、新的存 authId；查房东行一律 `.or('id.eq.X,auth_id.eq.X')` 后 `pickLandlordRow`；screenings→landlords 外键已删，PostgREST 不能嵌入。新表的用户键一律 authId。
- **房源可见性在数据库强制**：公开 = `is_active AND verification_status='verified'`（RLS 与 `LISTING_VISIBILITY_OR` 都只认这一条，2026-11-15 去掉了 realtor 分支），房东发布进 pending、`/admin/verify` 核验；守卫让非管理员改不了信任列、改地址 / 租金即打回 pending；**没有照片不上线**（`hasUsablePhotos`）。anon 已无 `listings` SELECT：公开页走 `/api/listings/search`（服务端筛选、每页 ≤100）与 `/api/listings/[slug]`。`listings.is_test` 的房源在所有展示处标「测试房源」。
- **Realtor.ca / MLS 读取永久关闭**（PropTx 2026-10-13 拒绝：MLS 数据不得经第三方 AI）。`REALTOR_LIVE_READS=false` 是常量；`isMlsHost()` 的主机一律不读；找房只给 Rentals.ca / Kijiji / Realtor.ca 外链。导入的 Realtor 房源已全部归档。**不要再提 PropTx / DDF / Realtor 抓取。** 租金基准只用 CMHC + 统计局（`lib/market/rentBenchmark.ts`，来源句必显示），不再展示 TRREB 数字。
- **筛查模块 DO NOT TOUCH**：`app/screening/`、`app/api/screen-score/`、`app/api/deep-check/`、`lib/generateReport.ts`、`lib/forensics/` 未经明确要求不改；需要时只做加法（顶部挂组件、加一句文案）。评分是四项计分（付款能力 / 信用 / 租务与司法历史 / 核验）+ 不计分的申请完整度；没有硬性收入比或信用分截止线（OHRC）。 免费档额度由 `screening_quota_usage` / `record_screening_run`（表 `screening_runs`，仅服务端）计：本月评过分的筛查最多 3 份、每份每月最多评 3 次；单次解锁只覆盖该筛查上的申请人（`sameApplicantName`）。
- **筛查只给房东或 RECO 注册有效的经纪**（`lib/screening/roleGate.ts`，触发器 `guard_screening_role` + 四个路由）。客户确认的委托可选，用来让客户也看到报告。
- **帽子与活动帽子分开**：资格由 `my_hats()` RPC 给出（`lib/useHats.ts`，`heldHat / activeHat` 是唯一谓词），活动帽子按路由前缀（`lib/activeRole.ts`）。**页面加载永不开通房东帽子**，只有 `/landlord/become`、起名页选房东、发布房源才 `claim_landlord`；计费路由对没有房东帽子的账号返回 403。页头「我是…」显示身份由 `lib/displayIdentity.ts` 决定，权限永远只看帽子。
- **一个用户一个 AI 助理**：名字 / 头像 / 人设 / 风格存 `assistant_profiles`，记忆按身份存、读全部身份，反思画像一人一份（`user_memories` role `self`）。未起名时中文自称「AI 助理」、英文「AI Agent」（`lib/agent/assistantName.ts`）。
- **待批卡只能经 `decide_pending_action` 批准**：`agent_pending_actions` 上有守卫触发器，客户端直接改只能编辑待批卡、撤销（approved → pending）或作废；已执行的卡只读。新增客户端写法前先对照 `20261115b_code_review_s2.sql`。
- **待批卡只能提议有执行器的动作**（`EXECUTABLE_ACTION_TYPES`）。租客模型只能提 `maintenance_request` 与带正文的 `send_message`；**房东与经纪的模型不出卡**。执行器批准前重新核对事实，失效即 409 + `expired`。批准后 60 秒可撤销（`UNDO_MS`）；关页面后续跑 / 待办页「现在执行」。
- **人与人的消息只追加**：`thread_messages` 对所有角色（含 service role）拒绝 UPDATE / DELETE / TRUNCATE，撤回 = 新增一行；每条带哈希链（格式 `stayloop-thread-v1`，`lib/threads/hashChain.ts` 逐字节复现——**改格式会让历史链失效，要改就加 v2**）。当事人判定只在 `party_for()`；对外一律经中转地址，不暴露私人邮箱。
- **委托的范围是真的权限**：经纪只有在委托的 `scope` 含 `matter`（事务跟进）时才进得了客户的事务（`matter_party()` / `my_matters()`，导出证据包也经它）。
- **核验结果按账号归属，不按邮箱**：`verification_requests.tenant_auth_id` 只在申请人用该邮箱的已确认账号登录并同意时写入（`/api/verify/[token]/consent`）；护照接口与申请包页只读绑定到本人的请求。房东填的 `tenant_email` 不能证明是谁做的核验。
- **Stayloop 不经手资金**：不做在线收租 / 代收 / 抽成（FINTRAC + RPAA）。租金记录只经 `mark_rent_paid` / `confirm_rent_payment` / `/api/rent/evidence`；服务商付款线下。
- **不代填 / 代选 / 代送 LTB 表格**（LSA s.1(5)）：N 表工具箱只做日期算术与「Stayloop 填写稿」，四张表并排、不预选表，官方 PDF 不改写。
- **安省规则单一来源** `lib/ontario/rules.ts`（`RENT_GUIDELINE` 按涨租生效年份：2026 2.1%、2027 1.9%；每年 6 月省里公布新数时只改这张表）。**外省**走 `lib/provinces/`（12 省事实快照，每条带引文与官方链接），租约省份只经 `leaseProvince`、房源省份只经 `listingProvince`；外省页面不出现 RTA / LTB / N 表 / OHRC / RECO / TRESA，也不写「不适用」。
- **《消费者报告法》**：站上不声明「不是报告机构」；申请人可在 `/my-file` 索取档案、提争议、设身份警示（`lib/consumer/`）。`CRA_MODE=tool` 关闭「替房东查申请人本人的公开记录」。注册完成前不做：公开按姓名查 LTB、Equifax 直拉、对外开放第三档筛查 API。

## 工程规则

- 登录后界面**不用原生 `window.confirm / alert`**，改页内两步确认（`<thing>-confirm` testid）。后台与筛查页的旧弹窗暂留。
- 挂载 effect 里清 URL 参数用 `lib/ui/stripUrlParams.ts`，不直接 `history.replaceState`（会抹掉 Next 的历史状态）。
- **首屏不按客户端状态分支**：语言、localStorage、navigator 一律先渲染服务端默认再在 effect 里更新（否则 React #418）。语言键 `localStorage.stayloop_lang`。
- `useAuth` 对同一登录保留 `user` 引用，effect 依赖 `auth.user` 是安全的；不要改成 `auth.user?.id` 绕法。
- 宽表：外层 `overflow-x-auto`、`min-w-[N]` 放在表上，外层若是 flex/grid 子项必须 `min-w-0`。手机文本控件 ≥16px（globals.css 已有规则）。SVG 不写死 width。
- 页面主容器统一 `max-w-[1320px] px-6 sm:px-8 lg:px-12`（与页头对齐）。
- 中文标题只在标点 / 空格处断行（`.sl-type-head`，keep-all）；超过约 10 个字没有标点的一段要放零宽空格断点。**WebKit 下相邻的 nowrap span 不会换行**，测首页断行要同时跑 WebKit。
- 给思考型模型的结构化输出调用留足 `max_tokens`（推理会先吃掉预算导致 JSON 截断）。
- 发信类限流 fail-closed、成本类 fail-open（`lib/rateLimit.ts underHourlyLimit`）；匿名面都要有全站总闸（匿名读端点用 `underCostLimits`：调用者桶 + 全站桶，fail-open）。**会发信的端点用 `underMailLimits`**（调用者桶 + 全站桶），按 IP 归桶用 `ipBucket`（IPv6 按 /64）。
- `?next=` / `?redirect=` 一律过 `lib/auth/sameSitePath.ts`（「以 / 开头且不以 // 开头」挡不住制表符）。
- 外部失败（429 / 超时）不能当成「没有结果」缓存；Overpass 查站点用 `nwr` + `out center`。
- Worker 的响应不经过 zone 的 CDN 缓存（`s-maxage` 无效），要缓存用 Workers Cache API（`caches.default`）。
- **响应返回后还要做的事（推送、通知邮件、派单建议）一律 `afterResponse(…)`**（`lib/afterResponse.ts`，挂 `waitUntil`）：Worker 上裸写 `void notifyUser(…)` 会随响应一起被取消，本地却一切正常。cron 路由里直接 `await`。守卫 `codeReview20261115` 会扫。
- **用户能影响的文本不进 PostgREST 的 `.or()` 过滤串**（逗号会多出条件），拆成 `.eq()` / `.in()`；邮箱进 `.ilike()` 一律过 `ilikeExact`（`lib/db/ilikeExact.ts`，`_` 与 `%` 是通配符）。
- **「读出全部行」要分页**：PostgREST 超过 max-rows（1000）静默截断，长 `.in()` 会撑爆 URL；去重 / 全量扫描用 `lib/db/paged.ts`（`selectPaged`、`selectInChunks`），读失败要中止而不是当成空集。
- 用户填的外部网址当链接前过 `lib/ui/externalHref.ts`（补协议、只留 http(s)、返回 null 就不渲染）；服务端读用户给的地址用 `lib/net/publicUrl.ts`（`isPublicHost`、`readTextCapped`）。
- Stripe 一次性付款的入账用单事务 RPC（`fulfil_unlock_payment`：台账 + 发放 + 盖章同成同败），不要拆成几次请求。
- 页面里不能从 `page.tsx` 导出多余符号（Next 构建拒绝）；Route Handler 不能从带 `'use client'` 的模块取常量（会变成 client-reference 存根）。
- 演示产品的动画 / 示例用产品真实组件按脚本驱动，不手画仿制界面。
- 示范数据必须标「示例数据」小标签（`SampleBanner` / `SampleTag`）；工作台样例页走 `WorkspaceShell` 的 `DEMO_GATE` / `SAMPLE_NOTE`。不编造数字、评分、客户数、百分比收益。
- `/x/agent` 的对话上方不放任何面板；新面板放右侧 AI 助理面板或别的页面。改助理页只改 `components/agent/AgentWorkspacePage.tsx`。
- 提示词里新提到的站内路径要加进 `lib/agent/replyPaths.ts` 的 `PATH_RE`，聊天里才会变成链接（长路径排在它的前缀前面；不用正则后顾）。

## 文案与设计

- **统一叫「AI 助理」/「AI Agent」**；不用 助手 / 管家 / AI assistant / 个人 AI Agent（守卫 `assistantNaming20260928`）。代码名（`assistant_profiles` 等）不动。
- 产品动作叫「租客筛查 / 筛查」，不叫背调 / 背景调查（守卫 `complianceCopy`）。
- **中文用平实现代口语**，不要文言、四字格堆叠、营销腔。首页主标题「租房的事，交给AI助理」是用户自己的句子，不擅自改。用「催租」不用「催收」，用「按当地法规把关」不用「法律协助」。
- 不写「验证一次，处处通行」「六维」「四枚章」「按时收租」「实时挂牌」等不属实说法（各有守卫）。
- 中文是主语言（`lib/i18n.tsx`，`t(key, fallback)`）；页面中英同串时英文界面不能出现中文、中文界面除专名外不出现英文。
- 配色：品牌亮蓝 #00ACE4，文字墨蓝 #1B1B3C；身份色 租客紫 #7C3AED / 房东绿 #047857 / 经纪蓝 #2563EB / 服务商橙 #C2410C（`lib/roleTheme.ts`）。字体全站黑体（Inter Tight + 苹方 / 雅黑），**不要再提议衬线中文**。
- 页头菜单在所有页面一致：`我是▾ · 产品 · 房源 · 定价 · 租客筛查`（登录后「我是▾」就是身份切换器），位置不动；logo 一律回 `/`。
- 新营销页 / 新蓝本的设计探索可用 `.claude/skills/design-taste-frontend/`，产出先落 `design/` 给用户定稿；已定稿的页面以现有代码为准。

## 当前产品决定

- **定价**：租客永久免费（RTA s.134，费用不能转嫁租客）。房东免费档永久免费（每月 3 次筛查 + 首次 1 次深度核查额度）；新房东 Pro 免费试用 30 天（`pro_trial_until`，判定统一用 `lib/billing/entitlement.ts isProEntitled`）；Pro $19/月。经纪 $29 / $59 与团队 $39 标「尚未开售」。计划清单单一来源 `lib/billing/landlordPlans.ts`；订阅状态只用 `resolveSubscriptionState`。
- **登录方式**：Google、邮箱 + 密码登录、邮箱 + 密码注册、忘记密码。**一次性登录链接已弃用**，`signInWithOtp` 不得出现。首页 / `/login` / `/register` / 起名页共用邮箱先行的 `LoginCard`（先查邮箱是否已注册）。条款版本 `TERMS_VERSION`（改它会让所有账号再确认一次）；密码账号 90 天更新。
- **首页**（`components/home/HomeNext.tsx`）对所有人都是营销页；没有房东 / 经纪 / 服务商帽子且从未走过起名页的新账号会被送去 `/onboarding/name`（起名或「跳过」都算走过：跳过会写一行空名字的 `assistant_profiles`，`isBrandNewAccount` 的第二个参数是「走过起名页」而不只是「起过名」）。首屏是问一句的对话框（`HeroComposer`，按所选身份发到 `/<身份>/agent?prompt=…&send=1` 的免登录预览）。
- **服务市场**：试点、多伦多及周边、不抽成、付款线下；派单策略、紧急报价预授权、资质到期阶梯在 `lib/marketplace/`。
- **「找经纪和服务商」**（2026-11-16）：一个栏目三个标签，各是真实地址——经纪 `/agents`（免登录；开了公开主页的是完整卡片，其余 RECO 核验有效的只列注册名 / 类别 / 经纪公司）、维修服务 `/providers`（登录后任一身份可看可联系，**匿名不读任何服务商数据**，派单仍只有房东能做）、专业服务 `/providers/professional`。共用标题与标签栏 `components/directory/FindHeader.tsx`。入口：工作台侧栏「找人」（`FIND_ITEM`，在「消息」下面）、头像菜单「找经纪 · 服务商」、页脚；**页头那一排不加项**。目录排序固定（`lib/marketplace/directory.ts`），不排名、不收排名费；名字带 `[TEST]` 的行标「测试数据」。助理被问到找经纪 / 找维修 / 找专业服务时只给这三个入口（`directoryGuide`，看不到目录内容所以不点名、不推荐、不编造；租客先报修）。方案 `design/find-directory-2026-11-16.md`，守卫 `findDirectory20261116`。
- **开放 API**：第一档（规则、合规核对、指导比例、N4 日期、持续迟付、租金基准）免费无密钥，`/api/v1/*` + OpenAPI + 远程 MCP `/api/mcp`；第二档 `passport/verify` 需合作方密钥 + 申请人授权；第三档 `screen` 在 CRA 注册前关闭。
- 待外部：CRA 注册与律师意见、Veriff / Flinks / Equifax 生产凭证、MCP 目录提交、Twilio（消息 B 期短信）。

## 测试与账号

- 测试账号（密码 `Test1234`，`user_metadata.test_account=true`）：`tenant-test@stayloop.ai`（纯租客）、`landlord-test@stayloop.ai`（房东）、`agent-test@stayloop.ai`（已核验经纪 + 服务商 `[TEST] Maple Plumbing`）、`provider-test@stayloop.ai`（纯服务商 `[TEST] Northline`）、`admin-test@stayloop.ai`（后台管理员，`admin_users.role = admin`，不是 superadmin；后台页面与 `/api/admin/*` 的测试都用它）。**`admin@stayloop.ai` 不是测试账号**：它是 superadmin 最高管理账号（与创始人账号并列两个 superadmin），密码只在用户的密码管理器里（2026-10-23 起与创始人账号相同），测试不要用它登录；需要管理员视角的测试经 service role 铸 magic link。Muse 外部测试用的 `muse-*@stayloop.ai` 四个号密码只在本机 `.forensics-tmp/`。**测试数据带 `[TEST]` 前缀，正式发布前不删。**
- **Claude 不输入密码。** 登录测试号用 service role 调 Auth Admin `generate_link`（type=magiclink），`redirect_to` 必须放 URL 查询参数；链接约 10 分钟失效，铸完即用。service role key 只走 header 文件，不进命令行与报告。
- 组件测试在 jsdom 里用 `@testing-library/react` 渲染：spec 首行 `// @vitest-environment jsdom` + `afterEach(cleanup)`，助手 `tests/helpers/dom.ts`（`only` 保持「恰好一个」的严格度）。react-test-renderer 在 React 19 已弃用，已删除，不要再引入。jsdom 有真的 `localStorage` / `sessionStorage` / `location`，写过就在 `afterEach` 里清。
- 内置浏览器面板隐藏时页面 JS 不跑、截图是旧画面；批量核对用无头 Chrome + CDP，**每个测试员用私有调试端口，别 pkill 别人的实例**。同一测试号在一处退出会全局作废会话。
- 测试规范：`design/test-strategy-2026-10-17.md`（ISTQB 流程、风险分级、追溯矩阵、退出准则）+ `design/test-cases-2026-10-17/`。10-17 轮报告 `design/test-report-2026-10-17.md`（S0/S1 清零、建议 Go）；用例文件与 `scripts/e2e/db-matrix.sh` 是每次发布的回归基线。
- Resend 会把发往不可达地址的收件人加入 suppression 列表；保留域名（example.com）直接 422。

## 主要模块位置

- 助理：`app/api/agent/turn/route.ts`（推理一步，无状态）、`lib/agent/`（prompts、guardrail、orchestrator、useAgentSession、intake 引导卡、approval-engine、reflection）、执行器 `app/api/agent/execute/route.ts`、主动扫描 `app/api/agent/proactive/route.ts`
- 生命周期事实：`lifecycle_facts_{tenant,landlord,agent}()` RPC → `lib/facts/useFacts.ts`；rail / 今日卡在 `lib/lifecycle/`；事务主记录 `rental_matters` + `my_matters()`
- 租约：`app/api/lease/{send,sign,view}`、`lib/lease/`；在管租约中心 `/h/[id]`、`lib/household/`
- 消息：`/messages`、`components/messages/MessageCenter.tsx`、`lib/threads/`、`components/threads/ThreadPanel.tsx`
- 服务市场：`lib/marketplace/`（状态机 `workOrders.ts`、服务端 `server.ts`、日扫 `sweep.ts`）
- 经纪：`agent_profiles` / `agent_clients` / `delegations` / 收件链接 `/intake/[token]`；`/admin/agents` 人工核验 RECO（注册库禁止自动查询，永远手动）；公开主页的开关在 `/agent/verify`（`components/agent/PublicProfileEditor.tsx` 顶部的「公开我的主页」按钮，核验有效后这一节排在注册表单上面；侧栏「认证与主页」）
- 消费者档案：`lib/consumer/`、`/my-file`、`/admin/consumer-requests`
- 申请包：`applicant_profiles` + `/tenant/passport`、`/api/profile/*`
- LTB 判令目录：`lib/ltb/`（ingest 与查询共用 `normalize.ts`；只有房东发起且对方是租客才算风险；姓名命中未经地址佐证一律视为同名；目录没有判决结果，只能说「已出判令」）。CanLII API 不能按姓名查。
- 后台：`/admin`（verify / users / usage / models / agents / providers / partners / consumer-requests / knowledge），门禁 `is_stayloop_admin()`。**管理员的待处理提示**（2026-11-15）：RPC `admin_pending_counts()` 只返回六个队列的计数（`lib/admin/pendingCounts.ts` 是队列清单与口径），页头菜单「后台管理」行显示数字，登录后在页头右下浮出提示（`components/admin/AdminPendingNotice.tsx`，`fixed`、不占版面，`/admin` 内不显示；关掉后下次登录或某个队列变多才再出现）。新增后台队列时把它加进 RPC 与 `ADMIN_QUEUES`，并在该页决定后调 `notifyAdminPendingChanged()`
- **知识库（RAG，2026-10-27）**：`lib/kb/`（`chunk` 切块、`trigger` 触发与中→英检索词、`cite` 参考资料段 / 条号核对 / 来源清单、`search` 调 RPC、`config` 读 `app_config.kb`）、`lib/llmEmbed.ts`（嵌入，`ai_usage` slot `embed`，默认 `gemini-embedding-001` 1024 维）、表 `knowledge_sources / documents / chunks`（只有 service role）+ RPC `kb_search`、语料清单 `scripts/kb/sources.ts`、入库 `scripts/kb/ingest.ts`（版本只追加不删）、评测 `scripts/kb/eval.ts` + `design/kb-golden-set-2026-10-27.json`、每周 `kb-refresh.yml`（需 GitHub secret `GEMINI_API_KEY`）。**开关在 `app_config.kb`**（`audience` test → all），计划 `design/rag-knowledge-base-plan-2026-10-27.md`。回答里的条号必须来自本轮参考资料，否则守卫改写并记 `kb_uncited`。 **更新机制**：原文有新版本 → `knowledge_changes` 队列（逐条 diff → 反查规则 `lib/kb/ruleMap.ts`）→ 审核人邮件（`KB_REVIEW_EMAIL`）→ 人在 `/admin/knowledge` 标状态；pending 期间涉及的规则在助理提示词与 `/rules` 上标「待核对」（`lib/kb/notices.ts`）。规则表只在代码里改，可用 `effective_from/to` 提前上线。

## 路由速查

公开：`/` `/pricing` `/platform` `/services` `/rules`（含更新记录）`/tools`（租房小工具：N1 / N4 / N12 日期算术、要价对照、「这个能问吗」，免登录、确定性）`/go/[code]`（房源分享短链：计数后 302 到房源页 `?src=渠道`）`/screening` `/listings` `/listings/[slug]` `/agents` `/agents/[slug]`（经纪公开主页，经纪在 `/agent/verify` 自己开启）`/apply/[slug]` `/tenant` `/landlord` `/agent` `/stayloop-api(/docs)` `/about` `/partners` `/contact` `/disputes`（全部示范数据） `/privacy` `/terms` `/consumer-rights`（含 `#method` 筛查方法论）`/my-file`；`/providers`（维修服务商目录，未登录只看到工种与登录提示）；登录后任一帽子：`/providers/professional`（专业服务目录：Paralegal / 律师 / 保险经纪 / 房源摄影，只展示与转介，派单器永不派给它们）。
认证：`/login` `/register` `/auth/callback` `/auth/reset-password` `/onboarding/name`。token 页（`Referrer-Policy: no-referrer`）：`/verify/[token]` `/lease/sign/[token]` `/join/[token]` `/delegate/[token]` `/intake/[token]` `/w/[token]` `/p/[token]` `/my-file/[token]`。
工作台（每顶帽子都有 `/x/agent` `/x/todo` `/x/ideas` `/x/progress`）：租客 `applications(/[id])` `lease` `maintenance` `move-in` `passport` `payments` `audit`；房东 `applicants(/[id])` `leases(/new,/[id])` `notices` `finance` `maintenance` `providers` `become` `audit` + `/dashboard`（房源管理，`/dashboard/listings/{quick,new,[id]/edit}`）+ `/screening/app`；经纪 `clients` `tasks` `checklist` `calendar` `earnings` `verify` `audit`；服务商 `/provider/{onboard,jobs,history}`。共用：`/messages` `/settings` `/settings/models` `/h/[id]` `/leases/import`。`/notifications` 只是跳转。

## 偏好

- 回复用户一律简体中文。
- 可复制的命令块里不写注释，说明放块外。
- 用户可见的版本字样（页脚）改之前先问。
