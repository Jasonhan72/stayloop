# M · 后台管理（R2）· 2026-10-28

测试员：① 身份组。基线 `design/test-cases-2026-10-17/M-admin.md`；新内容：10-27「知识库 · 更新机制与人审队列」（`/admin/knowledge`、`/api/admin/knowledge`、`/api/kb/notices`、RPC `kb_source_status / kb_pending_rule_notices`）。
账号：**admin-test@stayloop.ai**（`admin_users.role = admin`，不是 superadmin；未用 admin@stayloop.ai）。方法：魔法链接 → playwright 无头 Chrome 1280 与 375 宽，`document.body.innerText` + 截图 + console error；数据用 Supabase MCP `execute_sql` **只读**对照；API 用 curl + 三个账号的 JWT（`AKMT/jwtprobe.sh → jwtprobe.out`）。**只读：不点通过 / 拒绝 / 删除 / 核验，不 PATCH 真实队列行**（队列为空）。
证据目录 `AKMT/`：`admin.mjs → admin.json`、`M01-admin-1280.png`、`M-knowledge-1280.png`、`M03-verify-1280.png`、`M04-users-1280.png`、`M-_admin-375.png`、`M-_admin_knowledge-375.png`、`M-_admin_users-375.png`、`M-admin-anon.png`、`M-admin-tenant.png`。

## 用例

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| M-01 | R2 | admin-test | `/admin` 1280 / 375 | 渲染统计卡 + 九张入口卡（含新「知识库」卡）；无横向溢出；console error 0 | — |
| M-02 | R2 | 同上 | `/admin` 数字 vs SQL | 真实注册 / 匿名 / 筛查 / 在管租约 / 公开房源 / 待审 / 消费者待办 / 管理组成员一致 | — |
| M-03 | R2 | 同上 | `/admin/verify` | 待审 = `listings.verification_status='pending'`；Realtor 卡写「读取已于 2026-10-13 停止」、无「现在检查一批」；历史数字 = SQL | `realtorReadsOff` |
| M-04 | R2 | 同上 | `/admin/users` | 成员 = `admin_users`；用户数 = `auth.users` 拆分；可渲染、375 不溢出；不点删除 | — |
| M-13 | R2 | 同上 | `/admin/knowledge` 1280 / 375 | 来源表 46 行（= `knowledge_sources`）、表头「来源 / 级别 / 合并 · 更新日 / 上次抓取 / 块 / 状态」、「过期 0」、变动队列空（= `knowledge_changes` 0 行）；无溢出 | `kbUpdates20261027` |
| M-14 | R2 | admin JWT | `GET /api/admin/knowledge` | 200 `{sources:46, changes:0}` + `no-store` | 同上 |
| M-15 | R2 | admin JWT | `PATCH /api/admin/knowledge` 非法 status；不存在的 id | 400；404（或至少不 200 ok） | 同上 |
| M-16 | R1 | tenant JWT / landlord JWT / 无会话 | `GET` 与 `PATCH /api/admin/knowledge`；`DELETE` | 403 `admin only`；无会话 401；DELETE 405 | 路由审计 |
| M-17 | R1 | 匿名 / tenant / landlord | 打开 `/admin` `/admin/knowledge` `/admin/users` `/admin/verify` | 匿名：「无访问权限 · 请先登录」/ 「仅限管理员」；非管理员登录：「无访问权限 · 这个账号不在 Stayloop 后台管理组里」/「仅限管理员」；无数据 | `is_stayloop_admin` |
| M-18 | R1 | anon / tenant JWT | RPC `admin_platform_stats` `kb_source_status` `is_stayloop_admin`；REST `knowledge_changes` | anon：admin_* 42501、kb_source_status 42501、is_stayloop_admin false；tenant：knowledge_changes `[]`（RLS） | — |
| M-19 | R2 | 公开 | `GET /api/kb/notices` | 200 `{notices:[]}`（队列空）、`public, max-age=300`；RPC `kb_pending_rule_notices` anon 可调 `[]` | `kbUpdates20261027` |
| M-09 | R3 | admin-test | `/admin/usage` 「今日」按多伦多日（复测 M-D1） | 迁移 `20261018m_ai_usage_stats_toronto.sql` 已上；页面 TODAY 与 SQL 多伦多日一致 | — |
| M-12 | R2 | admin-test | 各页 console error | 0 | — |

## 执行记录（2026-10-28 14:40–14:50 ET · 生产）

| ID | 实际 | 证据 | 结果 | 缺陷 |
|---|---|---|---|---|
| M-01 | `/admin` 1280：「后台管理 · 平台实况」六个统计数 + 九张卡（房源验证 / 经纪认证 / 服务商核验 / 用户与权限 / 消费者档案请求 / **知识库「来源 · 变动队列」** / Stayloop API 合作方 / AI 用量与成本 / AI 模型）；1280 与 375 `scrollWidth - clientWidth = 0`；console error 0 | `AKMT/M01-admin-1280.png` `M-_admin-375.png`、`admin.json.adminCards` | 通过 | |
| M-02 | 页面 22 真实注册 / 2 匿名 / 243 筛查 / 5 在管租约 · 2 邀请待接受 / 6 公开房源 · 0 待审 / 0 消费者待办 / 3 位成员；SQL：`auth.users` 25 = 22 + 2 anon + 1 `@stayloop-test.local`、screenings 243 ✓、households 5 ✓、公开房源（active ∧ verified）6 ✓、pending 0 ✓、consumer 非 fulfilled/closed 0 ✓、`admin_users` 3 ✓ | `admin.json.admin.text`、SQL | 通过 | 注：10 个 `test_account=true` 的账号计在「真实注册」里，「测试账号 1」按域名 `.local` 计（定义不同，不算错；见观察） |
| M-03 | 「房源验证 · 此前导入的 Realtor.ca 房源已于 2026-10-13 归档」；Realtor 卡「读取已于 2026-10-13 停止（PropTx / CREA 规则…）… 下面的数字只是历史记录」，在架 0 / 已确认 0 / 没检查 0 / 需留意 0 / **已自动下架 23**（= 上轮 SQL 23）；无「现在检查一批」；无溢出 | `AKMT/M03-verify-1280.png` | 通过 | |
| M-04 | 成员三行：jasonhan72（SUPERADMIN）、admin@（SUPERADMIN）、admin-test「你 · [TEST] admin-test — role admin」（ADMIN）= `admin_users` 3 ✓；「全站用户 22 真实注册 · 2 匿名会话 · 1 测试账号」；用户卡片列表渲染（含「显示匿名会话」开关）；375 无溢出；页面未见删除按钮（admin 非 superadmin，按设计） | `AKMT/M04-users-1280.png` `M-_admin_users-375.png` | 通过 | |
| M-13 | 「知识库 · 每周一自动重读全部来源…」「来源 46 份 · 过期 0 · 待看变动 0」；变动队列「还没有检测到变动」；来源表 `tbody tr` **46 行**（= SQL `knowledge_sources` 46、`knowledge_documents` 46 current、chunks 1318），表头「来源 / 级别 / 合并 / 更新日 / 上次抓取 / 块 / 状态」，首行 RTA 2006 · 级别 1 · 2026-09-21 · 2026-10-28 · 372 块 · ✓；1280 与 375 无溢出；console error 0 | `AKMT/M-knowledge-1280.png` `M-_admin_knowledge-375.png`、`admin.json.knowledgeRows` | 通过 | |
| M-14 | admin JWT `GET /api/admin/knowledge` → 200 `sources 46 / changes 0 / stale 0`（代码头 `Cache-Control: no-store`） | `jwtprobe.out` admin 段 | 通过 | |
| M-15 | `status:'bogus'` → 400 `id and a valid status are required` ✓；**不存在的 id（全零 uuid）+ `reviewed` → 200 `{ok:true}`**（service role update 0 行也算成功） | 同上 | 部分通过 | M-D2 |
| M-16 | tenant JWT：GET 403 `admin only`、PATCH 403；landlord JWT 同；无会话 GET / PATCH 401 `Authentication required`；DELETE 405 | `jwtprobe.out`、`cors.out` | 通过 | |
| M-17 | 匿名 `/admin` `/admin/users`：「STAYLOOP ADMIN · 无访问权限 · 请先登录,并使用属于 Stayloop 管理组的账号。去登录」；匿名 `/admin/knowledge`：「仅限管理员。」；tenant-test / landlord-test 登录后 `/admin` `/admin/users` `/admin/verify`：「无访问权限 · 这个账号不在 Stayloop 后台管理组里。返回首页」，`/admin/knowledge`：「仅限管理员。」；都无数据、console error 0 | `AKMT/M-admin-anon.png` `M-admin-tenant.png`、`anon.json` `tenant.json` `landlord.json` | 通过 | M-D3（文案，见下） |
| M-18 | anon RPC：`admin_platform_stats` 42501、`kb_source_status` 42501、`my_hats` 42501、`is_stayloop_admin` false；tenant / landlord REST `knowledge_changes?select=id,status` → `[]` 200（RLS `is_stayloop_admin()`），PATCH `status` 204 影响 0 行，PATCH `source_key` 42501（列级）；admin-test REST 读 `knowledge_changes` `[]`（队列空）、`is_stayloop_admin` true、`my_hats.admin=true` | `anonrest.out` `jwtprobe.out` | 通过 | 注：`kb_source_status` 对任何登录用户可调，见 T6-D13 |
| M-19 | `GET /api/kb/notices` → 200 `{"notices":[]}`、`cache-control: public, max-age=300`、ACAO 本站；anon RPC `kb_pending_rule_notices` → `[]` 200 | `cors.out` `anonrest.out` | 通过 | |
| M-09 | `/admin/usage` 今日「$0.0649 · 84 次调用」（加载时）；SQL 当时 UTC 日 = 多伦多日都是 89（14:4x ET 两种切日同天，数据无法区分），迁移 `20261018m_ai_usage_stats_toronto.sql` 已在库 | `admin.json.usage`、`supabase/migrations/` | 通过（代码级关闭 M-D1） | |
| M-12 | admin-test 7 次页面加载（admin / knowledge / verify / users / usage + 375 三页）console error **0** | `admin.json.errors` | 通过 | |

**汇总**：13 条用例，执行 13，通过 12，部分通过 1（M-15），失败 0。未做：`/admin/agents` `/admin/providers` `/admin/partners` `/admin/models` `/admin/consumer-requests`（本轮范围外，上轮全部通过）与任何写操作。

## 缺陷

| 编号 | 严重度 / 优先级 | 一句话 | 复现要点 |
|---|---|---|---|
| M-D2 | S3 / P3 | `PATCH /api/admin/knowledge` 对不存在的 `id` 返回 200 `{ok:true}`（service role update 0 行不报错），后台页若状态过期会误以为已保存 | admin JWT `PATCH /api/admin/knowledge {"id":"00000000-0000-0000-0000-000000000000","status":"reviewed"}` → 200；期望 404。修法：`.update(...).select('id')` 判空 → 404 |
| M-D3 | S3 / P3 | 后台中文文案混用半角标点：`/admin` 无会话态「请先登录**,**并使用…」、首页卡「审核房东发布的房源**:**通过后…」「全站用户名册**(**注册/匿名/角色/筛查量**)**」「系统默认模型**,**60 秒内全站生效」；另 `/admin/knowledge` 的无权限态只有一句「仅限管理员。」，没有其他后台页的「去登录 / 返回首页」链接 | 匿名打开 `/admin`、`/admin/knowledge`；`app/admin/page.tsx`、`app/admin/knowledge/page.tsx` |

## 观察（非缺陷）

- 「真实注册 22」把 10 个 `user_metadata.test_account=true` 的测试号计在内，「测试账号 1」只按 `@stayloop-test.local` 域名计；两套定义都自洽，但正式发布前若清理 `[TEST]` 数据，建议统计也按 `test_account` 剔除。
- `auth.users` 今日 18:26Z 新增的 `mo***@stayloop-test.local` 由其他测试员创建（README 规定不建账号），见 A 文件「越界」。

## 数据副作用

无写入：admin-test 只登录与只读浏览；`PATCH` 两次都未命中任何行（400 与 0 行更新）。`agent_audit_events` 会多几条 admin-test 的 `*_session_started`。
