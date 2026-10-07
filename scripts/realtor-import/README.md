# Realtor.ca 批量导入（示范阶段 · TRREB 未接入）

上三轮（2026-09-06 · 10-02 · 10-03）的脚本都留在会话 scratchpad 里，会话一关就没了；这一份（2026-10-06 那轮用的）放进仓库。
全部走 Jina reader 读 Realtor.ca 页面，service role 直接写 `listings`；数据文件（`lists/` `details/` `plan.json` `parsed.json`
`inserted.json`）放在一个工作目录里，脚本里的 `S` 指向它——用前把 `S` 改成你的工作目录。

1. `fetch.sh <url> <out.md>`：读一个页面（被反爬验证页拦时经 Jina 代理池重试一次），需要 `JINA_KEY` 环境变量。
   列表页 `https://www.realtor.ca/on/<city>/<slug>/rentals`（每页只渲染 11 行；不存在的 slug 返回「MLS® & Real Estate Map」页，行数 0）。
2. `plan.mjs`：按区域配额从列表页挑候选——排除库里已有的 MLS（`existing_mls.json`）与同一楼 / 同一街址（`existing_streets.json`），
   排除 < $1,000、房间 / 车位、无卧室；按 1 房 / 2 房 / 3 房+ 的目标数均衡。两份 existing 文件从库里导：
   `select jsonb_agg(mls_number) … / jsonb_agg(address) … where source='realtor'`。
3. `details.mjs [--only=MLS,…]`：读详情页并解析。Realtor 详情页有两种渲染：A（`# 地址` + `## Listing Description` + 「标签 / 值」缩进）
   与 B（`## 地址`，全部空行分隔，没有 Listing Description 标题，描述紧跟 Square Feet）——解析器按已知标签表取值，两种都认。
   坐标优先取页内「Directions」链接里的 `destination=lat,lng`（B 版没有）→ 再用 Nominatim 结构化查询（核对 FSA 或城市）。
   规则：地下室 / LOWER 单元 → `basement`、房子的 MAIN / UPPER / FRONT 单元 → `apartment`、楼上商铺的「Residential Commercial Mix」→ `apartment`；
   部分单元不带整栋房子的面积，车位数 > 2 时也不采信（那是整栋的）；「Total 2 / Partial 1」= 1.5 卫。每行带 WARN，逐条看。
4. `insert.mjs [--write]`：`reject.json`（剔除的 MLS）+ `overrides.json`（逐户覆盖字段）→ 一次 POST；缺坐标 / 邮编 / 描述 / 照片 < 3 的拒绝写入。
5. `transit.mts`（`npx tsx`，放在仓库根目录下跑，用 `@/lib/listingInsights` 同一套 Overpass 查询与挑站逻辑）：本机慢速（4 秒一套）查站点写回；
   生产边缘路由在一批里连续查会被 Overpass 429。跑完再对失败的重跑一次（`transit_done.json` 记录已完成的）。
6. `translate.mjs`：对每套调生产 `/api/listings/enrich {id, lang:'zh', only:'translations'}`（每 IP 每小时 90 次）；社区简介由事实调用 `{id}` 在后台生成。

写库前的核对清单见 CLAUDE.md「Realtor.ca 再导入 50 套」两节（解析器的系统性问题）。
