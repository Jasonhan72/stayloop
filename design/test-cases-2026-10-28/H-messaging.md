# H · 消息与沟通（R2 · 抽 ≥50%）· 全站测试 2026-10-28

测试员 ④。依据：CLAUDE.md「人与人的消息只追加」「当事人判定只在 party_for()」「对外一律经中转地址」；10-17 基线 H-01～H-18 抽 H-01 / 03 / 05 / 08 / 13 / 14 / 16 / 17 / 18 + 哈希链。守卫 `messagingA20260929` `messagingPeople20260930` `node4Threads20260926`。
方法：tenant-test / agent-test JWT 直连 PostgREST（`curl -H @anon.hdr -H @tenant.auth`，key 只在 header 文件）；playwright `H/send.mjs`（租客发）/ `H/recv.mjs`（房东收）；SQL 只读。

## 用例

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| H-01 | R2 | tenant JWT | `rpc my_threads` | 每行 `counterpart_names / counterpart_roles / last_sender_label / unread`，只含本人当事 | messagingPeople |
| H-03 | R2 | tenant-test `/messages` | 列表行 = 头像 + 名字 + 角色 · 事务 · 最后一句；点开在管租约对话 | 结构正确；对话头「关于 100 Test Ave #1 · 在管租约」、参与者 | messagingPeople |
| H-05 | R2 | tenant JWT | `rpc my_message_targets` | `people_names / people_roles / reachable`，Stayloop 在列 | messagingPeople |
| H-08 | R2 | tenant JWT | `PATCH` / `DELETE` 自己的一条 `thread_messages` | 42501（HTTP 403），只追加 | messagingA |
| H-13 | R2 | tenant-test UI | 输入框 Enter 发送「[TEST] 1028 H 消息测试…」 | 一条 201 + `/api/threads/notify` 200；消息出现一次 | sweep A8 |
| H-14 | R2 | H-13 后 SQL | `message_deliveries` / `thread_reply_tokens` | 房东无推送 → 邮件 sent（stayloop.ai 测试域）；reply token 为 `t-<token>@reply.stayloop.ai` 形态 | messagingA |
| H-16 | R2 | landlord-test UI | `/messages` 看到 H-13 的消息 | 列表行「Test Tenant：[TEST] 1028 …」带未读；打开后最后一条正文一致 | messagingA |
| H-17 | R2 | agent JWT | 读 tenancy 线程 `6eca91f3…` 的 `thread_messages` | 0 行（RLS，非当事人） | node4Threads |
| H-18 | R2 | SQL + 代码 | 中转地址不暴露私人邮箱 | `thread_reply_tokens` 全部 token 形态；发信 `replyTo = replyAddress(token)` | messagingA |
| H-19 | R2 新 | H-13 后 SQL + UI | 哈希链：新行 `prev_hash` = 上一行 `hash`；UI「完整性 ✓ 未被改动（N/N）」 | 链接续、浏览器端复算通过 | hashChain |
| H-20 | R2 新 | tenant JWT | `listing_syndications` 直插（J 组 MLS 表） | 42501（API 角色只 SELECT） | v08_mlsHandoff |

## 执行记录（2026-10-28 18:36–18:55 UTC）

| ID | 实际 | 证据 | 结果 |
|---|---|---|---|
| H-01 | 8 行：application ×2 · tenancy · support · work_order ×3 · agent_client；字段齐（`counterpart_names ['Test Landlord 2']`、`roles ['landlord']`、`unread`、`title`） | curl 输出（H/run 记录） | 通过 |
| H-03 | `/messages` 9 行，每行 头像首字母 + 对方名 + 角色徽标（房东 / 外部服务商 / 经纪）+ 事务（「100 Test Ave #1 · 在管租约」「… · 维修工单」）+ 最后一句（「Stayloop：…」「你：…」「系统：工单已归档」）+ 未读数；点开 → 头「关于 100 Test Ave #1 · 在管租约 · 查看这件事 →」，参与者「Test Landlord 2 房东 · 站内 · 每个人都能看到每条消息」 | `H/messages-list.png`、`H/send.log` | 通过 |
| H-05 | 20 个目标：support（Stayloop · admin · reachable）、application / agent_client / work_order / listing_inquiry 各带 `people_names / people_roles / reachable / status` | curl | 通过 |
| H-08 | tenant PATCH 自己的 101 → HTTP 403 `42501 permission denied for table thread_messages`；DELETE → 同 42501 | `H/p.hdr` `H/d.hdr` | 通过 |
| H-13 | 填入 + Enter：`POST /rest/v1/thread_messages 201` + `POST /api/threads/notify 200`，消息数 6 → 7，最后一条正文一致、无重复 | `H/send.log`、`H/thread-sent.png` | 通过 |
| H-14 | `message_deliveries` 两行：push skipped「no push subscription or muted」+ email sent（收件域 stayloop.ai）；该线程 `thread_reply_tokens` 2 枚；全表 34 枚全部 `^[A-Za-z0-9_-]{20,}$`、7 种 party_kind | SQL | 通过（邮件 1 封，landlord-test） |
| H-16 | landlord-test `/messages` 第一行「T · Test Tenant · 租客 · 14:51 · 100 Test Ave #1 · 在管租约 · Test Tenant：[TEST] 1028 H 消息测试… · 1」；打开后最后一条正文一致 | `H/recv` 输出、`H/landlord-thread.png` | 通过 |
| H-17 | agent-test JWT 读该线程 → `[]` | curl | 通过 |
| H-18 | `lib/threads/emailReply.ts REPLY_DOMAIN='reply.stayloop.ai'`、`replyAddress(token)`；`lib/threads/server.ts:272 sendEmail({… replyTo: token ? replyAddress(token) : undefined, fromName: '<label> 经 Stayloop'})`；库里 token 形态无例外 | 代码 + SQL | 通过（静态 + 库） |
| H-19 | 新行 121：`prev_hash 81109371d595c8…` = 上一行 108 的 `hash`，`hash e7d98830c8e1e5…`，`sender_kind tenant`、`sender_label Test Tenant`、`channel app`、服务器时间 18:51:22；UI「这段对话的记录 · 消息 8 · 完整性 ✓ 未被改动（8/8） · 最新指纹 e7d9…3627 · 指纹在你的浏览器里重新计算」 | SQL、`H/send.log` | 通过 |
| H-20 | tenant 直插 `listing_syndications` → 42501 | curl | 通过 |

**汇总**：11 条全部执行、全部通过，0 缺陷。

## 观察

- 在管租约线程 `6eca91f3…` 里 10-25 有一条 `sender_kind=admin`、`sender_label null` 的消息「消息测试…」（别的测试员用管理员写进租客 ↔ 房东的 tenancy 对话），列表预览显示「Stayloop：消息测试…」。管理员能往 tenancy 线程发消息是否按设计（support 以外的线程）值得主线程确认；本组没动它。
- 10-17 的 H-D1（英文界面系统行中英同串）本轮未复测（界面全程中文）。

## 数据副作用

- `thread_messages` 行 121（tenancy `6eca91f3…`，tenant-test → landlord-test，不可删）；`message_deliveries` 2 行（push skipped / email sent）；邮件 1 封到 landlord-test@stayloop.ai。
- 无其他写入（PATCH / DELETE / 直插全部被拒）。
