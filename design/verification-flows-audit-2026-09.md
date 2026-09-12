# 非上传类核验链路审计（2026-09-12）

范围：申请人本人授权的三条直连核验——身份（Veriff）、银行流水（Flinks）、征信（Equifax /
mock）——以及它们共用的同意流、落库、进评分、进报告的全过程。**不含**上传文件的取证与评分
（那部分在 `lib/forensics/*`、`lib/screening/rubric.ts`，本次不动）。

结构：① 现在系统的流程（逐步、逐文件、逐状态）→ ② 生产实际处于什么状态 → ③ 同类产品的
流程 → ④ 缺口清单（按优先级）→ ⑤ 建议的实施顺序。本文只做整理与研究，**没有改代码**。

---

## ① 现在的流程

### 1. 参与者与数据

| 角色 | 入口 | 凭证 |
|---|---|---|
| 房东 | `/screening/app` 结果页的 `VerificationCard`（`app/screening/app/page.tsx` 约 4100 行处，内联组件） | Supabase 登录态；只读自己的 `verification_requests` 行（RLS `landlord_id = auth.uid()`） |
| 申请人 | 公开页 `/verify/<token>`（`app/verify/[token]/page.tsx`） | token 本身（32 字节随机、base64url、256 bit；`lib/verify/token.ts`）；页面只和 `/api/verify/<token>/*` 说话，永不直读表 |
| 服务端 | `app/api/verify/**`，全部 edge runtime | service role（`lib/verify/store.ts adminClient`）；表上**没有** insert/update/delete 策略，所有写入必经服务端 |
| 供应商 | Veriff（托管会话 + 决策 webhook）、Flinks Connect（iframe + 聚合 API）、Equifax（OAuth2 + 查询；mock fixture） | 各自 env key，缺 key = 该步「未开通」 |

**表**：`verification_requests`（迁移 `20260904_verification_requests.sql`）
`id · token(unique) · screening_id · landlord_id(authId) · landlord_name · tenant_name · tenant_email ·
status(pending|consented|complete|expired|declined) · consent jsonb · steps jsonb · expires_at(默认 now()+7d) · created_at · updated_at`

`steps` 形状（`lib/verify/types.ts`）：`{ id|bank|credit: { status, provider, session_id, result, sandbox, error, updated_at } }`，
step status ∈ `not_configured | pending | started | submitted | verified | failed | skipped`。

**快照**：每次 `writeStep` 之后都把 `ScreeningVerification` 写到 `screenings.verification`
（`snapshotToScreening`）；评分时再抄一份进 `ai_dimension_notes._v3.verification`。

### 2. 步骤 0 · 房东生成链接

`POST /api/verify/create`（`app/api/verify/create/route.ts`）

1. `Authorization: Bearer <supabase jwt>` → RLS client 读 `screenings`，读不到 = 404（归属由 RLS 保证）。
2. 付费门 `hasProAccess(rls, user.id, screeningId)`（`lib/billing/access.ts`）：
   `plan ∈ {pro, team}` → 通过；否则该 screening 已 `unlocked_at` → 通过；否则 RPC
   `consume_unlock_credit` 原子扣 1 个预付额度并盖 `unlocked_at` → 通过；都不满足 → 403 `code:'locked'`，
   前端弹 `UnlockModal`。
3. 复用规则：同一 screening 下**未过期且 status ≠ declined** 的最新一行直接复用（只更新
   tenant_email / tenant_name）；否则插新行（`landlord_name` 取 landlords.full_name →
   user_metadata.full_name → email）。
4. 可选邮件（`send_email:true` 且 tenant_email 合法）：`lib/email.ts` 走 Resend REST，中英双语，
   写明「7 天内有效、每项可跳过」。返回 `{ token, url, status, emailed, via }`。

前端卡片：三枚状态胶囊（身份/银行/征信 × 已核验/未通过/等待结果/进行中/未开通/未开始，
沙箱加「（沙箱）」）、原始 URL、复制、邮箱输入 + 邮件发送、**手动刷新**、有效期文案。
前端门 `canRun = effectivePro || unlockCredits > 0`（第 3466 行）。

### 3. 步骤 1 · 同意（consent）

页面首屏（`lib/verify/consent.ts`，`CONSENT_VERSION = 'v1-2026-09'`）按 PIPEDA「有意义的同意」
五段写：目的 / 收集什么 / 谁能看 / 保留多久 / 如何撤回；勾选确认 + **键入全名作签名**。

`POST /api/verify/<token>/consent`（`{ typed_name, version, accepted:true }`）：
token 格式不对 404 → 过期 410 → 未勾选或名字长度不在 [2,120] 400 → **版本不等于当前版本 409**
（改过文案必须重新同意）→ 写 `consent = { version, accepted_at, typed_name, ua(≤200) }`，
`status = 'consented'`。迁移注释里写的 `ip_hash` 从未被写入。

三个供应商路由（`/start` `/bank` `/credit`）都以 `row.consent` 为前置（403 `consent_required`）。

### 4. 步骤 2 · 身份（Veriff）

`POST /api/verify/<token>/start { step:'id' }` → `veriffCreateSession`
（`lib/verify/providers/veriff.ts`）：`POST https://stationapi.veriff.com/v1/sessions`，
`X-AUTH-CLIENT: VERIFF_API_KEY`，`vendorData = 我们的 token`，`callback = /verify/<token>?step=id&returned=1`，
person 姓名从 `tenant_name` 拆。写 `steps.id = { status:'started', session_id }`，页面整页跳转到
Veriff 托管 URL（不是 iframe）。

决策回来：`POST /api/verify/webhook/veriff`——读**原始 body**，用 `VERIFF_SECRET_KEY` 算
HMAC-SHA256 与 `X-HMAC-SIGNATURE` 常量时间比较；缺密钥或缺头 = 401（fail-closed）。
`veriffParseDecision` 只留 decision / 姓名 / 出生日期 / 证件类型与国家 / **证件号末四位** / reason。
决策 → step status：`approved → verified`；`declined | expired | abandoned → failed`；
`resubmission_requested | review → submitted`。

申请人返回页面后：`?returned=1` 触发每 4 秒 `reload()`，**最多 10 次（≈40 秒）**；webhook 比这慢
就停在旧状态，直到手动刷新。

### 5. 步骤 3 · 银行流水（Flinks）

`POST /start { step:'bank' }` →
1. `flinksGenerateAuthorizeToken()`：`POST /v3/{customerId}/BankingServices/GenerateAuthorizeToken`，
   头 `flinks-auth-key`（2024-10 起 Connect URL 必带此短效 token）。
2. `flinksConnectUrl`：`https://<instance>-iframe.private.fin.ag/v2/?authorizeToken=…&redirectUrl=/verify/<token>?step=bank&returned=1&daysOfTransactions=Days90&consentEnable=true&customerName=Stayloop&accountSelectorEnable=true&accountSelectorMultiple=true&language=en&theme=light`（沙箱实例再加 `demo=true`）。
3. 写 `steps.bank = { status:'started', sandbox }`，页面在 420px 宽的弹窗里嵌 iframe。

拿到 `loginId` 的两条路：iframe `postMessage` 的 `step === 'REDIRECT'`；或 OAuth 类银行跳回
`?returned=1&loginId=…`。两条都用 `bankHandled` ref 防重。

`POST /api/verify/<token>/bank { login_id }`：先写 `submitted` →
`Authorize { LoginId, MostRecentCached:true }`（20s）拿 `RequestId` →
`GetAccountsDetail { WithTransactions, WithBalance, DaysOfTransactions:'Days90', WithAccountIdentity }`（25s），
202 时轮询 `GetAccountsDetailAsync/{RequestId}` 最多 6 次 × 3s →
`flinksToBankResult` → `summarizeBank`（`lib/verify/income.ts`，纯函数，`tests/verifyIncome.spec.ts`）。

**只存确定性摘要**（`BankResult`）：机构名、每账户{title、`···· 末四位`、类别、类型、币种、持有人、
当前/可用余额、交易数、首末交易日}、持有人集合、90 天贷/借总额、循环入账列表、
`payroll_monthly_estimate`、NSF 次数、期末余额合计。**原始交易不落库**；Flinks `loginId`
留在 `session_id`。

循环入账规则：同一归一化对方（去 ≥3 位数字、去 e-transfer/deposit/payment 等噪音词、截 40 字）
≥2 笔、平均间隔 5–36 天、金额极差 ≤ 均值 75%；月折算 = 均值 × 30.4375 / 间隔。
「像工资」= 标签命中 payroll/salary/ADP/Ceridian/CRA/CPP/EI… **或** ≥3 笔且均额 ≥ $800。
NSF = `\bnsf\b|non-sufficient|returned item|insufficient funds|overdraft fee|\brtn\b`（词界，避免 traNSFer）。

### 6. 步骤 4 · 征信（Equifax / mock）

`POST /start { step:'credit' }` 只返回 `{ form:'credit', sandbox }`；页面弹表单：名、姓、出生日期、
街道、城市、省（默认 ON）、邮编。**不收 SIN**。弹窗文案写明「不会显示为一次信贷申请」。

`POST /api/verify/<token>/credit`：校验字段 → `submitted` → `pullCredit`：
- `CREDIT_PULL_PROVIDER=mock`：固定 fixture（684 分、4 条账户、1 条已付催收、2 次查询），`sandbox:true`；
- `=equifax` 且有 `EQUIFAX_CLIENT_ID/SECRET`：OAuth2 client-credentials → `POST /business/consumer-credit/v1/reports/credit-report`；
  `buildInquiry` / `mapReport` 是**临时映射**（注释明说等加拿大规格定稿），且 `customerConfiguration`
  用的是 `equifaxUSConsumerCreditReport` 这个美国配置块；
- 结果落成与上传报告**同形**的 `CreditReport`（bureau/score/report_date/tradelines/collections/
  bankruptcies/inquiries/total_debt/employment），`reference` 存局方参考号。

### 7. 状态机与完成判定

`writeStep`：合并该步 → `terminal = verified|failed|skipped|not_configured` →
`allDone = 每个「已开通」的步都 terminal` → `allDone && consent ? 'complete' : 原状态` → 快照到 screening。
**跳过没有入口**（`skipped` 从不被写）；`declined` 从不被写；`expired` 只在读取时算，库里永远
停在 pending/consented。

### 8. 进评分（`app/api/screen-score/route.ts`）

1. 读 `screenings.verification`；`sandbox:true` 或三步全空 → 视为不存在。
2. `buildVerifiedBlock` 把三步渲染成「APPLICANT-AUTHORISED VERIFICATION（third-party facts）」
   事实块进 prompt，附规则：银行持有人是申请人时银行收入**覆盖**工资单收入；Veriff approved 且姓名
   一致 = 已核验身份；declined = identity_mismatch 信号；未做的步不奖不罚。
3. **确定性覆盖**（1884–1910 行）：`bank.status === 'verified'` 且 `holder_names` 与申请人名
   `namesMatch`（宽松 token 包含）且有 `payroll_monthly_estimate` → 重写
   `cross_doc_verification.income_corroboration`：`估算 / 自报月收入` ≥0.75 corroborated、
   ≥0.5 partial、否则 uncorroborated（无自报收入 = corroborated）。uncorroborated 触发既有规则：
   `ability_to_pay ≤ 60`、`income_stability = action_pending`。持有人 ≠ 申请人则不动模型结论。
4. 征信：`credit.status === 'verified'` 且有 report → 替换模型对 PDF 的转录，只保留模型按事实写的
   `analysis_en/zh`，打 `source:'bureau_pull'`。
5. 规则层（`lib/screening/rubric.ts` 474–509）：`externalVerifications.identity/bank` 每项 +5；
   一项都没有 → `verification` 维度封顶 90（`no_external_verification`）。`references` 硬编码 false。
6. **没有任何自动重评分**：核验结果落库后要房东手动再跑一次筛查才影响分数；UI 无提示。

### 9. 进报告

报告页 `VerifiedFactsSection`（绿底「已核验事实 · 非模型推断」）放在跨文档核验之前：身份卡
（decision/姓名/DOB/证件类型·国家·末四位/reason）、银行卡（循环入账/月、期末余额、NSF 三格 +
机构·账户数·持有人 + 前 4 条循环入账）、征信卡（局方·分数·日期·参考号，指向下方信用节）。
沙箱打「沙箱数据 · 不计分」。打印版（`lib/generateReport.ts` 377 行）一行「外部核验 N/3 ·
身份 ✓/✗ · 银行 ✓/✗ · 推荐人 待致电」。申请人通知信 `/screening/[id]/notice` 在有快照时提及。

### 10. 通知、保留、审计

- 通知：全链路**唯一**的邮件是房东主动点「邮件发送」的邀请。任一步完成 / 失败 / 过期都不通知
  房东，也不给申请人发确认；房东卡片靠手动刷新。
- 保留：**没有清理 job、没有 TTL**。`expires_at` 只挡新操作；行与 PII（姓名、邮箱、签名、UA、
  Veriff 会话号、Flinks loginId、DOB、证件末四位、持有人、余额、完整 CreditReport）无限期保留，
  并在 `screenings.verification` 再存一份。撤回/删除 = 写信到 privacy@stayloop.ai，无端点。
- 审计：无审计事件；只有 `console.error`；token 刻意不进日志。
- 限流：五条公共 token 路由**没有**限流（站内 `bump_anon_rate_limit` 只用于 agent turn）。

---

## ② 生产实际状态（2026-09-12 核对）

| 项 | 状态 | 依据 |
|---|---|---|
| Veriff | **已配置**（`VERIFF_API_KEY` / `VERIFF_SECRET_KEY` 在 CF Pages） | `wrangler pages secret list` |
| Flinks | **未配置**（无任何 `FLINKS_*`）→ 银行步显示「未开通」 | 同上；`.env.local` 也没有 |
| Equifax / 征信 | **未配置**（无 `CREDIT_PULL_PROVIDER`、无 `EQUIFAX_*`）→ 征信步「未开通」；`mock` 只在 `.env.development.local` | 同上 |
| `verification_requests` | **0 行**——生产上从未有房东生成过链接 | SQL `select … group by status` 返回空 |
| Veriff 决策 webhook 是否在 Veriff 后台登记到 `/api/verify/webhook/veriff` | 未核实（不在代码里） | 需登录 Veriff Station 确认 |
| 测试 | `tests/verifyIncome.spec.ts`、`tests/verifyCredit.spec.ts`（纯函数 + fixture）；**没有**任何路由级 / 状态机级测试 | `ls tests` |

结论：链路在代码上是完整的三步，但**生产只开了身份一步**；一旦申请人做完 Veriff，请求就会因
「所有已开通的步都终结」而标 `complete`——房东看到「✓ 申请人已完成」，实际只核了身份。

---

## ③ 同类产品的流程（对照用）

只列与「申请人本人授权、非上传」相关的部分。来源见文末。

**SingleKey（加拿大，Equifax/TransUnion 双局）**
- 两条路：① Invite——房东输姓名 + 邮箱（可选手机号「提高报告准确率」），系统给申请人发邮件，
  申请人填申请表并在表内**给出信用/背景检查同意**；② Direct——房东已持有同意书时直接录入
  姓名/DOB/现住址（加拿大可选 SIN、驾照号），**5 分钟内出报告**。
- 房东本人也要做身份验证（自拍 + 政府证件）才能拉他人报告。
- Bank-Verified Income（$10 加购，Flinks）：按来源列收入、**12 个月**趋势、余额、置信度（此前
  会话已研究，本轮页面未再抓到细节，标记为二手）。
- 租客可付：报告费可转给申请人付。

**Rentify Bank Check（加拿大）**（本轮 fetch 因证书失败，沿用此前会话研究）
- 申请人直连银行；报告给房东看：余额、收入、雇主、**透支频率**、**租金/账单支付问题**、红旗列表。

**liv.rent（加拿大）**
- 注册即**手机号运营商核验**，邮箱确认链接。
- 政府证件 + 自拍比对，系统**自动比对证件姓名与资料姓名**；「所有证件图片在核验完成后立即从
  系统删除」；房东看得到 ID 徽章，看不到证件、自拍、完整 Equifax 报告。
- Trust Score：Equifax 近 4 年账户；房东替申请人生成前须先取得书面同意。
- 可选：收入文件、社媒资料核验。

**Certn（加拿大/国际）**
- 邮件**或短信**邀请；申请人在门户里同意条款、按每项检查分别给同意、填姓名手机；
  OneID 生物特征 + 11,000 种证件；开放银行收入核验「多数 5 分钟内完成」；
  **房东在申请人提交完、以及全部报告可读时各收到通知**。

**Plaid 系（美国：RentSpree/Finicity $10、TurboTenant、RentRedi $49.99）**（此前会话研究）
- Plaid Consumer Report：**24 个月**、收入流按来源、租金/BNPL 支付信号、NSF/透支；
  申请人付费为常态；报告在申请人完成后自动挂到房东侧并邮件通知。

---

## ④ 缺口清单

优先级：P0 = 上线前必须（否则第一个真实申请人就会卡住或产生错误结论）；P1 = 让它比
竞品更系统；P2 = 合规与运营完善。每条都写清「现状 → 竞品/应有 → 建议」。

### A. 流程与状态机（P0）

| # | 现状 | 建议 |
|---|---|---|
| A1 | `resubmission_requested`（Veriff 要求重传）落成 `submitted`，页面对 `submitted` 禁用按钮 → **申请人无法重新开始**，死锁 | 映射成独立状态或落 `failed` + reason，按钮显示「重新进行」 |
| A2 | `skipped` 有类型、有文案、无入口；请求只在每个已开通步 verified/failed 后才 `complete` | 加「跳过这一项」按钮 + `POST /skip`；同意书已承诺「可只做一部分」，现在兑现不了 |
| A3 | 过期：无 job；库里永远 pending/consented；房东卡片无「已过期」态；完成后**不能再生成新链接**（复用规则把 complete 行也复用） | `create` 加 `regenerate:true`；卡片显示过期/完成态并提供「重新邀请」；过期行由 pg_cron 每日标 `expired` |
| A4 | 只开 Veriff 时，做完身份即 `complete`，房东看到「✓ 申请人已完成」 | 「完成」改为「已开通的 N 项中完成 M 项」；报告与卡片按项显示，不用总完成态 |
| A5 | 房东侧**零通知**；申请人侧无提醒、无完成确认；返回 Veriff 后只轮询 40 秒 | 每步终结时给房东邮件（沿用 `notify-landlord`）+ 卡片 realtime 订阅；申请人完成后一封确认；Veriff 回来改为轮询到 webhook 落地或 5 分钟上限 |
| A6 | 前端门 `canRun = effectivePro || unlockCredits>0` 不认 `unlocked_at`；额度在 `hasProAccess` 里**先扣**，随后插行失败额度即丢 | 前端读 `unlocked_at`；创建改为「先插行、再扣额度、失败回滚」或把扣额度移到 RPC 内含插入 |
| A7 | 核验落库后**不自动重评分**，UI 不提示 | 步终结时若该 screening 已有分数 → 卡片显示「有新核验事实，重新评分」；或后台自动重跑 rubric 层（不重跑模型）以更新 external_verification 与收入覆盖 |
| A8 | Flinks 语言恒 `en`（`zh ? 'en' : 'en'`）；`bank.provider` 未开通时仍返回 `'flinks'` | 修正；zh 用户给 en，fr 用户给 fr |

### B. 银行流水深度（P1，这是与 SingleKey/Rentify/Plaid 差距最大的地方）

| # | 现状 | 竞品 | 建议 |
|---|---|---|---|
| B1 | 90 天 | SingleKey 12 个月趋势；Plaid 24 个月 | Connect 与 GetAccountsDetail 改 `Days365`；摘要按月聚合（12 行：入账/出账/期末余额/最低余额） |
| B2 | 收入只有「像工资的循环入账」一个数 | SingleKey「按来源列收入」；Plaid 收入流 | 来源分类：payroll / government（CRA、EI、CPP、OAS、CCB）/ e-Transfer 个人 / 投资 / 其他；每类月均 + 稳定性；工资来源名与申请雇主名做 `namesMatch`，命中 = 雇佣佐证（对应上传流水已有的 `employer_counterparty_on_statement`） |
| B3 | 借方只数 NSF 关键字 | Rentify「租金/账单支付问题、透支频率」；Plaid 租金信号 | 复用 `lib/forensics/landlord-reading.ts` 与 `payroll-deposits.ts` 已写好的规则（租金样支付、按揭/车贷/信用卡还款、payday、赌博、催收、汇款、大额进出）——它们现在只跑在 OCR 文本上，改成对 Flinks 结构化交易同样跑一遍；再加：负余额天数、透支/NSF **费用**金额、月末最低余额 |
| B4 | 无置信度 | SingleKey 置信度评分 | 给 `payroll_monthly_estimate` 附 confidence：来源标签命中 + 笔数 + 金额稳定性 + 覆盖月数 → high/medium/low；low 时评分层只取 partial |
| B5 | 联名 / 非本人账户只在「持有人 ≠ 申请人」时不覆盖 | — | 联名账户明示「联名 · 收入可能含他人」；持有人与 Veriff 姓名、征信输入姓名三方一致性检查 |
| B6 | `MostRecentCached:true` | — | 首次拉取用实时；仅重试时用缓存 |
| B7 | `WithAccountIdentity` 已请求但持有人地址/电话未用 | — | 账户身份里的地址与申请表现住址比对，作为居住佐证 |

### C. 身份（P1）

| # | 现状 | 竞品 | 建议 |
|---|---|---|---|
| C1 | Veriff 姓名/DOB 只进 prompt，**后端不与**申请人名、上传证件、征信输入比对；`declined` 无确定性后果 | liv.rent 自动比对证件名与资料名 | 后端：approved 且 `namesMatch` → `identityConsistent` 强化；名不符或 declined → 红旗 `identity_mismatch` + `verification ≤ 40`（与上传证件的 measured floor 对齐）；DOB 与征信输入不符 → 阻止征信拉取 |
| C2 | 无手机号核验 | liv.rent 运营商核验；SingleKey 可选手机号 | 邀请时收手机号，短信邀请 + OTP（Twilio/Resend SMS）；作为第四个轻量步 |
| C3 | Webhook 无重放窗口/去重；无会话过期处理（停在 started） | — | 记 `session_id + status` 去重；Veriff 会话 7 天未决 → 标 failed(expired) |
| C4 | 同意书未写明 Veriff 侧影像保留；我们不存影像但没说 | liv.rent 明说「核验后删除证件图片」 | 同意书 v2：写明 Stayloop 不存证件影像，Veriff 按其政策保留 N 天并给链接 |

### D. 征信（P1）

| # | 现状 | 建议 |
|---|---|---|
| D1 | `buildInquiry` 用美国配置块、映射临时 | 等 Equifax 加拿大规格；在此之前生产保持「未开通」，不要用 mock 之外的任何东西上线 |
| D2 | 表单姓名/DOB **不与** Veriff 结果或申请人名比对；可无限重复提交 | 有 Veriff approved 时表单预填且锁定姓名/DOB；无则要求与 `tenant_name` `namesMatch`；每请求最多 2 次拉取 |
| D3 | 沙箱标记按三步 **OR**，一个 mock 步让真实 Veriff 结果也被评分层丢弃 | 按步判断：每步各自 `sandbox`，评分层逐步过滤 |
| D4 | 无 KBA / 身份问答 | SingleKey、liv.rent 靠 Equifax 身份问题防冒用 | Veriff approved 可替代 KBA；无 Veriff 时要求先做身份步再开征信 |
| D5 | 只 Equifax | SingleKey 双局 | 二期 TransUnion 备选（上传报告已支持 TU 转录） |

### E. 安全、合规、保留（P0 的 E1；其余 P2）

| # | 现状 | 建议 |
|---|---|---|
| E1 | 五条公共 token 路由无限流；`/start` `/credit` 每次调用花钱；供应商错误串原样给申请人 | 复用 `bump_anon_rate_limit`（按 token + IP）；`/start` 每步每小时 ≤3；错误只给分类，不给 detail |
| E2 | 无保留期、无清理；PII 在两张表 | 迁移：`verification_requests` 完成/过期后 90 天由 pg_cron 清 `steps.*.result` 与 consent.ua，保留状态与版本；`screenings.verification` 随 screening 生命周期；同意书写明期限 |
| E3 | 撤回只能邮件 | `/verify/<token>/withdraw`：标 `declined`、清 result、快照置 `withdrawn:true`，报告显示「申请人已撤回」 |
| E4 | 无审计事件 | 同意 / 每步 start / 每步终结 / 撤回 写 `agent_audit_events`（已有表）或新 `verification_events` |
| E5 | `consent.ip_hash` 未写；UA 明文 | 写 `sha256(ip + salt)`；UA 只留浏览器族 |
| E6 | 同意书「谁能看到」只点名 Veriff、Flinks，征信供应商未点名 | v2 加 Equifax；版本号变更自动逼迫重新同意（机制已有） |

### F. 评分接入（P1）

| # | 现状 | 建议 |
|---|---|---|
| F1 | 外部核验 +5/项、无核验封顶 90（2026-09-12 已加） | 银行按 B4 置信度分档：high +8、medium +5、low +2 |
| F2 | 收入覆盖只比「银行工资 / 自报收入」 | 同时比「银行工资 / 工资单净额」（上传层已有 `deposits_match_paystub_net`）；两者矛盾时优先银行并写明 |
| F3 | `references` 硬编码 false | 推荐人自动化（发邮件/短信给前房东与雇主，结构化问卷）是竞品（SingleKey、Certn）都有而我们没有的一整块；作为第五步纳入同一链接 |

### G. 测试与运营（P0）

| # | 现状 | 建议 |
|---|---|---|
| G1 | 只有两个纯函数测试 | 状态机测试（`writeStep` 完成判定、A1–A4 各态）、路由测试（consent 版本、过期、限流）、Veriff webhook 签名与映射测试 |
| G2 | 生产 0 行，从未走通 | 用 Veriff test integration 做一次端到端演练（真实房东账号 → 链接 → 沙箱证件 → webhook → 报告），把结果截图进 handbook |
| G3 | Flinks / Equifax 未签约 | 申请 Flinks 实例（redirectUrl 白名单 www.stayloop.ai）与 Equifax 加拿大商业协议；在此之前营销页与筛查页文案保持「即将」 |

---

## ⑤ 建议顺序

1. **P0 一周内**：A1–A8、E1、G1、G2。都是纯代码与测试，不依赖供应商签约；做完后身份一步
   可以真正给房东用。
2. **P1 跟 Flinks 签约并行**：B1–B7（把上传流水已有的房东解读规则搬到结构化交易上是最大
   的杠杆——规则已经写好并有测试）、C1、C3、D2、D3、F1、F2。
3. **P1 后半**：C2 手机核验、F3 推荐人自动化——这两项是同一条「申请人本人链接」上再加两步。
4. **P2**：E2–E6 保留/撤回/审计/同意书 v2；D1、D4、D5 随 Equifax 协议推进。

---

## 来源

- SingleKey：How to Screen Tenants with SingleKey（Invite / Direct 两条路、5 分钟出报告、房东自证身份）——
  https://www.singlekey.com/en/tenant-report/how-to-screen-tenants-with-singlekey/ ；
  Credit Checks for Tenants（同意要求）—— https://www.singlekey.com/credit-check-for-tenants/ ；
  Bank-Verified Income（Flinks、12 个月、按来源、置信度）——此前会话研究，本轮页面未再取到细节。
- liv.rent：Your guide to liv.rent's verification process（运营商核验、证件与自拍、证件图片核验后删除）——
  https://liv.rent/blog/livrent/rental-verification-process/ ；Trust Score 说明（Equifax 4 年、书面同意、
  证件/自拍/完整报告对房东不可见）—— https://liv.rent/blog/livrent/trust-score-explained/
- Certn：Screen an applicant（邮件/短信邀请、逐项同意）—— https://help.certn.co/hc/en-us/articles/360052632154-Screen-an-applicant ；
  Income Verification（开放银行、5 分钟）—— https://certn.co/income-verification/ ；
  Identity Verification guide（OneID）—— https://portal.certn.co/hc/en-us/articles/38885600665875-Identity-Verification-guide-for-applicants
- Rentify Bank Check、Plaid Consumer Report、RentSpree/Finicity、RentRedi：此前会话（2026-09-12 上午）研究结论，
  本轮 rentify.com 抓取因证书错误未复核。
