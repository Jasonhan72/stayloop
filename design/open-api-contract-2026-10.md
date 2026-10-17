# 开放 API 第一档 · 三组共用契约（阶段 5 · 2026-10-16）

依据 `design/research/v1/open-api-2026-10.md`（D1 第一档清单、D2 形态、D4-6 条款要点）与讨论稿决定 5（第一档先免费换接入量）。**第一档 = 我们自己的确定性规则 / 日期算术 / 开放授权的租金基准，不含任何个人信息，无需密钥。**
第二档（OAuth 用户 token）与第三档（筛查）本阶段不做；`/v1/passport/verify`、`/v1/screen` 保持原样。

## 通用（G16 的 `lib/api/v1Core.ts` + `lib/api/v1Http.ts`，G17 / G18 只按此调用）
- `API_VERSION = '2026-10-16'`（日期版本；每个响应头 `x-api-version`）；`RULES_AS_OF = '2026-10-16'`（规则快照日，响应体 `as_of`）。
- 错误体统一 `{ error: string, message: string, retry_after?: number }`；429 带 `Retry-After` 头。错误码：`invalid_json` · `invalid_input`（message 写明哪个字段）· `unsupported_province` · `not_available` · `rate_limited` · `method_not_allowed`。
- CORS：第一档全部 `Access-Control-Allow-Origin: *`，`OPTIONS` 204。
- 限流（`lib/api/v1Limits.ts` 一张常量表，路由不再硬编码）：按 `X-Client-Id`（可选请求头，≤64 字符，调用方自报，不注册）或 IP 取键；默认每键每小时 300 次（`compliance` 沿用 120→改 300）、每端点全站每小时 5,000 次；都用 `lib/rateLimit.ts underHourlyLimit`，fail-open（成本类）。响应头 `X-RateLimit-Limit`。
- 每个响应体都带 `as_of` 与 `boundary`（固定句，中英各一：「只做确定性规则与日期算术，不是法律意见；不选表、不建议是否发出任何通知；不接受也不存储个人信息」）。租金基准另带 **必填** `attribution`。
- 省份参数 `province`：`ON`（走 `lib/ontario/rules.ts`）或 `lib/provinces/rules.ts` 的 12 个代码；缺省 `ON`；其余 400 `unsupported_province`。

## 核心函数（`lib/api/v1Core.ts`，纯函数或只读 DB；路由与 MCP 工具都只调它们）
```ts
coreRules({ province }) → { province, as_of, rules: RuleOut[] }
  RuleOut (ON) = { id, area, statute, title:{zh,en}, summary:{zh,en}, severity, since }
  RuleOut (外省) = { id: '<CODE>-<topic>', topic, statute(cite), source_url, title:{zh,en}, summary:{zh,en} }  // 由 ProvinceRules 的 Bi & Src 字段逐项展开（statute / tribunal / leaseForm / deposit / petDeposit / keyOrOtherDeposits / advanceRent / applicationFee / petBanAllowed / rentIncrease / humanRights / privacyLaw / leaseEnd / adverseDecision）
coreListingCompliance({ province, ...ListingInput }) → { province, passed, findings: FindingOut[] }
  FindingOut = { rule_id, severity, statute, message:{zh,en}, source_url? }   // ON 用 checkListingCompliance；外省用 lib/provinces 已有的 checkListingComplianceFor / moveInRules 能给出的押金 / 禁宠类判定（没有的就只回 passed:true + findings:[] 并在 notes 写明「该省只核押金类」）
coreLeaseTermsCheck({ province, ...LeaseTermsInput }) → 同上形状（外省：押金上限 / 钥匙押金 / 预收租金三类）
coreGuideline({ effective }) → { effective, year, pct, published, cap: RENT_GUIDELINE_CAP, n1_deadline, notice_days: 90 }   // 安省
coreN4EarliestTermination({ served, method }) → { served, method, deemed_served, earliest_termination, termination_days: 7, mail_days: 5 }
corePersistentLatePayment({ periods:[{due_date, paid_at}], as_of? }) → { late:[…], persistent, window, definition:{grace_days:7, count:3, window_months:6} }
coreRentBenchmark(sb, { province:'ON', area, bedrooms, type }) → { benchmark:{source,kind,area,period,avg,quality,label:{zh,en}}, alt?, asking?, attribution:{zh,en} }   // 用 lib/market/rentBenchmark.ts readRentBenchmark + benchmarkAttribution；非 ON → NotAvailable
```
每个 core 函数的入参校验抛 `ApiError(code, message, status)`（`lib/api/v1Http.ts` 里定义），路由把它转成统一错误体。

## 端点（全部 `app/api/v1/**`，edge；G16）
| 方法 路径 | 入参 | 调用 |
|---|---|---|
| `GET /api/v1/rules?province=` | query | coreRules |
| `POST /api/v1/listings/compliance` | JSON `{ province?, monthly_rent, deposit, key_deposit, pets_allowed, description, title, application_fee, schedule_b }` | coreListingCompliance（现有路由改造，保持向后兼容：无 province = ON，原字段原形状不变，只是 findings 多了 `rule_id` / `source_url`，原 `rule` 字段保留） |
| `POST /api/v1/lease/terms-check` | JSON `{ province?, rent_amount, deposit_amount, form_type, schedule_b, start_date, end_date }` | coreLeaseTermsCheck |
| `GET /api/v1/guideline?effective=YYYY-MM-DD` | query | coreGuideline |
| `GET /api/v1/n4/earliest-termination?served=YYYY-MM-DD&method=hand|mail|email` | query | coreN4EarliestTermination |
| `POST /api/v1/late-payment/persistent` | JSON `{ periods:[{due_date, paid_at}], as_of? }`（≤120 期） | corePersistentLatePayment |
| `GET /api/v1/rent-benchmark?province=ON&area=&bedrooms=&type=` | query（type ∈ apartment|condo|townhouse|house） | coreRentBenchmark（service role 只读 `rent_benchmarks`，anon 本来可读） |
| `GET /api/v1/openapi.json` | — | 返回 `lib/api/openapi.ts` 的 OpenAPI 3.1 文档对象（`info.version = API_VERSION`，servers `https://www.stayloop.ai/api/v1`，每个端点 中英 summary / description、示例、`x-boundary`） |

## MCP（G17）
- 端点 `POST https://www.stayloop.ai/api/mcp`（Streamable HTTP、无状态、只 JSON 响应不开 SSE；`GET` / `DELETE` → 405 `{error:'method_not_allowed'}`）。协议：JSON-RPC 2.0；`initialize`（返回 `protocolVersion` = 客户端请求的若在支持列表 `['2025-06-18','2025-03-26','2026-07-28']` 否则最新；`capabilities:{tools:{}}`；`serverInfo:{name:'stayloop', title:'Stayloop · Ontario & Canada rental rules', version: API_VERSION}`；`instructions` 写边界句）、`notifications/initialized`（202 空体）、`ping`、`tools/list`、`tools/call`；批量数组请求按序处理；未知方法 `-32601`；无效 JSON `-32700`。无鉴权（第一档）；Origin 头若存在且不是 `https://` 开头 → 403。限流同一张表（键 IP，600/h）。
- 工具（名称 / 对应 core 函数 / 注解一律 `readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:false`，每个有 `title`，`description` 含边界句与来源）：`list_rules` → coreRules；`check_listing_compliance` → coreListingCompliance；`check_lease_terms` → coreLeaseTermsCheck；`rent_increase_guideline` → coreGuideline；`n4_earliest_termination` → coreN4EarliestTermination；`persistent_late_payment` → corePersistentLatePayment；`rent_benchmark` → coreRentBenchmark。`inputSchema` 用 JSON Schema（draft 2020-12 风格、`additionalProperties:false`）；结果 `content:[{type:'text', text: JSON 字符串}]` + `structuredContent`（同一对象）；入参错误 → `isError:true` 的结果（不是协议错误）。
- `public/.well-known/mcp/server.json`（官方 Registry 草案形状：`name:'ai.stayloop/rules'`、`remotes:[{type:'streamable-http', url}]`）与 `design/mcp-directory-submission-2026-10.md`（Claude 目录表单各项、Cursor `mcp.json`、Claude Code `claude mcp add --transport http` 命令、测试步骤）。

## 文档与条款（G18）
- `/stayloop-api/docs` 从 `lib/api/openapi.ts` 渲染（端点、入参、响应、中英 curl 示例、MCP 一节含 Claude / Cursor / Claude Code 接法）；第二档、第三档段落保留现状措辞。
- `/stayloop-api` 营销页：第一档「七个端点 + 一个 MCP 端点，无需密钥」。
- `lib/legal/terms.ts` 加 `API_CLAUSES`（D4-6 七条：许可范围 / 署名 / 个人信息 / 禁止 / 筛查 / 可用性与版本 / 责任与停用），`/terms` 新一节「API 使用规则」，`TERMS_VERSION` → `'2026-10-16'`。
- 定价页：团队档功能清单下架（只保留卡片名 + 「联系我们」+ 一句「功能清单待定」）；经纪付费档数字保留、标「即将推出」不变；新增「API」列：第一档免费、机构档「联系我们」。
