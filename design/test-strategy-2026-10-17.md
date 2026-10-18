# Stayloop 全站测试策略与计划（v2 · 2026-10-17）

取代 `design/test-plan-2026-09-22.md`（v1 按「层」分工，适合那时 60 条路由的站；现在 112 个页面路由 / 91 个接口 / 106 张表 / 7 个定时任务 / 5 种身份，
且自 2026-10-02 上一轮以来几乎每个模块都动过）。流程按 ISTQB 测试过程（计划 → 分析 → 设计 → 实现 → 执行 → 完成）与风险驱动测试组织，
测试层级按测试金字塔，缺陷按「严重度 × 优先级」双轴，发布按进入 / 退出标准与 Go / No-Go 评审。

## 1. 范围与系统盘点（2026-10-17）

| 维度 | 数量 | 说明 |
|---|---|---|
| 页面路由 | 112 | 公开 24 · 认证与引导 9 · 租客 13 · 房东 17 · 经纪 14 · 服务商 3 · 共享（在管租约 / 消息 / 设置 / 事务）8 · 令牌页 7（`/verify /intake /join /p /w /delegate /my-file`）· 后台 9 · 筛查模块 8 |
| 接口 | 91 | 公开（无凭证）：`/api/v1/*` 7 + `/api/mcp` + `/api/public/stats` + `/api/listings/{search,[slug],enrich}` + `/api/consumer/*` 7 + `/api/auth/email-status` + `/api/contact` + 令牌门 `/api/w /api/agent-intake /api/verify/[token]/*`；JWT：约 40；密钥 / cron 密钥：`/api/cron/*`、`/api/agent/proactive`、`/api/threads/inbound`、`/api/stripe/webhook`、`/api/verify/webhook/veriff`、`/api/v1/{passport/verify,screen}` |
| 数据 | 106 表 · 5 视图 · 161 函数 · 4 桶 | 全部 RLS；只追加表：`thread_messages`（哈希链）、`message_deliveries`、`thread_inbound`、`work_order_events`、`screening_corrections`、`passport_share_views`、`notice_service_records`（无 update/delete） |
| 定时任务 | 7 pg_cron + 3 GitHub Actions | proactive 13:00 · registration 13:20 · screening-stuck 13:25 · anon-rate-cleanup 13:30 · delegation-expiry 13:15 · lease-promote 05:05 · model-discover 周一 13:40；LTB / 联邦注册库 / 租金基准每月 |
| 身份 | 5 | 租客（恒有）· 房东（`landlords` 行）· 经纪（`agent_profiles` verified / renewal_due）· 服务商（`service_providers`）· 管理员（`admin_users`） |
| 外部依赖 | 12 | Supabase（Auth / REST / Storage / Realtime）· Cloudflare Pages + Email Worker · Resend · Stripe（live）· 模型厂商 ×7 · Jina · Nominatim / Overpass · Google Maps · Web Push · Veriff / Flinks / Equifax（无生产凭证）|

**不在范围**：筛查评分规则本身（`DO NOT TOUCH` 模块，只做回归比对，不做探索性测试）；Safari / Firefox 自动化（无工具，手动抽查）；真实付款（Stripe live，只验到 Checkout 会话创建）；真实 Veriff / Flinks / Equifax 步骤（无凭证）。

## 2. 风险评估与优先级（风险 = 业务影响 × 变更频率 × 复杂度）

| 等级 | 模块 | 为什么 |
|---|---|---|
| **R1 关键** | 身份与授权（登录 / 注册 / 帽子 / RLS / 列级权限）· 筛查闭环（申请 → 一键筛查 → 报告 → 决定通知）· 租约与在管租约（电子签 → household → 租金记录 / 凭证 / 确认）· 消费者档案（s.12 / s.13，新上线）· 支付（订阅 / 解锁 / 试用判定）· 公开 API 与 MCP（新上线、对外） | 法律责任或资金 / 个人信息；10-11 起公开页改走服务端接口并撤销 anon 读表，10-12 起免费模型 + Pro 试用重写了全部付费门禁 |
| **R2 重要** | AI 助理（对话 / 待批卡 / 执行器 / 60 秒撤销 / 记忆 / 线程）· 消息系统（只追加 / 哈希链 / 邮件回复入档 / 中转）· 房源（快速发布 / 向导 / 详情 / 翻译 / 交通 / 可见性）· 申请包 · 维修与服务市场（工单状态机 / 派单策略 / SLA）· 经纪工具（认证 / 客户表 / 委托 / 收件链接 / 核对清单）· N 表工具箱 · 外省法规分流 | 核心体验；状态机多、角色多 |
| **R3 一般** | 营销页与 SEO · 定价与文案事实 · 设置 · 审计页 · 后台页 · 推送 · 定时任务 · 模型目录 | 错了可见但不致命 |

本轮执行顺序 R1 → R2 → R3；R1 全部用例必跑，R2 按模块抽样 ≥70%，R3 抽样 ≥40%。

## 3. 测试层级（测试金字塔）

| 层 | 内容 | 工具 / 位置 | 门禁 |
|---|---|---|---|
| T1 静态 | tsc · eslint · 文案守卫（CRA 措辞、命名、禁用词） | `npx tsc`、`npx next lint`、`tests/*Copy*` | 部署脚本 |
| T2 单元 | 纯函数（规则 / 日期 / 匹配 / 解析 / 评分表）· 组件真实渲染（react-test-renderer） | vitest 205 文件 / 2861 条 | 部署脚本 |
| T3 契约 | 接口契约（状态码 / 错误体 / 头 / CORS / 限流）· OpenAPI 与路由一致 · MCP 协议 · RPC 返回形状 | `scripts/route-audit.mjs`（扩）· `tests/v1stage5_*` | 部署脚本（信息性 → 本轮起**阻断**） |
| T4 集成 | 数据库：RLS 权限矩阵（身份 × 表 × 动作，回滚事务）· 触发器 · 函数 ACL · 只追加 · 存储桶策略 · 定时任务可触发 | `scripts/e2e/db-matrix.sql`（本轮新建，可重复）· Supabase MCP | 每次迁移 |
| T5 端到端 | 关键业务流（§5 的 F 系列），脚本化（REST + 路由 + 无头 Chrome），四个测试号 + 匿名 | `scripts/e2e/*.sh`（本轮补齐）· 无头 Chrome + CDP | 每次发布 |
| T6 非功能 | 安全（OWASP ASVS L1 子集：认证 / 会话 / 授权 / 输入 / 限流 / 头 / 密钥不出库）· 性能基线（TTFB、接口 P95、并发 300）· 可访问性（WCAG 2.1 AA 子集：单 h1 / alt / 表单标签 / 对比度抽查 / 键盘）· 国际化（zh / en 单语一致、日期货币格式）· 兼容（320 / 390 / 768 / 1024 / 1440；Chromium 自动，Safari / Firefox 手动抽查）| 无头 Chrome · curl · `scripts/mobile-audit.mjs` | 每次发布抽样 |
| T7 合规 | RTA / OHRC / CRA / PIPEDA / LSA / TRESA 的文案与行为（不给分数给租客、不选表、不代送达、注册前不开第三档、Crown copyright 只链接） | 守卫 + 人工核对清单 | 每次涉法改动 |
| T8 运维 | 定时任务最近运行结果 · 邮件送达（Resend 事件）· 推送 · Sentry 近 7 天错误 · Supabase advisors · 备份策略 | SQL · 控制台 | 每周 |

## 4. 追溯矩阵（模块 → 需求来源 → 用例组 → 自动化守卫）

| # | 模块 | 需求来源（CLAUDE.md 节 / 设计稿） | 用例组 | 已有守卫 |
|---|---|---|---|---|
| A | 身份与账号 | 一个账号三顶帽子 · 首次登录先选身份 · 设置助理前先登录 · 页头身份色 · 免费模型 | A-01…A-20：注册 / 登录 / 忘记密码 / Google / 邮箱先行判断 / 条款弹层 / 密码 90 天 / 帽子开通 / 身份切换 / 落点 / 退出清缓存 | `homeCentered` `authPages` `emailStatus` `trrebReady` `onboarding*` `logoHome` |
| B | 公开页与营销 | 首页 V0.7 / 讲一个故事 / 方案 A / 手机平板缩短 / 文案保持原样 | B-01…B-15：首页各节顺序 · 示例按身份 · 四角色页 · 定价事实 · FAQ JSON-LD · 页脚 | `home*` `eliseai` `homeRoles` `honestPlans` |
| C | 房源 | 发布向导 / 快速发布 / 详情页三轮 / 单语 / 相似 / 交通 / 可见性 / 测试标记 / 服务端分页 | C-01…C-25 | `quickPublish` `listingLang` `listingSimilar` `testListings` `trrebReady` |
| D | 申请与申请包 | 申请表四坑 / 申请人追踪 / 阶段 4 | D-01…D-15 | `v1stage4_*` `lifecycleP1` |
| E | 筛查闭环与消费者档案 | 申请 → 一键筛查 / 决定通知 / 下一步 / 消费者档案 / CRA_MODE / 角色门 | E-01…E-25（含 case 28 回归：66 / review / 无门槛） | `v1stage1_*` `v08_consumer*` `craMode` `screeningRoleGate` `case28KimYi` |
| F | 租约与在管租约 | 电子签 / 导入 / household / 租金记录与凭证 / CSV / 提醒 / N 表 / 续约 90-60-30 / 外省 / 退租工具 | F-01…F-30 | `v1stage3_*` `provinceRenewal` `sweep20261001_A6` `node1Facts` |
| G | 维修与服务市场 | Phase 0/1/P2 / SLA / 婉拒 / 评价 | G-01…G-20 | `marketplace` `dispatchPolicy` `node3Execution` |
| H | 消息与沟通 | A 期 / 人名优先 / 只追加 / 哈希链 / 邮件回复 | H-01…H-18 | `messagingA` `messagingPeople` `node4Threads` |
| I | AI 助理 | 对话 / 待批卡白名单 / 执行器重核 / 撤销 / 记忆 / 引导卡 / 线程 / 布局 | I-01…I-25 | `sweep20261001_*` `guidedIntake` `threadCards` `assistantLayout` |
| J | 经纪工具 | 认证 / 客户表 / 委托 / 收件链接 / 核对清单 / TRESA 文件 | J-01…J-15 | `v1stage2_*` `node5Matters` `delegationExpiry` |
| K | 支付与订阅 | 订阅卡 v2 / 解锁 / 试用 / 免费配额 | K-01…K-10 | `freeWindow` `subscriptionState` `auditFixes` |
| L | 开放 API 与 MCP | 阶段 5 契约 | L-01…L-20 | `v1stage5_*` |
| M | 后台 | 核验 / 用户 / 合作方 / 服务商 / 经纪 / 模型 / 消费者队列 | M-01…M-12 | `modelAutoDiscover` `v08_consumerAdmin` |
| N | 定时任务与通知 | 7 个 cron / 回访邮件 / 推送 | N-01…N-10 | `v1stage1_followUp` `webPush` |
| O | 法律页与合规 | 条款 / 隐私 / 规则页 / 消费者权利 | O-01…O-08 | `craWording` `complianceCopy` `honestPassport` |

每条用例写：ID · 前置 · 步骤 · 期望 · 实际 · 证据 · 结果 · 关联守卫。矩阵与用例落在 `design/test-cases-2026-10-17/<模块>.md`。

## 5. 用例设计方法

- **权限矩阵**（T4）：5 身份 × 本人 / 他人 × 关键表（screenings / applications / lease_documents / households / rent_payments / threads / applicant_profiles / consumer_* / work_orders / delegations）× 读 / 写 / 删，期望值由 RLS 与触发器推导，脚本一次跑完并输出差异。
- **状态机**：工单（offered → … → closed 与分支）、委托（pending → active → revoked / expired）、消费者请求（pending_verification → matched / needs_review → fulfilled / closed）、待批卡（pending → approved → executed / expired / undone）、租约（draft → sent → signed_tenant → signed_both / ended）——每条合法迁移一条用例，每条非法迁移一条反例。
- **等价类 / 边界值**：日期算术（N1 90 天、N4 7 / 12 天、N12 60 / 120、2 个工作日）、限流（第 N 与 N+1 次）、文件（大小 / 类型 / 数量上限）、金额（0 / 负 / 上限）。
- **错误注入**：外部服务失败（Jina 402、Overpass 429、Resend 422、模型 5xx）→ 页面与审计如实记录而不是假成功。
- **探索性测试**：每个模块 30 分钟会话式探索（session-based），记录路径与发现。

## 6. 环境、数据与预算

- **环境**：生产 `www.stayloop.ai`（只读探针 + 测试号可写）；本地 `next dev`（破坏性与错误注入）；数据库回滚事务（`begin … rollback`）。
- **测试账号**（密码不输入，魔法链接铸造，`redirect_to` 放查询参数）：tenant / landlord / agent / provider-test@stayloop.ai、muse-* 四个、`admin@stayloop.ai`（后台）。**不建新账号**；测试数据一律 `[TEST]` 前缀并登记在报告 §8，正式发布前统一清理。
- **预算**：匿名 AI 对话每 IP 每小时 15 次（全部测试员共享 → 分配表）；邮箱查询 30/h；`/api/consumer/request` 5/h；模型调用按 `ai_usage` 计费；邮件走 Resend 配额。
- **工具纪律**：内置浏览器面板只给主线程；测试员用无头 Chrome + CDP（各自 profile）；每个结论附命令 / 状态码 / 截图路径。

## 7. 缺陷管理

| 严重度 | 定义 | 示例 |
|---|---|---|
| S0 阻断 | 数据泄露 / 越权 / 资金错误 / 主流程不可用 / 法律责任 | 他人能读筛查；anon 能写表；付费门禁失效 |
| S1 严重 | 关键流程某分支失败，无绕行 | 电子签后 household 没建；争议更正不通知 |
| S2 一般 | 功能可用但结果错或体验明显受损 | 计数不一致；文案与事实不符；手机溢出 |
| S3 轻微 | 视觉 / 文案 / 可访问性小问题 | 对齐、标点、alt 缺失 |

优先级 P0（立即，阻断发布）/ P1（本轮修）/ P2（下轮）/ P3（记录）。生命周期：发现（测试员，含复现）→ 复核（独立复核员从头复现并定级）→ 分派（按文件互不重叠分组）→ 修复（每条带一条在旧代码上会失败的守卫）→ 审查（读整体 diff + 全量测试）→ 验证（测试员用原复现脚本在生产复测）→ 关闭。误报与「按设计」要写明理由。

## 8. 进入 / 退出标准与发布门禁

- **进入**：T1–T3 全绿；生产与仓库同一提交；测试号可登录；预算表已分配。
- **退出**：R1 用例 100% 执行、通过率 100%（S0 / S1 = 0）；R2 ≥ 70% 执行、S1 = 0、S2 有修复计划；R3 ≥ 40%；路由审计全过；Supabase advisors 无新增 ERROR；定时任务最近一次全部成功；逃逸缺陷（上一轮已知未修的）逐条复核。
- **Go / No-Go**：主线程汇总 §9 指标，列出残留风险与绕行方案，由用户拍板。

## 9. 度量

用例总数 / 执行率 / 通过率（按模块与风险等级）· 缺陷数（按严重度 × 模块）· 缺陷密度（每模块缺陷 / 用例）· 自动化覆盖（有守卫的用例占比）· 修复周期（发现 → 关闭）· 逃逸率（生产用户报告 ÷ 本轮发现）· 性能基线（首页 / 定价 / 房源 / 筛查 / API 文档 TTFB，`/api/listings/search` 与 `/api/v1/rules` P95）。

## 10. 执行计划（本轮）

1. **计划与设计（主线程，0.5 天）**：按 §4 写 15 个模块的用例文件（每条带 ID 与期望），分配预算与账号。
2. **执行（并行，按模块而非按层）**：8 个测试员——① A+K 身份与付费 ② B+O 公开与法律页（含 T6 视口 × 双语）③ C+D 房源与申请 ④ E 筛查闭环与消费者档案 ⑤ F 租约与在管租约 ⑥ G+H 维修与消息 ⑦ I+J AI 助理与经纪 ⑧ L+M+N API / MCP / 后台 / 定时任务；另 1 个 T4 权限矩阵脚本员、1 个 T6 安全专项（ASVS 子集 + 密钥扫描 + 头 + 限流）。
3. **复核（1 人）**：所有 S0 / S1 从头复现。
4. **修复（按文件分组并行）→ 审查 → 全量门禁 → 部署 → 复测**。
5. **完成**：报告 `design/test-report-2026-10-17.md`（§3 摘要表 · 逐模块明细 · 缺陷清单 · 未执行 · 数据副作用 · §9 指标 · Go / No-Go 建议）；用例文件与权限矩阵脚本入库，成为以后每次发布的回归基线。

## 11. 节奏（以后）

每次部署：T1–T3 自动。每次涉及界面 / 路由 / 权限的改动：T4 矩阵 + 该模块 T5。每次发布前：本策略 §8 的退出标准。每周：T8。每月：全量 R1 + 抽样 R2 / R3。
