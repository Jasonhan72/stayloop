# Openroom · 租客侧公开页面调研

抓取日期：2026-10-13
面向市场：加拿大（接受全国各省的法庭 / 审裁处判令上传；重点是安省 LTB，Legal Research 的话题筛选全是安省 N4 / N8 / T2 / N12 / T5 / T6；2024-05-22 起不再接受安省 LTB 的申请表 L/N/T 表，只收判令）。
租客侧产品名：没有独立的租客产品名。租客能用的是 **Public Record Search**（查房东 / 查自己，免费）、**Legal Research**（看过往判令备庭，免费）、**Rental Debt Ledger**（租客拿到对房东的判令后可报告房东欠款，$188 一次性）、**Rent Rewards**（按时付租上报 Equifax + 商家优惠，只能由物业公司经 BureauEdge 给租客开通）、**Dispute Center / Consumer Statement**（对自己的记录提争议、加 200 字声明）。没有租客档案 / 申请包，没有 "Openroom Verified" 这个产品（站上只有 "Verified court record insights" / "Get verified rental history in minutes" 的说法）。

## 读过的 URL

成功读取（WebFetch）：
- https://www.openroom.ca/ （首页）
- https://openroom.ca/pricing/
- https://openroom.ca/tenant-screening/
- https://openroom.ca/legal-research/
- https://openroom.ca/rent-rewards/
- https://openroom.ca/rental-debt/
- https://openroom.ca/bureau-edge/
- https://openroom.ca/about/
- https://openroom.ca/terms/
- https://openroom.ca/privacy/
- https://openroom.ca/signup
- https://openroom.ca/upload
- https://openroom.ca/learn
- https://openroom.ca/learn/court-evidence-template （learn.openroom.ca/court-evidence-template 308 跳转到这里）
- https://openroom.tawk.help/ （帮助中心首页）
- https://openroom.tawk.help/category/start-here
- https://openroom.tawk.help/category/dispute-center
- https://openroom.tawk.help/category/openroom-rent-rewards-program
- https://openroom.tawk.help/category/openroom-rental-debt-ledger
- https://openroom.tawk.help/category/openroom-public-record-search-and-legal-research
- https://openroom.tawk.help/category/billing
- https://openroom.tawk.help/article/vision-behind-openroom
- https://openroom.tawk.help/article/how-to-use-public-record-search
- https://openroom.tawk.help/article/how-to-use-legal-research
- https://openroom.tawk.help/article/how-to-upload-a-court-order
- https://openroom.tawk.help/article/how-to-dispute-a-court-order
- https://openroom.tawk.help/article/court-order-is-not-me
- https://openroom.tawk.help/article/how-to-dispute-a-credit-building-record
- https://openroom.tawk.help/article/how-to-dispute-a-rental-debt
- https://openroom.tawk.help/article/pay-back-rental-debt-owing
- https://openroom.tawk.help/article/how-does-credit-building-with-rent-payments-work
- https://openroom.tawk.help/article/how-to-use-rental-debt-ledger
- https://openroom.tawk.help/article/openroom-equifax-partnership
- https://openroom.tawk.help/article/how-to-upgrade-to-openroom-plus
- https://openroom.tawk.help/article/consumer-statement
- https://openroom.tawk.help/article/confirm-identity-of-search

未能读取：
- https://openroomhq.notion.site/How-to-Use-9ec3063562bd4a109df0d6cf19534969 （Notion 页只返回 "Notion" 一词，内容需 JS 渲染；搜索摘要显示它写的是旧价 $88 + HST，与现行页面的 $188 不一致）
- openroom.ca/faq、help.openroom.ca：不存在，帮助中心实际在 openroom.tawk.help。
- 搜索「Openroom AI feature」没有任何相关结果。

## 九项

| 项目 | 结论 | 来源 / 原文短引 |
|---|---|---|
| 注册流程 | 邮箱 + 密码，或 Google / Facebook 登录；表单不分租客 / 房东身份，没有可见的验证步骤。所有搜索都要先有账号；Community 计划免费、不要信用卡。上传判令可以不登录（留邮箱即可）。 | signup: "Sign up with Google" / "Sign up with Facebook"；how-to-use-public-record-search: "All searchers must have an Openroom account before you can conduct research"；pricing: "No credit card required" |
| 申请包 / 租客档案 | **没有。** 没有租客申请包、租客档案或 "Openroom Verified" 身份。租客在 Openroom 上有的「档案」只是：① 公共记录里以自己名字出现的判令；② 被房东上报的 Rental Debt 记录（租客登录后在 "Rental Debt" 菜单看到并可争议）；③ 被物业公司开通 Rent Rewards 后的信用建设记录。Equifax 报告要租客自己去 Borrowell / Koho 拉。 | tenant-screening 页：没有任何租客侧申请包说法；openroom-equifax-partnership: "You can utilize services such as Borrowell or Koho to pull a free report." |
| 看房约定 | 页面未提及。 | — |
| 租约解释 | 页面未提及。只有博客 /learn 的法规文章（Bill 60 / Bill 97 修法、搬出前刮痕处理、卡尔加里看房红旗）。 | learn: "Bill 60: Key LTB Changes Take Effect Today, September 21" |
| 报修 | 页面未提及。 | — |
| 续约 / 退租 | 页面未提及。 | — |
| 争议 | **这是租客侧最完整的一块。** ① 判令本身：通过 Dispute Form（form.openroom.ca/dispute-record）提交姓名、邮箱、案号、错误说明、证据；原则是「判令是公开文件，只要是原件就不会撤下」，只在执法 / 法院要求、已确认且明显的错误并有修正令替换、重复、被篡改时才移除；改名字 / 地址 / 内容不准确的请求不受理，要去 LTB 申请修正（30 天内）。② 同名不是我："This is Not Me" 表单（openroom.ca/dashboard/issue/not-me）：拉 Equifax 报告、Persona 身份核验、可能要求电话 / 视频；「所有争议在提交后 10 天内查看」。③ Rental Debt 记录：登录后 "File a Dispute"，10 个工作日审，通知上报方后等 7 个工作日，无回复则按租客主张处理，实质性争议会暂停上报；无证据直接驳回。④ Rent Rewards 信用记录：邮件支持 + 证据，流程同上。⑤ 消费者声明：名字出现在记录里的任何人都可加一段 ≤200 字的声明，审核后随记录一起显示。 | how-to-dispute-a-court-order: "Court Orders are public documents and as long as it is the original documentation, it will not be taken down."；court-order-is-not-me: "All disputes are looked at within the first 10 days of submission."；how-to-dispute-a-rental-debt: "disputes made without supporting evidence will be rejected."；consumer-statement: "Anyone whose name appears in an Openroom listing may request to add a Consumer Statement." |
| 是否向租客收费（金额） | **查询与备庭免费；只有主动上报欠款才收费。** Community 计划 $0（每次搜索最多 10 条结果）；Plus $10/月（最多 100 条、电话支持、SingleKey 筛查报告 9 折等）；Rental Debt Ledger 每案 $188 一次性（租客拿到对房东的判令也能用，帮助中心文写 "$188.00 + HST"）；Rent Rewards 对租客是否收费「取决于物业公司，有的免费，有的收少量月费 / 年费」。争议、消费者声明、上传判令、证据模板都免费。 | pricing: "Seriously, it's free!"、"Monthly subscription, cancel anytime"、"No recurring charges, keep it simple"；how-to-use-rental-debt-ledger: "$188.00 + HST per Rental Debt Ledger application"；rent-rewards: 费用由物业公司定 |
| 是否有 AI 功能 | **没有面向租客的 AI 功能。** 唯一提到的自动化是 "Nika Bot"：对上传的判令「先做一遍真实性评估」并抽取字段，帮助中心承认它「有时会出错」，用户可用红色按钮报错。Legal Research 页的 "Trend analysis" 没说是不是 AI。首页、产品页、关于页都没有 AI 字样。 | how-to-use-legal-research: Nika Bot "first pass to assess authenticity"、"sometimes makes mistakes" |

补充事实：
- **监管身份**：tenant-screening 页写 Openroom 在安省持消费者报告机构牌照（"licensed as a Consumer Reporting Agency in Ontario"）；与 Equifax 2023-08 签 Data Furnisher 协议、2024-08 上线。
- **对租客有利的规则**：按名字搜索时只显示「租客被判有过错或欠租」的结果，租客胜诉的案子不在名字搜索里出现（about 页："If a tenant wins a case, their name isn't searchable"）；筛查库只保留 7 年；Rental Debt 上报 Equifax 6 年（从判令日起）；Rent Rewards 里「迟几天不算逾期」，欠满一个月租金且超过 30 天才算 delinquent。
- **Rent Rewards 不能自己报名**："Residents cannot enroll themselves in Rent Rewards."，也不能自己退出："You may not opt out directly by contacting Openroom."，都要经物业公司；上报内容是地址、租期、姓名、邮箱、生日、租金 / 水电 / NSF 费的应付与已付、逾期金额，每月 15 日报到 Equifax。
- **BureauEdge** 是给 30–5,000 套单位的物业公司的年费产品（按单位数报价），租客侧只是「用物业公司品牌登录看自己的租史、付款状态、可用优惠」。

## 读到的页面文字摘要

**https://www.openroom.ca/**
首页主要面向房东和物业公司，但有租客段落「每次付房租都在建信用」：租客可以在签约前研究房东、通过按时付租建信用、查看自己的已核实租史。产品导航：Screen tenants（/tenant-screening/）、Report rental debt（/rental-debt/）、Reward great tenants（/rent-rewards/）、BureauEdge、Legal Research；Equifax 列为信用局数据伙伴。Rental Debt Reporting 对租客的说法是「拿到判令后让房东负责」。没有租客定价、没有 AI。帮助中心链接是 openroom.tawk.help。

**https://openroom.ca/pricing/**
三档：Community $0（「真的免费」，每次搜索 10 条结果，邮件支持）、Plus $10/月（100 条，邮件或电话支持，随时取消）、BureauEdge 按单位数年费（30 套起，只给物业公司；含居民信用建设和商家优惠，没写居民价格）。Tenant Screening 与 Legal Research 都标 $0、不要信用卡；Rental Debt Ledger Filing 任何计划都是 $188 一次性每案，租客可用来上报房东依判令欠自己的钱。

**https://openroom.ca/tenant-screening/**
房东按姓名、地址、生日搜索，结果显示争议细节和结果；名字搜索只显示「租客被判有过错或欠租」的判令，租客胜诉的隐藏；库里只有过去 7 年的记录，全部来自审裁处决定或法院判令，交叉核对官方来源、拒收伪造或涂黑件。租客可以提交证据和更正来挑战记录。页面写 Openroom 在安省持消费者报告机构牌照；搜索公共记录库免费。没有租客申请包、没有租客费用、没有 AI、没有 "Openroom Verified"。

**https://openroom.ca/legal-research/**
判令数据库，可按裁决人、房东、案件类型（欠租、维修等）、地点、日期筛选；记录从 2012 年起，覆盖按省和案件类型不同；每天新增并审核。「只用于研究与趋势分析」，不能按租客名字搜；所有案子不论胜败都公开，目的是教育。没有价格（链到 pricing），没有 AI 说明。

**https://openroom.ca/rent-rewards/**
租客不能自己报名，必须物业公司参与并取得书面同意（或租约附加条款），然后收到登录邀请。按时付租每月上报信用局（以 Equifax 为例），在信用报告上形成 Tradeline；迟付 / 漏付也可能被上报。费用由物业公司决定，有的免费、有的收少量月费或年费。优惠来自 Rewards Network（购物、餐饮、旅行、健身、流媒体）。退出也要经物业公司通知 Openroom。

**https://openroom.ca/rental-debt/**
「房东和租客都能用 Rental Debt Ledger」：任何持有效判令的一方都可上报（欠租、损坏、扣押金）；租客赢了恶意驱逐案就是债权人。每案一次性 $188，上报 Equifax 六年（从判令签发日起），三件以上可邮件问批量价。每月 15 日把全部未付余额发给 Equifax，按判令利率或政府利率计息，债务人每月收到余额邮件；Openroom 只报告不催收。债权人收到还款 72 小时内不记录，债务人可邮件 hello@openroom.ca 争议。

**https://openroom.ca/bureau-edge/**
物业公司产品：租金形成持续信用 Tradeline、每月上报各大信用局，居民须同意（提供租约附加条款模板）；严重欠款可加 collections 记录，最长显示 6 年、坏账情形不需同意；数百项居民优惠；仪表盘显示租史、付款状态、优惠，自定义域名让「居民登录时看到你的品牌」。年费按单位数，30–5,000 套，报价制；没写居民费用，没有 AI。

**https://openroom.ca/about/**
愿景是「透明、互联的租房生态」；服务全国的判令提交；2024-05-22 起不再接受安省 LTB 申请表，只收判令（含审裁处决定）。租客可以上传自己经历不公后拿到的判令、被鼓励维护权利；租客胜诉后名字不可搜；任何人可通过 Record Dispute Form 挑战记录，但判令通常保持公开；Community 计划的搜索与上传目前免费。

**https://openroom.ca/terms/**
部分产品免费；订阅按月自动续，取消在下一个续费日生效；预付费不退、服务中断不保证退款。争议裁定「可能不完整、不准确或不是最新」；用户对自己提交的内容负责；Openroom 有权但无义务审查用户间争议；可随时联系 hello@openroom.ca 撤回同意。条款里没有 Rent Rewards 或信用上报同意的专门条文，也没有用户发起的删除流程。

**https://openroom.ca/privacy/**
通用隐私政策：登录后可访问、更新、更改自己提供的个人信息；「可能有权访问、更新、纠正不准确之处并撤回同意」；未经同意不向第三方披露；保留期「以完成所述目的所需为限」。没提消费者报告机构身份、7 年期限、信用上报同意或争议流程。

**https://openroom.ca/signup**
Google / Facebook 一键注册，或邮箱 + 密码 + 确认密码；没有租客 / 房东选择，没有验证步骤，没有价格；标语「为租客和住房提供者做出明智决定而建」。

**https://openroom.ca/upload**
上传判令表单：选省份、留邮箱、拖入 PDF、勾选「这些是真实的法庭或审裁处判令」并同意条款；判令「发布前会审核」、「审核处理后才进入筛查工具」，通常几个工作日；没写谁可以上传。

**https://openroom.ca/learn**
博客列表：搬出前处理刮痕、卡尔加里看房红旗、Bill 60 LTB 变化（9 月 21 日生效）、Bill 60 / 97 对 RTA 的修订、2026 年 LTB 数据显示安省 2.04 亿未付租金；另链证据准备模板和 Rent Rewards。没有租客权利专题或争议指南，没有 AI。

**https://openroom.ca/learn/court-evidence-template**
免费的「证据包准备模板」，对象是租客、住房提供者、房东、物业经理、律师助理，以安省为背景但「适用于全加拿大甚至美国」；留邮箱后发到收件箱。原则是「让读者看得简单」、站在法官角度；用于准备送交法庭和送达对方的证据；声明不是法律意见。

**https://openroom.tawk.help/**（帮助中心首页）
六个分类：Start Here（3 篇）、Rental Debt Ledger（12 篇，把判令里的未付租金报到信用局、影响租客的 collections 记录）、Public Record Search and Legal Research（9 篇）、Rent Rewards Program（5 篇，物业公司把租客按时付租报到 Equifax + 优惠）、Billing（2 篇）、Dispute Center（4 篇）。没有租客档案、定价、verified、删除记录之类的分类。

**https://openroom.tawk.help/category/start-here**
三篇：Openroom 的愿景、招聘、「如何使用公共记录搜索 - 租客筛查」。没有注册、免费计划、租客能做什么的说明。

**https://openroom.tawk.help/category/dispute-center**
四篇：如何争议 Rental Debt、如何争议 Rent Rewards 信用记录、如何争议判令、「判令上有我的名字但不是我」。

**https://openroom.tawk.help/category/openroom-rent-rewards-program**
五篇：争议信用记录、什么是消费者信用报告、按时付租建信用怎么运作、如何向 Equifax Canada / TransUnion Canada 拿报告。分类说明：物业公司把租客按时付租报到 Equifax，租客获得加拿大商家的专属优惠。

**https://openroom.tawk.help/category/openroom-rental-debt-ledger**
十篇：如何使用、记录还款、与信用局核验、Equifax 合作、争议、偿还、计算欠款、更新搬出日期、债务人破产 / 消费者提案。分类说明：把判令里的未付租金直接报到信用局，影响租客的 collections 记录。

**https://openroom.tawk.help/category/openroom-public-record-search-and-legal-research**
九篇：使用 Legal Research、上传判令、争议判令、拿 Equifax / TransUnion 报告、不是我、确认被搜索者身份、使用公共记录搜索、撰写消费者声明。

**https://openroom.tawk.help/category/billing**
两篇：取消 Openroom Plus 订阅、升级到 Openroom Plus。没有价格明细。

**https://openroom.tawk.help/article/vision-behind-openroom**
使命「让人对自己的行为负责」；希望小房东有信心把空置单位重新放回市场并合规经营、善待租客；租客应被赋能维护权利；2023 年判令搜索引擎有 10 万访客、200 万次搜索。没提消费者报告机构牌照。

**https://openroom.tawk.help/article/how-to-use-public-record-search**
所有搜索者都要先注册（免费）；用途是租客筛查、背景核查、欺诈调查，其他用途要先联系 Openroom；必填名 + 姓，可选中间名、生日、地址史；建议按政府证件上的准确姓名地址搜。结果分 Strong match（名字 + 另一属性匹配，「高度可能相关」）和 Weak match（只有名字或只有地址匹配，可能不是同一人，建议拉 Equifax 报告核对）。没写租客能否搜房东。

**https://openroom.tawk.help/article/how-to-use-legal-research**
用途是「为下一次庭审做准备」；可按房东、裁决人、法律代表、最低欠租额、日期搜索；查未来房东时建议搜房东名、物业经理名、相关公司名；每条记录有当事人、庭审细节、判令细节和原件 PDF。安省 LTB 话题筛选：租客 / 房东发起、N4、N8、T2、N12、T5、T6。免费账号即可，Community 每次 10 条、Plus 100 条。提到 "Nika Bot" 对上传件做第一遍真实性评估并抽取字段，「有时会出错」，可按红色按钮报错。

**https://openroom.tawk.help/article/how-to-upload-a-court-order**
Community / Plus 用户都能上传，可匿名（留邮箱）或登录上传；只收住宅租赁事务的审裁处决定、分区法院 / 高等法院判令、小额法庭执行令；拒收申请表 / 通知（安省 L、N、T 表）、缺页、涂黑件；拒收会邮件通知。没写审核时长。

**https://openroom.tawk.help/article/how-to-dispute-a-court-order**
通过 Dispute Form 提交姓名、邮箱、案号、错误说明和支持文件。Openroom 原则上不删除判令；只在执法 / 法院要求、已确认且明显的错误并有修正令替换、重复、被篡改非原件时删除。隐藏姓名 / 地址或因内容不准确要求删除都不受理，不准确要由审裁处或法院修正（LTB 修正申请在判令发出 30 天内，可申请延期）。「只要是原件就不会撤下」，当事人也不能要求撤下。

**https://openroom.tawk.help/article/court-order-is-not-me**
同名争议：先邮件询问，Openroom 判断是否需要进一步调查；需要的话拉一份免费 Equifax 报告、记下出现该记录的搜索 URL、登录后用 "This is Not Me" 表单（四步：个人信息、Persona 身份核验、Equifax 报告、补充说明）；可能要求电话 / 视频或 TransUnion 报告。「所有争议在提交后 10 天内查看」，隐私问题 5 个工作日回复。有同名时搜索必须带生日或地址，否则不显示结果。

**https://openroom.tawk.help/article/how-to-dispute-a-credit-building-record**
只有已加入 Rent Rewards 的租客能争议：登录 → Rent Rewards 菜单找到记录 → 邮件支持说明错在哪并附证据（无证据驳回）→ Openroom 对实质性争议暂停上报、联系物业公司等 7 个工作日 → 无回复按租客主张处理，有回复则审双方证据。目标 10 个工作日内审完，3 天没回音可催。

**https://openroom.tawk.help/article/how-to-dispute-a-rental-debt**
被上报欠租的租客（Community / Plus 均可）：注册登录 → 左侧 Rental Debt → 按地址找到记录 → "File a Dispute" → 填表附证据或解释。10 个工作日内审，联系上报方等 7 个工作日，无回复按租客主张处理；双方都有证据时审完再决定是否暂停文件；无证据直接驳回；10 天没消息可邮件确认收到。文章没有提到 14 天窗口（14 天出现在房东侧「如何使用 Rental Debt Ledger」里：租客有 14 天在仪表盘争议）。

**https://openroom.tawk.help/article/pay-back-rental-debt-owing**
租客直接付给房东，「Openroom 不经手你和房东之间的任何钱」；建议 e-transfer 留记录，也接受支票影像、现金收据、银行流水。房东在系统里标记已付；72 小时内没更新租客可找 Openroom，Openroom 联系房东，5 天无回应则在核实付款后代为更新。没写付清后记录的状态名或是否移除。

**https://openroom.tawk.help/article/how-does-credit-building-with-rent-payments-work**
租客通过 Openroom 的 opt-in 邮件或租约附加条款给同意；物业公司每月更新同意名单，只上报有同意的租约。上报内容：物业地址、起租日、姓名、邮箱、生日；租金 / 水电 / NSF 费的应收、已收、逾期和最后付款日，打包成 "Credit Bill" 每月 15 日发给 Equifax（数据截至 7 日）。迟几天不影响信用，欠满一个月租金且超过 30 天才算 delinquent；状态示例「0-30 delinquent (good)」「30-60 delinquent (bad)」。没写租客费用。

**https://openroom.tawk.help/article/how-to-use-rental-debt-ledger**
「每份 Rental Debt Ledger 申请 $188.00 + HST」，一次性、「绝对没有月费」。文章主体写给房东（要求是判令里的房东或其雇员、安省 LTB 五年内的欠租判令、仍欠款、有租客生日和邮箱），但「谁能用」一节也提到「被房东声称欠租的租客」。步骤：上传判令、填租客、搬出日、已还款、附件、身份核验、债务人联系方式、付费；租客有 14 天在仪表盘争议（须附证据，Openroom 会通知上报方先解决）；每月 15 日更新余额报 Equifax，利息自动累计。

**https://openroom.tawk.help/article/openroom-equifax-partnership**
Openroom 是 Equifax 的数据提供方（2023-08 签约、2024-08 上线），提供「租客欠住房提供者的债务」，力求「事实、经核实、完整」；Openroom 不从 Equifax 拉报告，租客可用 Borrowell 或 Koho 免费拉自己的报告。没写租客同意或事前通知。

**https://openroom.tawk.help/article/how-to-upgrade-to-openroom-plus**
Plus $10/月：每次搜索最多 100 条、活动 / 折扣优先、优先邮件支持、联合创始人通讯、SingleKey 合作优惠（筛查报告 9 折、Rent Guarantee 首月免费）。定位「Openroom 爱好者和重度用户」，没说是否针对租客。

**https://openroom.tawk.help/article/consumer-statement**
「名字出现在 Openroom 记录里的任何人」都可以申请加一段最多 200 字的书面回应，团队审核后随记录显示在搜索结果里；通过网站表单提交，处理后通知；没写费用。

**https://openroom.tawk.help/article/confirm-identity-of-search**
搜索必填姓名，可选生日和地址；Hard Match = 名字 + 另一属性匹配，Soft Match「没有 100% 保证」要再核实；系统会在需要时要求再给一个参数。建议在申请人同意下拉 Equifax / TransUnion 报告（经 SingleKey 约 $25–40 加元），比对过往地址：有地址重合「很可能是同一人」，没有就「谨慎处理」；至少拉 Equifax，因为那里可能有 Openroom 的 Rental Debt / Rent Rewards 记录。
