# H · 消息与沟通 · 用例与执行记录（2026-10-17）

风险等级 R2。依据：CLAUDE.md「节点 4」「消息与沟通系统重设计 → A 期落地」「找得到人」「通知页退役」。守卫：`tests/messagingA20260929.spec.ts` `messagingPeople20260930.spec.ts` `node4Threads20260926.spec.ts`。
账号：tenant-test / landlord-test / provider-test / agent-test / admin@。

## 用例

| ID | 等级 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| H-01 | R2 | 各号 JWT | `rpc my_threads` | 每行带 `counterpart_names / counterpart_roles / last_sender_label / unread`；只含本人当事的对话 | messagingPeople |
| H-02 | R2 | 库（只读） | 七种 kind 各找一条：work_order · application · tenancy · dispute · listing_inquiry · agent_client · support | 六种有行；dispute 预留无行（按设计） | messagingA |
| H-03 | R2 | tenant-test 登录 `/messages` | 列表 / 筛选（全部 · 待回复 · 按对方）/ 搜索（名字 / 地址） | 列表行 = 头像 + 名字 + 角色 · 事务 · 最后一句；筛选与搜索生效 | messagingPeople |
| H-04 | R2 | 同上 | 「新消息」三步：发给谁 → 关于哪件事 → 写 | `data-step` who → which → write；Stayloop 置顶；已有对话直接打开 | messagingPeople |
| H-05 | R2 | tenant-test JWT | `rpc my_message_targets` | 含 people_names / reachable；Stayloop 在列 | messagingPeople |
| H-06 | R2 | tenant-test JWT | `find_thread('work_order', <G 工单>)` 与 `open_thread` | find 只读；open 返回线程；非当事人（agent-test）→ 拒绝 | node4Threads |
| H-07 | R2 | tenant-test JWT | 直插 thread_messages（伪造 sender_kind=landlord、created_at 去年、sender_label 假名） | 触发器改回：服务器时间、sender_kind=tenant、sender_label=本人名字快照；hash / prev_hash 填好 | messagingA |
| H-08 | R2 | landlord-test JWT | `PATCH` / `DELETE` thread_messages | 42501 `append_only`（直连）；service role 同样被拒（回滚事务） | messagingA |
| H-09 | R2 | tenant-test JWT | `POST /api/threads/upload`（png） | 200，`sha256` = 本机 `shasum -a 256`；消息引用该 path 时哈希由触发器复制 | node4Threads |
| H-10 | R2 | landlord-test JWT | `POST /api/threads/export {format:json}` | 200，`chain.verification.ok=true`，`X-Content-Fingerprint` 头；审计 `thread_export_generated` | messagingA |
| H-11 | R2 | landlord-test | `message_reads` upsert 三个高水位；tenant 侧读到 | 只能写自己的行；高水位只前进 | node4Threads |
| H-12 | R2 | tenant-test | 撤回：insert kind=retraction ref 10 分钟内的消息 | 成功；`applyRetractions` 显示「已撤回 · 原文保留」；原文仍在表里；>10 分钟的 `canRetract=false`（UI）—服务端是否拦？记录 | node4Threads |
| H-13 | R2 | 回车发送 | ThreadPanel：Enter 发送、Shift+Enter 换行、isComposing 不发；`sendingRef` 防重复 | 代码核对 + UI 一次 | sweep A8 |
| H-14 | R2 | landlord-test | `POST /api/threads/notify` 对外部联系人工单（fcbcfcf1，Maple 当时是外部联系人）的新消息 | `emailed ≥ 1`；`message_deliveries` 行 channel=email；`thread_reply_tokens` 生成，Reply-To 形如 `t-…@reply.stayloop.ai`（只查库，不回信） | messagingA |
| H-15 | R2 | tenant-test | `open_thread('support', 本人 uid)` + 发一条 | admin@ 的 my_threads 看到该 support 对话，对方标「Stayloop」 | messagingPeople |
| H-16 | R2 | 各号 | `my_unread_messages` 与汉堡红点一致 | 读过后归零 | messagingA |
| H-17 | R2 | 非当事人 | agent-test 读 G 工单线程消息 | 0 行（RLS） | node4Threads |
| H-18 | R2 | 中转 | 工单 / 看房 / 委托邮件 Reply-To 不含私人邮箱（查 message_deliveries / thread_reply_tokens） | 只有 reply.stayloop.ai 地址 | messagingA |

## 执行记录（API 部分 · 2026-10-18 03:29–03:40 UTC）

| ID | 实际 | 证据 | 结果 |
|---|---|---|---|
| H-01 | tenant `my_threads` 5 行（work_order ×3 · application · tenancy），字段齐（counterpart_names / roles / last_sender_label / unread / awaiting_reply / matter_id）；admin 看到 3 条 support 对话、对方标 member 名字 | RPC 输出 | 通过 |
| H-02 | 库里 kind：listing_inquiry 3 · application 4 · work_order 2+1（新）· agent_client 1 · support 2+1 · tenancy 2；**dispute 0**（C 期预留，按设计） | SQL | 通过 |
| H-05 | tenant `my_message_targets` 18 行；Stayloop（admin）在列 reachable；每行 people_names / people_roles / status | RPC | 通过 |
| H-06 | tenant `find_thread` 返回线程 id；agent-test `open_thread` → P0001 `not_a_party`；provider `thread_party` → `provider`；`thread_people` 列出房东「Test Landlord 2」等 | RPC | 通过 |
| H-07 | 租客直插伪造行（sender_id=房东、sender_kind landlord、sender_label「Forged Name」、created_at 2025、hash deadbeef、channel email）→ 201，落库为 sender_id=本人 · tenant · 「Test Tenant」· 服务器时间 03:31:30 · channel app · prev_hash = 上一条 hash · 新 hash | 行 49 | 通过 |
| H-08 | 房东 PATCH / DELETE 消息 → 42501（403）；作者本人 DELETE → 42501；回滚事务：postgres 所有者 UPDATE / DELETE → `P0001 append_only`；`set role service_role` UPDATE → `append_only`；删除有消息的 threads 行 → 23503 FK | REST + SQL 回滚 | 通过 |
| H-09 | `POST /api/threads/upload` favicon-32.png → 200，`sha256 10c482a8…904d96` = 本机 `shasum -a 256`；agent-test（非当事人）→ 403 `not_a_party`；`.exe` → 415 `file_type`；消息引用该 path 但伪造 name/sha/size → 触发器改回登记值（行 50）；引用未登记 path → P0001 `attachment_not_registered` | api 输出 | 通过 |
| H-10 | 房东 `export format=json` → 200，`chain.verification {ok:true, count:6, head:ebb073e5…}`，`X-Content-Fingerprint` 头、`Content-Disposition` 附件名；parties 三方带角色；agent-test → 403 | api 输出 | 通过 |
| H-11 | 房东 upsert 自己的 `message_reads`（三个高水位 = 49）→ 201；写租客的行 → 行的 user_id 被改回房东本人（不能替别人写）；回退到 1 → 仍是 49（只前进）；租客读到房东的三级回执 | REST | 通过 |
| H-12 | 租客 insert `retraction` ref 49 → 201（行 52）；房东撤回租客的消息 → P0001 `retraction_not_yours`；原文 49 仍在表里。10 分钟窗口由服务端？未验（需 >10 分钟的本人消息，见下方补测） | REST | 通过 |
| H-13 | 代码核对：`isSendKey` — Enter 且非 Shift、`isComposing` / keyCode 229 不发；`sendingRef` 同一 tick 第二次 Enter 不发 | `components/messages/composerKeys.ts` `ThreadPanel.tsx:176–210` | 通过（静态） |
| H-14 | 房东在外部联系人工单 `fcbcfcf1` 线程留言（行 55）→ `POST /api/threads/notify` → `{pushed:0, emailed:2}`（外部联系人 landlord-test+plumber@ 一封；租客无推送订阅 → 回退邮件一封）；`message_deliveries` 行 35/36/37（email sent · push skipped「no push subscription」· email sent，带 Resend 消息 id）；`thread_reply_tokens` 每（线程 × 收件地址）一枚 32 位 token（external / tenant / landlord / provider 四行），Reply-To = `t-<token>@reply.stayloop.ai`（`replyAddress`）；**未回信** | SQL 只读 | 通过 |
| H-15 | 租客 `open_thread('support', 本人 uid)` → 线程 `3430cd0b…`；发一条 → sender_kind `member`、label「Test Tenant」；admin `my_threads` 列出该 support 对话 unread 1；租客侧 `thread_people` 对方 = 「Stayloop · admin」；租客为别人的 uid 开 support → `not_a_party` | RPC | 通过 |
| H-16 | `my_unread_messages`：tenant 0 · landlord 1 · provider 2（与各自未读一致） | RPC | 通过 |
| H-17 | agent-test 读 `thread_messages` / `threads` → 0 行 | REST | 通过 |
| H-18 | `thread_reply_tokens` 只有 reply.stayloop.ai 形态；`/api/w/<token>` GET 的 `landlord_email` 为 null；通知邮件 Reply-To 走 token（未逐封打开邮件） | SQL + api | 通过 |


## 执行记录（界面部分 · 2026-10-18 · 无头 Chrome 9320）

截图：`scratchpad/sitetest1017/G2/h-*.png`、`t-thread-*.png`、`t-messages-375.png`，以及 `H/ui-*.png`。

| ID | 实际 | 证据 | 结果 |
|---|---|---|---|
| H-03 | tenant-test `/messages`（1280）：三栏（会话列表 · 线程 · 会话记录侧栏）；筛选 `All 7 / Awaiting reply 1 → 1 行 / Providers → 3 行 / Stayloop`；搜索 `Northline` → 2 行，`100 Test Ave` → 1 行，无匹配 → 0 行（未见专门的空态文案，列表只是空——记为观察）；行 = 头像 + 对方名字 + 角色徽标 + 事务 + 最后一句，未读蓝点 | `G2/t-thread-1280.png`、ui_h 输出 | 通过 |
| H-04 | 「＋ New」→ 第一步 `who`（Stayloop support 置顶，其余为人 / 房东 / 服务商，带事务摘要）；选 Stayloop → 已有 support 线程直接打开（URL `?t=…&compose=1`）；选人 → 事务 → 写的后两步在 `H/ui-new-message-2/3.png`（上一轮截图，已核） | `G2/h-new1.png` `h-new2.png`、`H/ui-new-message-*.png` | 通过 |
| H-12（UI） | 线程里每条自己的消息有 `Retract` 按钮；已撤回消息的显示与「原文保留」沿用 API 部分结果。服务端不拦 10 分钟窗口：对 >10 分钟的消息 50 插入 retraction → 201（`bg_flow.log` 第 1 段，行 63）→ 见 H-D2 | `G/bg_flow.log` | 通过（UI）；服务端窗口 = 缺陷 H-D2 |
| H-13（UI） | support 线程输入框：Shift+Enter **不发送**（CDP 无法注入换行字符，换行本身未验证）；Enter 发送，输入框清空，消息出现 1 次（列表预览另计）；无重复发送。静态核对见 API 部分 | `G2/h-sent.png` | 通过（换行插入未验） |
| H-16（UI） | 汉堡 / 侧栏红点：tenant 导航 `Messages` 红点 1、`To-do` 1，与 `my_unread_messages` 吻合（读到线程后列表蓝点消失）。 | `G2/t-thread-1280.png` | 通过 |
| 线程完整性侧栏 | `RECORD OF THIS CONVERSATION`：Messages 3 · Range · `✓ untouched (3/3)` · Head `7eac…a138`，写明「在你的浏览器里重新计算（SHA-256）」；Export printable / JSON；`Kept 7 years` 链接 | `G2/t-thread-1280.png` | 通过 |
| 手机 375 | `/messages` 列表（搜索 + 筛选胶囊可横滑）、进入线程有返回键、textarea 16px、无横向溢出；Install-app 横幅在手机底部会遮住列表最后一行（可关，非缺陷） | `G2/t-messages-375.png` `t-thread-375.png` | 通过 |
| XSS 探针 | 列表预览里有上一轮 T6 留下的 `<img src=x onerror=alert(1)>` 文本，页面按文本渲染、无弹窗 | `G2/t-messages-375.png` | 通过 |

## 缺陷

- **H-D1 · S3 / P3** · 英文界面的会话列表预览与线程系统行直接显示中英双语存储串：`System: 租客确认问题已解决 / Tenant confirmed the fix`、`System: 工单已归档 / Work order closed`、线程里 `Oct 17, 11:30 p.m. · 租客确认问题已解决 / Tenant confirmed the fix`。违反「英文界面不能出现中文」。复现：tenant-test 英文界面 `/messages`。证据：`G2/t-messages-375.png`、`t-thread-1280.png`。建议：系统行存 `meta.i18n {zh,en}` 并按界面语言渲染，或渲染时按「 / 」拆分取当前语言一半。
- **H-D2 · S3 / P3** · 撤回的 10 分钟窗口只在 UI（`canRetract`），服务端不拦：租客可对 >10 分钟的自己消息插入 `retraction`（201，行 63）。按设计原文始终保留、撤回只是新增一行，所以影响限于「撤回」标记可晚到；若窗口是产品承诺，需在 `thread_messages` 插入触发器里加判断。
- 观察：搜索无匹配时无空态文案；`/messages?t=…&compose=1` 打开已有对话时多带 `compose=1`（行为无害）。
- 越界发现：G-D1（act 路由泄露外部联系人 token）、G-D3（token 页 Referrer-Policy）见 G 文件；`app/dashboard/page.tsx` 与筛查页仍有 `window.confirm / alert`（G-40，已知「后台与筛查页暂留」）。

## 数据副作用（H）

- 线程 `cb48bb31…`（work_order，G 组工单）与 support 线程 `3430cd0b-1319-4aec-8215-bbc18c7b3330`（tenant ↔ Stayloop，admin@ 可见）：`thread_messages` 行 49–63 区间（含伪造字段被触发器改回的 49、引用附件的 50、retraction 52 与 63、外部联系人线程行 55 等）；界面部分在 support 线程多发 1 条 `[TEST] H-13 UI 发送：忽略 Enter 发送`（只追加不可删）。
- 附件：`/api/threads/upload` 登记的 favicon png 一份（sha256 10c482a8…904d96）。
- `message_reads` 三个高水位（landlord 行 = 49）；`message_deliveries` 行 35/36/37（H-14）；`thread_reply_tokens` 四行（external / tenant / landlord / provider）；审计 `thread_export_generated`（H-10）。
- 邮件：H-14 两封（外部联系人 landlord-test+plumber@、租客）+ 界面发 1 条可能触发 1 封 support 通知；合计 ≤3，均测试邮箱。
- 使用的魔法链接 3 次。
