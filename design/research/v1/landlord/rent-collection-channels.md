# 在线收租通道调研（V1.0 · 房东线）

日期：2026-10-13 · 调研员：Claude（只做网页调研，未碰代码与数据库）
前提：Stayloop 现行决定是「不经手资金」；本稿给出做 / 不做的依据。
每条事实附来源 URL 与 ≤15 词英文原文；读不到的写「未读到」。货币除注明外为加元。

---

## 一、通道逐个

### A. Stripe · 加拿大预授权借记（PAD，`acss_debit`）

**费用**（Stripe 加拿大定价页）
- PAD：`1% + CA$0.40`，封顶 `CA$5.00`；即时银行验证 `+ CA$1.00`；失败与争议 `+ CA$5.00`。
  原文："1% + CA$0.40" / "CA$5.00 cap" / "+ CA$5.00" for failures and disputes
  来源：https://stripe.com/en-ca/pricing
- 对照：卡 `2.9% + CA$0.30`（原文 "2.9% + CA$0.30"）；卡争议费 "Dispute received fee CA$15.00"。同一页。
- 换算：$2,000 月租 → PAD 封顶 $5.00/笔；卡 $58.30/笔。

**到账与争议**（Stripe PAD 文档）
- 结算：T+4 成功、T+5 可用，截止 17:00 美东。原文："Standard Settlement | T+4 at 21:00 UTC | T+5 at 00:00 UTC"
- 最终确认最长 5 个工作日：原文 "Final confirmation can take up to 5 business days"
- 争议：个人账户 90 个日历日内、不问理由、不能申辩、不能赢。原文："Personal-account disputes can be filed up to 90 calendar days after the debit" / "You can't win a PAD dispute."
- 争议发生时 Stripe 直接从余额扣款：原文 "Stripe deducts the dispute amount and the applicable dispute fee from your Stripe balance."
- 失败：即使已入余额也会被收回。原文 "Stripe immediately removes the funds from your Stripe account."
- 授权（mandate）须按 Payments Canada Rule H1 收集，Stripe 托管页可代收；可 `interval`（如「每月 5 号」）或 `sporadic`。
- 产品限制：Checkout 订阅模式暂不支持 PAD（原文 "Checkout subscription mode doesn't support PADs"）；Billing/Invoicing 支持。
  来源：https://docs.stripe.com/payments/acss-debit

**谁能用 / 是否要 Connect**
- 账户类型 "✓ Merchant, ✓ Platform or marketplace (Connect)"；业务所在地 CA/US；付款人必须是加拿大银行账户。
- 若 Stayloop 是平台、房东是收款方 → 必须用 Connect：原文 "you must enable PADs on your platform and request the `acss_debit_payments` capability for your connected accounts."
- 用 `on_behalf_of` 时每个房东要各自收一份授权："You must collect a mandate for each connected account … because the connected account is the merchant of record"
  来源：同上

**Connect 三种扣款方式与责任**（Stripe Connect 文档）
- 直接扣款（direct charges）：钱进房东账户，退款与争议从房东余额扣。原文 "Refunds and chargebacks reduce the connected account's balance."
- 目的地扣款 / 分离扣款（destination / separate charges and transfers）：钱先进平台余额，退款与争议从平台余额扣。原文 "Refunds and chargebacks reduce your platform's balance."
- 旧式 Express/Custom："your platform is responsible for disputes and fraud."
  来源：https://docs.stripe.com/connect/charges
- Express 账户前提："Because your platform is responsible for losses incurred by Express connected accounts, you must closely examine all accounts"
  来源：https://docs.stripe.com/connect/express-accounts
- Stripe 对新平台的建议：让 Stripe 承担负余额。原文 "We advise that new platforms have Stripe take responsibility for negative balances on connected accounts."
  来源：https://docs.stripe.com/connect/risk-management/best-practices

**Connect 平台费用**（Stripe Connect 加拿大定价页）
- 由 Stripe 定价并向房东收手续费："No fees for your platform"（无账户费、无出款费）。
- 由平台自定价："CA$2 per monthly active account" + "0.25% + CA$0.25 per payout sent"；即时出款 1%。
  来源：https://stripe.com/en-ca/connect/pricing
- 未读到：在「Stripe 定价」模式下能否再叠加 `application_fee`；需在 Stripe 后台 platform profile 里确认。

**监管身份**：Stripe Payments Canada, Ltd. 在 FINTRAC 登记为 MSB（服务类型 "Foreign Exchange, Money Transferring, PSP"，状态 "Registered"，编号 M22204455）。
来源：FINTRAC 登记库数据集 https://fintrac-canafe.canada.ca/msb-esm/reg-eng.xlsx（2026-04 版）。加拿大银行 PSP 登记库页面为动态加载，未读到。

**PCI**：用 Checkout / Elements 卡数据不经我们服务器，PCI 义务缩小。原文 "securely collect and transmit payment information directly to Stripe without it passing through your servers, reducing your PCI obligations"；Stripe 本身 "PCI Level 1 Service Provider"。PAD 不涉及卡号，但银行账号同样走 Stripe 托管收集。
来源：https://docs.stripe.com/security/guide

---

### B. Interac e-Transfer · Request Money / 商业接口

**个人房东**：可直接用——通过自己银行的网银发「Request Money」，租客在自己银行点付即可，不需要任何平台。限制："Service is only available for Canadian-dollar accounts held in Canada with participating financial institutions."（TD 小企业页）。
来源：https://www.td.com/ca/en/business-banking/small-business/payment-options/receiving/online-payment

**平台集成只能经参与机构**：Interac 商业页写明接入途径是银行。原文 "Talk to the financial institution where you do your business banking for details on how to get started."；单笔上限 "Send up to $25,000 per transaction"；费用 "are set by financial institutions"。
来源：https://www.interac.ca/en/business/payments/interac-e-transfer/
- 第三方聚合商（如 VoPay，FINTRAC 登记 M23228074）提供 Request Money API：原文 "triggers an Interac email to the payor"，"the funds are available in real-time"，建议单笔 "less than $3,000"。定价页只写 "CONTACT SALES"。
  来源：https://docs.vopay.com/docs/interac-money-request · https://vopay.com/pricing/

**批发费（Interac 向银行收，不向终端客户收）**
- 原文 "wholesale fees paid by financial institutions" / "Interac does not charge Interac e-Transfer fees directly to end customers."
- Business Request Money：按额 35 bps、封顶 $3.50；或固定 $0.35/笔；"one-time onboarding fee of $2,000.00 per non-retail customer"。
- 直连机构："$50,000 for a direct connection" 一次性 + "$20,000 per direct connection" 每月——这是银行级门槛，平台不可能自己接。
  来源：https://www.interac.ca/en/?p=163358
- 银行零售价（二手，搜索摘要）：CIBC 请求到账 $1.50、Laurentian $1。未读官方页。

**结论**：Interac 没有争议/退单机制（Interac 商业页称 "funds are guaranteed with no chargebacks"），但也没有授权扣款——每期都要租客主动点付；平台若要自动对账，只能经 VoPay 一类聚合商（自身是 MSB），费用未读到。

---

### C. 第三方代收

#### Rotessa（PAD 代收，Steinbach MB）
- 费用：`$25/月 + $0.50/笔` 基础；按量 1–10 笔 $17/月、11–50 $39、51–100 $65、101–250 $94，251–1000 笔 $0.35/笔；NSF/止付 "$30 for each NSF, stopped payment, or agreement terms not met"；在线银行验证 "$2"；"No set up fees, minimum fees or cancellation fees"。
  来源：https://rotessa.com/pricing/
- 到账："PADs can take between one and four business days to settle in the payee's account after the process date."
  来源：https://rotessa.com/faq/
- 方式：只有 PAD（"PAD forms can only be used for debiting payments through the EFT network"），不支持信用卡。
- 面向谁：面向企业；物业管理是列出行业之一，FAQ 举例 "Landlords for rent"；个人房东能否开户页面未明说。
- 集成："Connect your platform to Rotessa through our robust and secure API."；有 "Platforms" 页与 QuickBooks/Xero/Zapier。合作分成等未读到。
  来源：https://rotessa.com/industries/property-management/ · https://rotessa.com/platforms/
- 监管：FINTRAC 登记 "PSP"，Registered，M22477352。

#### Plooto（多伦多）
- 官网定价页返回 403，未读到原文。搜索摘要（第三方）：Go $9/月（5 笔）、Grow $32/月起（不限笔）、Pro $99/月；"Accept payments with Pre-Authorized Debits (PAD) and credit card"。
- 卡费（Plooto 旧博客，经搜索摘要）："The fee is 2.9% + $0.30 per completed receivable"；单笔上限曾为 $10,000。PAD 单笔费未读到。
  来源：https://plooto.com/pricing（403）· https://plooto.com/blog/how-to-use-credit-cards-for-accounts-receivables（403）
- 面向中小企业与会计师事务所，不是租房专用。监管：FINTRAC "Money Transferring, PSP"，Registered，M22479311。

#### RentMoola → Letus（PaySlate Inc.，温哥华）
- rentmoola.com 已 301 到 let.us；面向物业管理公司："Letus gives property managers the tools you need"。租客需由物业经理邀请："Your property manager can invite you … set up your account"；支付方式 "using either your bank account or rewards credit card"。
  来源：https://let.us/ · https://let.us/tenants
- 费用：官网未列。第三方（Ivey 2018 档案）称卡费 1.99%–3.99%、借记卡 $1.99；未读到现行官方数字。
- PAD 退款 "can only be processed once a month on the 11th business day"（FAQ，第三方转载）。
- 个人房东：页面只写 property managers；未读到个人房东入口。API/合作计划未读到。
- 监管：FINTRAC "Money Transferring"，Registered，C100000501（2025-03 首次登记）。

#### Payquad（物业管理 SaaS）
- 定价：Vital "Minimum of $200 per month"，ProMost "Minimum of $250 a month"，Enterprise 自定；"Custom API connections" 只在 Enterprise。
- 支付方式与到账：页面只写 "Instant online payments"，未读到 PAD / 卡 / e-Transfer 的明细与费率。
- 面向物业管理公司，个人房东未提及。FINTRAC 登记库未检索到 Payquad。
  来源：https://www.payquad.com/pricing · https://www.payquad.com/

#### Chexy（多伦多，租客端付费）
- 模式：租客用信用卡付，Chexy 转给房东。原文 "We charge your credit card 4 business days before your payment is due, then send it on your behalf"；房东收款方式 "Interac e-Transfer, Bill Pay or Pre-Authorized Debit (PAD)"。
- 费用：加拿大卡 1.75%、国际卡 2.5%（租客付）；PAD 方式 "pay your rent with no additional fees"（另有第三方称借记卡 $1/月）。
- 房东不用开户："Recipients do not need to sign up for Chexy, create an account, or change anything"；房东端 "rent day" 收到。
- PAD 路径：Chexy 给租客造一组银行账号给房东扣："we create bank account details for you to share with your landlord"；资金先放 "Chexy Wallet (or Demand Deposit Account)"。
  来源：https://www.chexy.co/ · https://chexy.co/insider/how-to-collect-online-rent-payments-from-tenants · https://chexy.co/insider/pad-with-chexy · https://intercom.help/chexy/en/articles/16112521-what-is-chexy-a-guide-you-can-share-with-your-recipient
- 无 API / 合作计划（未读到）。监管：FINTRAC "Money Transferring, PSP"，Registered，M22550331（2022-12 首次登记）。

#### 速览

| 通道 | 房东成本（$2,000 租） | 到账 | 方式 | 个人房东 | 集成 |
|---|---|---|---|---|---|
| Stripe PAD（Connect） | $5.00 封顶/笔 | T+5 可用 | PAD（卡另算） | 经 Connect 开户 | 完整 API |
| Interac Request Money（自家银行） | 约 $0–1.50/笔（银行定） | 即时 | 租客主动点付 | 直接可用 | 平台不能直连 |
| Interac 经 VoPay | 未读到 | 即时 | Request Money / EFT | 经平台 | API |
| Rotessa | $17–94/月 或 $0.35–0.50/笔 + NSF $30 | 1–4 工作日 | 只 PAD | 页面未明说 | API |
| Plooto | $9–99/月 + 卡 2.9%+$0.30（PAD 未读到） | 未读到 | PAD + 卡 | 是（小企业） | 有 |
| Letus | 未读到（租客付服务费） | 未读到 | 银行账户 + 卡 | 只物业管理 | 未读到 |
| Payquad | ≥$200/月 | 未读到 | 未读到 | 否 | Enterprise |
| Chexy | 房东 $0；租客 1.75% | rent day | e-Transfer / PAD / Bill Pay | 房东无需开户 | 无 |

---

## 二、合规逐条

### ① FINTRAC · MSB 登记（PCMLTFA）

- 法条 5(h)(ii)：MSB 包括 "remitting funds or transmitting funds by any means or through any person, entity or electronic funds transfer network"。
  来源：https://laws-lois.justice.gc.ca/eng/acts/P-24.501/section-5.html
- FINTRAC 2022-07-21 通知把「代付账单」明确纳入——租金在列：
  "they act as an intermediary between a payer and a payee to make payments to invoices" / "such as those pertaining to utilities, payroll and commission, mortgage and rent, or tuition."
  唯一例外："solely receives payments on behalf of the payee to settle a debt" 且 "does not further transfer the payment instructions to the original payee."
  FINTRAC 立场："are engaged in the business of remitting or transmitting funds, or dealing in virtual currency."
  来源：https://fintrac-canafe.canada.ca/notices-avis/2022-07-21-eng
- 2022-04-27 起旧的「商户收单豁免」PI-7670 已撤回（Osler 摘要："retracting its positions with respect to merchant servicing and payment processing (PI-7670)"）。
  来源：https://www.osler.com/en/insights/updates/fintrac-retracts-merchant-servicing-and-payment-processing-exemptions/
- 代理豁免：只作已登记 MSB 的代理（agent/mandatary）不必自己登记，由主体登记。
  来源：https://fintrac-canafe.canada.ca/msb-esm/msb-eng
- 行业实况（FINTRAC 登记库 2026-04 版）：Chexy、Rotessa、Plooto、Letus、VoPay、Stripe Payments Canada 全部已登记。**做租金代付的同行没有一家是以「不是 MSB」立足的。**
- 登记不等于牌照："Registration with FINTRAC does not indicate that FINTRAC endorses or licenses the business."
  来源：https://fintrac-canafe.canada.ca/msb-esm/reg-eng

**对 Stayloop 的读法**：只要 Stayloop「接收付款指令、作为租客与房东之间的中介、房东经协议从我们这里拿到款」，就落在通知所述情形里。Stripe Connect 直接扣款（钱从租客到房东的 Stripe 账户、不进我们账户）能缩小「持有资金」这一面，但「转达付款指令」仍是我们在做；是否足以主张「仅作 Stripe 的代理」未读到任何 FINTRAC 对 Stripe Connect 平台的表态——要么向 FINTRAC 申请政策解释（其政策解释库 https://fintrac-canafe.canada.ca/guidance-directives/overview-apercu/pi/pi-eng），要么按同行做法登记。

### ② 《零售支付活动法》（RPAA，加拿大银行）

- 「支付功能」五项（s.2）：(a) "the provision or maintenance of an account"；(b) "the holding of funds on behalf of an end user"；(c) "the initiation of an electronic funds transfer at the request of an end user"；(d) "the authorization of an electronic funds transfer or the transmission, reception or facilitation of an instruction"；(e) "the provision of clearing or settlement services"。
- PSP 定义："performs payment functions as a service or business activity that is not incidental to another service or business activity."
  来源：https://laws-lois.justice.gc.ca/eng/acts/R-7.36/section-2.html
- 排除（ss.6–10）：仅限商户自用的封闭工具、ATM 取现、指定系统、关联公司内部转账、银行等受监管机构、以及 **已登记 PSP 的代理（s.10，须列在该 PSP 的代理名单上）**。
  来源：https://laws-lois.justice.gc.ca/eng/acts/R-7.36/page-1.html
- 「附带」判断（加拿大银行指引）："A payment function is likely not an incidental service or business activity if it directly generates revenues"；"If an end user can reasonably expect or understand to be receiving payment services"；"Marketing or advertising the payment functions you perform can indicate" 非附带。
  来源：https://www.bankofcanada.ca/core-functions/retail-payments-supervision/retail-payments-supervision-supervisory-policies-and-guidelines/criteria-for-registering-payment-service-providers/
- 四项登记条件 + 义务："PSPs that hold end-user funds must have measures to safeguard these funds"；风险框架与保障要求 "came into force on September 8, 2025"；年度报告 "no later than March 31"。
  来源：https://www.bankofcanada.ca/core-functions/retail-payments-supervision/supervisory-framework-supervision/
- 登记费："As of November 1, 2024, the registration application fee is $2,500."，每年按 CPI 上调，另有年度评估费（金额未读到）。
  来源：https://www.bankofcanada.ca/2024/10/registration-application-fee/

**对 Stayloop 的读法**：即使不持有资金，只要我们「替租客发起 EFT」或「转达付款指令」（功能 c/d）且这件事带来收入、被当作功能宣传，按指引就不是「附带」。Stripe Connect 平台不是 Stripe 在 s.10 意义上的「代理」（Stripe 不会把我们列进它的代理名单——未读到任何反例）。所以：**真正收租 = 大概率要向加拿大银行登记为 PSP**（$2,500 + 年费 + 风险框架 + 年报）。「只做提醒与对账、不发起任何转账」则一项支付功能都不碰。

### ③ 只用 Stripe Connect、资金不经我们账户时的义务

- 资金面：直接扣款下钱在房东的 Stripe 账户，退款与争议扣房东（见 A）。Stripe 是 MSB/PSP 持牌方。
- 平台面仍要：开通 PAD 能力并为每个房东单独收授权；KYC 由 Stripe 托管 onboarding 做，但 Express/旧式账户下 "your platform is responsible for losses"；新平台应选 Stripe 承担负余额。
- 监管面：FINTRAC 与 RPAA 看的是「谁在中介付款指令、谁有收入」，不只看「钱在谁账上」——见 ①②。未读到 Stripe 或监管机构说「Connect 平台免登记」。
- 若收 Stayloop 平台费：进入 Connect「你自定价」档（$2/活跃账户/月 + 0.25%+$0.25/出款），并且这笔收入正是 RPAA 指引里「直接产生收入」的证据。

### ④ 安省《住宅租赁法》s.108 与 s.134（e-Laws 现行合并本，2026-09-21）

- **s.108**："Neither a landlord nor a tenancy agreement shall require a tenant or prospective tenant to, (a) provide post-dated cheques or other negotiable instruments for payment of rent; or (b) permit automatic debiting of the tenant's or prospective tenant's account at a financial institution, automatic charging of a credit card or any other form of automatic payment for the payment of rent."
- **s.134(1)**："no landlord shall, directly or indirectly, … (a) collect or require or attempt to collect or require from a tenant, prospective tenant or former tenant of the rental unit a fee, premium, commission, bonus, penalty, key deposit or other like amount of money whether or not the money is refundable; (b) require or attempt to require a tenant or prospective tenant to pay any consideration for goods or services as a condition for granting the tenancy or continuing to permit occupancy"
- **s.134(2)**："No superintendent, property manager or other person who acts on behalf of a landlord … shall, directly or indirectly, with or without the authority of the landlord, do any of the things prohibited under clause (1)"
- 顺带 s.111(2)：按时付租折扣 "up to 2 per cent of the rent" 不影响合法租金——合法的正向激励。
  来源：https://www.ontario.ca/laws/statute/06r17（内容经 e-Laws 公开接口 `/laws/api/v2/legislation/en/act-content/statute/06r17` 读取）

**产品含义**：① PAD 只能是租客自愿选项，租约与申请流程不得把它设为条件，必须同时保留别的付款方式；② 任何处理费不能转嫁给租客——Chexy 模式（租客自己选用、费用付给 Chexy）是租客与第三方的关系，但 s.134(2) 把「代房东行事的人」也管进去，Stayloop 若替房东收款再向租客收费，风险直指这一条；③ 租客自愿签的 PAD 按 Rule H1 随时可撤（见 ⑤），不能当成「保证到账」。

### ⑤ Payments Canada Rule H1（PAD 规则，42 页）

- s.16：首笔前至少 10 个日历日给确认书（可由付款人书面放弃）："at least 10 calendar days before the due date of the first PAD, provide or make available to the Payor, a Confirmation"
- s.17：金额或日期变动、变动额 PAD 每期前 10 个日历日预通知。
- s.24：个人 PAD 争议期 "up to and including 90 calendar days after the date on which the disputed Personal PAD … was debited"；企业 PAD 10 个工作日；超期 "must be addressed by the Payor and the Payee outside of the rules"。
- s.30：付款人撤销后 "within not more than 30 calendar days from the notice, cease to issue any new PADs"。
  来源：https://www.payments.ca/sites/default/files/h1eng.pdf

---

## 三、平台承担的责任与风险（E）

| 风险 | 事实 | 落在谁身上 |
|---|---|---|
| NSF / 失败 | PAD 可在成功后仍失败，Stripe 立即收回；失败费 +$5；Rotessa NSF $30 | 直接扣款→房东；目的地扣款→Stayloop 平台余额 |
| 租客争议 | 90 天内不问理由、不能申辩、不能赢（Stripe 文档） | 同上；房东已出款时形成负余额，Stripe 可自动借记房东银行账户（`debit_negative_balances`） |
| 到账前责任 | T+5 才可用；期间状态是 processing，不是 paid | 产品必须显示「处理中」，不能写「已付」（与现有 rent_payments「标记已付」语义冲突） |
| 房东欺诈 / 负余额 | Express："platform is responsible for losses"；新平台应让 Stripe 承担 | 选错账户类型就是 Stayloop |
| 退款双重入账 | 退款 + 银行争议可造成租客双重收款 | 平台操作规范 |
| PCI | 卡与银行信息经 Stripe 托管页，不过我们服务器 | 小范围，仍须年度自评 |
| 反洗钱 | 一旦是 MSB：KYC、记录、可疑交易报告、两年续期 | Stayloop |
| RPAA | 风险框架、资金保障、年报、$2,500 + 年费 | Stayloop |
| 信用卡 | 2.9%+$0.30，卡争议可申辩但费 $15 | 费用不能转嫁租客（s.134） |

---

## 四、三选项利弊表

| | **做：Stayloop 代收（Stripe Connect PAD）** | **不做：维持现状** | **只做提醒与对账（推荐）** |
|---|---|---|---|
| 成本 | Stripe PAD ≤$5/笔由房东付；若 Stayloop 收平台费，再付 $2/活跃房东/月 + 0.25%+$0.25/出款；RPAA $2,500 + 年费；AML 合规程序与律师意见 | 0 | 0（e-Transfer 由房东自家银行收，$0–1.50） |
| 合规门槛 | FINTRAC MSB 登记（同行全部已登记）+ 加拿大银行 PSP 登记（大概率）+ 消费者报告法注册在途——三个监管同时压在一家刚注册的公司上 | 无 | 无：不发起、不转达、不持有；只记录与提醒 |
| 开发量 | **L**：Connect onboarding、每房东 PAD 授权、T+5 状态机、争议与负余额处理、与 rent_payments 对账、退款、通知邮件（H1 要求）、后台风控 | — | **S/M**：到期提醒已有；加「租客上传 e-Transfer 回执 / 房东确认」+ 银行流水 CSV 对账 + 逾期 / 持续迟付标记（已有 `persistentLatePayment`） |
| 对房东价值 | 自动扣款、按期到账、少追租；但 s.108 下租客可拒、可随时撤 PAD，90 天内可无理由退回，「保证到账」不成立 | 现状：自述「标记已付」，无凭证 | 有凭证的记录（回执 + 对账）、逾期即提醒、N4 / 持续迟付规则自动算；不承诺到账 |
| 风险 | 负余额与争议责任、AML/PSP 处罚、s.134 费用转嫁争议、资金事故毁信任 | 无 | 极低：记录可被双方质疑，但不经手一分钱 |

---

## 五、结论与门槛

1. **现在不做代收。** 原因不是技术——Stripe PAD 很成熟，$5 封顶也便宜——而是监管叠加：FINTRAC 2022-07 通知把「替人付租金」点名为汇款业务，RPAA 把「发起 / 转达 EFT 指令」算作支付功能，同行（Chexy、Letus、Rotessa、Plooto）全部登记为 MSB。Stayloop 同时还在准备消费者报告机构注册，再加一张 MSB 与一张 PSP 登记，对一家刚注册的公司是三条合规线并行。
2. **先做「提醒与对账」**（S/M 开发量）：租客上传 e-Transfer 回执或房东确认 → 账期从「自述」变「有凭证」；银行流水 CSV 对账；逾期提醒与持续迟付标记已有规则可直接用。这一步零监管成本，又把「不经手资金」的既定决定守住了。
3. **想把租金记录做成有第三方佐证的护照，可以接 Chexy 式的「租客自选第三方」**：租客自己用 Chexy / 自家银行 PAD 给房东，Stayloop 只读回执。注意 s.134(2)——Stayloop 不得向租客收任何费、也不得把它设成条件。
4. **什么时候再评估「做」**：满足全部四条——① 已完成消费者报告机构注册并稳定运营；② 律师就 Stripe Connect 平台的 FINTRAC / RPAA 适用性给出书面意见，或拿到 FINTRAC 政策解释；③ 在管租约 ≥ 200 份、房东明确要求自动扣款（现在 rent_payments 全部来自自述记录）；④ 能承受 RPAA $2,500 + 年费 + 风险框架与 AML 程序的固定成本。到那时的首选方案：Stripe Connect **直接扣款 + Stripe 定价 + Stripe 承担负余额 + 只做 PAD 不做卡**，Stayloop 不收平台费（避免「直接产生收入」），PAD 永远是租客自愿的第二选项。
5. **未读到、需人工核实的**：Plooto 与 Letus 的现行费率（官网 403 / 未列）；Payquad 支付方式；VoPay 费用；Stripe「Stripe 定价」模式下能否收 application_fee；加拿大银行 PSP 登记库里有没有 Stripe / Chexy / Rotessa（页面动态加载）；Interac 各银行零售价（只有搜索摘要）。
