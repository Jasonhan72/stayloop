# K · 支付与订阅（R1）· 2026-10-28

测试员：① 身份组。基线 `design/test-cases-2026-10-17/K-billing.md`；需求：CLAUDE.md「当前产品决定 · 定价」「关键不变量 · 帽子」（计费路由对没有房东帽子的账号返回 403）。**Stripe 为 LIVE；只验到 Checkout 会话创建，不打开、不付款。**
JWT：三个账号的 `access_token` 从各自浏览器 profile 的 `sb-*-auth-token` 取出，只存 `AKMT/jwt-*.txt`（scratchpad），不进报告。脚本 `AKMT/jwtprobe.sh → jwtprobe.out`、`AKMT/cors.out`（无凭证）、页面 `landlord.mjs → landlord.json`、定价页文本抽取（`pricing.html` + python）。

## 用例

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| K-01 | R1 | SQL 只读 | landlord-test 的 `landlords` 账单列 → `resolveSubscriptionState` | plan free + `pro_trial_until` 2026-11-15 → `trial`；无 customer / 订阅 | `subscriptionState` |
| K-02 | R1 | landlord-test 登录 | `/settings` 订阅卡 | 「Pro 试用中」+ 至 2026年11月14日 +「现在订阅 Pro →」（`subscription-upgrade`）；无「管理订阅」 | `auditFixes20261012` |
| K-03 | R1 | 同上 | `/dashboard` 计划芯片 + `?upgrade=1` 弹窗 | `plan-trial`「Pro 试用中 · 至 2026年11月14日」；弹窗列 `LANDLORD_GO / LANDLORD_PRO` 同一清单 | 同上 |
| K-05 | R1 | 页面 + 代码 | 「每月 3 次」一致性；复测 D-K1（筛查页中文「5 单」）与 D-K2（设置页中英不一致） | 无「5 次 / 5 单」；中英同义 | `freeWindow` |
| K-06 | R1 | landlord JWT | `POST /api/stripe/checkout {}` | 200 `{url: https://checkout.stripe.com/…cs_live…}`（trial 可提前订阅）；**不打开** | — |
| K-07 | R1 | landlord JWT | `POST /api/stripe/unlock {payer:'tenant'}` | 400 `tenant_pay_disabled`（RTA s.134） | — |
| K-07b | R1 | landlord JWT | `POST /api/stripe/unlock {}` | 200 Checkout URL（房东自付预付额度）；不打开 | — |
| K-08 | R1 | landlord JWT | `POST /api/stripe/portal {}` | 400 `no stripe customer on file` | — |
| K-09 | R1 | 匿名 | checkout / unlock / portal 无 JWT | 401 | 路由审计 |
| K-10 | R1 | 页面 | `/pricing` 事实：租客永久免费、房东免费档永久免费、Pro $19、经纪「尚未开售」、团队 $39 尚未开售、无 $29 / $59 / 测试期 | 与 CLAUDE.md 一致；三处清单同源 `lib/billing/landlordPlans.ts` | `honestPlans` |
| K-11 | R1 | tenant JWT / admin-test JWT（都无房东帽子） | `POST /api/stripe/checkout {}`、`/api/stripe/unlock {}` | **403 `landlord_required`**，不建 `landlords` 行（复测 T6-D1 / D-A7 / D-K3） | `siteTest20261018_s0s1` |
| K-12 | R1 | 篡改 JWT / anon key 作 Bearer | `POST /api/stripe/checkout` | 401 | — |
| K-13 | R3 | 页面 375 | `/pricing`、`/settings` 手机宽 | 无横向溢出 | — |

## 执行记录（2026-10-28 · 生产）

| ID | 实际 | 证据 | 结果 | 缺陷 |
|---|---|---|---|---|
| K-01 | SQL：landlord-test `plan=free, plan_status=null, pro_trial_until=2026-11-15 03:59:59+00, unlock_credits=1, stripe_customer_id=null` → `trial`；房东 JWT REST 读自己 `landlords` 行得到同样的 plan / trial 值 | SQL；`jwtprobe.out` landlord 段 | 通过 | |
| K-02 | `/settings`：pill「Pro 试用中」、「Pro 全部功能免费试用至 2026年11月14日，到期自动降为 Free，不扣款、不要信用卡」、按钮「现在订阅 Pro →」（`subscription-upgrade` 1 个）、「管理订阅」0 个；登录方式「邮箱 + 密码」 | `AKMT/K02-settings-subscription.png`、`landlord.json.settingsSub` | 通过 | |
| K-03 | `/dashboard`：`plan-trial`「Pro 试用中 · 至 2026年11月14日」、无「管理订阅」、「升级到 Pro」；`?upgrade=1` 弹窗「选择你的方案」：起步 $0/月 六项 + 专业 $19/月「起步的全部」+ 五项，逐字 = `LANDLORD_GO.features / LANDLORD_PRO.features` | `AKMT/K03-dashboard.png` `K03-upgrade-modal.png` | 通过 | |
| K-05 | `/pricing` 文本「每月 3 次」×3、「5 次」0；`app/screening/app/page.tsx:2758` 中文现为「免费档每月 3 单」（D-K1 已修）；`lib/i18n.tsx:613 planFreeDesc` 中文「每月 3 次租客筛查，另送 1 次深度核查；新账号免费试用 Pro 30 天」与英文同义（D-K2 已修） | python 抽取 + grep | 通过 | |
| K-06 | landlord JWT `POST /api/stripe/checkout {}` → 200 `{"url":"https://checkout.stripe.com/f/pay/cs_live_…"}`；未打开 | `jwtprobe.out` | 通过 | 副作用：1 个未完成 live Checkout 会话 |
| K-07 | `{payer:'tenant'}` → 400 `code: tenant_pay_disabled`，文案引用 RTA s.134 | 同上 | 通过 | |
| K-07b | `POST /api/stripe/unlock {}` → 200 `{"url":"https://checkout.stripe.com/c/pay/cs_live_…","payer":"landlord"}`；未打开 | 同上 | 通过 | 副作用：1 个未完成 live Checkout 会话 |
| K-08 | `POST /api/stripe/portal {}` → 400 `no stripe customer on file` | 同上 | 通过 | |
| K-09 | 无 JWT：checkout / unlock / portal 都 401 `unauthorized`；`OPTIONS /api/stripe/checkout` 204、ACAO 本站 | `AKMT/cors.out` | 通过 | |
| K-10 | `/pricing` 预渲染：横幅「租客永久免费 · 房东免费档永久免费 · 新注册的房东账号 Pro 功能免费试用 30 天，不要信用卡，到期自动降回免费档」；起步 $0「永久免费」六项、专业 $19「最受欢迎」；团队「$39 / 月 · 尚未开售 · 功能清单待定」；经纪档「现在可用的是免费档：RECO 注册核验徽章、认证经纪目录与 AI 助理。日程编排、客户管理等付费工具即将推出、尚未开售。不抽任何佣金」；「$29」「$59」「测试期」0 命中；FAQ「免费档每月 3 次筛查，并送 1 次深度核查…单个申请人 $14.99 一次性，由房东支付（安省 RTA s.134…）」 | `AKMT/pricing.html` + 抽取输出 | 通过 | 注：经纪 $29 / $59 已不在页面上（与 CLAUDE.md「经纪 $29 / $59 标尚未开售」的写法不同——页面现在只写免费档 +「即将推出、尚未开售」，更保守，不算缺陷） |
| K-11 | tenant-test JWT：checkout → **403 `landlord_required`**、unlock → 403 `landlord_required`、portal → 400；admin-test JWT（无房东帽子）同样 403 / 403 / 400；之后 SQL `landlords` 中 tenant-test 与 admin-test 行数 0，`agent_audit_events` 无新 `hat_activated` | `jwtprobe.out` tenant / admin 段；SQL | 通过（**T6-D1 / D-A7 / D-K3 已修**） | |
| K-12 | 签名末字符翻转的 JWT → 401；anon key 作 Bearer → 401 | 终端输出 | 通过 | |
| K-13 | `/pricing` 375 `scrollWidth - clientWidth = 0`；`/settings` 375（房东）0 | `AKMT/K-pricing-375.png` `K02-settings-375.png` | 通过 | |

**汇总**：13 条用例，执行 13，通过 13，失败 0，未执行 0。上轮 D-K1 / D-K2 / D-K3 全部关闭。

## 缺陷

无。

## 数据副作用

- Stripe live：landlord-test 两个未完成的 Checkout 会话（CA$19 订阅 ×1、$14.99 预付解锁 ×1），均未打开、无扣款，24 小时自动过期。
- 数据库：无写入（全部只读查询与 400 / 401 / 403 响应）。
