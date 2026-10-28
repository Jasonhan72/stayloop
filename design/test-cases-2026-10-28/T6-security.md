# T6 · 安全专项（R1）· 2026-10-28

测试员：① 身份组。基线 `design/test-cases-2026-10-17/T6-security.md`（30 条，本轮按任务范围跑头 / CORS / REST 权限 / RPC / 密钥出包 / 依赖 / advisors，并复测上轮 T6-D1 · D2 · D3 · D9；其余 R1 条目在 L / T4 组或按 10-17 结果保留）。新内容：10-19 OpenNext Worker 迁移（头 / 缓存 / 跳转）、10-23 `proxy.ts`、10-27 知识库三张表与三个 RPC。
纪律：只测不改代码；不做 DoS；不碰按 IP 计数的限流桶；service role 只经 `mint.sh`；anon key 与 JWT 只经临时 header 文件。
脚本与输出（`AKMT/` = `/private/tmp/claude-502/-Users-neos-Documents-Claude-Projects-stayloop/774bb32e-4eb9-4cc0-8534-64d0bb942907/scratchpad/sitetest1028/AKMT/`）：`hdr.sh → hdr.out`、`cors.sh → cors.out`、`anonrest.sh → anonrest.out`、`jwtprobe.sh → jwtprobe.out`、`chunks/`（首页 / 定价 / 登录页引用的 18 个 JS chunk）、`audit.json`。

## 用例

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| T6-12 | R1 | 无 | `curl -D -` 于 `/` `/pricing` `/listings` `/api/public/stats` `/api/v1/rules` `/api/kb/notices` `/admin` `/admin/knowledge` `/agents` 404 页、8 个 token 页前缀 | HSTS `max-age=31536000; includeSubDomains`；XFO DENY；nosniff；Permissions-Policy `camera=(), microphone=(self), geolocation=(self)`；Referrer-Policy：8 个 token 页 `no-referrer`、其余 `strict-origin-when-cross-origin`；无 `x-powered-by` | `route-audit` HDR |
| T6-12b | R1 | 无 | 跳转：apex → www、`screening.` 子域 → `/screening`、`/landlord/messages` → `/messages`；**HTTP 明文 → HTTPS** | 308 + 头；HTTP 301/308 到 https | 同上 |
| T6-13 | R1 | 无 | CORS：`OPTIONS`（Origin evil）于 `/api/v1/rules` `/api/v1/guideline` `/api/mcp` 与 `/api/file-url` `/api/threads/export` `/api/listings/search` `/api/public/stats` `/api/kb/notices` `/api/admin/knowledge` `/api/stripe/checkout` `/api/auth/email-status`；`GET /api/v1/rules`、`POST /api/mcp initialize` | 只有 `/api/v1/*` 与 `/api/mcp` 回 `*` + 方法 / 头白名单；其余 ACAO = `https://www.stayloop.ai`（复测 T6-D9）；无 credentials 与 `*` 同现 | `v1stage5_restApi` |
| T6-28 | R1 | anon key | REST：`listings`（`select=id` 与 `*`）、`knowledge_sources / documents / chunks / changes` 读写、`landlords` `admin_users`；RPC `kb_search`（带参）`kb_source_status` `kb_pending_rule_notices` `my_hats` `public_stats` `is_stayloop_admin` `admin_platform_stats` | listings 42501；knowledge_* 四表读写 42501；`kb_search` `kb_source_status` 42501；`kb_pending_rule_notices` 200 `[]`；`is_stayloop_admin` false | `function_public_execute` |
| T6-31 | R1 | tenant / landlord / admin JWT | 同一组 REST / RPC 以登录身份 | knowledge_sources / documents / chunks 读写 42501；knowledge_changes 读 `[]`（RLS）、INSERT 42501、UPDATE 非白名单列 42501；`kb_search` 42501；`kb_source_status` **期望非管理员拒绝** | — |
| T6-02/03 | R1 | 篡改 JWT · anon key 作 Bearer | `/api/admin/knowledge` `/api/stripe/checkout` `/api/models/catalog`、REST | 401（或 405 未声明方法）；REST `PGRST301` | — |
| T6-04' | R1 | tenant / admin-test JWT | `POST /api/stripe/checkout {}`、`/unlock {}`（复测 T6-D1） | 403 `landlord_required`；不建 landlords 行 | `siteTest20261018_s0s1` |
| T6-20 | R1 | 生产包 | 抓 `/` `/pricing` `/login` 引用的全部 `_next/static/*.js` + HTML：grep `sk_live|sk_test|whsec_|SUPABASE_SERVICE_ROLE|service_role|GOCSPX-|sk-ant-|re_…|VAPID_PRIVATE`；所有 JWT 字面量解码 `role` | 零命中；JWT 只有 `role: anon`；Supabase 地址只有 `auth.stayloop.ai` | `opennext-env-guard` |
| T6-19 | R1 | 仓库 | `git grep` HEAD 真实密钥模式；`.gitignore` | 零命中；`.env*` `.forensics-tmp/` 在 ignore | — |
| T6-21 | R1 | MCP | `get_advisors(security)` | ERROR 只有已知 5 个 definer 视图；anon 可执行 definer 函数清单只多 `kb_pending_rule_notices`（刻意） | — |
| T6-22 | R2 | 仓库 | `npm audit --omit=dev --json`（复测 T6-D3） | next 16.4.2 无 critical；记录剩余 high | — |
| T6-27 | R1 | service role（mint.sh） | `generate_link redirect_to=https://evil.example/` | 回退到站点地址 | — |

## 执行记录（2026-10-28 14:28–14:55 ET · 生产）

| ID | 实际 | 证据 | 结果 | 缺陷 |
|---|---|---|---|---|
| T6-12 | 18 个路径全部：HSTS `max-age=31536000; includeSubDomains`、`x-frame-options: DENY`、`x-content-type-options: nosniff`、`permissions-policy: camera=(), microphone=(self), geolocation=(self)`、`server: cloudflare`、无 `x-powered-by`；Referrer-Policy：`/verify/ /intake/ /my-file/ /p/ /w/ /lease/sign/ /join/ /delegate/` 八个都 **`no-referrer`**（上轮 G-D3 已修），其余 `strict-origin-when-cross-origin`；token 页与 404 `cache-control: private, no-cache, no-store`；HTML 页 ACAO = `https://www.stayloop.ai`（**T6-D9 已修**）；`/api/v1/rules` `no-store` + ACAO `*`；识别标记 `x-nextjs-cache: MISS`（Worker）；预渲染 HTML `cache-control: s-maxage=31536000`（10-19 已知遗留，zone 不缓存 Worker 输出） | `AKMT/hdr.out` | 通过 | |
| T6-12b | `https://stayloop.ai/pricing` → 308 `https://www.stayloop.ai/pricing` + HSTS；`https://screening.stayloop.ai/abc` → 308 `/screening`；`/landlord/messages` → 308 `/messages`；**`http://www.stayloop.ai/` → 200 整页 HTML（70 KB）、`http://www.stayloop.ai/login` → 200（22 KB）、`http://www.stayloop.ai/api/v1/rules` → 200；`http://stayloop.ai/` → 308 `http://www.stayloop.ai/`（仍是 http）**。对照 `http://stayloop.pages.dev/` → 301（Pages 平台自带跳转）；上轮 10-17（Pages 时代）记录是「HTTP 301 → HTTPS」 | `AKMT/hdr.out` 末段 + 终端 `curl -D -` | **失败** | **T6-D12** |
| T6-13 | `OPTIONS /api/v1/rules` `/api/v1/guideline` → 204 `*` + `GET,POST,OPTIONS` + `content-type,x-client-id,x-api-key`；`/api/mcp` → 204 `*` + `POST,OPTIONS` + mcp 头；其余 8 个路由 OPTIONS 204 且 ACAO = `https://www.stayloop.ai`（无 `*`、无 credentials）；`GET /api/v1/rules`（Origin evil）200 `*`；`GET /api/v1/guideline?year=2026` 400 `invalid_input`（要 `effective`）+ `x-ratelimit-limit: 300`；`POST /api/mcp initialize` 200 JSON + `*` | `AKMT/cors.out` | 通过 | |
| T6-28 | anon REST：`listings?select=id` **42501**、`select=*` 42501；`knowledge_sources / documents / chunks / changes` GET 42501；POST `knowledge_sources` 42501、POST `knowledge_chunks` 42501、PATCH `knowledge_changes` 42501（POST `knowledge_changes` 用错列名先得 PGRST204 400，列名正确时登录身份下为 42501，见 T6-31）；`landlords` `admin_users` 200 `[]`（表级 grant 在、RLS 挡，同上轮）；RPC `kb_search`（带参）42501、`kb_source_status` 42501、`my_hats` 42501、`public_stats` 42501、`admin_platform_stats` 42501、`kb_pending_rule_notices` 200 `[]`、`is_stayloop_admin` 200 `false` | `AKMT/anonrest.out`、`jwtprobe.out` | 通过 | |
| T6-31 | tenant / landlord / admin-test 三个 JWT：`knowledge_sources / documents / chunks` GET 42501、INSERT 42501；`knowledge_changes` GET `[]`（admin 也 `[]`，队列空）、INSERT 42501、PATCH `status` 204（0 行）、PATCH `source_key` 42501（列级 grant 只给 status / note / reviewed_*）；`kb_search` 42501（只 service_role）；**`kb_source_status` 对 tenant / landlord 都返回 46 份来源的完整状态**（函数 definer、`grant execute to authenticated`、函数体无 `is_stayloop_admin()` 检查）；`listings?select=id` 对登录用户 200（authenticated 保留 SELECT，RLS 公开行，按设计） | `AKMT/jwtprobe.out`；SQL `pg_proc` / `role_column_grants` / `pg_policies` | 部分通过 | T6-D13 |
| T6-02/03 | 签名末字符翻转的 tenant JWT：`/api/stripe/checkout` 401、REST `knowledge_changes` 401 `PGRST301`；`POST /api/admin/knowledge` 与 `/api/models/catalog` 405（未声明 POST，先于鉴权）；anon key 作 Bearer：checkout 401 | 终端输出 | 通过 | |
| T6-04' | tenant-test JWT `POST /api/stripe/checkout {}` → **403 `landlord_required`**、`/unlock {}` → 403；admin-test JWT 同；随后 SQL `landlords` 中两账号行数 0。landlord-test JWT 对照：checkout 200 cs_live、unlock 200 cs_live、portal 400 | `AKMT/jwtprobe.out`；SQL | 通过（**T6-D1 已修**） | |
| T6-20 | 18 个 chunk（1.2 MB）+ 3 个 HTML：密钥模式零命中；JWT 字面量 1 个、`role: anon`；地址只有 `https://auth.stayloop.ai`；无 `NEXT_PUBLIC_*` 变量名残留 | `AKMT/chunks/`、终端 grep 输出 | 通过 | |
| T6-19 | `git grep -E "sk_(live|test)_…|re_…|eyJhbGciOi…|GOCSPX-|AKIA…|whsec_…|sk-ant-api" HEAD`（排除 .md）零命中；`.gitignore` 含 `.env` `.env.local` `.env.*.local` `.forensics-tmp/`；`signInWithOtp` 为零 | 终端输出 | 通过 | |
| T6-21 | ERROR 5 = 已知 definer 视图（`provider_credentials_public` `provider_directory` `applicant_applications` `my_showing_intents` `agent_directory`）同上轮；WARN anon 可执行 definer 函数 12（上轮 11，+`kb_pending_rule_notices`，刻意公开、只回 rule id / 来源名 / 日期）；WARN authenticated 可执行 59（含新增 `kb_source_status`，见 T6-D13；`claim_landlord` 仍可被任何登录用户直接 RPC，与 10-17 相同）；INFO RLS 无策略 27（上轮 22，+`knowledge_sources / documents / chunks` 等 service-role 专用表）；`pg_trgm` `pg_net` 在 public（已知） | `get_advisors` 输出 | 通过 | |
| T6-22 | `npm audit --omit=dev`：**critical 0**（next 16.4.2、react 19.3.1；T6-D3 已修）、high 2（`nanoid <3.3.18` 零长度死循环、`source-map-js` 事件循环 DoS，均为 postcss 链间接依赖、构建期）、moderate 1（`baseline-browser-mapping`，构建期） | `AKMT/audit.json` | 通过（记 S3） | T6-D14 |
| T6-27 | `mint.sh tenant-test@ https://evil.example/` → `action_link` 的 `redirect_to=https://www.stayloop.ai`（回退到 Site URL）。但本轮发现 `mint.sh` 把 `redirect_to` 放在 body `options` 里，GoTrue 忽略它——任何值都会回退，所以这条**不能证明** allow-list 生效；PAT 只读 `GET /v1/projects/…/config/auth`：`site_url=https://www.stayloop.ai`、`uri_allow_list = https://stayloop.ai/auth/callback, https://www.stayloop.ai/auth/callback, https://www.stayloop.ai/**`（配置正确，evil 不在内）；上轮用查询参数形式已通过 | 终端输出（token 已脱敏，链接未打开） | 通过（配置核对；行为探针待用查询参数重跑） | |

**汇总**：13 条用例（含两条复合），执行 13，通过 10，部分通过 1，失败 1（T6-12b），记录级 1（T6-22）。未执行：T6-01 全路由匿名扫描、T6-05/06 IDOR、T6-07 枚举、T6-08/09/10 注入、T6-14–18 限流、T6-24–26 业务逻辑、T6-29/30 隐私——不在本组本轮范围（L / T4 组或 10-17 结果保留）。

## 缺陷

| 编号 | 严重度 / 优先级 | 一句话 | 复现 |
|---|---|---|---|
| **T6-D12** | **S2 / P1** | **明文 HTTP 不再跳 HTTPS**：`http://www.stayloop.ai/`、`/login`、`/api/v1/*` 都直接 200 返回完整内容；`http://stayloop.ai/` 308 到 **`http://`**www。浏览器会忽略经 HTTP 收到的 HSTS，首次访问者 / 老书签 / 输入裸域名的人会整页走明文（登录页也在内），且无法提交 HSTS preload。10-19 迁 Worker 后 zone 路由 `www.stayloop.ai/*` 把 http 请求也交给了 Worker，Pages 时代由平台做的 301 没了（`stayloop.pages.dev` 的 http 仍 301） | `curl -sI http://www.stayloop.ai/login` → `HTTP/1.1 200 OK`；`curl -sI http://stayloop.ai/` → `308 Location: http://www.stayloop.ai/`。修法任一：Cloudflare zone 开 **Always Use HTTPS**（边缘 301，先于 Worker）；或 `proxy.ts` 开头对 `request.nextUrl.protocol === 'http:'`（或 `x-forwarded-proto`）回 308 到 https，并把 apex 跳转的 `url.protocol` 固定为 `https:`；路由审计加一条 `http://` 探针 |
| T6-D13 | S3 / P3 | `kb_source_status()` 任何登录用户可调（definer + `grant execute to authenticated`，函数体不查 `is_stayloop_admin()`），返回 46 份来源的 key / URL / 合并日 / 抓取日 / version_hash / 块数 / 过期标记。都是公开法规的运维元数据，无个人信息，但与 `/api/admin/knowledge`「管理员专用」不一致，也暴露抓取节奏 | tenant JWT `POST /rest/v1/rpc/kb_source_status {}` → 200 全表。修法：`revoke execute … from authenticated`（路由本来就用 service role 调），或函数内 `where public.is_stayloop_admin()` |
| T6-D14 | S3 / P3 | `npm audit --omit=dev` high 2（`nanoid`、`source-map-js`，postcss 间接依赖、只在构建期）+ moderate 1 | `AKMT/audit.json`；随下次 `npm update postcss` 带过 |

## 越界发现

- `mint.sh`（README 指定的测试工具）`redirect_to` 放在 `options` 里不生效，所有魔法链接落 `/`；见 A 文件。
- `claim_landlord()` 仍对 `authenticated` 直接可执行（advisors WARN）：任何登录用户可用 REST RPC 给自己开房东帽子 + 30 天试用；这是「明确动作才开通」的页面层约束，数据库层没有挡。10-17 已知未列缺陷，本轮再记一次供产品决定（若要收口，改成只允许服务端或加 `p_confirm` 参数）。
- 预渲染 HTML 的 `cache-control: s-maxage=31536000`（10-19 已知遗留）仍在；`/admin` `/login` 这类客户端渲染壳也带它，zone 不缓存 Worker 输出所以无实际影响，但若日后开 static-assets incremental cache 要先处理。
- `stayloop.pages.dev` 仍在线并跑 10-18 的旧代码（Pages 下线待用户决定，10-19 备忘）。

## 数据副作用

- 无数据库写入（所有写探针都 42501 / 0 行 / 400 / 403）。
- 魔法链接：tenant-test 一条 evil-redirect 探针链接（未打开，10 分钟后失效）。
- Stripe live：landlord-test 两个未完成 Checkout 会话（见 K）。
- 本地：`AKMT/chunks/` 1.2 MB 生产 JS 副本、`AKMT/jwt-*.txt` 三个 1 小时有效的 access token（scratchpad，随会话清理）。
