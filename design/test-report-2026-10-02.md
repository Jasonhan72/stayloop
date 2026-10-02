# Stayloop 全站测试报告（2026-10-02 · 按 `design/test-plan-2026-09-22.md` 执行）

执行人：Claude（Opus 5.5）+ 六个并行测试员、三个独立复核员、八个修复组、一个合并审查员 · 环境：生产 www.stayloop.ai（Cloudflare Pages）+
Supabase `uotcczsfeiptnabamzcd` · 被测版本 a1fab56（当日的手机、平板首页缩短之后）· 修复版本 ac9d22d · 本机 node 22.23.3

## 1. 摘要

| 层 | 内容 | 用例 | 通过 | 失败 | 未执行 | 结论 |
|---|---|---|---|---|---|---|
| L0 | tsc / lint | 2 | 2 | 0 | 0 | 通过（lint 0 error） |
| L1 | vitest 单元与模块 | 139 文件 / 1,895 条 | 1,895 | 0 | 0 | 通过（修复后；被测版本为 1,782 条） |
| L2 | next-on-pages 构建 | 1 | 1 | 0 | 0 | 通过（Worker 163 模块，约 13.4 MB） |
| L3 | 部署后冒烟 | 9 | 9 | 0 | 0 | 通过 |
| L4 | 路由与接口契约 | 23 组（route-audit 72 条 + 84 条补充探针） | 21 | 2 | 0 | 修复后通过；修复版 route-audit 77/77 |
| L5 | 数据边界 · 触发器 · 数据健康 · advisors | 51 | 48 | 3 | 0 | 修复后通过（1 条留给用户决定） |
| L6 | 系统适配：公开页 5 宽度 × 中英 / 四个测试号登录后各页 | 20 + 17 | 22 | 15 | 0 | 修复后通过 |
| L7 | 关键业务流：匿名 / 登录 | 29 + 32 | 51 | 10 | 0 | 修复后通过（1 条留给用户决定） |

测试员共 172 条用例（142 通过 / 30 失败），报告缺陷 41 条（P1 7 条，复核后 2 条维持 P1），去重后约 34 项。**全部修复并已上线**，例外见第 4 节。
修复后在生产上逐项复测（第 3 节「复测」列）。

## 2. 方法

- **六个测试员并行**，各自一层：L4 接口契约（+ lint）、L5 数据边界（Supabase MCP，只读或 `begin … rollback`）、L6 公开页（320 / 390 / 768 / 1024 / 1440 ×
  中英，减少动态模式）、L6 登录后（四个测试号：tenant / landlord / agent / provider-test@stayloop.ai，用 service role 铸一次性登录链接，不输入密码、
  不建新账号）、L7 匿名流程、L7 登录流程。共用一个出口 IP，匿名 AI 对话与邮箱查询按预算分配。
- 每条缺陷要求可复现；P0/P1 由**独立复核员从头复现**并判定真实严重度。
- 修复分 **8 个文件互不重叠的组**，每组为每个缺陷补一条在旧代码上会失败的守卫测试（`tests/siteTest20261002_g1…g8`）；合并后由审查员读整体 diff、跑全部测试，
  提出 2 条必改 + 4 条应改，主线程处理后再跑全量。
- 数据库改动先在回滚事务里试跑，再用 `apply_migration` 应用。
- 修复上线后用测试员留下的复现脚本在生产上复测。

## 3. 缺陷清单

| 编号 | 严重度 | 问题 | 修复 | 复测（生产） | 守卫 |
|---|---|---|---|---|---|
| L6-authed D1 | **P1** | 没有房东身份的已登录账号打开 `/landlord/*`、`/dashboard`：守卫 effect 依赖每次渲染都新建的对象，又调用 `setRole()` 触发事件把 landlord 写回，形成死循环——10 秒内 1,860–23,765 次 `/landlord/become` 请求，页面停在「…」 | 只依赖基本值、每个路径只跳一次、直接写本地存储；auth / 身份未知时整页显示「…」（真实房东只挂载一次）；`useLandlord` 也只跳一次 | 租客号三个路由各一次跳转、稳定在约 60 个请求 | g1 |
| L7-anon D-01 | **P1** | Realtor.ca 导入的房源显示「提交完整申请」，申请材料会发到导入者账号 | 房源页去掉入口；`/apply/<slug>` 拒绝并指向认证经纪；数据库触发器拒绝对 realtor 房源插入 applications / showing_intents | 房源页 0 个申请链接；`/apply` 显示拒绝页 | g2、迁移 `20261002_realtor_no_apply` |
| L6-authed D5 · L7-signed-in D6 | P2 | 只有服务商身份的账号登录后进了租客对话；无房东身份访问 `/landlord/*` 会启动房东会话 | `landingAfterSignIn`（旧角色只作提示）；助理页与 todo / ideas / progress 在确认房东身份前不启动会话 | 服务商号落在 `/provider/jobs` | g1 |
| L6-authed D2 | P2 | 租约条款缺联系人块时 `/landlord/leases/<id>` 崩溃 | 先校验嵌套结构，不完整则显示记录视图 | 该租约页无异常 | g4 |
| L4 D1 | P2 | 全站 `Permissions-Policy: microphone=()`，语音输入按钮可见但不能用 | `microphone=(self)` | 响应头已变 | g3 |
| L4 D2 / D3 | P2 | 旧接口 `/api/ai-score`：无调用方、无鉴权、可调用付费模型、返回数据库原始错误 | 删除 | 404 | g3 |
| L4 D4 | P2 | 冻结的 Stripe Connect 接口对匿名返回 501 | 先鉴权（401），冻结返回 410 | 匿名 401 | g3 |
| L4 D5 | P2 | worker 渲染的页面与接口缺 `X-Content-Type-Options: nosniff` | middleware 与 `_headers` 加上 | 已有 | g3 |
| L6-public D1 · L7-anon D-07 | P2 | `/stayloop-api/docs` 每次打开都报 React #418：Cloudflare 邮箱混淆改写了文本节点里的邮箱 | 邮箱拆成多个元素 | 中英文 0 个水合错误，邮箱正常显示 | g3 |
| L7-anon D-02 | P2 | `/landlord` 角色页写「8 维尽调」「按收入倍数排名、推荐她」 | 按现行规则改写（四项打分、不排名、无收入倍数门槛、房东决定） | — | g6 |
| L7-anon D-09 | P2 | `/agent` 角色页人物故事里有虚构的业绩数字 | 删去数字；角色页人物故事眉标改为「场景示例」 | — | g6 |
| L7-anon D-03 | P2 | 护栏把只是「列出筛查不看哪些受保护特征」的解释也当成拒绝信，追加 OHRC 警告 | 按句判断、排除否定句；双重否定（「不得不拒绝」「no choice but to decline」）仍算拒绝 | — | g7 |
| L7-anon D-04 | P2 | 英文界面里 Realtor 房源卡显示中文说明 | 补英文 | — | g2 |
| L7-anon D-06 | P2 | 单元号重复（「608 - 1080 BAY STREET #608」），含浏览器标签标题 | `listingTitle()` 统一处理 | — | g2 |
| L6-authed D3 · L7-signed-in D2 | P2 | 申请人详情页在 375 / 390 宽出 17–32px | `min-w-0` 与换行 | 375px 溢出 0 | g4 |
| L7-signed-in D1 | P2 | 未开始的租约在在管租约页写成「租中」 | 用租约状态词「已签 · 待起租」 | — | g4 |
| L7-signed-in D3 | P2 | 未筛查的申请人显示「评分中」 | 显示「未筛查」 | — | g4 |
| L7-signed-in D4 | P2 | 文案写报告有「五个维度」，实际四项 | 改为四项 | — | g4 |
| （复核中发现） | P2 | 申请人详情页硬门槛显示内部代码 | 走 `signalLabel` | 内部代码 0 处 | g4 |
| L6-authed D4 | P2 | 打开对话时整页被滚到对话处 | 只滚动对话容器 | — | g5 |
| L6-authed D6 | P2 | 390 宽时对话头部「查看这件事 →」被裁掉看不见 | 调整布局 | — | g5 |
| L6-authed D7 | P2 | 若干只有图标的按钮没有可读名称 | 补中英文 aria-label | — | g5 |
| L7-signed-in D5 | P2 | 租客新建报修弹窗按 Esc 不关闭 | 加上 | — | g5 |
| L6-public D7 · L6-authed D8 | P2 | `/listings`、助理预览、多个工作台页、`/verify/<无效>` 没有 h1 | 壳在缺失时补一个视觉隐藏的 h1；`/listings`、`/verify` 补可见 h1 | 抽查页面 h1 均为 1 个 | g1、g2、g6 |
| L6-public D2 / D3 / D4 / D5 / D6 | P2 | 页脚、预览横幅、`/services`、`/partners` 的链接或箭头折行；Realtor 房源按钮剩一个词；`/platform` 中文单字孤行 | `whitespace-nowrap`、不换行空格、`text-wrap: balance / pretty` | — | g1、g2、g6 |
| L7-anon D-10 | P2 | `/platform` 的租客入口指向首页、其他两个指向角色页 | 统一指向角色页 | — | g6 |
| L6-public D8 | P2 | `scripts/mobile-audit.mjs` 写死了本机不存在的浏览器路径 | 用默认启动器 / 环境变量覆盖 | — | g3 |
| L5-D1 | P2 | 任何在管租约成员都能替换已核验、已双签租约的文件 | 只允许导入者在未核验、对方未加入时替换，并写审计 | 回滚事务验证 | g8、迁移 `20261002_site_test_fixes` |
| L5-D2 | P2 | 一条筛查卡在 uploading 7 天，没有任何清理 | 每日 `screening-stuck-sweep`（13:25 UTC）：超过 24 小时仍在 uploading / scoring 的标 error | 该行已标 error | g8 |
| L5-D3 | P2 | 11 份已应用的迁移不在迁移历史表里 | 补记 | 已补 | — |

## 4. 未修复 / 未执行

**留给用户决定**
- **L7-anon D-05**：一套蒙特利尔房源（`1569-rue-st-hubert-…`，真实房东账号，7 月核验，在线）省份存成 ON。**用户决定改为 QC，已改（2026-10-02），保持在线。**
  跟进（同日）：房源详情页的安省内容（RTA 说明、入住费用卡、TRREB 均价、RECO 经纪推荐）改为只对安省房源显示，外省房源显示一句说明。
- **L5-D4**：Supabase Auth 的「泄露密码检查」（Have I Been Pwned）。**用户同意后已开启（2026-10-02）**，三处设置密码的地方都显示可读的提示。
- `/landlord` 主标题「…让 AI 替你租得快、选得准」中的「选得准」与「房东决定」的口径是否冲突——文案决定。

**记录不改（风险低或无法触发）**
- `privacy@stayloop.ai` 还在 `/tenant` FAQ、`/join/<token>` 的长文本里，理论上会被 Cloudflare 邮箱混淆改写；测试中这两页没有出现水合错误。根治办法是在 Cloudflare 关闭 Email Address Obfuscation（账号设置）。
- `/verify/<token>` 在接口返回 5xx 时停在加载骨架（只修了无效 token 的 404 情况）。
- 租约发送 / 签署接口仍用较宽的条款检查；签署页已对不完整条款做了容错，不会崩溃。
- `scripts/mobile-audit.mjs --authed` 的种子数据写入旧的 `household_messages` 表（已改为只读），登录模式暂不可用；公开模式已修好。
- Realtor 房源卡的收藏标题改为语言中性（「Studio」）。

**未执行**
- Safari / Firefox / 真机 iOS：只有 Chromium 自动化。
- 发送邮件回复入档、Realtime 第二个会话收到推送、真实筛查（会花模型费用并使用申请人个人信息；当日未改筛查规则）。
- 带服务端副作用的点击：批准 / 执行待办卡、发布房源、提交申请、Stripe 付款。

## 5. 测试数据与副作用

- 测试员在生产上只产生：一条测试消息（工单对话 `3c1f0531…`，thread_messages id 19，正文 `[TEST]`；消息表只追加，无法删除，按设计保留）及其两封发往
  @stayloop.ai 测试地址的通知邮件；约 95 条四个测试号的会话审计事件（页面加载时写入）；限流计数器。
- 所有数据库探针都在回滚事务里执行；修复用的两份迁移按规范先试跑后应用。
