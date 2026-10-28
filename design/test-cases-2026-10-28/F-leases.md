# F · 租约与在管租约（2026-10-28 全站测试 · 测试员 ③ · R1 全跑）

基线 `design/test-cases-2026-10-17/F-leases.md`（上轮 D-F-01…D-F-04）。新东西：10-26「空置成本卡」「次日催租推送」、10-27「入住 / 退租状态照片」「T776 导出」「证据包排序」「N 表工具箱 paralegal 转介」、10-27 代码审查（T776 按多伦多年份）。10-19 Flinks 加固只验入口与降级（无生产凭证）。
账号 / 数据：landlord-test（authId `30d0c280…`）· tenant-test（`dc734f3e…`）· 在管租约 `1c9abb72-c433-498b-942d-0d448fb8342f`（100 Test Ave #1，current lease `46b558d0-0028-42dd-9964-0f1b88829c20`，$2,450，2026-08-01 → 2027-07-31）· 事务 `0b93ea2f…`。执行前租金记录：09-01、10-01 已付迟付且房东已确认；08-01 未记录（占位 due，有 pending `rent_overdue` 卡 `cbae9a3d`）；11-01 未到期。`condition_photos` 已有 1 张（房东 10-25 厨房）。landlord-test 有 pending `send_renewal_letter` 卡 `7cd5e712`。
工具：playwright（`f-landlord-1/2.mjs`、`f-tenant-1/2/3.mjs`，截图 `shots/f*.png`）、curl（JWT）、只读 SQL、本地 vitest。

## 一、用例

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| F-01 | R1 | landlord-test | `/h/1c9abb72…` 概览 / 对话 / 租金 / 报修 | 时钟、成员、续约意向（房东只看不点）、入住清单、`condition-photos`、租约文件；租金页有 CSV 对账 + 还款计划草稿；报修 tab `maintenance-panel` | node1Facts |
| F-02 | R1 | tenant-test | 同页四标签 | 续约三按钮、清单可勾、照片可传；租金页**无** CSV / 还款计划；`rent-paid-on` `max=今天`；报修 tab 无房东专属按钮 | — |
| F-03 | R1 | tenant-test | 租金页 08-01 期：日期 2026-08-02 →「标记已付」 | 提示「将记为迟付 1 天」；`mark_rent_paid` 200；行 state late、「等对方确认」、无自确认按钮 | sweep A5 |
| F-04 | R1 | landlord-test | 同期「确认这一期已收到 / 已付」 | `confirm_rent_payment` 200；「我已确认 · 2026-10-28」；还款计划草稿消失（无未记录期）；审计 `rent_confirmed` | v1stage3_rentEvidence |
| F-05 | R2 | tenant-test | 入住清单勾「大门钥匙」 | `move_in_checklist` upsert 201；计数 2/13；房东侧看到「2026-10-28」 | — |
| F-06 | R1 | tenant-test | 照片区「展开」→ 入住阶段 → 客厅行上传 1 张 PNG | 设备端 SHA-256 → storage 上传 → `condition_photos` 201；行里出现缩略图，`title="SHA-256 <64 hex>"` | batch2Round1 |
| F-07 | R1 | 同上 | 切「退租」→ 同一行再传 1 张 | 左入住右退租并排；两条 64 位哈希；**无删除按钮** | 同上 |
| F-08 | R1 | tenant-test / landlord-test | 缩略图签名链接 `fetch` | 200 `image/jpeg`；房东视角同一行看到 2 张、链接可开 | 同上 |
| F-09 | R2 | tenant-test 375×812 | `/h/[id]` 概览 | 无横向溢出；`condition-stacked` 可见、表格隐藏（只验功能） | mobile |
| F-10 | R1 | tenant-test | `/tenant/move-in` | `move-in-checklist` + `condition-photos` + `insurance-referral`→`/providers/professional?trade=insurance_broker` | batch2Round1 |
| F-11 | R1 | landlord-test | `/landlord/progress` 事务面板 | `matters-panel`、`pack-kind` 四个选项（全部 / 欠租 / 维修 / 退租）、每件事务「导出聊天记录」 | batch2Round2 |
| F-12 | R1 | landlord-test JWT | `POST /api/matters/export {matter_id: 0b93ea2f, lang zh, kind ×4}` | 4 份 HTML 200；general 节号「5 · 入住 / 退租状态照片」「9 · 内容指纹」；其余 kind 页首「整理顺序：…」且 1–9 连续；哈希列出、文件不内嵌；paralegal 转介段；租客导出 200；非当事人 403；坏 kind 回落 general | 同上 |
| F-13 | R1 | landlord-test | `/landlord/finance` + `POST /api/finance/t776 {year 2026, html/csv}` | `live-tax-block` + `t776-export` 年份 2026/2025/2024；HTML 8141 = 当年记收合计、8960 = 完工工单金额、其余行「这里没有记录」；CSV BOM + `attachment`；与租金记录对得上；1999 → 400；匿名 → 401 | batch2Round2 · 代码审查 |
| F-14 | R2 | landlord-test | `/landlord/todo` 续约函卡 | `vacancy-cost-card` 折叠；填 2450 / 30 / 100 → 每天 $81、30 天 $2,416、让步 12 月 $1,200、盈亏平衡 15 天；「这里不做建议」；逾期卡上 `paralegal-referral` | batch1Cards |
| F-15 | R1 | landlord-test | `/landlord/notices?lease=46b558d0…` | 边界文字、四卡等权无预选、N1 $2,600 → 超 2027 指导 1.9%、$2,490 通过；flags 里 `paralegal-referral` 指向 `/providers/professional?trade=paralegal` | v1stage3_noticeForms · batch2Round1 |
| F-16 | R1 | tenant / landlord / anon JWT | `condition_photos` PATCH / DELETE / 匿名 SELECT / 冒充 taken_by INSERT | 全 42501 或 RLS 拒绝；本人 SELECT 200 | 迁移 20261027 |
| F-17 | R1 | tenant-test JWT | `mark_rent_paid` 未来期 / 明天；`confirm_rent_payment` 自己记录的期；非成员租约；直插 `rent_payments` | `future_period` / `self_confirm` 或幂等 / `not_a_member` / 42501 | sweep A5 |
| F-18 | R1 | landlord-test | `/landlord/leases`、`/landlord/leases/46b558d0…` | 分段渲染；详情 SIGNED_BOTH；N 表工具箱入口 | node1Facts |
| F-19 | R1 | tenant-test | `/tenant/payments` | 列出真实账期（含刚记的 08-01「等对方确认」）；无「立即支付 / 托管」 | auditAndDemo |
| F-20 | R2 | 代码 + 守卫 | 次日催租推送 / 月度简报 | `batch1Cards20261026` 通过；landlord-test 有 `monthly_brief` 例行（10-28 已跑）；cron 不手动触发 | batch1Cards |
| F-21 | R2 | 匿名 + 代码 | Flinks 入口与降级 | `providerAvailability().bank.available=false`（无凭证）→ 页面「未开通」、`/start {step:bank}` 404 `not_configured`；假 token → 404；`verifyBankHardening20261019` 17 条过 | verifyBankHardening |
| F-22 | R2 | 匿名 | token 页 referrer 头 | `/verify /lease/sign /my-file /w /p /join` 全 `no-referrer`（上轮 G-D3） | proxy.ts |

## 二、执行记录（2026-10-28 18:46–19:00 UTC）

| ID | 实际 | 证据 | 结果 |
|---|---|---|---|
| F-01 | 概览：「100 Test Ave, #1 · 双方已确认 · 租中 · 第 3 个月 · 到期 276 天 · 租金记录 2/3 期 · 租客意向：续约」、续约意向历史 2 条（房东无按钮）、入住清单 1/13 带「找持牌保险经纪（RIBO）→」、「入住 / 退租状态照片 1 展开」（默认折叠）、成员 2；对话 6 条（含撤回行与邮件回复）；租金：CSV 对账块 ✓、「起草还款计划 … 待办里已有一张还款计划提议」✓、4 行（11-01 未到期 / 10-01 late 已确认 / 09-01 late 已确认 / 08-01 待付 标记已付）；报修 `maintenance-panel` 10 张工单 | `f-landlord-1.out` · `shots/f01-landlord-*.png` | 通过 |
| F-02 | 租客：续约意向三按钮「续约 / 计划搬离 / 想谈谈条件」；租金页 **无** CSV / 还款计划、「标记已付」×2（08-01）、`rent-paid-on max=2026-10-28`；对话以「我」视角；报修 tab 无「指派 / 取消工单」 | `f-tenant-1.out` · `shots/f02-tenant-*.png` | 通过 |
| F-03 | 填 2026-08-02 → 提示「将记为迟付 1 天 · 不是这天付的请改成实际日期」→ `rpc/mark_rent_paid` 200 → 行 `data-state=late`「已付 · 迟付 · 我 记录 · 付于 2026-08-02 · 等对方确认」，无 `rent-confirm`，`rent-awaiting` 1；时钟变「租金记录 3/3 期」 | `f-tenant-3.out` · `shots/f03-tenant-mark-paid.png` | 通过 |
| F-04 | 房东行「确认这一期已收到 / 已付」→ `rpc/confirm_rent_payment` 200 → 「Test Tenant 记录 · 付于 2026-08-02 · 我已确认 · 2026-10-28」；还款计划块消失；SQL `rent_payments 609440b6`（late · paid_at 08-02 · confirmed_by 30d0c280 18:53:09）；审计 `rent_confirmed` | `f-landlord-2.out` · `shots/f04-landlord-confirm.png` · SQL | 通过 |
| F-05 | `button[role=checkbox][aria-label=大门钥匙]` aria-checked false → 点击 → true，`POST move_in_checklist?on_conflict=household_id,item_key` 201，计数 2/13，「大门钥匙 2026-10-28 · 我」；房东侧「大门钥匙2026-10-28」✓；SQL `keys_front done by dc734f3e` | `f-tenant-3.out` · `shots/f05-tenant-checklist.png` | 通过 |
| F-06 | 展开后 5 行（客厅 / 卧室 / 厨房与电器 / 卫生间 / 已有损耗），「现在上传的是：入住 / 退租」；`condition-add-photos_living` 选 `favicon-64.png` → `POST storage/…/condition/move_in/photos_living/…jpg` 200 → `POST condition_photos` 201 → 缩略图 1 张，`title="SHA-256 c03c64f5…2e843"`（64 位）；无错误 | `f-tenant-2.out` · `shots/f06-tenant-movein-upload.png` | 通过 |
| F-07 | 切「退租」→ 传 `favicon-32.png` → `…/condition/move_out/photos_living/…` 200 → 201；客厅行三格 `[位置 | 入住 1 图 "2026-10-28 · 我" | 退租 1 图 "2026-10-28 · 我 + 照片"]`；两条哈希 `c03c64f5…` / `3364f4f7…` 各 64 位；照片区按钮只有「收起 / 入住 / 退租」，**无删除** | `f-tenant-2.out` · `shots/f07-tenant-moveout-upload.png` | 通过 |
| F-08 | 租客 `fetch(signedUrl)` → 200 `image/jpeg` 1,436 B（URL 带 `token=`）；房东视角客厅行 `[0 | 1 图 | 1 图]`、哈希同两条、删除按钮 0、签名链接 200 `image/jpeg` | `f-tenant-2.out` F-08 · `f-landlord-2.out` F-08 · `shots/f08-landlord-photos.png` | 通过 |
| F-09 | 375：`scrollWidth=clientWidth=375`；`condition-stacked` 可见、表格隐藏、竖排里 3 张图 | `shots/f09-tenant-375-overview.png` | 通过 |
| F-10 | `/tenant/move-in`：清单 2/13 ✓、`condition-photos`「3 展开」✓、`insurance-referral href=/providers/professional?trade=insurance_broker` ✓；`deposit-receipt-card` / `move-out-entry` 0（本号未填押金，按状态不渲染） | `shots/f10-tenant-move-in.png` | 通过 |
| F-11 | 「租赁事务 5 · 聊天记录顺序 [全部（按事务顺序）/ 欠租事务 / 维修事务 / 退租事务]」；5 张 `matter-card` 各带「导出聊天记录（含工单与通知）↗」（界面仍叫「聊天记录」，09-30 决定） | `f-landlord-2.out` F-11 · `shots/f11-landlord-progress.png` | 通过 |
| F-12 | 4 份 200（51–52 KB）。general：`1 事务链 · 2 正式通知副本 · 3 维修工单 · 4 对话记录 · **5 入住 / 退租状态照片 (3)** · 6 附件清单 · 7 委托 · 8 审计记录 · **9 内容指纹**`，无「整理顺序」行；arrears：`1 事务链 · 2 正式通知副本 · 3 对话记录 · 4 审计 · 5 附件 · 6 照片 · 7 维修 · 8 委托 · 9 指纹` + 「整理顺序: 欠租事务 · 内容与「全部」一样，只是先后不同」；maintenance：`2 维修工单 · 3 对话 · 4 照片 …`；move_out：`2 入住 / 退租状态照片 (3) · 3 维修 …`；每份 51 个 64 位哈希、无 `<img>`、含 `providers/professional?trade=paralegal` 转介；租客导出同事务 200；坏 kind → 200 且无「整理顺序」（回落 general）；租客导出房东独有事务 `eb2f85d5` → 403 `not_a_party`；审计 `matter_export_generated` ×6 | `packs/pack-*.html` · curl 输出 | 通过 |
| F-13 | 页面：`live-tax-block`「CRA T776 · 按你的真实记录 · 年度 2026/2025/2024 · 打开 T776 对照表 · 下载 CSV · 只列记收的租金（8141）和完工工单的金额（8960）…不是税务建议」；`rent-ledger` 5 期（含 08-01「已付 · 迟付 · 2026-08-02 · 对方已确认」）、今年到账 $7,350。API HTML 200 `text/html`：两处物业分表，`100 Test Ave #1` 8141 **$7,350.00 · 3 笔**（= 08/09/10 三期 × $2,450，与租金记录一致）、8960 **$695.00 · 4 张**；其余 12 行「这里没有记录，按你自己的凭证填」；`[TEST] 19 OpenNext Ave #9` 全 0。CSV 200 `text/csv` + `attachment; filename="stayloop-t776-2026.csv"` + BOM `EF BB BF`，合计行 7350.00 / 3。1999 → 400 `invalid_year`；匿名 → 401 `sign_in_required`；审计 `t776_export_generated` ×2 | `packs/t776-2026.{html,csv}` · `shots/f12-landlord-finance.png` | 通过（见 F-D1） |
| F-14 | `/landlord/todo`：`vacancy-cost-card` 1（折叠「算一下：留人让步 vs 空置成本 展开」）→ 填 2450 / 30 / 100 → 「空一天少收 $81 · 空 30 天 $2,416 · 换租合计 $2,416 · 让步 12 个月合计 $1,200」+「按这些数，空置超过 15 天，换租就比让步贵。」+「不做建议」✓；逾期卡 `paralegal-referral`「要人帮忙走 LTB 流程？找持牌 Paralegal →（Stayloop 只整理材料，不给法律意见）」→ `/providers/professional?trade=paralegal` | `f-landlord-2.out` F-13 · `shots/f13-landlord-todo.png` | 通过 |
| F-15 | `notice-boundary` ✓；四卡 `aria-pressed` 全 false、URL 无 `form=`；N1 $2,600 生效 2027-08-01 → 「不符合 涨幅 6.12% 超过 2027 年指导比例 1.9%…（RTA s.120 · 2026: 2.1%, 2027: 1.9%）」+ **flags 列表末行 paralegal 转介**；$2,490 → 无 flag（转介行随 flags 一起消失）；页面无「建议 / 推荐」 | `shots/f14-landlord-notices.png` | 通过（观察 O-1） |
| F-16 | 租客 PATCH → 403 `42501 permission denied`；租客 / 房东 DELETE → 42501；匿名 SELECT → 42501；租客冒充 `taken_by=房东` INSERT → RLS 拒；租客 SELECT 本户 200 | curl 输出 | 通过 |
| F-17 | `mark_rent_paid(11-01, 明天)` → 400 `future_period`；`(12-01)` → `future_period`；自确认 10-01（房东已确认过）→ 200 幂等返回原行；非成员租约 `ce40e58a` → 403 `not_a_member`；直插 `rent_payments` → RLS 拒。`bad_paid_date` 未独立触发（没有可用的过去未记录期），UI `max=today` 已验 | curl 输出 | 通过 |
| F-18 | 列表「活跃租约 1 · 待签字 0 · 到期时间轴 L-46B5 次年 7 月 · 租客意向：续约（2026-10-18）」+「已签 · 待起租 1」（`[TEST] 19 OpenNext Ave`）；详情 `ONTARIO STANDARD LEASE · SIGNED_BOTH`、「N 表工具箱 →」、「这份租约的条款文档不完整…起草这份租约的标准租约 →」（快速录入租约，按设计）、「✓ 双方已签署（2026-09-22）」 | `shots/f15-landlord-lease-detail.png` | 通过 |
| F-19 | 4 期：11-01 待付 · 还没有记录；10-01 / 09-01 逾期 · ✓ 回执 · 对方已确认；**08-01 逾期 · 记录付于 2026-08-02 · 凭证：等对方确认**（上轮 D-F-04 未记录期不出现——本轮已记录故可见；11-01 占位已出现）；无「立即支付 / 托管 / autopay」 | `shots/f20-tenant-payments.png` | 通过 |
| F-20 | `batch1Cards20261026` 在 E-10 的 84/84 里通过；SQL：landlord-test 例行 `monthly_brief`（每月 1 号 09:00，`last_run 2026-10-28 18:42` 由他组手动运行，`last_result "2026-09: 2 lease(s), 1 unrecorded, 3 work order(s), 1 listing(s)"`，不经模型）；次日催租推送只能靠守卫（今天不在到期后 1–7 天窗内） | SQL · `vitest-e.log` | 通过（守卫 + 只读） |
| F-21 | `lib/verify/store.ts providerAvailability()`：`bank.available = flinksConfigured()`，无凭证 → 页面步骤状态 `not_configured`「未开通」、按钮不可点（`page.tsx:186/251`）；`POST /api/verify/<假 token>/start {step:bank}` → 404 `not_found`；`/verify/<假>` 页 200「链接无效」；`verifyBankHardening20261019 / dispatchPolicy / marketplace20260923` 51/51 过。未铸新核验请求（会发邮件，预算留给 G） | curl · vitest | 通过（代码 + 守卫） |
| F-22 | 六个 token 页 `referrer-policy: no-referrer` ✓（上轮 G-D3 已修）；`/api/consumer/request/*`、`/api/w/*` 仍 `strict-origin-when-cross-origin`（记 E-D1） | curl -sI | 通过 |

统计：22 条 · 执行 22 · 通过 22（F-20 / F-21 以守卫 + 只读替代）· 失败 0。上轮 D-F-04 的一半（11-01 待付占位）已在租客付款页出现。

## 三、缺陷

| 编号 | 严重度 / 优先级 | 一句话 | 复现要点 |
|---|---|---|---|
| F-D1 | S3 / P3 | `/api/finance/t776` 对没有房东帽子的账号返回 200 的空表（合计 0.00）而不是 403 | tenant-test JWT `POST /api/finance/t776 {year:2026, format:csv}` → 200，CSV 只有两行合计 0。无数据泄露（按 owner 过滤），但与「计费 / 房东路由对无房东帽子返回 403」的习惯不一致 |

## 四、观察

- O-1 F-15：N 表工具箱的 `paralegal-referral` 挂在 `notice-flags` 列表里，只有存在核对结果（flag）时才出现，全部通过时不显示；与逾期卡上的常驻转介不同。是否要常驻由产品定。
- O-2 F-01：`rent_overdue` 卡 `cbae9a3d`（08-01）在 08-01 记录并确认后仍 pending（执行器批准时会重核事实 → 409 expired），待办页上会多留一张过时卡直到有人点它。
- O-3 F-13：T776 的 HTML 里没有写明「按多伦多日期归年」，CSV 来源列只写「Stayloop 记录的租金」；年份切分守卫在 batch2Round2 通过。
- O-4 F-18：`46b558d0` 是快速录入租约，详情页说「条款文档不完整」——按设计（提供「起草标准租约」入口）。

## 五、数据副作用（全部 `[TEST]`，不删）

- `condition_photos 8bdb2701-128c-4ed8-8e3c-7ce20a1a2321`（move_in · photos_living · tenant-test · sha `c03c64f5…2e843` · 1,436 B）与 `02da95d2-a09b-4fd6-856f-c4c356d5fd54`（move_out · photos_living · sha `3364f4f7…eed3d` · 1,043 B）+ `tenancy-files` 桶两个对象 `1c9abb72…/condition/{move_in,move_out}/photos_living/<id>.jpg`。
- `move_in_checklist (1c9abb72, keys_front)` done by tenant-test 18:51:26Z。
- `rent_payments 609440b6-80c0-4dc5-8998-b0c2626c5344`（46b558d0 · 2026-08-01 · late · paid_at 2026-08-02 · confirmed_by landlord-test 18:53:09Z，无回执）；审计 `rent_confirmed`。标记时系统给 landlord-test 发了 1 封邮件（`message_deliveries` 18:51:23 email sent）。
- 审计 `matter_export_generated` ×6（landlord 5 + tenant 1）、`t776_export_generated` ×3（landlord 2 + tenant 1）。
- 空置成本卡 / N1 输入只在客户端，未写库；续约函卡 `7cd5e712` 与逾期卡 `cbae9a3d` 均未批准。
- 邮件 1 封（租金标记提醒 → landlord-test）。模型调用 0。
