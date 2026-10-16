# V1.0 调研稿 · 法规结论逐条核查（2026-10-13）

核查人：Claude（法规核查员）。只读仓库，只写本文件。
对象：`tenant-tools-2026-10.md`（下称「租客稿」，含 `tenant/legal-boundaries-a4.md`）、`agent-tools-2026-10.md`（「经纪稿」）、`landlord-retention-2026-10.md`（「房东稿」）、`open-api-2026-10.md`（「API 稿」）。

**原文来源**（全部于 2026-10-13 以 curl 取回、落在会话 scratchpad `research-legal/`，HTML 剥标签后 grep；引语为逐字复制，≤25 词）：
- 安省法条经 e-Laws 公开接口 `https://www.ontario.ca/laws/api/v2/legislation/en/act-content/<statute|regulation>/<id>`：RTA `statute/06r17`、Law Society Act `statute/90l08`、TRESA 2002 `statute/02r30`、Consumer Reporting Act `statute/90c33`、O. Reg. 567/05 `regulation/050567`、O. Reg. 516/06 `regulation/060516`、O. Reg. 9/18 `regulation/180009`（都是 200，现行合并版）。O. Reg. 43/24 `regulation/240043` 接口返回 404（未读到）。
- 联邦：`laws-lois.justice.gc.ca/eng/acts/R-7.36/FullText.html`（RPAA）、`…/P-8.6/page-7.html`（PIPEDA Schedule 1）；`fintrac-canafe.canada.ca/notices-avis/2022-07-21-eng`；Bank of Canada `bankofcanada.ca/2026/06/criteria-for-registering-payment-service-providers/`、`…/2024/10/registration-application-fee/`、`…/2023/12/case-scenarios-about-agents-and-mandataries/`、`…/2024/08/case-scenarios-about-e-commerce-web-building-tools-and-payment-gateways/`；OPC `priv.gc.ca/en/privacy-topics/collecting-personal-information/consent/gl_omc_201805/`。
- 其他：`ontario.ca/page/copyright-information`；`orea.com/standard-forms-clauses/Terms-of-Use`；`tribunalsontario.ca/ltb/forms/`（`tribunalsontario.ca/terms-of-use/` 404）；LTB 手册《Who Can be a Representative…》；`reco.on.ca/news/for-the-record-brokerage-leadership-edition-june2025`；OHRC 租房政策页；LTB 2026-09-21 运营更新。
- **读不到**：FINTRAC MSB 公开登记库（`www10.fintrac-canafe.gc.ca` DNS 解析失败、`fintrac-canafe.canada.ca/msb-esm/msb-search-recherche-eng` 404）；Bank of Canada PSP 登记库页面是脚本渲染、无内容；O. Reg. 43/24。

结论符号：✓ 一致 · △ 部分一致，需改措辞 · ✗ 不一致 · ? 读不到原文。

---

## 1. RTA（Residential Tenancies Act, 2006）

### 1.1 s.134(1)–(2) 费用禁令是否覆盖「替房东行事的任何人」（平台）
- **稿里的说法**：租客稿「租客侧永远不能收费（RTA s.134）」「向租客 / 申请人收任何费用（含「替房东代收」）」；A4 文件「(2) 把「以房东名义行事的任何人」（含物业经理、平台）兜住了」「连「替房东代收」也在 (2) 的射程内」；房东稿「s.134(2) 把「other person who acts on behalf of a landlord」也管进费用禁令」。
- **官方原文**：s.134(1)(a) "collect or require or attempt to collect or require from a tenant, prospective tenant or former tenant of the rental unit a fee, premium, commission…"；(1)(b) "pay any consideration for goods or services as a condition for granting the tenancy"；(2) "No superintendent, property manager or other person who acts on behalf of a landlord with respect to a rental unit shall, directly or indirectly…"（https://www.ontario.ca/laws/statute/06r17#BK185）。
- **结论**：△。(2) 的主语是「with respect to a rental unit 替房东行事的人」——平台替房东收申请费 / 筛查费 / 把核验成本转嫁给申请人，确在射程内；但 s.134 **没有**一条禁止一个独立平台就其自己的、与某套房源无关的服务向租客收费（例如租客自用的付费工具）。「租客永远免费」是产品决定与保守读法，不是 s.134 字面的强制。
- **改法**：租客稿第 5 行、A4 §1 及缺口表第 1 条把「租客侧永远不能收费（RTA s.134）」改为「凡与某套房源的申请 / 入住 / 续住相关、或替房东行事的收费，s.134(1)–(2) 一律禁止；Stayloop 据此定为租客侧全部免费（产品决定）」。

### 1.2 s.108 不得把预开支票 / 自动扣款设为条件
- **稿里的说法**：租客稿 Q4、A4 §2「不能要求预开支票或强制自动扣款（s.108）」；房东稿「PAD 永远是租客自愿的第二选项（s.108）」。
- **官方原文**：s.108 "Neither a landlord nor a tenancy agreement shall require a tenant or prospective tenant to, (a) provide post-dated cheques … or (b) permit automatic debiting…"（同上 #BK153）。
- **结论**：✓。注意主语是「房东或租约」——平台提供 PAD 选项本身不违法，违法的是把它做成租约或房东的要求。

### 1.3 s.105–106 押金
- **稿里的说法**：A4 §2「押金 ≤ 一个月或一个租期」「利息按当年指导比例每年计」「抵最后一月租金」；租客稿 M2「s.106(6) 每年按指导线付息、s.106(10) 抵最后一月」。
- **官方原文**：s.105(1) "The only security deposit that a landlord may collect is a rent deposit collected in accordance with section 106."；s.106(2) "not be more than the lesser of the amount of rent for one rent period and the amount of rent for one month"；s.106(6) "pay interest to the tenant annually … at a rate equal to the guideline determined under section 120"；s.106(9) 未付息 "the tenant may deduct the amount of the payment from a subsequent rent payment"；s.106(10) "apply a rent deposit … in payment of the rent for the last rent period before the tenancy terminates."
- **结论**：✓。补一点：s.106(9) 允许扣的是「随后任一期租金」，不限于最后一月（租客稿 M2 写「可从最后一月租金里扣」偏窄）。

### 1.4 s.47.0.1 / s.47.1 提前解约
- **稿里的说法**：租客稿 Q19「固定租约没到期能提前解约？ s.47.0.1、s.47.1（家暴 28 天）、s.95(4)、s.16」；Q3 把 s.47.0.1 用于「没给标准租约副本 → 60 天解约」。
- **官方原文**：s.47.0.1(1) "a tenant may terminate a tenancy … if, (a) the tenant has made a demand for a proposed tenancy agreement under subsection 12.1 (5)…"；(3) "at least 60 days before … on the last day of a rental period"；s.47.1(1) "if, (a) the tenant is deemed under subsection 47.3 (1) to have experienced violence…"；(3) "at least 28 days before the date the termination is specified to be effective."
- **结论**：△。s.47.1 28 天 ✓；但 s.47.0.1 **只在**房东未按 s.12.1(5) 的书面要求提供标准租约时才可用（Q3 的用法对，Q19 把它列为一般性的「提前解约」依据不准确）。
- **改法**：租客稿 Q19 与 A3③ M3 的「提前解约」条目把 s.47.0.1 注明「仅限未提供标准租约的情形」。

### 1.5 s.95–98 转让 / 转租
- **稿里的说法**：租客稿 Q12、M3「转租 / 转让（s.95–98）」「s.134(3)」。
- **官方原文**：s.95(1) "with the consent of the landlord, a tenant may assign a rental unit"；s.95(4)(b) 房东 "does not respond within seven days" 租客可按 s.96 发终止通知；s.97(2) "shall not arbitrarily or unreasonably withhold consent to the sublet"；s.98(1) 租客可向 Board 申请；s.134(3)(b) 租客及其代理人不得为转租 / 交出占有 "collect or require … any fee, premium, commission…"。
- **结论**：✓。可补：s.95(7) / s.97(3) 房东只能收「reasonable out-of-pocket expenses」。

### 1.6 s.5(i) 与房东同住共用厨卫的豁免
- **稿里的说法**：租客稿 Q13「合租 / 与房东同住保护一样吗？ s.5(i)、Code s.21(1)」；A4 §3「与房东同住共用厨卫（s.21(1)），那种情况 RTA 也不适用（RTA s.5(i)）」。
- **官方原文**：s.5(i) "living accommodation whose occupant or occupants are required to share a bathroom or kitchen facility with the owner, the owner's spouse, child or parent…" 且 "the owner, spouse, child or parent lives in the building"。
- **结论**：✓。注意豁免只及「与业主（或其配偶 / 子女 / 父母）共用」，租客之间合租不在 s.5(i)。

---

## 2. Law Society Act（R.S.O. 1990, c. L.8）

### 2.1 s.1(5)–(6)「selects, drafts, completes or revises」的范围
- **稿里的说法**：经纪稿 B4-4.1、房东稿 C3-②「《法律协会法》s.1(6) 2.i / 2.vii……是法律服务」（经纪稿注明原文来自 vLex 转载；房东稿注明「上线前要在 e-Laws 核对现行文本」）。
- **官方原文**（e-Laws 现行版，与 vLex 文本一致）：s.1(5) "a person provides legal services if the person engages in conduct that involves the application of legal principles and legal judgment"；s.1(6) "2. Selects, drafts, completes or revises, on behalf of a person, i. a document that affects a person's interests in or rights to or in real or personal property, … vi. a document that affects the legal interests, rights or responsibilities of a person … vii. a document for use in a proceeding before an adjudicative body."；"4. Negotiates the legal interests, rights or responsibilities of a person."
- **结论**：✓。两稿的引语与现行文本一致，e-Laws 已核对。另：罚则 s.26.2(1) "not more than $25,000 for a first offence; … $50,000 for each subsequent offence"——经纪稿写「今日未能复核」，现已复核 ✓。

### 2.2 s.1(8) 1 职业豁免：经纪替房东客户填安省标准租约、房东签
- **稿里的说法**：经纪稿「经纪在 TRESA 规管职业的常规范围内，s.1(8) 1；房东本人签署，s.1(8) 3……需律师确认，未见 LSO 明文」。
- **官方原文**：s.1(8) "the following persons shall be deemed not to be practising law or providing legal services: 1. A person who is acting in the normal course of carrying on a profession or occupation governed by another Act of the Legislature … that regulates specifically the activities of persons engaged in that profession or occupation."；RECO 2025-06：代表协议的服务 "could be services such as negotiating the terms of the lease, completing the standard Ontario lease agreement, showing the rental property, or screening tenants."（https://www.reco.on.ca/news/for-the-record-brokerage-leadership-edition-june2025）
- **结论**：✓。经纪是 TRESA 规管的注册人，RECO 自己把「completing the standard Ontario lease agreement」列为代表服务，「normal course」有监管机构的明文支持；经纪稿已写「需律师确认」，保留。

### 2.3 s.1(8) 3 本人豁免：平台在房东点「我要发 N4」后帮他算日期对字段
- **稿里的说法**：房东稿 C3-②「房东是「acting on his or her own behalf」，我们是文具，不替他选表、不判断该不该发」；API 稿 D1 把「N1 / N4 日期、指导比例」算术归第一档。
- **官方原文**：s.1(8) "3. An individual who is acting on his or her own behalf, whether in relation to a document, a proceeding or otherwise."；s.1(6) 2 "Selects, drafts, completes or revises, on behalf of a person…"；s.1(7) "1. Determining what documents to serve or file in relation to the proceeding, … determining when, where or how to serve or file a document."
- **结论**：△。1(8) 3 豁免的是**房东自己**的行为，不是平台的——它不能被引为「平台替房东 completes 文书」的豁免。平台的立足点只能是 s.1(5) 的门槛：确定性的日期算术与把房东自己录入的值排进字段，不涉「对该人情况施加法律判断」。另两处要留心：① s.1(7) 把「决定何时 / 如何送达」也算代理行为——「按送达方式算视为送达日」是算术，可以；「建议用哪种送达方式」不要做；② 填写稿若由系统**选表**（N4 还是 N5 / N8）即落入 2「Selects」。
- **改法**：房东稿 C3-② 把「房东是 acting on his or her own behalf，我们是文具」改为「房东本人填表受 s.1(8) 3 豁免；平台的边界是 s.1(5)——不对房东的情况施加法律判断：不选表、不建议送达方式、每个值来自房东输入或租约行（s.1(7) 1 把送达决定也算代理）」。API 稿 D1 第一档的「N4 最早终止日」端点同理，描述里写明只是日期算术。

### 2.4 AI 代经纪 / 代租客「谈条款」
- **稿里的说法**：经纪稿 B4-4.2 把「不可以 AI 代经纪与对方谈条款」的依据放在 TRESA s.1 / s.4；租客稿 A4 §5 把「以租客名义谈判法律权利」放在 LSA s.1(6) 4。
- **官方原文**：LSA s.1(6) "4. Negotiates the legal interests, rights or responsibilities of a person."；s.26.1(1) "no person, other than a licensee whose licence is not suspended, shall practise law in Ontario or provide legal services in Ontario."
- **结论**：✓（租客稿）/ △（经纪稿，见 §3.3）。Stayloop 不是持牌人，也不是 1(8) 1 所指的「受 TRESA 规管的职业人」，AI 替任一方谈租约条款首先撞的是 LSA s.1(6) 4，这条比 TRESA 更直接。

### 2.5 LTB 代理手册
- **稿里的说法**：A4 §5 引「A person who is not licensed will not be permitted to act as a representative in an LTB proceeding.」
- **官方原文**："A person who is not licensed and who is not exempt from licensing requirements is not permitted to act as a representative in an LTB proceeding."；不许的人包括 "a person who is not a party … but provides professional services to a party related to residential tenancy issues, such as a realtor involved in leasing a rental unit."（https://tribunalsontario.ca/documents/ltb/Brochures/Who%20Can%20be%20a%20Representative%20before%20the%20Landlord%20and%20Tenant%20Board.html）
- **结论**：△（引语措辞不同，结论一致）。**新发现**：手册点名「经纪即使参与了该房源的出租，也不得在 LTB 代理当事人」——经纪稿 B1 / 引导卡若涉及「经纪替房东客户跟进 LTB」须明写这一句。

---

## 3. TRESA 2002 + O. Reg. 567/05

### 3.1 s.1「trade」、s.4(2)、s.5(1)(j)
- **稿里的说法**：经纪稿 B4-4.2 引三条（原文来自 Wayback 镜像）；A4 §4(c) 引「trade」定义。
- **官方原文**（e-Laws 现行版，与镜像一致）：s.1(1) "'trade' includes … lease, rental or otherwise … and any act, advertisement, conduct or negotiation, directly or indirectly, in furtherance of any disposition, acquisition, transaction, offer or attempt"；s.4(1)(d) "trade in real estate unless registered under this Act"；s.4(2)(b) 未注册者不得 "perform any of the functions of a brokerage, broker or salesperson as provided in this Act"；s.5(1)(j) 豁免 "a person who trades in real estate solely for the purpose of arranging leases to which the Residential Tenancies Act, 2006 applies".
- **结论**：✓。引语准确。

### 3.2 s.30、O. Reg. 567/05 s.23.1、s.12.1
- **稿里的说法**：经纪稿 B4-4.3「订阅费不是 TRESA s.30 的 remuneration……也不是 567/05 s.23.1 的 financial benefit（那是经纪**收到**的利益）」；「s.12.1(1) 注册名、(3) 经纪公司名」。
- **官方原文**：TRESA s.30 "No brokerage shall, … (b) employ an unregistered person to perform a function for which registration is required; or (c) pay any remuneration to a person referred to in clause (a) or (b)"；567/05 s.23.1(1) "a direct or indirect financial benefit that the registrant or a person related to the registrant may receive from another person in connection with services provided by the registrant to a client"；s.12.1(1) "clearly and prominently disclose the name in which the registrant is registered in all the registrant's advertisements"；(3) "unless the advertisement clearly and prominently identifies the brokerage that employs the broker or salesperson"。
- **结论**：✓。另核实：567/05 s.13.4(1)（代表协议须写生效 / 到期日与报酬方式）、s.22(1)（多重代表须书面同意）、**s.17(1) "deposit the amount in the trust account … within five business days"**——A4 文件把「5 个工作日」标为「O. Reg. 43/24 未核实」，实际在 567/05 s.17(1)，已核实 ✓。

### 3.3 「平台只能做行政性传递、不能以 AI 代经纪谈条款」是否有原文支撑
- **稿里的说法**：经纪稿 B4-4.2 的依据 = TRESA s.1「trade」含 negotiation + s.4 未注册者不得 trade；同时自己指出「若靠 s.5(1)(j) 豁免，Stayloop 全部活动必须只涉 RTA 租约」。
- **官方原文**：见 3.1；s.5(1)(j) 的 "solely" 是字面要求。
- **结论**：△。逻辑有缺口：如果 Stayloop 只涉 RTA 租约，s.5(1)(j) 让它**整体免于注册**，TRESA s.4 就不再是「AI 不能谈条款」的依据；反过来若 Stayloop 不满足 "solely"（商业房源检索这类活动在），s.4 才适用——两种情况下都不宜把 s.4 当主依据。能站住的依据是：① **LSA s.1(6) 4**（见 §2.4，非持牌人不得代人谈判法律权利，与是否注册经纪无关）；② 经纪自己的义务——TRESA s.30(b) 经纪公司不得让未注册者执行须注册的职能、RECO 2025-06 把「negotiating the terms of the lease」列为须在代表协议里由**注册人**提供的服务。
- **改法**：经纪稿 B4-4.2「门槛」一行改为「LSA s.1(6) 4（主依据）；TRESA s.4 / s.30(b)（经纪一侧）；s.5(1)(j) 只决定 Stayloop 自己要不要注册，不决定 AI 能不能谈条款」；B6 待决第 4 条同步。RECO「未注册助理」公告仍未读到原文（本轮 reco.on.ca 对 curl 返回 301 后 h2 帧错误），保留「搜索摘要」标注。

---

## 4. 表单版权

### 4.1 OREA Form 400 / 410
- **稿里的说法**：经纪稿「for use by OREA members and certain licensees only」「may not be modified or amended in any manner」「软件平台 OREA requires written consent through the execution of a separate licence agreement」；结论「不给经纪做 Form 400；`trreb` 渲染器改名或取得许可」。
- **官方原文**："These OREA Standard Forms are for use by OREA members and certain licensees only. Any other use or reproduction is prohibited except with the prior written consent of OREA."；"the OREA Standard Forms may not be modified or amended in any manner"；"OREA requires written consent through the execution of a separate licence agreement should Member Boards or Members wish to make the OREA Standard Forms available in any software/technology platform that applies functionality to them"（https://orea.com/standard-forms-clauses/Terms-of-Use）。
- **结论**：✓。

### 4.2 ontario.ca 版权页（King's Printer）与 LTB 表格
- **稿里的说法**：房东稿 C3-②「非商业复制 the materials may be reproduced for non-commercial purposes 且 if no changes are made；商业用途 may only be reproduced for commercial purposes under a licence from the King's Printer；表格不在 legal materials 豁免里」。
- **官方原文**："If credit is given and Crown copyright is acknowledged, the materials may be reproduced for non-commercial purposes if no changes are made to the original content."；"The materials may only be reproduced for commercial purposes under a licence from the King's Printer, with the exception of Government of Ontario legal materials (statutes, regulations and judicial decisions)"（https://www.ontario.ca/page/copyright-information）。
- **结论**：✓。LTB 表格页脚 "© King's Printer for Ontario, 2024."（https://tribunalsontario.ca/ltb/forms/），且 `tribunalsontario.ca/terms-of-use/` 为 404——Tribunals Ontario **没有单独的使用条款**，适用的就是上面这页；表格页只有技术说明 "Do not complete the forms in your browser"。房东稿「Tribunals Ontario 表格页的使用条款」应改写为「表格页无单独条款，版权归 King's Printer，按 ontario.ca 版权页处理」。

### 4.3 安省标准租约
- **稿里的说法**：经纪稿「《标准租约》是政府表格，公开免费（ontario.ca/standardlease）」。
- **官方原文**：O. Reg. 9/18 s.3 "the prescribed form of tenancy agreement … is … the form in English entitled 'Residential Tenancy Agreement (Standard Form of Lease)', dated 2020/12 and available on the website of the Government of Ontario Central Forms Repository"。
- **结论**：△。「必须用、免费取」✓，但表格本身是 Crown copyright 的政府材料，不在「statutes, regulations and judicial decisions」豁免里；商业平台**复制 PDF 并加功能**按 4.2 的政策同样需要许可。Stayloop 现在是按条款结构自渲染 `ontario_standard`（不复制 PDF），风险在于「结构与文字逐项同序」是否算 reproduction——与 LTB 表格「填写稿」是同一个问题，建议一并问 King's Printer 或律师。
- **改法**：经纪稿 B4-4.1 把「公开免费」改为「法定必用、免费下载；但仍是 Crown copyright，自渲染版式沿用 C3-② 的做法，不复制官方 PDF」。

---

## 5. 代收租金：FINTRAC / RPAA / Stripe Connect

### 5.1 FINTRAC 2022-07-21 通知
- **稿里的说法**：房东稿 C3-①「把替人付账单列为汇款业务，原文点名 such as those pertaining to utilities, payroll and commission, mortgage and rent」「旧的商户收单豁免 PI-7670 已撤回」。
- **官方原文**："A person or entity is providing invoice payment services when they act as an intermediary between a payer and a payee to make payments to invoices, such as those pertaining to utilities, payroll and commission, mortgage and rent, or tuition."；"FINTRAC has retracted its position with respect to merchant servicing and payment processing (PI-7670)."；例外 "A person or entity that solely receives payments on behalf of the payee to settle a debt, and does not further transfer the payment instructions to the original payee."（https://fintrac-canafe.canada.ca/notices-avis/2022-07-21-eng）
- **结论**：✓。

### 5.2 RPAA「payment function」与登记
- **稿里的说法**：房东稿「the initiation of an electronic funds transfer at the request of an end user 与 transmission, reception or facilitation of an instruction 算作支付功能」「A payment function is likely not an incidental service or business activity if it directly generates revenues」「登记费 $2,500」；A4 §4(b)「holding of funds on behalf of an end user」。
- **官方原文**：RPAA s.2 "payment function means … (b) the holding of funds on behalf of an end user … (c) the initiation of an electronic funds transfer at the request of an end user; (d) the authorization of an electronic funds transfer or the transmission, reception or facilitation of an instruction"；"payment service provider means an individual or entity that performs payment functions as a service or business activity that is not incidental to another service or business activity."；Bank of Canada 指引 "A payment function is likely not an incidental service or business activity if it directly generates revenues or provides you with a direct commercial advantage"（https://www.bankofcanada.ca/2026/06/criteria-for-registering-payment-service-providers/）；"As of November 1, 2024, the registration application fee is $2,500."（https://www.bankofcanada.ca/2024/10/registration-application-fee/）
- **结论**：✓。

### 5.3 Stripe Connect 平台是否在代理豁免之外
- **稿里的说法**：房东稿「Stripe Connect 平台不在 RPAA s.10「已登记 PSP 的代理」名单上，未读到任何「Connect 平台免登记」的表态」「加拿大银行 PSP 登记（大概率）」；「FINTRAC 登记库里 Chexy、Rotessa、Plooto、Letus、VoPay、Stripe Payments Canada 全部已登记为 MSB」。
- **官方原文**：RPAA s.10 "This Act does not apply to an agent or mandatary of a registered payment service provider if the agent or mandatary is performing retail payment activities in the scope of their authority as agent or mandatary and is included on the list of agents or mandataries that was provided by the payment service provider"；Bank of Canada 案例 "The RPAA does not apply to an agent of a registered PSP if the agent performs retail payment activities only on behalf of the registered PSP."；支付网关案例 "while Company B does not handle funds from the end user directly, it still meets the definition of a PSP"；"By providing its own payment gateway option instead of redirecting to a third-party provider, Company A is now offering an additional service"。
- **结论**：△ / ?。s.10 的条文与央行解读 ✓；「不自己持资金也可能是 PSP」「嵌入自家收款选项而非跳转第三方 = 新增一项支付服务」两个案例**支持**房东稿的谨慎结论。但 (a) 「Connect 平台不在名单上」是对登记库的否定性陈述——央行 PSP 登记库与 FINTRAC MSB 登记库本轮都读不到（脚本页 / DNS 失败），Chexy 等六家「全部已登记」也无法复核，标 ?；(b) 「大概率」应改为「按央行指引的三个指标（直接产生收入 / 用户预期 / 对外宣传）逐项自评后再定；央行明说 does not take a one-size-fits-all approach」。
- **改法**：房东稿 C3-① 证据段把登记库那两句标「2026-04 读取，本轮未能复核」；门槛第 ② 条保留「律师或书面意见」。

---

## 6. 《消费者报告法》（R.S.O. 1990, c. C.33）

### 6.1 s.1 定义是否把「替租客查房东的评价报告」纳入
- **稿里的说法**：租客稿第 35 行「Openroom 的「查房东」评价报告（同样落在 CRA）」、A4 §6「租客侧工具更不能「替租客查房东」然后出具有评价性的报告——同样落在 CRA 里」、缺口表「「替租客查房东」的评价报告」。
- **官方原文**："'consumer' means a natural person but does not include a person engaging in a transaction, other than relating to employment, in the course of carrying on a business, trade or profession"；"'consumer report' means a written, oral or other communication by a consumer reporting agency of credit information or personal information, or both, pertaining to a consumer for consideration in connection with a purpose set out in clause 8 (1) (d)"；"'personal information' means information other than credit information about a consumer's character, reputation, … mode of living"；s.8(1)(d)(ii) "in connection with the entering into or renewal of a tenancy agreement"。
- **结论**：△。用途一项 ✓（(ii) 不分主体是房东还是租客）；但「consumer」限于**自然人且不是在经营业务的过程中交易**——公司房东不是 consumer，个人房东出租是否属「carrying on a business」是未决的法律定性。「同样落在 CRA」说过头了。
- **改法**：三处改为「对个人房东可能落入 CRA（取决于出租是否算经营业务，需律师意见）；对公司房东不适用。注册前一律不做」。结论不变，依据改为「可能」。

### 6.2 s.8(1)(b) 本人书面指示披露（API 稿第二档）
- **稿里的说法**：API 稿 D1 第二档「响应带 CRA s.8(1)(b)「消费者本人书面指示下的披露」边界句」；租客稿 A4 §8「CRA s.8(1)(b)：报告机构可依 the written instructions of the consumer 披露」。
- **官方原文**：s.8(1) "No consumer reporting agency and no officer or employee thereof shall knowingly furnish any information from the files of the consumer reporting agency except, … (b) in accordance with the written instructions of the consumer to whom the information relates;"
- **结论**：△。引语准确，但 s.8(1) 是对**消费者报告机构**的限制条款；引它作「依据」意味着 Stayloop 自认是报告机构（与 2026-10-12 的站内措辞决定一致，但注册未完成）。对未注册实体，s.8(1)(b) 本身不构成授权——真正的授权来源是 PIPEDA 4.3 的同意。
- **改法**：API 稿 D1 第二档与护照页边界句改为「按《消费者报告法》s.8(1)(b) 的标准处理：只在申请人本人书面指示下披露；同意的法律基础是 PIPEDA 原则 4.3」。

---

## 7. PIPEDA 原则 4.3 与 OPC「有意义的同意」指引（API 稿 D4-4）

- **稿里的说法**：API 稿 D4-4「OPC 同意指南要求强调 what personal information is collected / with which parties / purposes / risk of harm，对第三方披露要 be as specific as possible about recipients，敏感信息（财务）要明示同意」；建议的同意页列：客户端名、请求范围、数据会进入该 AI 应用及其模型服务商、可随时撤销、审计事件、护照勾选补接收方类别。
- **官方原文**：PIPEDA Schedule 1 4.3 "The knowledge and consent of the individual are required for the collection, use, or disclosure of personal information, except where inappropriate."；4.3.3 "shall not, as a condition of the supply of a product or service, require an individual to consent to the collection, use, or disclosure of information beyond that required"；4.3.4 "some information (for example, medical records and income records) is almost always considered to be sensitive"（https://laws-lois.justice.gc.ca/eng/acts/P-8.6/page-7.html）。OPC 指引四要素：What personal information is being collected / With which parties personal information is being shared / For what purposes / Risk of harm and other consequences；"Organizations should be as specific as possible in enumerating these third parties. In the case where third parties may change periodically … specify the types of third parties"；"individuals must be notified" 当 "a meaningful risk that such residual risk will materialize and will be significant"；"Organizations must generally obtain express consent when" 信息敏感（"health or financial"）或超出合理预期（https://www.priv.gc.ca/en/privacy-topics/collecting-personal-information/consent/gl_omc_201805/）。
- **结论**：△。四要素里 D4-4 覆盖了「什么信息」（范围）与「给谁」（客户端名 + 模型服务商），缺两项：① **每个范围对应的用途**（purposes，须「explicitly specified」）；② **风险提示**——接入方 AI 与其模型服务商可能在境外、可能留存会话、Stayloop 无法撤回已送出的内容，这是 OPC 要求明示的「residual risk」。另「勾选 + 文本版本」满足明示同意 ✓；4.3.3「不得捆绑」要在页面上体现为「拒绝不影响站内功能」。
- **改法**：API 稿 D4-4 建议列表补「每个范围一句用途」「风险句（境外 / 留存 / 不可撤回）」「拒绝不影响站内使用」三项。

---

## 顺带核实的其他引语

| 稿 / 位置 | 说法 | 原文 | 结论 |
|---|---|---|---|
| A4 §3 | OHRC「It is illegal … 30% cut-off rule」「A lack of rental or credit history should not be viewed negatively」「Regulation 290/98 … permits no other inquiries」 | 三句逐字在 https://www.ohrc.on.ca/en/policy-human-rights-and-rental-housing | ✓ |
| 房东稿 C3-② | LTB 2026-09-21「shortened from 14 to 7 days」「no longer be accepted as of November 30, 2026」 | 逐字在运营更新页 | ✓ |
| 经纪稿 B1-1.7 | 567/05「17. Deposit within five business days」 | s.17(1) "within five business days" | ✓（A4 文件的「未核实」可撤） |
| 经纪稿 B4-4.3 | TRESA s.37 针对注册人 | "No registrant shall make false, misleading or deceptive statements in any advertisement" | ✓ |
| 经纪稿 B4-4.3 | TRESA s.31(1) 只能代表所属经纪公司 | "No broker or salesperson shall trade in real estate on behalf of any brokerage other than the brokerage which employs" | ✓ |
| A4 §6 | CRA s.3 注册 | "No person shall conduct or act as a consumer reporting agency … unless registered by the Registrar" | ✓ |

---

## 必须改措辞的结论（清单）

1. **租客稿** 第 5 行「硬约束」、A4 §1「对 Stayloop 的含义」、缺口表第 1 条：「租客侧永远不能收费（RTA s.134）」→ s.134 禁的是与房源相关 / 替房东行事的收费；全免费是产品决定。（§1.1）
2. **租客稿** A3② 20 问表 Q19、A3③ M3：s.47.0.1 注明「仅限房东未按书面要求提供标准租约的情形」。（§1.4）
3. **租客稿** A3③ M2：s.106(9) 可从「随后任一期租金」扣，不限最后一月。（§1.3）
4. **租客稿** 第 35 行、A4 §6 末句、缺口表「不做 / 不在本线」：「替租客查房东……同样落在 CRA」→「对个人房东可能落入（需律师意见），公司房东不适用」。（§6.1）
5. **租客稿** `tenant/legal-boundaries-a4.md` §4(c) 与文末缺口：「5 个工作日存入信托 · 未核实（O. Reg. 43/24）」→ 已核实，出处 O. Reg. 567/05 s.17(1)。（§3.2）
6. **租客稿** A4 §5：LTB 手册引语改为原句 "is not permitted to act as a representative in an LTB proceeding"。（§2.5）
7. **经纪稿** B4-4.2「门槛」与 B6 待决第 4 条：「不能以 AI 代经纪谈条款」主依据改为 LSA s.1(6) 4；TRESA s.4 / s.30(b) 为经纪一侧的辅助依据；s.5(1)(j) 只决定 Stayloop 自身是否须注册。（§3.3）
8. **经纪稿** B4-4.1：「《标准租约》是政府表格，公开免费」→ 法定必用、免费下载，但仍是 Crown copyright，不复制官方 PDF。（§4.3）
9. **经纪稿** B4-4.1：罚则「今日未能复核」→ 已复核 s.26.2(1) $25,000 / $50,000。（§2.1）
10. **经纪稿** B1（若有「经纪替房东跟进 LTB」之类表述）：补 LTB 手册明文——参与出租的经纪不得在 LTB 代理当事人。（§2.5）
11. **房东稿** C3-②「法规」段：「房东是 acting on his or her own behalf，我们是文具」→ 1(8) 3 豁免房东本人；平台的边界是 s.1(5)（不施加法律判断：不选表、不建议送达方式），并注意 s.1(7) 1 把送达决定算作代理。（§2.3）
12. **房东稿** C3-②「门槛 · 版权」：「Tribunals Ontario 表格页的使用条款」→ 无单独条款，页脚 Crown copyright，按 ontario.ca 版权页处理。（§4.2）
13. **房东稿** C3-① 证据段：FINTRAC / 央行登记库的六家「全部已登记」与「Connect 平台不在名单上」标「本轮未能复核（登记库不可读）」；「大概率」改为按央行三指标自评 + 书面意见。（§5.3）
14. **API 稿** D1 第二档「passport/verify」：s.8(1)(b) 由「依据」改为「按其标准处理」，同意的法律基础写 PIPEDA 4.3。（§6.2）
15. **API 稿** D4-4 同意页要素：补「每个范围的用途」「境外 / 留存 / 不可撤回的风险句」「拒绝不影响站内使用（4.3.3）」。（§7）
16. **API 稿** D1 第一档「n4_earliest_termination」等算术端点：描述里写明只做日期算术、不选表、不建议是否发出。（§2.3）
