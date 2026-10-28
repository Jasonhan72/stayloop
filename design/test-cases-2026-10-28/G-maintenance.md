# G · 维修与服务市场（2026-10-28 全站测试 · 测试员 ③ · R2 抽 ≥50% + 新）

基线 `design/test-cases-2026-10-17/G-maintenance.md`（上轮 G-D1 act 响应泄 token、G-D2 评价 provider_id、G-D3 referrer）。新东西：10-27「专业服务类目」（`lib/marketplace/trades.ts` 四个只展示与转介的工种、`/landlord/providers` 专业服务区、`/providers/professional`）、10-27 代码审查「派单策略卡过滤掉专业服务工种」。
账号：tenant-test（成员）· landlord-test · provider-test（`[TEST] Northline`，`provider_directory 8e668976…`）。在管租约 `1c9abb72…`。执行前库里**没有**任何专业服务提供者。
工具：playwright（`g-tenant-1.mjs` `g-landlord-1/2.mjs` `g-provider-1.mjs` `g-anon.mjs`）、curl（JWT）、只读 SQL、本地 vitest。模型调用 0（报修走页面表单，不走 AI 卡）。

## 一、用例

| ID | 等级 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| G-01 | R2 | tenant-test `/tenant/maintenance` | 「+ 提交报修（可附照片）」 | 眉标真实地址；类别按钮；描述空时提交禁用；`ticket-photo-input accept=image/*,.heic,.heif`；进入方式块 RTA s.27；无 `no-household` | ticketPhotos |
| G-02 | R2 | 同上 | 选类别「电器 / 电路」+ 描述 + 1 张图 | 缩略图 1；非紧急描述不触发 s.20 强制 | ticketPhotos |
| G-03 | R2 | 同上 | 提交 | `maintenance_tickets` 201 → 照片上传 → PATCH → `/api/maintenance/notify` 200 `emailed:1`；`ticket-created`；列表出现新单 | v06Cleanup |
| G-04 | R2 | SQL | 新工单行 + 房东派单建议卡 | category electrical / priority medium / emergency false / photos 1 / `counterpart_notified_at`；`dispatch_work_order` 卡 | marketplace |
| G-05 | R2 | tenant-test JWT | `POST /api/work-orders/dispatch` | 403 not the landlord | marketplace |
| G-06 | R2 | landlord-test JWT | dispatch 到 Northline 且 `trade=paralegal` | 422 `provider_not_eligible:trade_not_listed`（服务商未登记） | marketplace |
| G-06b | R2 | landlord-test JWT | dispatch 给**自己的联系人**且 `trade=lawyer`（专业服务工种） | 应拒绝（专业服务「永不派单」） | trades.ts 注释 |
| G-07 | R2 | 匿名 | dispatch | 401 | — |
| G-08 | R2 | landlord-test | `/h/[id]?tab=maintenance`、`/landlord/maintenance` | 看到新工单与照片 | — |
| G-09 | R2 | landlord-test | 派单弹窗（在另一张开放工单上打开，不发出） | 工种下拉**不含**四个专业服务工种；精选网络 / 我自己的联系人；Esc 关闭 | 代码审查 10-27 |
| G-10 | R2 | landlord-test | `/landlord/providers` | 派单策略卡「各工种首选」只列家居工种；「专业服务 · 只展示与转介」区 + 文案「不派单、不收佣金、不给法律意见、不卖保险」+ 四类链接到 `/providers/professional?trade=…` | dispatchPolicy · batch2Round1 |
| G-11 | R2 | landlord-test / 匿名 | `/providers/professional` 与 `?trade=paralegal|insurance_broker|lawyer|photographer_floorplan|bogus` | 句子「Stayloop 不派单、不收佣金、不给法律意见、不卖保险」；四个分组；`?trade=` 预选对应按钮、坏值回「全部」；匿名显示 `professional-signin`；375 无溢出 | batch2Round1 |
| G-12 | R2 | provider-test | `/provider/jobs`、`/provider/onboard` | 六格与覆盖标签与库一致；入驻页出现四个专业工种与 LSO / RIBO 牌照项 | node3Execution |
| G-13 | R2 | 代码 | 维修 / 市场 / 在管租约组件无 `window.confirm / alert` | grep 为空 | fourRoleAudit_f |
| G-14 | R2 | landlord-test JWT | 对误派工单 `act cancel` | 200；响应不含 `token` / `external_email`（上轮 G-D1）；行 cancelled、token 清空 | marketplace |
| G-15 | R2 | 本地 | `dispatchPolicy / marketplace20260923 / verifyBankHardening` | 全过 | — |

## 二、执行记录（2026-10-28 18:57–19:05 UTC）

| ID | 实际 | 证据 | 结果 |
|---|---|---|---|
| G-01 | 弹窗「100 TEST AVE #1 · 维修 · 发给房东 · 什么情况? …」；类别四钮（水管 / 电器 / 暖气 / 钥匙）；紧急程度三档；进入方式三选 + 「非紧急维修，房东须提前 24 小时书面通知（RTA s.27）」；`ticket-photo-input accept="image/*,.heic,.heif"`；描述空时 `ticket-submit disabled`；`ticket-entry` 1、`no-household` 0 | `g-tenant-1.out` · `shots/g01-tenant-ticket-modal.png` | 通过 |
| G-02 | 选「⚡ 电器 / 电路」+ 描述「[TEST] 1028 厨房顶灯不亮…不紧急。」→ 提交可点；加 `favicon-64.png` → 缩略图 1 | 同上 | 通过 |
| G-03 | `POST maintenance_tickets` 201 → `POST storage/…/tickets/bb7e59fa…/1.png` 200 → `PATCH maintenance_tickets` 204 → `POST /api/maintenance/notify` 200 `{ok, emailed:1}`；弹窗「已提交 · 工单已记录在你的在管租约上，并已通过邮件和推送通知房东。照片 1/1 张已附上。」；刷新后列表首行「[TEST] 1028 厨房顶灯不亮… 新工单 电路 2026-10-28」 | `g-tenant-1.out` · `shots/g03-tenant-ticket-created.png` | 通过（1 封邮件 → landlord-test） |
| G-04 | `maintenance_tickets bb7e59fa-dd49-491c-a025-dcfcdfb05289`：category electrical · priority medium · emergency false · photos `[…/tickets/bb7e59fa…/1.png]` · entry_permission call_first · `counterpart_notified_at 19:01:25`；卡 `agent_pending_actions 0f312ce0` `dispatch_work_order`（派单后 expired）；审计 `maintenance_ticket_notified` | SQL | 通过 |
| G-05 | 403 `not the landlord of this household` | curl | 通过 |
| G-06 | 422 `provider_not_eligible:trade_not_listed` | curl | 通过 |
| G-06b | **200** `{ok, work_order_id: a89d1948-865c-4c93-afbc-8aef0f0a02f9, status: offered}`——律师工种被派成工单，发了邮件给外部联系人，页面显示「已派单 · 等服务商回应 · 请在 48 小时内报价 · [TEST] Ext · 律师」 | curl · SQL（trade `lawyer`、`quote_due_at +48h`、事件 offered）· `shots/g08-landlord-ticket.png` | **失败 → G-D1** |
| G-07 | 401 `Authentication required` | curl | 通过 |
| G-08 | `/h/[id]?tab=maintenance` 工单可见（含 2 个照片元素、工单对话 1 条系统行）；`/landlord/maintenance` 看板「3 待指派 · 1 已派 / 处理中 · 1 待验收 · 3 已完成」含新单 | `g-landlord-2.out` · `shots/g08-*.png` | 通过 |
| G-09 | 在「客厅暖气完全不热」（他组今日报修）上打开派单弹窗：工种下拉 = `水管/电气/供暖 / 空调/电器维修/虫害/门窗 / 结构/门锁 / 安全/杂工 / 清洁/**房源摄影 / 户型图采集/保险经纪（租客险 / 房东险）/持牌 Paralegal（LTB 代理）/律师**`；精选网络 / 我自己的联系人切换；Esc 关闭 ✓；未发出 | `shots/g09-dispatch-modal.png` | **失败 → G-D1（同根因）** |
| G-10 | 策略卡「各工种首选」只有 水管 / 电气 / 门锁 / 安全 / 杂工 ✓（`DispatchPolicyCard.tsx:46` 过滤）；「专业服务 · 只展示与转介 0」+ `professional-note`「…Stayloop 不派单、不收佣金、不给法律意见、不卖保险…」+「还没有已核验的专业服务提供者。」+ 单个链接「专业服务目录 →」（`/providers/professional`，**无 `?trade=`，四类没有各自链接**）；筛选下拉「全部工种」含四个专业工种；375 无溢出 | `g-landlord-1.out` · `shots/g10-landlord-providers.png` | 通过（G-D2 记录） |
| G-11 | 登录：标题「持牌的人，牌照核过，你直接联系。」、句子 ✓、「全部」+ 四个工种按钮、四个分组各「需要的牌照：…」「还没有已核验的提供者。」、页脚「这不是法律意见，也不是保险建议」；`?trade=paralegal` → 按钮「持牌 Paralegal（LTB 代理）」`aria-pressed=true`、只剩 paralegal 分组；insurance_broker / lawyer / photographer_floorplan 同理；`?trade=bogus` → 「全部」；匿名 → `professional-signin`「登录后可以看到联系方式。」且仍按 trade 预选；375 无溢出 | `g-landlord-1.out` · `g-anon.out` · `shots/g11-*.png` | 通过 |
| G-12 | `/provider/jobs`：「[TEST] Northline Home Services · 资质已核 · 可接收派单」六格「0 新邀请 · 0 已报价 · 1 进行中 · 0 待验收 · 0 待结算 · $0 今年收入 · ★ 4.5 (2)」、覆盖「水管 / 电气 / 杂工 / 门锁 · 已覆盖 · 可接派单」、无到期横幅；375 无溢出。`/provider/onboard` 工种列表含四个专业工种，牌照项含 LSO / RIBO | `g-provider-1.out` · `shots/g20-*.png` `g21-*.png` | 通过 |
| G-13 | `components/{household,tenant,marketplace,landlord,matters}`、`app/{landlord/maintenance,landlord/providers,provider,h,tenant/maintenance,landlord/finance}` grep `window.confirm|window.alert|alert(` 只命中一行注释（`provider/onboard/page.tsx:43`「no native window.confirm」） | grep | 通过 |
| G-14 | `POST /api/work-orders/a89d1948…/act {action:cancel}` → 200 `{ok,status,work_order}`，`work_order` 键 41 个，**不含 `token` / `external_email`**（上轮 G-D1 已修）；SQL 行 cancelled、token 清空。`cancel_reason` 为 null 是我把 `reason` 放在顶层而不是 `payload.reason`（路由读 `body.payload`），不是缺陷 | curl · SQL | 通过 |
| G-15 | `verifyBankHardening20261019 / dispatchPolicy / marketplace20260923` 3 文件 **51/51 通过** | vitest 输出 | 通过 |

统计：16 条 · 执行 16 · 通过 14 · 失败 2（G-06b / G-09，同一根因）。R2 基线 40 条抽 9 条等价覆盖（G-01/02/03/05/07/10/11/39/40 对应）≥ 50% 的主流程。

## 三、缺陷

| 编号 | 严重度 / 优先级 | 一句话 | 复现要点 | 证据 | 建议 |
|---|---|---|---|---|---|
| G-D1 | S2 / P1 | 专业服务工种（律师 / Paralegal / 保险经纪 / 摄影）可以被派成维修工单：派单弹窗的工种下拉列出它们，服务端只校验 `TRADES.some(key)`，外部联系人路径没有任何资格校验 | landlord-test JWT `POST /api/work-orders/dispatch {ticket_id, external_email:"landlord-test+ext@stayloop.ai", external_name:"[TEST] Ext", trade:"lawyer"}` → 200 offered，工单 `a89d1948` trade=lawyer、48 小时报价时限、邮件已发给联系人；UI 复现：`/h/1c9abb72…?tab=maintenance` → 指派 → 工种选「律师」→ 我自己的联系人 → 发出。精选网络路径靠「服务商未登记该工种」挡住（422），一旦有专业服务提供者入驻 `provider_directory`，同样会被派单 | `shots/g08-landlord-ticket.png`（「[TEST] Ext · 律师」）· `shots/g09-dispatch-modal.png` · SQL（trade lawyer）· `lib/marketplace/server.ts:136`、`components/marketplace/DispatchModal.tsx:101` | 弹窗 `TRADES.filter(t => !isProfessionalTrade(t.key))`；`dispatchWorkOrder` 对 `isProfessionalTrade(trade)` 返回 422 `professional_trade_not_dispatchable`；加守卫 |
| G-D2 | S3 / P3 | `/landlord/providers` 专业服务区没有把四类分别链到 `/providers/professional?trade=…`，只有一个总链接；同页「全部工种」筛选下拉包含四个专业工种，选中后精选网络只会是空 | landlord-test 打开 `/landlord/providers`，看「专业服务 · 只展示与转介」区与工种下拉 | `shots/g10-landlord-providers.png` · `app/landlord/providers/page.tsx:107–121` | 四类各一链接（与 `/tenant/move-in`、N 表、逾期卡的触发链接一致）；筛选下拉按分组或排除专业工种 |

## 四、观察

- 他组数据：今日 18:50 tenant-test 经 AI 卡产生工单「客厅暖气完全不热 / 空调故障（室温16度）」（`802d52fd`，④ 组），G-09 借它开弹窗，未改动。
- G-14：`cancel` 后外部联系人是否收到取消邮件未核（预算原因未查 Resend）。

## 五、数据副作用（全部 `[TEST]`，不删）

- `maintenance_tickets bb7e59fa-dd49-491c-a025-dcfcdfb05289`「[TEST] 1028 厨房顶灯不亮…」（electrical · medium · 1 张照片 `tenancy-files/1c9abb72…/tickets/bb7e59fa…/1.png`），当前 status `new`（派单取消后回到待指派）。
- `work_orders a89d1948-865c-4c93-afbc-8aef0f0a02f9`（G-D1 复现：trade lawyer · 外部联系人 `landlord-test+ext@stayloop.ai` · offered → **cancelled**，token 已清空，cancel_reason null）+ `work_order_events` offered / cancelled + 工单线程 1 条系统行 + 审计 `work_order_dispatched`。
- `agent_pending_actions 0f312ce0`（dispatch_work_order · expired）。
- 邮件 2 封（报修通知 → landlord-test；派单邀请 → landlord-test+ext@；取消通知若有则 +1）。模型调用 0。

## 本组邮件与预算合计（D+E+F+G）
邮件 5（+ 可能 1 封取消通知）：tenant-test ×2（决定通知、档案确认）、landlord-test ×2（租金标记、报修通知）、landlord-test+ext ×1（派单）。`/api/consumer/request` 1/2。登录后模型调用 0/8。匿名 `/api/agent/turn` 0/2。
