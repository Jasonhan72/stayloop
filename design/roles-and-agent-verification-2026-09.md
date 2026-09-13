# 三角色权限与经纪认证：法规研究与方案（2026-09-13）

目的：租客、房东可以自认；经纪必须认证并有标记；三个角色的功能与权限要清晰。先查监管方与政府的
一手来源（RECO、TRESA 及其条例、TRREB、CREA、OREA、RTA、OHRC、《消费者报告法》、PIPEDA、
IPC/OHRC AI 原则、《电子商务法》、《法律协会法》），再对照我们现在的代码与文案，给出方案。
每条法规结论都附来源链接；标「待律师确认」的是文本读起来指向某个结论、但没有监管方明文的部分。

---

## 0. 先看结论（需要你拍板的 6 件事）

| # | 问题 | 研究结论 | 建议 |
|---|---|---|---|
| 1 | **经纪如何认证** | RECO 公开注册库可按姓名 / 经纪公司 / 类别 / **RECO ID** 查，每人显示法定姓名、注册号、类别、状态、到期日、所属经纪公司、60 个月处分记录。但页面声明「仅限私人非商业使用，任何商业使用一律禁止」，无 API、无批量下载，且**按 IP 地域拦截**（你开 VPN 时本机和我的浏览器都 403，关掉后正常）。 | **人工核验**：经纪在站内填注册姓名、RECO 注册号、类别、经纪公司、到期日；管理员在 `/admin/agents` 对照 RECO 注册库勾「已核」，记录核验日期与到期日；到期前 30 天自动转「待复核」。徽章写「RECO 注册已核 · #号 · 经纪公司 · 核于 日期」并链到 RECO 注册库。**不抓取、不自动查询**。 |
| 2 | **平台收转介佣金（25% 引擎）** | TRESA s.30：经纪公司不得向未注册者支付「促成交易」的报酬；s.4(2)：未注册者不得履行经纪职能。RECO 转介费公告：形式无关，一律不得付给非注册人。唯一出口是 s.5(1)(j)「**仅为**安排 RTA 租约而交易者」豁免，RECO 未就此表态。 | 佣金引擎**冻结**（生产 0 行，无损失），取得律师书面意见前不上线；若靠 (j) 豁免，Stayloop 的一切活动必须只涉 RTA 租约。 |
| 3 | **筛查是否构成「消费者报告机构」** | 《消费者报告法》s.1：为报酬向第三方提供关于消费者的「信用信息 / 个人信息」即消费者报告机构，s.3 未注册不得经营；罚 $50,000 / $250,000。我们收费向房东交付含收入、雇主、住址史、付款习惯、法庭记录的汇编报告，定义的每个要素都占。Openroom（只做公开 LTB 判令）已持牌；Certn 正被 OPC 联合调查。 | **需要律师意见，倾向注册**（或重构为「房东是收集方、Stayloop 只做处理方」并禁止跨房东复用）。注册前先把 s.9 的准确性/佐证义务落进产品（不利信息需佐证、判决 7 年限、显示债权人与金额），我们已有一半。 |
| 4 | **收入倍数硬门槛** | OHRC：对租客设 30% 一类的租金收入比截止线**违法**（补贴房除外）；O. Reg. 290/98 只允许「与租史 / 信用参考 / 信用检查一并」考虑收入；缺信用史 / 租史不得视为负面。我们的 `income_severe`（<2.0×）、`affordability_severe`（<2.5×）是硬性截止；`thin_file` 把 1 户档案封顶 62。 | **把倍数硬门槛改为信息与说明**（显示比值与市场惯例，不封顶、不自动降档）；`thin_file` 改为「证据不足 · 未测量」；报告加一句「收入比值不是拒绝依据」。这会改变评分口径，需要你同意。 |
| 5 | **租客付费解锁链接** | RTA s.134(1)–(2)：房东或其代理人不得向准租客收取任何费用、佣金、押金以外款项，含要求购买服务作为租赁条件；罚 $100,000 / $500,000。租客自愿为**自己的**服务付费不在此列，但房东「转发付款链接」极易构成「代房东收取」。 | **下线「生成租客付款链接」**，只保留房东付 / 升级 Pro。将来若做租客自购报告，要做成租客发起、可复用、房东不得要求。 |
| 6 | **产品文案与事实不符** | 房源页写「RECO 已验证的会员经纪池派单」、经纪营销页「RECO 验证 30 秒通过」、定价页「持牌经纪免费带看」、隐私页写 Plaid（实际 Flinks）——系统里**没有任何经纪核验**。TRESA s.37 禁止虚假或误导广告，RECO 5.3 公告把第三方网站也算广告。 | 认证功能上线前，这些文案全部改为「即将」或删除；隐私页改 Flinks。（这一项不需要拍板，我可以直接改。） |

---

## 1. 现状盘点（代码）

- **角色只存在浏览器里**：`lib/useAuth.ts` 的 `sl-active-role` 存 localStorage，`setRole()` 任何人可改；服务端只有
  `bootstrap_agent_session(p_role)` 校验取值合法。**没有任何服务端「谁是经纪」的记录**。
- 相关表：`tenants`、`landlords`、`field_agents(license_no)`（只被 StatusOverview 读一次，从未写入核验）、
  `brokerages(registered boolean, stripe_connect_id)`（`registered` 无人设置）、`referral / referral_agreement /
  commission`（25% 引擎，生产 0 行）、`subscription.role`（0 行）。
- 经纪工作台 `/agent/*`（任务、客户、日历、佣金、带看）对任何自称经纪的登录用户开放。
- 房源页 `app/listings/[slug]/page.tsx:699` 写「MLS 挂牌房源须由持牌经纪带看 · Stayloop 从会员经纪池派单（RECO 已验证）」；
  `app/agent/page.tsx:50`「RECO 验证 30 秒通过」；`app/pricing/page.tsx:55`「持牌经纪免费带看」；
  `app/privacy/page.tsx:25` 写 bank-connection tokens (Plaid)。
- 筛查：`income_severe` / `affordability_severe` 硬门槛、`rent_ratio_high` 红旗、`thin_file` 封顶（`lib/screening/rubric.ts`、
  `app/api/screen-score/route.ts`）；解锁弹窗有「生成租客付款链接」（`/api/stripe/unlock` payer=tenant）；
  申请人通知信 `/screening/[id]/notice` 已按核验结果写措辞，但没有《消费者报告法》s.10(7) 要求的「拒绝通知 + 60 天内可索取来源」。

---

## 2. 经纪：谁能做什么（TRESA / RECO）

**「交易」的定义包含租赁**。TRESA s.1：trade 包括以出售、购买、**租赁**等方式处置或取得不动产，以及「直接或间接促成」上述行为的任何行为、广告、行为或谈判。安排租赁、为收费把租客介绍给房东，按文本都是交易。
https://www.ontario.ca/laws/statute/02r30

**注册类别**：brokerage（经纪公司）、broker、salesperson、broker of record；s.4(1) 未注册不得交易，s.4(2) 不得自称或履行经纪职能。**豁免**（s.5(1)）：(f) 交易一方的全职受薪雇员为雇主行事（承包商不算）；(h) 为自己名下不动产（房东自租）；**(j) 仅为安排 RTA 适用之租约而交易者**（"solely"——一旦涉及买卖或非 RTA 租约即失去豁免）。物业经理靠 (f) 或 (j)。罚则 s.40：个人 $50,000 / 两年以下，公司 $250,000；s.9 未注册者不得起诉索取报酬。

**核验来源**：https://registrantsearch.reco.on.ca/ 。实测（2026-09-13，关 VPN）：搜索方式 Salesperson/broker（姓名）、Brokerage name、Category/city、**RECO ID**；可切换「未注册 / 曾注册（10 年内）」，终止原因 Lapsed / Voluntarily Terminated / Revoked。每位注册人显示：Legal Name、Registration Category、Registration Number（7 位）、Registration Status、Registration Expiry、Brokerage Name / Address / Email / Phone / Fax、Conditions and Discipline History（60 个月）。页面为服务端表单（POST `/RegistrantSearch/Salesperson`），无结果直链；免责声明「仅限私人非商业使用，任何商业使用，无论整体或部分、直接或间接，一律禁止」。法定最低公开内容见 O. Reg. 567/05 s.11、s.13(2)。https://www.ontario.ca/laws/regulation/050567

**经纪的线上展示规则**（O. Reg. 567/05 s.12.1；RECO 公告 5.1 / 5.2 / 5.3）：
- 广告必须「清楚、显著」使用**注册姓名**（不得用昵称、缩写），并**显著标出所属经纪公司的注册名**；第三方网站（含我们）也是广告。
- 允许的头衔：brokerage / real estate brokerage；broker of record；broker / real estate broker / real estate agent；salesperson / real estate agent / real estate salesperson / sales representative。**REALTOR®** 仅限 CREA 会员；MLS® 只能作形容词。
- 不得未经书面同意披露当事人、具体物业、协议内容（含价格）——「成交价」规则；客户评价与照片需书面同意；禁止抄袭与抓取；在第三方网站发布时经纪须确保运营方能**及时处理变更请求**（转所等）。
- TRESA s.37 禁止虚假、误导广告；s.38 注册官可勒令撤回。
https://www.reco.on.ca/agents-and-brokerages/reco-bulletins/reco-bulletin-5-1-advertising-requirements ·
https://www.reco.on.ca/agents-and-brokerages/reco-bulletins/reco-bulletin-5-3-advertising-online

**披露义务**：提供任何服务前须给客户 **RECO Information Guide** 并讲解（O. Reg. 567/05 s.13；RECO 公告 2.1）；RECO FAQ 明确**租赁客户同样适用**；代表关系须有**书面代表协议**（s.13.4：生效/到期、报酬、服务、指定代表人）——RECO 2025-06 明确租赁交易的义务与买卖相同，服务可含谈租约、填标准租约、带看、筛租客；对自代表方须先给「Information and Disclosure to Self-represented Party」表（s.13.1）；多重代表须书面同意（s.22）。行为准则现为 **O. Reg. 365/22**（2023-12-01 起，580/05 已废止）：s.5 不得误导、s.6 不得违反《人权法》、s.10 不得向自代表方提供意见。
https://www.reco.on.ca/agents-and-brokerages/tresa-explained/tresa-faqs ·
https://www.ontario.ca/laws/regulation/220365

**报酬与转介费**：TRESA s.30 经纪公司不得雇用未注册者履行须注册的职能、不得向其支付报酬；s.31(2) 经纪人只能从所属公司收取交易报酬；s.36 报酬只能是约定金额或价格百分比。RECO 转介费公告：向非注册人支付「促成交易」的报酬，**形式无关**，一律不可；注册人之间的转介费须经经纪公司收付并披露；O. Reg. 567/05 s.23.1 任何来自第三方的利益须向客户披露。
https://www.reco.on.ca/registrars-bulletin/referral-fees/

**信托款**：s.27 经纪公司须设信托账户；平台不是信托安排。RTA 下唯一合法押金是末月租金（s.105–106）。

**TRREB / CREA 数据**：TRREB VOW 规则——消费者只能通过会员运营的密码保护 VOW 获取数据，不得抓取、转售、做衍生报告，非会员不得发布成交信息；onlistings.trreb.ca 条款禁止商业使用与抓取；CREA DDF® 只向会员、加盟商、广告网站及**签约 Partner** 提供，展示须带「Powered by REALTOR.ca」、挂牌经纪公司名、24 小时刷新；REALTOR.ca 条款禁止抓取及用于训练模型；TRREB 市场报告全部「版权所有」，未见允许第三方转载的许可（引用头条数字属版权 / 合理使用问题，非 TRREB 规则问题）。
https://trreb.ca/hlfiles/pdf/TREB-FAQs.pdf · https://www.crea.ca/files/technology/english/DDFR-Policy-and-Rules-February-2024-ENG.pdf ·
https://www.realtor.ca/terms-of-use

**消费者保护**：RECO 投诉入口 https://complaints.reco.on.ca/ ；《消费者保护法 2002》不适用于不动产买卖租赁与 RTA 交易，但适用于平台自己向消费者出售的订阅 / 报告；CPA 2023 尚未生效。省府「共享经济」指引：平台应披露自身提供的保障并协助纠纷。

---

## 3. 房东与租客：权利、责任与平台义务

**租客**（RTA 2006；《人权法》；《消费者报告法》；PIPEDA）
- 不受 16 项受保护特征歧视（Code s.2、s.9、s.11 间接歧视需「合理且真诚」）。
- **不得被收取任何费用**（RTA s.134(1)：fee、premium、commission、bonus、penalty、key deposit 或类似款项，退不退都不行；s.134(2) 扩及房东的代理人；申请费违法）；押金只能是一个租期 / 一个月租金（s.105–106，年付利息）；不得强制邮寄支票或自动扣款（s.108）。
- 有权拿到标准租约（s.12.1），21 天内拿到签署副本（s.12(2)），否则可扣租；固定期可 60 天通知解约（s.47.0.1）。
- **被拒时的知情权**：《消费者报告法》s.10(7)——因来自消费者报告机构**或其他人**的信息而被拒时，使用者须在通知决定时**书面告知此事实**，并在 60 天内应请求披露信息的性质与来源（或机构名址），通知须写明此权利；s.12 有权向机构索取自己的档案。
- PIPEDA：查阅、更正（4.9）、保留期满销毁（4.5.3）。OPC：**不应向房东提供 SIN**；信用检查只需姓名、住址、出生日期；复印驾照 / 工资单通常超出必要。
- 责任：清洁（s.33）、故意或过失损坏（s.34）、不得骚扰房东（s.36）、不得严重干扰他人（s.64）。
https://www.ontario.ca/laws/statute/06r17 · https://www.ontario.ca/laws/statute/90c33 ·
https://www.priv.gc.ca/en/privacy-topics/landlords-and-tenants/privacy-in-the-landlord-and-tenant-relationship/

**房东**
- 选租客只能查：信用参考、租史、信用检查授权（O. Reg. 290/98 s.1(1)），**收入信息只能与前者一并**（s.1(3)–(5)）；担保人与末月租金押金（s.2）；OHRC：「290/98 之外不允许其他询问」；**租金收入比截止线违法**；缺租史 / 信用史不得视为负面；担保人要求须对所有人一致（Kearney v. Bramalea、Ahmed）。
- 信用检查须有授权；s.10(2) 含「个人信息」的报告须事先书面通知；s.11 向第三方询问须书面通知本人；通知须粗体/下划线 ≥10pt。
- 标准租约、押金、副本义务如上；附加条款不得剥夺法定权利。
- PIPEDA：说明目的、取得同意、限制收集、保护、提供查阅、按目的使用、不无限期保留、**不得把不良记录放进非监管的「坏租客名单」**；使用第三方服务时仍为责任方（4.1.3 须以合同保证同等保护）。
- 拒绝后：s.10(7) 通知义务在**使用信息的房东**；未见法定「说明理由」义务，但被质疑时须证明标准「合理且真诚」（Code s.11）。
https://www.ontario.ca/laws/regulation/980290 · https://www.ohrc.on.ca/en/policy-human-rights-and-rental-housing

**《消费者报告法》与 Stayloop**：定义见 s.1(1)（消费者报告 / 消费者报告机构 / 信用信息 / 个人信息，逐字引文在研究记录）；s.9 机构须有「合理程序确保准确与公平」，不利个人信息须尽力佐证，判决须带债权人与金额，7 年限。OPC PIPEDA 2016-002 把物业公司的共享「坏租客」名单视为未持牌的信用报告功能且目的不当；Openroom 自述持消费者报告机构牌照；Certn 2024-06 起被 OPC / BC / AB 联合调查。**按文本，收费向房东提供汇编报告的平台应假定自己是消费者报告机构。**
https://www.priv.gc.ca/en/opc-actions-and-decisions/investigations/investigations-into-businesses/2016/pipeda-2016-002/ ·
https://openroom.ca/tenant-screening/ · https://www.priv.gc.ca/en/opc-news/news-and-announcements/2024/an_240604/

**LTB / 法庭记录**：LTB 终局判令在开放数据目录发布（Open Government Licence – Ontario，可商用需署名，但**不授权**使用其中个人信息或违反隐私法）；搜索合法，使用受 PIPEDA 与（若为报酬提供）CRA 约束；CanLII 条款禁止批量 / 程序化下载（CanLII v. Caseway，2024）。我们的做法（自建索引、按角色展开、不写判决结果）与此一致。
https://www.ontario.ca/page/open-government-licence-ontario

**AI 辅助决策**：联邦 AIDA 已随 2025-01 休会失效，无继任法案；IPC–OHRC《负责任使用 AI 原则》（2026-01-21）：告知本人其信息被 AI 处理、标明 AI 生成内容、对自动决策至少提供**复核权**、高风险决策可**选择退出**、人在回路。实质约束仍是 Code s.11：任何对受保护群体有差别影响的评分因子须「合理且真诚」（OHRC/LCO 有 AI 人权影响评估工具）。
https://www.ohrc.on.ca/en/principles-responsible-use-artificial-intelligence

**电子签名与租约起草**：《电子商务法 2000》s.4、s.5、s.11 电子签名有效，租约不在 s.31 排除项；须保留可准确再现的副本、21 天送达副本的证据与同意电子形式的证据。《法律协会法》s.1(6)：为他人「选择、起草、填写或修改」涉及不动产权益的文件属法律服务，非持牌者不得提供（s.26.1，罚 $25,000 / $50,000）；**填政府标准表格 = 当事人自行填表，AI 为房东目标量身撰写第 15 节附加条款 = 越线**。
https://www.ontario.ca/laws/statute/00e17 · https://www.ontario.ca/laws/statute/90l08

---

## 4. 三角色权限与功能矩阵（建议）

角色改为**服务端记录**（`profiles.role`，RLS），经纪再加一层 `agent_profiles.status`。同一账号可持多个角色（房东同时是经纪很常见），但**经纪职能只在 status = verified 时开放**。

| 能力 | 租客 | 房东 | 经纪（未认证） | 经纪（已认证） |
|---|---|---|---|---|
| AI 助手（各自人设） | ✓ Luna | ✓ Logic | ✓ Brief（只读、演示态） | ✓ Brief |
| 浏览房源、提交看房意向 | ✓ | — | ✓（以租客身份） | ✓ |
| 租客护照、授权分享自己的核验 | ✓ | — | — | — |
| 发布房源（自有物业） | — | ✓（进管理员审核） | — | ✓ 须显示注册名 + 经纪公司 |
| 发布房源（代客） | — | — | ✗ | ✓ 须书面代表协议自述 |
| 租客筛查（上传 / 直连） | — | ✓ 仅对自己的申请人 | ✗ | ✓ 仅对签有代表协议的房东客户；报告标明「代 <房东> 出具」 |
| 接受派单 / 带看 | — | — | ✗ | ✓ |
| 客户管理、日历、佣金页 | — | — | ✗（空态 + 认证入口） | ✓ |
| 转介 / 佣金结算 | — | — | ✗ | 冻结，待律师意见 |
| 租约：填标准表格、电子签 | ✓ 签 | ✓ 填 + 签 | — | ✓ 填（代表方） |
| 租约附加条款由 AI 撰写 | — | ✗（改为固定条款库 + 自撰 + 无效条款提示） | — | ✗ |
| 删除自己的数据 / 筛查记录 | ✓ 申请 | ✓ | ✓ | ✓ |
| 管理员：核验经纪、房源审核 | — | — | — | — （`admin_users`） |

**每个角色必须被告知的**：
- 租客：申请前——收集什么、来源（征信局 / 法院门户 / LTB 目录 / 银行）、谁看、用途、保留期、AI 参与但由人决定、如何更正 / 争议、不必提供 SIN、任何费用都不是租赁条件。
- 房东：只能要 290/98 允许的信息；不得设收入比截止线；缺记录不等于坏记录；拒绝时按 s.10(7) 出具通知（我们生成）；21 天内给标准租约副本；不得收押金以外款项；对交给 Stayloop 的数据仍负责。
- 经纪：认证只证明「核验日在 RECO 注册库上处于 REGISTERED」，不是 Stayloop 背书；带看 / 申请前须给 Information Guide 与书面代表协议（我们提醒，不能代替）；转所须及时更新，否则下架。

---

## 5. 经纪认证方案

**流程**
1. 用户在 onboarding 选「经纪」→ 进 `/agent/verify` 表单：注册姓名（法定名，按 RECO 显示）、常用名（可选，不得用于对外显示）、RECO 注册号（7 位）、类别（salesperson / broker / broker of record）、所属经纪公司注册名、注册到期日、业务邮箱 / 电话、是否 CREA 会员（勾选即可用 REALTOR®）、勾选「我已阅读展示规则并承诺向客户提供 Information Guide 与书面代表协议」。不上传证件，不收 SIN。
2. 写入 `agent_profiles(status='pending')`，管理员在 `/admin/agents` 看到队列，**从加拿大 IP 手动打开 RECO 注册库**按 RECO ID 查，核对姓名 / 类别 / 公司 / 状态 REGISTERED / 到期日 / 处分记录；勾「已核」并填 `verified_at`、`expires_at`、备注（处分记录只记「有 / 无」）。不符则 `rejected` 并给原因。
3. 徽章：`RECO 注册已核 · #5008191 · HOME RUN REALTY INC. · 核于 2026-09-13`，点击跳 RECO 注册库首页（无结果直链）+ RECO 投诉入口。经纪卡片与其房源卡片一律显示「注册名 · 头衔 · 经纪公司名」，头衔只用允许词，REALTOR® 只在自述 CREA 会员时显示。
4. 复核：`expires_at` 前 30 天标 `renewal_due`，到期未复核转 `expired`（经纪职能关闭，卡片下架）；经纪自行修改公司 / 姓名 → 回到 `pending`；每次核验留一条 `agent_verification_events`。
5. 对外文案：认证描述只说「核验日在 RECO 公开注册库上处于注册状态」，不说「持牌保证」；每页有 RECO 免责（信息可能有 12 小时延迟，处分记录仅 60 个月）。

**数据模型**
```
agent_profiles (
  auth_id uuid pk references auth.users,
  legal_name text, trade_name text,
  reco_number text unique check (reco_number ~ '^[0-9]{7}$'),
  category text check (category in ('salesperson','broker','broker_of_record')),
  brokerage_name text, brokerage_id uuid references brokerages,
  crea_member boolean default false,
  status text check (status in ('pending','verified','rejected','renewal_due','expired')) default 'pending',
  expires_at date, verified_at timestamptz, verified_by uuid, notes text,
  created_at, updated_at
)
agent_verification_events (id, agent_auth_id, action, by, at, note)
profiles.role text[]  -- ['tenant','landlord','agent']，服务端与 RLS 用它，不再信 localStorage
```
RLS：本人可读写自己的 `agent_profiles`（`status`、`verified_*` 列只允许 service role / 管理员改）；`brokerages.registered` 由管理员在核验时一并设置。

**不做的**：自动抓取 / 查询 RECO（条款禁止商业使用且地域拦截，Cloudflare 边缘也会被挡）；用第三方非官方 RECO API（同样是抓取，且已被 Cloudflare 拦）；把 RECO 卡片影像当认证依据（可伪造，且注册库本身就是权威来源）。

---

## 6. 平台自身必须改的（按风险排序）

**高**
1. **文案与事实不符**（TRESA s.37 / RECO 5.3）：房源页「RECO 已验证的会员经纪池派单」、经纪页「RECO 验证 30 秒通过」、定价页「持牌经纪免费带看」——认证上线前改为「即将开放」或删除；隐私页 Plaid → Flinks。
2. **收入倍数硬门槛与薄档案封顶**（OHRC / 290/98）：改为信息性，不自动降档；报告写明「收入比值与信用史长短不是拒绝依据，房东须整体评估」。
3. **租客付款链接**（RTA s.134）：下线。
4. **消费者报告机构**：取得律师意见；在此之前把 s.9 义务做进产品——不利项须有佐证或标「未佐证」、法庭记录带债权人与金额、不显示 7 年前判决、报告页与通知信提供更正 / 争议通道（已有邮箱，缺表单）。
5. **拒绝通知**：`/screening/[id]/notice` 补 s.10(7) 措辞（「本决定参考了来自…的信息；你有权在 60 天内要求披露信息的性质与来源」），并标明 AI 参与、由房东本人决定、复核渠道。
6. **转介佣金引擎**：冻结；`brokerages.registered` 只由管理员核验后设置。

**中**
7. 经纪展示规则（注册名 + 头衔 + 公司名每页显示；REALTOR® 门控；转所变更 24 小时内处理；成交价 / 客户评价需书面同意）。
8. 租约 AI 附加条款：改为固定政府文案 + 房东自撰 + 「剥夺法定权利的条款无效」提示；助手不再为房东目标撰写条款（《法律协会法》s.1(6)）。
9. 筛查上传 ID：OPC 认为复印证件通常超出必要——保留但默认「可选」，并说明 Veriff 直连可替代。
10. 房源数据：只用房东自供、DDF/Partner 授权或明确许可的来源；Realtor.ca 导入 / Jina 抓取（管家实时房源、行情样本）与 REALTOR.ca 条款冲突，需要换成 DDF Partner 协议或停用；TRREB 季报数字标明版权与来源、只引头条数据。
11. 电子签租约：保留同意电子形式的证据与 21 天送达证据（现有 `lease/sign` 流程核对）。

**低**
12. 每个经纪资料页放 RECO 投诉链接与 Stayloop 自身保障说明（省府共享经济指引）。
13. 隐私政策补：数据保留期、第三方处理方（Veriff、Flinks、Equifax、模型供应商）、AI 使用声明、查阅 / 更正 / 删除方式（删除按钮已上线）。

---

## 6b. 消费者报告机构注册：怎么办（2026-09-13 补充研究）

完整备忘录：`design/research/consumer-reporting-agency-registration-memo-2026-09.md`。要点：
- **同行都注册了**：安省 2026-07 公开登记 CSV 列出 34 家消费者报告机构，其中 SingleKey（4741499，2026-12 到期）、
  Certn (Canada) Inc.（4741483）、Openroom Inc.（4741548，2025-07-09 获证，自述审了约一年）、Landlord Credit
  Bureau（2642985 Ontario Inc.，FrontLobby 是它的**转售方**，自己不注册）、Rent Check Credit Bureau。liv.rent 不注册，
  合同上把征信责任全推给 Equifax（租客本人授权拉取、评分后销毁）。
- **怎么注册**：Consumer Protection Ontario 的 Registrar of Consumer Reporting Agencies；表格 06019E（邮寄 / 邮件，无线上
  门户）；费用 **$290**（每分支 $290）；条件：18 岁以上、**两年消费者报告相关经验**、在安省有**非住宅、正常营业时间对外
  开放的固定营业地点**、持牌会计师出具的财务报表（首次为期初报表）、所有董事 / 股东申报并做 CPIC 警方记录检查；
  无保证金要求；拒绝可在 15 天内向 Licence Appeal Tribunal 申诉；证书 2–3 年一续；处理时间未公布（Openroom 约一年）。
- **注册后的义务**（s.8–13）：只向有列明目的者提供；准确与公平程序；**不利个人信息须尽力佐证并注明未佐证**；判决 /
  破产 / 催收 / 定罪 7 年限，撤销的指控永不；不得含种族 / 信仰 / 性别等；消费者可免费索取全部档案、3 年内查阅者、1 年内
  接收者，电子副本 2 个工作日内；争议须「尽最大努力」核实并通知最近 60 天的接收者；地址 / 董事变更 5 日内报告；
  注册官可无证进入营业场所检查。2023-12 起罚则 $50,000 / $250,000，且消费者可直接民事索赔（s.23.1）。
- **对 Stayloop 的建议**：① 现在就申请（预算 $290 + 会计报表 + 非住宅办公地址 + 两年经验叙述，可雇 / 聘有经验的人）；
  ② 报告按 s.9(3) 改造：取证 / LTB / 法庭产生的每条不利项标「已佐证 / 未佐证」，代码里强制 7 年与 12 个月诉讼时限，
  受保护特征硬过滤；③ 上线前做好 s.12/13「我的档案」端点（2 个工作日、免费、列出查阅者与接收者）与争议流程；
  ④ 把房东做成合规使用者：邀请里嵌入 s.10(2) 事前书面通知、报告发放前房东勾选租赁目的、s.10(7) 拒绝通知模板写明
  Stayloop 为机构；⑤ Equifax 直拉与 AI 汇编在法律上分开，模型叙述不算「佐证」。

## 7. 需律师确认 / 未能从一手来源确认

- RECO 是否接受「仅安排 RTA 租约的平台」适用 s.5(1)(j) 豁免，从而可收经纪公司的转介费。
- Stayloop 是否须注册为消费者报告机构，或以「房东为收集方、Stayloop 为处理方」结构规避。
- TRREB 市场报告数字的转载许可（只找到版权声明）。
- 自代表方披露表的规定文本（PDF 不可取）。
- 安省是否有房东须「说明拒绝理由」的法定义务（只找到 s.10(7) 通知义务）。
- OPC 对 Certn 的调查结论（未公布）。

---

## 8. 实施顺序（建议）

1. **本周可做、不需拍板**：改六处文案；隐私页改 Flinks；通知信补 s.10(7) 与 AI 声明；报告页加「比值非拒绝依据」说明；`brokerages.registered` 加管理员门。
2. **拍板后一周**：`profiles.role` 服务端化 + `agent_profiles` + `/agent/verify` + `/admin/agents` + 徽章 + 到期复核；经纪职能按 status 门控；文案改回「已上线」。
3. **拍板后同期**：下线租客付款链接；收入硬门槛改信息性并跑校准夹具确认分布；`thin_file` 改未测量。
4. **律师意见后**：消费者报告机构注册或重构；转介引擎去留；Realtor.ca 数据来源换 DDF Partner 或停用。

研究记录（两份完整备忘录，含逐条引文）：`design/research/agent-regulation-memo-2026-09.md`、`design/research/landlord-tenant-law-memo-2026-09.md`。
