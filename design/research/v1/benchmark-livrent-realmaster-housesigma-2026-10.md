# 对标补充：liv.rent · RealMaster · HouseSigma（2026-10-13）

**定位**：V1.0 调研的补充稿，用户点名的三家。背景是 PropTx 2026-10-13 拒绝了 Stayloop 作为技术供应商（AVP）接入 MLS 数据：VOW / IDX 只能用于会员经纪自己品牌的站、用途必须属于该经纪的经纪业务、**任何 MLS 数据不得经过任何第三方 AI**（回信要点在 `design/proptx-refusal-and-listings-strategy-2026-10.md`）。本稿回答一个核心问题：**这三家是怎么拿到数据的，它们的模式 Stayloop 能不能复制，代价是什么**；顺带把三家的产品矩阵、与我们的差异、合作可能列清楚。

租客侧对 liv.rent 的摘要已在 `tenant/liv-rent.md`（Renter Resume、Trust Score、数字租约、收租、费用），本稿不重复，只补房东 / 经纪 / 数据 / 集成四块。

**方法**：WebFetch / WebSearch 实读公开页（官网、条款、隐私、定价、App Store / Google Play、RECO / TRREB / PropTx 官方页、新闻），纯 JS 壳的页面改经 Jina reader（`r.jina.ai`）读；PDF 本地 `pdftotext`。每条事实带 URL 与短引语。

**未能读取（如实列）**：`housesigma.com` 首页 / `about` / 租房列表页（纯 JS 壳，Jina 也只得到导航；`/blog-en/terms-of-use/`、`/blog-en/about-us/`、`/blog-en/privacy-policy/` 读到了）；`realmaster.com` 的 Toronto 租房列表、`yellow-pages`（404 / CAPTCHA 提示，只有导航与页脚）；BCFSA 对 HouseSigma Inc. 的执照记录页（403，只用搜索摘要）；CBC 2018 cease-and-desist 报道原文（403，只用搜索摘要）；PropTx `MLS Rules With VOWs` PDF（lstar.ca 404；AVP 条款改读 OREB 托管的 `2025-01-10 PropTx MLS Policies`）；TRREB 2026 年会费表（只找到 2024-11 的 2025 年会费说明）；RECO 注册人查询（需加拿大 IP，未尝试）；RealMaster 经纪侧产品页（站上没有「For Agents」入口，搜索也没有）。

---

## 0. 一句话结论

- **HouseSigma 和 RealMaster 都是自己注册的经纪公司**（HouseSigma Inc., Brokerage；Avion Realty Inc., Brokerage / 「RealMaster Avion Realty Inc.」），各自作为 TRREB / PropTx 等板的会员跑 VOW，数据只给登录用户看，条款就是标准 VOW 条款。**liv.rent 不是经纪公司**，站上房源主要是房东 / 物业公司自发 + 企业客户经 XML / API / RentSync 推进来的，页脚另注明「TRREB 的 MLS 数据经 Prompton Real Estate Services Corp. 协议展示」。
- **它们的数据模式对 Stayloop「可复制但不划算」**：复制 = Stayloop Inc. 自己注册为经纪公司（要一位有资格的 Broker of Record、RECO 注册 + 每人每年 $500 保险 + 信托账户 + 2026-10 起的年度财务申报、TRREB 入会 $460 + 三级会费），然后站就是「会员自己品牌的站」，数据问题解决；**但 AI 禁令不会解决**——PropTx 对我们明说「任何第三方 AI 模型或服务都不行」，Stayloop 的 AI 助理跑在 Anthropic / OpenAI / Google 上，就是第三方。HouseSigma 2026-07 上线了 SigmaAI 聊天，说明「会员自家品牌下的 AI 问答」在市场上存在，但它怎么与 PropTx 的规则相处（自建模型？PropTx 默许？）公开资料查不到。
- **三家都没有 Stayloop 的核心**：代办 + 审批、安省规则引擎、文件取证筛查、服务市场、只追加的消息证据链。它们有而我们没有的只有一样：MLS 房源与成交历史。
- **可以合作的只有两条**：① liv.rent 的企业集成（XML / Developer API / RentSync）本来是让物业软件把房源推进 liv.rent——Stayloop 的房东直租房源理论上可以这样同步出去；② HouseSigma 给旗下经纪「100% 供线索 + 免费 CRM」但没有筛查工具，我们的经纪筛查对它旗下经纪是互补品。RealMaster 没有任何公开的 API / 合作入口。

---

## 1. 数据来源与法律身份

### 1.1 HouseSigma

| 项 | 现状 | 证据 |
|---|---|---|
| 法人与身份 | 页脚「© COPYRIGHT 2026 BY HOUSESIGMA INC. BROKERAGE」；条款写「HouseSigma is an Affiliated VOW Partner registered with Toronto Regional Real Estate Board」——既是经纪公司（会员）又自任 AVP。 | https://housesigma.com/blog-en/terms-of-use/ |
| 覆盖的协会 | 条款分节列出 TRREB / PropTx、ITSO、Ottawa (OREB)、Hamilton-Burlington (RAHB)、Pillar 9（阿尔伯塔）、REBGV、VREB，各有「deemed reliable but is not guaranteed」免责；BC 的开放数据另致谢。 | 同上 |
| 登录墙 | 第三方评测：「You do need to sign up to use HouseSigma」，注册只要邮箱 + 密码；App 开发者回复说重新登录是「Real estate boards mandate this process」。 | https://hardbacon.ca/en/mortgage/housesigma-review/ ；https://apps.apple.com/ca/app/housesigma-canada-real-estate/id1255490256 |
| VOW 条款 | 「All MLS® Listing data is intended only for your personal, non-commercial use」；「except in connection with your consideration of the purchase, sale, or lease of an individual property」；条款「do not create an agency relationship」；禁止 scraping / screen scraping / data mining。**条款里没有 AI、bot、automated 任何字样。** | https://housesigma.com/blog-en/terms-of-use/ |
| 隐私 | 个人信息「may be shared with real estate boards for auditing and/or legal purposes」；没有点名任何 AI / LLM 服务商；没写数据存放地。 | https://housesigma.com/blog-en/privacy-policy/ |
| 其他省 | BCFSA 记录 HouseSigma Inc. 为持牌经纪公司（Kelowna 分支，licence effective 30 July 2024）——搜索摘要，原页 403。阿尔伯塔 / 新斯科舍的执照记录未查到。 | https://www.bcfsa.ca/re-brokerage/REX607486 （摘要） |
| 与 TRREB 的历史 | 2018 年 8–9 月 TREB 向展示成交价的站发 cease-and-desist，报道点名 Zoocasa 与 HouseSigma Inc.；2020-11-25 TRREB 向「Realosophy, Zoocasa and HouseSigma」等站发备忘录称将对会员密码保护站做「comprehensive review」，违规「fines of up to $50,000」；Bungol 当年被停数据后「lost 95 per cent of its web traffic」。 | CBC 2018-09（摘要）https://amp.cbc.ca/lite/story/1.4819042 ；Globe/CP 2020-12-29 https://theglobeandmail.com/real-estate/toronto/article-toronto-real-estate-board-data-conflicts-continue-despite-2016-ruling |
| 公司 | 自述 2018 年创立（CB Insights 写 2016，两说并存）、创始人 Joseph Zeng 与 Reed Zhao、「more than two million registered users」「more than five million monthly web visits」、「first in Canada to make sold prices publicly available」、下一站 Nova Scotia；经纪可「grow with qualified leads」。Trustpilot 自述页：「full service Brokerage for both home buyers and sellers」「close to 2 Million monthly active users」「100% leads provided」「free access to great tools such as CRM system」，地址 Markham。 | https://housesigma.com/blog-en/about-us/ ；https://ch.trustpilot.com/review/housesigma.com |

**启示**：HouseSigma 解决数据问题的办法只有一个——自己是经纪公司，靠旗下经纪的佣金养平台（App 里「Connect with HouseSigma real estate agents」就是变现入口）。它用了八年、经历过两轮 TRREB 的信函与审查才站稳。

### 1.2 RealMaster（房大师）

| 项 | 现状 | 证据 |
|---|---|---|
| 法人与身份 | 网站页脚「Avion Realty Inc., Brokerage」+「Fred Xiang, Broker/Manager」，地址 50 Acadia Ave #130, Markham；条款 ITSO 节写 VOW Operator 为「RealMaster Avion Realty Inc.」，CREA 节写「This website is operated by Fred Xiang, a salesperson who is a member of CREA」；App 开发者是另一法人「RealMaster Technology Inc.」。 | https://www.realmaster.com/ ；https://www.realmaster.com/terms ；https://apps.apple.com/ca/app/id978214719 |
| 覆盖的协会 | 条款分节：TRREB、RAE（Edmonton）、ITSO（含 Cornerstone）、BC（Greater Vancouver / Fraser Valley / Chilliwack）、CREB / Pillar 9、CREA。 | https://www.realmaster.com/terms |
| VOW 条款 | 「YOU ACKNOWLEDGE ENTERING INTO A LAWFUL CONSUMER-BROKER RELATIONSHIP WITH THE VOW OPERATOR」；「DOES NOT BY ITSELF CREATE A DESIGNATED REPRESENTATION OR AGENCY AGREEMENT」；personal non-commercial、bona fide interest；「Prior to accessing certain features of this website, users must fill out the registration form」。 | 同上 |
| **AI 条款（三家里最具体）** | 条款生效日 **2026-10-09**。「Automated Access」节禁止「any robot, spider, crawler, scraper, bot, script, headless browser, API client」；**允许「Personal Agent」**：「to perform, in real time, the same actions You are personally entitled to perform under these Terms」，条件「each use of the Personal Agent is initiated by a specific, contemporaneous request from You」，且不得「retain, store, cache, aggregate, republish or redistribute the Content」；禁止「training, pre-training, fine-tuning」与「building, populating or updating any dataset, corpus, index, vector database, knowledge base」。 | 同上 |
| 隐私 | 「Realmaster is the sole owner of the data gathered on this site」「We vow not to sell or lease this data」；注册信息会向协会披露。 | 同上 |
| 公司 | 创始人 / 融资 / 用户数公开资料查不到；Google Play「100K+」下载、3.3 分 584 评；iOS 3.2 分 127 评。 | https://play.google.com/store/apps/details?id=com.realmaster ；https://apps.apple.com/ca/app/id978214719 |

**启示**：RealMaster 的结构是「技术公司 + 挂靠一家自家的经纪公司」——数据权在 Avion Realty，App 在 RealMaster Technology。它 2026-10-09 新版条款里「用户发起的个人 AI 代理可以实时代用户操作、但不得留存 / 建索引 / 训练」这一段，是加拿大房源站里第一次把「个人 AI 代理」写成允许项，可以直接当 Stayloop 开放 API / MCP 条款的参考范本（见 §4）。

### 1.3 liv.rent

| 项 | 现状 | 证据 |
|---|---|---|
| 法人与身份 | Liv Strategies Inc.，温哥华；条款 §5.2「Liv Strategies is not a broker and does not provide brokerage services」「is not a representative or agent of Landlords or Tenants」。 | https://liv.rent/terms ；https://liv.rent/about |
| 房源来源 | 面向房东、物业经理、经纪公司自发；Toronto 列表页「1080 Rentals Found」，卡片标楼名 / 管理公司（如「Hersz Properties Ltd.」）或「Private Suite / Entire Apartment」，**看不到 MLS 标记或「Listed by brokerage」**；企业客户经 XML / Developer API / RentSync / Rhenti / Leasey / Buildium / Yardi 推房源进来，「available exclusively to enterprise users」；企业档「Trusted by over 500 property management companies across Canada」。 | https://liv.rent/rental-listings/city/toronto ；https://liv.rent/blog/rental-laws/landlords-liv-rent-intergration-tools/ （2025-12-04 发布、2026-06-26 更新） |
| MLS 数据 | 页脚：「MLS® data provided by the Toronto Regional Real Estate Board (TRREB)」「displayed under agreement with Prompton Real Estate Services Corp.」——即 liv.rent 不是会员，经一家经纪公司的协议展示 TRREB 数据。Prompton 能查到的是 BC 持牌经纪公司（BCFSA X021460，温哥华 Davie St），2018 年与 liv.rent 合作过 W1 项目租赁；**它是否同时持有安省注册、这份协议在 PropTx 规则下怎么成立，公开资料查不到**。 | https://liv.rent/about ；https://www.bcfsa.ca/re-brokerage/X021460 （摘要）；https://liv.rent/blog/livrent/liv-rent-prompton-partner-to-launch-luxury-rental-suites/ |
| 条款里的数据 / AI | §7.1(v)「data scrape, index, or data mine the Services」、§7.1(w)「use bots or automated processes」禁止；§11.1(a) 对用户内容取得宽泛许可（可「exploit, use, access, store, reproduce, adapt, translate, publish」）、§11.1(d)「owns all intellectual property rights in the content we derive or create from User Content」；**没有 AI 条款，没有 Developer API 条款**；§17.1 加拿大用户适用 BC 法。 | https://liv.rent/terms |

**启示**：liv.rent 证明「不做经纪、靠房东与物业公司自发 + 企业集成」能在多伦多做到四位数的房源量——但它从 2018 年起做了八年、主场在温哥华、企业档有专人对接。它页脚那条 TRREB/Prompton 协议正是我们被拒的那种「会员给平台供数」形态，说明这条路不是绝对走不通，但取决于 PropTx 对个案的态度，且我们已经被明确拒绝过一次。

### 1.4 PropTx / VOW 规则原文（用来判断「可不可复制」）

- 2025-01-10 版《PropTx MLS® Policies》Article 8：「A Member may provide brokerage services via a VOW that include making Listing Information available, but only to consumers with whom the Member has first established a lawful broker–consumer relationship」（第 6 条）；注册要「name and a valid email address」+ 确认邮件 + 用户名密码（第 7 条）；「A Member may designate an Affiliated VOW Partner (“AVP”) to operate a VOW on behalf of the Member, subject to the Member’s oversight, supervision and accountability」（第 1(a) 条）；「No AVP has independent Member rights in the Association or MLS® data … AVP access to MLS® data is derivative of the rights of the Member」（第 22 条）；协会不向 AVP 收比会员更高的费用（22(b)）。**全文没有「artificial intelligence」「AI」字样**——AI 禁令来自 VOW Data Feed Agreement（PropTx 回信引 ss. 3.2、4.1、6.2(a)）与 PropTx 的解释，不在公开政策里。 https://members.oreb.ca/wp-content/uploads/2025/02/2025-01-10_PropTx_MLSR_Policies.pdf
- PropTx VOW 数据馈送页：VOW 让会员「create a Virtual Office Website for their own real estate services」，签 VOW Datafeed Agreement 的会员可「designate an Affiliated VOW Partner (AVP) to do it for them」。 https://webapp.proptx.ca/oas/common/VOW_Data_Feed.jsp
- 法律背景：2016 年竞争法庭裁定 + 2018-08-23 最高法院拒绝 TREB 上诉后，成交价等数据必须进 VOW 馈送，但 TREB 可把用途限定在「directly related to the business of providing residential real estate brokerage services」，且「Consumers can only access data through a password-protected virtual office website (VOW)」。 https://www.reco.on.ca/news/supreme-court-declines-to-hear-trebs-appeal-against-the-competition-bureau-what-it-means-for-compliance-with-rebba/ （2018-08-28）；https://www.theglobeandmail.com/real-estate/article-treb-presses-brokers-on-data-protection

### 1.5 Stayloop 自己注册经纪公司：能解决什么、代价是什么

**能解决的**：站变成「会员自己品牌的站」，VOW / IDX 协议的主体就是 Stayloop Inc.，PropTx 回信里「只能用于会员自己品牌的网站」这一条自然满足；HouseSigma 与 RealMaster 就是这么做的。

**解决不了的**：
1. **AI 禁令**。回信原话是任何 MLS 数据不得经过任何第三方 AI 模型或服务，「不论系统隔离、API 条款或零留存设置」。Stayloop 的全部模型都是第三方（Anthropic / OpenAI / Google / DeepSeek / 阿里）。成为会员后，这条约束的对象从「供应商」变成「会员本人」，不会消失。HouseSigma 的 SigmaAI（App 7.41.0，2026-07-20：「New: One Chat entry on the Home screen — ask SigmaAI about real estate」）说明「会员品牌下的 AI 问答」在市场上存在，但它用的是自建模型还是第三方、PropTx 是否知情或默许，**官网、条款、隐私政策都没写**；不能据此推定 PropTx 会对 Stayloop 放行。
2. **「经纪业务」要是真的**。数据用途必须「directly related to the business of providing residential real estate brokerage services」。HouseSigma 与 RealMaster 都有旗下经纪、靠佣金生存；一家只为拿数据而注册、不实际交易的经纪公司，在协会审查（TRREB 2020 年就做过「comprehensive review」）里是最显眼的目标。
3. **与既定产品决定冲突**：2026-09-13 定的「Stayloop 不做经纪业务、不收费」、V1.0 讨论稿「MLS / DDF / Realtor.ca 任何数据路径不做」、法规核查里「若 Stayloop 只涉 RTA 租约，TRESA s.5(1)(j) 反而让它整体免注册」——注册经纪公司等于把整家公司纳入 TRESA 监管（广告、披露、信托、投诉、RECO 纪律）。

**代价（官方来源，2026-10 现行数字）**：

| 项目 | 金额 / 要求 | 来源 |
|---|---|---|
| RECO 新经纪公司注册 | 「$356 ($306 + $50 application review fee)」；续期「$306」（两年一期）；分支「$306」；2023-03-01 起的费率 | https://www.reco.on.ca/agents-and-brokerages/fee-schedule/ |
| RECO 拟涨价 | 2027-01-01 起拟回到 2022 水平 + 2.1%：注册 $398、处理 $204、转移 $102（征询已结束，未定案） | https://reco.on.ca/news/proposal-to-revert-reco-registrant-fees-to-2022-levels |
| Broker of Record | 必须是 broker：「registered and employed as a salesperson for at least 24 of the 36 months」+ Broker Qualifying Exam + Broker Program「4 courses, 1 wrap-up session and 1 exam」（12 个月内完成）；公司申请「Section A of the application must be signed by the broker of record」；新任 BoR、高管、董事、持股 ≥10% 者须交刑事记录与司法事项核查（搜索摘要） | https://www.reco.on.ca/agents-and-brokerages/becoming-a-real-estate-broker/ ；https://www.reco.on.ca/agents-and-brokerages/info-for-brokerages/opening-a-brokerage-or-branch-office |
| 保险（强制） | 「$500 per real estate agent, plus applicable taxes」/ 年（2026-09-01 至 2027-08-31）；含 E&O、佣金保护、消费者押金保险；「All registrants must participate in the program as a requirement of their registration」 | https://www.reco.on.ca/agents-and-brokerages/insurance |
| 信托账户 | 即使余额为 0 也要月度对账，BoR 30 天内签字；短缺须立即报 RECO 并补足 | https://www.reco.on.ca/agents-and-brokerages/reco-bulletins/ （Bulletin 8.1 / 8.2） |
| 年度财务申报 | 2026-10-01 起所有经纪公司经 MyWeb 提交，含「Compliance attestations by the broker of record」、财务报表信息、信托资产负债 | https://www.reco.on.ca/news/reco-announces-new-financial-filing-requirements-to-strengthen-consumer-protection |
| TRREB 入会 | 新会员「one-time entrance fee of $460」（2024-11 BoR 通告）；年费总额未公布，TRREB 自留「only 41%」其余转 OREA / CREA；2025 年拟涨 $60 被会员否决 | https://trreb.ca/ListManager/contents/TREB%20News/BOR-081124.html ；https://trreb.ca/hlfiles/pdf/Broker_Resources_V4.pdf |
| OREA / CREA 会费 | OREA「$110 annual dues」（OREA 文件，无日期）；CREA「membership dues of $310 have not increased since 2013」，2027 起每年 +2% 并加两年每年 $30 特别征收 | https://www.orea.com/~/media/Files/Downloads/OREA_Membership-Dues-Membership-Benefits.pdf ；https://realestatemagazine.ca/crea-looks-to-raise-dues-to-offset-shrinking-membership-mounting-legal-costs/ （2026-02-13） |
| PropTx 数据费 | 政策只说不向 AVP 收比会员更高的费用；VOW 馈送本身的费用页面未公布（未能读取） | https://webapp.proptx.ca/oas/common/VOW_Data_Feed.jsp |

**没有官方来源、只能估的**：BoR 的报酬（市场价，本稿不猜）、会计师出年度财务报表的费用、每位注册人的三级会费合计（第三方给的「$1,800–2,200/年」区间未经核实）。按最小配置（1 位 BoR + 公司）算，现金硬成本一年内约 **$356 + $350 + $500 + $460 + 三级会费 ≈ 两千多加元**，真正的成本是 **BoR 的人** 和 **整家公司进入 TRESA 监管**。

**结论**：可复制，不建议复制。原因不是钱，是 ① AI 禁令跟着会员身份走，Stayloop 的核心（AI 助理）照样碰不到 MLS 数据；② 要有真正的经纪业务才站得住；③ 与「不做经纪业务」的既定决定和 TRESA 免注册的现状相冲。如果将来有一位持 broker 资格的合伙人愿意做 BoR、并且愿意真做租赁经纪业务，再把这条路重新评估——那时的形态会是「一家有 AI 工具的租赁经纪公司」，不是现在的 Stayloop。

---

## 2. 三家的产品矩阵

### 2.1 HouseSigma

| 侧 | 功能 | 证据 |
|---|---|---|
| 租客（找房） | 买租同一个 App：「Search homes for sale and rent across major Canadian markets」；成交 / 出租历史「View sold prices and listing history」；AI 估价「AI-powered home valuation tools」；2025-09-12 加「filter listings on the map by rental yield and school score」；SigmaAI 问答（2026-07-20）；「Connect with HouseSigma real estate agents for help buying, selling, or renting」。没有申请、筛查、租约、收租、报修任何一项。 | https://apps.apple.com/ca/app/housesigma-canada-real-estate/id1255490256 |
| 房东 / 投资者 | 「rental cash flow analysis」、区域「median rent price」、可比租金——投资分析，不是房东管理工具 | https://hardbacon.ca/en/mortgage/housesigma-review/ |
| 经纪 | 旗下经纪：「100% leads provided」「free access to great tools such as CRM system」+ learning portal；About 页「qualified leads, access to a listing portal, and brokerage support」 | https://ch.trustpilot.com/review/housesigma.com ；https://housesigma.com/blog-en/about-us/ |
| 定价 | 对用户免费（「HouseSigma doesn't charge you a dime」）；收入是佣金 | Hardbacon |
| 中文 | 网站语言切换「English / 中文」；App 语言「English and Simplified Chinese」；总部 Markham | housesigma.com 导航；App Store |
| 规模（公开可核） | iOS 4.8 分 / 55K 评；Google Play「500K+」下载、4.8 分 / 15.4K 评、2026-07-20 更新；Trustpilot 4.9 / 1,634 评；自述「more than two million registered users」「trusted by more than two million monthly users」（自报） | App Store；https://play.google.com/store/apps/details?id=com.housesigma.android ；Trustpilot；About |

### 2.2 RealMaster（房大师）

| 侧 | 功能 | 证据 |
|---|---|---|
| 租客 | 网站导航 Buy / Rent / New Condos / Trusted Assignment + Map / Open House / Sold Price；租房页标题「ON Homes For Rent - MLS Listings & Sold Prices」；App：「Exclusive listings including new condo launches, assignments, and landlord rentals」、「20+ years of sold price history for the GTA」、「Instant alerts for new listings, price changes, and sold updates」；中文商店文案「加拿大最大的华人房产市场」「房东直租、经纪代租」（搜索摘要）。没有申请 / 筛查 / 租约 / 收租。 | https://www.realmaster.com/ ；https://apps.apple.com/ca/app/id978214719 |
| 房东 | 「landlord rentals」作为独家房源类别存在，发布流程与是否收费未能读取 | Google Play 描述 |
| 经纪 / 服务商 | 「Yellow Pages for mortgage agents, insurance agents, accountants, and realtors」+「Housing renovation and maintenance services」；经纪入驻方式与费用未能读取 | https://play.google.com/store/apps/details?id=com.realmaster |
| AI | 无「AI」字样，只有「Automatic sold price estimations powered by real-time market analysis」 | App Store |
| 中文 | 网站 English / 简体中文 / 繁體中文 / **한국어**；App 英 / 简 / 繁 | realmaster.com 语言菜单 |
| 规模 | Google Play「100K+」、3.3 分 / 584 评（2026-10-06 更新）；iOS 3.2 分 / 127 评 | 两个商店页 |

### 2.3 liv.rent（房东 / 企业 / 集成侧；租客侧见 `tenant/liv-rent.md`）

| 侧 | 功能 | 证据 |
|---|---|---|
| 房东 | 三档：Essentials $0（2 套房源、筛查按次付、标准数字合同、1 席）、Growth $48/月年付或 $56 月付（15 套、每月 2 份 Equifax 筛查、带 lease protection addendums 的合同、3 席、无限自动回复）、Business $399 / $490（150 套、15 份 / 月、自定义合同、10 席、优先支持）；全部含「Credit Card, UnionPay & Bitcoin」收租、提醒、收支表；PAD「Coming Soon」；「A payout fee may be charged for digital rent collection」 | https://liv.rent/pricing |
| 企业 / 物业公司 | Webhooks、Custom XML Feed、Zapier、Buildium、RentSync、Developer API、Rhenti、Leasey、Yardi，「available exclusively to enterprise users」；Facebook Marketplace Syndication；五步接入（请求 → 专属客户经理 → 连接 → 测试 → 上线） | https://liv.rent/blog/rental-laws/landlords-liv-rent-intergration-tools/ |
| 经纪 | 没有经纪专属产品；Business 档面向「seasoned landlords and brokerages」 | pricing |
| AI | 「AI Smart Filters」（「AI-powered filtering and recommendations」）；Trust Score 算法；企业自动回复「across email, phone, and AI tools」。没有对话 / 代办。 | https://liv.rent/ ；集成页 |
| 保险 | 官网、定价、条款、集成页都没有租客 / 房东保险；搜索也没有合作保险商 | 多页 |
| 中文 | 无（App 只有 English） | https://apps.apple.com/ca/app/liv-rent-apartment-finder/id1321741040 |
| 规模 | 首页「thousands of landlords and property managers」；企业档「over 500 property management companies」；Toronto 1,080 套；iOS 3.6 分 / 74 评 | 首页、集成页、列表页、App Store |

---

## 3. 与 Stayloop 的差异表

| 能力 | HouseSigma | RealMaster | liv.rent | Stayloop（现状） | 判断 |
|---|---|---|---|---|---|
| MLS 房源 + 成交 / 出租历史（登录后） | 有（7 个协会） | 有（6 个协会） | 页脚称经 Prompton 协议有 TRREB 数据，列表页看不到 MLS 标记 | **无**（PropTx 拒绝；Realtor 导入已归档） | **做不了**，除非成为经纪公司（§1.5） |
| 房东直租房源 | 无 | 有（「landlord rentals」） | 有（主来源） | 有（3 套在架，全是测试） | 同类，量级差 |
| 身份：经纪公司 | 是 | 是（Avion Realty） | 否 | 否 | 我们与 liv.rent 同类 |
| AI 问答 | SigmaAI（2026-07） | 无 | 无 | 有（三身份 AI 助理） | 我们更深 |
| AI 代办 + 审批 + 60 秒撤销 + 审计 | 无 | 无 | 无 | 有 | **只有我们** |
| 安省 / 外省规则引擎（RTA / OHRC / 12 省事实） | 无 | 无 | 法律常识 FAQ（BC 为主） | 有 | **只有我们** |
| 筛查 | 无 | 无 | Trust Score（Equifax + 收入 + 身份，房东付） | 文件取证 + 四项评分 + 法庭 / LTB（注册前 tool 模式） | 方法不同；它靠局方分，我们靠文件 |
| 申请包复用 | 无 | 无 | Renter Resume | 路线图乙 #7 | 可学 |
| 电子签 | 无 | 无 | BC / 安省标准租约，合同 ID 可在 verify.liv.rent 核验 | 安省标准租约电子签 | 「合同 ID 公开核验」可学 |
| 收租 | 无 | 无 | 信用卡 / UnionPay / 比特币，收手续费 | 不做（FINTRAC / RPAA） | 不学 |
| 报修 / 服务市场 | 无 | 黄页目录 | 「Basic tracking」 | 工单状态机 + 已核验服务商 + RTA s.27 | **只有我们** |
| 消息证据链（只追加 + 哈希链 + 导出） | 无 | 无 | 「chat timeline serves as a record」 | 有 | 我们更硬 |
| 经纪工具 | 旗下经纪 CRM + 线索 | 黄页 | 无 | 客户表 / TRESA 日期 / 委托 / 代客筛查 | 方向不同 |
| 中文 | 英 / 简中 | 英 / 简 / 繁 / 韩 | 英 | 中文为主 + 英 | 同类；两家证明华人用户是真实细分市场 |
| 对外 API | 无 | 无（条款反而允许「Personal Agent」） | Developer API（仅企业） | 三端点 + 规划中的 REST / MCP | 我们对外更开 |

---

## 4. 合作可能

| 对象 | 公开的入口 | 可行的互补形态 | 门槛 |
|---|---|---|---|
| liv.rent | 企业集成（XML / Developer API / RentSync / Zapier），「request access」后由客户经理接入；没有公开 API 文档与合作伙伴计划页 | **把 Stayloop 房东直租房源同步进 liv.rent**（Stayloop 扮演 Buildium / Rhenti 那类「房源来源系统」）；反向（liv.rent 房源进 Stayloop）没有入口。筛查不互补——它卖自己的 Trust Score。 | 要走它的企业流程；它条款 §11.1(a) 对推进去的内容取得宽泛许可，房东要知情；房源量≥几十套才值得对方配人 |
| HouseSigma | 只招经纪（agent@help.housesigma.com）；无 API；第三方爬虫在 Apify 上公开卖（不是合作，是风险提示） | 它给旗下经纪线索与 CRM，但**没有筛查 / 申请 / 租约工具**——Stayloop 的经纪筛查、委托、客户表对其旗下租赁经纪是互补品；可做「面向 HouseSigma 经纪的工具」推广，不涉及 MLS 数据 | 不能收转介费（Stayloop 非注册人）；不能碰它的房源数据；只能是经纪个人采购我们的工具 |
| RealMaster | 没有任何公开的 API / 合作 / 入驻页（黄页入驻方式未能读取） | ① 服务商黄页：我们的已核验服务商可去登记（方式未知）；② 它 2026-10-09 条款里的「Personal Agent」允许项，是 Stayloop 开放 API / MCP 服务条款可以直接借用的措辞（用户发起、实时、不留存、不建索引、不训练） | 无人可联系的公开渠道；借条款不需要对方同意 |
| PropTx（再问一次？） | 回信已明确 | 唯一还值得问的窄问题：「会员品牌站上，会员自己的 AI 问答是否允许」——但答案对 Stayloop 没用，除非我们成为会员 | 不建议再写，除非 §1.5 的路线被重新评估 |

**Stayloop 作为「不做经纪业务的 AI 工具」与三家的关系**：与 HouseSigma / RealMaster 不竞争（它们卖的是 MLS 数据与经纪服务，我们不卖）；与 liv.rent 在房东工具上部分重叠（筛查、租约、消息），在 AI 代办、规则、服务市场上不重叠；三家都没有「替用户办事」这一层。

---

## 5. 三栏结论

**可以学**
1. liv.rent 的 Renter Resume（已在路线图乙 #7）和「每份合同有唯一 ID、在 verify.liv.rent 公开核验」——我们的电子签租约可以加一个只验哈希的公开核验页，与消息证据链同一套做法，工作量 S。
2. HouseSigma 的「登录后才看历史」——我们租金记录已经这么做；若将来有任何成交 / 出租历史数据（如 CMHC / 统计局之外的来源），沿用同一闸门。
3. HouseSigma 与 RealMaster 一起证明 GTA 华人用户是独立细分市场（两家 App 都把中文放在第一梯队，RealMaster 还加了韩文）——Stayloop 中文为主的定位可以在营销上更明说，不必藏。
4. RealMaster 条款的「Personal Agent」段——写进 Stayloop 开放 API / MCP 的服务条款（允许用户发起的实时代理，禁止留存 / 索引 / 训练）。
5. liv.rent 的企业集成清单（Buildium / Yardi / RentSync / Zapier / Webhooks）是物业公司真实在用的接口——Stayloop 开放 API 第一档的目标调用方应优先对准这些系统，而不是单个房东。

**不能学**
1. 自己注册经纪公司换 MLS 数据（§1.5）：AI 禁令跟着会员走，且与「不做经纪业务」相冲。
2. 经纪线索变现（HouseSigma 的「100% leads provided」）：Stayloop 非注册人，不能收转介费（TRESA）。
3. 收租（liv.rent 的信用卡 / UnionPay / 比特币）：已定不做。
4. 把成交 / 出租历史做成卖点：没有数据。

**可以合作**
1. liv.rent 企业集成：Stayloop 房东直租房源 → liv.rent（等房源量上来再谈）。
2. HouseSigma 旗下租赁经纪：作为 Stayloop 经纪工具（筛查 / 委托 / 客户表）的目标用户群推广，不涉数据。
3. RealMaster：无公开渠道，先不动。

---

## 6. 需要用户拍板的

1. **经纪公司路线要不要留口**：本稿建议 V1.0 明确不做；若你有持 broker 资格、愿任 Broker of Record 并真做租赁经纪业务的合伙人人选，再单独评估——那是另一家公司的形态。
2. **是否再向 PropTx 问一次「会员自己的 AI 问答是否允许」**：建议不问（答案对非会员无用）。
3. **是否联系 liv.rent 企业集成**：建议等在架房东直租房源 ≥ 30 套再联系，否则对方不会配人。
4. **是否把「面向 HouseSigma / 各经纪公司旗下租赁经纪」写进 V1.0 经纪工具的推广对象**（不涉数据，只卖工具）。
5. **中文定位是否在首页 / 角色页明说**（两家对标证明细分市场存在；现在首页只是中文为主、没有说给谁）。
6. **开放 API / MCP 条款是否采用「Personal Agent」措辞**（允许用户发起的实时代理、禁止留存 / 索引 / 训练）。

---

## 读过的 URL（按出现顺序去重）

- https://housesigma.com/ （JS 壳，只得导航与页脚）
- https://housesigma.com/blog-en/terms-of-use/
- https://housesigma.com/blog-en/about-us/
- https://housesigma.com/blog-en/privacy-policy/
- https://apps.apple.com/ca/app/housesigma-canada-real-estate/id1255490256
- https://play.google.com/store/apps/details?id=com.housesigma.android
- https://ch.trustpilot.com/review/housesigma.com
- https://hardbacon.ca/en/mortgage/housesigma-review/ （2024-02-07，2024-05-15 更新）
- https://theglobeandmail.com/real-estate/toronto/article-toronto-real-estate-board-data-conflicts-continue-despite-2016-ruling （2020-12-29）
- https://www.theglobeandmail.com/real-estate/article-treb-presses-brokers-on-data-protection （2018）
- https://amp.cbc.ca/lite/story/1.4819042 （403，搜索摘要）
- https://www.bcfsa.ca/re-brokerage/REX607486 （403，搜索摘要）
- https://www.realmaster.com/ ；https://www.realmaster.com/en/for-rent ；https://www.realmaster.com/terms （生效 2026-10-09）
- https://apps.apple.com/ca/app/id978214719 ；https://play.google.com/store/apps/details?id=com.realmaster
- https://liv.rent/ ；https://liv.rent/about ；https://liv.rent/pricing ；https://liv.rent/terms ；https://liv.rent/rental-listings/city/toronto
- https://liv.rent/blog/rental-laws/landlords-liv-rent-intergration-tools/
- https://liv.rent/blog/livrent/liv-rent-prompton-partner-to-launch-luxury-rental-suites/
- https://apps.apple.com/ca/app/liv-rent-apartment-finder/id1321741040
- https://www.bcfsa.ca/re-brokerage/X021460 （搜索摘要）
- https://members.oreb.ca/wp-content/uploads/2025/02/2025-01-10_PropTx_MLSR_Policies.pdf
- https://webapp.proptx.ca/oas/common/VOW_Data_Feed.jsp
- https://www.reco.on.ca/news/supreme-court-declines-to-hear-trebs-appeal-against-the-competition-bureau-what-it-means-for-compliance-with-rebba/
- https://www.reco.on.ca/agents-and-brokerages/fee-schedule/
- https://reco.on.ca/news/proposal-to-revert-reco-registrant-fees-to-2022-levels
- https://www.reco.on.ca/agents-and-brokerages/insurance
- https://www.reco.on.ca/agents-and-brokerages/becoming-a-real-estate-broker/
- https://www.reco.on.ca/agents-and-brokerages/info-for-brokerages/opening-a-brokerage-or-branch-office
- https://www.reco.on.ca/news/reco-announces-new-financial-filing-requirements-to-strengthen-consumer-protection
- https://trreb.ca/ListManager/contents/TREB%20News/BOR-081124.html ；https://trreb.ca/hlfiles/pdf/Broker_Resources_V4.pdf
- https://www.orea.com/~/media/Files/Downloads/OREA_Membership-Dues-Membership-Benefits.pdf
- https://realestatemagazine.ca/crea-looks-to-raise-dues-to-offset-shrinking-membership-mounting-legal-costs/ （2026-02-13）
- 仓库内：`design/proptx-refusal-and-listings-strategy-2026-10.md`（PropTx 回信要点）
