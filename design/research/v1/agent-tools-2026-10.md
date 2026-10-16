# V1.0 调研线 B · 经纪工具（2026-10-13）

> **法规核查后的修正（2026-10-13，详见 `legal-check-2026-10.md` 清单 7–10）**：「平台不能以 AI 代经纪谈条款」的主依据是《法律协会法》s.1(6) 4（非持牌人不得代人谈判法律权利），TRESA s.4 / s.30(b) 只是经纪一侧的辅助依据，s.5(1)(j) 只决定 Stayloop 自身是否须注册；安省标准租约法定必用、免费下载，但仍是 Crown copyright，不复制官方 PDF 加功能；罚则已复核为 LSA s.26.2(1) $25,000 / $50,000；LTB 手册明文：参与出租的经纪不得在 LTB 代理当事人。

调研方案：`design/v1-research-plan-2026-10.md` 第 2 节。已有法规研究不重做，只引用：`design/research/agent-regulation-memo-2026-09.md`（下称「法规备忘录」，引文来自 2026-09-09 的 e-Laws 文本）与 `design/roles-and-agent-verification-2026-09.md`（下称「角色方案」）。**经纪访谈不做**（用户已定），B3 用公开资料代替，全部标为二手。

**三条硬约束，全文带着**：① 没有 MLS 房源数据（经纪挂 MLS 在经纪公司系统做，我们最多记 MLS 号；本文不提任何 MLS / DDF / Realtor.ca 方案）；② Stayloop 不做经纪业务、不收转介佣金（引擎冻结）；③ 消费者报告机构未注册（`CRA_MODE=tool` 已备好，按姓名查公开记录与 Equifax 直拉不对外开放）。

**方法**：代码只读（`components/agent/ClientBook.tsx`、`lib/agent/clientBook.ts`、`app/agent/*`、`app/api/delegations/*`、`lib/agent/prompts.ts` 的 `AGENT_LEASING_FACTS` / `SCREENING_RULES_AGENT`、`app/screening/app/page.tsx` 经纪模式、`components/delegations/RepresentingStrip.tsx`、`lib/agent/intake.ts` 经纪四张引导卡、`lib/lifecycle/stages.ts agentLifecycle`、`lib/lease/trreb.ts`、`app/pricing/page.tsx` 经纪三档）；对标产品实读公开页（摘要在 `design/research/v1/agent/*.md`）；法规引文优先一手（TRESA、O. Reg. 567/05 从 Wayback 的 e-Laws 镜像读到原文；e-Laws 本站 2026-10-13 对脚本只返回 JS 壳）。**未能读取**：reddit.com（403）、RECO「Registered/Unregistered Assistants」公告（本站 404、镜像 403，只用搜索摘要）、《法律协会法》s.26.1–26.2 的罚则原文（e-Laws / CanLII 都读不到，沿用角色方案里 2026-09 读到的数字）、OREA 会员区的 2025 Summary of Revisions、liv.rent/agents（404）。

每条发现四个字段：**现状 · 证据 · 建议 · 门槛**。

---

## 1. B1 工作流还原（以 TRESA 义务为骨架）

安省租赁经纪的一单，从法定义务到交接，十步。每步：经纪现在怎么做 / 用什么工具 → 我们覆盖到哪 → 四字段。

### 1.1 RECO Information Guide

- **现状（经纪）**：任何服务之前必须把 RECO Information Guide 给对方并讲解；租赁同样适用。工具：RECO 官网 PDF 用邮件 / WhatsApp 发，或在 CREA WEBForms 里走确认表。2024 年 Guide 被打开 900,000+ 次（RECO 2024 年报）。
- **证据**：RECO TRESA FAQ：「Yes, for both prospective residential and commercial lease clients you are required to provide and explain」（https://www.reco.on.ca/agents-and-brokerages/tresa-explained/tresa-faqs）；RECO Bulletin 2.1：「Before an agent provides services to a client ... the agent must give a copy of the RECO Information Guide」（法规备忘录 §3）；年报：「The RECO Information Guide was accessed more than 900,000 times in 2024」（https://www.reco.on.ca/wp-content/uploads/RECO-Annual-Report-2024.pdf）。
- **我们覆盖**：客户表 `agent_clients.info_guide_given_at`（日期）；缺日期即生成任务（`clientTasks`）、生命周期 rail 标「缺 Information Guide」；委托发起 `/api/delegations` 在两个日期都记录前返回 422 `paperwork_required`。**只记日期，不存送达证据**。
- **建议**：日期旁加「怎么给的」（邮件 / 当面 / 链接）+ 可选上传客户确认件，并在客户对话（`agent_client` 线程）里给经纪一条一键发送「这是 RECO Information Guide 的官方链接，我们见面时会讲解」的模板消息——消息进只追加线程，自然成为送达记录。
- **门槛**：法规——Bulletin 2.1 说 onus 在经纪，平台不能代替「provide and explain」，所以只能记录与辅助，不能替发（法规备忘录「Should 9」）。工作量 S。

### 1.2 书面代表协议

- **现状（经纪）**：代表任何一方（租客或房东）都要书面代表协议，租赁与买卖义务相同；协议要写生效 / 到期日、报酬方式、服务内容、指定代表人。工具：OREA 标准表单经 CREA WEBForms + Authentisign / DocuSign 电子签；经纪公司留档。
- **证据**：O. Reg. 567/05 s.13.4(1)：「The agreement clearly, comprehensibly and prominently, sets out ... i. The date on which the agreement takes effect and the date on which it expires. ii. The method for determining ... the amount of any remuneration」（Wayback 镜像 https://web.archive.org/web/2025/https://www.ontario.ca/laws/regulation/050567）；RECO 2025-06：「a representation agreement, which must be in place when an agent represents a party in any transaction」，服务可含「negotiating the terms of the lease, completing the standard Ontario lease agreement」「showing the rental property, or screening tenants」（https://www.reco.on.ca/news/for-the-record-brokerage-leadership-edition-june2025）；WEBForms「available to REALTORS® as a part of your membership with CREA」（crea.ca/technology/crea-webforms）。
- **我们覆盖**：`agent_clients.representation_agreement_at`（签署日期，一个日期列）；委托 `delegations` 是 Stayloop 内部的授权记录（`basis_version = TRESA-2024-representation-v1`，客户邮箱确认），**不是**代表协议本身，也不替代它。
- **建议**：① 加 `representation_expires_at`（s.13.4 要求协议有到期日），到期前 14 天出任务「代表协议到期，续签或归档」，到期后筛查 / 委托入口变灰；② 客户表允许上传协议 PDF（私有桶、本人 RLS）作为「我们据此开放代客功能」的凭证；③ 委托确认页写明「此委托以你与经纪已签的代表协议为基础，不是代表协议」。
- **门槛**：法规无障碍（我们只是记录）；PIPEDA 要写明保留期。工作量 S。

### 1.3 多重代表披露

- **现状（经纪）**：租赁里经纪同时代表房东与租客很常见（Toronto 租客指南直接写「In many cases, the agent represents both」）；须先披露、双方书面同意。工具：OREA 披露表 + 电子签。
- **证据**：O. Reg. 567/05 s.22(1)：「A brokerage shall not represent more than one client in respect of the same trade in real estate unless, (a) the brokerage discloses ... and (b) each client ... consents in writing」（同上镜像）；lowestrates.ca 租客指南：「it's not allowed unless the landlord and future tenant sign an agreement consenting to the arrangement, according to RECO」（https://lowestrates.ca/blog/should-you-use-real-estate-agent-help-you-rent-city-toronto）。
- **我们覆盖**：`AGENT_LEASING_FACTS` 里一句话；「合规边界」引导卡有「多重代表怎么披露」选项。**客户表没有任何字段**。
- **建议**：客户表每行加「同一交易另一方也是我的客户」勾选 + 书面同意日期；两位客户若在同一事务（同一地址 / 同一申请）出现而没有同意日期，出红色任务。代客筛查时若申请人本身也是该经纪的租客客户，筛查页顶部提示「双方代表：确认已书面同意」。
- **门槛**：法规无障碍（记录 + 提醒）。工作量 S。

### 1.4 挂牌 / 找房 / 定价

- **现状（经纪）**：房东客户的房源由经纪公司挂到 TRREB MLS（BrokerBay 排看房，TRREB 会费内含）；定价看同楼 / 同区近期成交与挂牌；租客客户靠 MLS 先于公众 24–48 小时看到房源。工具：MLS 系统、BrokerBay、Realtor.ca。
- **证据**：BREL 房东服务页：「Pricing guidance based on recent comparable rentals」、MLS 房源「more than 45,000 Toronto agents can access」（https://www.getwhatyouwant.ca/renting-with-brel）；lowestrates.ca：「there's a 48-hour lag before the public can see them」；TRREB BrokerBay FAQ：「included as one of the services you receive through your membership dues」（https://trreb.ca/hlfiles/pdf/BrokerBay_FAQ.pdf）。
- **我们覆盖**：「挂牌定价」引导卡 → 对话里附 Stayloop 同区在租卡 + CMHC / 统计局公开租金基准（`readRentBenchmark`）；房东直租房源可由经纪代发（须注册名 + 经纪公司名）。**库里在架只有 5 套测试房源，所以「同区挂牌」这一半几乎是空的**；MLS 号没有地方记。
- **建议**：① 定价卡改为「公开基准 + 经纪自己输入的 3 套可比」的确定性对比（经纪从 MLS 看到的数字由他自己填，我们算中位与差额，不读任何 MLS 数据）；② 房东房源加可选 `mls_number` 字段（只作记录与去重，不显示 MLS® 标志、不写「MLS listing」）；③ 不做找房功能给经纪（没有数据，做了也是空）。
- **门槛**：数据——硬约束①；CMHC / 统计局来源句每处必显示（已做）。工作量 S（定价卡）/ S（MLS 号）。

### 1.5 带看

- **现状（经纪）**：MLS 房源的看房在 BrokerBay 约、锁盒开门；租客方经纪在带看前要准备房东授权能答的事（租金区间、入住日、宠物、水电、租期）。常见问题：约了不来（美国软件商报告 no-show 约 20–22%，非多伦多数据）。
- **证据**：BrokerBay 页面（agents 可「accept, deny, or reschedule appointments」「multiple tenant approvals」，vendor claims）；lethub.co 2026-06 「rental no-show rates at roughly 20–22%」（https://lethub.co/blog/reduce-rental-showing-no-shows，供应商数据）。
- **我们覆盖**：「带看准备包」引导卡（时间 · 哪套 · 房东授权答什么 → 一段话）；`/agent/calendar` 是 DEMO_GATE 样例页，没有真实日程；Stayloop 房源的看房请求走 `showing_intents` → 房东待批卡，经纪不在链上。
- **建议**：不做带看日历（BrokerBay 已覆盖 MLS 房源，我们没有房源量）。把准备包落成**客户表上的一条记录**（哪天、哪套、授权范围、带看后一句结论），而不是只在对话里出现一次；带看后自动把客户阶段从「寻房中」提到「看房中」。
- **门槛**：无法规障碍。工作量 S。日历页建议从导航退役或标清「演示」。

### 1.6 申请与筛查

- **现状（经纪）**：收 OREA Form 410（法定姓名、出生日期、证件、住址史、雇主收入、前房东、推荐人、**信用与推荐人核查同意**）+ 信用报告 + 在职信 + 工资单 + 证件；人工比对，用 SingleKey 之类查信用报告真伪；造假普遍。
- **证据**：lethub.co 对 Form 410 的说明（见 `agent/orea-webforms.md`）；Storeys：Menkes 六个月「screened over 175 offers to lease ... over 90 of them were disqualified due to discrepancies」，经纪 Shay Asnani「There's essentially a checklist of things that I go through」、用 SingleKey 查假征信（https://storeys.com/rental-applications-toronto-fraudulent/）；Globe and Mail：一家多伦多经纪公司「spotting at least five fakes a month, up from just one or two a year 18 months ago」（https://www.theglobeandmail.com/investing/personal-finance/household-finances/article-tenant-fraud-real-estate/）；CBC London：「faked employment, doctored pay stubs and most recently, false bank statements」（https://amp.cbc.ca/lite/story/1.7283647）；SingleKey 自述服务「9,000+ real estate agents」（altss.com 公司档案）。
- **我们覆盖**：这是我们最强的一步——RECO 注册有效的经纪可直接在 `/screening/app` 筛查（不需房东帽子、不需委托），报告含取证（PDF 元数据 / 修改痕迹 / 跨文档）、四项打分、法庭与 LTB 实查（`CRA_MODE=tool` 时跳过按姓名查公开记录）；委托有效时报告同时记在房东客户名下（`screenings.delegation_id`，`guard_screening_delegation`）；「租客筛查」引导卡先问代表协议 / Form 410 同意 / 人数。**缺口**：申请人材料只能由经纪代传；申请表（`/apply/<slug>`）只挂在 Stayloop 房源上，MLS 房源的申请人没有入口；申请人同意（Form 410 的签名）不在我们系统里，经纪要自己保存。
- **建议**：「经纪收件链接」——经纪在客户表（房东客户行）生成一条**不挂房源**的申请链接（地址 + 单元 + 截止时间），申请人自己上传材料并在线签 O. Reg. 290/98 范围内的信息授权（我们自己的文本，不复制 Form 410），材料直接进该经纪的筛查；房东客户若已确认委托则同时可见。这把「收件 → 比对 → 出报告」从 WhatsApp + 邮件 + SingleKey 三处收到一处。
- **门槛**：法规——OHRC / O. Reg. 290/98 限定可问项（已有 `/apply` 表单遵守）；《消费者报告法》：报告是给房东决定用的，注册前 `CRA_MODE=tool` 已限制公开记录检索；PIPEDA 保留期与申请人索取档案（V0.8 第一项）。工作量 M。

### 1.7 要约（OREA Form 400）

- **现状（经纪）**：租客方经纪用 OREA Form 400「Agreement to Lease – Residential」写要约（租金、起止、押金、附表 A 条款、不可撤回期限），押金以银行本票 / 保付支票交到挂牌经纪公司信托账户；多个要约时房东选一个。Form 400 不能代替标准租约。工具：CREA WEBForms + 电子签。
- **证据**：OREA 目录「Agreement to Lease – Residential」；OREA 条款：「These OREA Standard Forms are for use by OREA members and certain licensees only.」「may not be modified or amended in any manner」，软件平台「OREA requires written consent through the execution of a separate licence agreement」（https://orea.com/standard-forms-clauses/Terms-of-Use）；Toronto 租客指南：押金「certified cheque or bank draft」（https://www.getwhatyouwant.ca/guide/renting-in-toronto-guide-for-tenants）；O. Reg. 567/05 目录「17. Deposit within five business days」。
- **我们覆盖**：`lib/lease/trreb.ts` + `components/lease/TrrebLeaseDoc.tsx` 按「Form 400 structure」渲染一份租赁协议（`form_type='trreb'`），只有房东帽子能从 `/landlord/leases/new` 起草；`AGENT_LEASING_FACTS` 与「租约与押金」引导卡讲清 Form 400 vs 标准租约、押金上限、钥匙押金、s.134 禁收费。
- **建议**：**不给经纪做 Form 400**（版权 + 许可 + 《法律协会法》，见 B4）。改做「要约核对清单」：经纪把自己在 WEBForms 里写好的要约要点（租金、起止、押金额、附加条款摘要）贴进来，我们用 `checkLeaseTerms` / RTA 规则确定性地标出「押金超过一个月」「宠物禁止条款无效」「钥匙押金超过成本」「向租客收费」这类问题——只核对，不起草。
- **门槛**：OREA 许可（没有就不能复制 / 仿制 / 加功能）；《法律协会法》s.1(6) 2.i（见 B4）。工作量 S（核对清单）。另：`trreb` 这套渲染器是否算「仿制 Form 400」要用户决定——建议改名「租赁要约摘要」并去掉与 Form 400 的对照说明，或取得 OREA 许可。

### 1.8 安省标准租约

- **现状（经纪）**：2018-04-30 起强制使用政府《标准租约》（免费可填 PDF）；经纪常替房东客户填好、双方电子签，21 天内给租客副本；附加条款在第 15 节。
- **证据**：ontario.ca/standardlease（「required for most residential tenancy agreements signed on or after April 30, 2018」）；RECO 2025-06 列「completing the standard Ontario lease agreement」为代表服务之一；Bennett Jones：押金「cannot be more than one month's rent」「cannot be used as a damage deposit」（https://www.bennettjones.com/Insights/Updates/2018/02/Hold-the-Legalese-Ontario-Has-a-New-Standard-Residential-Lease）。
- **我们覆盖**：`/landlord/leases/new`（ontario_standard）+ 电子签 `/api/lease/{send,sign}` + 双签自动建在管租约——**只有房东帽子能用**；`delegations.allowed_actions` 里已经定义了 `draft_lease`，但没有任何页面执行它。
- **建议**：委托含 `draft_lease` 时，经纪可从客户表进入「替 <房东客户> 起草标准租约」：经纪填表（我们只提供政府表格的字段与第 15 节的固定条款库 + 无效条款提示，不写定制条款），草稿落在房东客户账号的租约列表，**由房东本人发送与签署**；经纪侧只看状态。租客方经纪则只有「解读」入口（已有）。
- **门槛**：《法律协会法》s.1(6)：为他人「selects, drafts, completes or revises ... a document that affects a person's interests in or rights to or in real or personal property」是法律服务；经纪在 TRESA 规管的职业常规范围内填表可依 s.1(8) 1 豁免（「acting in the normal course of carrying on a profession or occupation governed by another Act」），平台只能做工具、不能自动撰写条款（角色方案 §3 已决）。工作量 M。

### 1.9 押金与交接

- **现状（经纪）**：租金押金（≤ 一个月）交到挂牌经纪公司信托账户，签约后转给房东；钥匙、入住检查、保险凭证在交接时处理。工具：经纪公司信托账、纸质交接。
- **证据**：TRESA s.27（信托账户，法规备忘录 §3）；RTA s.105–106、s.134（`lib/ontario/rules.ts` 已有）；O. Reg. 567/05 s.17 标题「Deposit within five business days」。
- **我们覆盖**：在管租约的入住清单（`move_in_checklist`，13 项）只对 household 成员；经纪不是成员。资金一律不经手。
- **建议**：把入住清单做成可分享给客户的只读页（经纪 → 客户邮件）；不做任何押金功能。
- **门槛**：无；资金不经手是既定决定。工作量 S（低优先）。

### 1.10 租期中联系与续约

- **现状（经纪）**：签完约经纪通常退出；做租赁的价值是「租客以后变买家」，所以到期前联系有商业动机。
- **证据**：Canadian Mortgage Trends 2026-03：Toronto 经纪 Mike Petrant 「lease listings are 30% to 40% of his business」、Arun Kumar「2025, I had a lot more leases under my belt than prior years」，并指出「many long-term clients started as lease clients」（https://www.canadianmortgagetrends.com/2026/03/are-real-estate-agents-shifting-toward-rental-work-in-canada/）；Storeys：Springate-Renaud 说租赁「a good way to make connections with potential future buyers」（https://storeys.com/toronto-realtors-more-rental-transactions/）。
- **我们覆盖**：客户阶段到「已签约」即止；没有到期日；续约 90/60/30 只给房东。
- **建议**：客户表加 `lease_end_date`（经纪手填），到期前 90 / 30 天出任务「联系 <客户>：续约或换房」+ 预填对话；不发任何自动营销消息（由经纪自己发）。
- **门槛**：CASL——商业电子消息由经纪自己发，我们只提醒。工作量 S。

---

## 2. B2 对标 5 个经纪端工具（摘要在 `design/research/v1/agent/`）

| 产品 | 定价（2026-10-13 实读） | 核心 | 租赁专用流程 | 对我们的启示 |
|---|---|---|---|---|
| **Follow Up Boss** | Grow $69/用户/月（年付 $58）；Pro $499/月含 10 人；Platform $1,000/月含 30 人；电话加购 $39 | 线索接入 + 自动跟进序列（Action Plans）+ 通话短信 + AI 摘要 | 无 | 「N 天没联系就提醒」是经纪愿付 $69/月的核心；我们已有 `daysQuiet` 任务 |
| **Lofty**（原 Chime） | 不公布；第三方估 Agent ≈ $449/月、Team ≈ $700、设置费 $299–1,499；AI Sales Agent 加购 $60/月 | AI CRM + IDX 网站 + 线索投放 | 无 | 全靠 IDX，与硬约束①相反；不对标 |
| **kvCORE → BoldTrail** | 「doesn't publish a standard pricing page with fixed monthly tiers」；第三方估 $499+/月、onboarding ≈ $999 | 全栈（CRM / IDX / 营销 / BackOffice 另售） | 无 | 面向 10 人以上公司；单个租赁经纪「价值错配」 |
| **OREA 标准表单 / CREA WEBForms** | 会费内含；电子签 Authentisign 自动绑定（2013 年会员价 $39/年，现价未核实） | Form 400 要约、Form 410 申请表、代表协议、披露表、电子签、存档 | **是**（400 / 410 就是租赁专用） | 表单是版权件、只许会员用、软件加功能要许可——**我们不能做表单，只能做表单之外的事（核对、收件、筛查、记录）** |
| **liv.rent**（agents 页 404，读 pricing）/ **Zumper Rental Manager** | liv.rent：免费 / $48 / $399 月（年付），Business 档「for seasoned landlords and brokerages」；Zumper：每月 5 套免费 | liv.rent：Trust Score（Equifax）+ 数字租约 + 收租；Zumper：分发 + TransUnion SmartMove | 有（房东工具），无经纪专属 | 两家都「not a broker」，没有 TRESA 件（Information Guide / 代表协议 / 多重代表）——这是我们能做而它们没有的 |
| **ChatGPT（经纪常见用法）** | $20/月级别通用订阅（未实测） | NAR 2025：ChatGPT 58%，房源描述 75%、社媒 56%、邮件 52%、**填表 7%** | 无 | 经纪缺的不是聊天框，是「TRESA 不答错」与「能接到表」；REM 专栏实例：AI 把 TRESA 答错并附假引用 |

引语：Follow Up Boss「Everything agents and small teams need to get organized and engage with leads」（followupboss.com/pricing）；BoldTrail「doesn't publish a standard pricing page with fixed monthly tiers」（boldtrail.com/blog/blog-boldtrail-pricing/）；OREA「for use by OREA members and certain licensees only」（orea.com 条款）；CREA「available to REALTORS® as a part of your membership with CREA」（crea.ca）；liv.rent「Liv Strategies is not a broker and does not provide brokerage services」（liv.rent/terms）；Zumper「post up to 5 listings a month for free」（zumper.com/pro）。

**结论**：买卖侧 CRM 的定价锚是 $58–69/用户/月（FUB）到 $449+（Lofty / BoldTrail），全部建立在 MLS/IDX 数据与线索上；租赁侧没有一个「经纪专用」产品，只有房东工具卖给经纪公司。我们的位置只能是**「安省租赁经纪的合规与收件工作台」**：TRESA 件 + 申请收件 + 筛查 + 规则核对 + 客户跟进，不碰房源数据与表单本体。

---

## 3. B3 公开来源归纳的痛点（二手资料，代替访谈）

全部为二手：新闻、经纪公司页面、监管年报、供应商博客。reddit.com 对抓取返回 403，r/TorontoRealEstate 原帖未读到。

| # | 痛点 | 证据（来源） | 对应我们的功能 |
|---|---|---|---|
| 1 | **报酬低、活多**：租赁佣金约半个月到一个月租金（+HST），多数经纪不爱做 | Storeys：「most agents don't like to do leases -- they're a lot of work for a much smaller reward, typically a half-month's rent」（Springate-Renaud）；BREL：「The cost to hire the BREL team to represent you is one month's rent」，分一半给租客方经纪 | 每单省时间是唯一卖点；任何功能都要按「每周省多少分钟」算 |
| 2 | **租赁单量在涨**：2025 年 GTA 约 3 份租约对 1 份成交；个人经纪租赁占 30–40% | Canadian Mortgage Trends 2026-03（TRREB Q1 2024 condo 租约 +19.7% 至 12,541；「about 3 leases per 1 sale」）；Storeys：一家公司 Q1 从 14 份到 51 份 | 需求基数在，付费档有土壤 |
| 3 | **材料造假与核验负担**：假在职信、改过的工资单、假征信、假房东；经纪自建 checklist，用 SingleKey、看产权记录、看社媒 | Storeys（Menkes 175 份里 90 份不合格；Asnani）；Globe and Mail（每月至少 5 份假件）；CBC London | 取证 + 跨文档一致性 + 雇主注册库 + 法庭 / LTB——我们已经比 SingleKey 多做几层；**这是经纪最可能付费的一项** |
| 4 | **申请人中途掉线**：要材料没说为什么、回复慢、流程不透明 | Royal York PM 2026-02：「quiet delays that landlords interpret as indecision」，建议「a document checklist, a single upload method, and one stated review timeline」 | 经纪收件链接（1.6 建议）正是这三件 |
| 5 | **多重代表与自代表方**：租赁里同一经纪常代表两边；给自代表方意见是违规 | lowestrates.ca 引 RECO；RECO Bulletin 1.1（不得向自代表方提供意见）；Code of Ethics O. Reg. 365/22 s.10 | 多重代表字段（1.3）；带看准备包里「房东授权答什么」已有 |
| 6 | **AI 把合规答错**：经纪在群里贴 AI 的 TRESA 答案，附假引用，被律师纠正 | REM Ursino 2026-07-27：「AI is a genuinely great tool. It is also a sycophant.」 | 我们的事实包只允许引用给定条目（`AGENT_LEASING_FACTS`「只可引用下面这些」），每条带法条——这是差异点，要在营销里说清 |
| 7 | **投诉集中在「客户最佳利益」与「失实陈述」** | RECO 2024 年报：开立 1,528 件、结案 1,448 件；来源 76% 是消费者；类别 Best Interest of Client 16.6%、Unprofessional Conduct 15.4%、Misrepresentation 12.4%、Advertising – False and Misleading 8.0%；47% 行政处理、9% 进入纪律 / 起诉 | 「每一步留痕」（Information Guide / 代表协议 / 披露 / 消息只追加）对经纪是自保工具 |
| 8 | **公众看 MLS 有 48 小时延迟、竞争激烈**；租客方经纪少 | lowestrates.ca；Toronto 租客指南「TEMPORARILY UNABLE TO SERVICE TENANT CLIENTS」 | 没有数据，不做找房；租客侧价值在申请包，不在经纪 |
| 9 | **看房爽约**（美国数据 20–22%） | lethub.co 2026-06（供应商） | 不做日历；BrokerBay 已覆盖 |

**未找到**：每单工时的任何实测数字；安省经纪对 AI 的态度调查（REM：「Canada has no equivalent scorecard」）。这两项只有访谈能补。

---

## 4. B4 法规边界

### 4.1 平台能否为经纪生成要约 / 租约草稿

- **现状**：我们给房东的标准租约起草 + 电子签已上线；`trreb` 渲染器按 Form 400 结构；经纪都没有入口。
- **证据**：
  - 《法律协会法》s.1(6)：「Without limiting the generality of subsection (5), a person provides legal services if the person does any of the following: ... 2. Selects, drafts, completes or revises, on behalf of a person, i. a document that affects a person's interests in or rights to or in real or personal property」；s.1(8) 豁免：「1. A person who is acting in the normal course of carrying on a profession or occupation governed by another Act of the Legislature ... that regulates specifically the activities of persons engaged in that profession or occupation」「3. An individual who is acting on his or her own behalf」（ca.vlex.com 转载的现行文本；e-Laws 本站今日不可读）。罚则：角色方案 §3 记为 s.26.1 违者 $25,000 / $50,000（2026-09 读自 e-Laws；今日未能复核，LSO 页面只说「significant fines as well as probation orders」https://lso.ca/protecting-the-public/taking-action-against-illegal-practitioners）。
  - OREA 条款：表单「for use by OREA members and certain licensees only」；「Any other use or reproduction is prohibited except with the prior written consent of OREA」；软件加功能「requires written consent through the execution of a separate licence agreement」（https://orea.com/standard-forms-clauses/Terms-of-Use）。
  - 《标准租约》是政府表格，公开免费（ontario.ca/standardlease）。
- **建议**：① 标准租约：可以给经纪开「替房东客户填表」（经纪在 TRESA 规管职业的常规范围内，s.1(8) 1；房东本人签署，s.1(8) 3），平台只提供字段、固定条款库与无效条款提示，**不生成定制条款**；② Form 400：不做（版权 + 许可）；③ `trreb` 渲染器：改名去掉 Form 400 对照，或拿 OREA 许可后再对经纪开放；④ 要约只做「核对」不做「起草」。
- **门槛**：需律师确认 s.1(8) 1 对 TRESA 注册人填表的适用（文本读起来成立，未见 LSO 明文）；OREA 许可谈判。

### 4.2 平台能否代经纪发通知 / 发消息

- **现状**：经纪身份的 AI 一律不出待批卡，消息起草在回复里让经纪自己复制；委托确认邮件、线程通知邮件由系统发（内容是固定模板或经纪自己写的消息）。
- **证据**：TRESA s.1「trade」包括「any act, advertisement, conduct or negotiation, directly or indirectly, in furtherance of any disposition, acquisition, transaction, offer or attempt」；s.4(2)：未注册者不得「perform any of the functions of a brokerage, broker or salesperson」；s.4(1)(d)「trade in real estate unless registered under this Act」（Wayback 镜像的 e-Laws 文本）；RECO 对未注册助理的公告（本站 404，镜像 403，搜索摘要）：禁止「showing properties, or taking part in an offer or listing presentation」，「for any activity that does not fall under the definition of 'trade,' an assistant may be paid」。Bulletin 2.1：Information Guide 必须由经纪「provide and explain」。
- **建议**：平台可做的是**行政性传递**：按经纪的指令送出他写好的消息、固定模板的确认链接、提醒；**不可做**的是以 AI 代经纪与对方谈条款、呈递要约、替发 Information Guide 当作已履行。现行规则（经纪不出待批卡、不说「已完成」）保持；若将来给经纪开 `send_message` 执行器，正文须是经纪逐字确认的，不得由模型直接发给对方当事人。
- **门槛**：TRESA s.4 / s.1；若靠 s.5(1)(j)「solely for the purpose of arranging leases to which the Residential Tenancies Act, 2006 applies」豁免，Stayloop 全部活动必须只涉 RTA 租约（法规备忘录「Could not confirm」第一条，RECO 未表态）。

### 4.3 经纪付费档（$29 / $59，目前标「即将推出」）在 TRESA 下要披露什么

- **现状**：定价页经纪三档：起步 $0（RECO 徽章 + 目录 + AI 基础 + 「看房排程 + 现场记录（即将推出）」+ 不抽佣）、专业 $29（无限客户、AI 全功能、「RECO 合规工具 + 审计提醒」、自动跟进提醒）、团队 $59（多经纪协作、绩效面板、权限与审计、优先支持），后两档「尚未开售」。
- **证据与边界**：
  - **经纪付我们订阅费**：不是 TRESA s.30 的「brokerage ... pay any remuneration to a person ... to perform a function for which registration is required」——订阅买的是软件，不是按单报酬；也不是 O. Reg. 567/05 s.23.1 的「financial benefit that the registrant ... may receive from another person」（那是经纪**收到**的利益）。**只要我们不按成交收费、不给经纪返利，就没有 TRESA 披露义务。** 若将来「推荐一位经纪送一个月 Pro」这类返利出现，经纪对其客户有 s.23.1 披露义务（「a description of the financial benefit ... an estimate of the value」）。
  - **我们展示经纪 = 广告**：O. Reg. 567/05 s.12.1(1)「clearly and prominently disclose the name in which the registrant is registered」、(3)「clearly and prominently identifies the brokerage that employs the broker or salesperson」；RECO Bulletin 5.3 把第三方网站算广告，要求运营方能「process change requests promptly」（法规备忘录 §3）。付费档若带「个人页 / 更醒目展示」，页面上每处都要注册名 + 头衔 + 经纪公司名，REALTOR® 只给 CREA 会员。
  - **我们对经纪的宣传**：TRESA s.37 针对注册人；对我们适用的是《消费者保护法 2002》（平台自己卖给消费者的订阅）与一般广告法。「RECO 合规工具」「审计提醒」这类表述要能逐项对上真实功能，否则改词。
  - **经纪公司层面**：TRESA s.31(1) 经纪只能代表所属经纪公司交易；团队档若允许多位经纪共享客户，须按 Bulletin 2.2 / 2.5 的保密与指定代表要求——客户信息在经纪之间共享要客户书面同意（Bulletin 2.5：「Client information generally cannot be shared with a third party without written consent」，搜索摘要）。
- **建议**：付费档定义只列已存在或可确定性实现的功能（见 §5③）；页面删掉「看房排程 + 现场记录（即将推出）」（不做日历）；团队档在没有「组织成员」模型前不开售（C 线也记录了组织成员未做）。
- **门槛**：无新的法规门槛；CPA 2002 对订阅的退订 / 自动续费披露要有（Stripe 已处理房东档，经纪档同一路径）。

### 4.4 经纪用 AI 工具的 RECO 指引

- **现状**：2026-10-13 在 reco.on.ca 搜「artificial intelligence」「ChatGPT」「generative」，**没有**面向注册人的 AI 指引；只有考试作弊政策提到 AI，以及高管简介。
- **证据**：搜索结果仅 https://www.reco.on.ca/learners/examinations/exam-misconduct-policy/（「artificial intelligence during an exam」）；其他省有：BCFSA 2024-02 指引（持牌人对 AI 辅助工作全责、保密、核实、披露改图——律所转述 https://www.paxlaw.ca/?p=311342）；新西兰 REA Generative AI guidance：「an error made by a Gen AI tool will not be a defence」（https://www.rea.govt.nz/real-estate-professionals/generative-ai-guidance）。适用的是现有规则：Code of Ethics O. Reg. 365/22 s.5（准确、不误导）、TRESA s.37（广告不得「false, misleading or deceptive」）、RECO Bulletin 5.1（比较性 / 数量性宣称须可核实）。REM 2026-07 专栏给出的行业做法：「Verify compliance answers against primary sources or a knowledgeable human」。
- **建议**：我们的经纪 AI 继续只引用事实包并逐条带法条编号；在经纪工作台加一行固定说明「AI 回答只引用 RECO / TRESA / RTA 原文，合规问题以 RECO 公告与经纪公司 Broker of Record 为准」；AI 生成的房源文案标注（已对翻译标注，同样做法）。
- **门槛**：无；RECO 若日后出指引需跟进。

---

## 5. 汇总

### ① 工作流覆盖图

| 步骤 | 经纪现状（工具） | 我们覆盖 | 缺口 |
|---|---|---|---|
| 1 Information Guide | RECO PDF 邮件 / WhatsApp；WEBForms 确认表 | 日期列 + 任务 + 委托前置 | 无送达记录；无模板消息 |
| 2 书面代表协议 | OREA 表单 + Authentisign | 签署日期列；委托记录（不是协议） | 无到期日；无协议存档 |
| 3 多重代表披露 | OREA 披露表 | 事实包一句话 | 客户表无字段、无提醒 |
| 4 挂牌 / 找房 / 定价 | MLS + BrokerBay + Realtor.ca | 定价卡（CMHC / 统计局 + 5 套测试房源）；房东直租代发 | 无可比输入；无 MLS 号；不做找房 |
| 5 带看 | BrokerBay 约看 + 锁盒 | 带看准备包（对话一次性） | 准备包不落客户表；日历是样例 |
| 6 申请与筛查 | Form 410 + 邮件收件 + SingleKey + 人工 checklist | 经纪直接筛查 + 取证 + 法庭 / LTB + 委托共享 | 申请人没有直接收件入口（只能经纪代传） |
| 7 要约 Form 400 | WEBForms 填 400 + 本票押金入信托 | 事实包与引导卡讲清规则；`trreb` 渲染器（房东） | 不能做 400；缺「要约核对清单」 |
| 8 标准租约 | 政府表格 + 电子签 | 房东端起草 + 电子签 + 自动建在管租约 | 经纪无入口（`draft_lease` 已定义未实现） |
| 9 押金与交接 | 经纪公司信托账 + 纸质交接 | 入住清单（仅 household 成员） | 清单不能分享给客户（低优先） |
| 10 租期中 / 续约 | 经纪自己记 | 客户阶段止于「已签约」 | 无到期日 / 无续约提醒 |

### ② 缺口清单（按「经纪会不会为此付费 / 每周能省多少时间」排序）

| 序 | 缺口 → 功能 | 付费意愿依据 | 每周省时（估） | 工作量 | 门槛 |
|---|---|---|---|---|---|
| 1 | **经纪收件链接**（不挂房源的申请入口：材料上传 + 290/98 范围内的在线授权 → 直接进筛查，委托有效时房东客户同看） | 造假普遍、人工 checklist、SingleKey 付费（B3 #3）；掉线三要素（B3 #4） | 每份申请省 20–40 分钟（收件、追材料、比对）；按每周 3–5 份申请算 1–3 小时 | M | OHRC / 290/98 可问项（已遵守）；CRA 注册前 `CRA_MODE=tool`；PIPEDA 保留期与索取档案 |
| 2 | **要约 / 租约核对清单**（把经纪写好的要约要点贴进来，确定性标出押金 / 费用 / 无效条款 / 标准租约缺项） | 投诉类别 Misrepresentation 12.4%、Advertising 8.0%；RECO 2025-06 把填标准租约列为代表服务 | 每单 15–30 分钟 | S | 不起草、不复制 Form 400（OREA 条款；LSA s.1(6)） |
| 3 | **TRESA 件完整化**（代表协议到期日 + 协议存档 + 多重代表同意日期 + Information Guide 送达记录 / 模板消息） | 投诉首位「Best Interest of Client」16.6%；RECO Guide 打开 90 万次 | 每位新客户省 10 分钟；真正价值是出事时有记录 | S | 只记录不代替（Bulletin 2.1） |
| 4 | **替房东客户填标准租约**（委托 `draft_lease` 落地：经纪填、房东签） | RECO 2025-06「completing the standard Ontario lease agreement」是代表服务；NAR 填表需求 7% | 每单 30–60 分钟（经纪不用在 PDF 里手填再发邮件） | M | LSA s.1(8) 1 需律师确认；固定条款库、不生成定制条款 |
| 5 | **客户跟进提醒**（已有 `daysQuiet` 7 天任务 + 加 `lease_end_date` 到期前 90/30 天） | FUB $69/月的核心就是跟进序列（B2） | 每周 10–20 分钟；长期换来回头客（B3 #2、#10） | S | CASL：由经纪自己发 |
| 6 | **定价卡接经纪自填的 3 套可比** | 定价是代表服务（BREL「Pricing guidance based on recent comparable rentals」） | 每单 10 分钟 | S | 不读 MLS 数据；公开基准带来源句 |
| 7 | **带看准备包落客户表 + 阶段自动推进** | 多重代表 / 自代表方风险（B3 #5） | 每次带看 5 分钟 | S | 无 |
| 8 | **MLS 号字段**（记录 / 去重） | C 线 C4 交接需要 | — | S | 不显示 MLS® 标志 |
| 不做 | 带看日历、找房、Form 400 生成、押金、任何转介 / 分成 | BrokerBay 已含；无数据；OREA 许可；资金不经手；引擎冻结 | — | — | 硬约束 |

### ③ 经纪付费档功能定义草案（只列有证据支撑的）

**起步 $0**（现状保留，删「看房排程 + 现场记录（即将推出）」）：RECO 注册核验徽章 + 认证经纪目录；AI 助理（只引用事实包）；客户表（≤ 10 位活跃客户）含 TRESA 两个日期与任务；委托；直接筛查（走房东同一配额：每月 3 次）；消息与审计。

**专业 $29/月**（上线条件：缺口 1、2、3 完成）：
1. 无限客户 + 代表协议到期 / 多重代表 / Information Guide 送达记录（缺口 3）；
2. 经纪收件链接 + 申请人在线授权，材料直接进筛查（缺口 1）；
3. 筛查按房东 Pro 口径：不限次 + 深度核查（现有 `isProEntitled` 加经纪档位）；
4. 要约 / 租约核对清单（缺口 2）；
5. 客户跟进与租约到期提醒（缺口 5）；
6. 定价卡 + 自填可比（缺口 6）。
不写进去的：「RECO 合规工具」这类泛词改为上面的具体项；「AI 助理全功能」改为「AI 助理 + 事实包引用」。

**团队 $59/月**：**暂不开售**——需要组织成员模型（C 线记录未做）与客户信息跨经纪共享的书面同意流程（Bulletin 2.5）；在那之前定价页保留「尚未开售」但去掉具体功能清单，避免 CPA 2002 下的误导。

**定价依据**：买卖侧 CRM 锚点 $58–69/用户/月（FUB），租赁侧房东工具 $48/月（liv.rent Growth）；经纪每单净收约半个月租金（B3 #1），$29 相当于一单的 1–2%，按缺口 1 每份申请省 20–40 分钟算，一个月 10 份申请即回本。**$29 / $59 的数字本身没有调研支撑，是既定文案；是否调整由用户定。**

---

## 6. 需要用户拍板 / 律师确认

1. `trreb`「Form 400 structure」渲染器：改名去对照、还是去谈 OREA 许可、还是只留给房东。
2. 经纪替房东客户填标准租约是否依赖《法律协会法》s.1(8) 1——建议律师书面确认后再开。
3. 经纪付费档数字（$29 / $59）保留还是重定；团队档是否先下架。
4. 若希望用 s.5(1)(j) 豁免作为「平台可做行政性传递」的依据，Stayloop 的全部活动须只涉 RTA 租约（商业房源检索这类隐藏技能要重新审视）。

## 7. 来源清单

- RECO 2024 Annual Report（PDF）：https://www.reco.on.ca/wp-content/uploads/RECO-Annual-Report-2024.pdf
- RECO TRESA FAQ：https://www.reco.on.ca/agents-and-brokerages/tresa-explained/tresa-faqs
- RECO For the RECOrd 2025-06：https://www.reco.on.ca/news/for-the-record-brokerage-leadership-edition-june2025
- RECO 未注册助理公告（本站 404 / 镜像 403，搜索摘要）：https://www.reco.on.ca/registrars-bulletin/registeredunregistered-assistants-trading-in-real-estate/
- TRESA 2002（Wayback 镜像）：https://web.archive.org/web/2024/https://www.ontario.ca/laws/statute/02r30
- O. Reg. 567/05（Wayback 镜像）：https://web.archive.org/web/2025/https://www.ontario.ca/laws/regulation/050567
- Law Society Act s.1(5)–(8)（vLex 转载）：https://ca.vlex.com/vid/law-society-act-r-1027722544 ；LSO 执法页：https://lso.ca/protecting-the-public/taking-action-against-illegal-practitioners
- OREA 表单条款：https://orea.com/standard-forms-clauses/Terms-of-Use ；表单目录：https://www.orea.com/standard-forms-clauses ；TRESA 表单页：https://www.orea.com/advocacy/TRESA/TRESA-Standard-Forms
- CREA WEBForms：https://www.crea.ca/technology/crea-webforms/
- TRREB BrokerBay FAQ：https://trreb.ca/hlfiles/pdf/BrokerBay_FAQ.pdf
- Follow Up Boss：https://www.followupboss.com/pricing ；Lofty：https://lofty.com/pricing ；BoldTrail：https://boldtrail.com/blog/blog-boldtrail-pricing/ ；liv.rent：https://liv.rent/pricing ；Zumper：https://www.zumper.com/pro
- NAR 2025 技术调查：https://www.nar.realtor/newsroom/realtors-embrace-ai-digital-tools-to-enhance-client-service-nar-survey-finds
- REM Ursino 2026-07-27：https://realestatemagazine.ca/ursino-ai-will-agree-with-you-right-up-to-the-complaint/ ；2026-10-01：https://realestatemagazine.ca/ursino-ai-use-is-up-the-results-arent/
- Storeys 造假：https://storeys.com/rental-applications-toronto-fraudulent/ ；Storeys 租赁量：https://storeys.com/toronto-realtors-more-rental-transactions/
- Globe and Mail 租客造假：https://www.theglobeandmail.com/investing/personal-finance/household-finances/article-tenant-fraud-real-estate/
- CBC London：https://amp.cbc.ca/lite/story/1.7283647
- Canadian Mortgage Trends 2026-03：https://www.canadianmortgagetrends.com/2026/03/are-real-estate-agents-shifting-toward-rental-work-in-canada/
- BREL 房东服务：https://www.getwhatyouwant.ca/renting-with-brel ；租客指南：https://www.getwhatyouwant.ca/guide/renting-in-toronto-guide-for-tenants
- lowestrates.ca：https://lowestrates.ca/blog/should-you-use-real-estate-agent-help-you-rent-city-toronto
- Royal York PM 2026-02：https://royalyorkpropertymanagement.ca/news-article/why-qualified-tenants-drop-off-midapplication-in-ontario-and-how-it-extends-vacancy
- lethub.co（Form 410 说明 / no-show）：https://www.lethub.co/blog/ontario-rental-application ；https://lethub.co/blog/reduce-rental-showing-no-shows
- Bennett Jones 标准租约：https://www.bennettjones.com/Insights/Updates/2018/02/Hold-the-Legalese-Ontario-Has-a-New-Standard-Residential-Lease ；ontario.ca/standardlease
- BCFSA AI 指引（律所转述）：https://www.paxlaw.ca/?p=311342 ；NZ REA：https://www.rea.govt.nz/real-estate-professionals/generative-ai-guidance
