# D · 申请与申请包（2026-10-28 全站测试 · 测试员 ③）

风险 R1（本轮：上轮 S0 D-07「匿名申请全挂」必复测）。基线 `design/test-cases-2026-10-17/D-applications.md`。生产 ship98 `92a5f8c0`。
执行前状态（只读 SQL）：`[TEST] 77 Sitetest Rd, Toronto`（listing `c608689e…`，slug `test-77-sitetest-rd-toronto-x2xa`，$2,650，在架 verified）尚无任何申请；tenant-test 已有 3 份申请（`a8eb88f1` approved、`0a1da57b` new、`864bfca6` approved）。`applications` 的 anon INSERT 策略 WITH CHECK 已改为 `listing_accepts_applications(listing_id)`（上轮 S0 的修复）。
工具：playwright 无头 Chrome（`scratchpad/sitetest1028/DEFG/`，`lib.mjs` + `d-anon.mjs` / `d-landlord.mjs` / `d-tenant.mjs`，输出 `*.out`，截图 `shots/d*.png`）；只读 SQL（Supabase MCP）；REST 探针用各号 JWT（从 profile 的 `sb-*-auth-token` 取）。

## 一、用例

| ID | 风险 | 前置 | 步骤 | 期望 | 关联守卫 / 依据 |
|---|---|---|---|---|---|
| D-01 匿名申请页（安省） | R1 | 匿名 profile | `/apply/test-77-sitetest-rd-toronto-x2xa` | 房源摘要 + 测试房源标签；21 个字段（名 / 姓 / 邮箱 / 电话必填…）；材料 4 类含「政府证件」；同意文案 `data-province=ON` 含《安大略省人权法典》；「25 MB」；`<title>` 随房源（上轮 D-S3-1） | `fixList` `siteTest_g*` |
| D-02 匿名真实提交 | R1 | 同上 | 填必填 + 1 张 PNG 当证件 + 勾同意 → 提交 | `POST /rest/v1/applications` 201、`attach_application_files` 成功、页面「申请已提交」；库里 1 行 `[TEST] Round1028`、files=1、consent_screening=true | 上轮 D-S0-1 复测 |
| D-03 不存在 / 已下架 | R2 | 匿名 | `/apply/nope`、`/apply/test-100-test-ave-1-30033`（已下架） | 「找不到对应房源」，无 JS 异常 | — |
| D-04 表单校验 | R2 | 匿名 | 空表单提交；只缺电话；不勾同意 | 原生 required 拦下、无请求；不勾同意 → 页内错误「请勾选授权同意以继续。」、无请求 | 10-01 电话必填 |
| D-05 房东申请人列表 | R1 | landlord-test | `/landlord/applicants` | 新申请在「新申请」与并排对比表里；申报收入 / 雇主 / 材料 1；无分数（未筛查）；375 无溢出 | `lifecycleP1` |
| D-06 房东申请人详情 | R1 | landlord-test | `/landlord/applicants/<id>` | 四章（身份 / 收入 / 银行 / 信用+法庭）、「一键筛查」「录取 · 起草通知」「请 TA 补充材料」「不合适」；文件 `favicon-48.png`；`application-thread`；`decision-note` | node2 |
| D-07 租客申请列表 + 追踪条 | R1 | tenant-test | `/tenant/applications` | 4 行 `application-track`，新行「已提交 10-28 › 房东已查看（当前）…」，不出现分数；375 无溢出 | `lifecycleP1` |
| D-08 租客申请详情 | R1 | tenant-test | `/tenant/applications/<id>` | `application-detail-steps`、`application-next-step`「等房东打开你的申请」、材料 1 份、`application-thread` | node2 |
| D-09 申请包页 | R1 | tenant-test | `/tenant/passport` | 四段、无 SIN 字段、同意已勾、文件分组 + 新鲜度、「预览房东看到的样子」→ `sandbox=""` iframe、导出 / 分享按钮；375 无溢出；**不发给外部** | `v1stage4_passportPack` |
| D-10 登录后再开同一房源 | R2 | tenant-test | `/apply/test-77-…` | `apply-existing`「你已经在 2026-10-28 申请过」、提交禁用、姓名 / 邮箱预填；上轮 D-S3-2 的「申请包勾选区」不再出现 | `threeRoleReport` T-03 |
| D-11 「房东已查看」盖戳 | R1 | D-06 之后 SQL | `applications.viewed_at` | 房东打开详情后非空；租客追踪条第 2 步点亮 | P1 2026-09-23 |
| D-12 申请 → 事务主记录 | R2 | SQL | `rental_matters` | 新申请自动生成一件事务（地址 77 Sitetest，tenant_email = 申请邮箱） | `my_matters` |
| D-13 匿名 SQL 守卫（回滚） | R1 | 上轮 D-05/06 | 已归档 Realtor / 自家房源插申请 | 本轮不重跑（策略与触发器未改，D-02 的真实匿名提交已覆盖主路径） | — |

## 二、执行记录（2026-10-28 18:30–19:12 UTC · 多伦多 14:30–15:12）

| ID | 实际 | 证据 | 结果 |
|---|---|---|---|
| D-01 | `<title>`「申请 · [TEST] 77 Sitetest Rd, Toronto · Stayloop」（上轮 D-S3-1 已修）；摘要「你在申请 · [TEST] 77 Sitetest Rd, Toronto · $2,650/月 · 1 卧 · 1 卫」；测试标签「测试房源 · 非实际房源…」；21 个字段标签齐（名 * / 姓 * / 邮箱 * / 电话 * / 出生日期 / 现住地址 / 状态 / 雇主 * / 职位 / 月毛收入 (CAD) * / … / 期望入住）；材料 4 类「政府证件 / 近期工资单 / 银行对账单 / 在职证明信」；同意段 `data-province=ON`「…查询 Ontario 公开法庭记录…遵守《安大略省人权法典》」；「25 MB」1 处；1280 无溢出 | `d-anon.out` · `shots/d01-apply.png` | 通过 |
| D-02 | 填 `[TEST] / Round1028 / tenant-test@stayloop.ai / 4165550128 / [TEST] Sitetest Employer / 5200`，上传 `favicon-48.png` 到「政府证件」，勾同意 → `POST /rest/v1/applications` + `POST /rest/v1/rpc/attach_application_files`；页面「✓ 申请已提交 房东会尽快审阅你的申请并联系你…」；库：`374a0317-8b29-4c8f-a528-e7b4fea97d73` status new、files 1（`374a0317…/id/…favicon-48.png`，1,417 B）、consent_screening true、consent_credit_check false | `d-anon.out` D-02 · `shots/d02-submitted.png` · SQL | **通过（上轮 S0 D-S0-1 已修复并复测）** |
| D-03 | 两个 slug 均渲染「404 找不到对应房源 · 该房源可能已下架、未通过审核，或链接有误 · 浏览房源」；无 pageerror。注：这两页网络不会进入 idle（有轮询），脚本改用 domcontentloaded | `d-anon.out` D-03 | 通过 |
| D-04 | 空表单 `requestSubmit` → `checkValidity()=false`、0 个 applications / storage 请求；只缺电话 → 同样拦下；不勾同意 → `checkValidity()=true` 但页内红字「请勾选授权同意以继续。」、0 请求 | `d-anon.out` D-04 · `shots/d04-validation.png` | 通过 |
| D-05 | 「4 份申请 · 新申请 4」；对比表首行「[TEST] Round1028 · [TEST] 77 Sitetest Rd, Toronto · 2026-10-28 · $5,200 · [TEST] Sitetest Employer · 材料 1 · 无 · 未筛查 · 0 · 待决定」；卡片「材料 1 份 · 未筛查 · 0/4 章」；页面无 `NN/100` 分数（已评分的旧申请显示「43（参考）」属既有数据）；375 `scrollWidth=clientWidth=375` | `d-landlord.out` · `shots/d05-applicants*.png` | 通过 |
| D-06 | 详情页：「[TEST] Round1028 · 申请 · [TEST] 77 Sitetest Rd, Toronto · 今天提交」、四章未筛查、「筛查评分 — /100 还没有筛查…四项计分…」、按钮「🔍 一键筛查（复用申请材料）/ ✓ 录取 · 起草通知 / ✉ 请 TA 补充材料 / 📄 起草租约 / ✗ 不合适（需选理由）」、文件「ID favicon-48.png 1 KB」、`application-thread` 0 条、`decision-note`「选择录取或婉拒只是起草通知…」、RTA 提示 | `d-landlord.out` · `shots/d06-applicant-detail.png` | 通过 |
| D-07 | 4 条 `application-track`；新行「[TEST] 77 Sitetest Rd, Toronto 提交 2026-10-28 等待：房东已查看 · ● 已提交10-28 › ◉ 房东已查看 › ○ 筛查已发起 › ○ 房东决定…」；无分数；底部说明「筛查结果只有房东能看到，决定以邮件通知为准」；375 无溢出。注：`0a1da57b`（09-25）也仍停在「◉ 房东已查看」——见 D-11 | `d-tenant.out` · `shots/d07-tenant-applications.png` | 通过（D-11 另记） |
| D-08 | `application-detail-steps`「✓ 已提交 2026-10-28 · 房东已查看 轮到房东 · …」、`application-next-step`「下一步：等房东打开你的申请。」、「材料 1 份已提交」、`application-thread` 0 条、只追加说明 | `d-tenant.out` · `shots/d08-tenant-app-detail.png` | 通过 |
| D-09 | 四段 ①–④、「不收 SIN · 不问任何受保护特征」、每字段「自述」chip、③ 租史含两段「已核验 · 来自双方确认的租约」；文件 2/7 类（身份证件 1/6 到期 2029/5/1、工资单 1/6「12 天前 · 新」）；同意「已勾选 profile-v1-2026-10」；按钮「预览房东看到的样子 / 导出 PDF（打印）/ 生成分享链接 / 加入等候名单」；点预览 → iframe `sandbox=""`、srcDoc 6,535 字符（控制台提示脚本被 sandbox 拦，正确）；375 无溢出；未导出、未分享 | `d-tenant.out` · `shots/d09-passport.png` | 通过 |
| D-10 | `apply-existing`「你已经在 2026-10-28 申请过这套房源。查看申请进度 → 要补充材料或说明，请在那份申请的对话里告诉房东，不用再交一份。」；提交 `disabled=true`；`use-my-pack` 0（上轮 D-S3-2 已修：已申请时不再显示包勾选区）；预填「Test / tenant-test@stayloop.ai」 | `d-tenant.out` D-10 · `shots/d10-apply-signed-in.png` | 通过 |
| D-11 | **失败**。landlord-test 于 18:38 与 18:43 两次打开 `/landlord/applicants/374a0317…`，SQL 在 18:46 / 19:02 两次查 `viewed_at` 均为 null；租客追踪条「房东已查看」始终是「当前（◉）」而非完成。用同一 landlord JWT 直接 `PATCH /rest/v1/applications?id=eq.374a0317…&viewed_at=is.null {viewed_at}` → 200 并写入（RLS 与列权限都放行）。根因在 `app/landlord/applicants/[id]/page.tsx:169`：`void supabase.from('applications').update({ viewed_at }).eq('id', id).is('viewed_at', null)` —— supabase-js v2 的查询构造器只在 `await` / `.then()` 时才发请求，`void` 丢弃后**从未执行**（页面网络记录里也没有该 PATCH）。全库 8 份申请在我探针之前只有 1 份有 `viewed_at`。注意：我的探针把 `374a0317` 的 `viewed_at` 写成了 `2026-10-28T19:10:00Z`（数据副作用） | SQL · `d-landlord.out` · 代码 L167–169 | **失败 → D-D1** |
| D-12 | `rental_matters db51cac0-95f5-430f-a57d-ae17c9ccd5a4`（landlord 30d0c280 · tenant_email tenant-test@ · 地址 `[TEST] 77 Sitetest Rd, Toronto`）随申请自动建立；`/landlord/progress` 事务面板里有它（「申请 · 对话 1」） | SQL · `f-landlord-2.out` F-11 | 通过 |
| D-13 | 未重跑（见用例说明） | — | 未执行（有理由） |

统计：13 条 · 执行 12 · 通过 11 · 失败 1（D-11）· 未执行 1（D-13，守卫与触发器未变）。

## 三、缺陷

| 编号 | 严重度 / 优先级 | 一句话 | 复现要点 | 证据 | 建议 |
|---|---|---|---|---|---|
| D-D1 | S2 / P1 | 房东打开申请详情**从不**盖 `viewed_at`，租客追踪条「房东已查看」永远点不亮（除非之后筛查 / 决定把它顺带算完成） | landlord-test 打开 `/landlord/applicants/374a0317…` 两次 → SQL `viewed_at` null；同 JWT 直接 REST PATCH 成功 → 不是权限问题。`app/landlord/applicants/[id]/page.tsx:169` 的 `void supabase.from(...).update(...)` 没有 `await` / `.then`，supabase-js 构造器不会发请求 | SQL（19:02 null → 19:10 探针写入）· `shots/d07-tenant-applications.png`（0a1da57b 自 09-25 起也停在「房东已查看」） | 改成 `await` 或 `.then(() => {})`；加守卫扫描 `void supabase.from(` 且同行无 `.then`（见越界：`app/landlord/leases/new/page.tsx:447` 同病，`compliance_events` 里 `source='lease_terms'` 至今 0 行） |

## 四、观察

- D-01：`/apply/nope` 等 404 页网络不会 idle（持续轮询），对自动化不友好，功能正常。
- D-07：「房东已查看」在租客页是靠 `viewed_at || screened || decided` 推导，所以旧的已录取申请显示正常，只有「仅被查看」这一步缺失（D-D1）。

## 五、数据副作用（全部 `[TEST]`，不删）

- `applications 374a0317-8b29-4c8f-a528-e7b4fea97d73`：匿名提交，`[TEST] Round1028` / tenant-test@stayloop.ai / 4165550128 / $5,200 / `[TEST] Sitetest Employer`，1 个文件 `favicon-48.png`（storage `applications` 桶 `374a0317…/id/1793212520595_0_favicon-48.png`）。后续在 E 组被录取（status approved，`decision_notified_at 2026-10-28 18:44:41Z`）；`viewed_at` 由我的 REST 探针写入 `19:10:00Z`（页面本身没写）。
- `rental_matters db51cac0-95f5-430f-a57d-ae17c9ccd5a4`（随申请自动生成）。
- 魔法链接：tenant-test / landlord-test / provider-test 各 1 次（profile 保留在 scratchpad）。
- 无邮件、无模型调用。
