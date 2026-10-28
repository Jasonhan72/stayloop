# L · 开放 API 第一档 + MCP + 公开知识库端点（契约回归 · 2026-10-28）

风险 R2（本轮按回归抽样；10-17 轮定 R1 全过）。依据：CLAUDE.md「开放 API」、`design/open-api-contract-2026-10.md`、10-27「知识库 · 更新机制」（`/api/kb/notices` 公开）。守卫 `tests/v1stage5_{restApi,mcp,docsTerms}`、`kbUpdates20261027`。
方法：全部 curl（生产 `https://www.stayloop.ai`），`X-Client-Id: sitetest1028-L`（MCP 用 `sitetest1028-L-mcp`）；脚本与原始响应在 scratchpad `sitetest1028/HIJNL/L/`（`run.sh` `mcp.sh` `openapi-diff.mjs`，`*.body` / `*.hdr`）。本模块对 `/api/v1/*` 共 ≤ 24 次请求、`/api/mcp` 12 次。
基线抽样：10-17 的 L-01～L-42 抽 24 条（≥50%），编号沿用；新增 L-43（kb notices）、L-44（docs 页与路由一致）。

## 用例（抽样 + 新增）

| ID | 风险 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|
| L-01 | R2 | `GET /api/v1/rules?province=ON` | 200，`province/as_of/rules[]/boundary`；头 `x-api-version`、`X-RateLimit-Limit: 300`、`Access-Control-Allow-Origin: *`、`Cache-Control: no-store`、`nosniff` | v1stage5_restApi |
| L-02 | R2 | `?province=QC` | 200，`QC-*` 规则带 `source_url` https | 同上 |
| L-03 | R2 | `?province=XX` | 400 `unsupported_province` 恰两键 | 同上 |
| L-04 | R2 | 缺参 | 200 缺省 ON | 契约 |
| L-05 | R2 | `POST /listings/compliance` 押金 3000 / 租金 2800 / 禁宠 | 200 `passed:false`，`RTA-106-deposit-cap` + `RTA-14-no-pet-clause` | 同上 |
| L-06 | R2 | body `{bad` | 400 `invalid_json` | 同上 |
| L-08 | R2 | `POST /lease/terms-check` 押金 5600 / trreb | 200 `passed:false` 押金 finding | 同上 |
| L-11 | R2 | `GET /guideline?effective=2027-01-01` | 200 `pct 1.9 published true cap 2.5 n1_deadline 2026-10-03` | ontarioRules2026 |
| L-14 | R2 | `GET /n4/earliest-termination?served=2026-11-02&method=mail` | 200 deemed 11-07、earliest 11-14、7 / 5 天 | n4EarliestTermination |
| L-15 | R2 | `method=pigeon` | 400 `invalid_input` 列允许值 | — |
| L-17 | R2 | `POST /late-payment/persistent` 5 期 3 次 >7 天 | 200 `persistent:true`、late 3、definition {7,3,6} | persistentLatePayment |
| L-20 | R2 | `GET /rent-benchmark?province=ON&area=Toronto&bedrooms=1&type=condo` | 200 `benchmark{source,kind,area,period,avg}` + `attribution` | rentBenchmark |
| L-21 | R2 | `province=QC` | 404 `not_available` | — |
| L-22 | R2 | `type=castle` | 400 `invalid_input` | — |
| L-23 | R2 | `OPTIONS /listings/compliance` | 204 + CORS 四头 | — |
| L-24 | R2 | `POST /api/v1/rules` | 405 `method_not_allowed` | — |
| L-25 | R2 | `GET /api/v1/openapi.json` | 200，3.1.0，`info.version 2026-10-16`，7 条路径 | docsTerms |
| L-26 | R2 | `openapi-diff.mjs`：7 个路径 200 schema 的键集 vs 真实响应 | 真实键 ⊆ schema、required ⊆ 真实键 | 本轮脚本 |
| L-27 | R2 | MCP `initialize` 2025-06-18 | 回显版本、`serverInfo.name=stayloop`、`capabilities.tools`、`instructions` 含边界 | v1stage5_mcp |
| L-28 | R2 | `initialize` 未知版本 1999-01-01 | 回最新 2026-07-28 | — |
| L-29 | R2 | `tools/list` | 7 个工具 + 注解 + `additionalProperties:false` | — |
| L-30 | R2 | `tools/call n4_earliest_termination` 正常入参 | `content[0].type=text` 与 `structuredContent` 一致 | — |
| L-31 | R2 | `tools/call list_rules province=XX` | `result.isError:true`（不是协议 error） | — |
| L-32 | R2 | `notifications/initialized` | 202 空体 | — |
| L-33 | R2 | body `{bad` | `-32700` | — |
| L-34 | R2 | `foo/bar` | `-32601` | — |
| L-35 | R2 | `GET /api/mcp` | 405 | — |
| L-36 | R2 | `Origin: http://evil.local` | 403 `forbidden` | — |
| L-37 | R2 | 头 `MCP-Protocol-Version: 2025-06-18` + ping | 响应头回显、`x-ratelimit-limit: 600` | — |
| L-38 | R2 | `GET /.well-known/mcp/server.json` | 200，`name ai.stayloop/rules`、`remotes[0]` streamable-http `/api/mcp` | — |
| L-39 | R2 | `POST /api/v1/screen`（无密钥） | 第三档关闭：503 `partner_screening_closed` 带原因 | v1stage1_apiTier3 |
| L-40 | R2 | `POST /api/v1/passport/verify` 无 `x-api-key` | 401 | — |
| L-43 | R2 新 | `GET /api/kb/notices` | 200 `{notices:[…]}` 数组；`Cache-Control: public, max-age=300` | kbUpdates20261027 |
| L-44 | R2 新 | `/stayloop-api/docs` 里出现的 `/api/v1/*` 路径 vs 仓库 `app/api/v1/**/route.ts` | 一一对应（含 screen / passport 两个受限端点） | docsTerms |

## 执行记录（2026-10-28 18:31–18:36 UTC）

| ID | 实际 | 证据 | 结果 |
|---|---|---|---|
| L-01 | 200；`province ON`、`as_of 2026-10-16`、rules[] 首条 `RTA-106-deposit-cap`（id/area/statute/title/summary）；头 `x-api-version: 2026-10-16`、`x-ratelimit-limit: 300`、`access-control-allow-origin: *`、`cache-control: no-store`、`x-content-type-options: nosniff` | L01.body/.hdr | 通过 |
| L-02 | 200；`QC-statute …`，每条 `topic / statute / source_url` | L02.body | 通过 |
| L-03 | 400 `{"error":"unsupported_province","message":"province: \"XX\" is not a supported … (ON, QC, BC, AB, MB, SK, NS, NB, PE, NL, YT, NT, NU)."}` 恰两键 | L03.body | 通过 |
| L-04 | 200 缺省 ON | L04.body | 通过 |
| L-05 | 200 `passed:false`；`RTA-106-deposit-cap`(block) 「押金 $3,000 超过一个月租金 $2,800」+ `RTA-14-no-pet-clause`，每条 rule_id / rule / severity / statute / message{zh,en} / source_url | L05.body | 通过 |
| L-06 | 400 `invalid_json`「Request body must be a JSON object.」 | L06.body | 通过 |
| L-08 | 200 `passed:false`，`RTA-106-deposit-cap`「押金 $5,600 超过一个月租金」 | L08.body | 通过 |
| L-11 | 200 `year 2027 pct 1.9 published true cap 2.5 n1_deadline 2026-10-03 notice_days 90` | L11.body | 通过 |
| L-14 | 200 `deemed_served 2026-11-07, earliest_termination 2026-11-14, termination_days 7, mail_days 5` | L14.body | 通过 |
| L-15 | 400 `method: must be one of hand | mail | email` | L15.body | 通过 |
| L-17 | 第一次用 `due` 字段 → 400 `periods[0].due_date: is required`（契约字段名是 `due_date`，校验信息准确）；改 `due_date` → 200 `persistent true, late [04-01, 05-01, 07-01], window [04-01, 07-01], definition {7,3,6}`，另带 `as_of_date 2026-10-28` | L17.body | 通过 |
| L-20 | 200 `benchmark{source cmhc, kind condo, area "Former City of Toronto, York and East York", period 2025-10, avg 2465, prev_avg 2531, quality b, label}` | L20.body | 通过 |
| L-21 | 404 `not_available`「only available for Ontario … QC has no figures」 | L21.body | 通过 |
| L-22 | 400 `type: must be one of apartment | condo | townhouse | house` | L22.body | 通过 |
| L-23 | 204；`access-control-allow-origin: *`、`-headers: content-type,x-client-id,x-api-key`、`-methods: GET,POST,OPTIONS`、`max-age 86400` | L23.hdr | 通过 |
| L-24 | 405 `method_not_allowed`「POST is not allowed on this endpoint.」 | L24.body | 通过 |
| L-25 | 200；`openapi 3.1.0`、`info.version 2026-10-16`、paths = /guideline /late-payment/persistent /lease/terms-check /listings/compliance /n4/earliest-termination /rent-benchmark /rules、servers `https://www.stayloop.ai/api/v1` | L25.body | 通过 |
| L-26 | 七个路径 `extra-in-response [] / required-missing []`，`mismatches 0` | `openapi-diff.mjs` 输出 | 通过 |
| L-27 | 200 回显 `2025-06-18`；`serverInfo {name stayloop, title, version 2026-10-16}`、`capabilities {tools:{}}`、`instructions` 中英边界句 | L27.body | 通过 |
| L-28 | `1999-01-01` → `2026-07-28` | L28.body | 通过 |
| L-29 | 7 个工具（list_rules 首）；头 `x-ratelimit-limit: 600`、`x-api-version` | L29.body/.hdr | 通过 |
| L-30 | `content[0].text` 与 `structuredContent` 同一 JSON（deemed 11-07 / earliest 11-14） | L30.body | 通过 |
| L-31 | `result.isError:true`，文字 `invalid_input: $.province must be one of …` | L31.body | 通过 |
| L-32 | 202，空体 | L32.hdr | 通过 |
| L-33 | HTTP 400 + `{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}` | L33.body | 通过 |
| L-34 | `-32601 Method not found: foo/bar` | L34.body | 通过 |
| L-35 | 405 `method_not_allowed`「GET is not allowed on the MCP endpoint; send JSON-RPC by POST.」 | L35.body | 通过 |
| L-36 | 403 `{error:forbidden, message:"Origin must be https."}`；`Origin: https://claude.ai` 的其他请求全 200 | L36.body | 通过 |
| L-37 | 响应头 `mcp-protocol-version: 2025-06-18` 回显、`x-ratelimit-limit: 600`、`access-control-allow-headers: content-type,accept,x-client-id,mcp-protocol-version,mcp-session-id` | L37.hdr | 通过 |
| L-38 | 200 JSON；`$schema …/2025-12-11/server.schema.json`、`name ai.stayloop/rules`、`remotes[0] streamable-http https://www.stayloop.ai/api/mcp` | L38.body | 通过 |
| L-39 | 503 `{"error":"partner_screening_closed","message":"Partner screening is closed until Stayloop’s Consumer Reporting Act registration is complete."}`（用例写 403/404，实际 503 带原因，与 10-17 基线及 `lib/api/partnerScreening.ts` 一致，按设计） | L39.body | 通过 |
| L-40 | 401 `{"error":"x-api-key header required"}` | L40.body | 通过 |
| L-43 | 200 `{"notices":[]}`（当前 `knowledge_changes` 无 pending，数组为空属实）；`cache-control: public, max-age=300` | L43.body/.hdr | 通过 |
| L-44 | 文档页 50.8 KB，提到的路径：guideline / late-payment/persistent / lease/terms-check / listings/compliance / n4/earliest-termination / openapi / passport/verify / rent-benchmark / rules / screen + `/api/mcp`；仓库 `app/api/v1/` 目录恰好这 10 个 route（含 `openapi.json`），一一对应 | `grep -o 'api/v1/…' L44.body`、`ls app/api/v1` | 通过 |

**汇总**：34 条执行（基线抽样 32 + 新增 2），34 通过，0 失败，0 缺陷。限流头只有 `x-ratelimit-limit`，没有 `remaining / reset`（10-17 同样，契约未承诺，记为观察）。

## 缺陷

无。

## 观察

- `/api/v1/*` 与 `/api/mcp` 的响应只带 `x-ratelimit-limit`，没有 `x-ratelimit-remaining`；对接方只能靠 429 发现额度用完。契约没写，不算缺陷。
- `/api/v1/late-payment/persistent` 字段名 `due_date`（不是 `due`），400 信息把字段路径写得很清楚，好。

## 数据副作用

无（第一档不存输入；限流桶 `v1:*:cid:sitetest1028-L*` 一小时后过期）。
