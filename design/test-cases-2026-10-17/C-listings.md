# C · 房源（2026-10-17 全站测试）

风险等级 R2（CLAUDE.md「PropTx 接入前的结构性改造」起公开页改走服务端接口并撤销 anon 读表，属权限面）。
环境：生产 `www.stayloop.ai`；在架房源 5 套（全部 `is_test=true`）：`test-200-test-qa-lane-qa2`（muse-landlord）、`test-100-test-qa-lane-ojbc`、`605-28-avondale-ave-…-mr9vmlor`（北约克，2 卧 $4,500）、`1569-rue-st-hubert-montr-al-qc-…-mr33ii5a`（魁北克，$2,225）、`238-simcoe-st-mqyimf8x`（3 卧 $6,500）。
Realtor 导入行 114 套已全部归档（`is_active=false, status='archived'`）。
测试账号：landlord-test（landlords.id `80646b6a…`，authId `30d0c280…`）、muse-landlord（landlords.id `fd48f17f…`，authId `22770dec…`）。
工具：curl（匿名 / JWT）、无头 Chrome + CDP（scratchpad `sitetest1017/C/`）、Supabase `execute_sql` 只读或回滚事务。

## 用例

| ID | 风险 | 前置 | 步骤 | 期望 | 关联守卫 / 依据 |
|---|---|---|---|---|---|
| C-01 搜索接口基本形状 | R2 | 匿名 | `GET /api/listings/search` | 200；`{items,total,page,pages,page_size:100}`；`Cache-Control: no-store`；items 只有 CARD_COLUMNS（无 description / price_history / broker_phone）；5 条全部 `is_test=true` | `trrebReady` 8.27 / 8.13 |
| C-02 筛选参数 | R2 | 匿名 | `?min=4000`、`?beds=3`、`?q=simcoe`、`?source=stayloop`、`?source=realtor`、`?pets=1`、`?move_in=2026-11-01` | 各自只返回符合条件的行；`source=realtor` 为 0（全部归档）；`pets=1` 时无 pet_policy 的行不出现 | search route |
| C-03 排序 | R2 | 匿名 | `?sort=price_asc` / `price_desc` / 非法值 | 单调；非法值按 newest（created_at desc）处理，不报错 | search route |
| C-04 分页与 ≤100 | R2 | 匿名 | `?page=0`、`?page=1`、`?page=99999`、`?page=-1`、`?page=abc` | 每页 ≤100；超范围返回 `items:[]` 且 200（PGRST103 处理）；负数 / 非数按 0 | 8.27 |
| C-05 bbox | R2 | 匿名 | `bbox=43.7,-79.5,43.8,-79.3`（含 Avondale）、反向 `bbox=43.8,-79.3,43.7,-79.5`、`bbox=a,b,c,d`、`bbox=1,2,3` | 有效框只返回框内有坐标的行（无坐标的 QA Lane 不出现）；反向框 0 行不报错；非法框被忽略（返回全部） | search route |
| C-06 ids 收藏快照 | R2 | 匿名 | `ids=<avondale id>,<非法>,<QA Lane id>` | 只返回合法 uuid 对应的行 | 收藏 `extraFavs` |
| C-07 限流存在 | R2 | 匿名 | 只验证代码路径（240/h fail-open）；不打满 | 不触发；记录预算 | 8.13 |
| C-08 详情接口可见性 | R1 | 匿名 / 房东 JWT | `GET /api/listings/<在架 slug>`、不存在 slug、已归档 realtor slug、`[TEST] 100 Test Ave`（verified 但 is_active=false）、pending 草稿（C-20 产生）匿名 vs 房东本人 | 在架 200 + `{listing, owner:false, similar}` 且无 broker_phone / realtor_check；其余 404；pending 对匿名 404、对本人 200 `owner:true` | `[slug]` route |
| C-09 详情接口 similar 规则 | R2 | 匿名 | Avondale（有坐标）与 Simcoe；QA Lane（无坐标无社区） | 有坐标者 similar 为数组且每条带距离 / 档位，>6 km 不入选（蒙特利尔不会出现在多伦多房源的相似里）；无坐标无社区者 `similar:null` | `listingSimilar` |
| C-10 anon 直读表被拒 | R1 | 匿名 anon key | `GET <SUPABASE>/rest/v1/listings?select=id&limit=1` | 401/403（42501） | 10-11 迁移 `listings_anon_no_select` |
| C-11 浏览页（匿名，1280） | R2 | 无头 Chrome | 打开 `/listings`；看工具栏一行（搜索框 / 筛选 / 收藏 / 计数 + 排序）；来源分组标题；卡片测试标签；无横向溢出 | 5 张卡 + 「测试房源」标签；计数「共 5」；分组标题只在「全部来源」时出现 | `listingsToolbar20261003` `testListings20261013` |
| C-12 浏览页筛选 / 排序交互 | R2 | 同上 | 输入「simcoe」（防抖）→ 1 张；清空；排序价格升序 → 第一张 $2,225；筛选面板「来源 Realtor.ca」→ 0 张空态 | 与接口一致；页码回 1 | listings page |
| C-13 浏览页手机 375 | R3 | 同上 | 375 宽打开 `/listings` | `documentElement.scrollWidth==clientWidth`；工具栏折两行；「地图」浮动按钮 | 08-24 手机规矩 |
| C-14 详情页各节（Avondale，zh 与 en） | R2 | 同上 | 打开 `/listings/605-28-avondale-…`；检查：H1、测试标签、经纪 / 房东行、照片拼图、「整套公寓 · N 卧」行、价格一行（$/ft²、上架 N 天）、租赁条件 POLICIES、入住前费用一览（安省：押金行 + 划掉的申请费等）、租客保险报价卡「Rates.ca」、租金记录（匿名只看最新一行、其余模糊 + 登录链接）、交通 / 地图、关于社区（AI 简介 / 瓦片）、相似房源、数据声明；en 下无中文、zh 下无英文（地址 / 品牌除外） | 各节存在且文案正确；单语 | `listingDetail20250925` `listingLang20261002` `listingExtras20261010` |
| C-15 详情页魁北克分支 | R2 | 同上 | 打开蒙特利尔 slug | 租赁条件写 CCQ 1904 / TAL 格式；入住前费用「押金 · 不得收取」；无 RTA / LTB / OHRC / RECO 字样；无 TRREB / 安省对比瓦片；不推荐 RECO 经纪 | `provinceListing20261002` |
| C-16 相似房源地段规则（页面） | R2 | 同上 | Avondale 页底「相似房源」；Simcoe 页；QA Lane 页 | 6 km 内无合格者显示 `similar-empty`「附近 6 km 内暂无…」+「查看全部房源」；不拿远处凑数 | `listingSimilar20261002` |
| C-17 租金记录匿名模糊 | R2 | 匿名 vs tenant-test 登录 | Avondale 的价格记录节 | 匿名：最新一行清晰、其余 blur + 🔒 登录链接（若只有 1 行则不模糊）；登录后全部可见 | `listingExtras20261010` |
| C-18 详情页手机 375 / 320 | R3 | 同上 | Avondale 与魁北克页 | 零横向溢出；标题行分享 / 收藏换行到下一行 | 10-11 容器规矩 |
| C-19 已归档 / 不存在详情页 | R2 | 匿名 | `/listings/609-195-mccaul-street-toronto-hi7la`、`/listings/nope-xyz` | 404 页（不是 500；`generateMetadata` 不崩） | |
| C-20 快速发布（landlord-test） | R2 | 魔法链接登录 | `/dashboard/listings/quick`：地址 `[TEST] 77 Sitetest Rd, Toronto`，月租 2650，2 张 `public/home/film/*.webp`，「让 AI 看照片填其余」1 次 → 第二屏；押金填 5000 触发合规红框（RTA s.106）；改回 2650；填宠物 / 吸烟 / 租期；发布 | 识图返回 guess（置信度标「AI 识别」）、面积只作建议；合规 `quick-compliance` 出现并随押金改正消失；发布 → `/dashboard?new=<slug>`；库里行 `verification_status='pending'`、`is_active`、`source='stayloop'`、`is_test=false`（新发布默认）、`images` 2 张；**不去后台核验** | `quickPublish20261013` |
| C-21 快速发布重复地址 | R2 | 同上，C-20 之后 | 再次输入同一地址 → 读照片或发布 | `quick-existing` 琥珀提示 + 「重新上架」 | `listingPublish` |
| C-22 快速发布接口边界 | R2 | JWT / 匿名 | `POST /api/listings/quick-draft`：匿名 → 401；无 address → 400；photos 为空 → 400；非 data URL → 400 | 状态码如期；**不消耗模型**（校验在限流之前） | quick-draft route |
| C-23 五步向导草稿恢复 | R2 | 登录 | `/dashboard/listings/new` 填地址到第 2 步 → 离开 → 回来 | `wizard-draft-restored` 横幅 + 「清空重来」；localStorage `sl-listing-wizard-draft` | 10-12 P1-4 |
| C-24 编辑页 updated_at 防覆盖 | R2 | 登录 + service role | 打开 C-20 房源的编辑页 → 用 service role 改 `description` → 页面「保存修改」 | 页面提示「被改过…没有保存」，库里 description 仍是 service role 写的值 | `draftExisting20260930` |
| C-25 下架后看房卡作废（只读） | R2 | SQL | 查触发器 / 函数（`listings` 下架 → `agent_pending_actions` showing 卡 expired）定义；回滚事务：对 C-20 房源插一张 pending `showing_request` 卡 → `update listings set is_active=false` → 卡 status | 卡变 `expired`；rollback | `sweep20261001` |
| C-26 display_* 列（回滚事务） | R1 | SQL | 房东本人 JWT claims 下 `update listings set display_internet=false` → 原值不变（守卫）；service role 设 `display_address=false` 后 `GET /api/listings/<slug>`（匿名）地址清空、`listing-address-withheld` | 守卫还原；接口清空地址 | `trrebReady` 8.14 |

## 执行记录

证据目录 `scratchpad/sitetest1017/C/`（`probe.sh` / `probe.out` 接口探针；`anonA.mjs` / `anonA.out` + `c1*.png` 匿名浏览器；`landlordC.mjs` / `landlordC.out` + `c2*.png` 房东登录）。
无头 Chrome 的 `navigator.language` 为 en-US，所以首轮页面是英文版；中文版通过 `localStorage stayloop_lang=zh` 再跑（蒙特利尔页、QA Lane 页为中文）。

| ID | 实际 | 证据 | 结果 |
|---|---|---|---|
| C-01 | 200；`{items:5,total:5,page:0,pages:1,page_size:100}`；`cache-control: no-store`、`x-content-type-options: nosniff`；items 键 = CARD_COLUMNS（无 description / price_history / broker_phone）；5 条 `is_test=true`。**注意**：`images` 列整列返回——两条 QA Lane 的照片是 data URL，5 条响应 153 KB | probe.out「C-01」 | 通过（见 C-S3-1 备注） |
| C-02 | `min=4000` → [4500,6500]；`beds=3` → Simcoe；`q=simcoe` → 1；`source=stayloop` → 5；`source=realtor` → 0；`pets=1` → 2 条（只有 pet_policy 非空的）；`move_in=2026-11-01` → 5；`max=2300` → [2300,2225]；`q=%')，` 等 PostgREST 元字符被剥掉不报错；`beds=abc` / `min=-5` 当作无过滤 / 0 | probe.out | 通过 |
| C-03 | price_asc 单调升 2225→6500；price_desc 单调降；`sort=zzz` 按 newest | probe.out | 通过 |
| C-04 | `page=1` → `items:[]` 200（PGRST103 处理）；`page=99999` → 钳到 1000，空页 200；`page=-1` / `page=abc` → 第 0 页 | probe.out | 通过 |
| C-05 | `bbox=43.7,-79.5,43.8,-79.3` → 只有 Avondale（无坐标的 QA Lane 不出现）；反向框 → 0 行 200；`bbox=a,b,c,d` / `bbox=1,2,3` 被忽略 → 全部 5 条 | probe.out | 通过 |
| C-06 | `ids=<Avondale>,not-a-uuid,<QA Lane>` → 2 条，非法值丢弃 | probe.out | 通过 |
| C-07 | 只核对代码：anon 240/h、登录 1200/h，fail-open；本轮未打满（共享出口 IP） | search route | 通过（代码核对） |
| C-08 | 在架 4 个 slug → 200 `owner:false`，无 broker_phone / realtor_check / management_company，79 列；`nope-xyz` / 已归档 Realtor / `[TEST] 100 Test Ave`（verified 但下架）→ 404 `not_found`；pending 草稿对匿名 / 房东本人见 C-20 之后的记录 | probe.out「C-08/09」 | 通过 |
| C-09 | Avondale / Simcoe / 蒙特利尔 → `similar:[]`（6 km 内无合格者，三套互相 >6 km）；QA Lane（无坐标、无社区）→ `similar:null` | probe.out | 通过 |
| C-10 | anon key `GET /rest/v1/listings?select=id&limit=1` → 401 `42501 permission denied for table listings` | probe.out「C-10」 | 通过 |
| C-11 | 1280 英文版：工具栏一行（搜索框 36px 高、top 77；筛选；♡ Saved 0；「5 listings」+ 排序三项）；来源分组标题「DIRECT FROM LANDLORDS · STAYLOOP · 5 · Only this source →」；5 张卡每张「Test listing · not a real rental」；无横向溢出；控制台无错；只发一次 `/api/listings/search?sort=newest&page=0`。**注意**：卡片设施 chip 原样打印双语串「厨房 / Kitchen」「专用工作空间 / Dedicated Workspace」；`<title>` 是「房源 · Stayloop」而正文英文 | c11-listings-1280.png · anonA.out | 通过（C-S3-2 / C-S3-3） |
| C-12 | 输入 simcoe（防抖）→ 1 张 + 「1 listings · filtered」，请求 `?q=simcoe`；清空后排序 price_asc → 第一张蒙特利尔 $2,225，请求 `?sort=price_asc`；来源按钮：Realtor.ca 按钮按设计只在页面上有 Realtor 行时显示（`page.tsx:444`），现在全部归档所以没有该按钮，`source=realtor` 只经接口验证（0 行） | anonA.out c12_* | 通过 |
| C-13 | 375：`scrollWidth 375 == clientWidth`；浮动「Map」按钮；输入框 16px | c13-listings-375.png | 通过 |
| C-14 | Avondale 英文版各节齐全：H1 地址、测试标签「Test listing · not a real rental · for demonstration only」、About / Lease terms & policies（宠物·吸烟·家具·租期·押金 Not stated，车位「1 Free Indoor Parking Spot」，RTA s.14 / s.105–106 一句）/ Features（室内 + In the building）/ Move-in costs（首月 $4,500、押金「Not set by landlord」、钥匙押金「Per lease」、合计 $4,500、Not permitted in Ontario 列表）/ Tenant insurance（Rates.ca `target=_blank`、「Quotes by Rates.ca」）/ Building / Rent history（1 行「2026-07-06 Listed $4,500」+「full history … signed-in users only」）/ Location & transit（Sheppard-Yonge 360 m、North York Centre 1.2 km、OSM 署名、Google Maps 链接）/ About Yonge & Sheppard / Want to see it? / Similar homes nearby（`similar-empty`）/ 数据声明 + 48 小时更正通道；AVM 瓦片「61% above the CMHC survey average」+ CMHC 来源句；英文页正文零 CJK；中文版（蒙特利尔页）正文拉丁串只有地址与社区名 | c14-avondale-en.png · anonA.out c14_* | 通过 |
| C-15 | 蒙特利尔中文版：租赁条件写《魁北克民法典》第 1904 / 1901 / 1895 条、TAL 强制表格；入住前费用「押金（含钥匙押金、宠物押金）不得收取」、合计 = 首月；AVM 瓦片「暂无同区对比数据」、无 CMHC 来源句、无 TRREB；页面正文无 RTA / LTB / RECO / 安省（匹配到的 OHRC / RTA 两处都在页脚公司级文案「PIPEDA · OHRC · RTA 合规」，CLAUDE.md 10-06 节记录为有意未改）；联系卡无 RECO 经纪推荐 | c15-montreal-zh.png · anonA.out c15 | 通过 |
| C-16 | Avondale / Simcoe / 蒙特利尔：`similar-empty`「附近 6 km 内暂无户型、租金相近的在租房源 · 查看全部房源 →」；QA Lane（无坐标无社区）：整节不渲染（接口 `similar:null`） | anonA.out | 通过 |
| C-17 | 在架 5 套 `price_history` 都只有 1 行（「上架」），按 `RentHistory.tsx:26` `gated = !signedIn && rows.length > 1` 只有 1 行时不模糊——线上无法观察到模糊态；匿名页显示唯一一行 + 「完整的历史记录只对登录用户开放」；登录态见 D 组 `c17_signedIn` | anonA.out · RentHistory.tsx | 通过（模糊态只做了代码核对） |
| C-18 | Avondale 与蒙特利尔页 375 / 320：`scrollWidth == clientWidth`；375 下分享按钮 top 199 > H1 bottom 155（换到标题下一行） | c18-avondale-375/320.png | 通过 |
| C-19 | 三个不存在 / 已下架 slug：页面渲染「房源未找到 · 这套房源可能已下架 · 返回房源列表」，接口 404，无 JS 异常；**HTTP 状态仍是 200**（预渲染的客户端壳） | anonA.out c19_* | 通过（C-S3-4） |
| C-20 | landlord-test 魔法链接登录（无条款弹层，已接受 2026-10-16 版）→ `/dashboard/listings/quick`：地址 `[TEST] 77 Sitetest Rd, Toronto`、月租 2650、省份自动 ON、2 张照片（`public/home/final-interior.jpg` + `film/david-lobby.webp`，预览 2 张）→「Let AI Agent fill in the rest」→ 1 次 `/api/listings/quick-draft` 200 → 第二屏：「What AI Agent saw」写明第二张「is an illustrated character and does not depict the unit」，类型 condo / 卧 1 带「AI」标、设施 large_windows / view / concierge 带「AI」标，面积留空且无估值按钮（模型没给估计）；押金填 5000 → `quick-compliance`「⚠ Deposit $5,000 exceeds one month's rent $2,650.」，改回 2650 → 消失；宠物 Allowed、吸烟 No、租期 12 months 后标题 / 描述按字段重生成（中英各一段）；「Publish (public after review)」→ 无 TRESA 弹层（该账号无经纪档案）→ `/dashboard?new=test-77-sitetest-rd-toronto-x2xa`，工作台卡片「PENDING · NOT PUBLIC」。库行：`verification_status=pending · status=draft · is_active=true · source=stayloop · is_test=false · pets_allowed=yes · smoking_policy=no · lease_term=12 months · deposit=2650 · images 2 张 data URL（283 KB / 99 KB）`。**未去后台核验** | c20-step1/step2/deposit-5000/dashboard.png · landlordC.out · c20_row | 通过 |
| C-08（补） | 新草稿 slug：匿名 → 404；房东本人 JWT → 200 `owner:true · verification_status:pending · similar:null`，无私有列。（第一次用 25 分钟前的 JWT 探得 404，换新 JWT 即 200——记录为探针问题，不是缺陷） | landlordC.out c08_owner · curl | 通过 |
| C-21 | 回到快速发布页输入同一地址 + 月租，等 3 秒：`quick-existing` 未出现。读代码（`quick/page.tsx:118`）：重复地址检查只在「让 AI 看照片」之后（`readPhotos` 末尾）和发布时跑，输入地址时不查——房东要先花一次识图才知道地址重复（五步向导是在「下一步」时查）。为省识图预算未再触发第二次 AI | landlordC.out c21 · 代码 | 未完全执行（见 C-S3-6） |
| C-22 | 匿名 POST → 401 `unauthorized`（在限流与模型之前）；无 address / 空 photos / 非 data URL 的 400 分支按代码核对（`route.ts:34-36`，都在 `underHourlyLimit` 之前），未用 JWT 实打以免误触每用户 10 次 / 全站 200 次的 fail-closed 限流计数 | probe.out「C-22」· route | 通过（部分代码核对） |
| C-23 | 向导第 1 步填地址 `[TEST] 99 Wizard Draft St, Toronto` →「Next · Photos」→ localStorage `sl-listing-wizard-draft` 带地址与 step 2 → 离开到 `/dashboard` 再回来 → 横幅「Your unfinished draft was restored (photos must be chosen again). Start over」+ STEP 2；「Start over」→ 草稿清空（刷新后页面立刻又存了一份空表单，`hasContent` 为假所以不会再恢复——无害） | c23-wizard-restored.png · landlordC.out c23_* | 通过 |
| C-24 | 打开新草稿的编辑页 → service role `PATCH description`（updated_at 03:49:27）→ 页面改标题、「Save changes」→ 提示「This listing changed after you opened the editor … nothing was saved. Reload, then edit again.」；请求带 `updated_at=eq.<旧值>` 匹配 0 行；库里 description 仍是 service role 写的值、title 未变 | c24-stale.png · landlordC.out c24_* | 通过 |
| C-25 | 回滚事务：插一张 pending `showing_request` 卡（metadata.listing_id = QA Lane）→ `update listings set is_active=false` → 卡 `status='expired'`，`execution_result {ok:false, reason:'listing_inactive'}`（触发器 `trg_listings_expire_showing_cards`） | execute_sql | 通过 |
| C-26 | 回滚事务、muse-landlord 本人 claims：`update display_internet/display_address/display_avm=false, feed_updated_at=now(), verification_status='pending', is_test=false` → 前五项全部被守卫还原；**`is_test` 被改成了 false**（房东可自己改掉「测试房源」标记）；`updated_at` 被刷新 | execute_sql | 通过（C-S3-5） |

## 缺陷

| 编号 | 严重度 / 优先级 | 一句话 | 复现要点 | 证据 | 建议 |
|---|---|---|---|---|---|
| C-S3-1 | S3 / P3 | `/api/listings/search` 的 `images` 整列原样返回，data URL 照片让 5 条响应达 153 KB | 匿名 `GET /api/listings/search`，QA Lane 两条的 `images` 是 base64 data URL | probe.out「C-01」 | 卡片只返回前 1–3 张且仅 http(s) URL；data URL 照片上传到 Storage 后改存 URL |
| C-S3-2 | S3 / P3 | 列表卡片设施 chip 原样打印双语串「厨房 / Kitchen」「专用工作空间 / Dedicated Workspace」，英文界面出现中文 | 英文 1280 开 `/listings`，看设施 chip | c11-listings-1280.png · anonA.out | chip 按语言取一半或走设施词典 |
| C-S3-3 | S3 / P3 | 列表页 `<title>` 是中文「房源 · Stayloop」而英文界面正文是英文 | 英文开 `/listings` 读 `document.title` | anonA.out | title 随语言（客户端更新，注意首屏不按客户端状态分支） |
| C-S3-4 | S3 / P3 | 不存在 / 已下架房源详情页 HTTP 状态仍是 200（客户端壳渲染「未找到」） | `curl -I /listings/nope` → 200；接口 404 | anonA.out c19_* | 可接受则标按设计；要避免软 404 被收录，加 `noindex` 或服务端 `notFound()` |
| C-S3-5 | S3 / P2 | 房东可自己把 `listings.is_test` 改成 false（守卫只还原 display_* 等列），「测试房源」标记可被去掉 | 回滚事务：muse-landlord claims `update listings set is_test=false …` 成功 | C-26 · execute_sql | `guard` 里把 `is_test` 纳入非管理员不可改列；同时查 INSERT 路径 |
| C-S3-6 | S3 / P3 | 快速发布重复地址检查只在「让 AI 看照片」之后跑：房东要先耗一次识图才知道地址重复 | 输入已有地址 + 月租，等 3 秒无 `quick-existing`；读代码 `quick/page.tsx:118` | landlordC.out c21 · 代码 | 地址输入失焦时就查重（C-21 未再触发第二次识图，仅代码核对） |
| C-S3-7（新） | S3 / P3 | 快速发布产生的 `[TEST] …` 地址房源库里 `is_test=false`，不会被标「测试房源」；与 C-S3-5 同根，需人工置位 | C-20 草稿行 `is_test=false`，地址带 `[TEST]` | C-20 `c20_row` | 地址以 `[TEST]` 开头或测试号发布时自动 `is_test=true`；至少在核验页提示 |

## 数据副作用

- C-20：landlord-test 快速发布草稿房源 `test-77-sitetest-rd-toronto-x2xa`（`[TEST] 77 Sitetest Rd, Toronto`，pending · is_active=true · is_test=false，2 张 data URL 照片），并耗 1 次 `quick-draft` 模型调用。**未去后台核验，未删。**
- C-23：向导第 1 步仅写浏览器 localStorage `sl-listing-wizard-draft`（已点「Start over」清空），库里无行。
- C-24：对上述草稿用 service role `PATCH description`（03:49:27）一次，库里 description 为该测试值。
- C-25 / C-26：均 `begin … rollback`，无残留。
- 其余 C 组请求为匿名只读。登记，不删。
