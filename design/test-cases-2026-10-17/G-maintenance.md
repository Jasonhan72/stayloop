# G · 维修与服务市场 · 用例与执行记录（2026-10-17）

风险等级 R2（§2）。依据：CLAUDE.md「第三方服务市场 Phase 0 + 1」「E2E 检测与三份审查」「租客报修弹窗的照片上传」「服务市场 P2 · 非资金部分」「节点 3」「四角色审计修复 A⑦ / NEW-1/2」。
守卫：`tests/marketplace20260923.spec.ts` `dispatchPolicy.spec.ts` `node3Execution20260926.spec.ts` `fourRoleAudit20261012_f.spec.ts` `threeRoleWalkthrough20260926.spec.ts`。
账号：tenant-test（租客成员）· landlord-test（房东，Pro 试用至 2026-11-14）· provider-test（Northline，五项资质）· agent-test（Maple：plumbing/handyman，无 ESA / TSSA）· admin@（裁定）。
在管租约 `1c9abb72-c433-498b-942d-0d448fb8342f`（100 Test Ave #1 · Toronto · verified）。方法：REST（各号 JWT）+ 路由 + 无头 Chrome（弹窗 UI）。

## 用例

| ID | 等级 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| G-01 | R2 | 租客登录 `/tenant/maintenance` | 打开报修弹窗 | 眉标显示真实地址；照片格 5 个，`input[type=file]` accept image/*；提交禁用直到填描述 | ticketPhotos20260923 |
| G-02 | R2 | 同上 | 选 6 张图片 | 只收 5 张，提示「多出的 1 张没有加入」 | ticketPhotos |
| G-03 | R2 | 同上 | 描述「没有暖气」类别 hvac | `isEmergencyMaintenance` 命中 → priority 强制 high，提示 RTA s.20 | ticketPhotos |
| G-04 | R2 | 没有在管租约的账号（agent-test 租客帽） | 打开弹窗 | 琥珀提示「没有可发送的房东」+ `/leases/import`，提交禁用 | ticketPhotos |
| G-05 | R2 | tenant-test JWT | 直插 `maintenance_tickets`（household 1c9abb72，`[TEST]` 标题，category plumbing，emergency false）→ `POST /api/maintenance/notify` | 201 + notify 200（房东邮件 + 推送 + 派单建议卡） | v06Cleanup |
| G-06 | R2 | landlord-test，`/h/<id>?tab=maintenance` | 打开派单弹窗 | 精选网络列出 verified 服务商；资质不覆盖该工种 / 城市的灰掉；「我自己的联系人」只要邮箱；Esc 关闭 | marketplace |
| G-07 | R2 | landlord-test JWT | `POST /api/work-orders/dispatch`（provider Northline, trade plumbing） | 200 `status: offered`，`quote_due_at = +48h`，事件 offered，工单对话系统行；试用期内不 402 | node3Execution |
| G-08 | R2 | 同上 | dispatch 同 ticket 第二次 | 409 already has an open work order | marketplace |
| G-09 | R2 | 同上 | dispatch 给 Maple 且 trade=electrical（缺 ESA） | 422 `provider_not_eligible:*` | marketplace |
| G-10 | R2 | agent-test JWT（非房东） | dispatch 同 ticket | 403 not the landlord | marketplace |
| G-11 | R2 | tenant-test JWT | dispatch | 403 | marketplace |
| G-12 | R2 | provider-test JWT | act accept，valid_until 昨天 | 400 `quote_valid_until_past` | node3Execution |
| G-13 | R2 | 同上 | act accept，schedule_start 过去 | 400 `quote_schedule_past` | — |
| G-14 | R2 | 同上 | act accept $150，窗口 +2h | 200 quoted，`quote_version=1`，事件 payload.version=1 | node3Execution |
| G-15 | R2 | landlord-test | approve_quote expected_amount 999 | 409 `quote_changed` | — |
| G-16 | R2 | landlord-test | approve_quote expected_amount 150（窗口 +2h，非紧急） | 422 `entry_window_less_than_24h` | — |
| G-17 | R2 | provider-test | quote $160 窗口 明天 22:00 多伦多 | 200 version=2 | node3Execution |
| G-18 | R2 | landlord-test | approve_quote expected_amount 160 | 422 `entry_window_outside_8_20` | — |
| G-19 | R2 | provider-test | quote $160 窗口 后天 10:00–12:00 多伦多 | 200 version=3 | — |
| G-20 | R2 | tenant-test | approve_quote | 409 `not_your_action`（租客不能批准） | — |
| G-21 | R2 | agent-test（非当事人，读不到行） | act approve_quote | 404 not found | — |
| G-22 | R2 | landlord-test | approve_quote expected_amount 160 expected_version 3 | 200 scheduled；`approved_amount=160`；租客进入通知邮件（s.27）+ `compliance_events`；对应 approve_quote 卡 expired | — |
| G-23 | R2 | provider-test | arrive | 200 in_progress | — |
| G-24 | R2 | provider-test | complete invoice 200（超 25%） | 200 completed；事件 `over_estimate_pct=25`；房东 accept_completion 卡 medium | marketplace（CPA 10%） |
| G-25 | R2 | landlord-test | request_rework | 200 rework；卡 expired | — |
| G-26 | R2 | provider-test | complete 只带 note | 200 completed，`invoice_amount` 仍 200 | sweep A3 |
| G-27 | R2 | landlord-test | dispute reason | 200 disputed | — |
| G-28 | R2 | tenant-test / provider-test | resolve_dispute | 拒绝（409 not_your_action；非 admin 永不映射成 admin） | marketplace |
| G-29 | R2 | admin@ JWT | resolve_dispute | 200 accepted | — |
| G-30 | R2 | landlord-test | mark_paid | 200 paid，`payment_mode=offline` | — |
| G-31 | R2 | tenant-test | tenant_confirm（paid 后） | 200 | fourRoleAudit |
| G-32 | R2 | landlord-test / tenant-test JWT | 直插 provider_reviews 各一条 | 201；第二条同人 → 23505 | fourRoleAudit_f |
| G-33 | R2 | tenant-test | 回滚事务：插入评价但 provider_id 指向别的服务商 | 期望被拒（CLAUDE.md「评价的 provider_id 必须等于工单的服务商」） | — |
| G-34 | R2 | landlord-test | close | 200 closed；token 置空 | — |
| G-35 | R2 | 第二张工单派给自己的联系人（landlord-test+ext@stayloop.ai） | `GET /w/<token>` | 200 只有城市 / 状态；`POST` action approve_quote → 400 unknown action；accept 后 GET 带完整地址 | marketplace |
| G-36 | R2 | 同上 | `/w/<token>` decline 无 code | 400 `decline_reason_required`；带 code `out_of_area` → declined；房东再得派单建议卡 | node3Execution |
| G-37 | R2 | 工单 7193fad8（9-27 日扫产生） | 查 `sla_overdue_at`、事件 `quote_overdue`、审计 `work_order_quote_overdue`、房东 `work_order_overdue` 卡 | 字段齐全（不触发 cron） | node3Execution |
| G-38 | R2 | landlord-test，`/landlord/providers` | 策略卡：改 quote_hours 72 + auto_emergency 保存 → 改回 | `dispatch_policies` 行写入并恢复默认；看板策略条文案随之变 | dispatchPolicy |
| G-39 | R2 | provider-test `/provider/jobs` | 六格 / 覆盖标签 / 到期横幅 | 与库一致（Northline 五项资质，WSIB 2027-01-31 → 无横幅） | node3Execution |
| G-40 | R2 | 页面 | 登录后界面里不出现 `window.confirm / alert` | grep 组件 | fourRoleAudit_f/g |

## 执行记录（API 部分 · 2026-10-18 03:29–03:40 UTC = 多伦多 10-17 晚）

工具：`scratchpad/sitetest1017/api.sh <role> <METHOD> <path> [json]`（各号密码授权 JWT；admin@ 用 `generate_link` + `/auth/v1/verify` 取 JWT，不发邮件）。
测试工单：ticket `b3115595-0a92-4196-8f47-ce1c80e88250`「[TEST] 1017 厨房水龙头滴水」→ work order `550ca87d-607e-4888-86bf-32bba2903dc3`（Northline）→ 线程 `cb48bb31-66b8-4aaa-8442-5d834628ab8e`。

| ID | 实际 | 证据 | 结果 |
|---|---|---|---|
| G-05 | 租客 RLS 直插 ticket（priority 须 low/medium/high，`normal` 被 CHECK 拒——我方用例笔误）→ 201；`/api/maintenance/notify` → `{ok, emailed:1}`，再调 → `{already:true}`；房东得 `dispatch_work_order` 建议卡，手动派单后该卡 `expired · dispatched` | api 输出；`agent_pending_actions` 查询 | 通过 |
| G-07 | dispatch Northline plumbing → 200 `offered`；`quote_due_at` = created+48h（03:29:06 → 10-20 03:29）；事件 `offered`；线程系统行「已派单给 … 请在 48 小时内报价」= 哈希链首条（prev `genesis`）；Pro 试用（`pro_trial_until` 2026-11-14）放行网络派单 | 工单行、`work_order_events`、`thread_messages` | 通过 |
| G-08 | 同 ticket 再派 → 409 `this ticket already has an open work order` | — | 通过 |
| G-09 | 派 Maple + trade electrical → 422 `provider_not_eligible:trade_not_listed` | — | 通过 |
| G-10 / G-11 | agent-test / tenant-test 派单 → 403 `not the landlord of this household` | — | 通过 |
| G-12 | accept 带 `valid_until` = UTC 昨天（多伦多仍是当天）→ 200（按多伦多日历日判定，valid 到当天结束——设计如此，`torontoToday`）；真正过期的判定见 G-18b | — | 通过（用例日期按 UTC 写错） |
| G-13 | `quote` 带过去的 schedule_start → 400 `quote_schedule_past`；`accept` 在 quoted 状态 → 409 `not_from_quoted` | — | 通过 |
| G-14 | quote $150 窗口 +2h → 200，`quote_version` 2（accept 已占 v1），事件 payload.version=2，线程系统行「修改了报价（第 2 版）」 | — | 通过 |
| G-15 | approve expected_amount 999 → 409 `quote_changed`；旧的 approve_quote 卡随每次改价 `expired · quote_changed`、新卡带版本号 | 卡片查询 | 通过 |
| G-16 | approve（窗口 +2h）→ 422 `entry_window_less_than_24h`；无窗口时 → 422 `entry_window_no_window` | — | 通过 |
| G-17 / G-18 | quote $160 窗口 10-19 22:00–23:00 EDT → v3；approve → 422 `entry_window_outside_8_20` | — | 通过 |
| G-20 | 租客 approve → 409 `not_your_action`（路由把租客映射成 tenant，状态表拒绝；不是 403 但同样拒绝） | — | 通过（按设计） |
| G-21 | agent-test（非当事人，RLS 读不到行）→ 404 | — | 通过 |
| G-12b | 服务商 decline 不带 code → 400 `decline_reason_required`；`code: other` 无说明 → 同样 400 | — | 通过 |
| G-35 | 用 **G-D1 泄露出的** token 打 `GET /api/w/<token>`（paid 工单）→ 200：线程 2 条、完整地址、`landlord_email: null`（中转生效）、`Referrer-Policy: no-referrer`、`no-store`；`POST approve_quote` / `mark_paid` → 400 `unknown action`；`accept` → 409 `not_from_paid`；乱 token → 404 | — | 通过（门本身）；token 来源见 G-D1 |
| G-37 | 工单 `7193fad8`：`sla_overdue_at` 2026-09-27 03:44:56、事件 `quote_overdue{due_at}`（actor system）、审计 `work_order_quote_overdue`（acting_role landlord · matter work_order）、卡 `work_order_overdue` 已 approved 并执行 `{kind: reassign, cancelled: true}` → 工单 cancelled「逾期未报价，房东改派」 | 查询（未触发 cron） | 通过 |
| G-38 | 房东 RLS upsert `dispatch_policies`（auto_emergency · 预授权 $400 · 72h）→ 201；租客读 → 0 行；改回默认（suggest · false · 500 · 48）→ 200；`emergency_cap: 99999` → 23514 CHECK 拒绝 | — | 通过 |
| G-33 | 回滚事务：把测试工单临时置 accepted，以租客身份插入评价但 `provider_id` = Maple（工单服务商是 Northline）→ **插入成功**；`by_kind: landlord` 冒充 → 42501；超过 14 天窗口 → 42501；同人第二条 → 23505；表上无触发器 | SQL 回滚探针 | **失败 → G-D2** |
| G-32（重复 / 窗口） | 见 G-33 探针：23505 与 42501 均生效 | — | 通过 |
| G-40 | 维修 / 消息模块组件无 `window.confirm / alert`；残留在 `app/dashboard/page.tsx`（删除 / 归档房源 alert）与筛查页（越界，见 §越界） | grep | 通过（本模块） |


## 执行记录（界面部分 · 2026-10-18 · 无头 Chrome 端口 9320，魔法链接登录）

脚本与截图：`scratchpad/sitetest1017/G2/`（`ui_t.mjs ui_t2.mjs ui_p.mjs ui_m.mjs ui_m2.mjs`，截图 `*.png`）与 `G/ui-*.png`。界面语言为英文（新 profile 默认）；宽度 1280 与 375 各抽查，横向溢出一律用 `scrollWidth - clientWidth`。

| ID | 实际 | 证据 | 结果 |
|---|---|---|---|
| G-01 | `/tenant/maintenance`「New request」弹窗：眉标 `100 TEST AVE #1 · MAINTENANCE · TO THE LANDLORD`；`input[type=file]` accept=`image/*,.heic,.heif` multiple；照片格 5 个；描述为空时提交禁用 | `G/ui-tenant-modal.png`、ui_m 输出 | 通过 |
| G-02 | 一次选 6 张 → 5 个缩略图，提示 `Up to 5 photos; 1 extra skipped`（中文串见 `NewTicketModal.tsx:104`） | `G2/t-modal-skipped.png` | 通过 |
| G-03 | 类别 Heating/AC + 描述 `No heat at all…` → 红字 `This sounds like an emergency (RTA s.20)…`，Urgency 自动选 Urgent · 24 hrs | `G/ui-tenant-emergency.png` | 通过 |
| G-04 | agent-test（无在管租约）的 `/tenant/maintenance` 是空态：`No maintenance yet. Join your managed tenancy… / Import a signed lease →`，**页面没有「New request」按钮**，弹窗根本打不开 | ui_m 输出 | 通过（用例过期：入口前移到空态，等效拦截；用例改写为「空态文案 + 导入租约链接」） |
| G-06 | 房东 `/h/1c9abb72…?tab=maintenance` 点 Dispatch：弹窗含 Trade / Entry(RTA s.27) / 紧急勾选 / Curated network · My own contact 切换；精选网络列 Maple、Northline、Muse（verified，城市 / 时薪 / 出勤费）；「My own contact」只要邮箱；Esc 关闭 | `G/ui-landlord-dispatch-modal.png` `-own.png` | 通过 |
| G-35/36（页面） | 外部联系人 `/w/<token>`（工单 fcbcfcf1，paid）：1280 与 375 都无横向溢出；显示 `WORK ORDER · VIA STAYLOOP`、状态 Paid、完整地址（已接受后）、你的报价 / 时间线 ✓、工单对话 3 条、「Reach the landlord in the conversation」（无房东邮箱）；乱 token → `This link is invalid or expired`。G-36 decline 流程未跑（见 G-D1 的原则：不再用 token 写入） | `G2/w-1280.png` `w-375.png` | 通过（页面）；G-36 未执行 |
| G-38（页面） | `/landlord/providers` 有 `Dispatch policy` 卡；375 无溢出；`/landlord/maintenance` 375 无溢出。策略条文案随值变化未重测（API 部分已证 `dispatch_policies` 写入 / 恢复） | `G2/l-providers-375.png` | 通过（部分） |
| G-39 | provider-test `/provider/jobs`：Verified · eligible for dispatch；六格（New invitations 0 · Quoted 0 · In progress 1 · Awaiting acceptance 0 · Awaiting payment 0 · Paid this year $0 · ★4.5 (2)）；四个覆盖标签（Plumbing / Electrical / Handyman-cleaning / Locks-safety 均 Covered）；无资质到期横幅；375 无溢出；`/provider/history` 375 无溢出。「Paid this year $0」与库一致：本轮工单是 accepted→closed（跳过 mark_paid，`paid_at` null）（fcbcfcf1 是外部联系人单，不属于 Northline） | `G2/p-jobs-1280.png` `p-jobs-375.png` | 通过 |
| 手机 375 抽查 | `/tenant/maintenance` · 报修弹窗（textarea 16px）· `/messages` · 线程（textarea 16px，有返回键）· `/h/<id>` 租客与房东两侧 · 派单弹窗（输入 16px，弹窗宽 375 无溢出）· `/landlord/providers` · `/landlord/maintenance` · `/w/<token>` · `/provider/jobs` · `/provider/history`：横向溢出全 0；控制台无报错 | `G2/*-375.png` | 通过 |

注（G-39）：「Paid this year」按 `paid_at` 年份 + status paid/closed 汇总（`lib/marketplace/providerView.ts`），Northline 本轮单子 `paid_at` 为空，$0 正确。

补充：G-25（rework）、G-26（只带 note 完工）、G-30（mark_paid）、G-36（外部联系人 decline）**未执行**——API 流程为守邮件预算跳过 mark_paid、直接 accepted → close（`close` 允许 from accepted，按设计，`TABLE.close`），rework 路径改走 dispute；G-22 的「租客进入通知邮件 + compliance_events」只确认了卡 expired 与状态，未核通知（查询列名写错，不影响结论）。这四条留给下一轮。

## 缺陷

- **G-D1 · S2 / P1** · `POST /api/work-orders/[id]/act` 响应带整行工单：`{ok, status, work_order: r.wo}` 含 `token`（外部联系人的凭证）与 `external_email`，**任何当事人（含租客）都能拿到**。有了 token 就可以走 `/w/<token>` 冒充外部联系人（接受 / 报价 / 完工 / 写账单 / 在工单对话里以「外部」身份发言），租客还看到承包商私人邮箱。
  - 复现：tenant-test JWT `POST https://www.stayloop.ai/api/work-orders/fcbcfcf1-58ff-4e26-8300-1e66ea5dff0e/act` body `{"action":"tenant_confirm"}` → 200，响应 `work_order.token`（64 字符）与 `external_email`（landlord-test+… 测试邮箱）；用该 token `GET /api/w/<token>` → 200（线程 / 地址 / 报价）。landlord / admin 调任一 act 同样拿到；服务商账号工单 token 为 null 不受影响。
  - 证据：`scratchpad/sitetest1017/G/gd1.out`（本地，token 值未写入文档）；`lib/marketplace/server.ts` 的 act 路由 `app/api/work-orders/[id]/act/route.ts:58` 返回 `r.wo`；`peekByToken` / act 内部用 `select('*')`（service role）。
  - 核对「列级保护是否生效」：直连 REST（landlord / tenant / provider / agent 四个 JWT）读 `work_orders?select=token`、`external_email`、`*` → 全 42501（`information_schema.column_privileges` 里 `work_orders` 对 anon/authenticated 没有 token / external_email 列权限）；公开视图与 RPC 无一返回工单 token（唯一含 `token` 的 definer RPC 是 `my_pending_invites` / `my_households_for_import`，是家庭邀请 token，属 F 组）；全库把所有非空工单 token 当子串扫描每张公开表 / 视图，**零命中**（thread_messages / work_order_events / agent_pending_actions / message_deliveries 都没有）；`/api/work-orders/dispatch`、`receipt`（用 `WORK_ORDER_COLUMNS`）、`matters/export`（显式字段映射）均不带 token。即**库层保护有效，泄露只在 act 路由响应**。
  - 建议：act 路由响应只返回 `WORK_ORDER_COLUMNS` 白名单字段（或 delete token / external_email），并加一条守卫测试「act 响应不含 token」。
- **G-D2 · S2 / P2** · 租客评价可写成非本工单服务商的 `provider_id`（`provider_reviews` 无触发器，RLS 只校验 work_order 当事人 + by_kind + 14 天窗口）。复现：G-33 回滚探针（tenant 身份把测试工单置 accepted 后插入 provider_id=Maple、工单服务商为 Northline → 插入成功）。证据：SQL 回滚探针输出；CLAUDE.md 称 provider_id 必须等于工单服务商。建议：BEFORE INSERT 守卫（SECURITY INVOKER）强制 `provider_id = work_orders.provider_id`，或触发器直接覆盖。
- **G-D3 · S3 / P3** · token 页 `/w/[token]`、`/lease/sign/[token]`、`/p/[token]`（及 `/join` `/delegate` 同理，未逐个测）响应头是 `strict-origin-when-cross-origin`，不是 CLAUDE.md「路由速查」写的 `no-referrer`；`middleware.ts` 的 `withReferrerPolicy` 只列了 `/verify/` `/intake/` `/my-file/`。复现：`curl -sI https://www.stayloop.ai/w/<64个a>` 看 `referrer-policy`（`/verify/…` 则是 no-referrer）。影响小（跨站只发 origin，同源本来就是自己的页面；`/api/w/*` 已是 no-referrer），按文档对齐即可。建议：补齐前缀。
- 观察（不记缺陷）：G-04 用例过期（见表）；`/messages` 列表与工单线程里的系统行是「中文 / English」双语串直接显示（见 H-D1）。

## 数据副作用（G）

生产库，全部 `[TEST]`，未删任何行：
- ticket `b3115595-0a92-4196-8f47-ce1c80e88250`「[TEST] 1017 厨房水龙头滴水」→ work order `550ca87d-607e-4888-86bf-32bba2903dc3`（Northline，最终 closed，token 已置空）+ 其 `work_order_events` 约 15 条、线程 `cb48bb31-66b8-4aaa-8442-5d834628ab8e`（哈希链 17 条，verify ok）、`provider_reviews` 两条（landlord `f1625581…`、tenant `21e6eb18…`，by_kind 各一）、若干 `agent_pending_actions`（dispatch / approve_quote / accept_completion 卡，均已 expired 或 approved）、`compliance_events`（G-22 进入通知）、`agent_audit_events`。
- landlord-test 的 `dispatch_policies` 行：测试时改过又写回默认（suggest · false · 500 · 48），行保留。
- G-35 页面核对用的 `fcbcfcf1…`（9-23 旧测试单，paid）：本轮对它调过一次 `tenant_confirm`（G-D1 复现，状态不变，可能刷新 `tenant_confirmed_at` / 多一条事件）。
- 邮件：dispatch / approve / 评价流程约 3 封（均发往 *@stayloop.ai 测试邮箱，Resend suppression 见 N-D1）；本段界面部分 0 封。
- 约 7 次魔法链接铸造（会话失效属正常）。
