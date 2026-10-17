# Stayloop 远程 MCP · 目录提交材料（阶段 5 · 2026-10-16）

端点：`POST https://www.stayloop.ai/api/mcp`（Streamable HTTP、无状态、只回 JSON、不开 SSE、**无鉴权**）。实现：`app/api/mcp/route.ts` + `lib/mcp/{jsonrpc,tools,validate}.ts`；
守卫 `tests/v1stage5_mcp.spec.ts`；注册表描述文件 `public/.well-known/mcp/server.json`。七个工具全部是**只读、确定性**的第一档能力
（规则 / 合规检查 / 日期算术 / 开放授权租金基准），不收任何个人信息（契约 `design/open-api-contract-2026-10.md`「MCP」）。

**提交动作由用户完成**（需要登录 claude.ai / Cursor / ChatGPT 开发者账号、DNS 操作、签协议）；本文只准备现成答案。下面标「🟡 需用户决定」的项是我不能替你定的。

---

## 1. Claude 连接器目录（claude.ai/directory/manage → Submit new → MCP connector）

来源：claude.com/docs/connectors/building/submission（2026-10-16 读取）。任何付费 Claude 计划都可提交；自动扫描后默认以 **Community** 连接器上架，部分再人工审核；
进度在同一页面查看，升级联系 `mcp-review@anthropic.com`。

### 提交前清单（官方清单逐条对照）
| 要求 | 我们的现状 |
|---|---|
| 远程、HTTPS 可达 | `https://www.stayloop.ai/api/mcp` |
| 鉴权对 Claude 可用：OAuth（动用户账号）或 **无鉴权（公开数据）** | 无鉴权（第一档全是公开规则与开放授权数据） |
| 每个工具有 `title` + `readOnlyHint` 或 `destructiveHint` | 七个工具都有 `title`，`readOnlyHint:true`、`destructiveHint:false`、`idempotentHint:true`、`openWorldHint:false` |
| 已在 Claude 里作为自定义连接器测试过、每个工具都调过 | 🟡 **需用户做**：claude.ai → Settings → Connectors → Add custom connector → URL 填端点、鉴权选「No sign in」，在对话里逐个调用七个工具（第 6 节有每个工具的一句测试话术） |
| 文档 URL、隐私政策 URL、支持联系、图标 | 见下表；图标 🟡 需用户选一张（建议 `public/icons/icon-512.png` 的 wordmark，或单独出一枚方形图标） |
| 审核测试账号 | 无鉴权连接器不需要账号；「Test & launch」步可写「No account needed — every tool is anonymous」 |
| 账号能提交（付费计划） | 🟡 用户的 claude.ai 账号 |

### 各步骤表单答案

**Connection**
- Server URL：`https://www.stayloop.ai/api/mcp`
- Users connect to different URLs：否（单一 URL）

**Tools**（自动从服务器同步；应显示 7 个工具、全部归在 read-only 组）

**Listing**
- Server name（≤100）：`Stayloop · Ontario & Canada rental rules`
- One-liner（≤200）：`Deterministic Canadian residential-tenancy rules, notice-date arithmetic and openly licensed rent benchmarks — read-only, no personal data.`
- Description（≤2,000，建议原文）：

  > Stayloop exposes the rule engine behind its rental platform as seven read-only tools. **Rules**: list the residential-tenancy rules for Ontario (Residential Tenancies Act, 2006 and its regulations) or any of the other 12 provinces and territories, each with its statute citation and official source URL. **Compliance checks**: check a rental listing's terms or a lease's money and date terms against those rules (deposit caps, key deposits, pet-ban clauses, prohibited fees, form type, dates). **Date arithmetic**: the Ontario rent increase guideline and N1 deadline for a given effective date; the earliest termination date for an N4 notice served on a given date; the persistent-late-payment test over a list of rent periods. **Rent benchmark**: the published average rent for an Ontario area and unit size from the CMHC Rental Market Survey and Statistics Canada table 46-10-0092-01, always returned with the licence-required attribution line.
  >
  > Boundary: deterministic rules and date arithmetic only, not legal advice; the tools do not pick forms or advise whether to serve any notice; they accept and store no personal information — pass terms, amounts and dates only. Every answer carries `as_of` (the rule-snapshot date) and the boundary sentence. No sign-in; rate-limited per client.
  >
  > 只做确定性规则与日期算术，不是法律意见；不选表、不建议是否发出任何通知；不接受也不存储个人信息。

- Categories（1–5）：🟡 建议 `Productivity`、`Real estate` / `Legal`（以门户当日的类别列表为准）
- Documentation URL：`https://www.stayloop.ai/stayloop-api/docs`
- Privacy policy URL：`https://www.stayloop.ai/privacy`
- Support contact：`hello@stayloop.ai`
- Icon：🟡 需用户上传
- URL slug（永久）：建议 `stayloop-rental-rules`

**Use cases**
- Primary use cases：① 房东 / 租客 / 经纪的 AI 助手在起草房源或租约时核对安省与各省的押金、费用、禁宠条款；② 计算 N1 / N4 的日期与指导比例；③ 引用 CMHC / 统计局的租金基准（带署名）。
- What users need before connecting：Nothing — no account, no key.
- Reads / writes：**Reads only**.

**Company**
- Company name：`Stayloop Inc.`（与 `/terms` 一致）
- Website：`https://www.stayloop.ai`
- Primary contact：🟡 用户的姓名 + 邮箱（建议 `hello@stayloop.ai`）

**Authentication**
- 选 **No authentication**。（不要勾「tools prompt for auth on demand」——第一档没有任何需要登录的工具。）

**Data handling**
- Underlying API：**Your own**（`https://www.stayloop.ai/api/v1/*`，同一套核心函数）
- Personal health data：No；Sponsored content：No

**Test & launch**
- Access instructions（可原文粘贴）：

  > No account or credentials are needed. Add `https://www.stayloop.ai/api/mcp` as a custom connector with "No sign in". Suggested checks: ask "List the Ontario rental rules" (list_rules); "Is a $5,000 deposit on a $2,500/month Toronto listing allowed?" (check_listing_compliance); "What is the Ontario rent increase guideline for an increase effective 2027-01-01 and when must the N1 be served?" (rent_increase_guideline); "If an N4 is mailed on 2026-10-16, what is the earliest termination date?" (n4_earliest_termination); "Average rent for a one-bedroom apartment in North York?" (rent_benchmark). Public REST equivalents: https://www.stayloop.ai/stayloop-api/docs.

- 「I have run every tool myself」：🟡 用户在 Claude 里跑过一遍后勾选。

**Compliance — 七条政策确认（逐条怎么答）**
| # | 政策项（官方文字：directory guidelines / first-party API usage / financial transactions / AI media generation / prompt injection / conversation data collection / public documentation） | 我们的说明 |
|---|---|---|
| 1 | Directory guidelines（遵守 Anthropic Software Directory Terms & Policy） | 遵守；无第三方品牌冒用、无误导描述 |
| 2 | First-party API usage（只调用自己有权使用的 API） | 底层是 Stayloop 自己的 `/api/v1`；外部数据只有 CMHC（数据使用许可）与统计局（Open Government Licence – Canada），都允许再分发并已带署名 |
| 3 | Financial transactions（不经手支付） | 无任何支付或资金功能 |
| 4 | AI media generation（不生成媒体） | 不生成图片 / 音频 / 视频；全部是确定性规则，不调用模型 |
| 5 | Prompt injection（不在工具结果里夹带指令） | 工具结果是 JSON 数据与一句固定边界声明，没有面向模型的指令；输入只接受结构化字段并按 JSON Schema 校验 |
| 6 | Conversation data collection（不收集对话） | 不记录请求正文、不存任何入参；只做每客户端 / 每 IP 的小时计数（限流） |
| 7 | Public documentation（有公开文档） | `https://www.stayloop.ai/stayloop-api/docs`（含 MCP 一节） |

### 七个工具的 title 与注解（门户「Tools」步会显示）
| name | title | readOnlyHint | destructiveHint | idempotentHint | openWorldHint |
|---|---|---|---|---|---|
| `list_rules` | List rental rules | true | false | true | false |
| `check_listing_compliance` | Check a rental listing | true | false | true | false |
| `check_lease_terms` | Check lease terms | true | false | true | false |
| `rent_increase_guideline` | Ontario rent increase guideline | true | false | true | false |
| `n4_earliest_termination` | N4 earliest termination date | true | false | true | false |
| `persistent_late_payment` | Persistent late payment test | true | false | true | false |
| `rent_benchmark` | Rent benchmark (CMHC / StatCan) | true | false | true | false |

---

## 2. Cursor（`~/.cursor/mcp.json` 或项目 `.cursor/mcp.json`）

```json
{
  "mcpServers": {
    "stayloop": {
      "url": "https://www.stayloop.ai/api/mcp",
      "headers": { "X-Client-Id": "cursor-<your-name>" }
    }
  }
}
```
`X-Client-Id` 可选（≤64 字符，自报不注册）：带上它限流就按这个 id 计，而不是按 Cursor 出口 IP 共享。

## 3. Claude Code

```bash
claude mcp add --transport http stayloop https://www.stayloop.ai/api/mcp
```
跨项目可用加 `--scope user`；带客户端 id：`claude mcp add --transport http stayloop https://www.stayloop.ai/api/mcp --header "X-Client-Id: claude-code-<your-name>"`。
之后在对话里 `/mcp` 能看到 `stayloop` 与七个工具。

## 4. claude.ai 自定义连接器（提交目录前的自测，也是普通用户的接法）

Settings → Connectors → **Add custom connector** → Name `Stayloop` → URL `https://www.stayloop.ai/api/mcp` → 鉴权 **No sign in** → Add。
Free 计划只能加一个自定义连接器。Anthropic 的出口网段是 `160.79.104.0/21`——目录上架后所有 Claude 用户共用这些 IP，所以我们的限流键优先取 `X-Client-Id`，没有才按 IP（600 次 / 小时）。

## 5. ChatGPT 插件门户（只列材料，不提交）

ChatGPT 自定义 MCP 连接器要「developer mode」（官方只列 Business / Enterprise / Edu）；上目录走 ChatGPT / Codex 插件门户。需要准备：
1. 开发者验证（🟡 用户的 OpenAI 组织）；
2. 公网 HTTPS 端点（有）；鉴权只接受 **无鉴权 / OAuth / 混合**——我们是无鉴权，符合；
3. 域名验证文件 `https://www.stayloop.ai/.well-known/openai-apps-challenge`（🟡 门户生成内容后再放到 `public/.well-known/`）；
4. 五个正向 + 三个负向测试用例与一段视频（正向可直接用第 1 节「Test & launch」的五句话；负向例如：传姓名 / 地址 → 校验拒绝、`province: "Narnia"` → `unsupported_province`、`bedrooms: "two"` → `isError`）；
5. 隐私政策 `https://www.stayloop.ai/privacy` 与条款 `https://www.stayloop.ai/terms`（第 5 节 API 使用规则）；
6. 开发者准则自查：最小数据（不收任何个人信息）、不收证件号 / 支付卡 / 健康数据、不卖东西、不投广告。
上架后工具变更会被自动扫描。

## 6. 官方 MCP Registry（registry.modelcontextprotocol.io，预览期）

`public/.well-known/mcp/server.json` 已按 `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json` 写好（`name: ai.stayloop/rules`、`remotes[0] = streamable-http https://www.stayloop.ai/api/mcp`）。
注意 schema 说 `version` **应**是语义化版本（我们按契约用日期版本 `2026-10-16`，允许但「排序可能不可预期」）；🟡 若要严格语义化，改成 `1.0.0` 并同步 `tests/v1stage5_mcp.spec.ts` 的断言。

命名空间 `ai.stayloop/*` 要证明拥有 `stayloop.ai`（domain-based auth），两种办法任选其一（都要 **OpenSSL 3**：macOS 自带的 LibreSSL 不支持 Ed25519，用 `/opt/homebrew/opt/openssl@3/bin/openssl`）：

**A. DNS TXT（放在 apex `stayloop.ai`，不是子域名）**
```bash
OPENSSL=/opt/homebrew/opt/openssl@3/bin/openssl
$OPENSSL genpkey -algorithm Ed25519 -out mcp-registry-key.pem
PUBLIC_KEY="$($OPENSSL pkey -in mcp-registry-key.pem -pubout -outform DER | tail -c 32 | base64)"
echo "stayloop.ai. IN TXT \"v=MCPv1; k=ed25519; p=${PUBLIC_KEY}\""
```
🟡 用户在 Cloudflare DNS 给 `stayloop.ai`（apex）加这条 TXT（DNS only），等传播后：
```bash
PRIVATE_KEY="$($OPENSSL pkey -in mcp-registry-key.pem -noout -text | grep -A3 "priv:" | tail -n +2 | tr -d ' :\n')"
mcp-publisher login dns --domain stayloop.ai --private-key "${PRIVATE_KEY}"
```

**B. HTTP 文件 `https://stayloop.ai/.well-known/mcp-registry-auth`**
```bash
echo "v=MCPv1; k=ed25519; p=${PUBLIC_KEY}" > public/.well-known/mcp-registry-auth
```
部署后 `mcp-publisher login http --domain stayloop.ai --private-key "${PRIVATE_KEY}"`。（注意我们的 apex 308 到 www——注册表查的是 `https://stayloop.ai/...`，🟡 要先确认中间件对 `/.well-known/` 不做跳转，或改用 DNS 方式。）

发布：在含 `server.json` 的目录（把 `public/.well-known/mcp/server.json` 复制为 `./server.json`）运行 `mcp-publisher publish`。注册表**不**校验远程 URL 的归属，只校验命名空间；同一个远程 URL 只能被一个 server name 使用。私钥 `mcp-registry-key.pem` 不入库。

## 7. 上线后用 curl 验证（三条）

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://www.stayloop.ai/api/mcp
```
期望 `405`。

```bash
curl -s https://www.stayloop.ai/api/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```
期望 `result.protocolVersion = "2025-06-18"`、`result.serverInfo.name = "stayloop"`、响应头 `x-api-version: 2026-10-16`。

```bash
curl -s https://www.stayloop.ai/api/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"n4_earliest_termination","arguments":{"served":"2026-10-16","method":"mail"}}}'
```
期望 `result.structuredContent.earliest_termination = "2026-10-28"`（邮寄 +5 天视为送达 10-21，再 +7 天）。

另：`curl -s https://www.stayloop.ai/.well-known/mcp/server.json` 应返回上面的 JSON；`scripts/route-audit.mjs` 已带三条 MCP 探针（405 / initialize / tools/list = 7）。

## 8. 协议实现要点（给审核方或接入方看）

- 支持的协议版本：`2026-07-28`、`2025-06-18`、`2025-03-26`（`initialize` 回客户端请求的版本，若不在列表则回最新）。
- 方法：`initialize` · `notifications/initialized`（202 空体）· `ping` · `tools/list` · `tools/call`；批量数组按序处理；其余方法 `-32601`；无效 JSON `-32700`（HTTP 400）。
- `tools/call` 的入参错误与核心函数的 `ApiError`（`invalid_input` / `unsupported_province` / `not_available`）都是 `result.isError:true` + 文本说明，不是协议错误；未知工具 `-32602`。
- 无会话（`Mcp-Session-Id` 忽略）、无 SSE（`Accept` 只要 `text/event-stream` 也回 JSON）、`MCP-Protocol-Version` 原样回显；`Origin` 存在且非 `https://` → 403；`GET` / `DELETE` → 405。
- 限流：`lib/api/v1Limits.ts` 的 `mcp` 行（每 `X-Client-Id` 或 IP 600 / 小时 + 每端点全站 5,000 / 小时，限流器故障时放行）；响应头 `X-RateLimit-Limit`。
- 不记录请求正文、不存入参；租金基准表只读。
