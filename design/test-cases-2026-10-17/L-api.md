# L · 开放 API 第一档 + MCP（契约测试 · 2026-10-17）

风险 R1（对外、新上线）。依据：CLAUDE.md「V1.0 阶段 5」、`design/open-api-contract-2026-10.md`、「V1.0 阶段 1」API 第三档关闭。守卫：`tests/v1stage5_{restApi,mcp,docsTerms}`。
方法：全部 curl（生产 `https://www.stayloop.ai`），每请求带 `X-Client-Id: sitetest1017-L`（按键限流 300/h，本模块总请求 ≤40 次；MCP 单独一键 600/h）。脚本与原始响应在 scratchpad `sitetest1017/L/`。

## 用例

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| L-01 | R1 | — | `GET /api/v1/rules?province=ON` | 200；体含 `province:'ON'`、`rules[]`（每条 id/area/statute/title{zh,en}/summary{zh,en}/severity/since）、`as_of='2026-10-16'`、`boundary{zh,en}`；头 `x-api-version: 2026-10-16`、`X-RateLimit-Limit: 300`、`Access-Control-Allow-Origin: *`、`Cache-Control: no-store` | v1stage5_restApi |
| L-02 | R1 | — | `GET /api/v1/rules?province=QC` | 200；外省规则每条 `id` 形如 `QC-<topic>`、`topic`、`statute`、`source_url`（https） | 同上 |
| L-03 | R1 | — | `GET /api/v1/rules?province=XX` | 400 `{error:'unsupported_province', message}`，恰好两键 | 同上 |
| L-04 | R1 | — | `GET /api/v1/rules`（缺参） | 200，缺省 ON | 契约「省份参数…缺省 ON」 |
| L-05 | R1 | — | `POST /listings/compliance` `{monthly_rent:2800,deposit:3000,pets_allowed:'no'}` | 200；`passed:false`；findings 含 `RTA-106-deposit-cap` 与 `RTA-14-no-pet-clause`，每条有 `rule_id` + 旧字段 `rule` + `statute` + `message{zh,en}` | 同上 |
| L-06 | R1 | — | `POST /listings/compliance` body 非 JSON（`{bad`） | 400 `invalid_json` | 同上 |
| L-07 | R1 | — | `POST /listings/compliance` `{province:'QC', monthly_rent:1500, deposit:500}` | 200；外省：QC 不许押金 → finding（或 notes 写明只核押金类）；无安省规则 id | 同上 |
| L-08 | R1 | — | `POST /lease/terms-check` `{province:'ON',rent_amount:2800,deposit_amount:5600,form_type:'trreb',start_date:'2026-12-01',end_date:'2027-11-30'}` | 200；`passed:false`，押金超一个月 finding | 同上 |
| L-09 | R1 | — | `POST /lease/terms-check` `start_date:'2026-02-30'` | 400 `invalid_input`，message 指明 `start_date` | 同上 |
| L-10 | R1 | — | `POST /lease/terms-check` 外省 `{province:'BC', rent_amount:2000, deposit_amount:2000}` | 200；BC 押金上限半个月 → finding | 同上 |
| L-11 | R1 | — | `GET /guideline?effective=2027-01-01` | 200；`year:2027, pct:1.9, published:true, cap:2.5, n1_deadline:'2026-10-03', notice_days:90` | ontarioRules2026 |
| L-12 | R1 | — | `GET /guideline?effective=2026-13-01` | 400 `invalid_input` | — |
| L-13 | R1 | — | `GET /guideline?effective=2030-01-01`（未公布年份） | 200 `published:false`，pct = 最新已公布值 | guidelineFor |
| L-14 | R1 | — | `GET /n4/earliest-termination?served=2026-11-02&method=mail` | 200；`deemed_served:'2026-11-07'`、`earliest_termination:'2026-11-14'`、`termination_days:7`、`mail_days:5` | n4EarliestTermination |
| L-15 | R1 | — | `…?served=2026-11-02&method=pigeon` | 400 `invalid_input`，message 列允许值 | — |
| L-16 | R1 | — | `…?served=2026-11-02`（缺 method） | 400 `invalid_input` 或缺省 hand（契约未定；记录实际） | — |
| L-17 | R1 | — | `POST /late-payment/persistent` 三次 >7 天迟付 6 个月内 | 200 `persistent:true`、`late[]` 三条、`definition{grace_days:7,count:3,window_months:6}` | persistentLatePayment |
| L-18 | R1 | — | 同上 121 期（边界） | 400 `invalid_input`（≤120） | PERIODS_MAX |
| L-19 | R1 | — | 同上 120 期（边界内，paid_at null） | 200 | — |
| L-20 | R1 | — | `GET /rent-benchmark?province=ON&area=Toronto&bedrooms=1&type=condo` | 200；`benchmark{source,kind,area,period,avg,quality,label}`、`attribution{zh,en}` 必有 | rentBenchmark |
| L-21 | R1 | — | `…?province=QC&area=Montreal&bedrooms=1&type=condo` | 404 `not_available` | — |
| L-22 | R1 | — | `…?province=ON&type=castle` | 400 `invalid_input` | — |
| L-23 | R1 | — | 七个端点各一次 `OPTIONS` | 204 + CORS 头 | — |
| L-24 | R1 | — | `POST /api/v1/rules`、`GET /api/v1/listings/compliance` | 405 `method_not_allowed` | — |
| L-25 | R1 | — | `GET /api/v1/openapi.json` | 200；`openapi:'3.1.0'`、`info.version='2026-10-16'`、7 条路径 | docsTerms |
| L-26 | R1 | L-25 | 脚本：对每个路径取 200 响应 schema 的 `properties` 键集 ∪ required，与真实响应的键集比对 | 真实响应键 ⊆ schema 键；schema `required` ⊆ 真实响应键 | 本轮脚本 `openapi-diff.mjs` |
| L-27 | R1 | — | MCP `initialize` 三次：protocolVersion `2026-07-28` / `2025-06-18` / `2025-03-26` | 各回显同版本；`serverInfo.name='stayloop'`、`capabilities.tools`、`instructions` 含边界 | v1stage5_mcp |
| L-28 | R1 | — | `initialize` 带未知版本 `1999-01-01` | 返回最新 `2026-07-28` | — |
| L-29 | R1 | — | `tools/list` | 7 个工具；每个 `annotations{title,readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}`、`inputSchema.additionalProperties===false` | — |
| L-30 | R1 | — | `tools/call` 每个工具一次正常入参（批量数组一次发 7 条） | 7 条结果 `isError` 缺省/false；`content[0].type='text'`、`structuredContent` 与 text 解析一致 | — |
| L-31 | R1 | — | `tools/call` 每个工具一次坏入参（批量 7 条） | 每条 `result.isError:true`（不是协议 error） | — |
| L-32 | R1 | — | `notifications/initialized` | 202 空体 | — |
| L-33 | R1 | — | body `{bad` | `error.code=-32700` | — |
| L-34 | R1 | — | `method:'foo/bar'` | `-32601` | — |
| L-35 | R1 | — | `GET /api/mcp`、`DELETE /api/mcp` | 405 `method_not_allowed` | — |
| L-36 | R1 | — | `Origin: http://evil.local` | 403 `{error:'forbidden'}` | — |
| L-37 | R1 | — | 头 `MCP-Protocol-Version: 2025-06-18` + ping | 响应头回显同值 | — |
| L-38 | R1 | — | `GET /.well-known/mcp/server.json` | 200 JSON；`$schema` 2025-12-11、`name='ai.stayloop/rules'`、`remotes[0].type='streamable-http'`、url=`/api/mcp` | — |
| L-39 | R1 | — | `POST /api/v1/screen`（任意 body，无密钥） | 503 `partner_screening_closed` | v1stage1_apiTier3 |
| L-40 | R1 | — | `POST /api/v1/passport/verify` 无 `x-api-key` | 401 | — |
| L-41 | R2 | — | `X-Client-Id` 超 64 字符 / 含空格 | 仍 200（回退 IP 键），不报错 | clientKeyFor |
| L-42 | R2 | — | `/api/v1/rules` 响应 `X-Content-Type-Options: nosniff` | 有 | — |

## 执行记录（2026-10-17 晚 · 生产 · curl · 原始响应在 scratchpad `sitetest1017/L/*.body|*.hdr`，脚本 `run.sh` `mcp.sh` `openapi-diff.mjs`）

本模块对 `/api/v1/*` 共发 37 次请求（每端点 ≤8，键 `cid:sitetest1017-L`）、`/api/mcp` 共 15 次（键 `cid:sitetest1017-L-mcp`）。

| ID | 实际 | 证据 | 结果 |
|---|---|---|---|
| L-01 | 200；`province:ON`、30 条规则（id/area/statute/title/summary/severity/since）、`as_of=2026-10-16`、`boundary{zh,en}`；头 `x-api-version: 2026-10-16`、`x-ratelimit-limit: 300`、`access-control-allow-origin: *`、`cache-control: no-store`、`x-content-type-options: nosniff` | L01.body/.hdr | 通过 |
| L-02 | 200；13 条 `QC-statute … QC-lease-end`，每条 `topic/statute/source_url(https)/title/summary` | L02.body | 通过（注：契约列了 14 个主题，QC 少 `adverseDecision`——与 10-02 省份研究「未通过核查的 4 条不上线」一致，按设计） |
| L-03 | 400 `{"error":"unsupported_province","message":"province: \"XX\" is not a supported … (ON, QC, …)"}` 恰两键 | L03.body | 通过 |
| L-04 | 200 缺省 ON | L04.body | 通过 |
| L-05 | 200 `passed:false`；findings `RTA-106-deposit-cap`(block) + `RTA-14-no-pet-clause`(block)，每条 rule_id/rule/severity/statute/message{zh,en}/source_url/url | L05.body | 通过 |
| L-06 | 400 `invalid_json` | L06.body | 通过 |
| L-07 | 200 QC：`QC-CCQ-1904-no-deposit` + `notes{zh,en}`「只核押金类与费用类」 | L07.body | 通过 |
| L-08 | 200 `passed:false`：`RTA-106-deposit-cap`(block) + `OREG9-18-standard-lease`(warn，form_type=trreb) | L08.body | 通过 |
| L-09 | 400 `invalid_input` `start_date: is not a calendar date` | L09.body | 通过 |
| L-10 | 200 BC：`BC-deposit-cap`「$2,000 exceeds … half a month’s rent」+ notes 三类 | L10.body | 通过 |
| L-11 | 200 `year:2027,pct:1.9,published:true,cap:2.5,n1_deadline:2026-10-03,notice_days:90` | L11.body | 通过 |
| L-12 | 400 `invalid_input` `effective: is not a calendar date` | L12.body | 通过 |
| L-13 | 200 `published:false`、pct 1.9（最新已公布值）、n1_deadline 2029-10-03 | L13.body | 通过 |
| L-14 | 200 `deemed_served:2026-11-07, earliest_termination:2026-11-14, termination_days:7, mail_days:5` | L14.body | 通过 |
| L-15 | 400 `method: must be one of hand | mail | email` | L15.body | 通过 |
| L-16 | 200 缺省 `method:hand`，deemed = served，最早 11-09 | L16.body | 通过（契约未写缺省；OpenAPI `method` 非必填，一致） |
| L-17 | 200 `persistent:true`、late 3 条、window [04-01, 08-01]、definition {7,3,6} | L17.body | 通过 |
| L-18 | 400 `periods: must have at most 120 items` | L18.body | 通过 |
| L-19 | 200（120 期）late 120、persistent true | L19.body | 通过 |
| L-20 | 200 benchmark{source:cmhc,kind:condo,area,period:2025-10,avg:2465,prev_avg,quality:b,label} + alt + asking + history + `attribution{zh,en}` | L20.body | 通过 |
| L-21 | 404 `not_available`「only available for Ontario」 | L21.body | 通过 |
| L-22 | 400 `type: must be one of apartment | condo | townhouse | house` | L22.body | 通过 |
| L-23 | 七个端点 OPTIONS 全部 204，`access-control-allow-origin:* / -headers: content-type,x-client-id,x-api-key / -methods: GET,POST,OPTIONS / max-age 86400` | L23_*.hdr | 通过 |
| L-24 | `POST /rules` 405、`GET /listings/compliance` 405，体 `method_not_allowed` | L24a/b | 通过 |
| L-25 | 200 `openapi:3.1.0`、`info.version:2026-10-16`、7 条路径、servers `https://www.stayloop.ai/api/v1` | L25.body | 通过 |
| L-26 | 脚本解析 `$ref`/`allOf`，七个路径：真实响应键 ⊆ schema properties、schema required ⊆ 真实响应键，`mismatches: 0`；嵌套 rules[0]（oneOf 安省形）/ findings[0] / benchmark 也一致 | `openapi-diff.mjs` 输出 | 通过（注：各操作 `responses` 只列 200/400/(404)/429，没有 405——405 是错方法时才出现，不算缺陷） |
| L-27 | `initialize` ×3 各回显请求版本；`serverInfo {name:stayloop, version:2026-10-16}`、`capabilities {tools:{}}`、`instructions` 含边界 | L27_*.body | 通过 |
| L-28 | 未知版本 `1999-01-01` → 回 `2026-07-28` | L27_1999-01-01.body | 通过 |
| L-29 | 7 个工具（list_rules, check_listing_compliance, check_lease_terms, rent_increase_guideline, n4_earliest_termination, persistent_late_payment, rent_benchmark）；注解五项齐、`additionalProperties:false`、`title`、描述含「legal advice」 | L29.body | 通过 |
| L-30 | 批量 7 条全部 `isError` 缺省、`content[0].type=text`、`structuredContent` 与 text 解析逐字节相同 | L30.body | 通过 |
| L-31 | 批量 8 条：7 个坏入参全部 `result.isError:true`（文字 `invalid_input: $.province must be one of …`）；未知工具 `no_such_tool` → 协议错误 `-32602 Unknown tool`（MCP 规范对未知工具正是 -32602） | L31.body | 通过 |
| L-32 | 202、体 0 字节 | L32.hdr | 通过 |
| L-33 | HTTP 400 + `{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}` | L33 | 通过 |
| L-34 | `-32601 Method not found: foo/bar` | L34.body | 通过 |
| L-35 | GET 405 / DELETE 405，体 `method_not_allowed` | L35g/d | 通过 |
| L-36 | `Origin: http://evil.local` → 403 `{error:forbidden, message:Origin must be https.}`；`Origin: https://claude.ai` → 200 ping `{}` | L36/L36b | 通过 |
| L-37 | 响应头 `mcp-protocol-version: 2025-06-18` 回显；`x-ratelimit-limit: 600`、`x-api-version` | L37.hdr | 通过 |
| L-38 | 200 `application/json`；`$schema …/2025-12-11/server.schema.json`、`name ai.stayloop/rules`、`remotes[0] {streamable-http, https://www.stayloop.ai/api/mcp}` | L38 | 通过 |
| L-39 | 503 `{"error":"partner_screening_closed","message":"Partner screening is closed until … CRA registration …"}` | L39 | 通过 |
| L-40 | 401 `{"error":"x-api-key header required"}` | L40 | 通过 |
| L-41 | 70 字符 / 含空格的 `X-Client-Id` 都 200（回退 IP 键） | L41/L41b | 通过 |
| L-42 | `x-content-type-options: nosniff` 在 | L01.hdr | 通过 |

**汇总**：42 条用例全部执行、全部通过，0 缺陷。守卫 `tests/v1stage5_*` 与生产行为一致。

### 数据副作用
无（第一档不存任何输入；只有限流桶 `v1:*:cid:sitetest1017-L*` 计数，一小时后过期）。
