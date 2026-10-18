# 全站测试 2026-10-17 · 测试员共用说明

策略：`design/test-strategy-2026-10-17.md`（先读 §2 风险分级、§3 层级、§5 方法、§6 环境、§7 缺陷定义）。每个模块一个文件 `design/test-cases-2026-10-17/<模块字母>-<名字>.md`，
**先设计后执行**：文件前半是用例表（ID · 风险等级 · 前置 · 步骤 · 期望 · 关联守卫），后半是执行记录（实际 · 证据 · 结果 · 缺陷编号）。

## 环境
- 生产 `https://www.stayloop.ai`；仓库 `/Users/neos/Documents/Claude/Projects/stayloop`（node 必须是 22：`node --version`）；Supabase 生产项目 `uotcczsfeiptnabamzcd`（MCP `execute_sql`，**只读或 `begin … rollback`**）。
- service role 请求头文件：`/private/tmp/claude-502/-Users-neos-Documents-Claude-Projects-stayloop/3a39710b-0617-45cd-a7d5-4e60af0e5289/scratchpad/e2e2/h.txt`（`-H @文件`）；Supabase URL 在 `.env.local` 的 `NEXT_PUBLIC_SUPABASE_URL`，anon key 在 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
- 登录：**不输密码、不建账号**。用 Auth Admin 铸魔法链接：`POST <URL>/auth/v1/admin/generate_link?redirect_to=<urlencoded https://www.stayloop.ai/auth/callback?next=/path>`，body `{"type":"magiclink","email":"…"}`，取 `action_link` 在无头 Chrome 里打开即登录。API 探针用密码授权换 JWT：`POST <URL>/auth/v1/token?grant_type=password`，密码见 CLAUDE.md「三角色端到端模拟（2026-09-23）」一节（四个 *-test 号同一密码；muse-* 四个号的密码只在本机 `.forensics-tmp/muse-test-accounts.txt`）；**密码值不得写进任何文件或回报**。
- 浏览器：**不要用内置浏览器面板**（主线程在用）。用无头 Chrome：`/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --headless=new --remote-debugging-port=<随机 9300–9399> --user-data-dir=<自己的 scratchpad 目录>`，CDP 用 node 22 自带 WebSocket 或 `node_modules` 里的 puppeteer-core / playwright（先 `ls node_modules | grep -i -E 'puppeteer|playwright'`）。**同一时间只开一个 Chrome 实例，用完 kill**（这台机 8 GB 内存）。
- 脚本与截图放 scratchpad `/private/tmp/claude-502/-Users-neos-Documents-Claude-Projects-stayloop/3a39710b-0617-45cd-a7d5-4e60af0e5289/scratchpad/sitetest1017/<模块>/`。

## 测试账号（都是 `[TEST]` 数据，可读可写，但不删不改他人数据）
| 账号 | 身份 | authId |
|---|---|---|
| tenant-test@stayloop.ai | 租客（有申请、申请包、在管租约 `1c9abb72…` 成员、消费者档案请求 + 一条身份警示） | dc734f3e-5bdc-4d32-8ba2-e15729c64956 |
| landlord-test@stayloop.ai | 房东（landlords.id 80646b6a…；房源 `[TEST] 100 Test Ave`（已下架）；在管租约 `1c9abb72…`；筛查若干） | 30d0c280-562d-4d6c-85bf-25cf5862cb8e |
| agent-test@stayloop.ai | 经纪（RECO 已核）+ 服务商 `[TEST] Maple Plumbing Inc.` | 查 auth.users |
| provider-test@stayloop.ai | 纯服务商 `[TEST] Northline Home Services Inc.` | f6b97901… |
| muse-tenant / muse-landlord / muse-agent / muse-provider@stayloop.ai | 第二套四身份（房东有 `[TEST] 200 Test QA Lane` 在架、在管租约 `2abfd3e7…`） | 查 auth.users |
| admin@stayloop.ai | 管理员（只用于后台页） | 3896c6f6-49d3-4ecc-b192-674658d44a54 |

## 预算（全部测试员共用一个出口 IP，按模块分配，**不得超**）
匿名 AI 对话 15/h：I+J 组 5 · B+O 组 2 · C+D 组 1 · E 组 1 · 其余 0。邮箱查询 `/api/auth/email-status` 30/h：A+K 组 6 · B+O 组 2。`/api/consumer/request` 5/h：E 组 2。模型调用（登录后的对话、快速发布识图、翻译）每组 ≤5 次。邮件：每组 ≤5 封（都发到测试号邮箱）。

## 纪律
- 只测不改代码；缺陷写复现（账号 / 路径 / 宽度 / 请求 / 状态码 / 截图路径），按 §7 定严重度 S0–S3 与优先级。
- 可以批准 / 提交测试号自己的待批卡、表单、消息（它们是 `[TEST]` 数据），但**不发给非测试邮箱、不触发付款、不删除任何行、不撤销他人东西**；条款弹层可点同意。
- 产生的测试数据登记在文件末尾「数据副作用」一节。
- 每条结论附证据；判断「按设计」时引用 CLAUDE.md 的节。
- 发现与自己模块无关的问题也记（标「越界」），主线程归并。

## 交付
1. `design/test-cases-2026-10-17/<模块>.md`（用例 + 执行记录 + 缺陷 + 数据副作用）。
2. 回报：摘要表（用例数 / 执行 / 通过 / 失败 / 未执行及原因）+ 缺陷清单（编号 · 严重度 · 一句话 · 复现要点）+ 越界发现。
