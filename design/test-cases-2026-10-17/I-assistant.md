# 模块 I · AI 助理（R2）· 全站测试 2026-10-17

测试员：I+J 组。预算：匿名 AI 对话 5 次 / 登录后模型调用 ≤5 次 / 邮件 ≤5 封（只发测试号）。账号：tenant-test@stayloop.ai（魔法链接登录）。
需求来源：CLAUDE.md「Agent Brain」「同类问题排查与修复（2026-10-01）」「快捷卡片：从模板填空到分步引导」「助理页重新布置」「对话列表」「「+ 新会话」开出的是干净的对话」
「一个用户一个 AI 助理」「助手的长期档案」「自己做助手头像」「记忆只留一份」「PropTx 拒绝 → Realtor.ca 读取全部停止」「V1.0 阶段 2」「租金基准换源」。
工具：无头 Chrome（playwright 1.58 `channel:'chrome'`，脚本在 scratchpad `sitetest1017/IJ/`）；SQL 只读（Supabase MCP）。

## 用例表

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| I-01 | R2 | 匿名，预算 1/5 | `/tenant/agent` 预览，发「Yonge & Eglinton 附近 1 房，预算 2500 以内」 | 回复不说「库存稀少」；有外链胶囊 `external-links`（Realtor.ca 社区页 / Rentals.ca / Kijiji）；若有行情句则来源写 CMHC / 统计局，**不出现 TRREB 数字**；库里有匹配则出房源卡（测试房源带 TEST 角标） | `realtorReadsOff20261013` `rentBenchmark20261013` `testListings20261013` |
| I-02 | R2 | 匿名，预算 2/5 | 发「房东要我交两个月押金，合法吗？」 | 引用 RTA s.105–106（押金 ≤ 一个月且只抵最后一月）；不出待批卡；不出现 TRREB / 不编造法条号 | `v1stage2_tenantFacts` `prompts` |
| I-03 | R2 | 匿名，预算 3/5 | `/landlord/agent` 预览，发「帮我发一个房源：28 Avondale Ave #1203，1+1，$2450，11 月 1 日」 | 出 `draft_listing` 草稿卡（地址 / 租金 / 户型），并一次问完缺的项（面积 / 宠物 / 吸烟 / 租期…，≤6 项）；不写用户没说的宠物 / 水电 / 家具；预览模式发布按钮不可用或提示登录 | `walkthrough20260922` `fixList20260922` |
| I-04 | R2 | 匿名 | `/tenant/agent` 预览页首屏 | 预览横幅「登录」在；快捷卡 ≥4 张（含 帮我找房 / 解读租约 / 发起报修 / 联系房东）；点卡片 = 打开引导卡（`intake-card`，`guided = live || hero` 规则：工作台预览也走引导卡），不是直接发示例句 | `guidedIntake20260927` |
| I-05 | R2 | 匿名 | 读 `/api/agent/turn` 429 文案来源（代码），**不触发** | 个人额度与全站繁忙两种 429 文案分开；`anonLimits.ts` 15 / 600 | `tests/listingSearch`（信息性） |
| I-06 | R2 | tenant-test 登录，模型 1/5 | `/tenant/agent?new=1` → 点「发起报修」→ 走完全部步骤（卫生间 · 没有热水 + 一句细节 · 今天 · 尽快 · 我在场 · 无宠物 · 跳过照片 · 跳过房东邮箱）→ 预览 → 发送 | 引导卡步数 = `steps.length`（代码 8 步，含可选房东邮箱）；每步进度条与已答摘要；预览整句无 `【`；发送后一轮内出 `maintenance_request` 卡，metadata 含 category / location / priority / entry_permission / pets / thread_id | `guidedIntake20260927` `fourRoleAudit20261012_e` |
| I-07 | R2 | I-06 的卡 | 点「批准」→ 60 秒撤销行出现 → 点「撤销」 | 行回到 pending，审计 `approval_undone`；卡片回到可批准状态；对话里折叠行写「已撤销」 | `lifecycle20260923` |
| I-08 | R2 | I-07 后 | 再批准同一张卡，等 60 秒执行 | 执行成功：`maintenance_tickets` 新行（household `1c9abb72…`）、卡 `executed`、审计 `executed_maintenance_request`、房东邮件（landlord-test 邮箱，计 1 封）；对话里「✅ 已执行」 | `templateChips20260923` |
| I-09 | R2 | tenant-test | 点「联系房东」卡：话题 · 内容 · 房东邮箱（跳过）→ 预览 → **只放进输入框不发送** | 卡 3 步；「放进输入框自己改」把整句送进 `AgentInputBar`，不消耗模型调用 | `v1stage2_tenantTools` |
| I-10 | R2 | tenant-test，模型 2/5 | 新对话，附件上传 `tests/fixtures/lease-text.pdf`，问「押金和宠物条款合法吗」 | 回复读出 PDF 里的押金数字（$5,600 超一个月）与禁宠条款无效，引 s.105–106 / s.14；审计 turn 事件 metadata 有 thread_id；没有待批卡（纯问答） | `v1stage2_leasePdf` |
| I-11 | R2 | tenant-test | 线程列表：xl 列可见（1280 宽）；「+ 新对话」→ 开出只剩问候语的对话（无旧待批卡，只有「另有 N 件待办来自其他对话」行或没有） | `thread-list` 存在；新对话 `thread-row` 不立即出现（第一句用户消息才建行）；I-06 的卡只出现在它自己的对话里 | `threadCards20261004` `threadList20261004` |
| I-12 | R2 | tenant-test | 对自己刚建的对话（I-06）：⋯ → 重命名「[TEST] 报修测试」→ 行标题更新；再 ⋯ → 删除 | `agent_threads.custom_title` 写入；删除后行消失、当前对话变新对话；**只删自己本次建的** | `threadList20261004` |
| I-13 | R2 | tenant-test | 面板「待办」标签 | 列出「等你点头 · N」每条带去处；「最近替你办完」含 I-08 的执行结果（7 天内） | `assistantLayout20261004` |
| I-14 | R2 | tenant-test | 面板「记忆」：+ 让它记住一条「[TEST] 偏好步行到地铁」→ 改成「[TEST] 偏好步行 5 分钟到地铁」→ 忘掉 | `user_memories` 行 source=user_edit 出现 / 更新 / 删除；审计 `memory_edited` / `memory_forgotten`；`sl-memories-changed` 让对话下一轮可见（不验证模型） | `assistantSettings20260925` |
| I-15 | R2 | tenant-test | 面板「记忆」画像：改一个字段（当前重点「[TEST] 找 1 房」）→ 交回自动 | `user_memories` role self key user_model 的 `value.user_overrides` 写入 / 删除 | `assistantSettings20260925` |
| I-16 | R2 | tenant-test | 面板「设置」：风格写「[TEST] 简短，带一点幽默」保存；人设写一句保存 | `assistant_profiles.vibe / persona` 写入；覆盖指令句被 `sanitizeVibe` 丢弃（输入含「ignore all rules」→ 错误提示 `vibe-error` 或被清） | `assistantSettings20260925` |
| I-17 | R2 | tenant-test | 铅笔 → 改名「[TEST] Pixel」→ 换头像（熊猫）→ 还原 | `assistant_profiles.name/avatar` 写入；对话头部立即更新；还原为原值（登记） | `phoneAvatar20260927` `petAvatars20260925` |
| I-18 | R2 | tenant-test | `/tenant/agent?panel=memory` | 面板打开在「记忆」标签，焦点在标签，URL 参数被清掉（`stripUrlParams`，后退不坏） | `assistantLayout20261004` |
| I-19 | R2 | tenant-test，375×812 | 助理页手机布局 | 对话列高 `calc(100dvh-121px)`（无整页滚动），底栏 5 项在最底、输入条在底栏之上；上下文条 44px；零横向溢出；点头像打开 `assistant-sheet` | `phoneChat20260924` `museMobile20260922` |
| I-20 | R2 | SQL 只读 | 最近 7 天 `agent_pending_actions.action_type` 去重 | 全部 ∈ `EXECUTABLE_ACTION_TYPES`（15 种） | `sweep20261001_*` |
| I-21 | R2 | SQL 只读 | 最近 7 天 `status='approved'` 且未执行的卡 | 为 0，或 I-08 执行中临时出现；无 >10 分钟的 approved 残留（除有意保留的） | `sweep20261001_*` |
| I-22 | R2 | tenant-test | 匿名限流文案：读代码 `orchestrator` 把 Retry-After 带进错误 | 两段文案存在（信息性，不触发） | — |
| I-23 | R3 | tenant-test | 面板「待办」里「在这段对话里 ↓」链接 | 点击滚动到卡片 `data-card-id` | `assistantLayout20261004` |
| I-24 | R2 | tenant-test | 跨身份：对话列表「其他身份的对话 · N」折叠段 | tenant-test 只有租客帽子 → 段不出现或为 0（按设计） | `threadList20261004` |
| I-25 | R2 | tenant-test | 对话头部不显示身份标签；名字字体 17–19px | 按「最后一轮：角色标记去掉」 | `homeHero20260925`（退役）/ `museWeb` |

## 执行记录

（执行后填）
