# Rentals.ca · 租客侧公开页面调研

抓取日期：2026-10-13

面向市场：加拿大（全站仅加元挂牌，公司 Rentals.ca Network, Inc. / Landlord Web Solutions Inc.，多伦多地址，条款受魁北克法律管辖）。
租客侧产品名：没有独立的租客产品名。租客账号只用于「保存提醒与收藏」；手机 App 叫「Rentals.ca :) Apartment Finder」。
定位：房源广告市场 + 房东工具（验证、促销、信用报告）。租客流程基本止于「联系房东 / 预约看房」。

## 读过的 URL

成功（rentals.ca 对 WebFetch 与 curl 一律 403，以下用内置浏览器实读）：
- https://rentals.ca/
- https://rentals.ca/faq （分类页：/faq/renter、/faq/general-questions、/faq/protect-yourself-against-fraud、/faq/credit-checks、/faq/landlord）
- https://rentals.ca/credit-reports
- https://rentals.ca/create-account
- https://rentals.ca/terms
- https://rentals.ca/landlords
- https://rentals.ca/about-us
- https://rentals.ca/contact
- https://rentals.ca/toronto （搜索结果页）
- https://rentals.ca/toronto/205-bathurst-street-6 （房源详情页样本）
- https://rentals.ca/blog/tenant-credit-checks-rentals-ca （2026-07-08 博客）

成功（WebFetch）：
- https://press.rentals.ca/468310-more-than-one-in-four-canadian-renters-are-now-using-ai-to-find-a-home
- https://apps.apple.com/app/id1475449043

未能读取：
- https://rentals.ca/ 、/faq 、/terms-of-use 、/blog/landlord-guide-the-benefits-of-verifying-your-rentals-ca-account —— WebFetch 与 curl（带浏览器 UA）均 HTTP 403（Cloudflare 拦截）；改用内置浏览器后已读到前三个的等价页面
- https://support.rentals.ca/ —— getaddrinfo ENOTFOUND（不存在该子域）
- https://help.rentals.ca/ —— DNS 解析失败（不存在该子域）
- 房源页「Request a Tour」/「Contact Property」弹窗的表单字段 —— 浏览器面板处于隐藏状态，无法点击弹窗，字段未读到

## 九项记录

| 项目 | 发现 | 来源 / 原文短引 |
|---|---|---|
| 注册流程 | 一个表单：邮箱、密码、确认密码、名、姓，再加一个勾选「我是业主或行业从业者」。页面说明注册只是为了「保存提醒和收藏」。租客收到信用检查邀请时若没有账号，会被引导建一个。没有手机号验证、没有证件验证（证件验证只给房东，用 Persona）。 | /create-account：“Log in or register to save alerts and favourite rentals”；/faq/credit-checks：“you'll be guided through creating one” |
| 申请包 / 租客档案 | **没有**租客档案、没有申请表、没有可复用的申请包。房源页只有「Contact Property」「Request a Tour」「View Phone Number」「Report Listing」。租客的咨询以邮件 lead 形式发给房东（走 SendGrid），房东在「Leads」页看。房东可对某个 lead 发起 Certn 信用检查：租客收到邮件 → 建账号 → 在自己的仪表盘里「验证身份并同意」→ 房东看报告。软查询。第 3、7、13 天自动提醒，第 14 天过期。 | /credit-reports：“They verify their identity and provide consent.”；/faq/credit-checks：“Certn performs a soft check, which has zero impact” |
| 看房约定 | 房源页有「Request a Tour」按钮（弹窗字段未读到）；FAQ 没有任何看房流程说明。 | 房源页按钮文字：“Request a Tour” |
| 租约解释 | 产品里没有。条款说网站「不参与任何实际租赁交易」，但「某些情况下可能提供签署工具」；条款第 6.6 条提到「lease signing credits」（租约签署额度），是卖给房东的额度，公开页面没有介绍这个功能。租客只能看博客文章。 | /terms 1.2(a)：“in certain cases, a signing tool might be provided”；6.6：“Lease Signing Credits” |
| 报修 | 页面未提及。 | — |
| 续约 / 退租 | 页面未提及（只有博客）。 | — |
| 争议 | 没有争议处理功能。租客 FAQ 对「房东不回复」的回答只是解释原因。反欺诈页：向 Rentals.ca 举报 + 向加拿大反欺诈中心报案，并声明「Rentals.ca 不是中介，不拥有或控制任何房源」。条款：对网站不满的唯一救济是停止使用；集体诉讼弃权；争议归魁北克蒙特利尔法院。 | /faq/protect-yourself-against-fraud：“Rentals.ca is not an agency”；/terms 10.5：“your sole and exclusive remedy is to discontinue use” |
| 是否向租客收费 | **不向租客收费**（租客账号免费，App 免费，没有申请费）。费用都在房东侧：信用报告 **$20 + 税/份**（3 份 $57、5 份 $90，额度 24 个月有效，不退款只退额度）；房源前 3 套免费，Promoted $35/15 天，Featured $199/15 天；超过 3 套活跃房源要付费订阅，超过 100 个单位转给 Rentsync。 | /faq/credit-checks：“Credit reports cost $20 + tax per report.”；/landlords：“LIMITED $0 up to 3 listings” |
| 是否有 AI 功能 | **租客可见的页面上没有 AI 功能**：搜索框是普通的「Search city, neighbourhood, etc.」。页面源码里有 `App.flags.ai_search = true` 和 `/phoenix/api/v1.0.2/ai-search-defaults` 端点（匿名访问 404），说明内部有「AI 搜索」的灰度开关，但未对外公布、未在界面出现。公开材料里的「AI」只有：2021 年网络启动稿说用 AI 识别欺诈房源；2026 年调查稿说 28.5% 的租客用 ChatGPT/Gemini 找房（第三方工具）。条款 3.17 禁止用站内内容训练 AI、7.2 禁止用自动化/AI 做检索。 | /terms 3.17：“train artificial intelligence algorithms”；press.rentals.ca：“no substitute for legal advice” |

## 读到的页面文字摘要

**https://rentals.ca/** —— 首页是房源列表：「It's Time to Move」，最新房源、「必看」房源、带促销的房源、热门城市，底部写「66,774 rentals currently available」。顶部导航只有 Landlords / Rent Report / Blog / Login / Post a Rental；汉堡菜单里有 Alerts、FAQs、Monthly Rent Report、City Rent Trends、Credit Reports、Commercial Properties（跳到 spacelist.ca）、About、Contact us。每张卡片带「Verified」标签（房东经过身份验证或来自可信数据源）。没有任何「申请」「租客档案」「AI」入口。

**https://rentals.ca/faq（含 5 个分类子页）** —— 分类：Landlord FAQs、Renter FAQs、Lawn Sign FAQs、General Questions、Protect yourself against fraud、Credit Check FAQs。租客 FAQ 只有 5 问：怎么用筛选、要不要保存提醒、怎么收藏、房东不回复找谁（答：可能 lead 太多或已租出）、币种（全部加元）。通用问题：关账号要联系客服、重置密码、没有电话只有联系表单。反欺诈页：举报渠道、六条防骗提示、识别假广告的方法、「不要在签租约前转账」、魁北克房东只能收首月租金，并声明 Rentals.ca 不是中介。信用检查 FAQ 共 17 问，全部面向房东：$20 + 税/份、从 Leads 页发起、Certn 处理、软查询、额度 24 个月、不退款只退额度、租客拒绝 / 房源下架 / 取消 / Certn 取消时额度返还、租客第 3/7/13 天提醒第 14 天过期、房东须先经 Persona 验证身份、租客需要有 Rentals.ca 账号、数据由 Certn 加密处理、信用史薄时显示 N/A。

**https://rentals.ca/credit-reports** —— 房东营销页「Find reliable tenants faster with secure credit Reports」，合作方 Certn、Persona、Rentsync、BuildingStack、Equifax。三步：输入申请人邮箱发邀请 → 申请人验证身份并同意 → 查看报告。宣称「比主流供应商便宜最多 33%」「$0 隐藏费用」。价格：1 份 $20、3 份 $19/份（$57）、5 份 $18/份（$90）。FAQ 与 /faq/credit-checks 基本相同，但这一页写「购买的额度不过期」，而 FAQ 与条款写 24 个月 / 12 个月——三处不一致。

**https://rentals.ca/create-account** —— 「Create Your Account · Log in or register to save alerts and favourite rentals」。字段：Email、Password、Confirm Password、First Name、Last Name、勾选「I am a property owner or industry professional」。注册即接受条款与隐私政策。房东 FAQ 补充：勾选后再选 Property Owner / Property Manager / Real Estate Agent or Broker。

**https://rentals.ca/terms** —— 运营方 Landlord Web Solutions Inc.（dba Rentals.ca Network）。1.1 服务范围：连接 Property Holders 与 Prospective Occupants 的平台；1.2 不参与租赁交易（但可能提供签署工具）、不提供法律 / 经纪服务、不核实房源准确性。2.1 须年满 18 岁。3.12 禁止多账号；3.17 禁止用站内内容训练 AI。5.3 「Verified」只表示提交过身份文件。6. 费用：超过 3 套活跃房源须付费订阅，超过 100 个单位转 Rentsync；付款不退；广告额度 24 个月、信用检查额度 12 个月、租约签署额度 12 个月内用完。7.2 禁止用自动化 / AI 检索站内内容。10.5 唯一救济是停止使用。13.6 集体诉讼弃权；13.9 魁北克法律、蒙特利尔法院。

**https://rentals.ca/landlords** —— 「Listing is Free」前 3 套免费，Promoted $35/15 天（最多 5 倍浏览、3 倍 lead），Featured $199/15 天（最多 10 倍浏览、5 倍 lead、置顶、高亮地图标记），都送「For Rent」牌子和手机 App 通知。「Introducing Verified」免费身份验证，验证后房源即刻上线（否则 1 个工作日审核）。房东评价里反复提到「直接回邮件就能回复租客」。手机 App 不能发布或管理房源。FAQ 写有「How-to's」「Industry Insights」「Great Support」。

**https://rentals.ca/about-us** —— 「Canada's leading rental marketplace」，使命是简化房东与租客的租房过程。For Renters 一段只谈搜索体验、博客、城市指南、全国租金报告；For Landlords 谈广告曝光、管理咨询、市场洞察。数字：免费发布、44,000+ 房源、575 个城市、「每 22 秒有人找到家」。合作：加拿大篮球、Raising the Roof。联系：媒体 / 营销 / 支持三个表单。

**https://rentals.ca/contact** —— 联系表单的用途列表：发布多套、购买促销、批量采购、房源问题、技术故障、举报用户或房源。地址 191 Niagara Street Unit 100, Toronto；两个电话（416 / 613 区号）。

**https://rentals.ca/toronto** —— 「11,536 Rentals found」，List / Map / Filters，排序 Default / Recent / Price。搜索框占位「Search city, neighbourhood, etc.」，没有自然语言 / AI 搜索的界面元素。每张卡片有「Contact」按钮，部分有「Tour」。

**https://rentals.ca/toronto/205-bathurst-street-6** —— 房源详情：价格、Verified 标签、户型、面积、入住日期、家具、停车、设施、水电、楼宇信息、描述、「My Commute」通勤计算（最多比较 3 个地点）、Neighbourhood Score、相似房源。「Get In Touch」区：Contact Property / Request a Tour / View Phone Number；另有「Report Listing」。页面上没有「Apply」按钮、没有申请表、没有信用检查入口。

**https://rentals.ca/blog/tenant-credit-checks-rentals-ca（2026-07-08）** —— 面向房东：「If you have a Rentals.ca account, you now have access to tenant credit checks directly in your dashboard」。报告含信用分、付款历史、催收账户、资金管理情况；新移民或年轻人信用史薄属正常。「It's a $20 decision that's worth making」。由 Certn 提供。

**https://press.rentals.ca/468310-…（2026 年春季租客偏好调查）** —— 1,194 份回答（2026-05-05 至 06-14），28.5% 的加拿大租客用过 ChatGPT / Google Gemini 之类的 AI 工具找房，其中 72.6% 觉得有帮助。用途：找房源与社区 57.7%、比价 45.5%、看懂租约条款 40.2%、预算建议 38.1%、给房东写消息 33.3%。25–34 岁最高。稿件没有提到 Rentals.ca 自己的任何 AI 功能，并提醒通用 AI「不能替代法律建议」。

**https://apps.apple.com/app/id1475449043** —— 「Rentals.ca :) Apartment Finder」，免费。功能：地图 / 列表、按类型 / 地点 / 预算 / 卧室 / 浴室 / 宠物筛选、实时更新、收藏、跨设备。写「每套房源都由租房专家人工审核」。「Alerts」与「Account Creation」标为 Coming Soon；没有申请、没有 AI、没有内购。
