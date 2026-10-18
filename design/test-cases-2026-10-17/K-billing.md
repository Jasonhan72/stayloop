# K · 支付与订阅（R1）· 2026-10-17

测试员：A+K 组。需求来源：CLAUDE.md「免费模型：永久免费档 + Pro 试用」「支付模块」（订阅卡 v2、按次解锁）「外部变现审计」。**不打开 Checkout、不付款**；Stripe 为 LIVE 模式，只验到会话 URL 创建。

## 用例

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| K-01 | R1 | SQL 只读 | 读 landlord-test / muse-landlord / jasonhan72 的 `landlords` 账单列，按 `resolveSubscriptionState` 推导 | landlord-test、muse-landlord：plan free + `pro_trial_until` 2026-11-15 → `trial`；jasonhan72：pro 无订阅 → `comped`；无 active / canceling / past_due 真实行 → 用 vitest `subscriptionState.spec` 覆盖 | `subscriptionState` |
| K-02 | R1 | 登录 landlord-test | `/settings` 订阅卡 | pill「Pro 试用中」+ 到期日 2026 年 11 月 14 日 +「现在订阅 Pro →」；无「管理订阅」 | `auditFixes20261012` |
| K-03 | R1 | 登录 landlord-test | `/dashboard` 计划芯片 | `plan-trial`「Pro 试用中 · 至 …」；无「管理订阅」按钮（无 customer）；升级弹窗（`?upgrade=1`）列 `LANDLORD_GO` / `LANDLORD_PRO` 同一清单 | 同上 |
| K-04 | R1 | 纯函数 | `isProEntitled`：plan free + trial 未来 → true；trial 过去 → false；pro → true | 与 vitest `freeWindow.spec` 一致；`inInternalTestWindow` 恒 false | `freeWindow` |
| K-05 | R1 | grep + 页面 | 免费配额「每月 3 次」在定价页、房东页 FAQ、筛查营销页、设置页、回访邮件、提示词处处一致 | 没有「5 次」残留 | `freeWindow` |
| K-06 | R1 | landlord JWT | `POST /api/stripe/checkout` | 200 `{url: https://checkout.stripe.com/…}`（trial 允许提前订阅）；不打开 | — |
| K-07 | R1 | landlord JWT | `POST /api/stripe/unlock {payer:'tenant'}` | 400 `tenant_pay_disabled`（RTA s.134） | — |
| K-08 | R1 | landlord JWT | `POST /api/stripe/portal` | 400 `no stripe customer on file`（landlord-test 无 customer） | — |
| K-09 | R1 | 匿名 | checkout / unlock / portal 无 JWT | 401 | 路由审计 |
| K-10 | R1 | 页面 | `/pricing` 房东两卡、`/dashboard?upgrade=1` 弹窗、`/settings` 卡 三处功能清单同源 | 三处文字都来自 `lib/billing/landlordPlans.ts`；定价横幅「租客永久免费 · 房东免费档永久免费 · 新注册 … 30 天」；团队档只有名字 + $39 尚未开售；经纪档「即将推出」 | `honestPlans` `auditFixes` |

## 执行记录（2026-10-17 · 生产；脚本在 `/private/tmp/claude-502/-Users-neos-Documents-Claude-Projects-stayloop/3a39710b-0617-45cd-a7d5-4e60af0e5289/scratchpad/sitetest1017/K/`，JWT 文件只在 scratchpad）

| ID | 实际 | 证据 | 结果 | 缺陷 |
|---|---|---|---|---|
| K-01 | SQL 只读：landlord-test `plan=free, pro_trial_until=2026-11-15 03:59:59+00, unlock_credits=1, 无 customer/订阅` → `trial`；muse-landlord 同 → `trial`；jasonhan72 `plan=pro, 无 customer/订阅` → `comped`。生产没有 active / canceling / past_due 行；五种状态由 vitest `subscriptionState.spec` 覆盖（通过） | SQL + vitest 98 条通过 | 通过 | |
| K-02 | `/settings` 订阅卡：pill「Pro 试用中」、「Pro 全部功能免费试用至 2026年11月14日」、按钮「现在订阅 Pro →」（`subscription-upgrade`）；无「管理订阅」；无「测试期」字样；登录方式行「邮箱 + 密码」 | `K02-settings-subscription.png` | 通过 | |
| K-03 | `/dashboard`：`plan-trial`「Pro 试用中 · 至 2026年11月14日」，无「管理订阅」按钮；`?upgrade=1` 弹窗列出 起步 $0/月 六项 + 专业 $19/月「起步的全部」+ 五项，与 `LANDLORD_GO / LANDLORD_PRO` 逐字一致 | `K03-upgrade-modal.png` | 通过 | |
| K-04 | `isProEntitled`：vitest `freeWindow.spec`（已改写为 entitlement 守卫）通过；`inInternalTestWindow` 恒 false | vitest | 通过 | |
| K-05 | grep：定价页 / 房东页 FAQ / 筛查营销对照表 / 回访邮件 / 提示词 / 设置页都写「每月 3 次」；**`app/screening/app/page.tsx:2756` 中文写「免费档每月 5 单」而英文写 3**；`lib/i18n.tsx:609` 中文「每月 3 次租客筛查。升级解锁无限次使用。」缺英文版的「送 1 次深度核查 / 新账号 30 天 Pro」 | grep 输出 | 失败 | D-K1 D-K2 |
| K-06 | landlord-test JWT `POST /api/stripe/checkout` → 200 `{url: https://checkout.stripe.com/c/pay/cs_live_…}`（trial 状态允许提前订阅）；**未打开、未付款** | curl（URL 已脱敏） | 通过 | 注：Stripe live 账户上会留下一个未完成的 Checkout Session（24 小时过期，无费用） |
| K-07 | `POST /api/stripe/unlock {payer:'tenant'}` → 400 `tenant_pay_disabled`（RTA s.134 文案） | curl | 通过 | |
| K-08 | `POST /api/stripe/portal {return:'settings'}` → 400 `no stripe customer on file` | curl | 通过 | |
| K-09 | 无 JWT：checkout / unlock / portal 都 401 | curl | 通过 | |
| K-10 | `/pricing` 预渲染 HTML 含 `landlordPlans.ts` 全部中文字符串（只有 `/settings` 用的 short 标签不在定价页，设计如此）；三处都 `import … from '@/lib/billing/landlordPlans'`；横幅「租客永久免费 · 房东免费档永久免费 · 新注册的房东账号 Pro 功能免费试用 30 天…」；团队档「$39 / 月 · 尚未开售 · 功能清单待定」；经纪档「即将推出」×3；无 $29 残留、无「测试期」 | curl + node 比对 | 通过 | |


## 缺陷

| 编号 | 严重度 / 优先级 | 一句话 | 复现要点 |
|---|---|---|---|
| D-K1 | S2 / P1 | 筛查页注册提示中文写「免费档每月 5 单」，英文与全站都是 3 次 | `app/screening/app/page.tsx:2756`（筛查模块文件，改前须明确授权）；匿名打开 `/screening/app` 中文界面可见 |
| D-K2 | S3 / P3 | 设置页计划描述 `acct.langplan.planFreeDesc` 中英不一致：英文有「plus one deep check; new accounts get Pro free for 30 days」，中文没有 | `lib/i18n.tsx:609` |
| D-K3 | S2 / P2（与 D-A7 同根） | `/api/stripe/checkout` 与 `/api/stripe/unlock` 对没有房东身份的任何登录账号「自愈」建 landlords 行（含 30 天 Pro 试用 + 1 次解锁额度），只要调用、不必付款 | 代码 `app/api/stripe/checkout/route.ts:60`、`unlock/route.ts:66`；本组**未**用租客 JWT 调用以免制造副作用，仅代码核实 + D-A7 的时间线旁证 |


## 数据副作用

- Stripe live：一个未完成的 Checkout Session（landlord-test，CA$19 订阅，24 小时自动过期，无扣款）。
- 无数据库写入（全部只读查询与 400/401 响应）。

