# 全站测试 2026-10-28 · 测试员共用说明

策略沿用 `design/test-strategy-2026-10-17.md`（§2 风险分级 R1–R3、§3 层级、§5 方法、§6 环境、§7 缺陷 S0–S3 / P0–P3、§8 退出标准）。上一轮用例 `design/test-cases-2026-10-17/*.md` 是回归基线；本轮每个模块一个文件 `design/test-cases-2026-10-28/<模块字母>-<名字>.md`，**先设计后执行**：前半用例表（ID · 风险 · 前置 · 步骤 · 期望 · 关联守卫），后半执行记录（实际 · 证据 · 结果 · 缺陷编号），末尾「数据副作用」。

## 本轮范围
1. **回归基线**：10-17 各模块 R1 用例全跑、R2 抽 ≥50%、R3 抽 ≥30%（挑最能代表主流程的）。
2. **10-18 以来新上线的**（`design/history/README.md` 2026-10-19 … 10-27 各行，细节在 `design/history/2026-10.md`）：OpenNext Worker 迁移（路由 / 头 / 缓存）· Flinks 加固 · 经纪公开主页 `/agents`、`/agents/[slug]`、头像上传 · Next 16 / React 19 · `proxy.ts` · MLS® 交接（`MlsHandoff`）· `/tools` 与 `/rules` 更新记录 · 分享包 v2（8 渠道、海报、短链 `/go/<code>`、回流计数）· 下架提醒卡 · 月度简报例行任务 · 空置成本卡 · 次日催租推送 · 专业服务类目 `/providers/professional` 与三处触发卡 · 入住 / 退租状态照片（`/h/[id]` 与 `/tenant/move-in`）· T776 导出 · 证据包排序（UI 叫「聊天记录顺序」）· `/consumer-rights#method` · 房源「首次入住日期」勾与声明 · 定价参考卡 · 经纪卡片站内信号 · 房源卡片合一（`ListingCardView`）· AI 找房读库修复 · 手机 / 平板适配 · 对话结尾不再写「办完了」· **知识库 RAG**（法规类问题带 [n] 引用与「参考原文」清单、回执「查了法规原文」、条号核对、`/admin/knowledge`、`/rules` 待核对角标、`/api/kb/notices`）。

## 环境
- 生产 `https://www.stayloop.ai`（当前版本 ship98 `92a5f8c0`，与仓库 `v5.3-launch` 同一代码）；仓库 `/Users/neos/Documents/Claude/Projects/stayloop`（node 必须是 22：`node --version`）；Supabase 生产项目 `uotcczsfeiptnabamzcd`（MCP `execute_sql`，**只读，或写探针包在 `begin … rollback` 里**）。
- 登录：**不输密码、不建账号**。铸魔法链接：`bash /private/tmp/claude-502/-Users-neos-Documents-Claude-Projects-stayloop/774bb32e-4eb9-4cc0-8534-64d0bb942907/scratchpad/mint.sh <email> <redirect_to>`（打印 10 分钟有效的链接，重定向到 `https://www.stayloop.ai`；要落到某页就把 redirect_to 写成 `https://www.stayloop.ai/<path>`）。打开链接后会话落在浏览器 profile 里，之后直接访问页面即可。**不点退出**（同一测试号在一处退出会全局作废会话）。
- service role 只经 mint.sh 使用；**不要把 key 打进命令行、日志或报告**。
- 浏览器：**不要用内置浏览器面板**（主线程在用）。用 playwright（`/opt/homebrew/lib/node_modules/playwright`，`chromium.launch({ channel: 'chrome' })` 或 `executablePath` 指向系统 Chrome），每个测试员自己的 `userDataDir`（`/private/tmp/claude-502/-Users-neos-Documents-Claude-Projects-stayloop/774bb32e-4eb9-4cc0-8534-64d0bb942907/scratchpad/sitetest1028/<组>/profile`）与随机调试端口 9300–9399；**别 pkill 别人的 Chrome**。viewport 默认 1280×800，手机用例 375×812 / 390×844，平板 768×1024。
- 脚本与截图放 `/private/tmp/claude-502/-Users-neos-Documents-Claude-Projects-stayloop/774bb32e-4eb9-4cc0-8534-64d0bb942907/scratchpad/sitetest1028/<组>/`；每条结论附命令 / 状态码 / 截图路径。
- 对外 API 探针：`/api/v1/*`、`/api/mcp`、`/api/kb/notices`、`/api/listings/search` 无凭证；`/api/admin/*` 要 admin JWT（admin-test 的会话 access_token，从浏览器 localStorage 的 `sb-*-auth-token` 里取）。

## 测试账号（都是 `[TEST]` 数据，可读可写，不删不改他人数据）
| 账号 | 身份 | 备注 |
|---|---|---|
| tenant-test@stayloop.ai | 纯租客 | 有申请、申请包、在管租约 `1c9abb72-c433-498b-942d-0d448fb8342f`（100 Test Ave #1）成员、消费者档案请求 |
| landlord-test@stayloop.ai | 房东 | 房源 `[TEST] 77 Sitetest Rd`（上架中）、`[TEST] 100 Test Ave`（已下架）；在管租约 `1c9abb72…`、`fc4fab5e-96d4-4f19-8305-842a36899bf4`；筛查若干；Pro 试用中 |
| agent-test@stayloop.ai | 经纪（RECO 已核）+ 服务商 `[TEST] Maple Plumbing` | 经纪公开主页可开 |
| provider-test@stayloop.ai | 纯服务商 `[TEST] Northline` | |
| admin-test@stayloop.ai | 后台管理员（`admin_users.role = admin`） | 后台页与 `/api/admin/*` 用它；**不要用 admin@stayloop.ai** |
| muse-tenant / muse-landlord / muse-agent / muse-provider@stayloop.ai | 第二套四身份 | 需要双方互动（消息、委托、工单）时用 |

## 预算（全部测试员共用一个出口 IP，**不得超**）
- 匿名 AI 对话 `/api/agent/turn` 15/h：④ 助理组 6 · ② 公开组 3 · ③ 业务组 2 · ① 身份组 0。
- 登录后模型调用（按 `ai_usage` 计费）：每组 ≤ 8 次。
- 邮箱查询 `/api/auth/email-status` 30/h：① 组 6 · ② 组 2。`/api/consumer/request` 5/h：③ 组 2。
- 邮件：只发给测试号；每组 ≤ 5 封。
- 分享短链 `/go/<code>`：可点，计数会变（登记）。

## 纪律
- 只测不改代码；缺陷写复现（账号 / 路径 / 宽度 / 请求 / 状态码 / 截图路径），按 §7 定 S0–S3 与 P0–P3。
- 可以批准 / 提交测试号自己的待批卡、表单、消息；**不发给非测试邮箱、不触发付款（Stripe live！Checkout 只验到会话创建）、不删除任何行、不撤销他人东西、不改 app_config**；条款弹层可点同意。
- 判「按设计」时引用 CLAUDE.md 的节；发现与自己模块无关的问题也记（标「越界」）。
- 筛查模块（`app/screening/` 等）只做回归比对，不做探索。

## 交付
1. `design/test-cases-2026-10-28/<模块>.md`（用例 + 执行记录 + 缺陷 + 数据副作用）。
2. 回报：摘要表（用例数 / 执行 / 通过 / 失败 / 未执行及原因）+ 缺陷清单（编号 · 严重度 · 一句话 · 复现要点 · 截图路径）+ 越界发现。
