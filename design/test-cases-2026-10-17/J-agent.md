# 模块 J · 经纪工具（R2）· 全站测试 2026-10-17

测试员：I+J 组。账号：agent-test@stayloop.ai（RECO 已核，同时持服务商 `[TEST] Maple Plumbing Inc.`）。邮件预算与 I 共用（≤5 封，只发测试号邮箱）。
需求来源：CLAUDE.md「三角色与经纪认证」「分阶段改进 · 节点 5」（委托）「租客筛查只给房东或经纪用」（经纪直接筛查）「V1.0 阶段 2」丙 #13–15「一个账号三顶帽子」「四角色审计修复（2026-10-12 晚）」（NEW-1 撤回二步确认、P1-4 委托邮件）。

## 用例表

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| J-01 | R2 | agent-test 登录 | `/agent/verify` | 显示「RECO 注册已核」徽章（注册号 / 经纪公司 / 核于日期），链到注册库；无证件上传、无 SIN 字段；工作台横幅无「待认证」 | `activeRole` |
| J-02 | R2 | agent-test | `/agent/clients` 客户表 | 真实行存在时不渲染设计样例；列：阶段 / 代表协议日期 / Guide 日期 / 静默天数 / 发起筛查 / 发消息 / 委托 | `lifecycleP2_20260923` |
| J-03 | R2 | agent-test | 新增客户 `[TEST] QA 客户 1017`（房东，邮箱 landlord-test@stayloop.ai） | 行出现；同邮箱再加被拒（已有 `[TEST] 房东客户` 用同邮箱 → 应拒绝，记录行为） | `sweep20261001_*` |
| J-04 | R2 | J-03 | TRESA 四个日期内联：代表协议 / 协议到期 / Information Guide 送达时间 + 方式 / 多重代表同意日 | 写入 `agent_clients`，刷新后保留 | `v1stage2_agentIntake` |
| J-05 | R2 | J-04 | `/agent/tasks` 任务生成 | 缺日期 → 任务；补齐后消失；≥7 天没联系 → 任务（新客户 0 天 → 无）；协议到期 ≤30 天 → 任务 | `v1stage2_agentIntake` `threeRoleReport20260924` |
| J-06 | R2 | 客户无邮箱 | 发消息门：建一个无邮箱客户 `[TEST] QA 无邮箱` | 「发消息」灰显「先补邮箱才能发消息」；有邮箱且无委托 → 按钮可用（agent_client 线程） | `messagingPeople20260930` |
| J-07 | R2 | J-03 客户（landlord-test 邮箱，两个 TRESA 日期齐） | 发起委托（默认范围 / 6 个月）→ 发送确认链接 | 行 pending、审计 `delegation_proposed`、邮件到 landlord-test（计 1 封）、`delegation-link-status` 写「链接已发到 …」；**不确认**（需房东号） | `node5Matters20260927` |
| J-08 | R2 | J-07 | 撤回：点「撤回」→ 出现 `delegation-withdraw-confirm` → 确认 | 二步确认、无原生 confirm；行 `revoked`、审计 `delegation_revoked`；可重新发起 | `fourRoleAudit20261012_f` |
| J-09 | R2 | agent-test | 收件链接：客户表顶部「收件链接」铸一条（label `[TEST] QA 1017`） | `POST /api/agent/intake-links` 201，返回 `/intake/<token>` | `v1stage2_agentIntake` |
| J-10 | R2 | 匿名 | 打开 `/intake/<token>` | 页面显示经纪名 / RECO / 同意文本 `intake-consent`（版本 `agent-intake-v1-2026-10`）；`Referrer-Policy: no-referrer`；匿名上传到 `tenant-files/agent-intake/<link_id>/…` 被允许、别的文件夹（`agent-intake/other/`）403 | `v1stage2_agentIntake` |
| J-11 | R2 | J-09 | 撤销链接 → 再打开 | 页面 `intake-closed`；`GET /api/agent-intake/<token>` 410 | `v1stage2_agentIntake` |
| J-12 | R2 | agent-test | `/agent/checklist` 贴要约文本（押金两个月 + 禁宠 + 随时进入 + 预开支票） | `checklist-findings` 命中 ≥4 条（RTA-106 押金 / RTA-14 禁宠 / RTA-27 进入 / 预开支票）并链 `/rules#<id>`；页面不保存文字；LSA 边界声明 | `v1stage2_offerCheck` |
| J-13 | R2 | agent-test | `/screening/app?as=agent` | 经纪导航（侧栏是经纪页面，不是房东 become 页）；中性说明「这次筛查记在你（经纪）名下…」；有 `?delegation=` 有效时绿色「正在代表」 | `screeningRoleGate20260929` |
| J-14 | R2 | agent-test | Representing 条 | 无有效委托时不显示（J-07 只到 pending）；按设计 | `node5Matters20260927` |
| J-15 | R3 | agent-test | `/agent/tasks` `/agent/calendar` `/agent/earnings` | 空态或示例段带「示例数据」小标签（`sample-chip`）；calendar / earnings 不显示虚构 KPI 当真数；无横向溢出 1280 | `listingsToolbar20261003` `sampleNotice` |
| J-16 | R2 | SQL 只读 | 经纪 JWT 读 `delegations` 的 `confirm_token` | 42501（列级 grant） | `node5Matters20260927` |

## 执行记录

执行：2026-10-18（UTC 03:48 起沿用上一位测试员 10-17 23:47–23:53 的证据，04:30 起补测）。账号 agent-test；无头 Chrome 端口 9341。证据目录 `scratchpad/sitetest1017/IJ/`（沿用）与 `.../J/`（本次）。模型调用 0 次、匿名 AI 对话 0 次；邮件共 1 封（见数据副作用）。

| ID | 实际 | 证据 | 结果 |
|---|---|---|---|
| J-01 | `/agent/verify` 显示「RECO 注册已核 · #9990001」、经纪公司、「核于 2026/9/22」，带「在 RECO 核实」「向 RECO 投诉」链接；无文件输入（0 个）、无 SIN 字段；`/agent/agent` 工作台全文无「待认证」字样 | 沿用 10-17 23:47 `IJ/J-01.png`；本次 `/agent/verify` file input = 0、横幅正则无命中 | 通过 |
| J-02 | 客户表标题「我的客户 · 真实记录」，只渲染 4 条真实行，无设计样例行、无 Mia Chen、`sample-chip` 0；列含阶段 / 代表协议 / Info Guide / 协议到期 / Guide 送达 / 多重代表同意 / 租约到期 / 静默天数 / 发起筛查 / 发消息 / 发起委托；页尾「其余部分仍是产品演示」+ 按钮；1280 无横向溢出 | `J/J-02.png`、`IJ/J-04.png` | 通过 |
| J-03 | 新增 `[TEST] QA 客户 1017`（房东）行出现（DB `8c2c1ae6…`）；注意上一位测试员用的是 `muse-landlord@` 邮箱（`landlord-test@` 已被 `[TEST] 房东客户` 占用）。本次再用 `landlord-test@` 加 `[TEST] QA 重复邮箱`：被拒，提示「⚠ [TEST] 房东客户 · Test Landlord is already in your client table with this email; use 「Edit details」…」，未新增行 | DB agent_clients；`J/J-03dup.png` | 通过（同邮箱拒绝，行为已记录） |
| J-04 | 代表协议 10-01 / 协议到期 11-05 / 多重代表同意 10-02 / 租约到期 11-10 写入，DB 与刷新后一致（`representation_agreement_expires_at=2026-11-05`、`multi_rep_consent_at=2026-10-02`、`lease_end_date=2026-11-10`）。Guide 送达方式 / 时间两列（`info_guide_delivered_at`、`delivery_note`）DB 为空，上一位脚本只在发现输入时才填，未能确认已填写；内联输入框存在（Guide 送达 · 方式与对象） | 沿用 `IJ/J-04.png`；DB 查询 | 部分通过（四日期中三项 + 代表协议确认；Guide 送达时间 / 方式未保存验证，见 J-D3） |
| J-05 | 缺日期 → 任务：`QA 无邮箱` 缺协议到期 / Guide 送达、`Client One` 缺 Guide 日期 / 到期，均出现；在 `QA 无邮箱` 补协议到期 2027-03-01 后该条任务消失，Guide 送达任务仍在；新客户（0 天）无「跟进」任务，20 天 / 24 天静默的两位客户有「Follow up（N days quiet）」；协议到期 18 天 → 有「expires in 18 days」任务；租约 23 天 → 有任务 | `J/J-05a.png`；run4 输出 | 通过 |
| J-06 | `QA 无邮箱` 行与 `Client One` 行：「✉ 先补邮箱才能发消息」灰显，任务页对应「去客户表补邮箱」；有邮箱的 QA 客户 1017 / 房东客户：「✉ 发消息给 …」可点（无委托时可用） | `IJ/J-04.png`、本次 run3 的按钮枚举（有邮箱 2 个按钮 `dis=null`） | 通过（未点发送，避免发信） |
| J-07 | 发起委托（默认范围 listing+matter / 6 个月）→ `POST /api/delegations` 200 `emailed:true`，delegation `1ac63236…` pending；审计 `delegation_proposed`（3:53:08）；UI「待客户确认」+ `delegation-link-status`「链接已发到客户邮箱 · 2026-10-18」；邮件发到 `muse-landlord@`（测试号）而非 `landlord-test@`，因为 J-03 的限制。未确认 | 沿用 10-17 23:53 `IJ/J-07.png`、`IJ/J-api.json`；DB `delegations`、`agent_audit_events` | 通过（邮箱与用例写的不同，属环境约束） |
| J-08 | 撤回：`POST /api/delegations/1ac6…` 200；DB `status=revoked, revoked_at=03:53:12`；审计 `delegation_revoked`（`by:delegate, previous_status:pending`）；行恢复「Propose delegation」可重新发起；`ClientBook.tsx` 注释与代码无原生 confirm，二步确认容器 `delegation-withdraw-confirm` 在组件里存在 | 沿用 `IJ/J-api.json`；DB；代码 `components/agent/ClientBook.tsx:476` | 通过（二步确认的页面截图未留，上一脚本点击了 `delegation-withdraw-confirm button`，依据 DB 判断） |
| J-09 | 收件链接铸造：`POST /api/agent/intake-links` **200**（用例写 201）返回 `link.token` 与 `/intake/<token>`（`f45a7681…`，14 天有效）；审计 `agent_intake_link_created` | 沿用 `IJ/J-api.json`；审计 | 通过（状态码 200 与用例 201 不一致，见 J-D4） |
| J-10 | 匿名（独立 profile）打开 `/intake/<token>`：显示经纪名 `[TEST] Agent Person · 地产销售代表`、经纪公司、`RECO #9990001` + 注册库链接；`intake-consent` 同意段在，`data-consent-version` 来自 API `agent-intake-v1-2026-10`；`Referrer-Policy: no-referrer`（curl -I 实测）；中英两版都渲染；匿名存储上传：`agent-intake/<link_id>/id/x.png` 200，`agent-intake/<别的 uuid>/id/…` 与 `agent-intake/other/id/…` 与缺 kind 层级的路径一律 403（RLS）。用例里写的 `agent-intake/<link_id>/…`（缺 kind 层级）被拒，是路径格式要求三级（`agent_intake_upload_allowed`），按设计 | `J/J-10-zh.png`、`J/J-10-en.png`；storage curl | 通过（中文标题「经经纪收件」措辞见 J-D2） |
| J-11 | 撤销（`action:revoke`）200；再打开：`intake-closed` 出现「这个链接已失效（已撤回、已过期或经纪注册状态变化）」；`GET /api/agent-intake/<token>` **410**；撤销后匿名上传同一路径 403 | `J/J-11.png`；curl | 通过（但撤销后 410 响应与页面仍带经纪名 / RECO 号，见 J-D5） |
| J-12 | 贴要约（押金两个月 + 禁宠 + 随时进入 + 预开支票）：`checklist-findings` 命中 RTA-106 押金、RTA-134 不得收其他押金、RTA-14 禁宠、RTA s.108 预开支票、RTA-27 进入，共 5 条「Not allowed」 + 4 条 O. Reg. 290/98 标准租约项，全部链 `/rules#…`（预开支票链到 `/rules` 无锚点）；声明「不是法律意见……Law Society Act s.1(6)……只在本页使用、从不保存」；localStorage / sessionStorage 无文本残留 | `J/J-12.png`；run4 输出 | 通过（预开支票链接无锚点，S3，见 J-D6） |
| J-13 | `/screening/app?as=agent`：侧栏是经纪页面（`/agent/agent` `/agent/todo` … `/agent/clients` `/agent/tasks` …），不是房东 become；中性说明「这次筛查记在你（经纪）名下……」存在。无有效委托，`?delegation=` 绿色「正在代表」**未验证**（没有已确认委托，需房东号确认，用例要求不确认）。说明条中英文同时出现（见 J-D1） | `J/J-13.png`、`J/J-13-zh.png` | 部分通过（绿色「正在代表」分支未执行） |
| J-14 | 无有效委托（J-07 pending→revoked）：`/agent/agent` 无「正在代表 / Representing」，`[data-testid*=representing]` 0 个 | run4、run7 输出 | 通过 |
| J-15 | `/agent/calendar`「No showings yet…」、`/agent/earnings`「No settlements yet…」均为空态，无虚构 KPI；`/agent/tasks` 为真实任务；三页 1280 无横向溢出（scrollWidth 1280）；空态下方只有「View product demo」，没有示例段所以无 `sample-chip` | `J/J-15-*.png` | 通过 |
| J-16 | agent JWT：`GET /rest/v1/delegations?select=confirm_token` → 403，`42501 permission denied for table delegations`；`select=*` 同样 42501；显式列 `id,status,principal_email,link_emailed` → 200（只返回本人的 2 条）。`agent_intake_links.token` 本人可读（按设计，经纪要复制链接） | `api.sh agent GET …` | 通过 |

汇总：16 条，通过 14，部分通过 2（J-04、J-13），失败 0，未执行 0。

## 缺陷

| 编号 | 严重度 / 优先级 | 一句话 | 复现 | 证据 | 建议 |
|---|---|---|---|---|---|
| J-D1 | S3 / P3 | `/screening/app?as=agent` 的说明条同时显示中文与英文两段（` / ` 连接），中文界面出现英文、英文界面出现中文 | agent-test，语言 zh 或 en，打开该页 | `J/J-13.png`、`J/J-13-zh.png` | 按 `t()` 取一种语言（该页在筛查模块，只加不改：改这一句条幅即可） |
| J-D2 | S3 / P3 | 收件页中文副标题「租赁申请材料 · 经经纪收件」多了一个「经」，读起来不通 | 匿名 `/intake/<token>`，zh | `J/J-10-zh.png` | 改「经经纪收件」为「经纪收件」或「经由经纪」（英文是 VIA YOUR AGENT） |
| J-D3 | S2 / P2（待确认） | 客户行里「Guide 送达（方式与对象）」输入后在 DB 里是空的：`info_guide_delivered_at`、`info_guide_delivery_note` 都为空，TRESA 四个日期里这一项没法确认能保存 | agent-test `/agent/clients`，在 QA 客户 1017 行的「Guide 送达」输入「[TEST] 邮件」+ 回车，刷新 | DB `agent_clients` 8c2c1ae6… 两列均为空；上一脚本是否真的触发保存未留痕 | 手工复测一次；若确认丢失，查 `ClientBook` 该输入的保存时机（回车 / blur） |
| J-D4 | S3 / P3 | 用例写创建收件链接返回 201，实际 200 | `POST /api/agent/intake-links` | `IJ/J-api.json` | 要么改用例要么返回 201；无功能影响 |
| J-D5 | S3 / P3 | 已撤销的收件链接，API 410 与页面仍返回经纪姓名与 RECO 号（持有旧 token 的人都能看到） | 撤销后 `curl /api/agent-intake/<token>` | 410 响应体含 `agent.legal_name`、`reco_number` | 失效态只返回 `state`，页面显示「请联系经纪」不带姓名；RECO 号本是公开信息，所以只是风险低的信息暴露 |
| J-D6 | S3 / P3 | 「预开支票」那条发现链到 `/rules`（无锚点），其他四条都有 `#规则 id` | `/agent/checklist` 贴含 post-dated cheques 的文本 | `J/J-12.png`，链接列表第 4 项 | 给 s.108 加规则 id 与锚点 |

## 越界发现

- `components/agent/PrivateMemorySnapshot.tsx:96` 登录后界面用原生 `confirm()` 忘记记忆条，违反 CLAUDE.md「登录后界面不用原生 window.confirm」（仅代码审阅，未在页面复现；不确定该组件当前挂在哪个页面）。S3。
- 无其他越界；收件页 `/api/agent-intake/<token>` 响应带 `Referrer-Policy: strict-origin-when-cross-origin`，页面本身是 `no-referrer`，按设计。

## 数据副作用

- 经纪 agent-test 名下：`agent_clients` 新增 `[TEST] QA 客户 1017`（邮箱 muse-landlord@，协议到期 11-05 等日期）与 `[TEST] QA 无邮箱`（本次补了协议到期 2027-03-01）。
- `delegations` `1ac63236…`（principal muse-landlord@，已撤回）；邮件 1 封发到 muse-landlord@stayloop.ai（上一位测试员）。
- `agent_intake_links` `f45a7681…` 已创建、已撤销（本次）；`agent_audit_events` 多条（`delegation_proposed`、`delegation_revoked`、`agent_intake_link_created` 等）。
- storage `tenant-files/agent-intake/f45a7681-5f85-4374-958b-7d9115d18a70/id/qa1017-a.png`（1×1 PNG，不能删，已无法再读）。
- 本次未发邮件，未调用模型，未新建 intake 提交。
