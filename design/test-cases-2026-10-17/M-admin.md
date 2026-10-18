# M · 后台管理（2026-10-17）

风险 R3。依据：CLAUDE.md「Route Map › Admin」「模型目录：每周自动发现」「Realtor.ca 导入房源自动下架」「PropTx 拒绝」「V0.8 第一项」后台队列、「三角色与经纪认证」`/admin/agents`、「服务市场」`/admin/providers`、「Trust API 重建」`/admin/partners`。
方法：admin@stayloop.ai 魔法链接 → 无头 Chrome（CDP）1280 与 375 宽截图 + 控制台 error 收集；数据用 Supabase MCP `execute_sql` **只读**对照。**只读：不点通过 / 拒绝 / 停用 / 核验任何行**。截图在 scratchpad `sitetest1017/M/`。

## 用例

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| M-01 | R3 | admin 登录 | `/admin` 1280 / 375 | 渲染控制台（平台统计、核验队列、服务商核验块、消费者队列块）；无横向溢出；无 console error | — |
| M-02 | R3 | 同上 | `/admin` 数字 vs SQL：待核验房源数、用户数、消费者待办数 | 一致 | — |
| M-03 | R3 | 同上 | `/admin/verify` | 队列条数 = `listings where verification_status='pending'`；无照片行标红；Realtor 下架卡写「读取已于 2026-10-13 停止 … 已停用」且无「现在检查一批」按钮；历史数字 = SQL | realtorReadsOff |
| M-04 | R3 | 同上 | `/admin/users` | 用户数 = `admin_user_counts`；列表可渲染；375 不溢出 | — |
| M-05 | R3 | 同上 | `/admin/agents` | 队列 = `agent_profiles`（pending/verified/…）行数；`[TEST]` 经纪显示 RECO 号；个人邮箱琥珀警告 | — |
| M-06 | R3 | 同上 | `/admin/partners` | 密钥数 = `trust_api_keys` 行数；只显示前缀不显示密钥 | — |
| M-07 | R3 | 同上 | `/admin/providers` | 服务商列表 = `service_providers` 行；每家资质数 = `provider_credentials`；宽限天数 = `app_config.marketplace.credential_grace_days` | — |
| M-08 | R3 | 同上 | `/admin/models` | 目录行数 = `model_catalog` + 内置；「用户可选」勾选数 = `user_selectable=true`；「发现新模型」旁写明每周自动；表在 1000px 内不裁列 | modelAutoDiscover |
| M-09 | R3 | 同上 | `/admin/usage` | 本周调用数 / 成本 = `admin_ai_usage_stats(7)`；生命周期五指标渲染；375 不溢出 | — |
| M-10 | R3 | 同上 | `/admin/consumer-requests` | 待办数 = `consumer_requests` 非 fulfilled/closed；tenant-test 的请求与身份警示可见 | v08_consumerAdmin |
| M-11 | R1 | 无会话 / 租客会话 | 匿名 `/admin`、租客 JWT 调 `admin_platform_stats` / `admin_list_users` | 页面跳转或空态；RPC 拒绝（非管理员） | is_stayloop_admin |
| M-12 | R3 | admin | 九页控制台 error 汇总 | 0 条（第三方 Cloudflare 邮箱混淆类记为越界） | — |

## 执行记录（2026-10-17 晚 · 生产 · admin@stayloop.ai 魔法链接 → 无头 Chrome CDP（`sitetest1017/M/cdp.mjs`、`models.mjs`），截图 `admin*_1280.png` / `admin*_375.png`、页面文本 `*.txt`、`report.json`；数据对照 Supabase MCP `execute_sql` 只读）

| ID | 实际 | 证据 | 结果 |
|---|---|---|---|
| M-01 | 九页在 1280 与 375 全部渲染（h1：Back office / Listing verification / Users & permissions / Agent verification queue / Stayloop API partner keys / Provider verification queue / AI models / AI usage & cost / Consumer file requests）；18 次加载 `documentElement.scrollWidth - clientWidth = 0`；Runtime 异常 + console.error + Log error 合计 **0** | report.json、*.png | 通过 |
| M-02 | 页面 21 real users / 2 anon / 241 screenings / 2 households · 0 invites pending / 5 public · 0 pending / 1 open consumer；SQL：auth.users 23 = 21 + 2 anon ✓、screenings 241 ✓（首次查 240，期间其他组新建一条）、public listings 5 ✓、pending 0 ✓、consumer needs_review 1 ✓；households SQL 3 / pending invite 1——第三条 `1905e617` 建于页面加载之后（F 组电子签），`admin_platform_stats` 定义按 `count(*)` 与「未接受未撤销未过期」计，与新状态一致 | admin_1280.txt、SQL | 通过（时序差异，非缺陷） |
| M-03 | 「Queue is clear」= pending 0 ✓；无照片行无（0 pending）；Realtor 卡文案「Realtor.ca reads stopped on 2026-10-13 … hourly sweep is disabled; the counts below are historical」、**无**「现在检查一批」按钮（文本 grep 为空）；Active 0 / Auto-delisted 23 = SQL `source=realtor & realtor_check.state=gone` 23 ✓；Last run「—」 | admin_verify_1280.txt | 通过 |
| M-04 | 「21 real · 2 anonymous」✓；成员 2（jasonhan72@、admin@）= `admin_users` ✓；375 无溢出；每行 Delete 按钮**未点** | admin_users_*.txt/.png | 通过（注：tenant-test@ 行标 landlord——SQL 证实 `landlords` 行 `4161c2c8` 建于 2026-10-18 UTC，是本轮其他测试员开通的，见越界） |
| M-05 | Pending 标签「Nothing here」= SQL `agent_profiles` 全部 verified（2 行）、0 pending ✓；页面有 RECO 注册库链接与「Canadian IP needed」说明 | admin_agents_1280.txt | 通过（All 标签未切换；个人邮箱琥珀警告未触发——无 pending 行） |
| M-06 | 1 行 `[TEST] Partner PMS · sk_trust_1eda2e2 · 2 calls 30d · last 2026-09-23 · landlord 30d0c280… · Active` = `trust_api_keys` 1 行 ✓；只显示 `key_prefix`，无明文密钥 ✓ | admin_partners_1280.txt | 通过 |
| M-07 | Pending「Nothing here」= 3 家服务商全 verified ✓（Maple 4/4、Muse 5/5、Northline 5/5 资质均已核，SQL）；Disputes 1 = `work_orders.status='disputed'` 1 ✓；宽限天数输入对应 `app_config.marketplace.credential_grace_days = 0`（input 值不进 innerText，页面说明只对文书类资质生效）✓ | admin_providers_1280.txt | 通过 |
| M-08 | 目录表 56 行 = `model_catalog` 56 ✓；表头 MODEL / PROVIDER·KEY / SLOTS / COST / USER-PICK / ENABLED / ACTIONS；「⟳ Discover new models」旁「Checked automatically every Monday … added and made user-selectable (price left blank) … admins get an email」✓；1000px 视口：表右缘 971 < 1000、文档无横向溢出 ✓；槽位下拉里 7 个 disabled 标注 = SQL enabled=false 7 ✓；自动加入的行 note 带「自动发现 2026-10-12」，失败的带 404 原因 | admin_models_full.txt、admin_models_1000_b.png | 通过（「用户可选」勾选数 46 未逐行核：开关不是 checkbox，脚本计数为 0；按 SQL 46/49 记录） |
| M-09 | 30d：$17.92 / 1,277 calls、36 unpriced · 18 errors、18 screenings、p50 $0.3765 = SQL 30d $17.93 / 1,278 / 36 / 18 / 18 ✓（差 1 次调用为加载后新增）；五项生命周期指标渲染；375 无溢出。**TODAY = 8 calls $0.0759** = SQL 按 UTC 当日 9 / $0.0830（一次为加载后），按多伦多当日则为 13 / $0.1088 → 「今天」按 UTC 切日 | admin_usage_1280.png、SQL | 通过；记 M-D1（S3） |
| M-10 | 「1 open」；FILE ACCESS REQUESTS 1 = SQL needs_review 1（mu***@stayloop.ai「Wrong Person Probe」，E 组数据）；候选筛查 3 条供勾选；DISPUTES 0 open = SQL disputes 全 corrected ✓；`consumer_alerts` 2 行（页面未单列，按设计在请求卡内） | admin_consumer-requests_1280.txt | 通过（未点 Confirm / Close） |
| M-11 | 匿名 `/admin` HTTP 200 但页面只渲染「STAYLOOP ADMIN · No access · Sign in with a Stayloop admin-group account first」，无数据，console 0 错；租客 JWT 调 `admin_platform_stats` / `admin_user_counts` → `{"error":"forbidden"}`，`admin_list_users` → `[]`（定义里 `where public.is_stayloop_admin()`，软拒绝、无泄露）；`admin_ai_usage_stats` 在 MCP 角色下 RAISE forbidden | anon_admin.txt、curl | 通过 |
| M-12 | 18 次页面加载 console error 0 | report.json | 通过 |

**汇总**：12 条全部执行，12 通过，缺陷 1（S3）。未做：各页「All」标签切换与任何写操作（按任务只读）。

### 缺陷
- **M-D1（S3 / P3）** `/admin/usage` 的 TODAY 卡按 UTC 自然日统计（页面在多伦多 10-17 晚 23:35 显示 8 次 $0.0759，而多伦多当日实为 13 次 $0.1088）。全站其他地方（租金、N4 日期）都按 America/Toronto。复现：`select count(*) from ai_usage where created_at::date=current_date` vs `(created_at at time zone 'America/Toronto')::date`。
- 观察（非缺陷）：`/admin/usage` By model 表 innerText 把模型 id 与「1 unpriced」角标连写（`claude-fable-5-11 unpriced`），截图首屏未含该表，视觉未核；若两者间无间距属 S3。

### 数据副作用
无写入（只登录、只读页面）。admin@ 两次魔法链接登录会在 `agent_audit_events` 留 `*_session_started` / `listing_*` 之类的页面打开事件。
