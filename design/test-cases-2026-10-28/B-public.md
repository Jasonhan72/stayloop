# B · 公开页与营销 · 2026-10-28（测试员 ②）

风险等级 R3；回归基线 `design/test-cases-2026-10-17/B-public.md`（抽样 ≥ 40%）+ 10-21 经纪公开主页 / 10-23 头像 / 10-25 `/tools` 与 `/rules` 更新记录 / 10-27 经纪站内信号、筛查方法论、知识库角标。
环境：生产 `https://www.stayloop.ai`（ship98 `92a5f8c0`），curl + playwright 1.58 无头系统 Chrome（调试端口 9347 / 9349），匿名；语言经 `localStorage.stayloop_lang`。
证据目录 `<scratchpad>/sitetest1028/BOC/`：`html/*.html`（SSR）、`ssr.mjs` → `ssr.json`、`anon.mjs` → `anon-*.json`、`extra.mjs` → `extra.json`、`rules-official-status.out`、`shots/`。
匿名 AI 预算：分配 3 次，实际用 2 次（B-16、B-17）。

## 用例

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| B-01 节顺序 | R3 | 匿名 | 读 `/` SSR，按 testid 取节位置 | hero → statement → film/flow → roles → rules → faq 单调递增；无 Sarah Wang 示范卡 | `homeV10` |
| B-02 首屏文案 | R3 | 匿名 zh | H1 / 导语 / 陈述句逐字 | H1「租房的事，交给AI助理」；陈述句含「按当地法规把关」「须经你审批」「不可删改」 | `homeStatement20261003` |
| B-03 对话框身份 | R3 | 匿名 | `home-ask-role` 默认；切房东 | 默认 tenant；占位换成房东示例；sessionStorage `sl-home-ask-role` | `homeAsk20261001` |
| B-04 B-D1 回归 | R3 | 匿名 | 切租客等 2 s → 切房东 0.25 s 内空着发送 | 去 `/landlord/agent?prompt=<房东示例>`（上轮 B-D1：曾发上一条示例） | `homeAsk20261001` |
| B-05 规则带 / FAQ | R3 | 匿名 | `home-rules` li 数、「全部 N 条规则」、指导比例；FAQ JSON-LD | 10 条；N = `ONTARIO_RULES.length`；2026 2.1% / 2027 1.9%；FAQPage 4 问 = `<details>` 4、无 ZWSP | `homeV10` |
| B-06 页脚 | R3 | 匿名 | 页脚版本 / slogan / 链接 | V0.7；slogan；含 `/tools`「租房小工具」、`/agents`「找经纪」、`/consumer-rights`；logo → `/` | `tools20261025` `logoHome` |
| B-07 身份页 | R3 | 匿名 | `/tenant` `/landlord` `/agent` | 无 `%` / ★ / SOC 2；三张收益卡 `/?role=&ask=`；CTA `/onboarding/name?role=`；FAQ 6/7/6 = JSON-LD；经纪页无「有委托才能」 | `eliseai20260922` |
| B-08 `/platform` `/services` | R3 | 匿名 | 内容核对 | platform 两产品三段；services 工种 × 资质、无公开目录承诺；禁语 0 | `platform20260923` `servicesEntry` |
| B-09 `/tools` 结构 | R3 | 匿名 | 三张表并排、不预选；三工具 testid | `tool-forms` 3 个按钮 `aria-pressed` 全 false；`rent-area / rent-asking / rent-run / ask-search`；不发 `/api/agent/*` | `tools20261025` |
| B-10 N4 算术 | R2 | 匿名 | 送达 2026-10-25 邮寄，月租 2650，欠 10-01 期 $2650，终止 11-01 | 视为送达 10-30（+5）；最早终止 11-06（+7）；11-01 标「不行」引 RTA-59；结果给 LTB 官方 N4 PDF + 说明链接，明写不代填不代选不代送 | `tools20261025` |
| B-11 N1 算术 | R2 | 匿名 | 送达 2026-10-28 亲手，2000 → 2042，生效 2027-01-15，起租 2025-12-01；再改 2050 / 2027-02-01 | 最早生效 2027-01-26（+90）；生效年 2027 指导 1.9%，2.10% / 2.50% 都标超线引 RTA-120 | `tools20261025` |
| B-12 N12 算术 | R2 | 匿名 | 送达 2026-10-28 亲手，终止 2026-12-15，交租日 1 号 | 最早 2026-12-27（+60）；非租期末日 → 下一个 12-31；入住 60 天内说明 | `tools20261025` |
| B-13 要价对照 | R2 | 匿名 | North York · 1 卧 condo · 要价 2600 | 调 `/api/v1/rent-benchmark` 200；CMHC + StatCan 并排；来源句；「不是定价建议」 | `tools20261025` |
| B-14 这个能问吗 | R2 | 匿名 | 表行数、档位、受保护事由、搜「宠物」 | 19 行；受保护事由无「可以问」；搜索过滤；链到 `/consumer-rights#method` | `tools20261025` |
| B-15 `/rules` 更新记录 | R3 | 匿名 | 更新记录条目、每条规则官方链接、角标端点 | `rules-changelog` 条目引用的规则锚点都存在；32 条规则每条有官方原文链接且 curl 200；`GET /api/kb/notices` 200 `{notices:[]}` → 0 个「待核对」角标；互链 `/tools` | `tools20261025` `kbUpdates20261027` |
| B-16 首页 → 租客预览（AI 1/3） | R2 | 匿名 | 首页对话框输入押金问题，身份租客，发送 | 落 `/tenant/agent?prompt=…&send=1`；一次 `/api/agent/turn` 200；回复带 `[n]` 引用 + `kb-references`「参考原文」；回执「查了法规原文」；无 Sarah Wang；无「办完了。」；预览横幅 | `kb20261027` `assistantReceipt20251025` |
| B-17 房东法规问题（AI 2/3） | R2 | 匿名 | `/landlord/agent?prompt=N4 问题&send=1` | 7 天规则；`[n]` 引用 RTA s.59 + 解释指南；房东模型不出卡 | `kb20261027` |
| B-18 `/agents` 列表 | R3 | 匿名 | 卡片、筛选、信号行、嵌套 `<a>` | 卡片 `agent-card`；信号行 `agent-signals` 样本 < 3 写「尚无足够数据」；`a a` = 0；「不是经纪公司」 | `batch3Site_20271027` |
| B-19 `/agents/[slug]` | R3 | 匿名 | `test-agent-person-4388`；不存在 slug | 注册名 + 类别 + 经纪公司 + RECO 徽章 + 注册号 + 核验日；「不是 Stayloop 的背书」；活动数；无邮箱 / 电话；联系按钮要求登录；头像（无照片时首字母 AP）；坏 slug 显示未找到 | `agentPublic20261021` |
| B-20 sitemap | R3 | 匿名 | `/sitemap.xml` | 含 `/rules` `/tools` | `tools20261025` |
| B-21 SSR 禁语 | R3 | 匿名 | 25 个公开页 zh SSR 文本 | 背调 / 法律协助 / 助手·管家 / 验证一次 / 六维 / 不是报告机构 / 实时挂牌 / 测试期 / 按时收租 / 四枚章 0 命中 | 各 copy 守卫 |
| B-22 `/providers/professional` 匿名 | R3 | 匿名 | 打开 | 页面壳 + 工种筛选 + 「登录后可以看到联系方式 · 去登录」，不出联系方式 | `batch2Round1_20261027` |
| B-23 统计带 | R3 | 匿名 | `/api/public/stats` 与首页 | 接口 200 `x-stats-cache`；数字非负 | `publicStats20261009` |

## 执行记录

| ID | 实际 | 证据 | 结果 | 缺陷 |
|---|---|---|---|---|
| B-01 | testid 位置 hero 9618 → statement 16748 → film 18369 → flow 19848 → roles 21245 → rules 38723 → faq 44632，单调；`noSarah: true` | `ssr.json.home` | 通过 | — |
| B-02 | H1「租房的事，交给AI助理」；陈述句「Stayloop 用 AI 把租房的每一步办完：找房、筛查、签约……全程按当地法规把关。涉及他人的操作须经你审批，沟通经平台中转，记录不可删改。」 | `ssr.json.home.statement` | 通过 | — |
| B-03 | 身份选择器是 `<select>`，选项 tenant / landlord / agent，默认 tenant，占位「试试「房东要我付一个月押金加钥匙押金，合法吗？」」；选房东后占位「试试「帮我发一个房源：28 Avondale Ave 1203…」」，`sl-home-ask-role=landlord` | `anon-home_tools_rules.json.home` | 通过 | — |
| B-04 | 切租客 2 s → 切房东 0.25 s 内空着发送 → `/landlord/agent?prompt=帮我发一个房源…&send=1`（房东示例、房东页面）。**上轮 B-D1 已修复**（预览页到达即返回，未等待回复、不计 AI 次数——该请求在导航后立即 goBack 中止） | 同上 `quickSubmitUrl` | 通过 | — |
| B-05 | `home-rules` 10 条；「全部 32 条规则」= `/rules` 32 个锚点（10-27 加了 `RTA-6-1-rent-control-status` 等，上轮 30）；「2026 年 2.1%、2027 年 1.9%」；FAQPage 4 问 = `<details>` 4，无 ZWSP | `ssr.json.home` | 通过 | — |
| B-06 | V0.7；slogan 在；产品列 租房全流程 / **租房小工具 `/tools`** / Stayloop API / 维修与服务网络 / 定价 / 租客筛查 / 租客护照 / 争议解决 / **找经纪 `/agents`**；公司列含 **消费者权利 `/consumer-rights`**（上轮 O-D2 已修）；页头与页脚 logo href 都是 `/` | `extra.json.footer` | 通过 | — |
| B-07 | 三页 `pct: []`、无 ★ / SOC 2；各 3 条 `/?role=<r>&ask=`；CTA 2 × `/onboarding/name?role=<r>`；FAQ details 6 / 7 / 6 = JSON-LD 6 / 7 / 6；`delegationClaim: false`；「一个真数」行引用 `/api/public/stats` | `ssr.json.roles` | 通过 | — |
| B-08 | `/platform` h1「两个产品，一条流程：租前 · 租中 · 租后，加一个可调用的 API。」；`/services` h1「报修到验收，一条留痕的工单；服务商凭资质入驻，付款你们直接结算。」；两页禁语 0（见 B-21） | `html/platform.html` `html/services.html` | 通过（抽样，未逐链接核对 page.tsx） | — |
| B-09 | `tool-forms` 3 个按钮，`aria-pressed=true` 0 个（SSR 里唯一的 `aria-pressed=true` 是「这个能问吗」的「全部」筛选）；四个 testid 在；整个工具页交互期间 `/api/agent|llm` 请求 0 | `anon-home_tools_rules.json.tools` | 通过 | — |
| B-10 | 视为送达日 2026-10-30、最早可填终止日 2026-11-06；11-01 →「不行 · 终止日 2026-11-01 早于最早允许的 2026-11-06（送达后 7 天，邮寄另加 5 天）。（RTA s.59(1) · Bill 60 · N4 (2026/09)） RTA-59-n4-7-days」+ 说明「官方 N4 是 2026/09 版；旧版 2026-11-30 后 LTB 不再受理」；链接 `tribunalsontario.ca/…/N4.pdf` 与 `N4_Instructions.html`；「Stayloop 不代填、不代选、不代送」 | `shots/b-tools-n4.png` | 通过 | — |
| B-11 | 最早生效 2027-01-26；「该生效年份的指导比例 2027 · 1.9%」；2.10% → 超线引 RTA-120（N2 / AGI 提示）；2.50% 同样；N1 标「LTB 现行版（不在 2026/09 换版名单）」 | `shots/b-tools-n1.png` | 通过 | — |
| B-12 | 最早可填终止日（60 天）2026-12-27、提前天数 48；两条「不行」：不足 60 天 / 不是租期末日（下一个 2026-12-31）；说明「入住人须在终止日后 60 天内搬入 + 宣誓声明」；N12 2026/09 版 | `shots/b-tools-n12.png` | 通过 | — |
| B-13 | `GET /api/v1/rent-benchmark?province=ON&bedrooms=1&type=condo&area=North+York` 200；CMHC North York 2025-10 $2,285（高 13.8%）、StatCan 多伦多都会区 2026-04 $2,090（高 24.4%）；「来源：加拿大按揭与住房公司（CMHC）租赁市场调查，2025 年 10 月」；「不是定价建议；在租租客的涨幅仍受指导比例限制」 | `shots/b-tools-rent.png` | 通过 | — |
| B-14 | 19 行；档位统计 可以问 10 · 不能问 7 · 不需要 2（「可以问，有限制」计入可以问）；含受保护事由关键词的 7 行里「可以问」的 2 行是「入住人数 / 宠物」类（主语不是受保护事由本身），其余「不能问」；搜「宠物」→ 2 行（残障 / 服务动物、宠物 RTA s.14）；`consumer-rights#method` 链接 1 | `anon-home_tools_rules.json.tools.ask*` | 通过 | — |
| B-15 | 更新记录 5 条（2026-09-21 Bill 60 第二批 / 2026-07-01 第一批 / 2026-06 2027 指导 1.9% / 2025-07-31 多伦多装修许可 / 2025-06 2026 指导 2.1%），引用的 12 个规则锚点全部存在；32 条规则每条带官方链接（11 个唯一 URL：ontario.ca × 7、ohrc、toronto.ca PDF、tribunalsontario forms），**11/11 curl 200**；`/api/kb/notices` 200 `{"notices":[]}`，`cache-control: public, max-age=300`，页面角标 0（与队列一致）；`/tools` 互链 2 处 | `rules-official-status.out`、`shots/b-rules-1280.png` | 通过 | — |
| B-16 | 落 `/tenant/agent?prompt=房东要我付两个月押金加 500 钥匙押金…&send=1`，1 × turn 200；回复「两个月租金押金：不合法…[1]…[2, 3]…钥匙押金…[3, 4]」；`kb-references`：[1] RTA s.106 · 合并至 2026-09-21 [2] RTA s.134 [3] Renter Rights (City of Toronto) [4] 标准租约指南 9. Key deposit；回执「✓ 查了法规原文：RTA s. 106、RTA s. 134、…」；无 Sarah Wang、无「办完了。」；横幅「预览模式 · 登录后 AI 助理会读取你真实的记忆与待办」 | `shots/b-ai-tenant-preview.png`、`anon-ai_vp.json.ai` | 通过 | — |
| B-17 | 2 × turn 200（本页 1 次）；回复「从逾期的次日…可以送达 N4 [1]…终止日期…不少于 7 天 [1][2]（注：2026-09-21 之前的旧规则为 14 天）…补齐则作废 [1][3]」；参考原文 [1] RTA s.59 [2] LTB 解释指南 11 [3] 解释指南 10；回执一致；待批卡 0 | `shots/b-ai-landlord-n4.png` | 通过 | — |
| B-18 | 1 张卡 `[TEST] Agent Person`（AP 首字母 / 地产销售代表 / Example Realty / ✓ RECO 注册已核 / 普通话 · 英语 / 专长 / North York · Markham）；信号行「站内筛查 0 · 签约 0 · 回复速度：尚无足够数据」；`a a` = 0（10-27 修的水合错误没有回潮，控制台 0 错）；语言 / 专长筛选在；「Stayloop 不是经纪公司」 | `shots/b-agents-1280.png` | 通过 | — |
| B-19 | 主页：注册名 + 地产销售代表 + 经纪公司，「✓ RECO 注册已核 · #9990001 · 核于 2026/9/22」「核验 = 该日在 RECO 公开注册库上处于注册状态，不是 Stayloop 的背书」「在 RECO 核实 · 向 RECO 投诉」；活动数 5 客户 / 1 委托 / 0 在租房源；无邮箱 / 电话；联系区「登录后联系」；无头像文件 → 首字母 AP（测试经纪未传头像，上传路由本轮未测，属 ④/① 组登录态）；`/agents/no-such-agent-xyz` →「没有找到这位经纪的主页 · 去找经纪」 | `shots/b-agent-slug-1280.png` | 通过 | — |
| B-20 | 18 个 loc，含 `/rules` `/tools`；**不含 `/services` `/agents` `/consumer-rights` `/my-file`**（观察，见 B-D3） | `html/sitemap.xml` | 通过（观察） | B-D3 |
| B-21 | 25 页 zh SSR 禁语 0 命中（`ssr.json.banned = {}`）；5 页 en 渲染 DOM 零 CJK（见 O 组） | `ssr.json` | 通过 | — |
| B-22 | 匿名：h1「持牌的人，牌照核过，你直接联系。」+ 四工种筛选 chip + `professional-signin`「登录后可以看到联系方式。去登录 →」，无服务商卡片 | `shots/b-prof-anon-1280.png` | 通过 | — |
| B-23 | `/api/public/stats` 200 `x-stats-cache: hit` `{screenings:243, ltbOrders:176146, listings:0, …}`；首页数字带仍显示「0 套公开房源」（上轮 B-D5，按产品决定未改） | `api-probe.out` | 通过 | （B-D5 沿用） |

## 缺陷 / 观察

| 编号 | 严重度 | 优先级 | 一句话 | 复现要点 | 证据 |
|---|---|---|---|---|---|
| B-D1 | S3 | P3 | `/tools` `/rules` `/consumer-rights` `/my-file` `/providers/professional` `/services` `/apply/[slug]`（表单页）的 `<title>` 是根布局默认「Stayloop — 租房的 AI 操作系统 · The AI-native rental OS for Toronto」，没有页面自己的标题（SEO / 浏览器标签）；`/agents` `/privacy` `/listings` 的 title 在英文界面仍是中文（上轮 C-S3-3 同类） | `curl -s https://www.stayloop.ai/tools \| grep -o '<title>[^<]*'` | `ssr.json.title` |
| B-D2 | S3 | P3 | 平板 768 宽下仍有 < 16px 的文本控件（`/tools` 5 个、`/agents` 3 个、`/listings` 2 个、`/` 1 个）；375 宽为 0。iPad Safari 对 < 16px 输入框聚焦时同样会放大页面 | 768×1024 打开 `/tools`，`getComputedStyle(input).fontSize` | `anon-ai_vp.json.vp[*].smallInputs` |
| B-D3 | S3 | P3 | `sitemap.xml` 缺 `/services` `/agents` `/consumer-rights` `/my-file`（都是可索引的公开页；`/agents/[slug]` 公开主页也不在） | `curl -s https://www.stayloop.ai/sitemap.xml` | `html/sitemap.xml` |
| B-D4 | S3 | P3 | 房源详情页首屏「位置与交通」显示「站点数据暂时不可用（OpenStreetMap 未响应）」——Overpass 外部失败按设计不缓存，但 77 Sitetest 与 Avondale 两页都如此，值得看一眼 Overpass 配额 | 打开任一房源详情页 | `shots/c-detail77-1280.png` |

## 未执行 / 限制
- 三方动画只核对章节按钮（5 章 + 暂停）与结构，未逐帧核对；减少动态模式未单测。
- `/platform` `/services` 只做了 h1 + 禁语核对，站内链接目标是否存在未逐个核对（上轮已 27/27）。
- `/contact` 表单未再发信（预算留给他组）。
- WebKit 断行未跑（只有 Chromium）。

## 数据副作用
- 匿名 AI 对话 2 次（`/tenant/agent` 与 `/landlord/agent` 预览，不落库）。
- 匿名访问房源详情页触发 `POST /api/listings/enrich`，`listings.enriched_at` 刷新为 2026-10-28 18:40:51（按设计的 30 天缓存，不经模型）。
- 无数据库写入、无邮件。
