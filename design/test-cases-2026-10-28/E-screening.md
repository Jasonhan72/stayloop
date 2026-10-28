# E · 筛查闭环与消费者档案（2026-10-28 全站测试 · 测试员 ③ · R1 回归比对）

基线 `design/test-cases-2026-10-17/E-screening.md`（上轮缺陷 E-D1…E-D6）。依据 CLAUDE.md「筛查模块 DO NOT TOUCH」「筛查只给房东或 RECO 注册有效的经纪」「《消费者报告法》」。**不跑新筛查、不做探索，只回归比对**；`/api/consumer/request` 预算 2，用 1。
执行前状态：landlord-test 名下 scored 筛查 `10121e42`（申请 `a8eb88f1`，申请人 tenant-test，带 `[TEST]` 身份警示与 1 条更正记录）、`fee99bd9`、`8a9b3be8`；tenant-test 现有 fulfilled 档案请求 `f44c456b`。
工具：curl（JWT）、playwright（`e-landlord.mjs` / `e-tenant.mjs` / `e-decision.mjs`）、只读 SQL + `begin…rollback` 探针、本地 vitest。

## 一、用例

| ID | 风险 | 前置 | 步骤 | 期望 | 关联守卫 |
|---|---|---|---|---|---|
| E-01 | R1 | SQL 回滚，tenant-test claims | `insert into screenings(landlord_id=tenant…)` | `42501 screening_requires_landlord_or_agent` | `screeningRoleGate20260929` |
| E-02 | R1 | 同上，landlord-test claims | 同样插入 | 成功（回滚） | 同上 |
| E-03 | R1 | tenant-test JWT | `POST /api/screen-score {screening_id: 10121e42}` | 拒绝（403 或 RLS 先 404） | 同上 |
| E-04 | R1 | tenant-test JWT | `POST /api/deep-check` | 403 `role_required` | 同上 |
| E-05 | R1 | tenant-test JWT | `POST /api/verify/create` | 拒绝 | 同上 |
| E-06 | R1 | tenant-test / landlord-test JWT | `GET /api/consumer/alert?screening=10121e42` | 房东 200 带 alert；租客 404 | `v08_consumerPages` |
| E-07 | R1 | landlord-test 浏览器 | `/screening/10121e42/{report,done,notice,graph,ltb}` | 全 200；report / done 顶部身份警示红条 + 更正记录琥珀条；report 末尾 `consumer-rights-link`；`/notice` 含 s.10(7) 与 /my-file；无「不是报告机构」；中文页无整句英文 | `craWording` `v08_consumerPages` |
| E-08 | R1 | landlord-test | `/screening/app` 无参数 | `notice-confirm` 复选框未勾、「开始筛查」禁用 | `v08_consumerPages` |
| E-09 | R1 | tenant-test | `/screening/app`、`/screening/10121e42/report` | 前者送去 `/landlord/become?next=…`；后者「找不到这份筛查」 | roleGate 页面层 |
| E-10 | R1 | 本地 | vitest 守卫 7 文件 | 全过 | — |
| E-11 | R1 | JWT | `from-application`：租客对新申请 → 404；房东对 0 文件申请 `0a1da57b` → 422 `no_documents`；房东对 muse 的 `864bfca6` → 404 | `fourRoleAudit_a` |
| E-12 | R1 | 匿名 | `/my-file` | 索档表单（邮箱 + 发送确认邮件）、权利说明链接 | `v08_consumerPages` |
| E-13 | R1 | 匿名 | `/consumer-rights#method` | 「我们怎么评、不评什么」：四项计分与比重、完整度不计分、无比例 / 信用分截止线、受保护特征不进评分、同名规则、决定由人做 | `batch2Round2` |
| E-14 | R1 | landlord-test，申请 `374a0317`（D 组新建） | 「录取 · 起草通知」→「预览正文」→「确认 · 替我执行」 | 卡 pending、无邮箱；预览正文带 s.10(7) + 《人权法典》+ /my-file + /consumer-rights（上轮 E-D6）；批准后 **60 秒撤销窗**（上轮 E-D2）；窗口结束自动发出；`applications.status=approved`、`decision_notified_at`、`compliance_events CRA-10-7-notice`、申请对话 `formal_copy` | `lifecycle20260923` `sweep20261001` |
| E-15 | R1 | 匿名 | `POST /api/consumer/request {email: tenant-test@}`（预算 1/2）→ SQL 取 token → GET → `/pack` → `/verify {name}` → GET → `/pack?format=json` → `/dispute` 对未匹配筛查 | 200 ok；GET 盖 `email_verified`；verify 前 pack 409 `not_available`；verify 姓名匹配 → fulfilled、matched 列出本人筛查；pack 200 + `X-Content-Fingerprint` + `no-store`，只含本人邮箱；dispute 未匹配 → 403 | `v08_consumerData` |
| E-16 | R2 | 匿名 | 坏 token `GET /api/consumer/request/<64×0>` | 404 `invalid_token` | 同上 |

## 二、执行记录（2026-10-28 18:38–18:50 UTC）

| ID | 实际 | 证据 | 结果 |
|---|---|---|---|
| E-01 | `42501 screening_requires_landlord_or_agent`（DO 块收集后 `raise exception` 回滚） | execute_sql | 通过 |
| E-02 | 房东 claims 插入成功（同一事务回滚；事后无 `[TEST] probe E-0%` 行） | execute_sql | 通过 |
| E-03 | 404 `Cannot coerce the result to a single JSON object`（RLS 先于角色门，与上轮一致；匿名 → 401） | curl | 通过（按设计） |
| E-04 | 403，`error` + `error_zh`「租客筛查只对房东和经纪开放…」 | curl | 通过 |
| E-05 | 404 `screening not found` | curl | 通过（按设计） |
| E-06 | landlord-test 200 `{alert:{statement:"[TEST] 我的证件曾遗失…", expires 2032-10-17}}`；tenant-test 404 `not_found` | curl | 通过 |
| E-07 | 五页 200。report：身份警示 ✓、更正记录 ✓、`consumer-rights-link` 1、/my-file 文案 ✓、下一步卡 ✓、0 句整句英文；done：警示 ✓ 更正 ✓ 下一步 ✓；notice：警示 ✓、s.10(7) ✓、/my-file ✓；graph / ltb 200。五页都没有「不是报告机构」 | `e-landlord.out` · `shots/e07-*.png` | 通过 |
| E-08 | `notice-confirm` 存在、未勾；「🛡 开始筛查」disabled | `shots/e08-screening-app.png` | 通过 |
| E-09 | `/screening/app` → `/landlord/become?next=%2Fscreening%2Fapp`「你的账号目前是租客身份…」；report → 「找不到这份筛查 这份筛查不存在，或你没有查看权限。」 | `e-tenant.out` · `shots/e09-*.png` | 通过 |
| E-10 | `screeningRoleGate20260929 / craWording20261012 / case28KimYi / v1stage1_nextStep / batch2Round1_20261027 / batch2Round2_20261027 / batch1Cards20261026` 7 文件 **84/84 通过**（0.96 s） | `vitest-e.log` | 通过 |
| E-11 | 租客 → 404 `application not found`；房东 0 文件 → 422 `{error:no_documents, copy_failed:0}`；房东对 muse 的申请 → 404 | curl | 通过 |
| E-12 | 「我的筛查档案 · 谁能用 … 申请时用的邮箱 · 发送确认邮件 · 我们只会把链接发到这个邮箱，不会在这里告诉你它有没有申请过 … 你的权利 · 怎么行使 →」；`input[type=email]` 1 | `shots/e12-my-file.png` | 通过 |
| E-13 | `#method` 锚点存在；「4 · 我们怎么评、不评什么」：四件事分开打分（付款能力最重…核验最轻）、完整度另列不计分、「不设『租金不超过收入 30%』这类比例截止线，也不设信用分截止线（OHRC 政策、O. Reg. 290/98）」、受保护特征不进评分也不进理由、同名规则「只会写『已出判令』」、决定由房东或经纪本人做 | `shots/e13-consumer-rights-method.png` | 通过 |
| E-14 | 点「录取 · 起草通知」→ 卡「PENDING APPROVAL · 等你确认 · 低风险 · 录取通知：[TEST] Round1028 … 将分享 ✓ 申请结果 ✓ 申请对话 · 不会分享 ✕ 筛查报告 ✕ 评分 ✕ 其他申请人信息」（请求：`POST agent_pending_actions` 201，无模型调用）；「预览正文」→ `POST /api/agent/execute` 200，正文含 s.10(7) 60 天、《人权法典》声明、**「www.stayloop.ai/my-file 免费索取…www.stayloop.ai/consumer-rights」**（上轮 E-D6 已修）、不显示收件邮箱（中转，按设计）；「确认 · 替我执行」→ `decide_pending_action` 200 → 页面「录取通知已批准，但还没有发出。刚批准，还在 60 秒撤销窗口内…」+ 按钮「现在发出 / 撤回这张通知」（**上轮 E-D2 已修**）；+73 s 自动 `POST /api/agent/execute` → 「✓ 通知已通过邮件发给申请人…」、申请对话 1 条「正式通知副本 · 房东 · 决定通知」；SQL：卡 `16610a9d` approved · executed 18:44:41 · `{sent_to: tenant-test@, email_id 01a183d4…}`；`applications.status=approved`、`decision_notified_at 18:44:41`；`compliance_events CRA-10-7-notice 18:44:41`；`thread_messages formal_copy`（线程 `cfe852a2`） | `e-decision.out` · `shots/e14a–d.png` · SQL | 通过（1 封邮件 → tenant-test） |
| E-15 | POST → 200 `{ok:true}`（行 `bc684cac` pending_verification）；GET → `email_verified:true`、`email_masked te*********@`、`pack_available:false`、已带现有 alert；pack → 409 `not_available`；verify「Test Tenant」→ **自动匹配 fulfilled**、`matched` = `48e19c04`（muse-landlord 10-18）+ `10121e42`（landlord-test 09-23）、`due_at` +2 工作日；pack JSON 200 + `x-content-fingerprint` + `cache-control: no-store`，keys `version/request_id/email/name/generated_at/lang/screenings/viewers/recipients/alert/fingerprint`，邮箱只出现 `tenant-test@stayloop.ai`；dispute 对 `8a9b3be8`（非本人）→ 403 `screening_not_matched` | curl 输出（本文内联） | 通过（预算 1/2；1 封确认邮件 → tenant-test） |
| E-16 | 404 `invalid_token` | curl | 通过 |

统计：16 条 · 执行 16 · 通过 16（3 条按设计）· 失败 0。上轮 E-D2（无撤销窗）、E-D6（邮件页脚缺 /my-file）已验证修复；E-D1（LTB 收录范围）/ E-D3（/ltb 英文）/ E-D4（原生 confirm）/ E-D5（披露包英文标签）本轮未重验（不做探索；E-D4 属 DO NOT TOUCH 模块）。

## 三、缺陷

| 编号 | 严重度 / 优先级 | 一句话 | 复现要点 |
|---|---|---|---|
| E-D1 | S3 / P3 | 带 token 的 API 响应（`/api/consumer/request/<token>`、`/pack`、`/api/w/<token>`）`referrer-policy` 是 `strict-origin-when-cross-origin`，页面 `/my-file/<token>` `/w/<token>` 等已是 `no-referrer`（上轮 G-D3 页面部分已修，API 前缀没跟上） | `curl -sI https://www.stayloop.ai/api/consumer/request/<64个a>` 与 `/api/w/<64个a>` 看头；`proxy.ts` 的 no-referrer 前缀清单未含 `/api/consumer/request/`、`/api/w/`。影响小（JSON 不含外链；HTML 版 pack 若被当页面打开才有意义） |

## 四、观察

- E-03 / E-05：角色门的真正执行点是触发器（E-01），路由层 `role_required` 只对能读到行的账号起作用（与上轮 O-4 一致）。
- E-15：姓名匹配后直接 fulfilled，没有走人工复核（候选只有本人邮箱的筛查）；候选里包含 muse-landlord 的 `48e19c04`（上轮 E 组用 tenant-test 的申请建的），正确。
- E-14：决定通知预览不显示收件邮箱（只显示「→ [TEST] ROUND1028」），符合「对外一律经中转、不暴露邮箱」。

## 五、数据副作用（全部 `[TEST]`，不删）

- `agent_pending_actions 16610a9d-fe98-4be5-b951-23530f6534c5`（send_decision · approved · executed）；`applications 374a0317` → approved、`decision_notified_at 2026-10-28 18:44:41Z`；`compliance_events` 1 行 `CRA-10-7-notice`；`thread_messages` 1 条 `formal_copy`（线程 `cfe852a2-7e2a-4257-90a0-5ddbe0da612b`）；审计 `application_decision_drafted / pending_action_approved / executed_send_decision`。
- `consumer_requests bc684cac-bbfe-42c6-8093-e3d01028173c`（tenant-test，name「Test Tenant」，fulfilled，matched `[10121e42, 48e19c04]`）+ 审计 `consumer_request_verified / consumer_file_disclosed`。
- 邮件 2 封（决定通知 → tenant-test@；档案确认链接 → tenant-test@）。模型调用 0。E-01 / E-02 探针已回滚。
