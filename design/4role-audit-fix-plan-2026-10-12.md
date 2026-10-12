# 四角色审计（2026-10-12）· 核实与修改方案

来源：`bug 修复/stayloop-4role-audit-2026-10-12.pdf`（Muse 四个测试号真机实测）。每条先在生产库与代码里核对根因，再给改法。
账号：muse-tenant `492d2d59…` · muse-landlord `22770dec…`（landlords `fd48f17f…`）· muse-agent `df0dd970…` · muse-provider `a581bdbd…`。

## P1

### P1-1 申请 → 筛查断裂（属实 · 四层叠加）
核实：申请 `7b5dfd05…` 的 `files = []`；筛查行 `2803051e…` 在 15:17:30 以 0 个文件建立，服务端按 09-24 规则置 `error: no_documents`；
申请人 15:25 才在**申请对话**里传了两份 PDF（`thread_attachments`，桶 tenancy-files），不进 `applications.files`；
`from-application` 路由对已有筛查行（含 error）直接返回 → 按钮永远是「查看筛查报告」，无法重跑。筛查引擎本身正常。
改法：
1. 路由：0 个材料直接 422（原因 `no_documents`，不建行）；已有行是 `error` 时允许重建；材料清单 = `applications.files` ∪ **申请对话里申请人本人上传的附件**（service role 从 tenancy-files 复制到 tenant-files 的筛查路径，保留原文件名与 SHA-256）。
2. 申请人页：读关联筛查的 `status / error`；error 显示人话原因 +「重新筛查」；0 材料时按钮改为「申请没有附材料 · 请 TA 补充」（直接打开申请对话）。
3. 申请页：材料仍可选（魁北克按 CAI 指引不能强制），但提交前提示「没有材料房东无法筛查」。
守卫：`tests/auditFixes20261012.spec.ts` 加段。

### P1-2 财务页无数据（属实 · 页面从来没有真实数据）
核实：`/landlord/finance` 是纯 DEMO_GATE 样例，没有 liveSlot；空态文案「导入租约后台账自动记录」承诺了不存在的功能。台账的真实来源是在管租约的 `rent_payments`
（L-9F81 的 household 起租 11-01，首期 11-01 才生成）；L-DF4C 是快速录入的 active 租约、没有 household，永远没有台账。
改法：新 liveSlot `components/landlord/RentLedger.tsx`——按房东名下 household 列账期（地址 · 期 · 应付 · 状态 · 付款日），本月 / 今年合计（到账 / 待付 / 逾期），
数据走 RLS 读 `rent_payments`（或扩 `lifecycle_facts_landlord`）；没有 household 的生效租约单独一段「没有在管租约，没有台账 → 邀请租客加入」。空态文案改为事实。

### P1-3 服务商 E2E「阻塞」（不属实 · 测试流程问题）
核实：muse-tenant 15:30 已接受邀请成为 household `2abfd3e7…` 的 active 租客成员，可在 `/tenant/maintenance` 报修；房东已建工单 `15f7b02d…`（new，未派单）；
muse-provider verified、覆盖 plumbing / Toronto、五项资质已核，muse-landlord 在 Pro 试用期内 → 派单弹窗应能选中它。
改法：不改代码；给测试方一份步骤（租客报修 → 房东指派 → 服务商接单报价 → 批准 → 到场完工 → 验收 → 标记已付 → 评价）。部署前我用两个号实走一遍确认弹窗里能选到 Muse。

### P1-4 委托确认邮件发不出（不属实 · 测试邮箱是 example.com）
核实：客户邮箱 `qa-test-wang1@example.com`，Resend 直接 422「Invalid `to` field… domains like example.com」。生产邮件服务正常。
改法（体验）：`sendEmail` 把失败原因带回；委托路由返回 `reason`；客户表横幅写「这个邮箱域名无法投递（example.com 之类的测试域名收不到信）」；
客户表录入邮箱时拒绝 example.com / .test / .invalid / localhost。告知测试方改用真实邮箱（如 muse-tenant@stayloop.ai 或 + 别名）。

### P1-5 身份指示器闪烁（属实）
核实：页面是预渲染静态页，服务端不知道登录者；`Header` 与 `/settings` 用 `activeHat(hats, role)` 取身份，`my_hats` 返回前 `hats` 为空 → `bestHat` 回退租客，
于是先显示「我是租客」+ 租客导航，RPC 回来才换成经纪。服务端注入身份做不到（静态页 + 客户端会话）。
改法：`hats.loading && signedIn` 期间页头显示中性「我是…」（灰色、无颜色）、头像菜单的「当前：…」芯片与身份列表不渲染；
`/settings`（现在没有守卫）、`/leases/import` 等中性页在 hats 加载完前只渲染骨架（`/messages` 已这样）；`WorkspaceShell` 对由 `activeHat` 推出的身份在 loading 时同样先出「…」。

## P2

### P2-1 维度口径 5 / 4 / 6
事实：评分表 `rubric.ts` 四项计分；筛查报告另列第五项「申请完整度与沟通」（权重 0，只提示）；「资料真实性」是取证扣分，不是维度；「六维」是上一轮审计的旧记法。
改法：筛查模块不动；模块外文案统一为「四项计分，报告另列不计分的『申请完整度与沟通』」——申请人页两处、`ApplicantReport`、`/landlord`、`/agent/clients`、`LandlordThreeSteps`、后台模型页描述。

### P2-2 挂牌定价「跳过卖点」
核实：代码里只有单选步在点选 140ms 后自动前进，「卖点」是多选 + 可选 + 输入框，不会自动跳过；未能从代码复现。
改法：用 react-test-renderer 把 5 步按点击与键盘各走一遍；复现不了就把入口的「5 步」改为从 `steps.length` 生成（避免再漂移）并记录。

### P2-3 `/tenant/lease` 不显示在管租约
核实：以 muse-tenant 身份查 households 能读到该行；`HouseholdList` 在页面顶部、无过滤。审计很可能是在接受邀请（15:30）之前看的列表。
改法：部署后用 muse-tenant 登录核对一次；若确有问题再查。

### P2-4 服务商登录后默认「我是租客」（属实）
核实：`displayIdentity` 在中性页（`/`、`/settings`）只认 `activeHat`（租客 / 房东 / 经纪），服务商只在从服务商页面来时（`onProvider`）才显示；新浏览器没有记住的身份 → 租客。
改法：`displayIdentity` 多收 `hats`——只有服务商帽子的账号在中性页一律「我是服务商」；登录落点已是 `/provider/jobs`（`homeForHats`），`AuthPage` 改用 `landingAfterSignIn` 的提示语义，记住的「租客」不盖过纯服务商。

### P2-5 / P2-6 照片必填、Realtor 不可申请：按设计，不改。

## 文案 minor
- 审计页英文「terms confirmation emailed」：`auditActionLabel` 缺 `terms_confirmation_emailed`（顺带补 `delegation_link_resent` 等），加中英映射。
- 「Message AI 助理」：是输入框的 `aria-label`（只有英文模板），改为按语言。
- 「房东直租 ·」截断成「房东」、入住前费用一览无金额：代码里两处都正常渲染（`MoveInCosts` 有 `$2,500`），需在 375 / 1440 用 CDP 实测复现；复现不了记录。
- 「已结案」：非问题。

## 回复审计方的口径
- 试用到 11-14 是 10-12 的正式决定（永久免费档 + Pro 试用，老账号顺延到 11-14），「内部测试期 10-14」已退役；上线公告按 11-14。
- P1-3 / P1-4 / P2-3 不是缺陷，是测试数据或流程问题，附操作步骤。

## 实施顺序与工作量
1. P1-1（半天）→ 2. P1-5 + P2-4（2 小时，同一处身份逻辑）→ 3. P1-2 台账（半天）→ 4. P1-4 原因透传 + 邮箱校验（1 小时）→ 5. P2-1 文案 + minor（1 小时）→ 6. P2-2 / P2-3 / 两条 minor 的实测复现（1 小时）。
每组带守卫；部署后用四个 Muse 号按回归清单逐项复验，再把结果写回本文件。
