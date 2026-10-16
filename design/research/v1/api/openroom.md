# Openroom（对标摘要 · 2026-10-13）

**结论：没有开发者 API。** 首页、定价页、条款页都没有 API 字样；唯一的「集成」是 BureauEdge 年度套餐里的「接进 Yardi / Buildium / PayProp」，属于定制交付。它是安省已注册的消费者报告机构（2025-07），定价与条款对我们是**反面参照**（注册后能做什么、条款怎么写）。

| 项 | 现状 | 证据 |
|---|---|---|
| 文档结构 | 无开发者文档；产品页（Tenant Screening / Legal Research / Rental Debt Ledger / BureauEdge）+ 定价 + 条款 | https://www.openroom.ca/ ："Openroom is registered as a Consumer Reporting Agency (CRA)" |
| 数据来源 | 「收集公开租赁记录并接到信用体系」；法庭 / 审裁处判令来自社区众包与信息自由申请；信用局伙伴 Equifax（2024-08） | https://www.openroom.ca/ ："Openroom collects public tenancy records and connects them to the broader financial credit system" |
| 定价 | Community $0（每次搜索最多 10 条结果）；Plus $10/月（每次 100 条）；Rental Debt Ledger 每案 $188；BureauEdge 年度定制、按管理单元数计价，含无限 ledger 与 PMS 集成（30–5,000 单元的物业公司） | https://www.openroom.ca/pricing ："up to 10 results per search query"、"Scales by number of managed rental units" |
| 鉴权 / 限流 | 不适用；「每次搜索 N 条」是它的限流形态 | — |
| 条款对自动化 | 11(d) 禁止 "use any data mining, robots, or similar data gathering or extraction methods"；11(k) 禁止 "copy or store any significant portion of the Content"；11(e) 禁止用于 "building a similar or competitive offering"；8(b) 禁止 "sharing or granting access in any of the foregoing to any third party" | https://www.openroom.ca/terms |
| 条款对 AI | 3(a)(iii) 用户授予它 "train and otherwise use the artificial intelligence models" 的许可（对用户数据）；3(a)(iv) 聚合数据 "for any purpose and without obligations of any kind" | https://www.openroom.ca/terms |
| 地域 | 22 条 "We provide the Site for use only by persons located in Canada"（魁北克除外） | https://www.openroom.ca/terms |

**对我们的启示**：① 同类数据持有者一律在条款里禁抓取、禁再分发、禁用于竞争产品，并把 AI 训练许可写在用户数据上——我们的 API 条款至少要有前三条；② 它注册后仍**不**对外开 API，只做「按结果数限流的站内搜索」+「按单元数计价的企业集成」——说明「按姓名查记录」这类能力，注册只是门槛，开放给第三方 AI 另有责任边界（见主稿 D4）。
