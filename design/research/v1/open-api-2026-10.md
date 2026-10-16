# V1.0 调研线 D · 开放 API 与对其他 AI 的接口（2026-10-13）

> **法规核查后的修正（2026-10-13，详见 `legal-check-2026-10.md` 清单 14–16）**：护照端点的 CRA s.8(1)(b) 是对报告机构的限制条款，未注册实体不能拿它当授权依据——改为「按其标准处理」，同意的法律基础写 PIPEDA 4.3；D4 同意页补「每个范围的用途」「境外 / 留存 / 不可撤回的风险句」「拒绝不影响站内使用（4.3.3）」；N4 / N1 等日期算术端点的描述写明只做算术、不选表、不建议是否发出。

调研方案：`design/v1-research-plan-2026-10.md` 第 4 节。对标摘要在 `design/research/v1/api/`。MCP 原型在会话 scratchpad `research-d/mcp/`（不进仓库，见 D5）。
每条发现四个字段：**现状 · 证据 · 建议 · 门槛**。

两条硬约束贯穿全文：**没有 MLS 房源数据**（对外只能给我们自己的或开放授权的数据）；**消费者报告机构未注册**（按姓名查 LTB / 法院记录与筛查评分，注册前不对第三方开放；`CRA_MODE=tool` 已备好）。

生产实数（2026-10-13 只读查询）：`trust_api_keys` 1 把（active）；`/v1/listings/compliance` 自 2026-09-23 起共 14 条命中记录（`compliance_events.source='compliance_api'`，只记规则号不记文本）；经合作方密钥跑过的筛查 1 份；护照分享 token 2 枚、其中 1 枚勾了 API 范围且有效；`trust_api_*` 审计事件 2 条；`rent_benchmarks` 328 行（CMHC 51 个区域）；消息线程 13 / 消息 34；非测试在架房源 0 套。**结论：现有「Stayloop API」没有任何外部调用方，三个端点是在给自己人测试。**

---

## D1 · 可开放清单（三档）

### 第一档 · 可直接开放（我们自己的确定性数据 / 开放授权数据，不含个人信息）

**D1-1 安省租赁规则与合规检查**
- 现状：`lib/ontario/rules.ts` 是单一来源：30 条规则（listing / lease / screening / notice / agent / renewal / tenancy / maintenance 八个 area），每条带编号、法条、中英文、严重度；函数 `checkListingCompliance`（押金上限 s.106、钥匙押金 O. Reg. 516/06 s.17、禁宠 s.14、费用 s.134）、`checkLeaseTerms`（押金 / TRREB Form 400 / 禁宠 / 禁空调 s.36.1 / 费用 / 日期）、`guidelineFor`（年度指导比例表）、`n1DeadlineFor`、`n4EarliestTermination`、`persistentLatePayment`。全部纯函数、不调模型。
- 证据：`lib/ontario/rules.ts` 第 1–14 行注释「Every statutory line Stayloop enforces or explains lives here once」；`/api/v1/listings/compliance` 线上实测（2026-10-13，5 条命中，1.3 s，响应带 `boundary` 声明）。
- 建议：整个模块都能对外。除现有 `listings/compliance` 外，再开 `rules`（列全部规则，带 `as_of` 日期）、`lease/terms-check`（`checkLeaseTerms`）、`guideline?effective=YYYY-MM-DD`（指导比例 + N1 截止日）、`n4/earliest-termination`、`late-payment/persistent`（输入账期数组）。这些都是「法规算术」，不是法律意见，响应里保留现在的 `boundary` 句。
- 门槛：数据——无；法规——每年 6 月省里公布下一年指导比例时改表（`RENT_GUIDELINE`），Bill 60 这类修法要同步；工作量——每个端点半天（输入校验 + 限流 + 文档），因为函数已存在。

**D1-2 其他 12 省的租赁事实**
- 现状：`lib/provinces/rules.ts` 12 个省 / 地区（魁北克 20 条、其余各 14 条），每条带原文引语与官方 URL（文件里 74 个官方链接），经独立核查员逐条对照；`checkListingComplianceFor(code, input)`、`moveInRules`、`listingRulesNote`、`renewalTiming`（`lib/provinces/renewal.ts`）。
- 证据：`lib/provinces/rules.ts` 第 1451 行 `PROVINCE_RULES`；CLAUDE.md「外省房源用外省法规」一节（2026-10-02）。
- 建议：与 D1-1 合成一个 `province` 参数（`ON` 走 `rules.ts`，其余走 `provinces/rules.ts`），对外一个端点：`POST /v1/listings/compliance {province, ...}`。响应里每条 finding 附 `citation` 与 `source_url`，让调用方的 AI 能引用原文而不是转述我们。
- 门槛：数据——快照截至 2026-10-02，要写明 `as_of`；工作量——现有 `listings/compliance` 加一个参数，半天。

**D1-3 CMHC / 统计局租金基准**
- 现状：表 `rent_benchmarks`（anon 可读，RLS `rent_benchmarks_public_read`），`readRentBenchmark(minBeds, areaTerms, propertyType)` 返回最具体的 CMHC 区域均租 + 统计局季度挂牌序列；`benchmarkAttribution()` 生成许可要求的来源句。
- 证据：`lib/market/rentBenchmark.ts` 第 6–12 行写明两个许可（CMHC 数据使用许可要求注明「Source: Canada Mortgage and Housing Corporation (CMHC), Rental Market Survey, October 2025」；统计局表 46-10-0092-01 走 Open Government Licence – Canada）；迁移 `20261013_rent_benchmarks.sql` 第 24 行。
- 建议：开 `GET /v1/rent-benchmark?province=ON&area=...&bedrooms=1&type=apartment`，**响应结构里把 `attribution` 作为必填字段**（不是可选注释），并在条款里要求调用方展示它。CMHC 均租是在住单元的调查均值，文案字段只能叫 `survey_average`，不能叫成交价。
- 门槛：授权——两个许可都允许再分发，但要带来源句（已有函数）；数据——CMHC 每年一次（12 月发布）、统计局每月 15 日 workflow 刷新；工作量——半天。

**D1-4 我们自己的房源（公开读）**
- 现状：`GET /api/listings/search`（每次 ≤100 行、匿名每 IP 240 次 / 小时、只给卡片字段）、`GET /api/listings/[slug]`（可见性 + `display_address` 隐藏 + 私有列剥离），anon 对 `listings` 表的 SELECT 已撤销。**在架非测试房源 0 套**，5 套在架的都标 `is_test`。
- 证据：`app/api/listings/search/route.ts` 第 1–7 行注释；生产查询 `live_real_listings=0`。
- 建议：这两个路由本来就是公开 API，只缺文档与一个稳定的 `/v1/listings` 别名。**现阶段对外开放没有意义——库里没有真实房源**。先把形态定好（搜索 + 详情 + 带 `updated_at` 的增量导出 feed，对标 Rentsync 的「生产方出 feed、渠道方拉」模型），等有真实房东房源再发布。响应里必须带 `is_test` 与 `source`，并且永远不出现 Realtor.ca 导入行（已归档）。
- 门槛：数据——0 套；条款——房源信息使用规则 9 条已在 `/terms` 第 5 节（`lib/legal/terms.ts`，2026-10-13 版）；工作量——文档 + 别名 1 天，feed 导出 2 天。

**D1-5 房源发布（写）**
- 现状：`lib/listingPublish.ts publishListing / buildListingRow / updateListing`，发布前经 `checkListingComplianceFor` + 无照片拒绝 + 重复地址检查 + TRESA s.32 披露（安省且有经纪档案），落库后 `pending`，管理员核验后公开。只有浏览器端（RLS 客户端）在调用，没有服务端 API。
- 证据：`lib/listingPublish.ts` 第 438 行 `publishListing`；CLAUDE.md「没有照片的房源不上线」「Listing Visibility」。
- 建议：归**第二档**（要房东本人授权）：`POST /v1/listings` 只能以房东的 OAuth token 调用，服务端复用同一套 `buildListingRow + publishListing`（触发器 `guard_listing_trust_fields` 本来就把 `verification_status / source` 锁死，第三方写不出「已核验」）。这是对外最有价值的写接口：别的 AI 替房东起草房源，发到 Stayloop 来核验上架。
- 门槛：鉴权——需要 OAuth（见 D2）；工作量——1.5 天（路由 + 照片上传（data URL 或 URL 抓取）+ 文档）。

### 第二档 · 需用户本人授权（含个人信息；PIPEDA 下要明确同意）

**D1-6 护照核验结论（已有）**
- 现状：`POST /v1/passport/verify`：合作方密钥 + 申请人自己生成的 token（`passport_share_tokens.api_scopes` 勾选 identity / bank / credit / tenancy 四个范围），只回结论（verified / score_band / 按时付租计数），不回文件；每次调用审计 + 推送通知申请人；响应带 CRA s.8(1)(b)「消费者本人书面指示下的披露」边界句。
- 证据：`app/api/v1/passport/verify/route.ts` 第 1–12 行注释与 `BOUNDARY`；生产 `share_tokens_api_live=1`、`trust_api_audit=2`。
- 建议：保留，形态对（申请人主动出示 + 范围自选 + 可撤销 + 被查即通知）。两处要补：① 同意记录要写明「谁」会看——现在 token 的 API 范围勾选只说「API 可读」，没有合作方名单；PIPEDA 同意指南要求对第三方披露「尽可能具体地说明接收方」。改法：申请人生成 token 时看到并同意「持有 Stayloop API 密钥的合作方」这一类别，调用时审计记录合作方名字（已有）并在护照页展示「谁在什么时候查过」。② `credit` 范围在 CRA 注册前**只能回申请人自己上传 / 自己授权拉取的报告的结论**，现有实现就是这样（读 `verification_requests.steps`），注册前不要扩成局方直拉。
- 门槛：法规——同意记录（改一处文案 + 一张「谁查过」列表，半天）；CRA——credit 范围维持现状；数据——沙箱结果已排除。

**D1-7 租客自己的申请、租约、在管租约、租金记录**
- 现状：全部在 RLS 后面，只有本人（按 authId 或 JWT 邮箱）能读：`applicant_applications` 视图（无分数）、`lease_documents`（`leases_tenant_email_read`）、`lifecycle_facts_tenant()`（SECURITY INVOKER）。没有任何对外接口。
- 证据：CLAUDE.md「节点 1 可信」「申请人追踪条」；视图 `applicant_applications` 2026-09-25 撤销全部写权限。
- 建议：归第二档，形态是 **OAuth 用户 token 直接复用 RLS**（Supabase 的 OAuth 2.1 服务器签发的就是带 `user_id / role` 的标准 JWT，见 D2-2）——MCP 工具 `my_applications` / `my_lease` / `my_rent_ledger` 只是用调用者 token 调 `lifecycle_facts_tenant()`。**租客永远拿不到分数**，视图已保证。
- 门槛：鉴权——OAuth；工作量——每个工具 0.5 天；法规——这是用户取回自己的数据，PIPEDA 没有额外同意要求，但 AI 客户端（Claude / ChatGPT）会把结果送进模型，同意屏要写明「你授权的 AI 应用会收到这些内容」。

**D1-8 租约 / 通知草稿生成**
- 现状：安省标准租约结构 `lib/lease/ontario.ts OntarioLeaseTerms`（§1–§17 字段）+ `checkAdditionalTerms`；续约三阶 `lib/agent/renewalStages.ts buildRenewalProposal`（A/B 方案、指导比例按生效年、N1 截止日、外省走 `buildProvinceNoticeProposal`）；决定通知页脚 `decisionNoticeFooter`（s.10(7) + OHRC 声明）与外省版 `decisionNoticeFooterFor`。这些都读租约行与 household，不是自由输入的纯函数。
- 证据：`lib/agent/renewalStages.ts` 第 219 行 `buildRenewalProposal(userId, l, today, market)`；`lib/ontario/rules.ts` 第 415 行。
- 建议：**拆两层**。纯算术层（指导比例、N1 / N4 日期、续约 A/B 金额、决定通知法定页脚文本）归**第一档**（D1-1 的端点）；**生成针对某份租约的草稿**（含租客姓名、地址、金额）归第二档，只能以房东 OAuth token 调用，而且**只生成草稿、不发送**——发送仍走站内待批卡（「它提议，你决定」是产品原则）。外省租约不出安省续约函（现有 `province_unsupported` 逻辑照搬）。
- 门槛：工作量——算术层 0.5 天；草稿层 1.5 天（要把 `buildRenewalProposal` 从 proactive 扫描里抽出来接受显式 lease id）；法规——决定通知页脚按省份。

**D1-9 消息线程**
- 现状：`threads / thread_messages` 只追加 + 哈希链，`thread_party()` 定当事人，导出 `POST /api/threads/export`（HTML / JSON 带链校验）；写入只有 RLS 客户端与 service role。
- 证据：CLAUDE.md「消息与沟通系统 A 期」；迁移 `20260929_messaging_a.sql`。
- 建议：第二档，**只读优先**：`my_threads` / `thread_messages(thread_id)` 以用户 token 调用，RLS 已保证只看自己参与的；**写入（替用户发消息）暂不开放**——消息是证据，`sender_kind` 由触发器定、`acting_role` 是帽子快照，让第三方 AI 代写会模糊「谁说的」。若要开，先在 `thread_messages` 加 `via_client`（记录是哪个 OAuth client 发的）并在气泡上标注。
- 门槛：工作量——只读工具 0.5 天；写入要改链规范以外的列（可加列，不动 v1 规范化格式）1 天 + 产品决定。

**D1-10 房东自己的筛查报告（读）**
- 现状：`screenings` 行归房东（RLS），报告页 / PDF 只有房东能开；`/v1/screen` 的 webhook 回传 `overall / tier / hard_gates / report_url`。
- 建议：第二档，房东 OAuth token 读自己的报告摘要（`ai_score / v3_tier / ai_summary_zh|en / hard_gates_triggered`）——这不是「向第三方提供报告」，是房东自己取回。**但注意**：房东把它交给 ChatGPT 之类的 AI 就是把申请人个人信息送到了美国服务商——我们的隐私页已披露 AI 服务商，接入方 AI 不在其中，同意屏要写明。
- 门槛：产品决定；工作量 0.5 天。

### 第三档 · CRA 注册前不开放

**D1-11 `/v1/screen`（合作方发起筛查）**
- 现状：已被 `personalRecordLookupsAllowed()` 闸住——`CRA_MODE=tool` 时直接 503 `cra_mode_tool`；默认（registered）模式下仍可用：密钥须绑房东账号、须带申请人同意记录（`v1-2026-09`）、文件从 https 抓、202 + webhook。
- 证据：`app/api/v1/screen/route.ts` 第 39–41 行；`lib/compliance/craMode.ts`。
- 建议：**在注册完成前，无论 CRA_MODE 是什么，这个端点都不该对外**——「向合作方提供关于申请人的报告」正是 CRA s.3 要注册的行为，比站内房东自用更明确。改法：端点改为检查一个独立的 `PARTNER_SCREENING_ENABLED` 开关（默认关），而不是复用 CRA_MODE；文档页标「注册后开放」。注册后开放也只对**房东身份**的接入方（密钥绑房东账号，现状已如此），并要求对方传申请人同意记录（现状已如此）。
- 门槛：法规——CRA 注册（`design/consumer-reporting-act-research-2026-10.md`：Reg. 177 s.6(b) 两年经验、固定营业场所、会计师财报）；工作量——加开关 0.5 天。

**D1-12 按姓名查 LTB 判令 / 法院记录**
- 现状：`search_ltb_orders()` RPC 只对 authenticated / service_role；法院门户 + CanLII 索引在 screen-score 内部。没有对外端点。
- 建议：注册前不开；注册后也**不做成「输入姓名回记录」的通用端点**（Openroom 注册后仍只做站内按结果数限流的搜索，不开 API）。若开，只作为筛查流程的一部分、带用途声明与申请人同意。
- 门槛：CRA 注册 + 律师意见。

**D1-13 筛查评分给第三方**
- 同 D1-11。另外模型的评分不是我们能对外承诺稳定的产品（同一原件三次重跑 55 / 66 / 35，CLAUDE.md 2026-09-22），对外 API 的调用方会把分数当事实。

### 三档清单总表

| 候选 | 数据来源 / 授权 | 含个人信息 | 第三方调用的同意 | 档 | 建议端点 / 工具 |
|---|---|---|---|---|---|
| 安省 30 条规则 + 合规检查 + 日期算术 | 我们自己的（法规转写） | 否 | 不需要 | 一 | `rules` · `listings/compliance` · `lease/terms-check` · `guideline` · `n4` · `late-payment` |
| 12 省租赁事实 + 合规检查 | 我们自己的（官方原文核过） | 否 | 不需要 | 一 | `listings/compliance?province=` · `rules?province=` |
| CMHC / 统计局租金基准 | 开放许可，须带来源句 | 否 | 不需要 | 一 | `rent-benchmark`（`attribution` 必填） |
| 房源公开读 / 增量 feed | 我们自己的（0 套真实） | 否（地址按 `display_address`） | 不需要；条款第 5 节 | 一（暂缓发布） | `listings` · `listings/{slug}` · `listings/feed` |
| 房源发布（写） | 房东授权 | 房东联系方式 | 房东 OAuth | 二 | `POST listings` |
| 护照核验结论 | 申请人授权 token | 是 | 已有（补「谁会看」） | 二 | `passport/verify`（已有） |
| 租客自己的申请 / 租约 / 账期 | 本人 | 是 | 本人 OAuth + 同意屏 | 二 | `my_applications` · `my_lease` · `my_rent_ledger` |
| 针对某份租约的续约 / 通知草稿 | 房东授权 | 是 | 房东 OAuth；只草稿不发送 | 二 | `draft_renewal` · `draft_decision_notice` |
| 消息线程只读 | 本人 | 是 | 本人 OAuth | 二 | `my_threads` · `thread_messages` |
| 房东自己的筛查摘要 | 本人 | 是（申请人） | 房东 OAuth + 同意屏 | 二（产品决定） | `my_screenings` |
| 合作方发起筛查 `/v1/screen` | — | 是 | — | 三 | 注册前关闭（独立开关） |
| 按姓名查 LTB / 法院 | — | 是 | — | 三 | 不做通用端点 |
| 评分给第三方 | — | 是 | — | 三 | 不做 |

---

## D2 · 接入形态对比

### D2-1 REST + OpenAPI 3.1

- 现状：三个端点是手写的 Next.js edge 路由，文档是一页 JSX（`app/stayloop-api/docs/page.tsx`，三段 curl）；没有 OpenAPI 文件、没有 SDK、没有沙箱；CORS 只在 `listings/compliance` 上开（`Access-Control-Allow-Origin: *`，线上实测）；鉴权是 `x-api-key` 头 + sha256 哈希比对（`trust_api_keys.api_key_hash`）；限流两套——匿名端点走 `underHourlyLimit`（`bump_anon_rate_limit`，每 IP 120 / 小时），密钥端点走 `bump_trust_api_rate`（每分钟桶，120 / 分钟与 20 / 分钟硬编码在路由里）。
- 证据：`app/api/v1/*/route.ts`；`lib/rateLimit.ts`；`supabase/migrations/20260618_trust_api_key_hashing.sql` 第 44–60 行。
- 建议：把 D1 第一档端点做成一份 `openapi.yaml`（3.1，放 `public/openapi.yaml`，文档页用它渲染），每个端点带中英文示例、`as_of` 版本头（学 TaxJar 的 `x-api-version: YYYY-MM-DD`）、统一错误体 `{error, message, retry_after?}`。限流数值搬到一处常量表而不是散在路由里。**REST 是 MCP 与 Webhook 的底座**，先把它做规范，MCP 服务器只是薄包装（D5 已证明：一个工具 = 一次 fetch）。
- 鉴权：第一档匿名 + 每 IP 限流；第二档 OAuth 2.1（用户 token）；合作方密钥只给机构（现有 `x-api-key`）。
- 审核 / 上架：无（我们自己的站）。托管：现有 Cloudflare Pages edge 路由，零新增。维护：每条规则改法时文档自动跟着（规则文本来自同一模块）。
- 边缘兼容：完全兼容（就是现状）。
- 门槛：工作量——OpenAPI 文件 + 文档页重写 2 天；第一档新端点共约 3 天。

### D2-2 MCP 服务器（远程，Streamable HTTP）

- 现状：MCP 规范当前版 2026-07-28；远程传输只剩 Streamable HTTP（单一端点、POST 发 JSON-RPC、可选 SSE；"The server MUST provide a single HTTP endpoint path"），SSE 传输已弃用；鉴权是 OAuth 2.1（"Implementations using an HTTP-based transport SHOULD conform to this specification"），MCP 服务器作资源服务器**必须**发布 RFC 9728 受保护资源元数据、401 带 `WWW-Authenticate: Bearer resource_metadata=…`，客户端注册优先 Client ID Metadata Documents（CIMD），DCR 降为「deprecated and retained for backwards compatibility」；无鉴权服务器也允许（"Authorization is OPTIONAL"）。stdio 传输**不用**OAuth（"retrieve credentials from the environment"）。
- 证据：https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization ；…/2025-06-18/basic/transports 。
- 三家客户端怎么接（官方文档，2026-10-13 读取）：
  - **Claude**：Free / Pro / Max / Team / Enterprise 都能加自定义连接器（"Free users are limited to one custom connector"），Team / Enterprise 要 Owner 加、成员各自连接；支持 `oauth_dcr`、`oauth_cimd`、`none`（默认支持），`static_headers`（API key 作请求头）是 beta 且限部分组织；Anthropic 出口 IP `160.79.104.0/21`；要求 401 带 `resource_metadata`、回调 `https://claude.ai/api/mcp/auth_callback`，Claude Code 另用 loopback 回调；OAuth 各端点 10 秒超时。上目录：claude.ai/directory/manage，任何付费计划可提交，要求每个工具有 `title` + `readOnlyHint|destructiveHint`、OAuth（若动用户账号）、隐私政策 URL、文档 URL、支持联系、审核测试账号，7 条政策勾选；自动扫描后默认以 Community 连接器上架，部分再人工审。
  - **ChatGPT**：自定义 MCP 连接器要「developer mode」，官方文章只列 Business / Enterprise / Edu（管理员在 Workspace 设置里开、每个管理员自己也要开；Plus / Pro 是否可用官方页面未写，第三方说法不一）；上目录走 ChatGPT / Codex 插件门户：开发者验证、公网 HTTPS、**只支持 无鉴权 / OAuth / 混合，不支持 API key 或 bearer**（"It doesn't support API-key or bearer-token flows"）、域名验证 `/.well-known/openai-apps-challenge`、五正三负测试用例 + 视频、隐私与条款 URL；上架后工具变更自动扫描。开发者准则：最小数据、禁收受管身份证号 / 支付卡 / 健康数据、只能卖实物且走外部结账、不得投广告。
  - **Cursor**：`.cursor/mcp.json` / `~/.cursor/mcp.json`，远程 `url` + `headers`（API key 可以），OAuth 用 `auth` 块（"Cursor uses fixed OAuth redirect URLs for MCP servers."），有 Marketplace 一键安装与团队白名单。
  - **Gemini**：消费者版 Gemini 应用没有第三方提交入口（只有 Google 自己策划的 Connected Apps）；Gemini CLI 扩展（`gemini extensions install <github url>`，`gemini-extension.json` 可打包 MCP 服务器）是开放的，但官方页面写 "Gemini CLI was replaced by Antigravity CLI on June 18th, 2026"（免费与 Google One 用户）。**结论：Gemini 这条线现阶段只有「远程 MCP 地址随便给开发者」这一种接法。**
  - **官方 MCP Registry**（预览）：`server.json` 的 `remotes[{type:'streamable-http', url}]`，域名命名空间 `ai.stayloop/*` 要 DNS TXT 或 `/.well-known/mcp-registry-auth` 证明；"A remote server MUST be publicly accessible at its specified URL."
- 鉴权怎么落地：**Supabase Auth 已经是 OAuth 2.1 授权服务器**（官方文档：authorization code + PKCE、可选 DCR、发现地址 `https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1`、签发的是带 `user_id / role / client_id` 的标准 Supabase JWT、"MCP authentication has no separate charge"，但**同意页要自己做**——须显示客户端名、范围、拒绝按钮、可撤销）。这意味着第二档工具的鉴权 = Supabase OAuth 发 token → MCP 路由用它建 RLS 客户端 → 所有现有策略原样生效。注意我们的 Auth 对外地址是 `auth.stayloop.ai`，发现文档的 issuer 要与之一致；Claude 只认 `authorization_servers` 的第一项。
- 托管：**用现有 Cloudflare Pages edge 路由即可**。`@modelcontextprotocol/sdk` 1.32.1 自带 `WebStandardStreamableHTTPServerTransport`（只用 Request / Response / ReadableStream），本机实测（D5）：无状态模式下每个请求新建 server + transport 走通 initialize / tools/list / tools/call，正是 edge 路由的形状；Cloudflare 自家 `agents` SDK 也把 `createMcpHandler`（无状态）定为新服务器推荐路径，`McpAgent`（Durable Objects）"deprecated and feature-frozen"。无状态意味着不支持服务器推送 / 可恢复流，对我们的工具（请求-响应式）够用。
- 审核 / 上架要求汇总：Claude 目录（免费、Community 自动上架）> ChatGPT 插件目录（要开发者验证 + 人工审 + 不接受 API key）> Cursor Marketplace > 官方 Registry（只是索引）。**第一档工具无鉴权，三家都能直接挂；第二档要 OAuth，Claude 与 ChatGPT 都要求。**
- 维护：工具 = REST 的包装，规则改了自动跟；每家客户端各一份接入说明；OAuth 同意页一次性做。
- 建议：V1.0 做 **一个远程 MCP 端点 `https://www.stayloop.ai/api/mcp`**，先只暴露第一档工具（无鉴权）：`check_listing_compliance`（带 `province`）、`list_rules`、`rent_benchmark`、`rent_increase_guideline`、`n4_earliest_termination`；提交 Claude 目录（Community 即可）、写 Cursor / Claude Code 接入说明；第二档工具（OAuth）排 V1.1，等 Supabase OAuth 同意页做好。stdio 版只作本地开发 / 演示，不发布 npm 包（维护两份不值）。
- 门槛：工作量——无鉴权远程 MCP 2 天（含 Origin 校验、限流复用、工具注解、目录提交材料）；OAuth 版再 3 天（Supabase OAuth 开启 + 同意页 + RFC 9728 元数据 + Claude 回调测试）；审核——Claude 目录材料（隐私政策 URL、测试账号）已具备。

### D2-3 ChatGPT Apps / GPT Actions 与 Gemini Extensions

- 现状：OpenAI 的提交门户已经把「Apps SDK」统一成 ChatGPT / Codex **插件**（含 MCP 连接 + skills），GPT Actions（OpenAPI 文件挂在自定义 GPT 上）仍是另一条路但本次文档页没提；Gemini 消费者版无第三方入口（见 D2-2）。
- 证据：https://developers.openai.com/apps-sdk/deploy/submission ；https://developers.openai.com/apps-sdk/app-developer-guidelines 。
- 建议：**不单独为 ChatGPT 做 Action 或 App，用同一个远程 MCP 端点提交插件**；门槛比 Claude 高（开发者验证、五正三负测试、视频、人工审、只能 OAuth / 无鉴权），所以排在 Claude 目录之后。我们的工具不碰支付、不收身份证号、不投广告，不触发其禁区；「筛查」工具在 CRA 注册前本来就不对外，也避开了「处理受管个人记录」的审查点。
- 门槛：工作量——复用 MCP 端点后只剩提交材料 1 天；时间——人工审核排队（官方不给时长）。

### D2-4 Webhook 事件推送

- 现状：只有 `/v1/screen` 完成时向调用方传的 `webhook_url` POST 一次（头 `X-Stayloop-Event: screening.completed`，无签名、无重试、无幂等 id）；站内的通知走推送 / 邮件 / 待批卡，没有事件总线。
- 证据：`app/api/v1/screen/route.ts` 第 104–112 行。
- 建议：按 Standard Webhooks 规范补齐（`webhook-id` 作幂等键、`webhook-timestamp` 防重放、`webhook-signature` HMAC-SHA256 带 `v1,` 前缀、多日指数退避重试：规范原文 "retry delivery following a retry schedule spanning multiple days, with an exponential backoff"）。事件候选（都是房东 / 租客自己账号里的事）：`listing.verified`、`listing.archived`、`application.received`、`showing.requested`、`lease.signed`、`rent.recorded`、`work_order.status_changed`、`screening.completed`（注册后）。订阅由 OAuth 用户在设置页登记 URL + 密钥，不经模型。
- 门槛：工作量——签名 + 重试 + 订阅表 + 发送队列（pg_cron 或 `waitUntil`）3 天；边缘运行时——`waitUntil` 够发一次，多日重试要表 + 定时任务（已有 pg_cron 模式）。

### 接入形态对比表

| 形态 | 鉴权 | 审核 / 上架 | 托管 | 维护成本 | 与边缘运行时 |
|---|---|---|---|---|---|
| REST + OpenAPI 3.1 | 匿名 + IP 限流；密钥（机构）；OAuth（第二档） | 无（自家站） | 现有 Pages 路由 | 低；规则同源 | 现状即兼容 |
| 远程 MCP（Streamable HTTP，无状态） | 第一档无鉴权；第二档 OAuth 2.1（Supabase 作授权服务器） | Claude 目录（付费计划可提，Community 自动上架）；ChatGPT 插件目录（开发者验证 + 人工审，不接受 API key）；Cursor Marketplace；官方 Registry（域名 TXT 证明） | 现有 Pages 路由 `/api/mcp`（SDK WebStandard 传输实测可用） | 中；工具是 REST 薄包装，同意页一次性 | 兼容（无状态；不做服务器推送） |
| ChatGPT 插件 / GPT Action | 只 OAuth 或无鉴权 | 最严（验证 + 测试用例 + 视频 + 人工审） | 复用 MCP 端点 | 提交材料 | 同上 |
| Gemini | 无第三方入口（CLI 扩展可装远程 MCP） | 无 | 同上 | 几乎无 | 同上 |
| Webhook | 订阅者密钥 + HMAC 签名 | 无 | 发送要表 + pg_cron 重试 | 中；每个事件一处触发点 | 单次 `waitUntil` 可；重试靠定时任务 |

---

## D3 · 对标（摘要在 `design/research/v1/api/`）

| 产品 | 有无开发者 API | 文档结构 | 鉴权 | 定价 | 限流 | 条款对 AI / 自动化 |
|---|---|---|---|---|---|---|
| SingleKey | **无** | 无开发者文档；产品页 + 帮助中心 | — | 面向房东按份（第三方评测 $29.99 / 份；Pre-Screen、eLease 免费） | — | **读不到**（条款页 403 / 重定向循环） |
| Rentsync / Rentals.ca | **无公开 API**；feed 被房源站定时拉（约每 2 小时） | 帮助中心文章 | — | 不公开 | — | **读不到**（rentals.ca 条款三个路径都 403） |
| Openroom | **无**；BureauEdge 年度套餐含 PMS 集成 | 产品页 + 定价 + 条款 | — | Community $0（每次搜索 10 条）、Plus $10 / 月（100 条）、Ledger $188 / 案、BureauEdge 按单元数 | 以「每次搜索结果数」限 | 11(d) 禁 "data mining, robots, or similar"；11(e) 禁用于竞争产品；8(b) 禁分享；3(a)(iii) 用户授权其训练 AI |
| TaxJar（规则类范例） | 有，完整 | Intro → Auth → Version → Billing → Countries → 端点；八种语言示例；沙箱 | `Authorization: Bearer <key>` | Starter $39 / 月（200 单）、Professional $99 / 月（200 单，10,000 次 / 分钟） | 写在定价页 | 未见 |
| Avalara AvaTax | 有 | 官方部分页面 404 | Basic（用户名密码 或 账号:license key，"does not expire"） | 不公开，按报价 | 官方读不到；第三方写 429 | 未见 |

**三条可直接用的结论**：① 房产数据类同行一家都没开放 API，开放的只有「规则类」生意——Stayloop 的差异化正是第一档（规则 + 基准）；② 规则类 API 按「结果」计费、日期版本号、沙箱免费、限流写在定价页；③ 数据持有者的条款三件套：禁抓取、禁再分发、禁用于竞争产品。

---

## D4 · 商业与风险

**D4-1 密钥发放与配额**
- 现状：密钥由管理员在 `/admin/partners` 手动发（`create_trust_api_key` 只 service_role，存 sha256 + 前缀，明文只显示一次），可绑房东账号；配额硬编码在路由（120 / 分钟、20 / 分钟）；匿名端点每 IP 120 / 小时。用户设置里没有自助申请入口。
- 证据：`app/api/admin/partners/route.ts`；`app/api/v1/*/route.ts`。
- 建议：三类凭证——① 匿名（第一档）：每 IP 限流 + 全站总闸（现有 `underHourlyLimit` 两级）；② 用户 OAuth token（第二档）：限流按 `user_id`，与站内额度共享（筛查月配额、Pro 门禁都已按 `landlords.plan` 执行，API 只是另一个入口）；③ 机构密钥：自助申请页（登录后填用途 + 网站 + 预计量 → `pending` → 管理员批 → 显示一次），每把密钥一行配额（`quota_per_minute / per_day`）与 `scopes`，不再硬编码。
- 门槛：工作量——自助申请页 + 配额列 1.5 天。

**D4-2 计费模式（两种都写清）**
- 现状：唯一的付费是房东 Pro $19 / 月与按次解锁 $14.99（Stripe live）；API 零收入、零外部调用方。
- 方案 A · **先免费换接入量（用户倾向）**：第一档全部免费、匿名可用（规则与基准本身没有边际成本，除了边缘请求），要求展示来源句与 `Powered by Stayloop` 链接（条款写进去）；第二档免费但要用户登录（它本来就是用户自己的数据，收费会违背「租客永远免费」）；机构密钥免费但配额低（如 600 / 天），超出要联系。**衡量**：目录安装数、独立调用方数、带来的注册——这三个数现在都是 0，免费期的目标就是让它们非零。风险：被当免费法规数据源白嫖——用 `attribution` 必填字段 + 条款 + 每 IP 限流控住；规则本身是公开法律，被抄也不构成损失。
- 方案 B · **按次 / 订阅**：学 TaxJar 按「结果」计——合规检查 / 草稿 / 基准查询每份 $0.01–0.05 不值得结算，所以只能做订阅档：开发者免费（1,000 次 / 月）→ 团队 $49 / 月（50,000 次 / 月 + webhook + 支持）→ 企业按量。能收费的只有机构（物业软件、经纪工具），个人用户与 AI 客户端目录里的调用不能收（Claude / ChatGPT 的目录都不允许在工具里卖订阅——ChatGPT 准则明写 "must not… promote upgrades"）。
- 建议：A 起步，B 的订阅档**预留在定价页的「API」列里标「联系我们」**，等有 ≥3 个真实机构调用方再定价。无论哪种，筛查相关在注册前不收费也不开放。
- 门槛：产品决定；Stripe 已有订阅链路，加一个价即可。

**D4-3 第三方 AI 误用我们数据的责任边界**
- 现状：响应里已有 `boundary`（「Deterministic Ontario rules only… Not legal advice」）；条款第 5 节是针对房源信息的 9 条，没有针对 API 的条款。
- 风险：接入方的 AI 把合规检查当法律意见、把 CMHC 均租说成「成交价」、把护照结论当成「已筛查」、把我们的规则在旧版本上缓存一年。
- 建议：① 每个响应带 `as_of`（规则快照日）、`boundary`、`attribution`；② 条款加「API 使用规则」（见 D4-6）；③ MCP 工具描述里直接写限制（AI 客户端会把工具描述放进上下文——D5 原型的描述已这么写）；④ 第二档结果里的个人信息标 `contains_personal_information: true`，条款要求接入方不得存储超过会话。
- 门槛：条款由律师过目；工作量 1 天。

**D4-4 同意记录（PIPEDA）**
- 现状：护照 token 的 API 范围由申请人自己勾选，但同意文本没有写明接收方类别；OAuth 同意页还不存在；筛查同意 `v1-2026-09` 要求合作方传记录（文本是我们的）。
- 证据：OPC 同意指南要求强调「what personal information is collected / with which parties / purposes / risk of harm」，对第三方披露要 "be as specific as possible about recipients"，敏感信息（财务）要**明示同意**。
- 建议：OAuth 同意页列出：客户端名（来自 CIMD / DCR 元数据）、请求的范围、这些数据会进入该 AI 应用及其模型服务商、可随时在 `/settings` 撤销；同意事件写审计（`api_consent_granted`，含 client_id、scopes、文本版本）；护照 token 的 API 勾选处补「持有 Stayloop API 密钥的机构（名单见 /stayloop-api/partners）」。
- 门槛：法规——明示同意（勾选 + 文本版本）；工作量 1 天。

**D4-5 滥用检测与限流**
- 现状：`lib/rateLimit.ts underHourlyLimit(key, limit, failOpen)` 走 `bump_anon_rate_limit`（小时桶、service role），`anon_rate_limits` 当前 81 行；密钥端点另有分钟桶 `trust_api_rate_limit`；没有按天 / 按月配额、没有异常检测、没有封禁表。
- 建议：① 统一到一张 `api_quotas`（key 或 user 或 ip → per_minute / per_day），路由读它；② 响应头 `X-RateLimit-Limit / Remaining / Reset` + 429 带 `Retry-After`（第一档现在只有 `Retry-After: 3600`）；③ 滥用信号：同一密钥 5 分钟内 >N 个不同 token 的 `passport/verify`（枚举）、合规检查输入里含邮箱 / 电话 / 姓名模式（有人往不收 PII 的端点塞 PII——拒绝并计数）、`screen` 的 webhook 指向私网；④ 管理页 `/admin/partners` 加「最近 24 小时调用曲线 + 一键停用」（停用已有）。
- 门槛：工作量 2 天；pg_cron 日汇总可复用现有模式。

**D4-6 服务条款需要加的条款（草案要点，交律师）**
1. 许可范围：API 响应只能用于调用方自己的产品向其用户展示；不得作为数据集转售、不得用于训练模型（Openroom 条款 11(d)/(e)/(k) 的镜像）。
2. 署名：基准数据必须原样展示 `attribution`；规则类响应必须保留「非法律意见」声明与 `as_of`。
3. 个人信息：第二档数据只能在用户会话内使用，不得持久化、不得与其他来源合并画像（PIPEDA 合理目的 + 目的限制）；接入方对其 AI 服务商的跨境传输自行负责并告知用户。
4. 禁止：绕过限流、共享密钥、冒充 Stayloop、用于住房歧视（OHRC 受保护特征的筛选）。
5. 筛查：CRA 注册前明文「不提供」；注册后「仅房东身份、须申请人同意、决定由房东本人作出」。
6. 可用性：无 SLA（免费期），版本按日期，弃用提前 90 天通知。
7. 责任上限与赔偿、法律适用安省、可随时停用密钥。

---

## D5 · 最小 MCP 原型（已跑通，不上线）

**位置**：会话 scratchpad `research-d/mcp/`（`package.json`、`server.mjs`、`client.mjs`、`http-test.mjs`、`run-1.log`、`run-http.log`）。项目目录没有新增任何依赖或文件。

**做法**：`npm init -y && npm install @modelcontextprotocol/sdk zod` → 装到 `@modelcontextprotocol/sdk@1.32.1`、`zod@4.6.7`（约 20 秒）。`server.mjs` 用 `McpServer.registerTool('check_listing_compliance', {inputSchema (zod), outputSchema, annotations: {readOnlyHint, openWorldHint, idempotentHint}}, handler)`，handler 一次 `fetch` 生产端点 `POST https://www.stayloop.ai/api/v1/listings/compliance`（匿名，先 curl 核过请求 / 响应格式：JSON 体 `monthly_rent / deposit / key_deposit / application_fee / pets_allowed / title / description / schedule_b`，响应 `passed / findings[] / checked[] / boundary`，坏 JSON 400，OPTIONS 204 带 CORS）；429 与非 2xx 转成 `isError` 内容；`StdioServerTransport`。`client.mjs` 用 SDK `Client + StdioClientTransport` 拉起子进程、`listTools`、`callTool` 两次。

**结果（run-1.log）**：
- 工具列表：`['check_listing_compliance']`，输入 schema 8 个字段。
- 输入 `{monthly_rent:2500, deposit:5000, key_deposit:300, application_fee:50, pets_allowed:'no', description:'No pets allowed. First and last month plus $500 cleaning fee.'}` → `NOT PASSED`，5 条命中（RTA-106 押金 / O.Reg 516/06 钥匙押金 warn / RTA-14 禁宠 / RTA-134 费用 ×2），`structuredContent.findings.length = 5`。
- 耗时：connect + initialize **159 ms**，第一次 `callTool` **1,761 ms**（其中上游 1,755 ms——生产端点本身 1.3–1.8 s，大头是边缘冷启动 + `compliance_events` 写入），第二次干净房源 **479 ms**。
- 第二个脚本 `http-test.mjs` 证明 edge 兼容：用 SDK 的 `WebStandardStreamableHTTPServerTransport`（只依赖 fetch 标准 Request / Response）在进程内走 initialize(200, JSON) → initialized(202) → tools/list(200) → tools/call(200，1.5 s)。

**坑**：
1. 无状态模式（`sessionIdGenerator: undefined`）下 SDK 要求**每个请求新建 server + transport**，复用会抛 "Stateless transport cannot be reused across requests"——这恰好是 edge 路由 handler 的形状，但意味着每次请求都要重建工具表（我们的工具是纯包装，开销可忽略）。
2. `enableJsonResponse: true` 才回 `application/json`，否则默认 SSE 流；AI 客户端两种都支持，edge 路由选 JSON 更省。
3. 导入路径必须带 `.js`（`@modelcontextprotocol/sdk/server/mcp.js`），子路径导出不含 `index`。
4. 生产端点的 429 是每 IP 120 / 小时——目录上架后 Anthropic 出口段 `160.79.104.0/21` 共用，第一档端点的匿名限流**必须改成按客户端 / 按 token 而不是按 IP**，否则 Claude 全部用户共享 120 次 / 小时。
5. stdio 版给 Claude 桌面端用要写绝对路径的 `node`（桌面端不读 shell PATH）。

**接到 Claude 桌面端 / Claude Code 的配置方法（没有改用户的任何配置）**：
- Claude 桌面端：编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`（Settings → Developer → Edit Config），加
  ```json
  { "mcpServers": { "stayloop-compliance": { "command": "/opt/homebrew/opt/node@22/bin/node", "args": ["<scratchpad>/research-d/mcp/server.mjs"] } } }
  ```
  重启桌面端，在输入框「+」→ Connectors 里看到工具。日志在 `~/Library/Logs/Claude/mcp-server-stayloop-compliance.log`。
- Claude Code（本地 stdio）：`claude mcp add --transport stdio stayloop-compliance -- node <scratchpad>/research-d/mcp/server.mjs`（`--scope user` 跨项目）。
- Claude Code / Cursor / Claude.ai（远程，上线后）：`claude mcp add --transport http stayloop https://www.stayloop.ai/api/mcp`；Cursor `.cursor/mcp.json` → `{"mcpServers":{"stayloop":{"url":"https://www.stayloop.ai/api/mcp"}}}`；claude.ai 设置 → Connectors → Add custom connector → 填 URL、选「No sign in」。

**工作量记录**：安装 + 写 stdio 服务器与客户端 + 跑通 ≈ 25 分钟；edge 传输验证 ≈ 15 分钟（含一次复用报错）。把它做成生产路由（`app/api/mcp/route.ts` + Origin 校验 + 限流 + 五个第一档工具 + 目录提交材料）估 2 天。

---

## 文末汇总

### 三档可开放清单
见 D1 末表。一句话：**第一档（规则、12 省事实、租金基准、房源读）现在就能开，房源读等有真实房源再发布；第二档（护照、本人数据、草稿、消息只读、房源发布）要 OAuth；第三档（筛查、按姓名查记录、评分）注册前关死，`/v1/screen` 改用独立开关。**

### 接入形态对比
见 D2 末表。一句话：**REST + OpenAPI 做底座，远程 MCP（无状态、跑在现有 edge 路由上）是对 AI 的正门，先无鉴权上 Claude 目录，OAuth 用 Supabase 自带的 OAuth 2.1 服务器排 V1.1；ChatGPT 插件复用同一端点但审核更重；Gemini 没有入口；Webhook 按 Standard Webhooks 补签名与重试。**

### 定价与限流草案

| 凭证 | 对象 | 档 | 费用 | 限流（草案） |
|---|---|---|---|---|
| 匿名 | 任何人 / AI 客户端 | 一 | 免费 | 每客户端 token 或 IP 60 / 分钟、1,000 / 天；全站 20,000 / 小时总闸；响应 `X-RateLimit-*` |
| 用户 OAuth | 租客 / 房东本人 | 一 + 二 | 免费（站内额度同用） | 每用户 120 / 分钟、5,000 / 天 |
| 机构密钥 · 开发者 | 自助申请，管理员批 | 一 + 二（经用户授权） | 免费 | 600 / 天 |
| 机构密钥 · 团队（预留） | 物业软件、经纪工具 | 一 + 二 + webhook | $49 / 月（≥3 个真实调用方后再定） | 50,000 / 月 |
| 筛查 `/v1/screen` | 房东身份机构 | 三 | 注册后：按站内筛查配额 | 20 / 分钟（现状） |

### MCP 原型结果与工作量
一个工具、stdio + edge 两种传输都跑通；首调 1.8 s（上游 1.3–1.8 s）、热调 0.5 s；原型 40 分钟，生产版 2 天，OAuth 版再 3 天。四个坑：无状态要每请求新建、JSON 响应要显式开、目录上架后限流不能按 IP、桌面端要绝对路径 node。

### 读不到 / 没做到
- Rentals.ca 条款（三个路径 403）、SingleKey 条款与合作页（403 / 重定向循环）：条款里对 AI 的规定**读不到**。
- Avalara 官方限流页 404、定价不公开。
- ChatGPT「developer mode」对 Plus / Pro 是否开放：官方页面 403 读不到，搜索摘要只列 Business / Enterprise / Edu。
- 没有在 Claude 桌面端真的挂上（规矩：不改用户配置）；配置方法按官方文档写出。
