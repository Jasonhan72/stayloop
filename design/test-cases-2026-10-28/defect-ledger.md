# 缺陷台账 · 全站测试 2026-10-28

严重度 S0–S3 / 优先级 P0–P3 定义见 `design/test-strategy-2026-10-17.md` §7。编号 `<模块>-D<n>`；自动层发现的记 `T<层>-D<n>`。

| 编号 | 严重度 / 优先级 | 模块 | 一句话 | 复现 / 证据 | 状态 |
|---|---|---|---|---|---|
| N-D1 | S2 / P1 | N 定时任务 | 周一的知识库刷新 Action（10-26 13:27 UTC）在新加的评测步骤崩：`scripts/kb/eval.ts` 无条件读 `.env.local`，runner 上没有 → ENOENT，整个 run 标失败（入库本身已成功，全部 unchanged） | `gh run view 40330740308 --log` 尾部 `Error: ENOENT … .env.local` | 已修（53efbfe，try/catch 同 ingest），手动触发 run 40745687864 成功：46 份 unchanged、评测 94% |
| T4-D1 | S3 / P2 | T4 权限矩阵 | 矩阵审计两条「失败」是预期过期：`kb_pending_rule_notices` 匿名可执行（/rules 角标端点，按设计）与 `agent-photos` 公开桶（10-23 经纪头像）不在允许清单 | `bash scripts/e2e/db-matrix.sh` → 185 审计 183 过 | 已修（预期补入脚本），复跑 185 / 185、探针 269 / 269 |
| T6-D12 | **S2 / P1** | T6 安全 | 明文 HTTP 不再跳 HTTPS：`http://www.stayloop.ai/login` 整页 200，`http://stayloop.ai/` 308 到 **http://**www；10-19 迁 Worker 后 zone 路由把 http 也交给 Worker，Pages 平台的 301 没了；HSTS 经 http 收到会被浏览器忽略 | `curl -sI http://www.stayloop.ai/login`；证据 `sitetest1028/AKMT/hdr.out` | 已修：`proxy.ts` 对 http 一律 308 到 `https://www`（apex 跳转也固定 https），路由审计加 2 条 http 探针；待 ship99 后复测 |
| T6-D13 | S3 / P3 | T6 安全 | `kb_source_status()` 对任何登录用户可调（definer + grant authenticated），租客 JWT 能拿到 46 份来源的 URL / 日期 / 版本哈希 / 块数（仅运维元数据） | `sitetest1028/AKMT/jwtprobe.out` | 已修：迁移 `20261028_kb_source_status_service_only.sql`，只给 service_role（后台 API 本来就用 service role） |
| T6-D14 | S3 / P3 | T6 安全 | `npm audit --omit=dev`：critical 0，high 2（nanoid、source-map-js，postcss 的间接依赖，仅构建期） | `sitetest1028/AKMT/audit.json` | 记录；随 Next / postcss 升级消化 |
| M-D2 | S3 / P3 | M 后台 | `PATCH /api/admin/knowledge` 对不存在的 id 返回 200 `{ok:true}` | `jwtprobe.out` admin 段 | 已修：更新 0 行 → 404 |
| M-D3 | S3 / P3 | M 后台 | 后台中文文案混用半角标点；`/admin/knowledge` 无权限态没有返回链接 | `M-admin-anon.png` | 部分修：知识库页加「回首页」链接；旧后台页标点留下轮 |
| A-X1 | 观察 | 测试工具 | `mint.sh` 原把 `redirect_to` 放 body，GoTrue 不认，链接都回到首页 | 测试员 ① 回报 | 已修：改成查询参数（CLAUDE.md 本来就这么写） |
| A-X2 | 观察 | 数据 | `auth.users` 10-28 18:26Z 出现 `mobile-audit-…@stayloop-test.local` | SQL | 是 `scripts/mobile-audit.mjs --authed` 的临时账号，审计结束自动删除；不是测试员建的 |
| A-X3 | 已知 | 数据库 | `claim_landlord()` 对 authenticated 直接可执行：任何登录用户可用 RPC 给自己开房东帽子 + 30 天试用（页面层不这么做） | advisors WARN | 10-17 已知，产品决定：开通房东是用户自己的动作，RPC 可调不算越权；记录 |
| C-D1 | **S2 / P1** | C 房源 | 公开房源卡与详情页按 `photo_count`（旧默认 12）显示「1 / 12」和 12 格拼图，77 Sitetest 实际 2 张；`listings.photo_count` 列默认 12，部分写入路径不更新它 | `GET /api/listings/search` → `photo_count:12`，SQL `jsonb_array_length(images)=2`；`sitetest1028/BOC/shots/c-listings-1280.png` | 已修：搜索与详情接口按 `images` 长度给 `photo_count`；列默认改 0 并回填 |
| C-D2 | **S2 / P2** | C 房源 | 表单写的 `pets_allowed`（yes / no / restricted）被卡片事实行与 `?pets=1` 筛选忽略（只看旧 `pet_policy`） | `GET /api/listings/search?pets=1` 不含 77 Sitetest；`cardFacts.ts`、`search/route.ts` | 已修：接口把 `pet_policy ?? pets_allowed` 给卡片，筛选两列都认；AI 找房同样 |
| B-D1 | S3 / P3 | B 公开页 | `/tools` `/rules` `/consumer-rights` `/my-file` `/providers/professional` `/services` 的 `<title>` 是根默认标题 | `ssr.json.title` | 已修：各加 `layout.tsx` metadata |
| B-D2 | S3 / P3 | B 公开页 | 768 宽下仍有 < 16px 文本控件（`/tools` 5、`/agents` 3、`/listings` 2、`/` 1），375 为 0 | `anon-ai_vp.json.vp` | 记录（iOS 缩放只在手机宽度触发，平板不受影响） |
| B-D3 | S3 / P3 | B 公开页 | `sitemap.xml` 缺 `/services` `/agents` `/consumer-rights` `/my-file` | `html/sitemap.xml` | 已修 |
| B-D4 | S3 / 观察 | B 公开页 | 两个房源详情页「位置与交通」显示「OpenStreetMap 未响应」 | `shots/c-detail77-1280.png` | 查中（Overpass 配额 / 超时） |
| C-D3 | S3 / P3 | C 房源 | `/api/listings/search` 每条只回 1 张图，但 data URL 仍让 6 条响应 375 KB | `api-probe.out` | 记录（图改外链存储时一并处理） |
| C-D4 | S3 / P3 | C 房源 | 不存在 / 下架房源页 HTTP 200（上轮 C-S3-4 沿用） | `api-probe.out` | 记录 |
| O-D1 | S3 / P3 | O 法律页 | `/disputes` 中文导语夹英文「dispute resolution」 | `shots/o-disputes-1280.png` | 已修 |
| C-O1 | 观察 | C 房源 | 详情页一次加载发 `GET /api/listings/<slug>` 3 次 + `POST /api/listings/enrich` 2 次 | `extra.json.avondaleReqs` | 记录（dev StrictMode 之外的重复，下轮查） |
| C-O2 | 观察 | C 房源 | 分享包文案把 `description` 整段原样塞进正文 | `shots/v-375-share-panel.png` | 记录；77 Sitetest 的 `[TEST] edited by service role…` 测试描述已改回正常文案 |
| B-D4 补 | 外部 | B 公开页 | 复现时 `overpass-api.de` 对任何查询回 502「server is currently at capacity」，镜像 `overpass.kumi.systems` 超时——是 OSM 侧的容量问题，不是我们的查询；代码对失败不缓存（按规则） | `curl -X POST overpass-api.de … → 502` | 加了镜像兜底（主站失败再试镜像，各 12 秒）；页面文案不变 |
| I-D1 | **S1 / P1** | I 助理 | 报修引导卡发送后模型两次返回「输出格式出错，原样再发」（tenant-test，gemini-3.7-flash 经 openai-compat jsonMode，`ai_usage` ok=true、output 156 tokens）；换一句症状第四次才出卡 | `sitetest1028/HIJNL/I/repair.log` `repair2.log` | 已修：解析不出 JSON 时先记原文头 300 字到服务端日志，再用内置默认模型（Anthropic）重试一次，仍失败才给兜底文案；待 ship99 后复测 |
| I-D2 | S3 / P3 | I 助理 | 对话里房源卡设施行是原始双语串「厨房 / Kitchen · Wi-Fi…」，/listings 同一卡是单语 | `I/anon-law.json` | 已修：对话卡也过 `resolveList` 单语化 |
| I-D3 | S3 / P3 | I 助理 | 引导卡选项「没有暖气 · 空调不工作」绑两种症状，工单标题带「/ 空调故障」 | 工单 `802d52fd` | 记录（引导卡选项拆分，下轮） |
| I-D4 | S3 / P3 | I 助理 | 「参考原文」同一条同链接出现两次（[1][2] 都是 RTA s.106） | `I/anon-law.json` | 已修：来源清单按标题 + 条号 + 链接去重，编号随之合并 |
| I-D5 | S3 / P3 | I 助理 | 英文界面下中文提问，服务端附注一句英文一句中文混排 | `I/anon-search.json` | 记录（附注按界面语言，下轮） |
| N-D2 | S3 / P3 | 文档 | CLAUDE.md 写「8 个 pg_cron」，生产 9 个（多 `agent-routines-sweep` 每小时 :10） | SQL | 已修（CLAUDE.md） |
| I-X1 | 观察 | 后台 | `ai_usage` 对「模型返回但解析不出 JSON」的 turn 记 ok=true，用量页看不出这类失败 | — | 记录；重试行的 source 是 `agent/turn-retry`，可在用量页按 source 看 |
| H-X1 | 观察 | 消息 | 在管租约线程里 10-25 有一条 `sender_kind=admin` 消息（上轮测试员用管理员写入） | `thread_messages` | 按设计：管理员可向任何线程发消息（support）；测试数据保留 |
| D-D1 | **S2 / P1** | D 申请 | 房东打开申请详情从不盖 `viewed_at`，租客追踪条「房东已查看」永远点不亮；根因 `void supabase.from(...).update(...)` 没有 await / .then——supabase-js 的查询构造器不被 await 就不发请求（全库 8 份申请只有 1 份有 `viewed_at`） | `shots/d07-tenant-applications.png`；SQL | 已修（`.then(() => {})`）；同根因 `leases/new` 的 `compliance_events` 插入（`source='lease_terms'` 至今 0 行）一并修；加守卫扫描「`void …from(` 且无 `.then`」 |
| G-D1 | **S2 / P1** | G 维修 | 律师 / Paralegal / 保险经纪 / 摄影四个「只展示与转介」工种可以被派成工单（API 直打 200 offered，UI 下拉也含） | `shots/g09-dispatch-modal.png`；工单 `a89d1948`（已 cancel） | 已修：`lib/marketplace/server.ts` 对专业工种 422；派单弹窗下拉不列专业工种 |
| G-D2 | S3 / P3 | G 维修 | `/landlord/providers` 专业服务区四类没有各自链到 `/providers/professional?trade=…`；「全部工种」筛选含专业工种 | `shots/g10-landlord-providers.png` | 已修：四类各自链接；筛选去掉专业工种 |
| F-D1 | S3 / P3 | F 租约 | `/api/finance/t776` 对无房东帽子账号返回 200 空表而非 403 | F-leases.md F-13 | 已修：无房东行 → 403 `landlord_required` |
| E-D1 | S3 / P3 | E 筛查 | 带 token 的 API（`/api/consumer/request/<token>`、`/pack`、`/api/w/<token>`）`referrer-policy` 仍是默认值 | F-leases.md F-22 | 已修：proxy 的 no-referrer 前缀加三个 token API |
| F-X1 | 观察 | F 租约 | `rent_overdue` 卡在该期记录并确认后仍 pending（执行器会 409 expired，待办页多留一张过时卡） | 卡 `cbae9a3d` | 记录（待办页对 expired 预判，下轮） |
| D-X1 | 产品 | A 身份 | tenant-test 持租客帽但未起名，登录后被送到 `/onboarding/name`：`isBrandNewAccount` 只看房东 / 经纪 / 服务商，与 CLAUDE.md「没有任何帽子且没起名」措辞不一致 | `lib/landlordHat.ts:29` | 请用户定：租客帽子人人都有，按现实现「没起名就引导起名」合理 |
