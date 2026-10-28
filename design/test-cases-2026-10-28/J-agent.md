# J · 经纪工具（R2）· 全站测试 2026-10-28

测试员 ④。账号：agent-test（RECO 已核、公开主页已开）、landlord-test（发起 MLS® 交接）、muse-agent（被选中的承接经纪——选经纪弹窗第一张是它，脚本点了第一张；两位都是 `[TEST]` 认证经纪，流程等价）。
依据：10-17 基线 J-01 / 02 / 15 / 16 抽样 + 10-21/23「经纪公开主页 `/agents` `/agents/[slug]` + 头像上传」+ 10-22「经纪挂 MLS® 交接」（`listing_syndications`、`/api/listings/mls-handoff`、`MlsHandoff` / `MlsHandoffBoard`）。守卫 `v08_mlsHandoff`、`agentPhoto20261023`、`agentPublicProfile`。
方法：playwright（`J/agent.mjs` `J/mls.mjs` `J/mls3.mjs` `J/anon.mjs`）+ curl（JWT 只在 header 文件）+ SQL 只读。

## 用例

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| J-01 | R2 | agent-test | `/agent/verify` | 「RECO 注册已核」；无证件上传、无 SIN 字段（只有头像一个 file input） | activeRole |
| J-02 | R2 | agent-test | `/agent/clients` | 真实行、无 `sample-chip`；MLS 看板只在有记录时出现 | lifecycleP2 · v08_mlsHandoff |
| J-03 | R2 新 | agent-test | `/agent/verify` 公开主页段 | `agent-public-profile-toggle` 已勾、`agent-public-profile-view` 指向 `/agents/test-agent-person-4388` | agentPublicProfile |
| J-04 | R2 新 | agent-test | 头像上传入口 | `agent-photo-control` + `agent-photo-pick`「上传照片」+ `agent-photo-file accept=image/jpeg,png,webp`（不实际上传） | agentPhoto20261023 |
| J-05 | R2 新 | 匿名 | `/agents` 目录 | 列出 agent-test 卡（RECO 已核、语言、专长、区域） | agentPublicProfile |
| J-06 | R2 新 | 匿名 | `/agents/test-agent-person-4388` | 公开页：姓名 / 经纪公司 / RECO 号 + 核验声明 + 「在 RECO 核实」；站内计数；**无邮箱 / 电话**；「登录后联系」；无横向溢出 | agentPublicProfile |
| J-07 | R2 | 匿名 | `/delegate/not-a-real-token-1028` | 友好页「链接无效或已使用 · 只能用一次；请让经纪重新发起」，`Referrer-Policy: no-referrer`，200 不泄露 | node5Matters |
| J-08 | R2 新 | landlord-test `/dashboard` | 77 Sitetest 行「再找经纪挂牌」→ 弹窗选经纪（pick 模式） | 弹窗说明交接规则；卡片只有一个动作、**不显示邮箱电话**；选中后行变「待经纪挂牌 · <经纪>」；`listing_syndications` 新行 requested；`agent_client` 对话首条消息带房源页链接；经纪收到通知；审计 `mls_handoff_requested` | v08_mlsHandoff |
| J-09 | R2 新 | 承接经纪 `/agent/clients` | 看板出现该请求 → 填挂牌号 `C1028TEST` + https 链接 →「已挂牌，填回」 | 行变「已挂牌 · MLS® C1028TEST · 查看挂牌 ↗ · 填回于…」；`POST posted 200`；对话里 system 行「已挂牌 MLS® C1028TEST · 链接」；经纪消息列表看到；审计 `mls_handoff_posted` | v08_mlsHandoff |
| J-10 | R2 新 | J-09 | 公开 `GET /api/listings/<slug>` | posted 时返回 `mls{external_id, external_url, agent{name, brokerage, slug}}`；撤下后为 null | v08_mlsHandoff |
| J-11 | R2 新 | 承接经纪 | 「已从 MLS® 撤下」（`POST removed`）→ 再 `posted` | removed 200；再 posted 409；匿名 POST 401 | v08_mlsHandoff |
| J-12 | R2 新 | 各 JWT | `listing_syndications` SELECT 范围 / INSERT | agent-test 只见署名自己的行；tenant 直插 42501 | v08_mlsHandoff |
| J-13 | R2 新 | agent-test | 请求发给 muse-agent 时 agent-test 的看板 | 不出现（只看署名自己的） | v08_mlsHandoff |
| J-16 | R2 | agent JWT | `select=confirm_token` on `delegations` | 42501；显式列可读 | node5Matters |

## 执行记录（2026-10-28 18:38–19:01 UTC）

| ID | 实际 | 证据 | 结果 |
|---|---|---|---|
| J-01 | 「RECO 注册已核」；页面 `input[type=file]` 1 个 = 头像；无证件上传；页面文字只有「No ID upload, no SIN」声明，没有 SIN 字段 | `J/agent.log`、`J/verify.png` | 通过 |
| J-02 | 「我的客户 · 真实记录 · 5」5 行真实客户，`sample-chip 0`；无 MLS 记录时 `mls-handoff-board` 不渲染 | `J/clients-before.png` | 通过 |
| J-03 | toggle `checked`、view 链接 `/agents/test-agent-person-4388`（slug 输入框显示为空但链接正确——slug 字段当时未回填，截图可查） | `J/agent.log` | 通过（slug 输入空值见观察） |
| J-04 | `agent-photo-control` 在、「上传照片」、accept `image/jpeg,image/png,image/webp`；当前无照片（首字母头像） | `J/verify.png` | 通过（未上传） |
| J-05 | `/agents` 一张卡：AP · [TEST] Agent Person · 地产销售代表 · [TEST] Example Realty Inc. · ✓ RECO 注册已核 · 普通话 · 英语 · 帮租客找房 · 帮房东出租 · North York… | `J/agents-dir.png` | 通过 |
| J-06 | 标题「[TEST] Agent Person · 地产销售代表 · [TEST] Example Realty Inc., Brokerage · Stayloop」；RECO #9990001 · 核于 2026/9/22 ·「核验 = 该日在 RECO 公开注册库上处于注册状态，不是 Stayloop 的背书」· 在 RECO 核实 / 向 RECO 投诉；站内计数 5 客户 / 1 委托 / 0 在租；邮箱 0、电话 0；「登录后联系」；末尾免责「Stayloop 不是经纪公司，不参与交易，不收取佣金或转介费」；scrollWidth 1280 | `J/agent-public.png`、`J/anon.mjs` 输出 | 通过 |
| J-07 | 200 + `referrer-policy: no-referrer`；渲染后「链接无效或已使用 / 委托确认链接只能用一次；请让经纪重新发起。」无经纪 / 客户信息 | `J/delegate-bad.png`、`J/del.hdr` | 通过 |
| J-08 | 房东 `/dashboard` 两行 MLS®（77 Sitetest「已撤下 · 再找经纪挂牌」、100 Test Ave「未挂牌 · 让认证经纪帮我挂到 MLS®」）；弹窗「挂到 MLS® · 选一位 Stayloop 认证的经纪」+ 规则句「…Stayloop 不派单、不参与交易、不收费，也不读取任何 MLS® 数据」；两张卡（Muse Agent / Agent Person）各一个「请这位经纪挂牌」，`hasEmail false / hasPhone false`；选第一张 → 行「待经纪挂牌 · [TEST] Muse Agent · 对话 · 撤回请求 · 已发给 …对话在「消息」里」；DB `listing_syndications 8dbb1a10… requested`（agent muse-agent df0dd970、client ef0c2201、thread 3d7f12cd）；线程首条消息（房东 · 「请帮我把这套房源挂到 MLS®：[TEST] 77 Sitetest Rd, Toronto。房源页：https://www.stayloop.ai/listings/test-77-…」双语）；`message_deliveries` push skipped + email sent（stayloop.ai）；审计 `mls_handoff_requested {new_client true, syndication_id}` | `J/mls.log`、`mls-1-picker.png`、`mls-2-requested.png`、SQL | 通过 |
| J-09 | muse-agent `/agent/clients` 看板「MLS® 挂牌交接 · 房东请你把房源挂到 MLS®…」行「待经纪挂牌 · [TEST] 77 Sitetest Rd · 请求于 2026/10/28 · 和房东对话 · 已挂牌，填回 · 无法承接」；填 `C1028TEST` + realtor.ca 链接 → 按钮可用 → `POST 200 {ok, row.status posted, posted_at 18:59:34}` → 行「已挂牌 · MLS® C1028TEST · 查看挂牌 ↗ · 填回于 2026/10/28 · 已从 MLS® 撤下」；经纪 `/messages` 第一行「Test Landlord 2 · 房东 · 经纪委托 · 系统：已挂牌 MLS® C1028TEST · https://www.realtor.ca/…」；审计 `mls_handoff_posted` | `J/mls3.log`、`mls-3-agent-board.png`、`mls-4-posted.png`、`mls-5-agent-messages.png` | 通过 |
| J-10 | posted 时 `GET /api/listings/test-77-sitetest-rd-toronto-x2xa` → `mls {external_id C1028TEST, external_url, agent {name [TEST] Muse Agent, brokerage, slug null}}`；removed 后 → `null` | curl 输出 | 通过 |
| J-11 | muse-agent `POST removed` 200（status removed、`mls_handoff_removed` 审计）；再 `posted` → 409；匿名 POST → 401 | curl | 通过 |
| J-12 | agent-test `select id,status,agent_auth_id` 只回 1 行（10-23 自己那条 removed）；tenant INSERT → 42501 | curl | 通过 |
| J-13 | 请求发给 muse-agent 期间 agent-test 的 `/agent/clients` 无看板（0 行） | `J/agent.log` | 通过 |
| J-16 | `select=confirm_token` → 42501；`select=id,status` → 2 行 revoked | curl | 通过 |

**汇总**：14 条全部执行、全部通过，0 缺陷。MLS® 交接状态机走完 requested → posted → removed（房东发起 · 经纪填回 · 经纪撤下），公开房源接口随之出现 / 消失 `mls` 块。

## 观察（非缺陷）

- **muse-agent 会话中途消失**：18:49 登录后看板正常；18:52 同一 profile 再开页面被送回首页，`auth.sessions` 里 muse-agent 0 行，API 401 `sign_in_required`——四个 muse-* 账号是「第二套四身份」多组共用，另一组在别处退出就全局作废（README 已警告）。19:00 重新铸链接后 30 秒内跑完。建议主线程给每组分配不同的 muse 号或禁止点退出。
- muse-agent 首次进入弹「服务条款更新」（`terms-consent-gate`，`TERMS_VERSION` 变过）；接受后正常。agent-test / landlord-test / tenant-test 本轮没弹。
- `/agent/verify` 的 `agent-public-profile-slug` 输入框读出来为空字符串，但「看主页」链接与 DB `profile_slug` 都是 `test-agent-person-4388`；可能是输入框只显示用户自定义的 slug、自动 slug 留空——如果是设计，加一行占位提示会更清楚。
- 选经纪弹窗把 muse-agent 排第一（agent-test 第二），排序规则没看出来（都是 verified、同经纪公司）；无害。
- 10-17 的 J-D1～J-D6 未复测（本轮不在抽样范围）。

## 数据副作用

- `listing_syndications` 新行 `8dbb1a10…`（listing c608689e 77 Sitetest · mls · requested → posted C1028TEST → **removed**，公开页已不显示）；`agent_clients` 新行 `ef0c2201…`（muse-agent ↔ landlord-test，`new_client true`）；线程 `3d7f12cd…`（房东首条 + 2 条 system 行：已挂牌 / 已撤下）；`message_deliveries` 若干（email sent 到 muse-agent@ / landlord-test@，push skipped）；审计 `mls_handoff_requested / posted / removed`。
- 邮件：MLS 请求通知 1 封（muse-agent@）+ 填回 / 撤下通知 ≤2 封（landlord-test@）。
- muse-agent 接受了一次服务条款（`terms_accepted` 版本更新）。
- 未上传头像、未建委托、未建收件链接。
