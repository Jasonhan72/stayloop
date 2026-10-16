# Zumper · 租客侧公开页面调研

抓取日期：2026-10-13
面向市场：美国为主，兼做加拿大（站点导航写 "Search Apartments in the US + Canada"；城市页含 Vancouver / Toronto / Montréal / Calgary / Edmonton；服务条款只写 "operated from the United States"，不提加拿大）。
租客侧产品名：没有单独的租客产品名。租客用的是 Zumper 网站 / App（搜索、"Check Availability"、"Tour this place"）、AI 助手 **Zoe**（挂在多单元房源页上）、**Zumper app in ChatGPT**（2026-02 上线）。租金支付叫 **Rent Payment Platform**（条款用语）。曾有的 **Zumper Select**（2017 年推出的租赁陪跑服务）与 **Zumper 自营申请 / 筛查**（2026 年初已停办）。

## 读过的 URL

成功读取（WebFetch）：
- https://www.zumper.com/ （首页）
- https://www.zumper.com/apply （Rental Applications: How to Apply for an Apartment）
- https://www.zumper.com/about
- https://www.zumper.com/tenant-screening
- https://www.zumper.com/manage （Zumper Rental Manager，房东侧）
- https://www.zumper.com/pro
- https://www.zumper.com/terms-and-conditions （Terms and Conditions）
- https://www.zumper.com/select （只回到首页内容，页面没有 Select 相关文字）
- https://www.zumper.com/blog/ （博客首页）
- https://www.zumper.com/blog/zumper-launches-zoe-the-ai-powered-assistant-designed-to-elevate-the-rental-search-experience/
- https://zoe.zumper.com/
- https://www.zumper.com/blog/zumper-launches-app-in-chatgpt/
- https://www.zumper.com/blog/total-monthly-price-is-coming-to-zumper/
- https://www.zumper.com/manage/resources/unboxed-2025/
- https://www.zumper.com/manage/resources/manage-rental-tour-requests-on-zumper/
- https://www.zumper.com/manage/resources/zumper-chatgpt-app/
- https://www.zumper.com/manage/resources/a-landlords-guide-to-online-rent-payments/
- https://www.zumper.com/blog/sample-letter-to-landlord-repairs-and-maintenance/
- https://www.zumper.com/blog/the-security-deposit-everything-you-need-to-know/
- https://www.zumper.com/blog/zumper-launches-zumper-select-to-take-renters-from-search-to-lease/ （2017 年旧文）
- https://housingwire.com/articles/zumper-ai-assistant-zoe （第三方报道，2024-12-03）
- https://www.mashvisor.com/blog/zumper/ （第三方，内容陈旧：写 $30 筛查费 + 2.95% 卡费）
- https://liv.rent/blog/renters/liv-rent-vs-zumper-canada/ （竞品 liv.rent 的对照文，2026-09-15，转述 Zumper 帮助中心的停办通知）

未能读取：
- https://help.zumper.com/ （HTTP 403）
- https://help.zumper.com/hc/en-us/sections/360007943413-Screening-Renters （HTTP 403）
- https://help.zumper.com/hc/en-us/sections/360007883694-Finding-a-Rental （HTTP 403）
- https://help.zumper.com/hc/en-us/articles/50236036386075-Updates-to-Zumper-Tenant-Screening-and-Applications （HTTP 403）
- https://help.zumper.com/hc/en-us/articles/219767147-How-much-does-it-cost-to-apply （HTTP 403）
- https://www.zumper.com/rent-payments （HTTP 404）
- https://www.zumper.com/terms （HTTP 404；真实地址是 /terms-and-conditions）
- https://www.zumper.com/terms-of-service （HTTP 410 Gone）
- https://www.zumper.com/help （HTTP 404）
- https://www.zumper.com/faq （HTTP 404）
- https://www.zumper.com/renters-guide （HTTP 404）
- https://www.zumper.com/blog/zumper-launches-zoe-ai-leasing-assistant/ （不存在，落到博客首页）
- https://www-blog.zumper.com/... （博客首页里的链接域名，DNS 解析失败 ENOTFOUND；同一篇在 www.zumper.com/blog/ 下能读）
- https://nationalmortgageprofessional.com/news/zumper-debuts-real-time-rental-search-app-inside-chatgpt （HTTP 403）
- https://inman.com/2024/12/10/zumper-introduces-zoe-latest-ai-for-aspiring-renters （HTTP 403）
- https://www.comparably.com/companies/zumper/faqs （HTTP 403）
- https://www.landlordgurus.com/is-zumper-free-for-landlords/ （返回空页）

帮助中心（help.zumper.com）整站对抓取返回 403，下面凡标「帮助中心（搜索摘要）」的引文来自搜索引擎对该站文章的摘录，没有读到原页。

## 九项

| 项目 | 结论 | 来源 / 原文短引 |
|---|---|---|
| 注册流程 | 浏览、联系房源不需要账号付费；首页只说可以免费浏览和联系。没有读到注册步骤页（帮助中心 403）。App 上有「Messaged / Favorites」等租客中心（about 页）。 | zumper.com/: "Renters can use our platform to browse or contact properties for free." ；"will not ask you for money to view or communicate with rental properties" |
| 申请包 / 租客档案 | **没有可复用的申请包。** 2026 年初 Zumper 停办了自营的申请与筛查，现在申请「在房东那里完成」，Zumper 只负责搜索和联系。/apply 页只教你自己备好材料（证件、收入证明、推荐人）。帮助中心旧文记录的是停办前的做法：申请人付 $35 生成 TransUnion 信用 + 背景报告并分享给房东。 | zumper.com/apply: "Zumper is where you search and connect—the application itself happens with the landlord." ；帮助中心（搜索摘要）"discontinued its tenant screening and application services earlier this year"；"discontinuing the ability to create & submit an application for a property"；liv.rent 转述 "discontinued its native tenant screening and rental application services earlier in 2026" |
| 看房约定 | 房源页有 "Check Availability" / "Request a Tour" / "Tour this place" 按钮，租客可给三个备选时段 + 联系方式 + 入住日期；房东邮件里确认或改时间；确认后 Zumper 自动发提醒和跟进邮件，取消双方都收到通知。Zoe 在多单元房源上可以直接替租客订看房（接 Yardi RentCafe / Entrata / Knock / Funnel / Hy.ly 的排期系统）。 | manage-rental-tour-requests: "Tour this place"；"up to three" 时段；zoe.zumper.com: "book or request a tour, or contact the property" |
| 租约解释 | 页面未提及任何租约解读功能。只有博客通用文章（押金、提前解约、房东能否终止租约）。 | blog/the-security-deposit-...: "Your lease includes the terms of your move-out" |
| 报修 | 页面未提及报修功能。只有博客样信「Sample Letter: Requesting Repairs and Maintenance」，建议书面提交、附照片。 | blog/sample-letter-...: "it's always smart to submit the maintenance request in writing" |
| 续约 / 退租 | 页面未提及续约 / 退租功能。博客（房东侧资源）只说租约不会自动续，到期要么签新约要么转月租。 | manage/resources（搜索摘要）: "Leases also don't automatically renew." |
| 争议 | 没有租客与房东之间的争议功能。博客建议押金争议去小额法庭。与 Zumper 自身的争议走条款第 18 条：强制仲裁（AAA）、放弃集体诉讼、可走小额法庭。 | terms-and-conditions: "shall be resolved exclusively by binding arbitration"；"YOU WAIVE ANY RIGHT TO BRING ANY CLAIM AS A REPRESENTATIVE OF A PROPOSED CLASS" |
| 是否向租客收费（金额） | **搜索、联系、看房免费。** Zumper 自己现在不向租客收申请费（申请在房东处完成；房东自己收的申请费 /apply 页说通常 $25–$75，房源页实例有 $55 / $75 每成年人）。**租金支付**：用信用卡 / 借记卡付房租时 Zumper 收手续费，条款只写「按交易时显示的金额」（第三方与旧资料写 2.95%，ACH 免费，但那是 2020 年前后的数字，条款没写比例）。自动扣款授权「直到取消为止」，取消要在下次扣款前至少 24 小时。Zumper 收的费一律不退。**停办前**的筛查费：申请人 $35（按州不同），每个申请人各付各的。 | zumper.com/apply: "commonly $25–$75 to cover screening costs"；terms §9: "Zumper may charge you a processing fee in the amount specified at the time of the transaction"；§3: "once charged, such Fees are non-refundable"；帮助中心（搜索摘要）"charges applicants a $35 fee to generate and share their screening documents" |
| 是否有 AI 功能 | **有，两个。** ① **Zoe**：2025-01 宣布、挂在多单元房源页的 AI 助手（ChatGPT-4o 为底），24/7 回答物业和社区问题（宠物政策、设施、周边），2025 年起能替租客订看房、把线索交给物业。只在多单元房源上自动开启，其余房源要房东申请。② **Zumper app in ChatGPT**（2026-02-04）：在 ChatGPT 里用自然语言搜 Zumper 实时房源，支持全部筛选条件，带 Rental Trends 本地租金数据；预约看房和联系要跳回 Zumper 网站。宣布过但页面说尚未上线的：个性化搜索、多房源对比、"For You" 推荐。 | blog/zumper-launches-zoe: 24/7、"take the next step"；zoe.zumper.com: "Zoe is automatically included on our multi-unit property listings."；unboxed-2025: "book tours on behalf of prospective renters"；blog/zumper-launches-app-in-chatgpt: "show pet-friendly options under $2,500 with in-unit laundry"；manage/resources/zumper-chatgpt-app: "ChatGPT serves as an entry point." |

另外两点：
- **Zumper Select** 是 2017 年推出的「从搜索到签约」陪跑服务（文字 / 聊天 / 电话咨询、推荐房源、安排看房、VR 与视频看房），对租客免费、向房东按月租抽成；现在 zumper.com/select 已没有对应页面，条款里只剩一句「24 小时 hold 不约束房源方」，看不出是否还在运营。
- **Total Monthly Price**（2026-10 起）：房源页显示「基础租金 + 必付月费」的总价，可选费用（宠物、车位）在成本计算器里加；数据不全的房源标 "Additional Fees May Apply" / "Fees May Apply"。这是对租客的费用透明措施，不是收费。

## 读到的页面文字摘要

**https://www.zumper.com/**
首页把 Zumper 定位为美国和加拿大的租房搜索平台：按地点搜索、可用当前位置、热门城市入口，App 有「大量筛选条件」「数字看房与申请」「个性化推荐」「价格与空置提醒」。资源区有租金趋势、城市指南、可负担性计算器、Zumper Expert Ratings。FAQ 明说租客可以免费浏览和联系物业，Zumper 不会要钱才让你看房或联系；标 "verified" 的房源是真人发布、真有空房。页面没有提到租金支付、Zoe、Zumper Select。

**https://www.zumper.com/apply**
这是一篇「怎么申请公寓」的指南，不是申请工具。流程是：在 Zumper 找到房源、看房、然后把申请交给房东或物业；页面原话「Zumper 是你搜索和联系的地方——申请本身在房东那里完成」。建议提前备好证件、近期收入证明（工资单、offer、银行流水）、推荐人。申请时会授权背景与信用检查；可能要付申请费，「通常 $25–$75 用来覆盖筛查成本」。没有可复用申请包的说法。

**https://www.zumper.com/about**
城市链接覆盖美加（New York、San Francisco、Chicago、Vancouver、Toronto、Montréal、Calgary、Edmonton 等）。租客产品：Renter hub（Messaged / Favorites）、租金计算器、租金研究、博客、短租 / 豪华 / 宠物友好 / 便宜公寓筛选、iOS / Android App。愿景是「让租房像订酒店一样简单」，覆盖「浏览、看房、申请到签约」。没有提 AI 功能。

**https://www.zumper.com/tenant-screening**
筛查说明页（偏房东）：报告可能含信用历史、犯罪记录、驱逐记录、收入核实四段；提醒部分司法区限制使用犯罪 / 信用记录。FAQ 标题「谁付申请背景检查的钱？」下面没有答案文字。没有金额，没有租客档案或可复用申请的说法；只说申请人「通过筛查服务商的链接」提交信息。

**https://www.zumper.com/manage**
房东工具页：申请审核推荐 TransUnion SmartMove（Zumper 拿推荐佣金），没有自营申请表；没写筛查费、租金支付、租约。多户营销产品标 "scalable insights powered by AI"、"AI-insights to help you attract leads and reduce vacancy time"。FAQ 答案为空。

**https://www.zumper.com/pro**
页面没有 Zumper Pro 的说明，也没有租客申请费；只说房东「每月免费发 5 条房源」，并链到一篇「多户型费用透明指南」。

**https://www.zumper.com/terms-and-conditions**
§3：Zumper 收的费在购买点标明，收了不退；订阅和自动扣款要在下次续费 / 扣款前 24 小时取消。§4：背景筛查由第三方提供，用户只能找第三方；Zumper 不核实房源、不看房，用户自行尽职；Select 的 24 小时 hold 不约束房源方、不保证独家看房。§9：用卡付房租「Zumper 可能收取交易时显示金额的手续费」，加在租金之上；自动扣款授权「直到取消为止」；付款失败房源方可另行追讨。§17：服务从美国运营，不保证在其他司法区合法。§18：AAA 强制仲裁、放弃集体诉讼、可走小额法庭、非仲裁事项诉讼地在旧金山。

**https://www.zumper.com/select**
返回的是首页同样的内容：租客免费浏览联系、App 有数字看房与申请；没有任何 Zumper Select 的文字。

**https://www.zumper.com/blog/zumper-launches-zumper-select-to-take-renters-from-search-to-lease/**（2017）
Zumper Select 是「从搜索到签约」的端到端服务：个性化礼宾、文字 / 聊天 / 电话咨询、个性化推荐、看房排期与后勤、VR 与视频看房、在市场内的免费支持直到签约。Zumper 向房东按月租收一个比例作为费用；文中没有直接写租客零费用，只写了「免费支持」。

**https://www.zumper.com/blog/zumper-launches-zoe-the-ai-powered-assistant-designed-to-elevate-the-rental-search-experience/**（宣布 2025-01-15，文章日期 2025-04-23）
Zoe 是 AI 租房助手，24/7 回答物业和社区问题（宠物政策、设施、周边热点、物业亮点），能订看房、把租客直接连到物业；只内置在多单元房源页。计划中（未上线）：定制搜索、房源并排对比、"For You" 推荐、平均租金与可负担性等本地市场数据。试用地址 zoe.zumper.com。

**https://zoe.zumper.com/**
给租客：基于 Zumper 房源和本地信息回答物业与周边问题，可以订 / 申请看房、替你联系物业，手机网页和桌面都能用。给物业：多单元房源自动带 Zoe，其他房源发邮件到 zoe@zumper.com 询问；接 Yardi RentCafe、Entrata、Knock、Funnel、Hy.ly 的排期平台。没写价格，没有客户评价。

**https://www.zumper.com/blog/zumper-launches-app-in-chatgpt/**（日期线 2026-02-04，页面时间戳 2026-06-22）
在 ChatGPT 应用商店加上 Zumper 后，可以在聊天里搜房源，结果带照片、详情、地图、价格；支持 Zumper 全部筛选条件（例句「$2,500 以下、带洗衣机的宠物友好房源」）；Rental Trends 区显示所搜城市的最新租金数据；要看完整房源、约看房或联系物业，要点链接回 Zumper 网站。没写覆盖哪些市场。

**https://www.zumper.com/blog/total-monthly-price-is-coming-to-zumper/**（2026-10-09）
2026 年 10 月起房源显示 Total Monthly Price = 基础租金 + 必付月费，只在物业提供了费用数据的地方显示；可选费用（宠物、车位）用现有成本计算器加。四种显示状态：带 12 个月租期的总价 / 不带租期的总价 / "Additional Fees May Apply"（费用信息不全，显示基础租金）/ "Fees May Apply"（没有费用信息）。费用直接展示在房源上。

**https://www.zumper.com/manage/resources/unboxed-2025/**
2025 年回顾：Zoe 是「ChatGPT 驱动的聊天机器人」，2025 年新增「替潜在租客订看房」；房源页加了交互式成本计算器让租客早点看到预期费用；全包定价规则让费用细节在房源和 Google 商家档案上可见。没提申请和租金支付。

**https://www.zumper.com/manage/resources/manage-rental-tour-requests-on-zumper/**
任何 Zumper 房源都能请求看房，入口是 "Tour this place"（与 "Check availability"、"Apply now" 并列）。租客提交最多三个时段、偏好联系方式、想要的房型、可入住日期；房东收到邮件后确认一个时段或另提时间；确认后 Zumper 自动发提醒和跟进邮件；取消时双方自动收到通知；看房后 Zumper 提醒房东跟进。

**https://www.zumper.com/manage/resources/zumper-chatgpt-app/**（2026-02-13）
面向物业解释 ChatGPT 应用：租客用自然语言搜索（例如某城市某预算的两居、某地标附近的宠物友好房源），命中 Zumper 社区就在聊天里展示；Rental Trends 给当地租金数据。ChatGPT 只是发现入口，「所有线索、看房请求和租客动作都继续经过 Zumper 现有的房源体验和报表」。

**https://www.zumper.com/manage/resources/a-landlords-guide-to-online-rent-payments/**（2023-02-10）
房东侧文章：推荐在线租金门户，提到自动扣款和到期前约一周的提醒；加州法律要求房东接受支票 / 本票 / 汇票。没有写任何租客手续费比例。

**https://www.zumper.com/blog/sample-letter-to-landlord-repairs-and-maintenance/**
纯建议 + 一封可填的样信：报修要书面、写清问题、留联系方式、附照片；影响安全的紧急问题要求立即处理。不是产品功能。

**https://www.zumper.com/blog/the-security-deposit-everything-you-need-to-know/**
入住前拍照记录；退租看租约里的搬出条款（可能写清洁费从押金扣）；押金可抵欠租和清洁费，房东不按州规则办你「可能有法律途径」。文章没有提供任何 Zumper 工具。

**https://housingwire.com/articles/zumper-ai-assistant-zoe**（2024-12-03，第三方）
Zoe 能回答「几乎任何关于物业或社区的租客问题」，帮忙申请看房和提交线索，集成在社区房源上，租客准备好时把线索交给物业；CEO 说物业应期待「信息更充分、质量更高的 Zumper 线索」。

**https://www.mashvisor.com/blog/zumper/**（第三方，内容陈旧）
写申请免费、租客付 $30 标准筛查费把报告发给房东、房东可自定费用并拿差价；租金支付 ACH 免费，借记 / 信用卡 / Apple Pay 收 2.95%。这些数字与帮助中心旧文（$35）及现状（筛查已停办）不一致，只作历史参考。

**https://liv.rent/blog/renters/liv-rent-vs-zumper-canada/**（2026-09-15，竞品文）
转述 Zumper 帮助中心：2026 年初停办自营筛查与申请，租客不能再在 Zumper 内提交正式申请，只能直接联系房东；房东做信用 / 背景检查被引到 TransUnion SmartMove。Zumper 是「在加拿大也运营的美国公司」；房东 5 套以下走 Zumper Manage / PadMapper（每月 5 条免费），更多走 RentSync；房源同步到 Zumper、PadMapper、ULoop、Movoto、Bing、Trovit、ChatGPT。没写租客费用和租金支付。
