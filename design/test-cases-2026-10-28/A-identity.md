# A · 身份与账号（R1）· 2026-10-28

测试员：① 身份组（A · K · M · T6）。基线 `design/test-cases-2026-10-17/A-identity.md`；本轮加 10-23「页头『租客筛查』登录后点击先闪一下」与 CLAUDE.md「关键不变量 · 帽子与活动帽子分开」「测试与账号」。
环境：生产 ship98 `92a5f8c0`；playwright 无头 Chrome（`channel: 'chrome'`），每个账号一个 `userDataDir`（`profile-anon / profile-tenant / profile-landlord / profile-admin`）；登录只用 `mint.sh` 魔法链接；**不输密码、不建账号、不点退出**。
预算：`/api/auth/email-status` 6 次 —— 实际 6 次（界面 2 + curl 4，含一次格式错误的 400）。
脚本与截图：`/private/tmp/claude-502/-Users-neos-Documents-Claude-Projects-stayloop/774bb32e-4eb9-4cc0-8534-64d0bb942907/scratchpad/sitetest1028/AKMT/`（下文简写 `AKMT/`）：`anon.mjs → anon.json`、`login.mjs`、`tenant.mjs → tenant.json`、`landlord.mjs → landlord.json`、`admin.mjs → admin.json`、`a03.out`。

## 用例

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| A-01 | R1 | 匿名 | `POST /api/auth/email-status` landlord-test | 200 `{exists:true,password:true,google:false}` + `no-store` | `emailStatus20260929` |
| A-02 | R1 | 匿名 | 同上，随机不存在邮箱 | `{exists:false,password:false,google:false}` | 同上 |
| A-03 | R1 | 匿名 | 同上，只绑 Google 的真实账号（SQL 只读找，邮箱不进文件） | `{exists:true,password:false,google:true}` | 同上 |
| A-05 | R1 | 匿名 | `not-an-email`；`GET` | 400 `invalid_email`；GET 405 | 路由审计 |
| A-06 | R1 | 匿名 | `/login` 输入 landlord-test →「继续」（界面，计 1 次） | 密码步：邮箱 +「更改」、密码框、「忘记密码？」；无「第一次来？创建账户」 | `homeCentered20260929` |
| A-07 | R1 | 匿名 | `/login` `/register` 结构（不提交） | 共用 LoginCard：标题、邮箱先行、Google、「先不登录，看看预览 →」；无「邮箱链接 / 一次性 / magic」 | `authPages` `loginMethods` |
| A-08 | R1 | 匿名 | `/register` 用新邮箱进创建步（计 1 次，不提交） | 姓名、密码 ×2、条款勾选、「创建账户」；仓库 `signInWithOtp` 为零 | `loginMethods` |
| A-09 | R1 | 匿名 | 密码步「忘记密码？」存在（**不点发信**） | 按钮存在；代码走 `resetPasswordForEmail` | — |
| A-10/11 | R1 | 五个 *-test 号 | 魔法链接登录后任意页 | 五个号 `terms_version` 都已是 `2026-10-16` = `TERMS_VERSION` → 条款弹层 **不出现**；密码戳都 < 90 天 → 密码弹层不出现 | `trrebReady20261010` |
| A-13 | R1 | 魔法链接 | tenant / landlord / admin-test 的落点 | 按 `redirect_to` 落 `/auth/callback` 再分流；兜底落 `/` 时由首页按帽子分流 | `landingAfterSignIn` |
| A-14 | R1 | tenant-test | 打开 `/landlord/agent` `/dashboard` `/landlord/leases` | 每条一次 `replace` 到 `/landlord/become?next=…`；无 `claim_landlord` 调用、无循环；页头保持「我是租客」；SQL `landlords` 无 tenant-test 行 | `siteTest20261002_g*` `siteTest20261018_s0s1` |
| A-15 | R1 | 匿名 | `/agent/verify` `/provider/onboard` `/landlord/become` 的门 | 都显示「请先登录」+ 登录链接（复测 D-A5） | — |
| A-16 | R1 | tenant / landlord | 页头「我是…」颜色 | 租客 `rgb(124,58,237)`、房东 `rgb(4,120,87)`，字重 600 | `headerIdentityColor20260929` |
| A-17 | R1 | landlord-test | 页头 / 页脚 logo；登录后打开 `/` | href `/`；营销页 +「你已登录 · 回到我的 AI 助理 →」 | `logoHome20260927` |
| A-19 | R1 | 匿名 / tenant | `/onboarding/name` ①匿名 ②`?role=agent` 匿名 ③登录无意图 | ①②先登录（②带「身份：经纪」）；③选身份四卡 | `onboardingSignIn` `onboardingRole` |
| A-20 | R1 | tenant-test（无帽子、未起名） | 登录后打开 `/` | 被送到 `/onboarding/name` 选身份页 | `homeV10` |
| A-21 | R1 | tenant / landlord | 「我是」菜单 | 列 租客 / 房东 / 经纪 / 服务商，持有行标「当前」、未持有标「开通」 | `museMobile` |
| A-22 | R1 | tenant / landlord / 匿名 | 页头「租客筛查」链接（10-23 修复） | 匿名与租客 → `/screening`；房东 → `/screening/app`，点击直达、中间不渲染 `/screening` 落地页 | `screeningNav20261023` |
| A-23 | R2 | 代码 | 复测 D-A3 / D-A4 / D-A6 / D-A8 | 文案不再提「数据提供方」；退出清 `sl-thread-current-*` 与 `sessionStorage sl-onboarding-role`；确认邮件每版一次有唯一约束 | — |
| A-24 | R1 | 五个 *-test 号 SQL 只读 | 元数据：`terms_version`、`password_changed_at`、`test_account`、帽子 | 都 `test_account=true`、条款 2026-10-16、密码戳 10-11 之后；tenant-test / admin-test / agent-test / provider-test 无 `landlords` 行，landlord-test 一行 | — |

## 执行记录（2026-10-28 14:25–14:55 ET · 生产）

| ID | 实际 | 证据 | 结果 | 缺陷 |
|---|---|---|---|---|
| A-01 | 200 `{exists:true,password:true,google:false}`，`cache-control: no-store` | 终端输出（jwtprobe 之后的 curl） | 通过 | |
| A-02 | `qa-none-…@stayloop.ai` → `{exists:false,password:false,google:false}` 200 | 同上 | 通过 | |
| A-03 | 库里的一个只绑 Google 账号 → `{exists:true,password:false,google:true}` 200 | `AKMT/a03.out` | 通过 | |
| A-05 | `not-an-email` → 400 `invalid_email`；GET → 405 | `AKMT/cors.out` 末尾 | 通过 | |
| A-06 | `/login` 第一步「登录或创建账户 · 继续 · 使用 Google 继续 · 注册免费 · 不要信用卡 · 租客永远免费」；输入 landlord-test →「继续」→ 第二步「landlord-test@stayloop.ai · 更改 / 密码框 / 继续 / 忘记密码？」，页面文本里没有「创建账户」；email-status 调 1 次 200 | `AKMT/A06-login-password-step.png`、`anon.json.login_step2` | 通过 | |
| A-07 | `/login` 标题「登录 Stayloop」、`/register`「创建你的 Stayloop 账户」，两页邮箱先行 + Google + 「先不登录，看看预览 →」+ 页头菜单；正则 `邮箱链接|登录链接|一次性|magic|OTP` 零命中；375 宽无横向溢出 | `AKMT/A07-login.png` `A07-register.png` `A07-login-375.png` | 通过 | |
| A-08 | `/register` 新邮箱 →「这个邮箱还没有注册 · 免费创建账户」：姓名框 1、密码框 2、条款勾选「我已阅读并同意 服务条款（含房源信息使用规则）和 隐私政策」、「创建账户」、「我们会发一封验证邮件」；`grep signInWithOtp app components lib` = 0 | `AKMT/A08-register-create.png` | 通过 | |
| A-09 | 密码步有「忘记密码？」；`lib/auth/useLoginForm.ts:179` `resetPasswordForEmail` 带 `redirectTo …/auth/reset-password`；未点击 | 代码 | 通过（只到发信前） | |
| A-10/11 | SQL：五个号 `terms_version=2026-10-16`（= `lib/legal/terms.ts TERMS_VERSION`）；登录后 `/`、`/settings`、`/tenant/agent`、`/dashboard`、`/admin` 上 `terms-consent-gate` 与 `password-age-gate` 都不存在 | `tenant.json` `landlord.json` `admin.json` 各 `gate` 字段 | 通过（本轮无新版本，弹层按设计不出现） | |
| A-13 | 三个号的魔法链接都落到 `https://www.stayloop.ai/#access_token…`（不是 `/auth/callback`）：tenant-test → 自动送 `/onboarding/name`；landlord-test 留在 `/`（营销页 +「回到我的 AI 助理」）；admin-test（无帽子）→ `/onboarding/name`。原因是 **`mint.sh` 把 `redirect_to` 放在 body 的 `options` 里，GoTrue 管理接口不认，回退到 Site URL**（Auth 配置 `uri_allow_list` 含 `https://www.stayloop.ai/**` 与两个 `/auth/callback`，allow-list 本身没问题）；CLAUDE.md 写的「`redirect_to` 必须放 URL 查询参数」才是对的 | `login.mjs` 输出 `nav:`；PAT 只读 GET `config/auth` | **部分执行**：`/auth/callback` 分流未测（测试工具问题，非产品缺陷）；兜底落 `/` 的分流正确 | 见「越界」 |
| A-14 | tenant-test 打开三条路径：各 1 次 `rpc/my_hats`，`/dashboard` 与 `/landlord/leases` 另有 3 次 `landlords?select=…` **读**（不是 `claim_landlord`），`/landlord/become` RSC 1–2 次，最终 `/landlord/become?next=…`，之后无新请求；页面「这里是房东工作台 … 你的账号目前是租客身份」+「开通房东身份（我有房出租）」；页头仍「我是租客」紫色；跑完后 SQL `landlords` 中 tenant-test 行数 **0** | `AKMT/A14-become-*.png`、`tenant.json.become_*`、SQL | 通过 | |
| A-15 | 匿名 `/agent/verify` →「提交你的 RECO 注册信息 · 请先登录，再提交 RECO 注册信息。登录」（表单不再渲染）；`/provider/onboard`「请先登录再入驻。登录」；`/landlord/become`「请先登录，再开通房东身份。登录」 | `AKMT/A15-agent-verify-anon.png`、`anon.json` | 通过（**D-A5 已修**） | |
| A-16 | 租客 `rgb(124, 58, 237)` / 600；房东 `rgb(4, 120, 87)` / 600；admin-test（无帽子）显示「我是租客」紫（按 `my_hats` 默认租客，设计如此） | `AKMT/A16-header-tenant.png`、各 json `header.who` | 通过 | |
| A-17 | 页头 logo `href="/"`、页脚 logo `href="/"`；landlord-test 打开 `/` 留在营销页，显示「你已登录 · 回到我的 AI 助理 →」 | `landlord.json.home / logoHref` | 通过 | |
| A-19 | ① 匿名「先登录，再设置你的 AI 助理 · 登录后选身份，再给 AI 助理起名」+ LoginCard + 预览链接；② `?role=agent`「身份：经纪 · 登录后接着给 AI 助理起名」；③ tenant-test → 「STEP 02 / 03 · 你现在主要是哪种身份？」四卡（租客 / 房东 / 经纪 / 服务商 试点），未点击 | `AKMT/A19-onboarding-anon.png` `A19-onboarding-tenant.png` | 通过 | |
| A-20 | tenant-test 打开 `/` → 自动到 `/onboarding/name` 选身份页 | `tenant.json.home` | 通过 | |
| A-21 | 租客菜单：租客「当前」/ 房东「开通」/ 经纪「开通 · 需 RECO 注册核验」/ 服务商「开通」；房东菜单：租客（持有，无标）/ 房东「当前」/ 经纪、服务商「开通」。注：`我是租客` 文字 span 是 `aria-hidden`，自动化要点其父按钮 | `AKMT/A21-identity-menu-tenant.png` `A21-identity-menu-landlord.png` | 通过 | |
| A-22 | 匿名与租客页头「租客筛查」→ `/screening`；房东 → `/screening/app`；点击后 `framenavigated` 第一条就是 `/screening/app`，MutationObserver 只捕捉到筛查工作台文案「上传文件 → AI 分析 → 风险报告」，没有落地页 | `landlord.json.screeningClick`、`AKMT/A-screening-click-landlord.png` | 通过（10-23 修复有效） | |
| A-23 | D-A3：`TermsConsentGate.tsx:88` 现为「关于房源信息的使用规则…不收取任何费用，也不建立任何代理关系」，`PasswordAgeGate.tsx` 已无「数据提供方」；D-A4 / D-A6：`lib/auth/clearLocalSession.ts` 清 `sl-thread-current-*` 与 `sessionStorage sl-onboarding-role`；D-A8：迁移 `20261018f_terms_confirm_once.sql` | 代码 | 通过（四条上轮 S3 已关） | |
| A-24 | SQL：五个号 `test_account=true`、`terms_version=2026-10-16`、`password_changed_at` 10-11 ～ 10-24；`landlords` 行：landlord-test 1（free · 试用至 2026-11-15 03:59:59Z · 1 额度 · 无 customer），其余 0；`admin_users`：admin-test `role=admin`；`assistant_profiles` 只有 agent-test 起名 Ember | SQL 只读 | 通过 | |

**汇总**：24 条用例，执行 24，通过 23，部分执行 1（A-13，测试工具 `mint.sh` 的 `redirect_to` 没生效），失败 0。未测：退出登录（纪律）、忘记密码发信（邮件预算）、A-04 双绑账号（预算用尽，上轮通过、逻辑未改）。

## 缺陷

本模块无新缺陷。上轮 D-A3 / D-A4 / D-A5 / D-A6 / D-A8 均已验证修复；D-A7（租客被 Stripe 路由自愈成房东）见 K / T6：两个路由现回 403 `landlord_required`。

## 越界发现

- **测试工具**：README 给的 `mint.sh` 用 `{"options":{"redirect_to":…}}`，GoTrue `/auth/v1/admin/generate_link` 只认顶层 `redirect_to`（或查询参数），所以所有魔法链接都落 Site URL `/`，`redirect_to=https://www.stayloop.ai/<path>` 写法不起作用；`redirect_to=https://evil.example/` 探针因此也只能看到回退值（上轮 T6-27 已通过，本轮未重验）。建议改成 `generate_link?redirect_to=<url>`（CLAUDE.md 已这样写）。
- `auth.users` 今天 18:26Z 多了一个 `mo***@stayloop-test.local` 账号（后台用户页标为「测试账号」）——不是本组建的，README 规定「不建账号」，请主线程确认来源并处理。
- admin-test 的 JWT 顶层 `role` 声明是 `landlord`（旧元数据），`my_hats` 为 `{admin:true, tenant:true, landlord:false}`；权限只看帽子（CLAUDE.md），无影响，仅记录。

## 数据副作用

- 魔法链接：tenant-test ×2（一条用于 evil-redirect 探针，**未打开**）、landlord-test ×2（一条用 curl 跟了一次 303，未在浏览器打开）、admin-test ×1；会话落在本组三个 `userDataDir`，未退出。
- `/api/auth/email-status` 6 次（本小时预算用尽）。
- `agent_audit_events` 新增若干 `*_session_started` / 页面打开事件；无新表行、无删除、无邮件、无付款。
