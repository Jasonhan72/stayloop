# C · 房源 · 2026-10-28（测试员 ②）

R2；基线 `design/test-cases-2026-10-17/C-listings.md`（抽 ≥ 50%）+ 10-22 MLS® 交接胶囊、10-26 分享包 v2 / 短链 / 回流、10-27 首次入住勾 + 定价参考卡、房源卡片优化与合一。
环境：生产；在架 6 套（全部 `is_test=true`）：`test-77-sitetest-rd-toronto-x2xa`（landlord-test，10-24 核验，`first_occupied_after_2018=true`，`photo_count=12` 但 `images` 2 张）、两套 QA Lane、Avondale、蒙特利尔、Simcoe。landlord-test 另有已下架 `[TEST] 100 Test Ave`。
工具：curl（`api-probe.out` `go-probe.out`）、Supabase `execute_sql` 只读、playwright 匿名（`anon.mjs listings` → `anon-agents_listings_en.json`、`extra.mjs`）与 landlord-test 魔法链接会话（`landlord.mjs` / `landlord2.mjs` / `landlord3.mjs` → `landlord.json` `landlord2.json`，profile `BOC/profile`，端口 9348）。

## 用例

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| C-01 搜索接口形状 | R2 | 匿名 | `GET /api/listings/search` | 200、`no-store`、`page_size:100`、`page_size=500` 被钳；只有 CARD_COLUMNS（含 `property_type`）、无 description / price_history / broker_phone；全部 `is_test=true` | search route |
| C-02 筛选 / 排序 / 分页 | R2 | 匿名 | `beds=3` `pets=1` `q=sitetest` `min=4000` `source=realtor` `sort=price_asc` `page=1` | 各自正确；pets 只返回宠物友好的行；price_asc 单调；page=1 空页 200 | search route |
| C-03 详情接口 | R1 | 匿名 | 在架 slug、下架 slug、不存在 slug | 200 `{listing, owner:false, similar}` 无私有列、带 `first_occupied_after_2018`；404 ×2 | `[slug]` route |
| C-04 anon 直读表 | R1 | anon key | `GET /rest/v1/listings?select=id&limit=1` | 401 42501 | `listings_anon_no_select` |
| C-05 浏览页卡片字段 | R2 | 匿名 1280 zh | `/listings` 每张卡 | `card-kicker`（类型 + 街区）→ `card-address` 标题 → 测试标签 → `card-price` → `card-size`（卧 / 浴 / 面积，单一语言）→ `card-facts`（入住日 / 宠物，只写有的）→ 来源行 → 设施灰字；≤ 8 张用圆点、> 8 张「1 / N」；计数「6 套」；一次 `/api/listings/search` | `listingCard20261027` `testListings` |
| C-06 浏览页排序交互 | R2 | 同上 | 排序改「价格升序」 | 请求 `sort=price_asc`，第一张 $2,225 | listings page |
| C-07 详情页 77 Sitetest | R2 | 匿名，`?src=kijiji` | 各节 + 首次入住声明 | `rent-control-status`「2018-11-15 后首次入住 · 涨租不受指导比例限制」；测试标签；入住前费用（押金 ≤ 1 个月、RTA s.105–106）；租金记录匿名提示；`listing-apply` → `/apply/<slug>`；数据声明；`?src=` 落地不报错 | `batch3Site_20271027` `listingExtras20261010` |
| C-08 详情页 Avondale（无标记） | R2 | 匿名 | `first_occupied_after_2018=null` | 不出现 `rent-control-status`（「没说」不猜） | 同上 |
| C-09 `/apply/[slug]` 匿名 | R2 | 匿名 | 打开 | 表单 01–05 节、24 个输入、地址显示、「提交申请 →」；不要求先登录 | apply page |
| C-10 不存在房源页 | R3 | 匿名 | `/listings/nope-xyz` | 「房源未找到」壳；接口 404 | — |
| C-11 短链预览不计数 | R2 | curl + SQL | `facebookexternalhit` ×2、`WhatsApp`、HEAD → 查 `listing_share_links.clicks`；再真实 GET | 302 `?src=kijiji` 且 clicks 不变；真实 GET 后 +1、`last_clicked_at` 更新；坏码 302 `/listings` | `sharePack20261026` 代码审查 10-27 |
| C-12 海报 / 链接接口鉴权 | R2 | 匿名 | `/api/listings/poster?code=` `/api/listings/syndications?listing_id=` | 401 | `sharePack20261026` |
| C-13 工作台两种视图 | R2 | landlord-test | `/dashboard` 卡片 / 列表 | 两种视图各 2 套房源；每行 `mls-handoff` 胶囊（77 Sitetest「待经纪挂牌 · Muse Agent · 对话 · 撤回请求」，100 Test Ave「未挂牌 · 让认证经纪帮我挂到 MLS®」）、「分享包 · 照片」、下架 / 上架；视图选择写 `sl-listing-view` | `mlsHandoff20261022` |
| C-14 下架提醒卡 | R2 | landlord-test | 100 Test Ave 行 | 只有存在「已发」的手动渠道记录才出现 `takedown-notice` | `sharePack20261026` |
| C-15 分享包面板 | R2 | landlord-test | 打开 77 Sitetest 分享包 | 8 个渠道页签；每页文案含本渠道专属短链、测试房源标记、不编造设施；小红书 / Instagram 有话题标签；每页 `share-link-stats` 点击数（微信 3、Kijiji 1）；平台提示；贴回控件（手动渠道）；English 文案零中文 | `sharePack20261026` |
| C-16 海报下载 | R2 | landlord-test | 二维码海报页签「下载海报（SVG）」 | `GET /api/listings/poster?code=pry888nr` 200 `image/svg+xml`；文件 1080×1350、含二维码 path、短链 `go/pry888nr`、测试标记 | `sharePack20261026` |
| C-17 快速发布页 | R2 | landlord-test | `/dashboard/listings/quick` 输入已有地址 + 月租 | `quick-existing-early`（上轮 C-S3-6：现在输入地址即查重）；首次入住三选一与定价参考卡在第二屏（review 阶段，需识图，本轮不耗模型） | `quickPublish20261013` |
| C-18 五步向导 | R2 | landlord-test | 第 1 步地址 → 第 3 步价格 + 条件，月租 2650 | `first-occupied` 三选一（不清楚 / 是 / 否，只在安省）；`price-reference` 出现：CMHC + StatCan、「你的要价比基准高 x%」、来源句、本人同卧室数区间、「不是定价建议」；清草稿 | `batch3Site_20271027` |
| C-19 编辑页 | R2 | landlord-test | `/dashboard/listings/<77 id>/edit` | 三选一当前选「是」（库 true）；定价参考卡同上 | 同上 |
| C-20 房源卡 photo_count | R2 | 匿名 | 77 Sitetest 卡与详情 | 角标 / 计数与真实照片数一致 | `listingCard20261027` |

## 执行记录

| ID | 实际 | 证据 | 结果 | 缺陷 |
|---|---|---|---|---|
| C-01 | 200；`{n:6,total:6,page:0,pages:1,page_size:100}`；`cache-control: no-store`；`page_size=500` → 仍 100；键 = CARD_COLUMNS（含 `property_type` `photo_count` `images`），私有列 0；6 条 `is_test=true`；`images` 现在每条只回 1 张（上轮整列）但仍是 data URL，**6 条响应 375 KB** | `api-probe.out` | 通过（C-D3） | C-D3 |
| C-02 | `beds=3` → Simcoe；`pets=1` → 蒙特利尔 + Simcoe（**77 Sitetest `pets_allowed='yes'` 不在内**）；`q=sitetest` → 77；`min=4000` → Avondale + Simcoe；`source=realtor` → 0；`price_asc` 2225→6500 单调；`page=1` → 空页 200 | 同上 | 通过（C-D2） | C-D2 |
| C-03 | 77 Sitetest → 200 `owner:false, similar:null, first_occupied_after_2018:true, is_test:true, photo_count:12, images:2`，无 broker_phone / realtor_check / management_company；`test-100-test-ave`（下架）→ 404；`nope-xyz` → 404 | 同上 | 通过 | — |
| C-04 | anon key → 401 | 同上 | 通过 | — |
| C-05 | 6 张卡：kicker「公寓 · Toronto」「公寓 · Yonge & Sheppard, North York，Toronto」…；地址标题（Simcoe「238 Simcoe St #3709」单元号只出现一次）；全部「测试房源 · 非实际房源」；价格「$2,650/月」；户型行「1 卧 1 浴」「1 卧 1 浴 650 ft²」「2 卧 2 浴」（单一语言、带图标）；事实行只有 Avondale「11/01 起可入住」（其余无入住日 / `pet_policy`）；来源「房东直租 · Stayloop」；设施灰字「厨房 · 无线网络 · 专用工作空间」（上轮 C-S3-2 的双语串已按语言拆）；圆点：QA Lane 2、Avondale 6、Simcoe 6；计数：蒙特利尔「1 / 10」、**77 Sitetest「1 / 12」（实际 2 张）**；「6 套」；只发一次 `?sort=newest&page=0`；控制台 0 错 | `shots/c-listings-1280.png` | 通过（C-D1） | C-D1 |
| C-06 | 选项 newest / price_asc / price_desc；选升序 → 请求 `?sort=price_asc&page=0`，卡片 DOM 顺序 $2,225 → 2,300 → 2,500 → 2,650 → 4,500 → 6,500；降序 6,500 → … → 2,225（第一次探针在重渲染前取样读到 $2,650，复核后正确） | `sort.mjs` 输出 | 通过 | — |
| C-07 | `?src=kijiji` 落地 URL 保留参数、无报错、无客户端存储；h1「[TEST] 77 Sitetest Rd, Toronto」；测试标签；价格事实行「整套公寓 · 1 间卧室 · 1 间浴室 · 已核验 $2,650/月 · 12 个月 · **2018-11-15 后首次入住 · 涨租不受指导比例限制** · 即可入住 · 上架 3 天」；租赁条件「宠物 允许 · 吸烟 禁止 · 家具 带家具 · 租期 12 个月 · 押金 $2,650」+ RTA s.14 / s.105–106 句；入住前费用 首月 $2,650 + 押金 $2,650 + 钥匙押金「以租约为准」= $5,300，划掉「申请费 · 信用检查费 · 宠物押金 · 清洁押金」；租客保险 Rates.ca；租金记录 1 行「2026-10-18 上架 $2,650」+ 登录提示；位置与交通「站点数据暂时不可用（OpenStreetMap 未响应）」（B-D4）；「关于 Toronto」三瓦片含 CMHC 来源句；数据声明 + 48 小时更正；`listing-apply` → `/apply/test-77-sitetest-rd-toronto-x2xa`；一次加载发 `GET /api/listings/<slug>` ×3 + `POST /api/listings/enrich` ×2（观察 C-O1）；照片拼图 2 张真图 + 3 格空白占位、「查看全部照片」 | `shots/c-detail77-1280.png` | 通过（观察） | C-D1 C-O1 |
| C-08 | Avondale `rent-control-status` 不渲染（null 不猜）；「上架 113 天」 | `extra.json.avondale` | 通过 | — |
| C-09 | h1「提交申请」，title「申请 · [TEST] 77 Sitetest Rd, Toronto · Stayloop」，24 个输入（01 个人信息 … 05 证明文件），地址在，「提交申请 →」；匿名可填（未提交） | `shots/c-apply77-1280.png` | 通过 | — |
| C-10 | 「房源未找到 · 这套房源可能已下架 · 返回房源列表 →」；接口 404；**页面 HTTP 200**（上轮 C-S3-4 沿用）；networkidle 等不到（Google Maps 脚本 + 该 GET 在 playwright 事件里一直 pending），不影响用户 | `extra.json.nope` | 通过（C-D4） | C-D4 |
| C-11 | 前置 kijiji `e96ur7cn` clicks 0 → `facebookexternalhit` ×2 / WhatsApp / HEAD 全部 302 `…/listings/test-77-sitetest-rd-toronto-x2xa?src=kijiji`、`cache-control: no-store`，SQL 仍 0 → 真实 Chrome UA GET 302 后 **clicks 1，`last_clicked_at 2026-10-28 18:31:18`**；坏码 `zzzzzzzz` → 302 `/listings` | `go-probe.out`、SQL | 通过 | — |
| C-12 | 匿名 poster 401、syndications 401 | `api-probe.out` | 通过 | — |
| C-13 | 卡片视图：77 Sitetest「上架中 VERIFIED 1 / 2 … MLS® 待经纪挂牌 [TEST] Muse Agent · [TEST] Example Realty Inc., Brokerage 对话 撤回请求 · 分享包 · 照片 · 编辑 链接 查看 下架 删除」，100 Test Ave「已下架 VERIFIED 1 / 12 … MLS® 未挂牌 让认证经纪帮我挂到 MLS® · 分享包 · 照片 · 上架」；列表视图同样 2 行、胶囊同；`sl-listing-view=list` 记住；「已删除的房源（50）」折叠；Pro 试用至 2026-11-14；无条款弹层 | `shots/c-dashboard-cards-1280.png` `c-dashboard-list-1280.png` | 通过 | — |
| C-14 | 两行都没有 `takedown-notice`：`/api/listings/syndications?listing_id=<77>` 返回里没有 `posted` 状态的手动渠道（10-26 实测的 Kijiji 行已在当时被执行器标 removed）；100 Test Ave 无记录。按设计；未再贴回帖子制造一条（会留下数据） | `landlord.json.dashboard` | 通过（按设计） | — |
| C-15 | 标题「1 卧 1 卫 公寓 · [TEST] 77 Sitetest Rd, Toronto」；页签 微信 / 小红书 / Facebook 群 / Facebook Marketplace / Kijiji / Instagram / 回复模板 / 二维码海报（8）+ 同一行的 中文 / English 切换；每页文案以「【测试房源 · 非实际房源】」开头、含本页专属短链（xy4dpj9v / phhd8hpa / 485nmhkt / 83vfa9t8 / e96ur7cn / nhudh8fi / ybkw5fvv / pry888nr，与库一致）、设施只写库里的「落地窗 / 大窗、景观、大堂礼宾」（无编造）、小红书 5 个话题标签、Instagram 5 个、其余 0；正文原样带上房源 description（现为上轮 C-24 写入的「[TEST] edited by service role at 2026-10-18…」）；`share-link-stats`「专属链接 www.stayloop.ai/go/xy4dpj9v · 点击 3 次 · 最近 10月25日」「…/go/e96ur7cn · 点击 1 次 · 最近 10月28日」（与 C-11 一致）；平台提示每页一段；贴回控件（链接框 + 「记下：已发」）在 6 个发帖渠道，回复模板 / 海报无；English 下 Kijiji 文案零中文；接口 `share-links` `syndications` 200；无原生弹窗 | `shots/c-share-panel-1280.png` `c-share-kijiji-1280.png`、`landlord2.json.share` | 通过（观察 C-O2） | — |
| C-16 | 「下载海报（SVG）」→ `GET /api/listings/poster?code=pry888nr&lang=en` 200 `image/svg+xml`，下载 `stayloop-poster-pry888nr.svg` 3,711 B：`1080×1350`、二维码 `<path>`、文字含 `go/pry888nr`、2 处 TEST 标记；请求带 `lang=en` 是因为探针前一步点过面板里的「English」切换（面板语言跟随切换，正确） | `poster.svg`、`landlord.json.dashboard.share.posterDownload` | 通过 | — |
| C-17 | 输入 `[TEST] 77 Sitetest Rd, Toronto` + 2650 → 3 秒内 `quick-existing-early`「该地址已有相同房源，请勿重复发布。它目前在架、公开可见，可以直接去编辑。」（上轮 C-S3-6 已修）；`first-occupied` / `price-reference` 在 review 阶段（`quick/page.tsx:312,318`），未耗识图，改在 C-18 / C-19 验证 | `shots/c-quick-1280.png` | 通过（部分） | — |
| C-18 | 第 3 步「价格 + 条件」：`first-occupied`「2018-11-15 之后才第一次有人入住？ 不清楚 / 是 / 否 … 是 → 在租涨幅不受年度指导比例限制（RTA s.6.1，仍要提前 90 天通知）；否 → 受指导比例约束。房源页会照实写出来。」；月租 2650 → `price-reference`「CMHC · Former City of Toronto, York and East York · 2025 年 10 月: $2,465/月 · StatCan 挂牌均价 $2,090 / 你的要价 $2,650 比基准高 7.5% / 来源：加拿大按揭与住房公司（CMHC）租赁市场调查，2025 年 10 月（出租公寓单元）/ 你自己同卧室数的房源：2 套，$2,450–$2,650 / 不是定价建议；在租租客的涨幅仍受指导比例限制」；草稿已清 | `shots/c-wizard-step3-1280.png` | 通过 | — |
| C-19 | 编辑页三选一当前「是」（库 `true`）；定价卡同 C-18 | `shots/c-edit77-1280.png` | 通过 | — |
| C-20 | 库：`photo_count=12`、`images` 2 张、storage 0 个对象；公开卡「1 / 12」、详情拼图 5 格只有 2 张真图 + 「查看全部照片」；工作台卡片却显示「1 / 2」（用 images 长度）——同一套房两处口径不一致 | SQL、`shots/c-listings-1280.png` `c-detail77-1280.png` | **失败** | C-D1 |

## 缺陷 / 观察

| 编号 | 严重度 | 优先级 | 一句话 | 复现要点 | 证据 | 建议 |
|---|---|---|---|---|---|---|
| C-D1 | S2 | P1 | 公开房源卡与详情页按 `listings.photo_count`（12）显示「1 / 12」与 12 格拼图，而房源只有 2 张照片；工作台同一套房显示「1 / 2」 | 匿名 `/listings` 看 77 Sitetest 角标；`GET /api/listings/search` → `photo_count:12`，`GET /api/listings/test-77-…` → `images.length 2`；SQL `photo_count=12, jsonb_array_length(images)=2`（`updated_at 2026-10-26`，`listingPublish.ts:481` 只在带照片的 PATCH 里同步 `photo_count`，其它路径可能写了 12） | `shots/c-listings-1280.png` `c-detail77-1280.png` `api-probe.out` | 卡片 / 详情用 `min(photo_count, images.length)` 或直接 `images.length`；查哪条路径把 `photo_count` 写成 12（编辑页 `[id]/edit/page.tsx:134` 用 `photos.length`，AI 识图 / 导入？） |
| C-D2 | S2 | P2 | 快捷发布 / 向导 / 编辑页写的 `pets_allowed`（yes / restricted / no）在公开卡片事实行与 `pets=1` 筛选里都被忽略，只认旧的自由文本 `pet_policy`：房东勾了「允许」的房源不显示「允许宠物」、筛「宠物友好」也找不到它（详情页正确显示「允许」） | `GET /api/listings/search?pets=1` 不含 77 Sitetest（`pets_allowed='yes'`、`pet_policy=null`）；卡片 `card-facts` 为空；`cardFacts.ts:81` 与 `search/route.ts:78,93` 只读 `pet_policy` | `api-probe.out`、`anon-agents_listings_en.json.listings.cards[0]` | `cardFacts` 与筛选同时看 `pets_allowed`（yes → 允许宠物 / restricted → 有限制 / no → 不出现在 pets=1）；`CARD_COLUMNS` 加 `pets_allowed` |
| C-D3 | S3 | P3 | `/api/listings/search` 每条只回 1 张图了，但 data URL 照片仍让 6 条响应 375 KB（上轮 C-S3-1 的后半：照片未进 Storage） | `curl -s …/api/listings/search \| wc -c` | `api-probe.out` | data URL 照片入桶后存 URL |
| C-D4 | S3 | P3 | 不存在 / 已下架房源页 HTTP 200（上轮 C-S3-4 沿用） | `curl -o /dev/null -w '%{http_code}' …/listings/nope-xyz` → 200 | `api-probe.out` | 服务端 `notFound()` 或 `noindex` |
| C-O1 | 观察 | — | 房源详情页一次加载发 `GET /api/listings/<slug>` 3 次 + `POST /api/listings/enrich` 2 次（生产，无 StrictMode） | 打开详情页看 network | `anon-agents_listings_en.json.listings.detail77.reqs` `extra.json.avondaleReqs` | 合并到 1 + 1（用户本机走 VPN，串行波数敏感） |
| C-O2 | 观察 | — | 分享包文案把房源 `description` 原样塞进正文（这里是上轮测试写入的「[TEST] edited by service role…」）；真实房东的描述是双语整段时会把两种语言都贴出去 | 打开分享包任一页签 | `shots/v-375-share-panel.png` | 按面板语言只取对应语言的那段（详情页已有拆分逻辑） |

## 未执行 / 限制
- 快速发布第二屏（识图后）的首次入住勾与定价卡未跑（不耗模型）；上轮 C-20 发布流程、C-24 updated_at 防覆盖、C-25 / C-26 回滚探针本轮未重跑（抽样范围外；C-S3-5 `is_test` 可被房东改掉的问题未复测）。
- 下架提醒卡 / 「记下：已发」/ 「已撤下」没有真点（会在 `listing_syndications` 留行）。
- MLS® 交接只核对了胶囊状态与按钮，没有发起 / 撤回请求（① / ④ 组范围）。

## 数据副作用
- `listing_share_links` kijiji `e96ur7cn`：clicks 0 → 1，`last_clicked_at = 2026-10-28 18:31:18+00`（C-11 真实 GET 一次；预览 UA 四次未计数）。
- `listings.enriched_at`（77 Sitetest、Avondale）被匿名详情页访问刷新（按设计缓存）。
- 向导草稿只写了浏览器 localStorage（已清）；快速发布页只输入未发布。
- 海报下载 1 次（审计可能记 `poster` 读取）；无任何行插入 / 更新 / 删除。
