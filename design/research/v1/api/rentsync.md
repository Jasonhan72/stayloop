# Rentsync / Rentals.ca（对标摘要 · 2026-10-13）

**结论：没有公开 API 文档；对外是「feed 被房源站定时拉取」的同步模型，接入靠账户经理。** Rentals.ca 的条款页对所有已知路径返回 403（`/terms-of-use`、`/terms`、`/terms-and-conditions`，本机 curl 带浏览器 UA 仍 403），**条款里对自动化 / AI 的规定读不到**。

| 项 | 现状 | 证据 |
|---|---|---|
| 文档结构 | 只有帮助中心文章，解释 feed 的刷新节奏，没有端点 / 鉴权 / schema | https://help.rentsync.com/why-isnt-my-listing-updating-on-rental-listing-sites ："Core data such as rent and availability is pulled… approximately every 2 hours" |
| 接入形态 | 房东 / 物业公司在 Rentsync 后台维护房源 → Rentsync 生成 feed → Rentals.ca Infinity Network 各站按计划拉取；接 Yardi / Buildium 等 PMS 的账户，Rentsync 每天最多拉 4 次 | 同上："Rentsync pulls integration feeds up to four times per day" |
| 集成伙伴 | Yardi、RentCafe、MRI、ResMan、Rent Manager、Buildium、Hopem、Sage、QuickBooks、Salesforce、Zapier；未列的软件可提交请求 | https://rentsync.com/integrations ："Partnering with the best in the industry" |
| 鉴权 / 限流 / 定价 | 页面不写；定价页存在但无数字 | https://rentsync.com/integrations |
| 条款对 AI / 自动化 | **读不到**（403） | 本机 curl 2026-10-13 |
| 与 Stayloop 的关系 | 我们已有一封询问其网络付费授权的草稿 `design/rentsync-inquiry-email-2026-10.md`（是否发送由用户定）；对方模型是「拉我们的 feed」而不是「给我们 API」——如果谈成，我们要做的是**输出**一个符合其规格的 feed，而不是消费它的 API | — |

**对我们的启示**：房源分发行业的事实标准是「生产方出 feed，渠道方拉」。我们对外的房源读 API 也应提供同样形态（带 `updated_at` 的全量 / 增量导出），而不是只有逐条查询。
