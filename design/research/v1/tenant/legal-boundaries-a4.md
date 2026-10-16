# A4 · 租客侧「不能做的事」法规边界（安省）

抓取日期：2026-10-13
核查人：Claude（法规核查员）。只做网页调研，未改仓库代码。

## 读过的 URL

**成功读取（原文）**
- e-Laws API（ontario.ca 页面本身要 JavaScript，WebFetch 只拿到空壳；改用页面脚本里暴露的接口 `https://www.ontario.ca/laws/api/v2/legislation/en/act-content/<statute|regulation>/<id>` 拿到的就是 e-Laws 现行合并版全文）：
  - RTA 2006 `statute/06r17`（Residential Tenancies Act, 2006, S.O. 2006, c. 17）
  - O. Reg. 516/06 `regulation/060516`
  - O. Reg. 290/98 `regulation/980290`（Human Rights Code 下的租客筛选规章）
  - Human Rights Code `statute/90h19`
  - Consumer Reporting Act `statute/90c33`
  - Law Society Act `statute/90l08`
  - TRESA 2002 `statute/02r30`（Trust in Real Estate Services Act）
- https://www.ohrc.on.ca/en/policy-human-rights-and-rental-housing（OHRC 政策网页）
- https://www.ohrc.on.ca/sites/default/files/attachments/Policy_on_human_rights_and_rental_housing.pdf（OHRC 政策 PDF，pdftotext 抽文）
- https://laws-lois.justice.gc.ca/eng/acts/P-8.6/page-1.html 与 page-7.html（PIPEDA 正文与 Schedule 1）
- https://laws-lois.justice.gc.ca/eng/acts/R-7.36/page-1.html（Retail Payment Activities Act s.2）
- https://fintrac-canafe.canada.ca/msb-esm/msb-eng（FINTRAC MSB 定义）
- https://tribunalsontario.ca/documents/ltb/Brochures/Who%20Can%20be%20a%20Representative%20before%20the%20Landlord%20and%20Tenant%20Board.html
- https://tribunalsontario.ca/documents/ltb/Practice%20Directions/Practice%20Direction%20on%20Representation%20before%20the%20LTB.html
- https://tribunalsontario.ca/documents/ltb/Brochures/Info_Sheet-Confidentiality_and_Public_Access.html
- https://tribunalsontario.ca/?p=42708（2026-07-24 LTB 判令上开放数据目录的公告）
- https://canada.justice.gc.ca/eng/rp-pr/jr/ecjh-eamjc/appendix-annexe.html（联邦司法部对各省「非律师提供法律服务」的框架摘要）
- https://www.openroom.ca/

**未能读取**
- https://www.ontario.ca/laws/statute/06r17 等 e-Laws 网页（只返回「e-Laws needs JavaScript」空壳；改走上面的 API）
- https://www.canlii.org/…（403，自动访问被挡）
- https://lso.ca/protecting-the-public/complaints/types-of-complaints/unauthorized-practice（403）
- https://lso.ca/about-lso/legislation-by-laws/by-laws（403，By-Law 4 原文拿不到）
- web.archive.org 镜像（工具不允许）
- https://www.ontario.ca/laws/regulation/240043（TRESA 新规 O. Reg. 43/24，API 返回 not found；信托账户的要求以 TRESA 法本身 s.27 为准）

---

## 1. 不得向租客收取任何费用（RTA s.134 + O. Reg. 516/06 s.17）

- **法条**：RTA 2006, s.134(1)(a)–(c)、(1.1)、(2)、(3)；O. Reg. 516/06, s.17
- **官方 URL**：https://www.ontario.ca/laws/statute/06r17#BK185 ；https://www.ontario.ca/laws/regulation/060516
- **原文（e-Laws 现行版）**
  - s.134(1)(a)：“collect or require or attempt to collect or require from a tenant, prospective tenant or former tenant of the rental unit a fee, premium, commission…”
  - s.134(1)(b)：“require or attempt to require a tenant or prospective tenant to pay any consideration for goods or services as a condition for granting the tenancy”
  - s.134(2)：“No superintendent, property manager or other person who acts on behalf of a landlord … shall, directly or indirectly, with or without the authority of…”
  - s.134(3)：“no tenant and no person acting on behalf of the tenant shall … collect or require … any fee, premium, commission, bonus, penalty, key deposit…”
  - O. Reg. 516/06 s.17 允许项（原文列表）：“Payment for additional keys, remote entry devices or cards requested by the tenant, not greater than the direct costs.”；“Payment of a refundable key, remote entry device or card deposit, not greater than the expected direct replacement costs.”；“Payment of NSF charges charged by a financial institution to the landlord.”；“Payment of an administration charge, not greater than $20, for an NSF cheque.”；另有「和解付款」「移动屋园区」「同楼换房 ≤ $250」「土地租赁房产税」四项。
  - 追回途径 s.135(1)：“A tenant or former tenant of a rental unit may apply to the Board for an order that the landlord, superintendent or agent of the…”
- **注意**：s.134 的主语是 landlord / 代表房东的人 / tenant 及其代理人。它没有一条写「任何人」。但 (2) 把「以房东名义行事的任何人」（含物业经理、平台）兜住了；(3) 把「替租客行事的人」在转租/交房场景兜住了。
- **对 Stayloop 租客工具的含义**：平台不能以「申请费」「锁定费」「筛查费转嫁」「钥匙押金超成本」等任何名目向租客或申请人收钱；连「替房东代收」也在 (2) 的射程内。能收的只有 s.17 那张清单（可退钥匙押金 ≤ 成本、NSF 的银行费 + ≤ $20 手续费等）。

## 2. 押金只能是最后一个月租金（RTA s.105–106）

- **法条**：RTA s.105(1)–(2)、s.106(1)(2)(3)(6)(9)(10)、s.107、s.108；s.234(d)(e)(f) 为罚则
- **官方 URL**：https://www.ontario.ca/laws/statute/06r17#BK150
- **原文**
  - s.105(1)：“The only security deposit that a landlord may collect is a rent deposit collected in accordance with section 106.”
  - s.106(2)：“The amount of a rent deposit shall not be more than the lesser of the amount of rent for one rent period and the amount…”
  - s.106(6)：“A landlord of a rental unit shall pay interest to the tenant annually on the amount of the rent deposit at a rate equal to…”
  - s.106(10)：“A landlord shall apply a rent deposit … in payment of the rent for the last rent period before the tenancy terminates.”
  - s.108：“Neither a landlord nor a tenancy agreement shall require a tenant or prospective tenant to, (a) provide post-dated cheques … or (b) permit automatic debiting”
- **对 Stayloop 的含义**：申请/签约流程里只能出现「最后一个月租金押金」一项（≤ 一个月或一个租期）+ 可退钥匙押金；不能有损坏押金、宠物押金、清洁押金；不能要求预开支票或强制自动扣款（s.108）；在管租约的利息按当年指导比例每年计（2026 年 2.1%）。

## 3. 不得按受保护特征拒租；收入门槛（Human Rights Code s.2(1) + O. Reg. 290/98 + OHRC 政策）

- **法条**：Human Rights Code, R.S.O. 1990, c. H.19, s.2(1)、s.2(2)、s.21(1)、s.21(3)；O. Reg. 290/98 s.1–4；RTA s.10
- **官方 URL**：https://www.ontario.ca/laws/statute/90h19 ；https://www.ontario.ca/laws/regulation/980290 ；https://www.ohrc.on.ca/en/policy-human-rights-and-rental-housing
- **原文**
  - Code s.2(1)：“Every person has a right to equal treatment with respect to the occupancy of accommodation, without discrimination because of race, ancestry, place of origin, colour…”（后续列举 sexual orientation, gender identity, gender expression, age, marital status, family status, disability, receipt of public assistance）
  - Code s.21(1) 例外：“…is not infringed by discrimination where the residential accommodation is in a dwelling in which the owner or his or her family reside if the…”
  - O. Reg. 290/98 s.1(3)：“A landlord may request income information from a prospective tenant only if the landlord also requests information listed in subsection (1).”
  - O. Reg. 290/98 s.1(4)：“…may select or refuse the prospective tenant accordingly only if the landlord considers the income information together with all the other information”
  - O. Reg. 290/98 s.4：“Nothing in this Regulation authorizes a landlord to refuse accommodation to any person because of race, ancestry, place of origin, colour, ethnic origin, citizenship, creed…”
  - OHRC 政策（网页「Choosing tenants」）：“It is illegal for housing providers to apply a rent-to-income ratio such as a 30% cut-off rule.”；“A lack of rental or credit history should not be viewed negatively.”；“Regulation 290/98 under the Code permits no other inquiries.”
  - OHRC 政策 PDF §4.2：“An Ontario human rights tribunal found that these practices were not bona fide requirements because they had no value in predicting whether a tenant would…”
- **对 Stayloop 的含义**：租客侧工具不能把收入倍数做成「门槛」或排序依据（站内 2026-09-13 已改为信息性）；申请表与 AI 不得问受保护特征；无信用史不得记负分；担保人要求必须对所有人一样。唯一的法定例外是与房东同住共用厨卫（s.21(1)），那种情况 RTA 也不适用（RTA s.5(i)）。

## 4. 代收租金 / 经手资金（联邦 FINTRAC MSB · 联邦 RPAA · 安省 TRESA 信托账户）

**(a) FINTRAC —「货币服务业」注册（法规）**
- 来源：https://fintrac-canafe.canada.ca/msb-esm/msb-eng（PCMLTFA 的官方摘要页）
- 原文：MSB = “A person or entity that has a place of business in Canada” that is “engaged in the business of providing at least one of the following services:” … “remitting funds or transmitting funds by any means or through any person, entity or electronic funds transfer network” … “Before beginning to operate in Canada, you must register”
- 含义：如果 Stayloop 替租客把租金「汇转」给房东（平台账户过手），就落在「remitting or transmitting funds」里，须在开业前向 FINTRAC 注册为 MSB，并承担 KYC / 记录 / 可疑交易报告义务。只做提醒、只链接到房东自己的收款渠道不算。

**(b) 联邦《零售支付活动法》（RPAA）— 向加拿大央行注册（法规，2024–2025 起施行）**
- 来源：https://laws-lois.justice.gc.ca/eng/acts/R-7.36/page-1.html ；https://www.bankofcanada.ca/core-functions/retail-payments-supervision/
- 原文 s.2 “payment function”：“(b) the holding of funds on behalf of an end user until they are withdrawn by the end user or transferred to another individual or…” “(c) the initiation of an electronic funds transfer at the request of an end user;”
- 原文 s.2 “payment service provider”：“an individual or entity that performs payment functions as a service or business activity that is not incidental to another service or business activity.”
- 央行页：“Individuals and entities who are subject to the Retail Payment Activities Act (RPAA) are required to register with us”
- 含义：平台替租客「代持」或「发起」租金转账 = 支付功能；若不是附带性业务，要向加拿大央行登记为 PSP（另有资金保护、风控框架义务）。这是 FINTRAC 之外的第二道联邦门。

**(c) 安省 TRESA — 经纪的信托账户（法规，只约束注册经纪公司）**
- 来源：https://www.ontario.ca/laws/statute/02r30（TRESA 2002, s.27；定义 “trade” 含 lease / rental）
- 原文 s.27(1)：“Every brokerage shall, (a) maintain in Ontario an account designated as a trust account… (b) deposit into the account all money that comes into the…”
- 原文 s.27(2)：“Brokerages shall fully and clearly disclose in writing to a person depositing trust money the terms on which the brokerage deposits the money”
- 原文定义：“‘trade’ includes a disposition or acquisition of or transaction in real estate by sale, purchase, agreement for purchase and sale, exchange, option, lease, rental or…”
- 含义：经纪替房东代收押金时必须进经纪公司的信托账户、分开记账、书面披露；这是对 RECO 注册人的法定义务，不是 Stayloop 的。Stayloop 不是经纪公司，不能代经纪持有这笔钱。O. Reg. 43/24 里「收到后 5 个工作日内存入」的具体期限本轮没拿到原文（API 返回 not found），只在二手来源看到，标为**未核实**。

**(d) 安省没有「物业管理牌照」或「代收租金牌照」（行业惯例，非法规）**
- 安省不像 BC/AB 那样给物业管理发牌；代收租金本身在安省没有专门的省级登记（RTA 只管押金与费用）。但 RTA s.134(2) 把「代表房东行事的物业经理 / 任何人」纳入收费禁令。
- **如实结论**：法规层 = FINTRAC MSB（联邦）+ RPAA PSP（联邦）+ RTA s.105/106/108/134（安省）+ TRESA s.27（只对经纪）。「信托账户、分账」对非经纪平台是行业惯例与合同义务，不是安省法定要求。

## 5. 替租客做法律代理（Law Society Act s.26.1 · By-Law 4 · LTB 代理规则）

- **法条**：Law Society Act, R.S.O. 1990, c. L.8, s.1(5)–(6)、s.26.1(1)–(2)；LSO By-Law 4 Part V ss.30–31（原文未拿到）；RTA s.3(4)
- **官方 URL**：https://www.ontario.ca/laws/statute/90l08 ；LTB 手册 https://tribunalsontario.ca/documents/ltb/Brochures/Who%20Can%20be%20a%20Representative%20before%20the%20Landlord%20and%20Tenant%20Board.html ；LTB 实务指引 https://tribunalsontario.ca/documents/ltb/Practice%20Directions/Practice%20Direction%20on%20Representation%20before%20the%20LTB.html
- **原文（Law Society Act，e-Laws 现行版）**
  - s.26.1(1)：“no person, other than a licensee whose licence is not suspended, shall practise law in Ontario or provide legal services in Ontario.”
  - s.1(5)：“a person provides legal services if the person engages in conduct that involves the application of legal principles and legal judgment with regard to the…”
  - s.1(6) 列举：“1. Gives a person advice with respect to the legal interests, rights or responsibilities of the person” … “2. Selects, drafts, completes or revises, on behalf of a person … vii. a document for use in a proceeding before an adjudicative body.” … “3. Represents a person in a proceeding before an adjudicative body. 4. Negotiates the legal interests, rights or responsibilities of a person.”
- **原文（LTB 手册 / 实务指引）**
  - “A licensed representative is a lawyer or paralegal licensed by the LSO.”
  - 豁免：“An unpaid family member who is not in the business of providing legal services and who does not receive compensation.”；朋友/邻居同样须 “not in the business of legal services, receive no compensation, and have provided legal services in no more than three matters in a year”；“An individual who is employed by a single employer, provides the legal services only for and on behalf of the employer”；LSO 资助的法律诊所的学生 / 志愿者 / 雇员（Legal Aid Ontario 诊所）。
  - “A person who is not licensed will not be permitted to act as a representative in an LTB proceeding.”
  - 陪同人：“A support person, such as a family member, friend or social worker, may attend a hearing or mediation with a party or witness” — “so long as they do not make submissions on the party’s behalf.”
  - “If the adjudicator is not satisfied that an exemption may apply, the unlicensed person may not represent the party.”
- **By-Law 4 ss.30–31 的内容（原文出自联邦司法部的摘要，LSO 网站 403）**：“a friend, neighbour or relative (whose profession or occupation is non-legal), acting on a no-fee basis” … “for friends and neighbours, only up to three times per year”
- **对 Stayloop 的含义**：平台（商业主体、收费或不收费）**不能**替租客在 LTB 出庭、不能以租客名义与房东「谈判法律权利」、不能替租客起草 T1/T2/T6 等程序文件并自称代理；AI 只能做「信息」而非「针对你个案的法律意见」，输出里要写明不是法律服务、提供 Tenant Duty Counsel / 社区法律诊所 / LSO 持牌名录入口。朋友亲属免费代理的豁免是给自然人的，平台用不上。

## 6. 按姓名查公开记录 / 出具消费者报告（Consumer Reporting Act · LTB 判令公开）

- **法条**：Consumer Reporting Act, R.S.O. 1990, c. C.33：定义 s.1、s.3（注册）、s.8(1)(d)(ii)、s.8(2)、s.9(1)–(3)、s.10、s.12(1)(3)、s.13(1)(2)
- **官方 URL**：https://www.ontario.ca/laws/statute/90c33
- **原文（e-Laws 现行版）**
  - 定义：“‘consumer reporting agency’ means a person who for gain or profit or on a regular co-operative non-profit basis furnishes consumer reports;”
  - 定义：“‘consumer report’ means a written, oral or other communication by a consumer reporting agency of credit information or personal information, or both, pertaining to a…”
  - 定义：“‘personal information’ means information other than credit information about a consumer’s character, reputation, health, physical or personal characteristics or mode of living”
  - s.3（注册；任务书写的 s.2 其实是「登记官」条款，注册要求在 s.3）：“No person shall conduct or act as a consumer reporting agency or act as a personal information investigator unless registered by the Registrar under this…”
  - s.8(1)(d)(ii)：“in a consumer report given to a person who it has reason to believe, … intends to use the information in connection with the entering…”
  - s.8(2)：“No person shall knowingly obtain any information from the files of a consumer reporting agency respecting a consumer except for the purposes referred to in…”
  - s.9(3)(b)：“any unfavourable personal information unless it has made reasonable efforts to corroborate the evidence on which the personal information is based, and the lack of…”
  - s.9(3)(c)：“information as to judgments after seven years after the judgment was given, unless the creditor or the creditor’s agent confirms that it remains unpaid”
  - s.12(1)：“A consumer may, in writing, request a consumer reporting agency to provide, (a) the consumer’s consumer report; or (b) the consumer’s current consumer score and…”
  - s.12(3) 第 3 项：“The name and telephone number of every person on whose behalf the file has been accessed within the three-year period preceding the request.”
  - s.13(1)：“a consumer may … dispute the accuracy or completeness of any item of information contained in his or her file and the consumer reporting agency…”
  - s.13(2)(a)：更正后须通知 “all persons who have been supplied with a consumer report based on the unamended file within sixty days before the correction”
- **LTB 判令公开（Tribunals Ontario 官方）**
  - 信息单（Confidentiality and Public Access）：“LTB decisions and orders are generally publicly available.”；LTB “will not generally remove names, addresses, or other information” from decisions and orders；“Requests for confidentiality orders should be made in writing and filed with the LTB before the hearing.”
  - 2026-07-24 公告（https://tribunalsontario.ca/?p=42708）：“Starting July 24, 2026, the LTB will begin posting final orders issued between January 2026 and May 2026” … “This will not include orders for which confidentiality has been granted.” … “The LTB will then commence publishing orders dating back to 2021 in phases”
  - OpenRoom 自述（https://www.openroom.ca/，商业网站，非官方）：“Openroom is registered as a Consumer Reporting Agency (CRA)”；“Openroom operates under the Consumer Reporting Act.”
- **对 Stayloop 的含义**：判令「公开」≠ 任何人都能拿它做租客筛查产品。只要 Stayloop 按姓名查 LTB/法院记录并把结果（含「mode of living」类的 personal information）传给房东作租约决策、且有对价，就是 s.1 的「consumer report」，须按 s.3 注册、按 s.9 做佐证与七年时效、按 s.12/13 给申请人查档与争议通道（站内已定为 V0.8 第一项；`CRA_MODE=tool` 开关已就位）。租客侧工具更不能「替租客查房东」然后出具有评价性的报告——同样落在 CRA 里。

## 7. 申请表不得收取的信息 / 隐私（PIPEDA s.5(3)、Schedule 1 4.3 / 4.4；OHRC）

- **法条**：PIPEDA, S.C. 2000, c. 5, s.4(1)(a)、s.5(3)、Schedule 1 Principle 4.3、4.3.3、4.4、4.4.1；OHRC 政策 §4.2.5（SIN）与「Choosing tenants」
- **官方 URL**：https://laws-lois.justice.gc.ca/eng/acts/P-8.6/page-1.html ；https://laws-lois.justice.gc.ca/eng/acts/P-8.6/page-7.html ；https://www.ohrc.on.ca/sites/default/files/attachments/Policy_on_human_rights_and_rental_housing.pdf
- **原文（justice.gc.ca 现行版）**
  - s.4(1)(a)：适用于 “personal information that (a) the organization collects, uses or discloses in the course of commercial activities”
  - s.5(3)：“An organization may collect, use or disclose personal information only for purposes that a reasonable person would consider are appropriate in the circumstances.”
  - 4.3：“The knowledge and consent of the individual are required for the collection, use, or disclosure of personal information, except where inappropriate.”
  - 4.3.3：“An organization shall not, as a condition of the supply of a product or service, require an individual to consent to the collection … beyond…”
  - 4.4：“The collection of personal information shall be limited to that which is necessary for the purposes identified by the organization.”
  - 4.4.1：“Organizations shall not collect personal information indiscriminately. Both the amount and the type of information collected shall be limited”
- **原文（OHRC 政策 PDF §4.2.5）**：“it is the OHRC’s position that housing providers should use means other than Social Insurance Numbers to conduct credit checks.” … “Service Canada … specifically discourages private sector organizations, including landlords negotiating leases, from asking for a Social Insurance Number.”
- **原文（OHRC 网页）**：“Regulation 290/98 under the Code permits no other inquiries.”（即只能问：收入信息、信用参考、信用检查授权、租史、担保；且收入不能单独用）
- **对 Stayloop 的含义**：申请表只收 O. Reg. 290/98 允许的五类 + 为联系与签约所必需的信息；不收 SIN（站内已不收）、不问国籍 / 移民身份 / 年龄 / 婚姻 / 家庭 / 宗教 / 残障 / 社会援助；每项收集要有「合理目的」并逐项取得同意，不能把「同意多收」做成使用条件（4.3.3）；魁北克另有 CAI 指引（站内已按省分流）。

## 8. 租客信用检查需本人同意；拒绝时须通知（CRA s.8(1)(d)、s.10）

- **法条**：Consumer Reporting Act s.8(1)(b)、s.8(1)(d)(ii)、s.10(1)、s.10(2)、s.10(6)、s.10(7)；O. Reg. 290/98 s.1(1)
- **官方 URL**：https://www.ontario.ca/laws/statute/90c33 ；https://www.ontario.ca/laws/regulation/980290
- **原文（e-Laws 现行版）**
  - O. Reg. 290/98 s.1(1)：“may request from a prospective tenant authorization to conduct credit checks on the prospective tenant.”（授权 = 同意）
  - CRA s.8(1)(b)：报告机构可依 “the written instructions of the consumer to whom the information relates” 披露
  - CRA s.10(2)：“No person shall request or obtain a consumer report, (a) containing personal information about a consumer; … unless that person first gives written notice of…”
  - CRA s.10(1)：“Every person shall, where requested by a consumer in writing or personally, inform the consumer whether or not a consumer report respecting him or her…”
  - CRA s.10(6)：“Any notice referred to in this section shall be clearly set forth in bold type or underlined and in letters not less than ten point…”
  - CRA s.10(7)：“Where a benefit is denied to a consumer … because of information received from a consumer reporting agency or a person other than a consumer…” … 并在 “the request of the consumer made within sixty days after such notice” 时告知 “the nature and source of the information”
- **注意**：s.10(7) 的主语是「用信息的人」（房东），而且覆盖「来自报告机构或**其他人**的信息」——不限于征信局，Stayloop 的报告也算「其他人」。
- **对 Stayloop 的含义**：拉征信前必须有申请人的书面授权（Form 410 或站内同意记录，含用途与报告机构名）；通知要显眼（粗体/下划线、≥10 pt）；房东拒绝时必须给书面通知 + 60 天内可索取信息性质与来源（站内决定通知已带 s.10(7) 页脚）。租客侧工具可以帮租客查「有没有人调过我的报告」（s.12(3) 第 3 项、三年内的查询人名单）。

---

## 本轮核查的缺口（如实）
- LSO By-Law 4 ss.30–31 原文：LSO 网站对抓取 403，仅拿到联邦司法部摘要 + LTB 手册的转述。
- O. Reg. 43/24（TRESA 新规）「5 个工作日存入信托」：原文未拿到，标未核实。
- CRA s.2 不是注册条款（是登记官任命），注册在 s.3——任务书编号已按实际法条改。
- 判令公开与「消费者报告」的关系是法律定性问题，仍需律师意见（站内 2026-10-12 已记录）。
