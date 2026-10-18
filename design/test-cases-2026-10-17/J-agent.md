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

（执行后填）
