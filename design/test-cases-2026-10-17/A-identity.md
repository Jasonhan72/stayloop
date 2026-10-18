# A · 身份与账号（R1）· 2026-10-17

测试员：A+K 组。环境与纪律见 `README.md`；方法见策略 §5。需求来源：CLAUDE.md「一个账号三顶帽子」「首页居中 + Muse 式登录」「设置 AI 助理之前先登录」「页头「我是…」用身份色」「首次登录先选身份」「Logo 一律回首页」「TRREB / PropTx 接入前的十项整改」第 7 条、「PropTx Article 8 第二轮」、「全站测试与修复（2026-10-02）」身份守卫死循环。
预算：`/api/auth/email-status` 6 次。登录只用魔法链接（`redirect_to` 放查询参数）。不创建账号、不输密码（API 探针用密码授权换 JWT，密码不落文件）。

## 用例

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| A-01 | R1 | 匿名 | `POST /api/auth/email-status` 以 `landlord-test@stayloop.ai`（有密码、无 Google） | 200 `{exists:true,password:true,google:false}`；`Cache-Control: no-store`；`routeForEmail` → `password` 步、`known`、无「第一次来？」 | `emailStatus20260929` |
| A-02 | R1 | 匿名 | 同上，用一个不存在的随机邮箱 | 200 `{exists:false,password:false,google:false}` → 直接进「创建账户」步 | 同上 |
| A-03 | R1 | 匿名 | 同上，用一个只绑 Google 的真实账号（SQL 只读找一个，邮箱不写进文件） | `{exists:true,password:false,google:true}` → `nopassword` 步 +「使用 Google 继续」+「想用密码登录？发邮件」 | 同上 |
| A-04 | R1 | 匿名 | 同上，既有密码又绑 Google 的账号（若库里有） | `{exists:true,password:true,google:true}` → password 步 + 「改用 Google 登录」 | 同上 |
| A-05 | R1 | 匿名 | 格式错误的邮箱 `not-an-email`；`GET /api/auth/email-status` | 400 `invalid_email`；GET 405 | 路由审计 |
| A-06 | R1 | 匿名 | 首页登录块 UI：输入 landlord-test 邮箱 →「继续」（计 1 次预算） | 进入密码步：显示邮箱 +「更改」、密码框、「忘记密码？」；**不显示**「第一次来？创建账户」；Google 按钮在第一步存在 | `homeCentered20260929` |
| A-07 | R1 | 匿名 | `/login` 与 `/register` 页面结构（不提交） | 两页用同一 `SignInBlock`：标题「登录 Stayloop」/「创建你的 Stayloop 账户」、邮箱先行、Google 按钮、「先不登录，看看预览 →」；页头菜单保留；无「邮箱链接 / magic link」字样 | `authPages20260929` `loginMethods20260927` |
| A-08 | R1 | 匿名 | 创建账户步结构（用新邮箱进入，不提交）| 有姓名（必填）、密码两次、条款勾选（版本 2026-10-16）、「创建账户」按钮；`signInWithOtp` 全站为零 | `trrebReady` `loginMethods` |
| A-09 | R1 | 匿名 | 忘记密码：密码步点「忘记密码？」 | 只验证到发信前的界面（按钮存在、调用 `resetPasswordForEmail`）；**不点击发信**（邮件预算） | — |
| A-10 | R1 | 魔法链接登录 landlord-test | 首次登录后任意页 | 账号 `terms_version=2026-10-13` < 当前 2026-10-16 → 条款弹层出现（`terms-consent-gate`），列 8 条 + 第 7 节提示；`/terms` `/privacy` `/login` 不弹；勾选后「同意并继续」；「不同意 · 退出登录」存在 | `trrebReady20261010` |
| A-11 | R1 | A-10 同意后 | 再次打开任意页；SQL 只读看 `raw_user_meta_data` | 弹层不再出现；`terms_version=2026-10-16`、`terms_accepted_at` 更新；审计 `terms_accepted` 一行；确认邮件路由被调用（`terms_confirm_sent_version`） | 同上 |
| A-12 | R1 | SQL 只读 | 八个测试号的 `password_changed_at`、identities | 全部 <90 天 → `passwordExpired=false`，门不弹；逻辑：`usesPassword` 只看 `email` identity；无戳不弹（同意条款时起算） | `trrebReady` |
| A-13 | R1 | 魔法链接 | 四个 *-test 号 + muse-provider 登录落点（`next` 不传，链接 `redirect_to=/auth/callback`） | tenant → `/tenant/agent`；landlord → `/landlord/agent`；agent（经纪 + 服务商）→ `/agent/agent`；provider-test（纯服务商）→ `/provider/jobs`；muse-provider → `/provider/jobs` | `landlordHat` `landingAfterSignIn` |
| A-14 | R1 | 登录 tenant-test | 打开 `/landlord/agent`、`/dashboard`、`/landlord/leases` | 每个路径只 `replace` 一次到 `/landlord/become?next=…`；数网络请求：`/landlord/become` ≤ 2 次、无循环；页面显示「这里是房东工作台」+ 开通说明；经纪号看到额外一条经纪说明 | `siteTest20261002_g*` |
| A-15 | R1 | 匿名 / 登录 | `/agent/verify`、`/provider/onboard` 的门 | 匿名：provider/onboard 显示「请先登录再入驻」+ 登录链接；agent/verify 匿名时表单按钮禁用；登录后显示对应表单与说明 | — |
| A-16 | R1 | 登录各号 | 页头「我是…」文字与颜色 | 租客紫 #7C3AED、房东绿 #047857、经纪蓝 #2563EB、服务商橙 #C2410C；hats 加载期间灰「我是…」；下拉列出持有 / 开通行；「当前」芯片同色 | `headerIdentityColor20260929` |
| A-17 | R1 | 登录 landlord-test | 点 logo（页头与页脚） | href `/`，落到首页营销页（不跳助理页）；首页登录块换成「回到我的 AI 助理 →」 | `logoHome20260927` |
| A-18 | R1 | 登录 landlord-test | 退出登录 | `localStorage` 中 `sl-active-role*`、`sl-ai-name*`、`sl-avatar*`、`sl-profile-photo*`、`sb-auth-auth-token` 被清；硬跳转 `/` | `useAuth` |
| A-19 | R1 | 匿名 / 登录 | `/onboarding/name` 四种状态 | ① 匿名 → 「先登录，再设置你的 AI 助理」+ LoginCard + 「先不登录，看看预览」；② `?role=agent` 匿名同样先登录；③ 登录且无身份意图 → 选身份页（四卡）；④ 已起名的账号（agent-test Ember）→ 跳过整页到其落点 | `onboardingSignIn20260929` `onboardingRole20260927` |
| A-20 | R1 | SQL 只读 + 纯函数 | `landingForAccount` 兜底：对八个测试号按 `assistant_profiles.name` 与帽子推导 | 只有 agent-test 起了名；其余无名字但都持有非租客帽子或（tenant-test / muse-tenant）无帽子 → tenant-test / muse-tenant 到 `/` 会被送 `/onboarding/name`（需实测确认）；其余按 `homeForHats` | `homeV10` |
| A-21 | R1 | 登录 landlord-test | 身份菜单「切换身份 · N 个 ›」折叠 | 默认收起，点开列 租客 / 房东（当前）/ 经纪 开通 / 服务商 开通 | `museMobile` |

## 执行记录（2026-10-17 23:20–00:10 ET · 生产 · 无头 Chrome 155 + CDP，脚本与截图在 `/private/tmp/claude-502/-Users-neos-Documents-Claude-Projects-stayloop/3a39710b-0617-45cd-a7d5-4e60af0e5289/scratchpad/sitetest1017/A/`）

| ID | 实际 | 证据 | 结果 | 缺陷 |
|---|---|---|---|---|
| A-01 | `POST /api/auth/email-status` landlord-test → 200 `{exists:true,password:true,google:false}`，`cache-control: no-store` | curl 输出（A/… 终端记录） | 通过 | |
| A-02 | 随机邮箱 → `{exists:false,password:false,google:false}` | 同上 | 通过 | |
| A-03 | 一个只绑 Google 的真实账号 → `{exists:true,password:false,google:true}`（SQL 只读确认库里 2 个 google-only 账号） | 同上 | 通过 | |
| A-04 | 既有密码又绑 Google 的账号（库里 1 个）→ `{exists:true,password:true,google:true}` | 同上 | 通过 | |
| A-05 | `not-an-email` → 400；GET → 405 | 同上 | 通过 | |
| A-06 | `/login` 第一步「登录或创建账户 · 邮箱 · 继续 · 或 · 使用 Google 继续 · 注册免费…」；输入 landlord-test 邮箱 →「继续」→ 第二步显示「邮箱 · 更改 / 密码 / 继续 / 忘记密码？」，**无**「第一次来？创建账户」、无「改用 Google」（账号未绑 Google）；email-status 调 1 次 200 | `A06-home-password-step.png` | 通过 | 注：首页 `/` 已无登录块（10-01 起是 HeroComposer），登录块在 /login、/register、起名页 |
| A-07 | /login 标题「登录 Stayloop」、/register「创建你的 Stayloop 账户」，两页都是邮箱先行 + Google + 「先不登录，看看预览 →」+ 页头菜单；全文无「邮箱链接 / 登录链接 / 一次性 / magic」 | `A07-login-zh.png` `A07-register-zh.png` | 通过 | |
| A-08 | /register 输入新邮箱 → 直接进「这个邮箱还没有注册 · 免费创建账户」：姓名框（`signup-name`）、两个密码框、条款勾选（`signup-terms`）、「创建账户」、「我们会给你发验证邮件」；无「已有账户？」链接；`signInWithOtp` 在 app/components/lib 为零（守卫 `loginMethods20260927` 通过） | `A08-register-create-step.png` | 通过 | 勾选文字未显示版本号（版本写在元数据，设计如此） |
| A-09 | 密码步「忘记密码？」按钮存在；`useLoginForm.forgotPassword` → `resetPasswordForEmail`（代码核对）；未点击发信 | 代码 `lib/auth/useLoginForm.ts:169-178` | 通过（只到发信前） | |
| A-10 | landlord-test（元数据 `terms_version=2026-10-13`）魔法链接登录落 `/landlord/agent` 后弹层 `terms-consent-gate`：8 条规则、版本 2026-10-16、第 7 节 API 提示、「不同意 · 退出登录」、同意按钮勾选前禁用、`body.overflow=hidden`；`/terms` 上不弹；真实鼠标点击勾选 → 按钮可用 → 同意 → 弹层消失 | `A10-terms-gate.png` `A10-terms-gate-checked.png` | 通过 | 注：`element.click()` 合成点击不触发 React 勾选，必须用 CDP 鼠标事件（自动化注意，非缺陷） |
| A-11 | 同意后重开 `/settings` 不再弹；SQL：`terms_version=2026-10-16`、`terms_accepted_at=03:33:50Z`、`terms_confirm_sent_version=2026-10-16`、`password_changed_at` 保留原戳；审计 `terms_accepted` + `terms_confirmation_emailed`（email_id）；`/api/legal/terms-confirmation` 200 | SQL 只读 | 通过 | D-A8（历史：10-13 同版本两封） |
| A-12 | 八个测试号 `password_changed_at` 都在 2026-10-11 之后（<90 天），identities 全是 `email`；provider-test 无戳（同意条款时起算）；`passwordExpired` 逻辑由 vitest `trrebReady20261010` 覆盖；实测五个账号登录都无 `password-age-gate` | SQL + vitest 12 文件 98 条通过 | 通过 | D-A3（文案） |
| A-13 | 落点：tenant-test → `/tenant/agent`；landlord-test → `/landlord/agent`；agent-test → `/agent/agent`（第一次登录落到 `/tenant/agent`，因另一测试员刚用它开了租客会话，`agent_configs` 最近一行是 tenant——提示 = 最近使用的身份，按设计；清空后重登落 `/agent/agent`）；provider-test → `/provider/jobs`；muse-provider → `/provider/jobs` | sessions.mjs / agent2.mjs 输出 | 通过 | |
| A-14 | muse-tenant（无房东帽子）打开 `/landlord/agent` `/dashboard` `/landlord/leases`：各只有 1 次文档导航 + 1 次 `my_hats`，`/landlord/become` 相关请求 2–3 次（RSC 预取 + 页面），落到 `/landlord/become?next=…`，之后 5 秒内 0 新请求——**无死循环**；页面「这里是房东工作台 … 你的账号目前是租客身份」；agent-test 看到额外的经纪说明且 `/dashboard` 同样弹回；记住的身份被写回 `tenant` / `agent` | `A14-become-muse-tenant.png` | 通过 | **重跑（主线程删除 tenant-test 的误建房东行后，00:25 ET）**：tenant-test 三条路径同样各一次文档导航 + 1 次 `my_hats`、`/landlord/become` 2–3 次请求、之后 5 秒 0 新请求，落到 `/landlord/become?next=…`，页头保持「我是租客」紫色，记住的身份写回 `tenant`；身份下拉「租客 当前 / 房东 开通 / 经纪 开通 / 服务商 开通」。截图 `A14-become-tenant-test-rerun.png` |
| A-15 | 匿名 `/provider/onboard` →「请先登录再入驻 · 登录」；匿名 `/landlord/become` →「请先登录，再开通房东身份 · 登录」；匿名 `/agent/verify` → 渲染完整 RECO 表单，「提交核验」禁用，**没有任何登录提示** | `A15-agent-verify-anon-zh.png` | 部分通过 | D-A5 |
| A-16 | 页头「我是…」：租客 `rgb(124,58,237)`、房东 `rgb(4,120,87)`、经纪 `rgb(37,99,235)`、服务商 `rgb(194,65,12)`，字重 600；服务商在 `/settings` 与 `/` 上也是「我是服务商」；下拉列出 租客 / 房东（当前）/ 经纪 开通 / 服务商 开通，经纪号显示「服务商 · 工单」 | `A16-header-*.png` | 通过 | |
| A-17 | 页头与页脚 logo `href="/"`；登录态点 logo 落 `/` 营销页，页面显示「你已登录 · 回到我的 AI 助理 →」（服务商点它 → `/provider/jobs`） | landlord.mjs / sessions.mjs | 通过 | |
| A-18 | 退出前 localStorage 有 `sb-auth-auth-token` `sl-avatar` `sl-active-role:<uid>` `sl-thread-current-…`；退出后硬跳 `/`，页头回到「我是 · 产品…」，`sb-* / sl-avatar / sl-active-role*` 已清；**`sl-thread-current-<role>-<uid8>` 残留**（四个账号的键累积在同一浏览器） | landlord3.mjs / sessions.mjs | 部分通过 | D-A4 |
| A-19 | ① 匿名 `/onboarding/name`：「先登录，再设置你的 AI 助理」+ 登录块 + 「先不登录，看看预览」；② `?role=agent` 匿名同样先登录、不出选身份；③ tenant-test / muse-tenant 登录后无意图 → 选身份页四卡，点「房东」→ 起名步「当前身份：房东 · 换身份」，能力清单无「佣金拆分 / 8 Engine / 看房 Live」；④ agent-test（已起名 Ember）→ 直接跳到 `/agent/agent` | `A19-*.png` | 通过 | D-A6（sessionStorage 跨账号残留） |
| A-20 | muse-tenant（无帽子、未起名）登录后打开 `/` → 自动送到 `/onboarding/name` 选身份；**tenant-test 重跑（房东行删除后）同样被送到 `/onboarding/name` 选身份页**（此前因误建的房东行留在营销页，该结果已作废）；provider-test 打开 `/` 留在营销页并显示「回到我的 AI 助理」→ `/provider/jobs` | `A20-muse-tenant-home.png` `A20-tenant-test-home-rerun.png` | 通过 | |
| A-21 | 汉堡菜单：「当前：房东」芯片、「切换身份 · 2 个身份 ›」默认收起（`#sl-identity-list` 不在 DOM），点开列四行 | `A21-identity-menu.png` `A21-hamburger-open.png` | 通过 | |


## 缺陷

| 编号 | 严重度 / 优先级 | 一句话 | 复现要点 |
|---|---|---|---|
| D-A3 | S3 / P3 | 密码 90 天弹层与条款弹层文案仍说「按房源数据提供方的规则 / 房源信息的使用规则」——PropTx 已拒绝、站上没有任何数据提供方 | `components/legal/PasswordAgeGate.tsx` 文案；`TermsConsentGate` 标题。规则本身可留（通用使用规则），理由句要改 |
| D-A4 | S3 / P3 | 退出登录不清 `sl-thread-current-<role>-<uid8>`，同一浏览器换账号后键累积 | landlord-test 退出后 `localStorage` 仍有 `sl-thread-current-landlord-30d0c280`；四个账号后累积 3 把键。`useAuth.signOut` 只清 role / aiName / avatar / photo |
| D-A5 | S3 / P3 | 匿名打开 `/agent/verify` 看到完整 RECO 表单，按钮禁用但无「请先登录」提示（/provider/onboard、/landlord/become 都有） | 无痕访问 `https://www.stayloop.ai/agent/verify`，截图 `A15-agent-verify-anon-zh.png` |
| D-A6 | S3 / P3 | `sessionStorage sl-onboarding-role` 跨账号残留：上一个账号在选身份页点过「房东」后退出，下一个已起名的经纪账号打开 `/onboarding/name` 被送到 `/landlord/become?next=/landlord/agent` | 同一标签页：tenant 号 → /onboarding/name 点「房东」→ 退出 → agent-test 登录 → /onboarding/name。`useAuth.signOut` 不清 sessionStorage；`useOnboarded(role ?? rememberedRole ?? 'tenant')` 的 `home` 只按这个值取 |
| D-A7 | S2 / P1（越界，需复核） | tenant-test 在 2026-10-18 03:31:24Z 被 `claim_landlord` 自动开通房东身份（审计 `hat_activated {via:postgres, by_self:true}`，紧跟 03:31:23.9 的 `terms_accepted`，当时在租客助理页会话中），得到 30 天 Pro 试用 + 1 次解锁额度 | 不是本组操作。代码里 `claim_landlord` 只在 `/landlord/become`、起名页选房东、`listingPublish`、**`/api/stripe/checkout` 与 `/api/stripe/unlock` 的「自愈」**（无房东行时直接建行）被调用。最可能是其他测试员用租客 JWT 探测 checkout / unlock。建议：两个 Stripe 路由对无房东帽子的账号返回 403 `landlord_required` 而不是建行（与 09-24「页面加载永不 claim」一致）；并复核 Supabase API 日志 03:31:20–25Z 的调用方 |
| D-A8 | S3 / P3 | `/api/legal/terms-confirmation` 的「每版本只发一次」有并发竞态：landlord-test 在 2026-10-13 14:20:47 的 6 ms 内写了两条 `terms_confirmation_emailed`（两个 email_id） | SQL 只读 `agent_audit_events`；今天的 10-16 版只发了一封，竞态只在两个页面同时触发时出现 |


## 数据副作用

- 条款 2026-10-16 版由本组在生产上同意：landlord-test、muse-tenant、agent-test、provider-test、muse-provider（各一封确认邮件到测试号邮箱，共 5 封 = 本组邮件预算上限）。tenant-test 的同意由其他测试员完成。
- 审计表新增 `terms_accepted` / `terms_confirmation_emailed` 各 5 行；`*_session_started` 若干。
- `/api/auth/email-status` 调用 6 次（4 次 curl + 2 次界面）。
- 邮件预算用尽，**未**点「忘记密码」发信。
- 无新表行、无删除。tenant-test 的 landlords 行 `4161c2c8…`（03:31:24Z）不是本组产生（见 D-A7）；主线程已于 00:20 ET 左右用 service role 删除该行与对应审计行，本组随后用 tenant-test 重跑了 A-14 / A-16 / A-20 / A-21（结果见执行记录），03:31Z 之前的结果不受影响。重跑多消耗一条魔法链接，无其他副作用。

