# D · 申请与申请包（2026-10-17 全站测试）

风险等级 R2（申请表四坑 2026-09-14；申请人追踪 P1；阶段 4 申请包 2026-10-16）。
现状（执行前查库）：tenant-test 对 `test-200-test-qa-lane-qa2`（muse-landlord）已有申请 `864bfca6…`（2026-10-16，files=2，status new）——本轮走「申请已存在」分支，不再新建；muse-tenant 对两套 QA Lane 各有一份 0 文件申请。魁北克在架房源 `1569-rue-st-hubert-…-mr33ii5a`。Realtor 行全部归档。
工具同 C。

## 用例

| ID | 风险 | 前置 | 步骤 | 期望 | 关联守卫 / 依据 |
|---|---|---|---|---|---|
| D-01 匿名申请页（安省） | R2 | 无头 Chrome 匿名 | `/apply/test-200-test-qa-lane-qa2` | 顶部房源摘要（照片 / 地址 / 租金 / 户型）+ 测试标签；字段：姓名 / 邮箱 / 电话（必填）/ 出生日期 / 现住址 / 入住日 / 雇佣（下拉）/ 雇主 / 收入 / 前房东 / 同住人数 / 宠物 否是 / 吸烟 否是 / 备注；材料区 5 类含「身份证件」；同意文案含《安大略省人权法典》与 PIPEDA；上传上限文案 25 MB | `fixList` `siteTest_g*` |
| D-02 匿名申请页（魁北克） | R2 | 同上 | `/apply/1569-rue-st-hubert-…` | 材料区无「身份证件」；文案含 CAI 指引；出生日期标「仅用于你同意的信用查询」；同意文案为魁北克版（P-39.1 / 人权宪章），无「安省公开法庭记录」；无 TRESA 披露 | `provinceListing20261002` |
| D-03 申请页不存在 / 已归档 / Realtor | R2 | 匿名 | `/apply/nope`、`/apply/609-195-mccaul-street-toronto-hi7la`（已归档 realtor） | 前者「找不到」；后者 404（已下架）——若在架才会 `apply-realtor-refused` | |
| D-04 表单校验 | R2 | 匿名 | 不填必填点提交；不勾同意点提交；电话空 | 对应错误提示，不发请求 | 10-01 「申请表电话改为必填」 |
| D-05 Realtor 房源 DB 守卫 | R1 | SQL 回滚 | `begin; set local role anon; insert into applications(listing_id=<归档 realtor id>, …)` | 抛 `realtor_listing`；rollback | `siteTest20261002` `guard_listing_accepts_requests` |
| D-06 自家房源 DB 守卫 | R1 | SQL 回滚 | 以 muse-landlord claims 插 `applications(listing_id=test-200)` | 抛 `own_listing` | `guard_not_own_listing` |
| D-07 匿名 INSERT 不带 returning | R2 | SQL 回滚 | anon 对 test-200 插一条完整申请（客户端生成 uuid、`Prefer: return=minimal` 语义） | 成功（无递归 42P17）；`select` 回读被 RLS 拒（0 行） | 09-14 四坑 |
| D-08 登录后预填 + 申请已存在 | R2 | tenant-test 魔法链接 | `/apply/test-200-…` | 姓名 / 邮箱预填；`apply-existing` + `apply-locked`（已有申请 → 表单锁定、只处理文件）；`use-my-pack` 块显示 | `threeRoleReport` T-03 |
| D-09 一键填入申请包 | R2 | 同上 | 点「用我的申请包填写」 | 只填空字段；列出包里文件（fresh 默认勾、aging 不勾）；已存在申请时提交只走文件分支（不新建行） | `v1stage4_applyPack` |
| D-10 提交（已存在分支） | R2 | 同上 | 不勾新文件直接提交 / 勾 1 个包文件提交 | 「已有文件不重复发送」；若 attach 走 `/api/profile/attach` 对旧申请（>1h、已有 files）→ 409 `application_too_old` / `application_has_files` 被页面翻成人话，不崩 | attach route |
| D-11 租客申请列表 + 追踪条 | R2 | tenant-test | `/tenant/applications` | `application-track` 每行步骤「已提交 → 房东已查看 → 筛查已发起 → 决定 → 租约待签 → 在管租约」；**不出现分数**；下架房源显示地址 + 已下架；「详情 →」 | `lifecycleP1` grep `ai_score` |
| D-12 申请详情页 | R2 | tenant-test | `/tenant/applications/864bfca6…` | `application-detail-steps`、`application-next-step`（轮到房东）、材料份数、申请对话 `application-thread`；无分数 | node2 |
| D-13 申请包页 | R2 | tenant-test | `/tenant/passport`：四段表单（无 SIN 字段）、文件分组 + 新鲜度标签、同意勾选、「预览」iframe `pack-preview-frame`、「导出 PDF」、分享链接块 | 未勾同意时预览 / 导出 / 一键填入禁用；勾后可用；预览 srcDoc sandbox | `v1stage4_passportPack` |
| D-14 上传 / 删除自己的文件 | R2 | tenant-test JWT | `POST /api/profile/files`（kind=other, 小 PNG）→ 200 `file`；同文件再传 → `duplicate:true`；`DELETE ?id=` → 200；再删 → 404 | 幂等；桶对象在 `profile/<uid>/other/`；审计 `applicant_pack_file_added / removed` | files route |
| D-15 `/api/profile/*` 边界 | R2 | 匿名 / JWT | 匿名 POST → 401；`kind=bogus` → 400；`package.json` → 415；空文件 → 400；`as_of=2026/1/1` → 400；DELETE 非 uuid → 400；attach 匿名 → 401；attach 坏 json → 400；attach 他人 id → 404；attach 旧申请 → 409 | 状态码如期 | files / attach route |
| D-16 超限（设计读） | R3 | 代码 | 每类 6 / 总 20 / 25 MB / 30 次每小时 | 不真打；读代码确认 `kind_limit` 422、`total_limit` 422、413 | |
| D-17 匿名签 URL / 读表 | R1 | anon key | `applicant_profile_files` select → 401；storage 签 `profile/<uid>/…` → 400/403 | 被拒 | 阶段 4 |

## 执行记录

证据目录 `scratchpad/sitetest1017/D/`（`anonB.mjs` / `anonB.out` + `d0*.png` 匿名申请页；`anonB2.mjs` 匿名真实提交复现；`tenantD.mjs` / `tenantD.out` + `d1*.png` 租客登录；JWT 探针输出在本节内联）。接口探针在 `../C/probe.out` 末段。

| ID | 实际 | 证据 | 结果 |
|---|---|---|---|
| D-01 | 英文版：顶部 `apply-listing-summary`「[TEST] 200 Test QA Lane · Toronto · $2,300/mo · 1 bd · 1 ba」+ 测试标签「an application here will not lead to a real tenancy」；字段 FIRST / LAST / EMAIL / PHONE 四个 `*`、DOB、现住址、STATUS 下拉（Full-time … Other）、EMPLOYER * / 收入 * / START DATE / 雇主电话、前房东四项、OCCUPANTS、ANY PETS? No/Yes、SMOKER? No/Yes、DESIRED MOVE-IN；材料 4 类（Government ID / pay stubs / Bank statement / Employment letter）；同意文案 `data-province=ON`「search Ontario public court records … Ontario Human Rights Code」+ PIPEDA 标；「25 MB max each」。**注意** `<title>` 仍是首页的「Stayloop — 租房的 AI 操作系统 · The AI-native rental OS for Toronto」 | d01-apply-on.png · anonB.out d01 | 通过（D-S3-1） |
| D-02 | 蒙特利尔页：`apply-quebec-limits`；材料只有 3 类（无 Government ID）；DOB 标「ONLY FOR A CREDIT CHECK YOU CONSENT TO」；STATUS 多一项「Prefer not to say」；雇主 / 收入「optional」；同意文案 `data-province=QC`：Charter of human rights and freedoms、CAI 指引（不得复印证件、不需要 SIN / 驾照号 / 健康卡号、不得因拒给证件号拒绝）、「search public records」而非「Ontario public court records」；无 TRESA 披露 | d02-apply-qc.png · anonB.out d02 | 通过 |
| D-03 | `/apply/nope`、已归档 Realtor slug、`[TEST] 100 Test Ave`（下架）→ 页面「404 Listing not found · This listing may have been taken down, is not yet verified, or the link is incorrect · Browse listings」，接口 404，无 JS 异常；`apply-realtor-refused` 分支因 Realtor 行全部归档无法到达（接口先 404） | anonB.out d03_* | 通过 |
| D-04 | 空表单 `requestSubmit` → 原生 `required` 拦下（`form.checkValidity()=false`），无网络请求；填完其余必填只留电话为空 → 仍被原生校验拦下、无请求；代码里另有 `phoneLooksValid`（≥7 位数字）的二道闸 | anonB.out d04_* | 通过 |
| D-05 | 回滚事务（tenant-test claims）：向已归档 Realtor 行 `609-195-mccaul-street-toronto-hi7la` 插申请 → `P0001 realtor_listing: … cannot be applied to or requested on Stayloop`（`guard_listing_accepts_requests`） | execute_sql | 通过 |
| D-06 | 回滚事务（muse-landlord claims）：向自家 QA Lane 插申请 → `P0001 own_listing`（`guard_not_own_listing`） | execute_sql | 通过 |
| D-07 | **失败**。回滚事务 `set local role anon` 插一条完整申请（客户端 uuid、不 returning）→ `42501 permission denied for table listings`；用 anon key 经 REST `POST /rest/v1/applications`（`Prefer: return=minimal`）→ 401 同一错误。原因：`applications` 的 anon INSERT 策略「Public can insert applications (constrained)」的 WITH CHECK 里直接 `EXISTS (SELECT 1 FROM listings l WHERE l.id = applications.listing_id AND coalesce(l.is_active,true))`，策略子查询以当前角色执行，而 2026-10-11 `20261011_listings_anon_no_select.sql` 撤销了 anon 对 `listings` 的 SELECT → **匿名申请自 10-11 起全部失败**。登录用户不受影响（authenticated 经 RLS 能读在架房源；同事务用 tenant-test claims 插入成功、`applicant_applications` 视图读回 1 行）。`pg_policies` 扫描：引用 `listings` 且对 anon/public 生效的策略只有这一条。浏览器真实提交的用户可见表现见 B2 记录 | execute_sql · ../C/probe.out · D-S0-1 | **失败** |
| D-14 | tenant-test JWT：`POST /api/profile/files`（kind=other，favicon-48.png 1,417 B）→ 200 `file{id a4302016…, path profile/<uid>/other/e20f4d2b-favicon-48.png, sha256 e20f4d2b…}`；同文件再传 → 200 `duplicate:true` 同 id；`DELETE ?id=` → 200；再删 → 404；审计 `applicant_pack_file_added` / `applicant_pack_file_removed` 各一行（acting_role tenant，metadata.kind other） | probe 输出 · execute_sql | 通过 |
| D-15 | 匿名 POST files / DELETE / POST attach → 401 `sign_in_required`；`kind=bogus` → 400 `bad_kind`；`package.json` → 415 `file_type`；空文件 → 400 `empty`；`as_of=2026/1/1` → 400 `bad_as_of`；JSON 体 → 400 `multipart form required`；DELETE `id=x` → 400；DELETE 随机 uuid → 404；attach 坏 JSON → 400；`file_ids:[]` → 400；attach 自己 10-16 的旧申请（已有 2 个文件）→ 409 `application_too_old`（创建 >1h 的检查先于「已有文件」）；attach muse-tenant 的申请 → 403 `not_your_application`；不存在的申请 → 404 | ../C/probe.out 末段 · 本节内联输出 | 通过 |
| D-16 | 代码核对：每类 6（`kind_limit` 422）、总 20（`total_limit` 422）、25 MB（413）、每用户每小时 30 次 fail-closed | files route · types.ts | 通过（代码核对） |
| D-17 | anon key 读 `applicant_profile_files` → 401 `42501`；anon 对真实对象 `profile/<tenant-test uid>/id/1888459e-favicon-16.png` 签 URL → 400 `NoSuchKey`（策略不放行时 Storage 以「对象不存在」回答，不泄露存在性）；本人 JWT 签同一路径 → 200 `signedURL` | ../C/probe.out · D 组探针 | 通过 |
| D-08 | tenant-test 魔法链接登录后打开 `/apply/test-200-…`：姓名预填「Test / Tenant」、邮箱预填（d08 截图）；`apply-existing`「You already applied to this listing on 2026-10-16. See its progress →」+ 引导去申请对话；`use-my-pack` 块显示（2 / 20 max）；`apply-locked` **不出现**——代码里它只在本页刚建好申请（`createdAppId`）后才渲染，已有申请的分支靠「提交按钮禁用」而非锁表单（`page.tsx:918`，`inputsDisabled 0/26`，表单字段仍可编辑）。用例期望里的 `apply-locked` 按代码属于另一分支，按设计 | d08-apply-signed-in.png · tenantD.out d08 · page.tsx:706-735,918 | 通过（D-S3-2） |
| D-09 | 点「Fill from my pack」→「6 fields filled in — please check them below.」；包内文件 2 个：Government ID（Recent，as of 2029-05-01）、Pay stubs（Recent，uploaded 2026-10-16），fresh 默认勾选；按钮可用；填入前姓名 / 邮箱已有值未被覆盖。aging 文件不勾只能代码核对（包里没有 aging 文件）。已存在申请时页面不新建行 | tenantD.out d09 · d10-after-submit.png | 通过（aging 勾选未实测） |
| D-10 | 已有申请：提交按钮 `disabled`（`disabled={… (!!existingApp && !createdAppId)}`），点击后无 `/rest/v1/applications`、无 `/api/profile/attach`、无 rpc 请求，URL 不变、无控制台错误。即「已存在分支」不会走文件分支——文件只能在申请对话里补；页面却仍展示「勾选的文件会在提交时复制进申请」的包文案，勾选无处可提交。409 `application_too_old` / `application_has_files` 的页面翻译在 UI 里无法触达（接口层 D-15 已验证 409） | tenantD.out d10（apps/attach/rpc 全空）· d10-after-submit.png | 部分通过（D-S3-2） |
| D-11 | `/tenant/applications` 3 行，每行 `application-track` 六步：第 1 行 QA Lane「Submitted 10-16 › Landlord opened it › Screening started 10-18 › Approved 10-18 › ○ Lease to sign › ○ Managed tenancy」；第 2 行「1001 Bay St #1618」标「Off market」、卡在「Landlord opened it」；第 3 行 `[TEST] 100 Test Ave #1` Off market、全部完成「Managed tenancy」+「Open the tenancy」；每行「Details →」与「Message the landlord」；页内无分数（`scores: []`）；底部说明「房东发起的动作才点亮…决定通过邮件送达」。375 宽 `scrollWidth==clientWidth`。注：第 1 行的 10-18「已筛查 / 已录取」是其他测试组（E/F）在本轮产生的数据，不是执行前状态 | d11-applications.png · tenantD.out d11 / d11_375 | 通过 |
| D-12 | `/tenant/applications/864bfca6…`：`application-detail-steps` 六步（前四步 ✓、后两步 ·）、材料「2 submitted」、`application-thread` + `thread-panel`，线程里有 1 条「房东 · 决定通知 / FORMAL COPY」中英双语（10-17 11:39 pm）；无分数。`application-next-step` **未渲染**：申请已被录取（他组数据），无「轮到房东」状态，按状态机属正常；「轮到房东」文案本轮无法在该申请上观察（其余两申请未开详情页） | d12-application-detail.png · tenantD.out d12 | 通过（next-step 因状态已变未验） |
| D-13 | `/tenant/passport`：四段「① Identity（标注 No SIN · no protected grounds）/ ② Employment & income / ③ Rental history / ④ Other」，字段无 SIN，每字段「SELF-DECLARED」chip，已验证区「VERIFIED · from leases both sides confirmed」（`tag-verified`）；Files 分组按类别计数、`freshness-fresh`；`profile-consent` 文本 + 复选框（本号已勾，`profile-v1-2026-10`）；「Preview what a landlord sees」→ `pack-preview-frame` `sandbox=""`（最严）、srcDoc 7,165 字符、无 `<script>`；「Export PDF (print)」→ `window.open` blob 页 + 审计 `agent_audit_events` 201；分享链接块（`stayloop.ai/p/<token>`）与「Report rent to the credit bureau」块在；375 宽无溢出。**未验**：同意未勾时预览 / 导出 / 一键填入禁用（此号已有同意，撤回同意会改变测试号数据，未做） | d13-passport.png · d13-preview.png · d13-passport-375.png · tenantD.out d13* | 通过（同意禁用态未验） |

## 缺陷

| 编号 | 严重度 / 优先级 | 一句话 | 复现要点 | 证据 | 建议 |
|---|---|---|---|---|---|
| D-S0-1（= D-07） | S0 / P0 | 匿名申请自 2026-10-11 起全部失败（42501 permission denied for table listings） | anon 对 `applications` 插一条完整申请（`Prefer: return=minimal`）→ 401 `42501`；策略「Public can insert applications (constrained)」的 WITH CHECK 子查询读 `listings`，而 `20261011_listings_anon_no_select.sql` 撤了 anon 对 `listings` 的 SELECT；登录用户不受影响 | execute_sql 回滚事务 · `../C/probe.out` · `b2-anon-submit.png` | 把「listing 在架」判断包成 SECURITY DEFINER 助手（`listing_accepts_applications(uuid)`）供策略调用；修复迁移已在写（`20261018_site_test_s0s1.sql`，未上线）；上线后补一条匿名提交的回归 |
| D-S3-1 | S3 / P3 | 申请页 `<title>` 是首页的中文 + 英文长标题，不随页面 / 房源变化；`/tenant/*` 页 title 是「租客的 AI 助理 · Stayloop」而界面是英文 | 匿名开 `/apply/test-200-test-qa-lane-qa2`，读 `document.title` | anonB.out d01 · tenantD.out（d11 / d12 / d13 的 `ov.title`） | 申请页用房源地址作 title；英文界面用英文 title（与 C-S3-3 同类） |
| D-S3-2 | S3 / P3 | 已申请过的房源页仍显示「我的申请包」与「勾选文件会在提交时复制进申请」，但提交按钮被禁用，勾选的文件没有出口 | tenant-test 开已申请的 `/apply/test-200-…`，勾文件、点提交：无任何请求发出；文件只能去申请对话补 | d08 / d10 截图 · tenantD.out d10 · `page.tsx:706-735,918` | 已有申请时隐藏 `UseMyPack` 的文件勾选区，或在该区写明「已申请，请在对话里附上文件」；或让已有申请（<1h、无文件）可走 `/api/profile/attach` |

本组对生产库**无新增写入**（D-05 / D-06 / D-07 均为 `begin … rollback`；D-08–D-13 只读 + 页内「Fill from my pack」只改表单状态，未提交）。
- D-14：`POST /api/profile/files` 建立并随即 `DELETE` 一个 `profile/<tenant-test uid>/other/` 对象（`favicon-48.png`，id `a4302016…`），留下两条审计 `applicant_pack_file_added / removed`（tenant-test）。
- D-13「Export PDF」写入一条审计事件（`agent_audit_events`，tenant-test）。
- D-08 / D-13 的魔法链接登录会话属于 tenant-test；同号在别处退出会全局作废。
- 他组数据：申请 `864bfca6…` 在本轮由 E/F 组置为 Approved（10-18），并产生一条「决定通知」线程消息；D-11 / D-12 的观察已反映这个状态。
- 登记，不删。
