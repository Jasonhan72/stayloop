# 给 PropTx 的邮件（2026-10-11 可直接复制版）

收件人 dataagreements@proptx.ca · 抄送 发起接入的会员经纪（及其 Broker of Record） · 附件：`design/proptx-screenshots-2026-10/` 的 8 张 PNG
会员：Sheng Chu（个人公司 Sheng Chu Realty Inc.，挂靠经纪公司 JDL Realty Inc.）。**只剩 RECO 注册号一处方括号要填。** 审核账号的密码不写在邮件里，对方回复后单独发。
顺序：邮件先发，不等回复，请 Sheng Chu 一周内在门户发起 IDX + VOW 两份协议并把 Stayloop Inc. 加为新供应商。

---

Subject: IDX + VOW data feed inquiry — Stayloop Inc. (technology vendor) with TRREB member Sheng Chu

Dear PropTx Data Administrator,

My name is Jason Han, founder of Stayloop Inc., a Toronto-based residential rental platform (www.stayloop.ai). I am writing together with Sheng Chu (RECO #[RECO number], Sheng Chu Realty Inc., registered with JDL Realty Inc.), a TRREB member who intends to start IDX and VOW Datafeed Agreements in the Data Syndication and Agreement System, with Stayloop Inc. designated as the technology vendor / Affiliated VOW Partner. Before the member submits the agreements, we would like to confirm our reading of the display rules and ask four questions.

What Stayloop is

Stayloop is a rental-only platform for Ontario. Prospective tenants browse lease listings, request showings and submit applications; landlords and their agents screen applicants, prepare the Ontario standard lease and manage the tenancy. Anonymous visitors see a limited listing card (an IDX-style display); registered users sign in with a name, a verified email and a password and accept our Terms of Use (a VOW-style display). We would use the feed for residential lease listings in the GTA only.

How the site already follows Article 8 of the PropTx MLS Rules

- 8.05 / 8.06: Registration requires the consumer's name, a verified email address and a password. Every account accepts the Terms of Use at sign-up and again whenever the Terms change (version and time recorded), receives a confirmation email of that acceptance, and must renew its password every 90 days. Account records are retained.
- 8.09 / 8.10 / 8.11: The Terms of Use (www.stayloop.ai/terms, section 5) contain the nine listing-data clauses: acknowledgement of a lawful broker-consumer relationship with the member; personal, non-commercial use; bona fide interest; no copying or redistribution; no AI or automated processing by users; no scraping; ownership and copyright remain with the brokerages and the association; the association and its members may audit the site; no fee and no representation agreement arise from accepting the Terms.
- 8.12: Every listing page has a contact card for the sponsoring member (name, brokerage, phone, email).
- 8.13: The public site never exposes the listing database. All listing reads go through rate-limited server endpoints that return card or detail fields only; anonymous database access is disabled; signed-in users' searches and listing views are logged so an audit trail can be produced on request.
- 8.14 / 8.15.02 / 8.17: Each listing carries per-row display directives (internet display, address display, automated-value display) that the site honours, and feed rows not refreshed within 24 hours are withheld automatically.
- 8.16: Every listing page names an email address (hello@stayloop.ai) for the listing brokerage to flag anything Stayloop adds beyond the feed; we correct or remove it within 48 hours.
- 8.19: The Privacy Policy (www.stayloop.ai/privacy, section 3b) states that consent records and listing-page activity may be shared with the association for auditing or legal purposes.
- 8.24 / 8.25 / 8.26 / 8.28 / 8.29: Listing content is displayed as received; anything we add (a labelled machine translation, transit distances, a neighbourhood note) names its source; every page carries the "deemed reliable but not guaranteed" notice and the copyright / trademark line; the listing brokerage appears on every card and directly under the address on every listing page, in the same type size as the listing facts; listings from other sources are labelled, grouped and searchable separately.
- 8.27: Search results are served at most 100 listings per query, enforced on the server.

Eight screenshots are attached (listing list, listing page, notices, Terms section 5, Privacy section 3b, sign-up). A reviewer account is ready as well: proptx-review@stayloop.ai — I will send the password in a separate message as soon as you would like to look.

Four questions

1. AI assistance to users. Stayloop includes an AI assistant that helps a signed-in user search and compare rental listings inside the site (for example, "two-bedroom units under $2,800 near Union Station"), using only the licensed data and only for that user's own search. Rules 8.01 and 8.18 limit use of the data to operating the VOW. Is this in-site assistance acceptable, and under what conditions? We do not train models on the data and do not use it for any other purpose.
2. Translation. Our interface is bilingual (English / Chinese). For Chinese-language users we show a machine translation of the listing description, clearly labelled as a Stayloop addition, with the original one click away. Does a labelled translation count as an alteration under Rule 8.24, and would you prefer the original shown alongside by default?
3. Mixed sources. Landlords also publish their own rental listings directly on Stayloop. They are labelled, grouped and searchable separately from MLS® listings (Rules 8.28 / 8.29). Is anything further required when both appear in one search result?
4. Contact routing. Under Rule 8.12 every listing page will show the sponsoring member's contact details. Stayloop also keeps a directory of RECO-registered agents who have verified their registration with us, which a consumer may use to arrange a showing (Stayloop charges no fee and takes no referral). On MLS® listing pages, may that option remain beside the sponsoring member's contact, or should the sponsoring member be the only contact offered?

Thank you for your time. Sheng Chu will start the IDX and VOW agreements in the Data Syndication and Agreement System shortly and add Stayloop Inc. as a new vendor; we would welcome your guidance on the four points above before or during your review.

Kind regards,

Jason Han
Founder, Stayloop Inc.
www.stayloop.ai · 647-862-6518 · jasonhan72@gmail.com

cc: Sheng Chu, Sheng Chu Realty Inc. / JDL Realty Inc. (sponsoring TRREB member)

---

## 中文对照（只供阅读，发送用上面的英文）

主题：IDX + VOW 数据接入咨询 —— Stayloop Inc.（技术供应商）与 TRREB 会员 Sheng Chu

PropTx 数据管理员，您好：

我是 Jason Han，Stayloop Inc. 的创始人，Stayloop 是一个总部在多伦多的住宅租赁平台（www.stayloop.ai）。我与 TRREB 会员 Sheng Chu（RECO 注册号 [号码]，Sheng Chu Realty Inc.，挂靠 JDL Realty Inc.）一同致信：这位会员准备在 Data Syndication and Agreement System 里发起 IDX 与 VOW 两份数据协议，并把 Stayloop Inc. 指定为技术供应商 / Affiliated VOW Partner。在会员提交协议之前，我们想确认我们对展示规则的理解，并请教四个问题。

Stayloop 是什么

Stayloop 是只做安省住宅租赁的平台。租客在上面浏览出租房源、预约看房、提交申请；房东及其经纪筛查申请人、准备安省标准租约、管理租期。匿名访客只能看到有限的房源卡片（IDX 式展示）；注册用户用姓名、已验证的邮箱和密码登录并接受我们的服务条款（VOW 式展示）。我们只会把数据用于大多伦多地区的住宅出租房源。

网站已经如何遵守 PropTx MLS 规则第 8 条

- 8.05 / 8.06：注册需要用户的姓名、已验证的邮箱和密码。每个账号在注册时接受服务条款，条款每次更新都要再次接受（记录版本与时间），接受后会收到确认邮件，密码每 90 天必须更新。账号记录予以保留。
- 8.09 / 8.10 / 8.11：服务条款（www.stayloop.ai/terms 第 5 节）包含九条房源数据规则：确认与会员建立合法的经纪-消费者关系；仅限个人非商业用途；真实意向；不复制、不转发；用户不得用 AI 或自动化处理；禁止抓取；所有权与版权归经纪公司与协会；协会及其会员可以审查本站；接受条款不产生任何费用、不构成代表协议。
- 8.12：每个房源页都有发起会员的联系卡（姓名、经纪公司、电话、邮箱）。
- 8.13：公开网站从不暴露房源数据库。所有房源读取都经过带限流的服务端接口，只返回卡片或详情字段；匿名数据库访问已关闭；登录用户的搜索与浏览都有记录，可应要求提供审计轨迹。
- 8.14 / 8.15.02 / 8.17：每套房源带逐行展示指令（是否上网展示、是否展示地址、是否展示自动估值），网站照此执行；24 小时内未刷新的 feed 数据自动不展示。
- 8.16：每个房源页都注明一个邮箱（hello@stayloop.ai），供挂牌经纪公司指出 Stayloop 在 feed 之外附加的任何信息；我们在 48 小时内更正或移除。
- 8.19：隐私政策（www.stayloop.ai/privacy 第 3b 节）写明同意记录与房源页活动可能提供给协会用于审计或法律目的。
- 8.24 / 8.25 / 8.26 / 8.28 / 8.29：房源内容按原样展示；我们附加的任何内容（标注的机器翻译、交通距离、社区简介）都注明来源；每页都有「被认为可靠但不保证准确」声明和版权 / 商标句；挂牌经纪公司出现在每张卡片上和每个房源页的地址正下方，字号不小于房源事实；来自其他来源的房源分别标注、分组、分开检索。
- 8.27：搜索结果每次查询最多返回 100 套，由服务端执行。

随信附上八张截图（房源列表、房源页、声明、条款第 5 节、隐私第 3b 节、注册）。审核账号也已备好：proptx-review@stayloop.ai —— 您想查看时，我另行发送密码。

四个问题

1. 对用户的 AI 辅助。Stayloop 内置一个 AI 助理，帮助已登录用户在站内搜索和比较出租房源（例如「Union Station 附近 2,800 加元以下的两室」），只使用已授权的数据、只服务于该用户自己的搜索。规则 8.01 和 8.18 把数据用途限定为运营 VOW。这种站内辅助是否可以接受？有什么条件？我们不用这些数据训练模型，也不作任何其他用途。
2. 翻译。我们的界面是中英双语。对中文用户，我们展示房源描述的机器翻译，明确标注为 Stayloop 附加内容，原文一键可见。带标注的翻译是否算规则 8.24 所说的「改动」？你们是否希望默认把原文并排展示？
3. 混合来源。房东也会直接在 Stayloop 发布自己的出租房源。它们与 MLS® 房源分别标注、分组、分开检索（规则 8.28 / 8.29）。两者出现在同一搜索结果中时，是否还有其他要求？
4. 联系路径。按规则 8.12，每个房源页都会展示发起会员的联系方式。Stayloop 还有一个在我们这里核验过注册的 RECO 注册经纪目录，消费者可以从中选人安排看房（Stayloop 不收费、不抽转介费）。在 MLS® 房源页上，这个选项能否与发起会员的联系方式并存，还是只能提供发起会员一个联系方式？

感谢您的时间。Sheng Chu 将于近日在 Data Syndication and Agreement System 发起 IDX 与 VOW 协议并把 Stayloop Inc. 加为新供应商；欢迎您在审核前或审核中就以上四点给予指导。

此致

Jason Han
Stayloop Inc. 创始人
www.stayloop.ai · 647-862-6518 · jasonhan72@gmail.com

抄送：Sheng Chu，Sheng Chu Realty Inc. / JDL Realty Inc.（发起接入的 TRREB 会员）
