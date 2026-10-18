# T6 · 安全专项（OWASP ASVS L1 子集 + 密钥 + 头 + 限流 + 注入面）· 2026-10-17

风险等级 R1（身份与授权 / 公开 API / 个人信息）。策略 §3 T6、§7。需求来源：CLAUDE.md「全站深度审查（2026-09-14）」「全站复审 2026-09-19」（发邮件的路由都是潜在中继 · 匿名面的成本上限 · 打印报告的同源 HTML 注入）「复审 2026-09-25」（`revoke from public, anon` · FOR ALL 无 WITH CHECK）「PropTx 接入前的结构性改造」（anon 撤权、服务端限流）「V1.0 阶段 5」（限流表 / Origin 校验）「V0.8 第一项」（token 常量时间、防枚举）「Edge Runtime Gotcha」。
执行环境：生产 `https://www.stayloop.ai`；Supabase 生产 `uotcczsfeiptnabamzcd`（只读或 `begin … rollback`）；curl / node 22；脚本与输出在 scratchpad `sitetest1017/T6/`。
**纪律**：只测不改代码；不做 DoS；限流探测每桶最多到阈值 +1 一次，且**只测按用户 / 按 X-Client-Id 计数的桶**——按 IP 计数的桶（匿名 turn、email-status、consumer/request、listings search/detail/enrich、`/api/w`、agent-intake、delegation-peek）与其他测试员共用出口 IP，只读代码核对阈值与 fail-closed；邮件 ≤5 封（都发到测试号邮箱）；`[TEST]` 数据登记在末尾。
JWT：`tenant-test` / `landlord-test` 用密码授权换取（密码从 CLAUDE.md 运行时读取，不写入任何文件）；篡改 JWT = 真 JWT 改签名末字符；过期 JWT = 用 anon key 作 Bearer（role=anon）+ 伪造 `exp` 已过的无签名 token。

## 用例

### ① 认证与会话
| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| T6-01 | R1 | 无 | 91 个 `/api/*` 路由逐个匿名调用：每个声明的方法各一次（无 body / `{}`），未声明方法一次（期望 405）；**跳过** `POST /api/agent/turn`、`POST /api/auth/email-status`、`POST /api/consumer/request`（预算桶）；`POST /api/contact` 只用缺字段 body | 需登录接口 401 / 403；公开接口 200；坏输入 400；未声明方法 405；**任一路由不得 500**；响应带 `x-content-type-options: nosniff` | `scripts/route-audit.mjs` |
| T6-02 | R1 | tenant JWT | 篡改 JWT（签名末字符翻转）调 `/api/threads/participants`、`/api/models/catalog`、`/api/profile/files`（POST 空）、`/api/push/test`、REST `applicant_profiles?select=auth_id` | 全部 401（REST 返回 401 `invalid JWT`）；无 200 | — |
| T6-03 | R1 | 无 | 伪造 `exp` 已过（且无有效签名）的 JWT、anon key 作 Bearer 调同一组接口 | 401（anon key 不是用户：`getUser` 返回 null） | — |
| T6-04 | R1 | tenant JWT | 用 **tenant-test** 的 JWT 调 ≥15 个房东 / 经纪 / 管理员接口：`POST /api/screening/from-application`（landlord 申请 id）、`DELETE /api/screening/<landlord 的 screening>`、`POST /api/deep-check`、`POST /api/screen-score`（空）、`POST /api/work-orders/dispatch`、`POST /api/work-orders/<wo>/act`、`POST /api/work-orders/<wo>/receipt`、`POST /api/lease/send`、`POST /api/delegations`、`GET/POST /api/agent/intake-links`、`GET /api/admin/model-discover`、`GET /api/admin/consumer`、`GET /api/admin/partners`、`POST /api/admin/model-test`、`POST /api/cron/model-discover`、`POST /api/agent/proactive`（无 cron secret）、`POST /api/stripe/portal`、`POST /api/verify/create`、`POST /api/matters/export`（landlord 事务）| 403 / 404 / 400 / 409，**不是 200**，不 500 | `screeningRoleGate` `threeRoleWalkthrough` |

### ② 授权（IDOR）
| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| T6-05 | R1 | tenant JWT | REST（RLS）读他人行：`screenings?id=eq.<landlord>`、`applications?id=eq.<landlord 收到的、非本人邮箱>`、`households?id=eq.2abfd3e7…`（muse）、`threads?id=eq.<muse tenancy thread>`、`thread_messages?thread_id=eq.<同上>`、`work_orders?select=<列清单>&id=eq.<landlord wo>`、`delegations?select=id,status`（他人）、`consumer_requests`、`agent_pending_actions?user_id=eq.<landlord>`、`landlords?auth_id=eq.<landlord>`（计划列）、`trust_api_keys`、`push_subscriptions?user_id=neq.self` | 全部 `[]` 或 401/403（列级：`work_orders.token` 42501） | `hat-probes.sh` |
| T6-06 | R1 | tenant JWT | 路由级 IDOR：`POST /api/threads/export {thread_id:<muse tenancy>}`、`POST /api/threads/attachment-url {path: <landlord household 文件夹>}`、`POST /api/matters/export {matter_id:<landlord 事务>}`、`POST /api/file-url {path: <landlord 收到的申请文件>}`、`POST /api/work-orders/<landlord wo>/receipt`、`POST /api/delegations/<他人>/ {action:revoke}`、`GET /api/threads/participants?thread=<muse>` | 403 / 404；不 200 | `messagingPeople` `node6Export` |
| T6-07 | R1 | 无 | 随机 token 枚举：`/p/<64hex>`、`/api/consumer/request/<64hex>`、`/api/consumer/request/<64hex>/pack`、`/my-file/<64hex>`、`/api/w/<64hex>`、`/api/verify/<64hex>`、`/api/agent-intake/<64hex>`、`GET /api/delegations/confirm?token=<64hex>`、`/join/<64hex>`、`/delegate/<64hex>`、`/intake/<64hex>`、`GET /api/lease/view?token=<64hex>` | 404 / 410 / 200「链接无效」页；响应不含任何他人数据；consumer 路由 `Cache-Control: no-store` | `v08_consumer*` |

### ③ 输入
| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| T6-08 | R1 | 无 | 100 KB body → `POST /api/contact`（蜜罐字段非空以免真发）、`POST /api/v1/listings/compliance`、`POST /api/mcp`、`POST /api/listings/enrich`；非 JSON（`text/plain` 垃圾）→ 同一组 + `/api/file-url`（tenant JWT）；含 `\u0000` 的 JSON → `/api/v1/lease/terms-check`、thread 消息插入（REST） | 400 / 413 / 正常拒绝，不 500；`\u0000` 不落库（22P05 不冒泡成 500） | `jsonSafe` |
| T6-09 | R1 | tenant JWT | XSS / HTML / SQL 片段 `<img src=x onerror=alert(1)>'"; DROP TABLE x;--` 作为 ① thread 消息（tenant 自己的租约对话，REST 插入）② `POST /api/contact` 的 name / message（真发一封，预算 1）③ 申请表 `applications` 匿名插入到 `[TEST] 200 Test QA Lane`（full_name / notes / employer 字段，登记副作用）| 导出 HTML（`POST /api/threads/export format=html`）与 JSON 里片段被 `esc()` 转义（`&lt;img`），无裸 `<img`；SQL 片段原样存储无报错；申请人页 / 证据包渲染经 `esc()`（读代码 `lib/export/*`、`generateReport.ts` 的 `esc` 覆盖） | `node4Threads` |
| T6-10 | R1 | tenant JWT | 路径遍历：`POST /api/file-url {path}` 用 `<uuid>/../screenings/x/y`、`<uuid>/kind/%2e%2e`、`a/b/c/d`、绝对路径；`POST /api/threads/attachment-url {path:'../..'}`；`POST /api/profile/attach {file_ids:[他人]}` | 400 / 403；不签出他人对象 | file-url 注释（2026-09-14） |
| T6-11 | R1 | 代码 | SSRF 读代码：`fetchUrlContent`（turn）对 `http://169.254.169.254`、`localhost`、`0x7f000001`、十进制 IP、`[::1]`、`.internal`；`/api/v1/screen` 的 `files[].url` / `webhook_url`；`/api/listings/enrich` 的 id；Email Worker 入站；`/api/threads/inbound` | turn 全部拦截；v1/screen 当前 503 关闭（记录：无私网校验、`redirect:'follow'`）；enrich 只收 uuid | — |

### ④ 头
| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| T6-12 | R1 | 无 | `curl -sI` 于 `/`、`/pricing`、`/listings`、`/api/public/stats`、`/api/v1/rules`、`/api/mcp`（POST）、`/verify/x`、`/intake/x`、`/my-file/x`、`/p/x`、`/_next/static/…`、404 页、308 跳转 | HSTS `max-age=31536000; includeSubDomains`；XFO DENY；nosniff；Permissions-Policy `camera=(), microphone=(self), geolocation=(self)`；Referrer-Policy：token 页 `no-referrer`、其余 `strict-origin-when-cross-origin`；CSP：记录有无（设计上无）；`server: cloudflare` | `route-audit` HDR |
| T6-13 | R1 | 无 | CORS：`OPTIONS /api/v1/rules`（Origin evil）→ `*`；`OPTIONS /api/mcp`；`OPTIONS /api/file-url`、`/api/threads/export`、`/api/listings/search`、`/api/public/stats`（Origin evil）| 只有第一档与 MCP 返回 `access-control-allow-origin: *`；其余无 ACAO（或 405）；无 `access-control-allow-credentials: true` 与 `*` 同现 | `v1stage5_restApi` |

### ⑤ 限流
| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| T6-14 | R1 | 无 | `/api/v1/guideline` 带唯一 `X-Client-Id`（`t6-<ts>`）连发 301 次 | 前 300 次 200，第 301 次 429 + `Retry-After`；错误体 `{error:'rate_limited'}` | `v1stage5_restApi` |
| T6-15 | R1 | tenant JWT | `POST /api/push/test` 6 次（该号可能无订阅：响应 200/404 都算计数）| 第 6 次 429 | — |
| T6-16 | R1 | tenant JWT | `POST /api/legal/terms-confirmation` 4 次（每版本只发一次邮件，后续不发）| 第 4 次 429（`Retry-After: 3600`）；邮件最多 1 封 | — |
| T6-17 | R1 | tenant JWT | `POST /api/threads/export {thread_id:自己的, format:'json'}` 31 次 | 第 31 次 429 | — |
| T6-18 | R1 | 代码 | 只读核对：匿名 turn 15/IP + 600/站（fail-open 成本型）；email-status 30/IP + 1500/站（fail-closed）；consumer/request 5/IP + 3/邮箱（fail-closed，超限仍返回 200 防枚举）；`/api/w` 120/IP 读 fail-open · 40/IP 动作 fail-closed；agent-intake 10/IP；listings search 240 匿名 / 1200 登录（fail-open）；发信类全部 fail-closed | 与 CLAUDE.md 一致；发信类 `failOpen=false` | — |

### ⑥ 密钥
| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| T6-19 | R1 | 仓库 | `git grep -nE "sk_(live|test)_|re_[A-Za-z0-9]{20}|eyJhbGciOi|GOCSPX-|AKIA|whsec_|sk-ant-|jina_"` 于 HEAD；`git log -p` 抽查 `.env`；`.gitignore` 含 `.env*.local` `.forensics-tmp` | 仅 `.env.example` 占位符 / 测试夹具 / 文档里的掩码；无真实密钥 | — |
| T6-20 | R1 | 构建产物 | `.vercel/output/static` 与 `public/` 全文 grep：`eyJhbGciOi` 取出每个 JWT 解码 `role`；`sk_live` `whsec_` `re_` `GOCSPX-` `sk-ant-` `SUPABASE_SERVICE_ROLE`；`_worker.js` 里 `process.env.SUPABASE_SERVICE_ROLE_KEY` 应是引用不是字面量 | 只有 `role: anon` 的 JWT 与 `NEXT_PUBLIC_*`；无 service_role、无 Stripe secret、无 VAPID 私钥 | — |

### ⑦ 第三方
| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| T6-21 | R1 | MCP | `get_advisors(security)` | 记录全部；ERROR 只有已知刻意的 definer 视图（`agent_directory` 等 5 个）；新增 ERROR = 缺陷 | CLAUDE.md「复审 2026-09-25」记录不改 |
| T6-22 | R2 | 仓库 | `npm audit --omit=dev --json` | 高危 / 严重计数；逐条判断是否在运行时路径 | — |
| T6-23 | R2 | 无 | Cloudflare：响应 `server`、`cf-cache-status`、`cf-ray`；`report-to` / `nel`；HTTP → HTTPS 301/308 | 记录 | — |

### ⑧ 业务逻辑
| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| T6-24 | R1 | SQL 回滚 | `set local role authenticated; set local request.jwt.claims` = landlord-test：`update landlords set plan='pro', pro_trial_until=now()+'1 year', unlock_credits=99 where auth_id=…`；`update screenings set unlocked_at=now()`；`update listings set verification_status='verified', source='realtor', is_test=false`；`update households set verified=true`；`update lease_documents set status='signed_both'`；`update rent_payments set status='paid'`（直写）；`update work_orders set status='paid'`；`insert into thread_messages` 伪造 `sender_id`；`update thread_messages`；`delete from thread_messages` | 守卫触发器把值还原 / 拒绝（42501 / 自定义异常）；`rent_payments` 直写被拒；回滚 | `reviewGuards` `sweep20261001_*` |
| T6-25 | R1 | tenant / landlord JWT | 申请自家房源：以 landlord-test 的 JWT 向自己房源插 `applications` / `showing_intents` | 触发器 `own_listing` 拒绝 | `activeRole` 跨帽子守卫 |
| T6-26 | R1 | tenant JWT | 待批卡伪造：tenant-test 用 RLS 插一张 `agent_pending_actions {action_type:'accept_completion', metadata:{work_order_id:<landlord wo>}}` → `POST /api/agent/execute {action_id}` | 服务端按 `actorId === wo.landlord_auth_id` 拒绝（403 / 409 / expired），工单状态不变；随后把卡 reject 清理 | `marketplace` E2E 复审 |
| T6-27 | R1 | service role（admin API）| `POST /auth/v1/admin/generate_link?redirect_to=https://evil.example/` for tenant-test；`GET <URL>/auth/v1/verify?token=bad&type=magiclink&redirect_to=https://evil.example/` | `action_link` 的 `redirect_to` 被改回站点地址 / 回调页；verify 的 Location host 不是 evil.example | — |
| T6-28 | R1 | 无 | Supabase REST 匿名：`listings?select=*`、`profiles`、`agent_profiles`、`agent_directory`（视图）、`provider_directory`、`rent_benchmarks`、`ltb_orders`、`ca_corp_registry`、RPC `search_ltb_orders`、`my_hats`、`public_stats`、`auth_email_status`、`lookup_corp_by_bn` | listings 42501（10-11 撤权）；目录视图只有公开列；RPC 对 anon 全部 42501 | `function_public_execute` |

### ⑨ 隐私
| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| T6-29 | R1 | tenant / landlord JWT | 导出：`POST /api/threads/export`（html + json）自己的租约对话、工单对话；`POST /api/matters/export`（landlord）；消费者披露包 `GET /api/consumer/request/<token>/pack`（tenant-test 已 fulfilled 的请求，token 从库读）| 不含他人邮箱（`@` 只允许自己的 / `@stayloop.ai` 中转）、无 IP 明文、无密钥 / JWT / service role；thread JSON 不含 `token` 字段 | `node6Export` `messagingPeople` |
| T6-30 | R1 | 代码 | `thread_inbound` 原件 / `message_deliveries` 是否进导出；错误响应是否回显堆栈（抽 5 个 500 路径看 body）| 不含堆栈 / SQL 文本 | — |


## 执行记录（2026-10-18 03:30–03:50 UTC · 生产）

脚本与原始输出：scratchpad `sitetest1017/T6/`（`anon-probe.mjs` + `anon-probe.out`（208 次匿名调用逐条状态）、`rl14.mjs/out`、`export.html/json`、`matter-*.html`、`pack.html`、`audit.json`）。JWT 用密码授权换取；期间 tenant-test / landlord-test 的会话各被作废过一次（`auth/v1/user` 403 `session_not_found`，应是其他测试员在浏览器里退出登录触发全局注销），重新换取后继续。

| ID | 实际 | 证据 | 结果 | 缺陷 |
|---|---|---|---|---|
| T6-01 | 91 路由 × 声明方法 + 一次未声明 PUT = 208 次匿名调用：401 ×56 · 405 ×102 · 400 ×13 · 404 ×17 · 200 ×9（公开接口）· 204 ×9（OPTIONS）· 403 ×1（threads/inbound）· 503 ×1（`/api/v1/screen` 第三档关闭）；**5xx = 0**；全部响应带 `nosniff`；跳过三个预算桶的 POST | `anon-probe.out` | 通过 | — |
| T6-02 | 篡改签名的 JWT → 5 个路由 401；REST `PGRST301 No suitable key` 401 | 命令输出 | 通过 | — |
| T6-03 | 伪造 `exp` 已过的无签名 JWT、anon key 作 Bearer → 路由全部 401；REST `applicant_profiles` 42501 | 同上 | 通过 | — |
| T6-04 | tenant-test JWT 调 33 个房东 / 经纪 / 管理员 / cron 接口：404 / 403 / 409 / 400 / 401，`agent/proactive` 200 `not_a_landlord`（无副作用）、`agent/intake-links` GET 200 空列表（本人数据）；**例外：`POST /api/stripe/checkout` 空 body → 200 并返回 live Checkout URL，同时经 `claim_landlord` 给 tenant-test 建了 landlords 行**（`4161c2c8…`，03:31:24Z，审计 `hat_activated via postgres by_self`，触发器附带 30 天 Pro 试用 + 1 个额度） | 命令输出 + SQL | **失败 1 条** | T6-D1 |
| T6-05 | tenant JWT REST 读他人行：screenings / applications / households / threads / thread_messages / delegations / agent_pending_actions / landlords / trust_api_keys / push_subscriptions / agent_profiles / service_providers / user_memories / agent_threads / agent_audit_events / verification_requests / assistant_profiles / applicant_profiles / agent_intake_links → `[]`；列级 42501：`work_orders.token` `work_orders.external_email` `delegations.confirm_token` `consumer_requests` `household_invites` `thread_reply_tokens`；能读到的 `work_orders cc8e5f9e`（本人 household 的工单，正当）、`rent_payments`（本人租约）、`passport_share_tokens`（本人）；**`lease_documents.sign_token` 对 authenticated 有表级 SELECT，RLS 下房东 JWT 读自己租约即得到租客的签署 token（64 hex）**，而 `/api/lease/sign` 的 token 模式只要 `{token, name}` 不校验签署人身份 | 命令输出 + `role_column_grants` 查询 | **失败 1 条** | T6-D2 |
| T6-06 | 路由级 IDOR：threads/export（muse 对话）403 `not_a_party`、matters/export 403 `not_a_party`、file-url 403、threads/participants 400、attachment-url 400、delegations/<他人> 403、work-orders/<他人>/act 409 `not_your_action`、receipt 409；`threads/export` 对工单对话 `3c1f0531` 200 = 该工单属于 tenant-test 所在 household 1c9abb72（当事人，正当） | 命令输出 | 通过 | — |
| T6-07 | 14 个随机 64-hex token：API 全部 404（consumer 路由 `no-store` + `no-referrer`）；页面 `/p` 「已失效」、`/my-file` `/join` `/delegate` `/intake` `/w` `/verify` 200 空壳页（无数据） | 命令输出 | 通过 | — |
| T6-08 | 100 KB body：contact 200（蜜罐吞掉）/ compliance 400 / mcp 200（工具 isError）/ enrich 400；非 JSON：contact 400 / v1 rules POST 405 / mcp 400 / file-url 400 / export 400；`\u0000`：terms-check 200、thread_messages 直插 **400 22P05**（Postgres 原话回给客户端，但不落库、不 500）；坏日期 400；search 怪参数 200 | 命令输出 | 通过（22P05 文案记 S3） | T6-D7 |
| T6-09 | ① XSS/SQL 片段写进 tenant 自己的租约对话（`thread_messages id=57`）→ HTML 导出 `&lt;img src=x` ×1、裸 `<img` ×0、裸 `<script>` ×0、`DROP TABLE` 原样作文本；JSON 原样；事务导出同样转义；② `/api/contact` 真发一封（`lib/contact.ts` 全部 `escapeHtml`）；③ 申请表注入未做（预算与他组数据冲突，改读代码：申请人页 React 渲染、证据包 `esc()` 86 处，`lib/export/threadRecord.ts` 只拼数据不出 HTML） | `export.html` | 通过 | — |
| T6-10 | file-url：`../`、`%2e%2e`、`..%2f`、4 段、绝对路径 → 400 `invalid path`；attachment-url 四种 → 400；profile/attach 他人 file_ids → 409 `application_too_old`（未到文件校验即拒） | 命令输出 | 通过 | — |
| T6-11 | 代码：`fetchUrlContent` 拦 localhost / 127 / 10 / 172.16–31 / 192.168 / 169.254 / 100.64 / 0.0.0.0 / `.internal` / `[::1]` / 十进制 & 十六进制 & 前导零 IP / 非 http(s)；`/api/listings/enrich` 只收 uuid；**`/api/v1/screen` 对 `files[].url` 用 `fetch(url,{redirect:'follow'})`、`webhook_url` 只校验 `https://` 前缀，都没有私网 / 重定向校验**（第三档当前 503 关闭，合作方密钥才可达；Workers 出口不在私网）| 代码 | 通过（记 S3） | T6-D8 |
| T6-12 | 全部路径：HSTS `max-age=31536000; includeSubDomains`、XFO DENY、nosniff、Permissions-Policy `camera=(), microphone=(self), geolocation=(self)`；Referrer-Policy：`/verify` `/intake` `/my-file` `no-referrer`，其余 `strict-origin-when-cross-origin`；CSP 无（设计如此）；静态资源 immutable；HTTP→HTTPS 301；308 跳转也带头；**HTML 页面（`/` `/pricing` `/listings` 404 页）带 `access-control-allow-origin: *`**（Pages 平台 / `_headers` 之外来源，API 路由没有） | `curl -sI` | 通过（记 S3） | T6-D9 |
| T6-13 | `OPTIONS /api/v1/rules` 与 `/api/mcp` → `*` + 方法 / 头白名单；file-url / threads/export / listings/search / public/stats / consumer/request / contact 的 OPTIONS 204 无 ACAO；MCP 对 `Origin: http://` 403 | 命令输出 | 通过 | — |
| T6-14 | `/api/v1/guideline` 唯一 X-Client-Id 连发 301：200 ×300，第 301 次 429 `Retry-After: 3600` `{error:'rate_limited',retry_after:3600}` | `rl14.out` | 通过 | — |
| T6-15 | push/test：200 ×4，第 5 次起 429（阈值 5；本小时内另有 1 次计数来源不明，可能是其他测试员） | 命令输出 | 通过 | — |
| T6-16 | terms-confirmation ×4：全部 200 `already:true`，不发邮件、不到限流（限流在「已发过」判断之后，无成本） | 命令输出 | 通过 | — |
| T6-17 | threads/export：含 T6-06 的 2 次共 30 次 200，第 31 次起 429 | 命令输出 | 通过 | — |
| T6-18 | 代码：匿名 turn 15/IP（`bump_anon_rate_limit` service role）+ 600/站 fail-open；email-status 30/IP + 1500/站 fail-closed；consumer/request 5/IP + 3/邮箱 fail-closed 且超限仍 200；`/api/w` 120 读 fail-open / 40 动作 fail-closed；agent-intake 10/IP 在 token 格式校验之后、查库之前；listings search 240/1200 fail-open；发信类（verify-create / lease-send / agent-execute / wo-dispatch / ticket-notify / delegations / push-test / terms-confirm / rent-evidence / profile-files / thread-upload / thread-export / matter-export）全部 fail-closed | `grep underHourlyLimit` 清单 | 通过 | — |
| T6-19 | `git grep` HEAD 只命中 `jina_unparseable_` 字符串与 CLAUDE.md 掩码说明；`.gitignore` 含 `.env*` 与 `.forensics-tmp/`；历史里只提交过 `.env.example` | 命令输出 | 通过 | — |
| T6-20 | `.vercel/output/static` + `public/`：唯一 JWT 字面量 role=`anon`（含 `_worker.js` 里 `SUPABASE_SERVICE_ROLE_KEY||"eyJ…"` 的回退 = `NEXT_PUBLIC_SUPABASE_ANON_KEY`，源 `app/api/mcp/route.ts:37`）；无 sk_live / whsec_ / GOCSPX- / sk-ant- / 私钥；service role 全是 `process.env` 引用；内联的 NEXT_PUBLIC 只有 `GOOGLE_MAPS_KEY`（Maps key 本来就是浏览器用） | 命令输出 | 通过 | — |
| T6-21 | advisors security：ERROR 5 = 已知刻意的 definer 视图（`agent_directory` `provider_directory` `provider_credentials_public` `applicant_applications` `my_showing_intents`）；WARN：anon 可执行 11 个 definer 函数（布尔 / 计数 / 邀请 peek·decline / attach_application_files，实测 anon 调用只回 false / 0）、authenticated 可执行 59 个（`admin_*` 内部自检：tenant 调 `admin_add_member` / `admin_delete_user` / `admin_remove_member` → `not_superadmin`，`admin_platform_stats` → forbidden，`admin_ai_usage_stats` 42501，`admin_lifecycle_stats` P0001；`settle_referral_commission` → referral not found；`mark_rent_paid` 他人租约 42501；`consume_unlock_credit` 他人 false）；INFO 22 张 RLS 无策略表（service role 专用）；pg_trgm / pg_net 在 public；**`search_corp_registry('maple',0.9)` 以普通用户身份跑出 8 s 语句超时 500**（76 万行 trigram，任何登录用户可随时触发） | `get_advisors` + 命令输出 | 通过（记 S3） | T6-D10 |
| T6-22 | `npm audit --omit=dev`：critical 1（**next 15.5.2**：React flight 协议 RCE + Server Actions 源码泄露，修复版 15.5.28）、high 4（nanoid / postcss / sharp / source-map-js，均间接依赖，随 next 升级）、moderate 1 | `audit.json` | **失败 1 条** | T6-D3 |
| T6-23 | `server: cloudflare`、`cf-cache-status: DYNAMIC`、NEL / report-to 存在；HTTP 301 → HTTPS；Cloudflare 邮箱混淆脚本被注入进 `/api/consumer/…/pack` 与 `/api/matters/export` 的 HTML（见 T6-29） | `curl -sI` | 通过 | — |
| T6-24 | 回滚事务（`set local role authenticated` + claims）：landlords `plan/pro_trial_until/unlock_credits/stripe_customer_id` 直写 → 原值（free / 11-15 / 1 / null）；screenings `unlocked_at` → null；listings `verification_status/source/display_internet/feed_source/realtor_check/price_history/lat` → 原值，**`is_test` 可被房东直写成 true**；households `verified/monthly_rent/address` → 原值；lease_documents `status/tenant_signature/sign_token` → 原值；rent_payments 直 UPDATE 0 行；thread_messages UPDATE / DELETE → 42501，伪造 `sender_id/sender_kind/created_at/channel/hash` 的 INSERT 全部被触发器改回服务器值 | execute_sql 输出 | 通过（`is_test` 记 S3） | T6-D11 |
| T6-25 | landlord-test JWT 向自家房源插 applications / showing_intents → `P0001 own_listing` | 命令输出 | 通过 | — |
| T6-26 | tenant 用 RLS 插一张 `accept_completion` 卡（`3247cb25…`，metadata 指向 landlord 的工单 `963e805b` scheduled）→ `decide_pending_action` approved → `POST /api/agent/execute` → **409 `work_order_moved_on` / `not_from_scheduled`，卡置 expired，工单仍 scheduled**（服务端按工单状态与 `landlord_auth_id` 重核，不信卡片） | 命令输出 + SQL | 通过 | — |
| T6-27 | `generate_link?redirect_to=https://evil.example/` → `redirect_to` 被改回 `https://www.stayloop.ai`；`auth/v1/verify` 坏 token + evil → 303 到 `https://www.stayloop.ai/#error=…`；白名单回调作对照正常；Google authorize 只把 redirect_to 塞进自己的 state / 参数，回调时仍校验 | 命令输出 | 通过 | — |
| T6-28 | anon REST：listings 42501、applications 42501、ltb_orders 42501、neighborhood_profiles 42501、provider_directory 42501；`agent_directory` 200（公开目录，含 `auth_id`）、`rent_benchmarks` 200（开放数据）、`trreb_rent_stats` 200（保留表，1 行泄露无害）、`ca_corp_registry` / `households` / `model_catalog` 200 `[]`（表级 grant 在、RLS 挡）；RPC：search_ltb_orders / auth_email_status / lookup_corp_by_bn / portal_relay_get 404（无执行权）、my_hats / public_stats / my_matters / provider_job_context 401；storage 四个桶匿名 list / public get 400；tenant JWT 列他人前缀 `[]` | 命令输出 | 通过 | — |
| T6-29 | 对话 HTML / JSON 导出：无邮箱、无 IP、无 token / key 字段，哈希链 `verification.ok=true`；事务导出三份：无 IP / JWT / 分数，唯一邮箱是房东自己录入的外部联系人（`external_email=…`，本人数据）；**消费者披露包 `pack.html`（给申请人）含 `landlord-test@stayloop.ai`——房东的登录邮箱**（CRA s.12 要求告知接收方名称，邮箱超出必要）；披露包与事务导出被 Cloudflare 注入了 `email-decode.min.js`（纯 grep 看不到邮箱，要解 `data-cfemail`） | `pack.html` 解码 | 通过（记 S3） | T6-D5 |
| T6-30 | 本轮没有任何路由 500；`search_corp_registry` 超时经 PostgREST 回 `57014 canceling statement due to statement timeout`（Postgres 原话，无堆栈）；`thread_messages` NUL 回 `22P05` 原话；错误体均无堆栈 / SQL 文本 / 密钥；`thread_inbound` 原件与 `message_deliveries` 不进任何导出 | 命令输出 + 代码 | 通过 | — |

**补充核对**：`/api/notify-landlord` 匿名可调但按 `applications.notified_at` 单发、收件人固定为房源房东（不是中继）；`/api/threads/inbound` 与 cron 密钥都是常量时间比较；consumer token 查库后 `constantTimeEqual`；`bump_agent_rate_limit(p_limit)` authenticated 可自填上限（只影响自己的计数，无法绕过服务端自己传的限值）。

## 缺陷

| 编号 | 严重度 / 优先级 | 一句话 | 复现 |
|---|---|---|---|
| **T6-D1** | **S2 / P1** | 任何登录账号对 `POST /api/stripe/checkout` 发一个空 body，就会被 `claim_landlord` 自愈成房东身份（landlords 行 + 30 天 Pro 试用 + 1 个解锁额度 + `hat_activated` 审计），并拿到一个 live Checkout 会话；09-24 决定「页面加载永不 claim、只有明确动作才开通」，但这个接口不要求任何确认字段或已有房东行 | `curl -X POST https://www.stayloop.ai/api/stripe/checkout -H "authorization: Bearer <租客 JWT>" -H 'content-type: application/json' -d '{}'` → 200 `{url:"https://checkout.stripe.com/…"}`；`select * from landlords where auth_id=<租客>` 多了一行。**本次已在 tenant-test 上真实发生（`4161c2c8-6f03-4f8c-85bd-66be7cdbfe7c`，2026-10-18 03:31:24Z），需主线程用 service role 删除并连带 `hat_activated` 审计行 `87e60f99…`** |
| **T6-D2** | **S1 / P0** | 房东能读到租客的签署 token 并替租客签字：`lease_documents.sign_token` 对 authenticated 有列级 SELECT，房东 RLS 读自己的租约行即得 64-hex token；`/api/lease/sign` 的 token 模式只要 `{token, name}`，不校验签署人（租客）身份 → 房东可伪造租客签名，走到 `signed_both`、自动建 household、首月账期 | ① 房东 JWT：`GET <SUPABASE>/rest/v1/lease_documents?select=id,sign_token&landlord_id=eq.<landlords.id>` → 返回 token（实测 `71e674a0…` 64 位）；② 匿名 `POST /api/lease/sign {"token":"<该 token>","name":"任意"}`（本次对已签 `signed_both` 的租约只回 `{ok:true,already:true}`，未签租约会落 `tenant_signature`）。修法同 `work_orders.token`：`revoke select (sign_token) on lease_documents from authenticated, anon`，签署路由保持 service role 查 token；或 sign 路由要求 JWT 邮箱 = `tenant_email` |
| **T6-D3** | **S1 / P1** | 生产依赖 `next@15.5.2` 带 critical 公告（React flight 协议 RCE、Server Actions 源码泄露），`npm audit` 给出不跨大版本的修复 15.5.28；另 4 个 high（nanoid / postcss / sharp / source-map-js）随之修复 | `npm audit --omit=dev --json` → `critical:1 high:4`；升级前先在 next-on-pages 上验证构建（Edge runtime） |
| T6-D5 | S3 / P2 | 消费者披露包把房东的登录邮箱写进申请人可见的 HTML（CRA s.12 只要求接收方「名称」） | `GET /api/consumer/request/<token>/pack` → 解 `data-cfemail` 得 `landlord-test@stayloop.ai` |
| T6-D7 | S3 / P3 | 直插含 `\u0000` 的对话消息时把 Postgres 原话 `unsupported Unicode escape sequence` 回给客户端（界面走 `stripNul`，这是 REST 直写路径） | `POST /rest/v1/thread_messages {"body":"a\u0000b"}` → 400 22P05 |
| T6-D8 | S3 / P3 | `/api/v1/screen`（第三档，当前关闭）抓取合作方 `files[].url` 与回调 `webhook_url` 没有私网 / 重定向校验，与 turn 路由的 `fetchUrlContent` 不一致；开放第三档前要补 | 代码 `app/api/v1/screen/route.ts:66,86` |
| T6-D9 | S3 / P3 | HTML 页面响应带 `access-control-allow-origin: *`（API 路由没有；无 credentials 所以无实际泄露，但没必要） | `curl -sI https://www.stayloop.ai/` |
| T6-D10 | S3 / P2 | `search_corp_registry` 对所有登录用户开放且无限流，低相似度阈值即 8 s 语句超时（76 万行 trigram），可被用来耗数据库 CPU（Micro 2 核） | tenant JWT `POST /rest/v1/rpc/search_corp_registry {"q":"maple","min_sim":0.9}` → 500 57014 |
| T6-D11 | S3 / P3 | 房东可直写自己房源的 `is_test=true`（只影响统计与「测试房源」标签，自损） | 回滚事务 `update listings set is_test=true` 生效 |

未执行 / 改为代码核对：按 IP 计数的桶（匿名 turn、email-status、consumer/request、listings search / detail / enrich、`/api/w`、agent-intake、delegation-peek）因与其他测试员共用出口 IP 未打到阈值；MCP 600/IP 同理；申请表字段注入（他组正在用 `[TEST] 200 Test QA Lane`）改读代码。

## 越界发现
- `agent_directory` 公开视图对匿名暴露经纪的 `auth_id`（已知 definer 视图；auth id 不是密钥，但目录只需 RECO 号与名字）。
- 口令授权换来的会话在测试中被两次作废（`session_not_found`）——其他测试员在浏览器里对同一测试号退出登录会把全局会话一起注销，多人共用测试号时要留意。
- `agent_pending_actions` 对本人 INSERT 完全开放（任何 action_type / metadata），服务端执行器确实不信卡片，但待办页会显示这些伪造卡（本次留下一张 expired 的 `[TEST][T6] forged accept_completion`）。

## 数据副作用（全部 `[TEST]`，正式发布前清理）
| 对象 | 内容 | 处置建议 |
|---|---|---|
| `landlords` 行 `4161c2c8-6f03-4f8c-85bd-66be7cdbfe7c`（auth tenant-test） | T6-D1 探针意外开通的房东身份（plan free、试用到 11-14、unlock_credits 1）+ 审计 `agent_audit_events 87e60f99-b8e1-47de-aa53-9add78293872`（`hat_activated`） | **请主线程用 service role 删除**（会影响 A+K 组「tenant-test 无房东帽子」的用例） |
| Stripe live Checkout 会话 `cs_live_b19FFpw4…`（tenant-test，无 customer） | 未付款，24 小时自动过期 | 无需处理 |
| `agent_pending_actions 3247cb25-0f38-4e5e-b6a3-5257810a3e1f`（tenant-test） | `[TEST][T6] forged accept_completion`，status expired | 可删 |
| `thread_messages id=57`（租约对话 `6eca91f3…`） | `[TEST][T6-xss] <img src=x onerror=alert(1)> …`（只追加表，不可删） | 保留，哈希链已包含 |
| `agent_audit_events` | tenant-test：`push_test` ×4、`thread_export_generated` ×30+、`application_file_*` 若干；landlord-test：`matter_export_generated` ×3、`thread_export_generated` ×2；`decide_pending_action` 审批事件 1 | 保留 |
| 邮件 | `/api/contact` 1 封（hello@stayloop.ai，`[TEST][T6]` 标题）；push/test 推送 4 次到 tenant-test 设备 | 无需处理 |
| 限流桶 | tenant-test 的 `push-test` `thread-export` 本小时已满；`v1:guideline:cid:t6-1792294660991` 300/300 | 一小时后自动清零 |
