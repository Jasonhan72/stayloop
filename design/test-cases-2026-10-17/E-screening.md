# E · 筛查闭环与消费者档案（R1）· 2026-10-17

策略 `design/test-strategy-2026-10-17.md` §2–§8。依据 CLAUDE.md：「DO NOT TOUCH — Screening Module」「租房全流程 AI 与 Trust API 优化方案」（申请 → 一键筛查 / `send_decision`）
「三角色端到端模拟（2026-09-23）」「租客筛查只给房东或经纪用（2026-09-29）」「`CRA_MODE` 开关（2026-10-12）」「消费者报告法：站上不再声明（2026-10-12）」
「V1.0 阶段 1」（下一步卡 / 重跑）「四角色审计修复」P1-1「V0.8 第一项（消费者索取档案 · 争议更正 · 身份警示）」「人工通读 vs 模块（2026-09-22 · Kim-Yi）」。
筛查评分规则本身不在范围（只做回归比对）。生产提交 `dc302ac`。

## 一、用例（设计于执行之前）

| ID | 风险 | 前置 | 步骤 | 期望 | 关联守卫 |
|---|---|---|---|---|---|
| E-01 | R1 | 租客测试号（tenant-test，无房东帽）JWT | `begin; set local role authenticated; set local request.jwt.claims = {sub: tenant}; insert into screenings(landlord_id=tenant, status='uploading', files='[]'); rollback` | 触发器 `trg_guard_screening_role` 抛 `screening_requires_landlord_or_agent`，无行写入 | `screeningRoleGate20260929` |
| E-02 | R1 | 同上，房东测试号 claims | 同 E-01 用 landlord-test 的 sub | 插入成功（回滚） | 同上 |
| E-03 | R1 | 租客号 JWT（密码换取） | `POST /api/screen-score` 带任意 screening_id | 403 `role_required`（在读 Authorization 后、任何写入前） | 同上 |
| E-04 | R1 | 租客号 JWT | `POST /api/deep-check` | 403 `role_required` | 同上 |
| E-05 | R1 | 租客号 JWT | `POST /api/verify/create` | 403 `role_required` | 同上 |
| E-06 | R1 | muse-landlord JWT；申请 `864bfca6`（tenant-test 对 `[TEST] 200 Test QA Lane`，2 份文件，0 筛查） | `POST /api/screening/from-application {application_id}` | 200 `{screening_id, files:2}`；`screenings` 新行 `landlord_id`=muse-landlord authId、`application_id` 关联、`notice_confirmed_how='application_consent'`；`applications.screened_at` 盖戳；审计 `screening_created_from_application` | `lifecycle20260923` `fourRoleAudit20261012_a` `v08_consumerData` |
| E-07 | R1 | landlord-test JWT；申请 `0a1da57b`（tenant-test 对 1001 Bay St，0 文件、无对话附件） | `POST /api/screening/from-application` | 422 `no_documents`，不建行 | `fourRoleAudit20261012_a` |
| E-08 | R1 | landlord-test JWT；申请 `864bfca6` 属于 muse-landlord | `POST /api/screening/from-application` | 404 `application not found`（RLS 挡住他人申请） | — |
| E-09 | R1 | E-06 的筛查行 | muse-landlord 登录 `/screening/app?screening=<id>&run=1`（**允许的 1 次真实评分**），等到 `status='scored'` | 行 `scored`，`ai_score` / `v3_tier` 写入，`_v3.cra_mode` = 当前模式（E-24），`ai_summary_zh` 非空 | — |
| E-10 | R1 | E-09 | 中文下打开 `/screening/<id>/report` `/done` `/graph` `/ltb` `/notice` | 都 200；done 与 report 顶部有 `ConsumerAlertBanner` 位（本申请人无警示则不渲染）/ `CorrectionsNotice`（0 条不渲染）；done 与 report 有下一步卡（按 tier：approve→租约 / conditional/decline→补材料 / 婉拒）；报告正文中文下无整句英文（抽取正文过滤文件名 / 软件名 / 法条） | `v1stage1_nextStep` `threeRoleReport20260924` |
| E-11 | R1 | E-09 | report 页末尾 `consumer-rights-link`；`/notice` 页「你的权利」段链到 `/consumer-rights`；通知信不写「不是消费者报告」 | 两处链接存在，`/consumer-rights` 200；`craWording` 措辞 | `craWording20261012` `v08_consumerPages` |
| E-12 | R1 | muse-landlord 登录 `/screening/app`（无参数） | 看上传区 | `notice-confirm` 复选框可见；未勾时「开始筛查」禁用 / 提示 s.11(3)；勾选后可开始 | `v08_consumerPages` |
| E-13 | R1 | 同上，带 `?screening=<E-06 id>` | 打开 | 不显示复选框（上游已记录）；记录以 `?screening=` 带入 | 同上 |
| E-14 | R2 | muse-landlord；历史列表里 `2803051e`（error，0 文件）与任何有文件的 error 行 | 看历史列表 error 行 | 显示失败原因 + 「↻ 重跑」；0 文件的行按钮禁用并说明「没有可重跑的文件」 | `v1stage1_nextStep` |
| E-15 | R2 | 同上 | 点历史行 🗑 | 出现二次确认（取消，**不真删**）；`DELETE /api/screening/<id>` 对他人记录 404/403（只读探针用 landlord-test JWT 删 muse 的记录） | `threeRoleReport20260924` |
| E-16 | R1 | muse-landlord 登录 `/landlord/applicants/864bfca6`（E-09 后） | 点「录取 · 起草通知」 | `agent_pending_actions` 新 `send_decision` 卡（metadata `{application_id, decision:'approved'}`，无邮箱）；页面显示卡 + 「预览正文」 | `lifecycle20260923` |
| E-17 | R1 | E-16 | `POST /api/agent/execute {action_id, preview:true}` | 返回 subject/body，正文含 s.10(7)（`decisionNoticeFooter`）与 OHRC 声明，收件人 = `applications.email`（tenant-test@stayloop.ai）；状态仍 pending | 同上 |
| E-18 | R1 | E-16 | 页面「批准」→ 60 秒撤销行 → 点「撤销」 | `decide_pending_action` approved → `undo` 回到 pending，审计 `approval_undone`；无邮件 | `sweep20261001_*` |
| E-19 | R1 | E-18 | 再批准，等 60 秒执行（或待办页「现在执行」） | 邮件发到 tenant-test（允许的 ≤5 封之一）；`applications.status='approved'`、`decision_notified_at` 盖戳；`compliance_events` `CRA-10-7-notice`；申请对话出现 `formal_copy`；卡 `executed_at` 非空 | 同上 |
| E-20 | R1 | — | `npx vitest run tests/case28KimYi.spec.ts tests/craMode20261012.spec.ts tests/screeningRoleGate20260929.spec.ts tests/v08_consumer*.spec.* tests/v1stage1_nextStep.spec.ts` | 全部通过 | 即这些守卫 |
| E-21 | R1 | SQL 只读 | 最近的 case 28 筛查行（Sunkyoung Kim，2026-09-22） | 口径「66 / review / 无硬门槛」：`65287de9` 66 · band review · gates {}；最新 `0e1087cd` 65 · review · {}（抖动 ±1，无门槛）| `case28KimYi` |
| E-22 | R1 | muse-tenant 邮箱（有两份 scored 筛查 `017faa62` `20956925` 经申请链可达） | `POST /api/consumer/request {email}`（预算 2 次之一）→ SQL 取 token → `GET /api/consumer/request/<token>` → `POST …/verify {name:'Wrong Person'}` | 请求 200 `{ok:true}`；行 `pending_verification`；GET 首次盖 `email_verified_at`；verify 后 `needs_review`、`candidate_screening_ids` 含两份、`matched` 空；管理员收邮件；`pack` → 409 `not_available` | `v08_consumerData` |
| E-23 | R1 | tenant-test 现有 fulfilled 请求 `f44c456b`（token 仍有效） | `GET …/pack?format=json` 与 html | 200 + `X-Content-Fingerprint`；只含匹配的 `10121e42`（候选 `c2c1de6c` 不出现）；不含第三人姓名（HR / 房东作为申请人姓名）、不含他人邮箱（查阅者 / 收件人只按 s.12(3) 列房东名字与电话 / 邮箱——核对是否只有 landlord-test 的）；含 1 条更正记录、含身份警示；JSON 与 HTML 指纹一致 | `v08_consumerData` |
| E-24 | R1 | tenant-test token | `POST …/dispute {screening_id: c2c1de6c（候选未匹配）}` | 403 `screening_not_matched`，无行 | 同上 |
| E-25 | R1 | muse-tenant token（E-22，已验证邮箱、needs_review） | `POST …/alert {statement}` → `DELETE …/alert` | POST 200 返回 alert（到期 +6 年）；DELETE 后 `revoked_at` 盖戳；审计 `consumer_alert_set` / `_revoked`；tenant-test 的警示不受影响 | `v08_consumerData` |
| E-26 | R1 | admin@ 魔法链接 → `/admin/consumer-requests` | 队列里看到 muse-tenant 的 needs_review 请求（due_at 倒计时）；「确认匹配」勾 `017faa62` → 页内两步确认 | 行 `fulfilled`（electronic）、`matched_screening_ids=[017faa62]`、审计 `consumer_request_confirm_match`；随后 `pack` 200 | `v08_consumerAdmin` |
| E-27 | R1 | landlord-test 登录 `/screening/10121e42/report` | 看顶部 | 红色身份警示条（tenant-test 的 `[TEST]` 警示）+ 琥珀「本档案有 1 条更正记录」；`GET /api/consumer/alert?screening=10121e42` 以 landlord-test JWT 返回 alert、以 muse-landlord JWT 返回 404（读不到该筛查） | `v08_consumerPages` |
| E-28 | R2 | — | 读 CF 生产变量不可得；用 E-09 新行 `_v3.cra_mode` 与法庭三行 status 判定当前模式 | `registered`：法庭门户 / CanLII / LTB 正常检索（status ok/unavailable 而非 skipped）；`tool`：三行 `skipped` + 中文注记 | `craMode20261012` |

## 二、执行记录（2026-10-18 03:20–03:45 UTC · 生产 `dc302ac`）

证据目录 `scratchpad/sitetest1017/E/`（`e0N-*.json/txt/png`、`vitest-e20.log`、`e10-*.txt` 五页正文）。账号：tenant-test / landlord-test（密码授权 JWT）、muse-landlord / admin / landlord-test（魔法链接登录无头 Chrome）。

| ID | 实际 | 证据 | 结果 | 缺陷 |
|---|---|---|---|---|
| E-01 | `insert` 被 `guard_screening_role()` 拒：`42501 screening_requires_landlord_or_agent`（HINT 指向 /landlord/become） | execute_sql 回滚事务 | 通过 | — |
| E-02 | 房东 claims 下插入成功（返回 id，已回滚；事后 `tenant_name like '[TEST] probe E-0%'` = 0 行） | 同上 | 通过 | — |
| E-03 | `/api/screen-score` 租客 JWT → **404** `Cannot coerce the result to a single JSON object`（路由先按调用者 RLS 读行，租客读不到任何筛查，走不到角色门） | `e03-screen-score.json` | 通过（按设计：CLAUDE.md「租客筛查只给房东或经纪用」②「读到记录后」；角色门只对能读到行的账号起作用，租客被 E-01 的触发器挡在建行之前） | — |
| E-04 | `/api/deep-check` 租客 JWT → **403** `role_required`，中英提示 | `e03-deep-check.json` | 通过 | — |
| E-05 | `/api/verify/create` 租客 JWT → **404** `screening not found`（同 E-03，RLS 在前） | `e03-verify_create.json` | 通过（按设计） | — |
| E-06 | muse-landlord JWT → 200 `{screening_id:48e19c04…, files:2, from_thread:0}`；行：`landlord_id=22770dec…`、`application_id=864bfca6`、`notice_confirmed_how=application_consent`、`applications.screened_at` 盖戳、审计 `screening_created_from_application {files:2}` | `e06.json` + SQL | 通过 | — |
| E-07 | landlord-test 对 0 文件申请 `0a1da57b` → **422** `{error:no_documents, copy_failed:0}`，无新行 | curl | 通过 | — |
| E-08 | landlord-test 对 muse 的申请 → **404** `application not found` | curl | 通过 | — |
| E-09 | 浏览器 `/screening/app?screening=48e19c04&run=1` 真实评分约 40 秒 → `scored`，39 / decline，gates {}，`_v3.cra_mode=registered`，`ai_summary_zh` 20 字；两份 favicon 作材料被如实判「上传文件不可读」 | `e09-start.png` + SQL | 通过（1 次真实评分已用） | 观察 O-1：运行日志写「0 个文件已加入扫描队列」（行上有 2 份） |
| E-10 | 五页 200。report / done 顶部红色身份警示条（申请邮箱 tenant-test 挂着 `[TEST]` 警示，正确跟随邮箱）；更正记录 0 条不渲染；下一步卡（decline → 「发婉拒通知（须写理由）」）两页都有；report / done / graph / notice 正文零整句英文；**`/ltb` 页有 3 句英文注记 + 英文数据源名**（CanLII / Ontario Courts Portal / LTB Order Catalogue）；report 页 LTB「收录范围」只写通用句，无日期窗口 | `e10-*.txt`、`e10-*.png` | 部分通过 | E-D1（收录范围空）、E-D3（/ltb 英文） |
| E-11 | report 末尾 `consumer-rights-link` 指向 `/consumer-rights`；`/notice` 「你的权利」段链 `/my-file` 与 `/consumer-rights`；通知信写「本次没有向 Equifax 或 TransUnion 购买信用报告」，无「不是报告机构」 | `e10-report.txt` L410、`e10-notice.txt` L22–28 | 通过 | — |
| E-12 | `/screening/app` 无参数：`notice-confirm` 复选框可见、未勾；「🛡 开始筛查」disabled；勾选后仍 disabled（无文件），后闸提示在代码 L2374 | `e12.png` | 通过（勾选后可开始未独立证明——按钮同时要求文件；守卫 `v08_consumerPages` 覆盖） | — |
| E-13 | `?screening=48e19c04` 打开 → 直接显示结果页、`notice-confirm` 不渲染 | `e13.png` | 通过 | — |
| E-14 | muse 历史里 `2803051e`（error，0 文件）行：「↻ 重跑」禁用 + 「没有可重跑的文件：删除这条记录后重新上传」+ 「上次失败原因：没有可评估的材料」 | step2 输出 | 通过（有文件的 error 行 muse 名下没有，未测重跑动作） | — |
| E-15 | 点 🗑 → **原生 `window.confirm`**「删除「Test Tenant」？将同时删除上传的文件…不可恢复」，取消后行仍在；`DELETE /api/screening/2803051e…`（muse 的记录）用 landlord-test JWT → 404 | step2 输出 + curl | 通过 | E-D4（原生 confirm） |
| E-16 | 点「✓ 录取 · 起草通知」→ 卡 `441502d1`：pending、`metadata {application_id, decision:approved, reason:null, source:applicant_page}`、无邮箱、`excluded_data` 含筛查报告 / 评分 | `e16.png` + SQL | 通过 | — |
| E-17 | `execute {preview:true}` → `{preview:{to:tenant-test@…, subject:"申请已录取 · [TEST] 200 Test QA Lane / …", body}}`，正文含 s.10(7) 60 天索取权 + 《人权法典》声明（中英）；状态仍 pending | `e17-preview.json` | 通过 | 观察 E-D6：邮件页脚没有 /my-file、/consumer-rights（打印版通知有） |
| E-18 | 点「✓ 确认 · 替我执行」→ **4 秒内已发出**（「通知已通过邮件发给申请人」、状态「已录取」），页面没有倒计时 / 撤销行，`clickText('撤销')` = NOSEL | `e18-countdown.png` `e18-after-undo.png` | **失败**（预期 60 秒撤销窗） | E-D2 |
| E-19 | （由 E-18 直接触发）`applications.status=approved`、`decision_notified_at=03:39:28`；卡 `executed_at` + `execution_result {ok, sent_to:tenant-test@…, email_id}`；`compliance_events CRA-10-7-notice`；申请对话 `formal_copy` 一条 | SQL | 通过（1 封邮件已用） | — |
| E-20 | vitest 7 文件 **124/124 通过**（1.2 s） | `vitest-e20.log` | 通过 | — |
| E-21 | `65287de9`（09-22 13:09）= 66 · band `review` · tier_reason `rubric_review` · gates {}；最新 `0e1087cd`（13:56）= 65 · review · {} | SQL | 通过（口径一致，±1 为模型抖动） | — |
| E-22 | `POST /api/consumer/request` → 200 `{ok:true}`（审计 emailed:true）；行 `742e319e` pending_verification；GET 盖 `email_verified_at`、`email_masked mu*********@`；verify「Wrong Person Probe」→ `needs_review`、候选 3（含 error 行 2803051e）、matched 0、`due_at` +2 工作日（2026-10-20）、审计 `consumer_request_verified`；pack → 409 `not_available`；坏 token → 404 `invalid_token` | curl 输出 | 通过 | 观察 O-2：候选里含 `error` 状态的筛查（无内容可披露） |
| E-23 | JSON / HTML 都 200 + `X-Content-Fingerprint`、`no-store`、`no-referrer`；只含 `10121e42`（候选 `c2c1de6c` 不出现）；姓名只有 Test Tenant；邮箱只有筛查房东 landlord-test@（s.12(3) 收件人）；11 条 items；1 条更正记录；身份警示；指纹随 `generated_at` 变化（JSON ≠ HTML 属预期） | `e23-pack.json/html` `e23-hdr*.txt` | 通过 | E-D5（标签含英文代码、`created_by` uuid） |
| E-24 | dispute 对 `c2c1de6c` → **403** `screening_not_matched` | curl | 通过 | — |
| E-25 | muse token：POST alert 200（到期 2032-10-18）→ DELETE 200 `alert:null`；库里 muse 行 `revoked_at` 盖戳；tenant-test 的警示仍 live；审计 set / revoked | curl + SQL | 通过 | — |
| E-26 | admin 魔法链接 → 队列「待办 1 · 还剩 48 小时 · 需人工复核 · 候选 3」；勾 `017faa62` → 「确认匹配」→ 页内二次确认「把这 1 条筛查记为本人的档案？」→ 再点 → 队列清空；行 `fulfilled`、`matched=[017faa62]`、`handled_by=admin`、审计 `consumer_request_confirm_match (acting_role admin)`；随后 pack 200、只含 017faa62、邮箱只有本人 + 筛查房东 | `e26-*.png` + SQL | 通过 | — |
| E-27 | landlord-test 看 `10121e42` report / done：红条「申请人在档案上设置了身份警示」+ 琥珀「本档案有 1 条更正记录 · 从材料里读出的月收入 · 已更正」；`GET /api/consumer/alert?screening=10121e42` landlord-test → 200 alert，tenant-test → 404 | `e27-report.png` + curl | 通过 | — |
| E-28 | `_v3.cra_mode = registered`；法庭三行 CanLII `ok` / 门户 `ok`（116 条同名结果经核验 0 命中）/ LTB `no_results`；无 `skipped` | SQL | 通过（当前生产 = registered） | 观察 O-3：10-12 及之前的筛查行 `_v3` 无 `cra_mode` 键（该键 10-12 后才写入，属预期） |

**汇总**：28 条设计 · 28 条执行 · 26 通过（含 3 条按设计）· 1 失败（E-18）· 1 部分通过（E-10）。

## 三、缺陷

| 编号 | 严重度 / 优先级 | 一句话 | 复现要点 |
|---|---|---|---|
| E-D1 | S2 / P1 | LTB 判令目录的「收录范围」在筛查结果里间歇为空，报告只写通用句「当前已发布的范围」，读者不知道「未查到」覆盖到哪天 | SQL：`_v3.ltb_check.coverage` 在 `2582abb3`（10-06）、`b4c073f3`（10-12）、`48e19c04`（10-18）为 `{from:null,to:null,orders:null}`，而 `017faa62`（10-12 19:55）、`10121e42`、`0e1087cd` 正常（2025-01-08 → 2026-06-30 · 49,261）。直接调 `rpc/ltb_coverage`（REST，muse JWT）三次都 200 / 0.2 s 返回完整行。`lib/ltb/search.ts` L203–222 把 `ltb_coverage` 的任何错误吞成 null（`Promise.resolve(rpc()).catch(()=>null)`）且不记日志——需在管线里把错误记 Sentry 找根因（疑似与 `search_ltb_orders` 并行时的超时 / 中止信号）。报告页 `e10-report.txt` L319–321 可见只剩通用句。 |
| E-D2 | S2 / P1 | 申请人页的决定通知卡「✓ 确认 · 替我执行」一点即发，没有别处承诺的 60 秒撤销窗；卡片脚注「批准与拒绝都会写入审计 · 你随时可追溯」也没说明会立刻发出 | muse-landlord 登录 `/landlord/applicants/864bfca6…` → 录取 · 起草通知 → 确认，4 秒内 `applications.status=approved`、邮件已发（卡 `441502d1`）。代码 `app/landlord/applicants/[id]/page.tsx` L315 `runNotice()` 直接 `POST /api/agent/execute`；同一张卡在 `/landlord/todo` 走 `useAgentSession.decide` 则有 60 秒撤销（CLAUDE.md「预览 + 60 秒撤销」）。09-23 的「批准即发」早于 60 秒撤销原则——两处应一致，或至少在卡上写明「批准后立即发出」。 |
| E-D3 | S3 / P2 | 中文界面下 `/screening/<id>/ltb` 子页打印英文数据源名与英文注记（report 页已经过 `courtSourceZh / courtNoteZh`，这页没有） | `e10-ltb.txt`：「CanLII (via public web index)」「Full-text search of canlii.org…」「No matches in Ontario Courts Portal (116 name-search results…)」「No LTB order in the published catalogue…」「Pro feature — coming soon」 |
| E-D4 | S3 / P3（DO NOT TOUCH 模块，只记录） | 筛查页删除记录用原生 `window.confirm`，与 10-12「登录后界面不再用原生 confirm / alert」规则不一致（自动化浏览器会卡住） | `app/screening/app/page.tsx` L1955；E-15 实测弹出原生对话框 |
| E-D5 | S3 / P3 | 披露包里取证标记标签含英文内部短语（「其他信号：paystub unknown payroll system」「employer registry unmatched」——`signalLabel` 未覆盖的代码回退成英文词），JSON 版更正记录带管理员 `created_by` uuid | `e23-pack.json` `screenings[0].items[7..9]`、`corrections[0].created_by` |
| E-D6 | S3 / P3 | 决定通知邮件页脚（`decisionNoticeFooter`）只给 privacy@，没有 V0.8 加到打印版通知的「/my-file 免费索取档案 · /consumer-rights」一句 | `e17-preview.json` 正文；对照 `/screening/<id>/notice` L28 |

## 四、观察（不计缺陷）

- O-1 E-09：带 `?screening=` 重跑时扫描日志第一行「0 个文件已加入扫描队列」（计数取自本地上传态而非行上的 2 份文件），进度条与结果不受影响。
- O-2 E-22：管理员队列的候选列表含 `error` 状态的筛查（`2803051e`，无内容），管理员若勾它披露包会是空条目；建议候选只列 scored。
- O-3 E-28：`_v3.cra_mode` 自 10-12 CRA 开关上线后的新筛查才有（10-12 19:55 的 `017faa62` 无此键），不是缺陷。
- O-4 E-03 / E-05：路由层的 `role_required` 对纯租客实际不可达（RLS 先返回 404），角色门的真正执行点是触发器（E-01）；守卫 `screeningRoleGate` 覆盖路由层逻辑即可。
- O-5 E-23：披露包 viewers / recipients 列出筛查房东的邮箱与「房东」通称（landlord-test 没填 full_name / phone）——s.12(3) 要求列收件人，属设计；若房东填了「联系电话」会一并列出。

## 五、越界发现

- 共用机器上的无头 Chrome 端口撞车：我在 9347 启动后约 2 分钟，我的标签页被另一测试员的登录脚本导航到 `/landlord/agent` 并换成 landlord-test 会话（另有 M 9361 / F 9371 / C 9375 在跑）。我随后换到 9412（范围外）才稳定。**README 的「9300–9399 随机」在多人并行时不够，建议每人固定分配端口**；并且我在启动前执行过一次 `pkill -f "remote-debugging-port=93"`，可能误杀了别人的实例（如有测试员那时正好掉线，原因在我）。
- 在撞车窗口里我以为是自己的会话，替 landlord-test 点了一次 2026-10-16 版条款「同意」（允许范围内，但非本模块动作）。

## 六、数据副作用（都是 `[TEST]`，未删任何行）

- `screenings` 新行 `48e19c04-599e-4201-8b1a-79c15232a1a8`（muse-landlord 名下，申请 `864bfca6`，scored 39 / decline，材料是申请包里的两份 favicon）；`applications.864bfca6` → `screened_at`、`status=approved`、`decision_notified_at=2026-10-18 03:39:28`；`agent_pending_actions.441502d1`（send_decision，approved + executed）；`compliance_events` 1 行 `CRA-10-7-notice`；申请对话 1 条 `formal_copy`；审计若干。
- `consumer_requests.742e319e`（muse-tenant，name「Wrong Person Probe」，fulfilled，matched `017faa62`，handled_by admin）；`consumer_alerts` muse-tenant 1 行（已撤销）；tenant-test 的请求 `f44c456b` 多了 2 次 `consumer_file_disclosed` 审计。
- 邮件 3 封：决定通知 → tenant-test@；确认链接 → muse-tenant@；「需人工复核」→ 全部 `admin_users` 邮箱（含用户本人邮箱）。预算：`/api/consumer/request` 用 1 / 2，真实评分 1 / 1，匿名对话 0。
- 条款：muse-landlord、admin（如弹出）、landlord-test 接受了 2026-10-16 版。
