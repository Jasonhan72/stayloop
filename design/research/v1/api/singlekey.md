# SingleKey（对标摘要 · 2026-10-13）

**结论：没有公开的开发者 API。** 官网、合作页、条款页都读不到任何 API / 开发者门户 / SDK 字样；条款页与合作页对自动化抓取返回 403 / 重定向循环，所以「条款里对 AI 使用的规定」**读不到，如实记录**。

| 项 | 现状 | 证据 |
|---|---|---|
| 文档结构 | 无开发者文档。首页只有产品页（Tenant Screening / Pre-Screen / eLease）、"Trusted by" 公司 logo 墙（RealPM、Rent Panda、RPM 等） | https://www.singlekey.com/ ："Credit, income, background, and eviction checks" |
| 鉴权 | 不适用（无 API） | — |
| 定价 | 面向房东按份：第三方评测写 "starts at $29.99 per report"；Pre-Screen 与 eLease 标 FREE | https://www.itechguides.com/best/tenant-screening-software/ ；首页 "FREE" 标签 |
| 限流 | 不适用 | — |
| 数据来源 | 帮助中心：五层——局方信用报告、ID 核验、文件核验、银行核实收入、驱逐与公共记录；旧资料写 Equifax Canada + CERTN | https://intercom.help/singlekey-inc-b5dbefcc212f/en/articles/16417437-why-should-i-use-singlekey-for-tenant-screening |
| 条款对 AI / 自动化 | **读不到**（`/en/terms-of-service` 403，`/en/partners` 重定向循环） | 本机 curl 2026-10-13 |
| 与 Stayloop 的差异 | 它是已注册的消费者报告机构（2025-02 注册，见 `design/consumer-reporting-act-research-2026-10.md`），报告按份卖给房东；接入方式是「嵌进物业管理软件」而不是开放 API | — |

**对我们的启示**：这一类产品把「筛查」当成终端产品卖，不开放给第三方 AI。Stayloop 在 CRA 注册前更不能开放筛查；注册后若开放，也应像它一样只对**房东身份**的接入方开放，并记录申请人同意。
