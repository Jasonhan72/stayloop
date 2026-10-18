# F · 租约与在管租约 — 用例与执行记录（2026-10-17）

风险等级 R1（策略 §2）。需求来源：CLAUDE.md「Households（在管租约）」「租房全流程…」（`send_lease` / 双签 → household）、「同类问题排查与修复 2026-10-01」（续约接到同一份 household、租金只经 `mark_rent_paid`、households 冻结）、「V1.0 阶段 2」乙 #10、「V1.0 阶段 3」全节、「外省租约的续约触点与在管租约中心」、「节点 1」状态词表、「四角色审计修复」P1-2。
已有守卫：`tests/v1stage3_{rentEvidence,csvReconcile,rentReminders,noticeForms}.spec.ts`、`tests/v1stage2_tenantTools.spec.ts`、`tests/provinceRenewal20261006.spec.ts`、`tests/sweep20261001_A6*.spec.ts`、`tests/node1Facts20260926.spec.ts`、`tests/fourRoleAudit20261012_b.spec.ts`。

账号：landlord-test（房东 `80646b6a…`，household `1c9abb72`，租约 `46b558d0` signed_both 2026-08-01→2027-07-31 $2,450）· tenant-test（成员）· muse-landlord（`fd48f17f…`，household `2abfd3e7` imported 2026-11-01 起、租约 `89fd40b3` 已 sent 给 muse-tenant、`df4cdb86` active 快速录入；申请 `f4a2259b`（muse-tenant → `[TEST] 200 Test QA Lane`））· muse-tenant。
工具：无头 Chrome + CDP（scratchpad `sitetest1017/F/`），REST / 路由用各账号 JWT（密码授权，密码不落盘），只读 SQL。

## 一、用例

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| F-01 | R1 | landlord-test 登录 | 打开 `/landlord/leases` | 分段「生效中 / 已签·待起租 / 已结束」按 `leaseDisplayState` 推导；`46b558d0` 在「生效中」，行号显示 `L-46B5`；无样例数据冒充真实 | node1Facts |
| F-02 | R1 | muse-landlord 登录 | 打开 `/landlord/leases` | `89fd40b3`（sent，11-01 起）与 `9f8184e2`（imported，11-01 起）落在「已签·待起租」或「待签」而非 ACTIVE；`df4cdb86`（active，10-12 起）在「生效中」 | node1Facts |
| F-03 | R1 | muse-landlord | `/landlord/leases/new?application_id=f4a2259b…` | 表单由申请 + 房源预填（租客名 / 邮箱 / 地址 / $2,300）；保存 → 建 draft 行（`application_id` 写入）；再次打开同一 URL → `?edit=<id>&reopened=1` 打开同一草稿、不另建 | sweep A |
| F-04 | R1 | F-03 草稿 | 打开 `/landlord/leases/<id>` | 详情页渲染标准租约、状态 draft、「发送签署」按钮；条款未冻结 | — |
| F-05 | R1 | F-03 | `POST /api/lease/send {lease_id}`（muse-landlord JWT） | 200 `sent_to: muse-tenant@…`；行 status=sent、sign_token 非空、sent_at；审计 `lease_sent_for_signature`；邮件 1 封 | — |
| F-06 | R1 | F-05 | 非房东（muse-tenant JWT）`POST /api/lease/send` 同 id | 403 | review 09-19 |
| F-07 | R1 | F-05 | 匿名打开 `/lease/sign/<token>` | 页面渲染租约全文与签名框（无需登录） | — |
| F-08 | R1 | F-07 | `POST /api/lease/sign {token, name}` 租客签 | 200 status=signed_tenant；再签一次 → `already:true`；审计 `lease_signed_tenant`；房东收到回签提醒邮件 | — |
| F-09 | R1 | F-08 | 租客 JWT 以 `{lease_id, name}` 冒充房东回签 | 403 | — |
| F-10 | R1 | F-08 | muse-landlord `POST /api/lease/sign {lease_id, name}` | 200 `fully_executed:true` status=signed_both；审计 `lease_signed_landlord`；租客收到「Fully signed」邮件 | — |
| F-11 | R1 | F-10 | SQL 只读查 households / members / invites / rent_payments | 新 household（地址 `[TEST] 200 Test QA Lane`，source esign，verified true，current_lease_id=新租约）+ 房东成员 + muse-tenant 邀请 + 首月 `rent_payments(due)` 在第一个应付日（起租日 ≤ 应付日）；审计 `household_created_from_esign`。**不**并入 `2abfd3e7`（地址不同） | sweep A6 |
| F-12 | R1 | F-10 | 再次 `POST /api/lease/send` 同 id | 409 `lease_not_sendable` | — |
| F-13 | R1 | tenant-test 登录 | `/h/1c9abb72…` 四个标签 | 概览（时钟、成员按名字、续约意向面板只对租客显示三按钮）、对话（ThreadPanel）、租金（账期列表）、报修（MaintenancePanel）都渲染；租客看不到「标记已付」以外的房东专属块（CSV 对账、还款计划） | — |
| F-14 | R1 | landlord-test 登录 | `/h/1c9abb72…` 四个标签 | 房东视角：租金页有 CSV 对账块、还款计划草稿（有到期未记录期时）、每期行有「确认」只对非记录人 | — |
| F-15 | R1 | tenant-test JWT | `mark_rent_paid(46b558d0, '2026-10-01', paid_on = 明天)` | 拒绝 `bad_paid_date`（22023）；UI 的日期框 `max=today` | sweep A5 |
| F-16 | R1 | tenant-test JWT | `confirm_rent_payment(46b558d0, '2026-09-01')`（记录人是 tenant-test 自己） | 拒绝 `self_confirm` | v1stage3_rentEvidence |
| F-17 | R1 | tenant-test JWT | `mark_rent_paid(46b558d0,'2026-10-01', '2026-10-05')` 记录 10 月期 → landlord-test JWT `confirm_rent_payment` 同期 | 记录成功 status=late（10-05 > 10-01）；房东确认成功（confirmed_by=landlord）；第二次确认幂等返回同一行；审计 `rent_confirmed` | — |
| F-18 | R1 | F-17 | tenant-test `POST /api/rent/evidence`（同一文件两次；再换文件） | 第 1 次 200 `recorded:false` 带 sha256；第 2 次同哈希 200 `duplicate:true`；第 3 次不同文件 409 `evidence_exists`；`.txt` → 415；无 lease_id → 400；匿名 → 401 | v1stage3_rentEvidence |
| F-19 | R1 | landlord-test 浏览器 | 租金页上传 TD 格式 CSV（BOM、无表头、括号负数、`2026-09-02 E-TRANSFER 2450.00`、`2026-10-03 2450`、一笔 4,900 两期合付） | 识别为 TD、只取入账、每期一笔匹配（9 月 exact、10 月 exact / likely）、两期合付识别、无关入账单列；**只勾 0 期，不提交** | v1stage3_csvReconcile |
| F-20 | R2 | landlord-test | 租金页还款计划草稿 | 有到期未记录期时显示；生成 → `send_message` 待批卡（stage payment_plan），不发邮件；没有未记录期则不显示 | sweep A5 |
| F-21 | R2 | tenant-test | 概览页续约意向点「续约」一次（备注 `[TEST]`） | `renewal_intents` 新行（lease_id=current）；房东视角显示「租客意向：续约」；文案「只是意向不是 N9」 | lifecycleP1 |
| F-22 | R1 | SQL 只读 | 找 QC 租约 / household | 若存在 → `/h/<id>` 不出现 s.38 / N9 / s.58 / 还款计划，意向说明用魁省 leaseEnd；若不存在 → 以守卫 `provinceRenewal20261006` 本地跑作替代证据 | provinceRenewal |
| F-23 | R1 | landlord-test | `/landlord/notices` 选 `46b558d0` | 四张卡等权、无 `?form=` 预选、页首边界文字、送达方式下拉 | v1stage3_noticeForms |
| F-24 | R1 | F-23 N1 | 新租金 $2,600（+6.1%）生效 2027-08-01 送达今日 | block：超 2027 年指导 1.9%（未勾豁免）；改 $2,490（+1.6%）→ 通过；生效日改 2026-12-01 → block 90 天；生效日 < 上次涨租 +12 月（起租 2026-08-01 → 生效 2027-06-01）→ block 12 个月 | 同上 |
| F-25 | R1 | F-23 N4 | 勾 2026-10-01 期，送达今日亲手，终止日 = 今日+3 | 红：早于最早允许（今日+7）；改邮寄 → 最早 = 今日+5+7 | 同上 |
| F-26 | R1 | F-23 N12 | 终止日 2027-03-15（非租期末日） | block；改 2027-07-31 且送达今日 → ≥60 天通过；今日 → 2027-07-31 ≥120 天 → 可勾「免补偿」；who=purchaser → 永不豁免 | 同上 |
| F-27 | R1 | F-23 L1 | N4 终止日 2026-11-10 | 最早申请日 2026-11-11 | 同上 |
| F-28 | R1 | F-23 | 「打开填写稿」 | 新标签 HTML 标「Stayloop 填写稿 · 不是官方表格」+ 官方链接；9 个官方链接 GET 200 且以 `%PDF-` 开头 | 同上 |
| F-29 | R1 | F-23 | 记录送达一次（N4，今日，亲手） | `notice_service_records` 新行（登记副作用），审计 `notice_served_recorded`；页底列出；以 JWT 尝试 UPDATE/DELETE → 拒绝 | 同上 |
| F-30 | R1 | tenant-test | `/tenant/lease` N1 核对：现租 2450、新租金留空 | 「核对」禁用（不出现 −100%）；填 2500 → 结果出现涨幅 2.04% vs 指导；退租工具：固定租约到期 2027-07-31 → N9 最早搬离日；押金 2450 付于 2026-08-01 → 利息按指导比例 | v1stage2_tenantTools |
| F-31 | R1 | landlord-test | `/landlord/finance` | 真实台账 `rent-ledger`：四格 + 表含 2026-09-01（late · 已确认 · 回执）与占位账期（10-01 待付 …），与 `/h/[id]` 租金页列出的期一致；`df4cdb86` 类（无 household）单列孤儿段（对 muse-landlord） | fourRoleAudit b |
| F-32 | R1 | tenant-test | `/tenant/payments` | liveSlot `MyRent` 列出真实账期 + `rent-actions`（记录已付 → `/h/<id>?tab=rent`、在租约对话里问房东）；没有「立即支付 / 托管」 | v1stage1 auditAndDemo |
| F-33 | R1 | SQL `net.http_post` + Vault | 触发 `/api/agent/proactive` cron 模式两次 | 第一次返回 `rent:{…}` / `followups:{sent,skipped}` / 续约计数；第二次新卡 0（幂等）；不新增重复 `rent_overdue` 卡；followups 不发给测试号 | v1stage3_rentReminders / v1stage1_followUp |
| F-34 | R1 | SQL 只读 | `promote_household_leases()` 定义与 `rentSchedule` 占位 | 新 household 首月期 = 第一个应付日；`/h/[id]` 租金页列出的期 = `rentSchedule(start, due_day)` 的期（含「待付」占位）；promote 对 `next_lease_id` 的切换只在起租日后 | sweep A6 |
| F-35 | R2 | 任意 | 375px `/h/[id]` 租金页、`/landlord/notices` | 无横向溢出 | mobile 约定 |

## 二、执行记录（2026-10-17 23:30–23:52 Toronto · 生产 · 脚本与截图 `scratchpad/sitetest1017/F/`）

| ID | 结果 | 实际 / 证据 |
|---|---|---|
| F-01 | 通过 | landlord-test：「生效中 ACTIVE · 1」含 `L-46B5 · 2026-08-01 → 2027-07-31 · $2,450 · Tenant intent: renew`；待签 0、已结束 0 空态文案；最近活动来自真实审计（lease_sent / signed / household_created）。`F01-leases.png` |
| F-02 | 通过 | muse-landlord：`L-DF4C`（active，10-12 起）在「生效中」；`L-9F81`（imported，11-01 起）在「已签·待起租 SIGNED · UPCOMING」；`L-89FD`（sent）在「待签 PENDING」。签完 F-10 后 `L-F120`（12-01 起）也进「已签·待起租 · 2」。`F02-muse-leases.png` |
| F-03 | 通过 | `/landlord/leases/new?application_id=f4a2259b…` 预填 租客名 `[TEST] Muse Tenant` / 邮箱 / 地址 `[TEST] 200 Test QA Lane` / Toronto / $2300（起租日空：申请无 move_in_date）；填法定名、12-01→2027-11-30 保存 → `/landlord/leases/f120d9ed…`；再开同一 URL → 308 到 `?edit=f120d9ed…&reopened=1`，库里只有一份草稿、`application_id` 已写。`F03-new-prefill.png` |
| F-04 | 通过 | 详情页 `ONTARIO STANDARD LEASE · DRAFT`，按钮 编辑 / 删除 / 发送签署，全文渲染。签完后（F-04b）显示 `SIGNED_BOTH`、租客永久链接、「✓ Fully executed (2026-10-18)」，无发送按钮。`F04-lease-detail.png` `F04b-signed-detail.png` |
| F-05 | 通过 | `POST /api/lease/send` 200 `{sent_to: muse-tenant@…}`；行 status=sent、sign_token 64 位、sent_at；审计 `lease_sent_for_signature`（email_id 01a14d14…）。邮件 1 |
| F-06 | 通过 | muse-tenant JWT → 403 `only the landlord can send this lease` |
| F-07 | 通过 | 匿名 `/lease/sign/<token>` 渲染全文 + `AWAITING TENANT SIGNATURE` + 勾选框 + 姓名框 + 「Sign the lease」。`F07-sign-page.png` |
| F-08 | 通过 | token 签 → 200 `signed_tenant`；再签 → `already:true`；假 token → 404；审计 `lease_signed_tenant`。邮件 2（房东回签提醒） |
| F-09 | 通过 | 租客 JWT 带 lease_id → 403 `not the landlord on this lease`；匿名带 lease_id → 401 |
| F-10 | 通过 | muse-landlord 回签 → 200 `signed_both · fully_executed:true`；审计 `lease_signed_landlord`。邮件 3（Fully signed） |
| F-11 | 通过 | 新 household `1905e617`（`[TEST] 200 Test QA Lane` · Toronto · active/verified/esign · current_lease=f120d9ed · 12-01→2027-11-30 · $2300 · due 1）+ 房东成员 + `muse-tenant@` 租客邀请（到期 11-01）+ `rent_payments(f120d9ed, 2026-12-01, due, $2300)`；审计 `household_created_from_esign`。未并入 `2abfd3e7`（地址不同，其 next_lease_id 仍空）。申请 `f4a2259b` status 仍 `new`（追踪条按租约关联推阶段，记为观察） |
| F-12 | 通过 | 签完再 send → 409 `lease_not_sendable` |
| F-13 | 通过 | tenant-test `/h/1c9abb72`：时钟「IN TENANCY · month 3 · 286 days to 2027-07-31 · Ledger 2/3 periods」；续约意向面板三按钮（Renew / Plan to move out / Discuss terms）；对话 / 报修标签渲染；租金页 4 行（11-01 upcoming、10-01 late、09-01 late、08-01 due 带 Mark paid），**无** CSV 块、无还款计划、无确认按钮（自己记录的），日期框 `max=2026-10-17 min=2026-05-31`。`F13-*.png` |
| F-14 | 通过 | landlord-test 同页：CSV 对账块 + 还款计划草稿（08-01 未记录 $2,450 → 3 期各 $3,266.67/.66）；两期已确认行写「Confirmed by me」；无「确认」按钮（都已确认）。`F14-rent.png` |
| F-15 | 通过 | `mark_rent_paid(…, '2026-10-01', 明天)` → 400 `bad_paid_date`；`p_due=2026-12-01` → `future_period`；直插 `rent_payments` → 42501 |
| F-16 | 通过 | 09-01 已被房东确认 → 自确认幂等返回原行（confirmed_by 不变）；10-01 由 tenant-test 记录后自确认 → 400 `self_confirm` |
| F-17 | 通过 | tenant 记 10-01 付于 10-05 → `late`；房东确认 `confirmed_by=30d0c280`；再确认 → 同一 confirmed_at；租客再记 10-10 → paid_at 仍 10-05（不重盖）；审计 `rent_confirmed` |
| F-18 | 通过 | favicon-16 → 200 `recorded:false` sha256 `1888459e…`（= 本机 shasum）；同文件 → 200 `duplicate:true`；favicon-48 → 409 `evidence_exists`；`.txt` → 415 `file_type`；缺 lease_id → 400；匿名 → 401；muse-tenant（非成员）→ 403 `not_a_member`；审计 `rent_evidence_attached` |
| F-19 | 通过（一处记录） | TD 格式（BOM、无表头、`(12.50)` 括号负数、带引号逗号）识别为 `Read as TD · 7 records, 5 deposits`，只取入账；08-03 $2,450 → 08-01 `exact`（唯一在窗内的租金额入账）默认勾选；取消勾选后「Mark the 1 ticked period(s) paid」禁用；**未提交**。两期合付 $4,900（08-28，AUG SEP）落在「no matching period」——因 09-01 已记录，合付识别只在两期都未记录时生效（见 D-F-03）。`F19b-csv.png` `F19-td.csv` |
| F-20 | 通过 | 草稿预览三期；「Draft → to-dos」→ `agent_pending_actions d5eafccb send_message/pending stage=payment_plan`，页面「Placed on your to-dos; sent only after you preview and approve」；未发邮件。`F20-plan.png` |
| F-21 | 通过 | 租客点 Renew + 备注 → `renewal_intents 3f62f6ff (renew, lease_id=46b558d0)`；面板与时钟「Tenant intent: Renew」；房东租约列表「Tenant intent: renew」；文案「An intention, not a notice … N9 … s.38」 |
| F-22 | 未执行（生产无数据） | 生产库没有任何 QC 租约 / household（`terms.unit.postal ~ ^[HJG]`、城市 Montréal、QC 房源关联均为 0 行；蒙特利尔房源 `282fbbb1` 无租约）。替代证据：本地 `tests/provinceRenewal20261006.spec.ts` 等 4 份守卫 98 条全过 |
| F-23 | 通过 | 页首边界文字（not legal advice / Crown copyright）；四张卡 194×338 等权、无预选、无 `?form=`；页面无「建议 / 推荐 / should serve」；送达方式下拉（hand / mailbox / mail / fax / email）只影响日期。`F23-toolbox.png` |
| F-24 | 通过 | $2,600 生效 2027-08-01 → Fails「6.12% above the 2027 guideline of 1.9%」；$2,490 → 无 flag（1.63%）；生效 2026-12-01 → 两条 Fails（90 天：最早 2027-01-15；12 个月：最早 2027-08-01，s.116(1)）；生效 2027-06-01 → 只剩 12 个月 Fails；勾 2018 豁免 → 降为 Note。指导比例按生效年份（2026 → 2.1%、2027 → 1.9%）。`F24-n1.png` |
| F-25 | 通过 | 勾 08-01 期（合计 $2,450）；亲手送达 10-17、终止 10-20 → Fails「before the earliest allowed 2026-10-24 (7 days)」；改邮寄 → 视为送达 10-22、最早 10-29；终止 10-29 → 只剩 2026/09 版本 Note。`F25-n4.png` |
| F-26 | 通过 | 终止 2027-03-15 → Fails「not the last day of a rental period … next 2027-03-31」；2027-07-31 → 287 天 ≥120 Note（可免补偿）；补偿改 none + landlord → 允许；who=purchaser → Fails「not covered by the 120-day waiver」；终止 2026-11-30 → Fails <60 天（最早 12-16）。`F26-n12.png` |
| F-27 | 通过 | N4 终止 2026-11-10 → 最早申请日 2026-11-11；附 N4 付清即作废 / Certificate of Service / 欠租听证先付一半 三条 Note |
| F-28 | 通过 | 填写稿 blob HTML 4,617 字节，含「Stayloop fill-in sheet · not the official form」+ 官方链接 + 当前 flags（`F28-sheet.html`）；9 个官方链接 GET 全 200：N1 / N1 说明 / N4 / N12 / L1 五个 PDF 以 `%PDF-` 开头，N4 / N12 / L1 说明为 HTML 页，表格索引 HTML |
| F-29 | 通过 | 记录 N4 送达（10-17 亲手，终止 10-29）→ `notice_service_records cd75b74b` + 审计 `notice_served_recorded`；页底列出；房东 JWT PATCH / DELETE → 42501 permission denied；租客读 → 空；匿名 → 401 |
| F-30 | 通过 | 现租 2450、新租金空 → 「核对」禁用、无结果、页面无 `-100`；填 2500 / 10-17 / 2027-08-01 → 「+2.04% · 2027 guideline 1.9% · Notice 288 days」+ ⚠ 超指导（AGI / s.6.1 说明）+ ✓ 90 天（最晚送达 2027-05-03）；N9：固定租约到期 2027-07-31 → 最早搬离 July 31 2027、通知须在 June 1 2027 前送达；押金 2450 付于 2026-08-01 → 不满一年，按 2027 年 1.9% 折算约 $9.95，下次 2027-08-01（s.106(6)/(9)）。`F30-tenant-lease.png` |
| F-31 | 通过 | `rent-ledger`：Oct received $2,450 / due $0 / overdue $0 / 今年 $4,900；4 期（2026-11 Due 占位、10 Paid late ✓ Receipt·confirmed、09 同、08 Overdue 占位）与 `/h/[id]` 租金页 4 行一致。`F31-finance.png` |
| F-32 | 通过（一处记录） | `MY RENT · LIVE` 列出 10-01、09-01（Late · Evidence ✓ Receipt·confirmed · Record → `/h/<id>?tab=rent` · Ask in the tenancy thread）；页面无「立即支付 / 托管 / autopay」。**未记录的 08-01 逾期期与 11-01 待付期不在列表**（见 D-F-04）。`F32-payments.png` |
| F-33 | 通过 | `net.http_post` 请求 271 → 200 `{followups:{sent:0,skipped:5,reasons:{too_old:1,already_sent:2,test_account:2}}, rent:{tenant_pushed:0,overdue_cards:1,expired:0,skipped:1}}`——新出一张 `rent_overdue` 卡（08-01，因 10-01 已记录、只卡最新一期）；请求 272 → `overdue_cards:0`（幂等）。测试号不收回访邮件 |
| F-34 | 通过 | 新 household 首期 = `firstDueDate(2026-12-01, 1)` = 12-01（`rentSchedule` 同一算法）；1c9abb72 的 `rentSchedule(2026-08-01, 1, monthsAhead 1)` = 08/09/10/11-01 四期 = 租金页四行 = 财务台账四行；`promote_household_leases()` 只在 `start_date ≤ 多伦多今日` 时切换、把旧租约写 previous_lease_id、补首期占位（定义已读，本轮无到期的 next_lease 可切） |
| F-35 | 通过 | 375px：`/landlord/notices` 与 `/h/[id]?tab=rent` scrollWidth = clientWidth = 375。`F35-*.png` |

统计：35 条用例 · 执行 34 · 通过 34（其中 2 条带记录）· 失败 0 · 未执行 1（F-22，生产无外省租约，守卫替代）。

## 三、缺陷

| 编号 | 严重度 / 优先级 | 一句话 | 复现要点 |
|---|---|---|---|
| D-F-01 | S2 / P2 | N 表工具箱的「今天」与送达日默认值用 UTC 日期：多伦多 20:00 之后默认送达日是明天，L1 的「今天是否已过 N4 终止日」也按明天判断（当天 23:40 页面写 `Today 2026-10-18`） | landlord-test，`/landlord/notices?lease=46b558d0…`，Toronto 时间 20:00–24:00 打开；`components/landlord/NoticeToolbox.tsx:142` `today = isoDate(todayUtc())`，而租金记录用 `torontoDate()`。L1：N4 终止日填当天 → 23:00 时页面会说可以申请 |
| D-F-02 | S3 / P3 | 时间戳按 UTC 字符串截取显示（送达记录 `2026-10-18 03:40`、「Confirmed by me · 2026-10-18」、「Fully executed (2026-10-18)」、续约意向 `2026-10-18 · me`），实际都是 10-17 晚 | `NoticeToolbox.tsx:502 created_at.slice(0,16)`、`RentPeriodRow.tsx:156/164/184`、`leases/[id]/page.tsx:330`、`h/[id]/page.tsx:412/424`；任何多伦多 20:00 后的操作 |
| D-F-03 | S3 / P3 | CSV 对账「两期合付」只在两期都未记录时识别；一期已记录、另一期未记录的 2× 入账（`08/28 $4,900 RENT AUG SEP`，08-01 未记录、09-01 已记录）落到「no matching period」，不给 08-01 一个 likely 匹配 | landlord-test `/h/1c9abb72…?tab=rent` 上传 `scratchpad/sitetest1017/F/F19-td.csv` |
| D-F-04 | S2 / P2 | 租客 `/tenant/payments`（MyRent）只列有 `rent_payments` 行的账期：未记录的逾期期（08-01，房东台账显示 Overdue、hub 显示 DUE）与下期待付（11-01）都不出现，租客页看不到自己欠着一期；房东财务台账已用 `scheduledPlaceholders` 补占位而租客侧没有（CLAUDE.md「阶段 3」末尾注记只承认了 rail） | tenant-test `/tenant/payments` vs `/landlord/finance`、`/h/1c9abb72…?tab=rent` |
| 观察 | — | 从申请起草并签完租约后 `applications.status` 仍为 `new`（申请人从未被「录取」也能起草租约）；追踪条按 `lease_documents.application_id` 推阶段，是否该同步申请状态由产品定 | `applications f4a2259b` |
| 观察 | — | 租客护照 / `/tenant/lease` 的「Managed tenancies」不显示待接受的邀请（新 household 1905e617 只能从邮件链接或进度页 rail 的「接受邀请」到达） | muse-tenant `/tenant/lease` |

## 四、数据副作用（全部 `[TEST]`，正式发布前清理）
- `lease_documents f120d9ed-586a-42e5-b897-d921f434ae92`：muse-landlord 从申请 `f4a2259b` 起草的安省标准租约，`[TEST] 200 Test QA Lane` · 2026-12-01→2027-11-30 · $2,300 · signed_both（租客 `[TEST] Muse Tenant` 10-18 03:37Z，房东 `[TEST] Muse Landlord`）；sign_token 已铸。
- `households 1905e617-1b06-413b-bc57-54e5a5bc1e7c`（esign · verified）+ `household_members`（muse-landlord）+ `household_invites`（muse-tenant@，未接受，到期 11-01）+ `rent_payments (f120d9ed, 2026-12-01, due)`。
- 邮件 3 封（Resend → muse-tenant ×2、muse-landlord ×1）。
- `rent_payments 5519c4d9`（46b558d0 · 2026-10-01 · late · paid 10-05 · 房东已确认 · 回执 favicon-16.png · note `[TEST] F-18 receipt`）+ 存储对象 `tenancy-files/1c9abb72…/rent/46b558d0…/2026-10-01-1888459e.png`。
- `renewal_intents 3f62f6ff`（tenant-test · renew · `[TEST] F-21 intent`）。
- `notice_service_records cd75b74b`（landlord-test · N4 · 2026-10-17 hand · 终止 10-29）。
- `agent_pending_actions d5eafccb`（send_message · payment_plan · pending，未批准）与 `cbae9a3d`（rent_overdue 08-01 · pending，由 cron 产生）。
- 审计：lease_sent_for_signature / lease_signed_tenant / lease_signed_landlord / household_created_from_esign / rent_confirmed / rent_evidence_attached / notice_served_recorded；muse-landlord 与 tenant-test 的 `terms_accepted`（2026-10-16 版）。
- 触发 `/api/agent/proactive` cron 两次（请求 271 / 272）。
