# TaxJar / Avalara AvaTax（非房产「规则 / 合规类 API」范例 · 2026-10-13）

两家都是「把法规做成确定性 API」的生意，和我们的 `rules.ts` / `provinces/rules.ts` 同类。TaxJar 文档完整可读；Avalara 的文档站部分页面 404，定价不公开。

## TaxJar（developers.taxjar.com）

| 项 | 现状 | 证据 |
|---|---|---|
| 文档结构 | Introduction（端点 + 客户端库）→ Authentication → API Version → Billing → Countries → Sales Tax API（Categories、Taxes …）；每个端点带 cURL / Ruby / Python / PHP / Node / .NET / Java / Go 八种示例 | https://developers.taxjar.com/api/reference/ |
| 基址 / 沙箱 | `https://api.taxjar.com/v2/`；沙箱 `https://api.sandbox.taxjar.com/v2/` | 同上 |
| 鉴权 | 每个请求带 `Authorization: Bearer <key>`（或 `Token token="<key>"`）："TaxJar expects the API key to be included in all API requests" | 同上 |
| 版本 | 请求头 `x-api-version: YYYY-MM-DD`（2012-01-01 / 2020-08-07 / 2022-01-24）："A valid version must be passed or the 'x-api-version' value will be ignored." | 同上 |
| 计费 | 按**月交易数**计，不按请求数："These transactions will be counted toward your monthly plan limit." 超额另计 | 同上 |
| 定价 | Starter $39/月（200 单 / 月、3 个数据导入集成）；Professional $99/月（200 单 / 月、10 个集成、"10,000 increased API calls/minute"、开发者沙箱）；高峰月用 Flex 临时升档："You only pay for the extra volume when you need it." 年付省 10% | https://www.taxjar.com/pricing |
| 限流 | 公开的只有 Professional 档的 "10,000 … API calls/minute"；Starter 写 N/A | 同上 |
| 条款对 AI | 文档首屏未见；未深读条款 | — |

## Avalara AvaTax（developer.avalara.com）

| 项 | 现状 | 证据 |
|---|---|---|
| 鉴权 | REST v2 两种：用户名密码的 Basic（"Basic authentication does not expire."，支持逐用户审计）；或 `accountid:licensekey` 的 Basic（一个账号一把 license key，重置即吊销旧的，推荐给装在客户环境里的连接器） | https://developer.avalara.com/avatax/authentication-in-rest/ |
| 沙箱 | 免费开发者沙箱（developer.avalara.com/get-started），license key 在账户设置里生成 | 第三方集成指南（docs.runalloy.com/connectors/Avalara）；官方 rate-limits 页 404 |
| 限流 | 官方页面读不到；第三方指南写超限返回 HTTP 429、桶空后恢复 | 同上 |
| 定价 | **不公开**，按报价；第三方估计每笔 $0.25–0.49、合同 $7,400–70,000+/年 | https://apicostcalc.com/avalara-vs-taxjar-vs-stripe-tax-cost-calculator.html 、https://numeral.com/blog/avalara-pricing |

## 对 Stayloop 规则 API 的启示

1. **按「结果」计费而不是按请求**：TaxJar 数的是交易，不是 API 调用——我们若收费，自然单位是「一份合规检查 / 一份草稿」，查询规则文本本身不计费。
2. **日期版本号**：`x-api-version: 2026-10-13` 这种日期版本正合我们「规则随法律改」的节奏（每年 6 月更新指导比例、Bill 60 之类）；响应里同时回 `rules_as_of`。
3. **沙箱免费 + 文档每端点多语言示例** 是这类 API 的标配；我们现有 `/stayloop-api/docs` 只有 curl。
4. **限流写在定价页**（TaxJar 的 10,000/分钟）——用户一眼看到额度，不用翻文档。
