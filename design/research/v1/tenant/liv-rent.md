# liv.rent · 租客侧公开页面调研

抓取日期：2026-10-13

面向市场：加拿大（运营方 Liv Strategies Inc.，温哥华；租约模板只有 BC 与安省；房源集中在温哥华、多伦多、卡尔加里、埃德蒙顿、蒙特利尔、温尼伯）。条款分「加拿大用户」与「美国用户」两套（美国用户适用华盛顿州法律），站上有西雅图城市页但显示「0 Rentals Found」——美国只是预留，不是实际市场。
租客侧产品名（页面上实际使用的）：**Renter Resume**（也叫 Renter Profile，一次填写、多处申请）、**Trust Score**（0–100 分租客评分）、**Verified**（验证徽章：房东 / 房源 / 租客三方都验）、**Digital Contracts**（BC / 安省标准租约数字签署）、**Rent Payments**（信用卡 / UnionPay / 比特币）、**Chat timeline**（对话即记录）、**AI Smart Filters** 与 **Listing Alerts**。任务里提到的「Liv Verified」「Liv Lease」两个名字在读到的页面上**没有出现**，对应的就是上面的 Verified 与 Digital Contracts。

## 读过的 URL

成功（WebFetch）：
- https://liv.rent/
- https://liv.rent/pricing
- https://liv.rent/faq
- https://liv.rent/terms （分两段读完，共 116k 字符）
- https://liv.rent/en/features
- https://renters.liv.rent/verified/
- https://renters.liv.rent/automation/
- https://renters.liv.rent/bitcoin/
- https://liv.rent/blog/livrent/trust-score-explained/ （2019-10-09 发布，2024-07-10 更新）
- https://liv.rent/blog/livrent/how-to-become-verified/ （2020-06-26 发布，2025-10-21 更新）
- https://liv.rent/guides/safety-security/verified-listings/how-liv-rent-verifies-landlords-and-listings
- https://liv.rent/guides/renters
- https://liv.rent/guides/renters/signing-a-lease/digital-lease-signing-guide-for-renters
- https://liv.rent/guides/renters/applying-for-a-rental/what-documents-do-you-need-to-rent-an-apartment
- https://liv.rent/blog/2021/07/liv-rent-user-guide-for-renters/ （2021-07-27 发布，2023-08-24 更新）
- https://liv.rent/blog/landlords/first-time-landlord-best-rental-platform-in-canada-guide/ （2026-06-02 发布，2026-07-10 更新）
- https://liv.rent/blog/renters/liv-rent-vs-rentseeker-matched-verified-compared/ （2026-09-16）
- https://landlords.liv.rent/leases/

未能读取：
- https://help.liv.rent/ —— getaddrinfo ENOTFOUND（不存在该子域；帮助内容在 liv.rent/faq 与 liv.rent/guides）
- https://apps.apple.com/ca/app/liv-rent-apartments-for-rent/id1368806220 —— HTTP 404（App Store 链接猜错，未再找）
- 「Trust Score 报告 $16.99」这个数字只出现在搜索引擎对 liv.rent 博客的摘要里（标注 2026-09），直接读到的定价页与 Trust Score 文章都**没有**写具体金额，下面按「未直接核实」标注

## 九项记录

| 项目 | 发现 | 来源 / 原文短引 |
|---|---|---|
| 注册流程 | 浏览不用账号。注册填姓名、邮箱、密码；**手机号必填并短信验证**（理由是防骗子）；验证身份 = 选证件签发国 → 选证件类型 → 用相机拍正反面 → 自拍并左右转头 → 完成，证件验证后删除。身份验证不是完成档案的前提，但**申请房源前**必须上传收入与工作证明（工资单、银行流水、税单、在职信）。有「我是首次租房」「我不住在加拿大」两个选项解释缺失的加拿大信用史 / 房东推荐。 | /faq：“reduce the number of scam users”；/blog how-to-become-verified：“Use your camera” … “You're done!”；/blog 2021 guide：“I'm a first-time renter” |
| 申请包 / 租客档案 | **Renter Resume**：一份档案就是申请表，填一次可投多个房源；只有**身份已验证的房东**能看到。申请动作：点「Apply Now」→ 选入住日期 → 核对 resume → 接受条款 → 提交。**Trust Score** 0–100：Equifax 信用摘要 55 分、风险评估 20 分、「可信度」（核对 LinkedIn / 证件 / 推荐人）20 分、收入租金比 5 分；四档 90–100 优 / 75–89 良 / 60–74 中 / 0–59 差；还会扫公开文件找法庭记录。房东点「Unlock Trust Score」用额度或付费解锁；房东看不到证件和完整 Equifax 报告；SIN 可选且不保存；解锁会产生一次信用查询「可能轻微影响」租客分数。租客用 Trust Score 不花钱。 | /blog 2021 guide：“Tap Apply Now … choose a move-in date”；/faq：“complete your profile, finish verification, and upload financial documents”；/blog trust-score：“an intelligent rating system designed to establish a renter's reliability” |
| 看房约定 | 房源可带视频看房（video tours），租客据此决定要不要约线下看；2026-09 的对比文说租客流程包含「booking viewings」，但读到的页面没有预约工具的具体说明。FAQ 讲的是入住后房东进屋规则（BC：提前 24 小时书面通知，8 点至 21 点）。 | /blog rentseeker 对比：“booking viewings, signing a digital lease, and paying rent”；/faq：“at least 24 hours in advance” |
| 租约解释 | 数字租约基于 **BC 标准租约或安省标准租约**预填，房东从申请或仪表盘创建，可加附加条款（liv.rent 模板 / 公司模板 / 一次性自定义），通过聊天发给租客，租客先签、房东后签；每份合同有唯一 ID 可在 verify.liv.rent 核验；签完存在账号里。租客指南列出签前要核对的项（租金、日期、水电、房东姓名、涨租 / 宠物 / 转租 / 提前解约条款）和「不对就先书面要求更正」。liv.rent 声明「不是任何租约的一方」。没有逐条解释租约条款的功能。 | /guides digital-lease-signing：“A digital lease is a binding contract the moment both parties have signed”；/faq：“is not a party to any tenancy agreement”；landlords.liv.rent/leases：“Ontario Tenancy Agreement or BC Standardized Tenancy Agreement” |
| 报修 | **没有租客报修工具**。FAQ 只讲法律常识（BC）：书面向房东报修、紧急维修至少打两次紧急电话、无回应可自行安排合理费用并凭收据报销、自己 / 访客 / 宠物造成的损坏自付、铲雪责任看物业类型。2026 房东指南的对比表把 liv.rent 维修功能列为「Basic tracking」。 | /faq：“Report issues to them in writing”；/blog first-time-landlord：“Basic tracking” |
| 续约 / 退租 | 平台支持 BC 与安省租约的「签署与续约」（renew）；租约到期默认转月租，续约是可选的。退租（FAQ，按 BC 法）：押金最多半个月租金、书面提供转寄地址、清洁、搬空、做退房检查，房东 15 天内退押金；提前解约要书面通知并签《共同结束租约协议》，可能承担重新出租成本，或申请转租 / 转让。Growth 档以上有「lease protection addendums」。 | /blog 2021 guide：“review, sign, send, and renew leases … in B.C. and Ontario”；/faq：“no more than half of one month's rent” |
| 争议 | 平台**不介入**：条款写对用户之间的争议「没有义务提供协助」，租约下的付款争议「属于双方之间」。FAQ 指向 BC 的 Residential Tenancy Branch 申请争议解决；向租客转租的室友不受 RTA 保护，走小额法庭；疑似诈骗写信 support@liv.rent，**聊天记录可作为凭证**。与 liv.rent 自身的争议：温哥华国际仲裁中心强制仲裁（30 天内可书面退出）、集体诉讼弃权。 | /terms 4.2(a)：“under no obligation to provide any assistance”；/faq：“Your chat timeline serves as a record” |
| 是否向租客收费 | **核心功能对租客免费**：搜索、聊天、Renter Resume、验证、Trust Score、视频看房、数字租约都免费（FAQ 原话「Using liv.rent is free」）。租客要付的只有**付款手续费**：信用卡走 Stripe 标准费率；UnionPay 2.5%；比特币 0.5% 不退 + 网络费；不当拒付可能被收 chargeback 费；汇率转换费由银行收。Trust Score 报告由**房东**付（搜索摘要称 $16.99/份，未直接核实）或用套餐额度。房东套餐：Essentials $0（2 套房源）、Growth $48/月年付或 $56 月付（15 套、每月 2 份筛查）、Business $399/月年付或 $490 月付（150 套、每月 15 份）；页面没写货币，推定加元。 | /faq：“UnionPay incurs a 2.5% processing fee” … “Bitcoin incurs a 0.5% non-refundable fee”；/pricing：“No credit card required”；/terms 16.1：“$10.00 CAD if you used the services for free” |
| 是否有 AI 功能 | **有，但都是轻量的**：① 首页「AI Smart Filters」——「AI-powered filtering and recommendations help match you to rentals that fit your needs」；房东指南说 AI 筛选与房源提醒「自动把已验证的租客匹配到相关房源」；② Trust Score 用「AI and a powerful algorithm」核对申请人身份、收入、工作（对照 LinkedIn 等）；③ 租客指南泛称平台用「automation, AI, and integrated technology」。没有 AI 对话、没有 AI 代办、没有 AI 解读租约或报修分诊。 | /（首页）：“AI-powered filtering and recommendations help match you”；/faq：“AI and a powerful algorithm” |

## 读到的页面文字摘要

**https://liv.rent/** —— 加拿大房源市场首页，自称「North America's Safest Rental Platform」。给租客的卖点：「Search listings from trusted landlords we've verified through photo ID checks」的已验证房源、AI Smart Filters（AI 筛选与推荐）、新房源提醒、带家具 / 允许宠物 / 降价筛选、按城市或「附近」搜索。租客菜单：Browse Listings、Verified Listings、Automation、Bitcoin Payments、Renter Resources。页脚有 FAQ、Pricing、Terms、Privacy、support@liv.rent。内容全是加拿大城市（安省为主），语言区选「Canada (EN)」。没提 Trust Score、申请、租金、租约。

**https://liv.rent/pricing** —— 三档房东套餐：Essentials $0（最多 2 套、标准数字合同、信用卡 / UnionPay / 比特币收租、1 个席位、筛查「按次付费」）；Growth $48/月年付、$56 月付（15 套、每月 2 份筛查报告、含 lease protection addendums、3 个用户、无限自动回复）；Business $399/月年付、$490 月付（150 套、每月 15 份报告、自定义合同、10 个用户、优先支持、月度分析报告加购未标价）。「Contract ID and verification」各档都有。脚注：数字收租「可能收取 payout fee」，金额见 FAQ。租客侧没有任何价格条目。PAD 自动扣款标「Coming Soon」。

**https://liv.rent/faq** —— 覆盖最全的一页。注册：手机号必填并短信验证，防骗。申请：填 Renter Resume（姓名、生日、邮箱、电话、语言），一份投多处。验证：房源与房东经政府证件、地契或营业执照人工核验，带勾选徽章；租客也要验证，进 Trust Score。Trust Score：信用报告 + LinkedIn / 推荐人 / 财务记录，不等于 Equifax 分；SIN 可选不保存；生成后销毁个人信息；分低就补齐档案、完成验证、传工资单税单。看房 / 房东进屋：24 小时书面通知、8–21 点。租约：数字签署，基于 BC 标准租约；liv.rent 不是租约一方；提前解约流程。租金：Visa / Mastercard / Amex / UnionPay / 比特币，付款请求出现在聊天时间线；卡走 Stripe 标准费、UnionPay 2.5%、比特币 0.5% + 网络费；多付找房东退，错付联系房东；迟付可能收到 10 天通知，5 天内付清即撤销。维修：书面报修、紧急维修两次致电无果可自行处理报销。退租：押金半月上限、15 天退还、退房检查。争议：RTB；室友走小额法庭；诈骗联系 support@、聊天记录即凭证。费用：「Using liv.rent is free」。AI：Trust Score 用「AI and a powerful algorithm」。

**https://liv.rent/terms** —— Liv Strategies 的服务条款。4.2(a)：不是房源讨论或租约的一方，双方直接缔约，对用户间争议无协助义务；4.8(a)：不是租约的见证人或一方；4.9(a)：法币付款由第三方处理商按其条款处理；4.10：比特币收租可能收「service fee」且不退；4.11：付款争议属双方之间；4.12(c)：选用筛查即授权获取信用报告；5.2：不是经纪；8.2：套餐与收租手续费公布在 FAQ，改价提前 14 天；8.5：不当拒付收 chargeback 费；16.1：赔偿上限为前三个月所付费用或免费用户 $10 加元；17：加拿大用户适用 BC 法，美国用户适用华盛顿州法；18：与 liv.rent 的争议在温哥华国际仲裁中心仲裁、保密、不可上诉，30 天内可书面退出，集体诉讼与陪审团弃权。

**https://liv.rent/en/features** —— 「Canada's safest rental website」。租客：从「经我们严格验证流程核验的」房源与房东中搜索；「Complete your Renter Profile once and apply to multiple listings with just a few clicks」；集中收件箱里「chat, apply, and sign」；付款方式信用卡 / UnionPay / 比特币 / PAD（即将）。房东：Post a Listing、Tenant Screening、Verify Contract、Book a Demo。没提 Trust Score、看房、维修、AI。

**https://renters.liv.rent/verified/** —— 实际写的是房东与房源怎么被验证，标题「Here's how we protect renters」：注册时手机号过运营商核验、邮箱确认链接；房东提交政府证件并由人工与自拍比对；经纪 / 物业公司须出示执照；房源用地契或物业税单证明，或寄到物业地址的明信片验证码；未验证房源标「Not Verified」；被举报房源在房东提供产权证明前暂停；数据加密、「never sell your data」。没写租客自己的验证步骤和费用。

**https://renters.liv.rent/automation/** —— 「自动化」指的是：一份租客档案复用（「Complete your renter profile once and apply to multiple listings in just a few clicks」）、在线接收并电子签署标准租约、聊天与「applications, contracts & payments」记录都存在平台。没有自动投递、自动回复或 AI；有「Sign Up For Free」按钮，没写价格。

**https://renters.liv.rent/bitcoin/** —— 租客可用比特币付下月租金：走「our Coinbase API」或自选钱包；比特币转给房东后以加元存入房东银行账户。页面没写租客手续费（手续费在 FAQ：0.5% + 网络费）。

**https://liv.rent/blog/livrent/trust-score-explained/（2019-10，2024-07 更新）** —— Trust Score 的权威说明：Equifax 信用摘要 55 分、风险评估 20 分、可信度 20 分（核对 LinkedIn、证件、推荐人）、收入租金比 5 分；四个档位及房东应对建议（60–74 分建议要更多材料，0–59 分建议要财务证明）；扫公开文件找法庭记录。租客需提交收入证明（税单 / 银行流水 / offer / 在职信 / 工资单 / 学生贷款报表之一）和政府证件 + 自拍，学生证 / 工牌 / 图书证不算；个人信息须与 Equifax 一致。房东点「Unlock Trust Score」用额度或付款，站外申请人也可输入信息付费查；房东须先验证、须有租客书面同意；证件与 Equifax 报告生成后销毁，房东永远看不到原件。解锁会产生信用查询，短期多次通常算一次。页面没写金额。

**https://liv.rent/blog/livrent/how-to-become-verified/（2020-06，2025-10 更新）** —— 租客身份验证八步：Begin verifying → 选证件国家 → 选证件类型 → 用相机或换设备 → 拍正反面 → 开始自拍 → 左右转头 → You're done。不需要先完成档案，但申请房源前要上传工作与收入证明（银行流水、工资单、税单、在职信）。每个房东 / 物业公司账号与房源都由 liv.rent 人工审核。

**https://liv.rent/guides/safety-security/verified-listings/how-liv-rent-verifies-landlords-and-listings** —— 租客：手机号过运营商核验、可疑号码人工复核；证件 + 自拍比对，证件验证后删除；收入与工作证明进 Renter Resume，租客自己控制，房东只有在租客申请后才看到完整 resume。房东：证件或营业执照，必要时对照温哥华市商业登记或 BC 房地产委员会。房源：地契 / 物业税单 / 明信片验证码；物业经理另需代理文件；「Listings that appear suspicious or duplicated are flagged and hidden until verified」。两者都验证后才显示徽章。传输 SSL、存储 AES-256。指南分类：Renters、Landlords、Areas、Students、Energy、Buyers、Sellers、Rental Laws。

**https://liv.rent/guides/renters** —— 租客指南目录：申请（无加拿大信用史怎么租、需要哪些文件、申请清单、提高通过率）、签约（签前检查、月租 vs 固定期、数字签约指南）、入住（入住检查清单、入住前准备、租客保险）、找房（在加拿大怎么租、带家具 vs 不带、短租 vs 长租）、安全与诈骗（四篇）。没有关于付租金、维修、退租、续约、争议的指南。

**https://liv.rent/guides/renters/signing-a-lease/digital-lease-signing-guide-for-renters** —— 双方都收到文件、审阅、数字签署，全程在平台内；每份合同有唯一 ID 可在 verify.liv.rent 核验，签好的文件存在账号里。签前核对租金、日期、水电、房东姓名、涨租 / 宠物 / 转租 / 提前解约条款；不对就先书面要求更正；「A digital lease is a binding contract the moment both parties have signed」；建议自己留一份。提到标准表格在「安省与魁北克」等地强制。没写续约、费用、附加条款。

**https://liv.rent/guides/renters/applying-for-a-rental/what-documents-do-you-need-to-rent-an-apartment** —— 房东可能核实身份、工作、收入、租房史；建议准备工作与收入材料和推荐人（前房东、雇主、职业联系人）；提醒不要在申请阶段提供年龄（除非老年住房）、性别认同、宗教、病史、完整银行卡号等受保护或敏感信息。首次租房者选项与一段「Renter Story」可以弥补没有房东推荐；「A single verified Renter Resume on liv.rent can be submitted to any listing on the platform」。

**https://liv.rent/blog/2021/07/liv-rent-user-guide-for-renters/（2021-07，2023-08 更新）** —— 完整租客流程：不注册也能浏览；档案 = renter's resume，只要标准租约需要的最少信息；只有 ID 验证的房东能看；宣称「renters with complete profiles and verified IDs are 77% more likely to secure a rental」（公司自述）；按城市 / 楼宇 / 物业公司搜索，地图聚合比价；Apply Now → 入住日期 → 核对 → 接受条款 → 提交；Trust Score = Equifax + 自家 AI 算法；聊天时间线保存咨询、申请、合同、付款请求与收据，可翻译；BC 与安省租约可在线签署与续约，房东可加自定义附加条款；租金用信用卡 / UnionPay / 比特币，合同生效后可开关付款提醒，房东不在平台上要联系客服；租约到期转月租。没写维修、争议、费用。

**https://liv.rent/blog/landlords/first-time-landlord-best-rental-platform-in-canada-guide/（2026-06，2026-07 更新）** —— 房东视角的平台对比，关于自家：AI 筛选与房源提醒「match verified renters to relevant listings automatically」；房东与租客账号交易前都过证件核验；每份合同可在 verify.liv.rent 独立核验；Trust Score 由 Equifax 驱动，看信用史、收入核验、就业状态、风险评估，并「用 AI 核对身份、收入、就业数据」；标准数字租约所有套餐都有，附加条款要 Growth；收租支持信用卡 / UnionPay / 比特币并有收支报表；维修列为「Basic tracking」；「digital filing cabinet」存申请、租约、检查报告、付款记录；房源集中在温哥华、多伦多、卡尔加里、埃德蒙顿、蒙特利尔、温尼伯；没提租客费用。

**https://liv.rent/blog/renters/liv-rent-vs-rentseeker-matched-verified-compared/（2026-09-16）** —— 租客「fill out a Renter Resume once and use it to apply to as many listings as they like」；房东按证件、房源按地契或邮寄验证码验证，未验证房源有「Not Verified」警告；Trust Score 被描述为房东侧「a built-in, 100-point tenant screening tool」；房东侧「Suggested Tenants」按租客保存的搜索偏好匹配；租客流程含「booking viewings, signing a digital lease, and paying rent and deposits」、数字合同「where available」、内置聊天；「supports renters and landlords across Canada」，工具与租约模板因省而异。没写租客费用。

**https://landlords.liv.rent/leases/** —— 房东侧数字租约：从租客申请点「Create Contract」或从仪表盘建合同，可添加不在平台上的租客；合同从「Ontario Tenancy Agreement」或「BC Standardized Tenancy Agreement」预填，填联系方式、固定期或月租、租金、押金、保险、宠物 / 停车 / 储物政策、费用与折扣；附加条款三类（liv.rent 模板、公司模板、一次性自定义）；通过聊天发给租客，租客签后房东最终签署；房东可免费用数字合同，即使不用 liv.rent 找或筛租客。只提安省与 BC；没写续约和合同 ID 核验。
