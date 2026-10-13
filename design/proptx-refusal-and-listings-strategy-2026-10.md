# PropTx 拒绝后的房源数据策略（2026-10-13）

## 回信要点（PropTx Data Agreements，2026-10-13）
- VOW / IDX 数据只能用于会员经纪自己品牌的网站或 App，用途必须直接属于该经纪的住宅经纪业务（VOW Data Feed Agreement ss. 3.2、4.1、6.2(a)）。
  AVP（技术供应商）不得用代一位会员取得的接入做自己的产品，也不得提供给其他会员。
- **任何 MLS 数据不得经过任何第三方 AI 模型或服务**，不论系统隔离、API 条款或零留存设置；自动化报告引擎同样禁止。
- 结论：会员作为发起人给供应商平台供数的形态被明文否定；就算做会员品牌的站，上面也不能跑 AI。CREA DDF 的结构相同（只有会员 opt-in + 登记的技术供应商为会员自己的站接入，
  无对外商业授权），REALTOR.ca 使用条款禁止未经书面授权的商业使用。

## 决定（用户 2026-10-13「按照你的建议马上修改」）
1. **停止一切对 Realtor.ca 的读取**：租客 AI 助理的实时找房、行情样本、商业场地检索、房东贴链接导入、每小时的下架巡检。
   `lib/listings/externalSources.ts` 的 `REALTOR_LIVE_READS = false` 是常量不是环境变量——重新打开需要一份授权，不是一次配置。
2. **导入的 Realtor.ca 房源全部归档**（`is_active=false, status='archived'`，行保留），两套用 Realtor 照片的测试房源一并下架。
3. **链接代替读取**：找房结果附带按用户条件生成的 Realtor.ca / Rentals.ca / Kijiji 跳转链接（`buildExternalLinks`），对话里由系统写明
   「Stayloop 不再替你读取 Realtor.ca 的房源」；行情卡只剩 TRREB 官方季报（公开 PDF，照常抓取）。
4. **清理 PropTx 痕迹**：条款第 1 条（TRREB 会员客户关系）删除并升版本、详情页发起会员卡位删除、`/partners` 的 Realtor.ca 条目标「已停用」、审核账号删除。
5. **可以问一次的**：Rentals.ca 网络（Rentsync）是否提供付费的租赁房源数据授权——邮件草稿 `design/rentsync-inquiry-email-2026-10.md`。

## 产品含义
- 浏览页只剩房东直租房源。这是事实，页面如实显示「房东直租 · 平台核验」。
- 价值主线不在房源聚合：筛查、合规护栏、全流程、消息与证据。房源增长靠房东发布 + 将来向外同步（Kijiji / Facebook / Rentals.ca），不靠抓别人的。
- 10-10 为 Article 8 做的通用改进（条款同意、姓名、审计轨迹、密码时效、服务端分页与限流）保留。
