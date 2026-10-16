# RentCafe（Yardi）· 租客侧公开页面调研

抓取日期：2026-10-13
调研方式：WebFetch 实读公开页面；读不到的用 WebSearch 找该站其他页或官方摘要。所有引文为页面原文（≤15 词）。

**面向市场**：美国 + 加拿大（帮助中心自述「apartments and houses for rent across the U.S. and Canada」；服务条款第 7.5 节的「Yardi 作为收款代理」只适用美国，并明写「not applicable in Canada」；条款另有法语（加拿大）版）。加拿大房东实例：Minto Apartments（渥太华/多伦多）用 RentCafe 门户。
**租客侧产品名**：RentCafe（找房站 rentcafe.com）→ RentCafe Applicant Portal（申请）→ RentCafe Resident Portal（入住后，同一账号）；手机端 RentCafe Resident app（Yardi Breeze 客户叫 RentCafe Resident，部分地区叫 MyCafe）；附加品 RentCafe Rewards（积分 + 免费租金上报征信）、RentCafe Debit Card（帮助中心标「coming soon」）。AI 产品名：RentCafe Chat IQ（物业方购买，租客作为对话对象）。

## 读过的 URL

成功读取：
- https://www.rentcafe.com/ （首页）
- https://www.rentcafe.com/help/ （帮助中心首页，6 个分类）
- https://www.rentcafe.com/help/is-rentcafe-free/ （「RentCafe 对租客免费吗」）
- https://www.rentcafe.com/help/what-is-rentcafe-and-how-does-it-work/
- https://www.rentcafe.com/help/rentcafe-account/ （账号分类索引）
- https://www.rentcafe.com/help/how-to-create-a-rentcafe-account/
- https://www.rentcafe.com/help/applying-and-moving-in/ （申请与入住分类索引）
- https://www.rentcafe.com/help/how-to-apply-for-an-apartment-on-rentcafe/
- https://www.rentcafe.com/help/application-fees-when-applying-through-rentcafe/
- https://www.rentcafe.com/help/what-happens-after-submitting-rentcafe-application/
- https://www.rentcafe.com/help/why-was-my-application-denied/
- https://www.rentcafe.com/help/upload-documents-id-verification/
- https://www.rentcafe.com/help/rentcafe-move-in-checklist/
- https://www.rentcafe.com/help/finding-a-rental/ （找房分类索引）
- https://www.rentcafe.com/help/how-can-i-schedule-a-tour-for-an-apartment-on-rentcafe/
- https://www.rentcafe.com/help/resident-life/ （入住后分类索引）
- https://www.rentcafe.com/help/how-to-add-bank-account/
- https://www.rentcafe.com/help/rentcafe-rewards/ （索引）
- https://www.rentcafe.com/help/does-rentcafe-help-build-credit/
- https://resources.yardi.com/legal/rentcafe-terms-of-service/ （服务条款）
- https://www.mintoapartments.com/resources/resident-guides （加拿大房东 Minto 的 RentCafe 门户说明）
- https://www.yardibreeze.com/?p=321089 （Yardi Breeze 博客：Chat IQ 一百万单元，2024-09-13）

未能读取：
- https://www.yardi.com/products/rentcafe/ （HTTP 403）
- https://www.yardi.com/product/rentcafe-resident-portal/ （HTTP 403）
- https://www.yardi.com/blog/?p=41421 与 https://www.yardi.com/blog/chat-iq-ai-features/ 与 https://www.yardi.com/blog/wp-json/wp/v2/posts/41421 （Chat IQ 2025-10-15 博客，HTTP 403）
- https://www.yardi.com/news/press-releases/yardi-introduces-rentcafe-chat-iq/ （HTTP 403）
- https://www.yardi.com/me/?p=398655 （Chat IQ 产品页，HTTP 403）
- https://www.yardi.com/me/?p=398005 （MyCafe Resident App，HTTP 403）
- https://www.yardi.com/blog/?p=53473 （「refreshed RentCafe portals」，HTTP 403）
- https://www.rentcafe.com/resident-faq.aspx （HTTP 404，该路径不存在）
- https://resources.yardi.com/documents/rentcafe-resident-app-for-yardi-breeze-brochure （PDF 下载到了，但内容是 Illustrator 导出的二进制对象流，抽不出文字）
- https://essexapartmenthomes.com/resident-frequently-asked-questions （HTTP 429）
yardi.com 整站对抓取返回 403，Yardi 侧（Resident Portal 产品页、Chat IQ）的内容只能靠 WebSearch 返回的官方摘要，下面凡是来自摘要的都标「（搜索摘要）」。

## 九项

| 项目 | 内容 | 来源 / 引文 |
|---|---|---|
| 1. 注册流程 | 找房不用账号；账号免费，用邮箱（一次性验证码）或 Google / Apple 登录，填姓名电话、接受条款即可。申请时用的是同一账号（Applicant Portal），**申请通过、租约签完后自动变成 Resident Portal，不需要新账号或注册码**。 | help/how-to-create-a-rentcafe-account：「Continue with email」「Verify email」；「a prospect account becomes a resident account automatically」。Yardi FAQ（搜索摘要）：「same login credentials from their RentCafe Applicant Portal experience, with no new account required」 |
| 2. 申请包 / 租客档案 | 每套房源单独走申请（「Apply now」），填个人信息、期望起租日、住址史、雇主与收入、车辆宠物、共同申请人 / 担保人、物业的附加项（车位储物），最后交费提交。共同申请人可在同屏填或收邮件各自填，各自交费。可上传工资单做收入核验；**可上传「Portable tenant report」（便携租客筛查报告）以减免申请费**；可选扫证件自动填表 + 自拍人脸核验；SSN 字段可勾「I don't have SSN」。帮助中心没有「一份申请复用到多家物业」的说法。入住后「Lease」区保存租约、保险、收入证明等文件。 | help/how-to-apply-for-an-apartment-on-rentcafe：「the application isn't complete until everyone has finished and paid」；help/upload-documents-id-verification：「Upload paystub」「Portable tenant report」「ID verified」 |
| 3. 看房约定 | 房源页「Schedule tour / Request tour」按钮，选类型（到场：自助或随物业人员；远程：直播视频或预录视频），选日期时间，填联系方式与预计入住日。不需要注册。提交即排定，收确认邮件与提醒邮件；物业有冲突才会联系改时间。 | help/how-can-i-schedule-a-tour：「your tour is scheduled right away」「a confirmation email and a reminder email」 |
| 4. 租约解释 | 没有「解释租约条款」的功能。物业把租约发到账号里电子签，签前可能要先补宠物 / 车辆 / 紧急联系人 / 文件；物业回签后租约完成；入住清单里有附加条款（addenda）签署。帮助中心的「guarantor」文章解释担保人概念。 | help/what-happens-after-submitting：「sends it for electronic signature in your RentCafe account」；help/rentcafe-move-in-checklist：「signing addenda」 |
| 5. 报修 | 门户与 app 里提交维修请求、看工单状态与历史；首页口号「Request maintenance in seconds」。帮助中心「Resident life」分类的简介提到 maintenance，但**没有一篇报修文章**（只有付款、租客保险、其他服务三类）。Yardi 侧（搜索摘要）说 app 提供「AI-guided assistance」帮助提交与追踪请求。 | rentcafe.com 首页：「Request maintenance in seconds」；Minto：请求「submitted to the correct point of contact」 |
| 6. 续约 / 退租 | **续约**：Yardi（搜索摘要）称续约要约直接出现在门户，短信邮件跟进，租客可在任何设备上查看方案并电子签（「view and esign renewal offers from any device」）。**退租 / 搬离通知**：帮助中心与搜索结果都没有租客在门户里提交搬离通知（notice to vacate）的说明；只找到面向物业员工的 CRM Flex 培训课「Notices, Early Terminations, and Evictions」。 | yardi.com/product/rentcafe-resident-portal（搜索摘要）：「Renewal offers appear directly in the portal」 |
| 7. 争议 | 帮助中心没有争议流程。申请被拒 / 延迟：登录看状态，细节「contact the property management office」；不讲 adverse action、不讲如何对筛查结果提异议。服务条款：Yardi「not a party to any transactions between Users and property managers」，租约问题「directly, rather than Yardi」，付款金额争议找「the other party directly」，筛查结果找「the appropriate property manager or owner」；用户对物业的争议「RELEASE YARDI FROM ANY CLAIMS」；无仲裁条款，加州法、Santa Barbara 法院、1 年诉讼时效。 | help/why-was-my-application-denied；terms-of-service §2.1 §2.2 §7.4–7.6 §20 |
| 8. 是否向租客收费 | 账号、找房、申请追踪、门户、入住清单、Rewards 都免费；RentCafe 不另收平台费。**会花钱的**：① 申请费由物业定（「set by the property management company — not RentCafe」），通常每成年申请人 $25–75、不退；另可能有行政费 $15–75、留房费 $100–500（退款政策各异）；总计多在 $50–300。② 付租手续费：银行转账 ACH 通常免费，「some properties charge a $0.95 convenience fee」；信用卡 2.95%（例：$1,500 付 $44.25）；借记卡固定 $3.95（≤$999.99）/ $4.95（$1,000–1,999.99）/ $9.95（≥$2,000）。③ Flex 分期付租（如物业提供）：月费 ≤$14.99 + 每次还款 1%（借记）或 3.5%（信用）。④ 租金上报征信：**免费**（Rewards 会员、三大局）。加拿大实例 Minto：银行账户付租免费，信用卡 2.25%（房东不拿这笔）。 | help/is-rentcafe-free；help/application-fees-when-applying-through-rentcafe：「Application fees on RentCafe are set by each property」；terms §7.5 申请费「even if an application is denied」不退 |
| 9. 是否有 AI 功能 | **有，但卖给物业方**：RentCafe Chat IQ（2020-08 发布）是覆盖聊天、短信、邮件、电话的 AI 坐席，7×24 答租客问题、排看房、「24/7 maintenance support」；2024-09 加语音；2025-04 起（仅限 RentCafe CRM IQ 客户）主动发付款提醒、续约通知；2025-10-15 博客加「late payment assistance」（AI 写催租提醒、语气逐次变化、回答「When is my rent due?」「Why was I charged an NSF fee?」）与「renewal assistance」（细节被截断，第三方描述为定时通知 + 定制续约要约）。租客侧找房：帮助中心分类简介写「try AI search」，产品页叫「Natural language search」。rentcafe.com 首页与租客帮助文章本身不提 AI。 | help/：「How to search for listings, use filters, try AI search and more」；yardibreeze.com：Chat IQ 让「speed to lease」最多快 7 天；yardi.com 博客（搜索摘要，2025-10-15）：「the tone will adjust with each subsequent reminder」 |

## 读到的页面文字摘要

**https://www.rentcafe.com/**
找房首页。顶部「Resident living」与「Log in」都指向 /login（同一登录页承担 Applicant Portal 与 Resident Portal）。「Live better」区写「Pay rent and utilities online, your way」，示例屏显示 $1,750 余额、「Make a payment」「Enable Autopay」按钮；「Request maintenance in seconds」；「Lease online」区推「Fully online lease application」「Streamlined verification and approval」，「Apply in minutes」按钮链到多伦多带在线申请筛选的搜索页（说明加拿大市场是首页默认示例之一）。提到入住清单（加宠物信息、租客保险）与「Manage renter essentials and rewards」。不提费用、不提 AI。页脚有 Help Center、Contact us、Yardi 的条款与隐私。

**https://www.rentcafe.com/help/**
帮助中心首页，只列 6 个分类：Finding a rental（18 篇，简介含「try AI search」）、Applying and moving in（12 篇）、RentCafe account（4 篇）、Resident life（4 篇，「payments, utilities and maintenance requests」）、RentCafe Rewards（8 篇，「build credit」）、RentCafe Debit Card（0 篇，「coming soon」）。没有争议或投诉流程，只有联系表单。

**https://www.rentcafe.com/help/is-rentcafe-free/**
对租客的费用总表。免费：账号、搜索（「no paywall」）、地图与计算器、入住清单、门户、Rewards 入会、租金上报征信。可能收费：ACH 通常免费但部分物业 $0.95；信用卡 2.95%；借记卡 $3.95 / $4.95 / $9.95 三档；申请费与背景调查费由物业定；Flex 分期月费 ≤$14.99 加 1% / 3.5%。提醒费率可能变化、以付款门户为准。

**https://www.rentcafe.com/help/what-is-rentcafe-and-how-does-it-work/**
自述为「an online platform that allows you to search for apartments or houses」，覆盖从找房到入住后的全程：比较房源、地图、虚拟看房、「Natural language search」；免费账号后可申请、追踪申请、在线签租约；入住后「post-move-in resident dashboard where renters can pay rent, submit maintenance requests and handle utilities」；市场「across the U.S. and Canada」；「part of Yardi」。

**https://www.rentcafe.com/help/how-to-create-a-rentcafe-account/**
注册五步：登录入口 → 邮箱「Continue with email」或 Google / Apple → 邮箱 / 手机一次性码「Verify email」（Google / Apple 自动验证）→ 填姓名电话、接受条款 → 完成。只讲找房 / 申请账号；申请通过并签约后账号自动变为住户账号，没有「注册码」一说。

**https://www.rentcafe.com/help/how-to-apply-for-an-apartment-on-rentcafe/**
申请六步：「Apply now」→ 个人信息与期望起租日 → 住址史、雇主、收入 → 共同申请人 / 担保人 → 物业附加项（储物、车位）→ 复核并付申请费提交。共同申请人可同屏填或收邮件单独填；付款会留房，但所有人填完并各自付费申请才算完整；获批后共同申请人也要签租约。申请费物业定、提交前可见，付款方式（信用卡 / 借记卡 / 银行）看物业设置。不讲跨物业复用、ID 核验、看房。

**https://www.rentcafe.com/help/application-fees-when-applying-through-rentcafe/**
申请费通常每成年申请人 $25–75、「usually non-refundable」，覆盖身份、雇佣、租史、信用与背景核查；行政费 $15–75（部分物业收，覆盖租约准备）；留房费 $100–500（获批后锁房，「Refund policies vary significantly」）；合计多在 $50–300。「Application fees on RentCafe are set by each property, not by RentCafe」，RentCafe 不另加平台费。

**https://www.rentcafe.com/help/what-happens-after-submitting-rentcafe-application/**
付申请费后收到付款确认，但「does not mean the application has been approved」；物业审材料与筛查结果（筛查可自动或人工发起），通常几天；批准发邮件；物业准备租约、发到账号里电子签（签前可能要补宠物、车辆、紧急联系人、文件）；物业回签后租约完成，账号里出现入住任务（租客保险、水电、清单）。被拒只说「物业可以拒绝」，不讲后续。

**https://www.rentcafe.com/help/why-was-my-application-denied/**
申请延迟 / 被拒的原因：信息缺失、申请费付款失败、「screening results that do not meet the property's requirements」；物业会收到提示并可能联系申请人。处理方式：登录看状态、联系物业办公室。不提对筛查结果的异议与 adverse action。

**https://www.rentcafe.com/help/upload-documents-id-verification/**
ID 核验：选证件签发国 → 扫正反面 → 自拍人脸核验（「ID verified」）→ 自动填姓名、SSN，可手填或勾「I don't have SSN」；不点名第三方核验供应商。可上传：工资单（「Upload paystub」）、便携租客筛查报告（「may reduce application fees」）、可选扫证件自动填表。入住后「Lease」区存租约、保险单、收入证明。文件 PDF / 常见图片格式，每个 ≤10MB。

**https://www.rentcafe.com/help/rentcafe-move-in-checklist/**
「Once the property approves your online lease application, the move-in checklist appears」；清单项按物业而定：签附加条款、宠物车辆紧急联系人、租客保险（「may be required by your lease」，经 RentCafe 买可得 Rewards 积分）、电力与网络等「Renter Essentials」、部分物业的「alternative security deposits」。双方签完后申请门户即住户门户，同一账号。

**https://www.rentcafe.com/help/finding-a-rental/**
找房分类共 18 篇：平台说明、房源真实性、是否免费；搜索与筛选、保存搜索与提醒、邮编搜索、自绘地图；可负担住房；房源详情（满租候补、设施释义、评论可信度）；看房两篇（预约看房、线上看房）；租金优惠筛选两篇。没有单独的「AI search」文章，也没有「联系物业」文章。

**https://www.rentcafe.com/help/how-can-i-schedule-a-tour-for-an-apartment-on-rentcafe/**
在房源页点「Schedule tour」/「Request tour」→ 选类型（到场自助或随工作人员；远程直播或预录）→ 日历选时间 → 填联系方式与预计入住日 → 提交。「No sign-up is required」；「your tour is scheduled right away」，收确认邮件与临近提醒；物业有冲突才会改时间。不提费用、不提聊天机器人。

**https://www.rentcafe.com/help/resident-life/**
入住后分类只有 4 篇：付款两篇（添加银行账户、确认付款是否成功）、租客保险一篇、其他服务一篇。简介写「payments, maintenance requests, utilities, and other services」，但没有任何报修文章。

**https://www.rentcafe.com/help/how-to-add-bank-account/**
「Rent & Payments」→「Wallet」→ 添加银行账户。即时验证走「Securely connect your bank with Mastercard Data Connect」（Finicity），登录网银选账户，最多 3 次；不行就手填 routing / transit number 与账号，等 2–5 个工作日的小额测试存款再「Verify your bank account」，三次机会。不提费用；是否能设自动 / 定期付款取决于物业设置。

**https://www.rentcafe.com/help/does-rentcafe-help-build-credit/**
RentCafe Rewards 的租金上报由 IdentityIQ 驱动，「automatically sends your monthly rent payment data to the major credit bureaus」（Experian、Equifax、TransUnion）。Rewards 会员免费开启、不扣积分；可选付费「Credit Advantage」升级。前提「Services must be available at your property」。每月 24 日上报。

**https://www.rentcafe.com/help/rentcafe-rewards/**
Rewards 分类索引 8 篇：Rewards 是什么、怎样赚积分、是否帮助建立信用、如何用积分 / 优惠 / 提交收据、积分到账时间。只列标题。

**https://resources.yardi.com/legal/rentcafe-terms-of-service/**
Yardi 的 RentCafe 服务条款。§7.5：用户可能为筛查、租约执行、押金退还等服务付费，费用「are subject to change」；申请费「even if an application is denied」不退（法律另有规定除外）；Yardi 在美国作为收款方的代理（「Applicable only in the United States (and not applicable in Canada)」）。§2.1 Yardi「not a party to any transactions between Users and property managers」；§2.2 用户对物业的争议「RELEASE YARDI FROM ANY CLAIMS, DEMANDS AND DAMAGES」；§7.4 筛查结果找物业；§7.6 租约问题「directly, rather than Yardi」。无仲裁条款；加州法、Santa Barbara 县法院；§20.6 诉讼 1 年内提起。链接有法语（加拿大）版。

**https://www.mintoapartments.com/resources/resident-guides**
加拿大房东 Minto Apartments 对住户的 RentCafe 门户说明：在线付租可绑定银行账户「no-fee payment」，或一次性信用卡付款（VISA / MasterCard / AMEX）收 2.25% 手续费，「Minto Apartments does not gain this fee」；维修请求经门户提交以确保「submitted to the correct point of contact」。不讲续约与搬离通知；另有一份门户 FAQ PDF 未读。

**https://www.yardibreeze.com/?p=321089**
Yardi Breeze 博客（2024-09-13）「1 Million Units On Chat IQ」：Chat IQ 7×24 通过聊天、邮件、短信、电话回答住户问题；新增「Personalize your bot with new voice options」；客户称「speed to lease」最多提前 7 天、Chat IQ「filtered out less promising leads」。没有具体讲报修、续约、付款。

**Yardi 侧未能直读、只能从搜索摘要确认的内容**（来源：yardi.com/product/rentcafe-resident-portal、yardi.com/products/rentcafe、yardi.com/blog/?p=41421、yardi.com/?p=362756 的搜索摘要）：住户用申请门户同一登录，支持 Google / Apple / 邮箱无密码登录；「zero-cost ACH payments」、Autopay、「flexible rent options」、Apple Pay / Google Pay；维修请求可提交并看状态历史、有「AI-guided assistance」；「Renewal offers appear directly in the portal」并可在任何设备电子签；Chat IQ 2025-04 起（仅 CRM IQ 客户）主动发付款提醒与续约通知，2025-10-15 加「late payment assistance」「renewal assistance」与升级语音，AI 写的催租提醒「the tone will adjust with each subsequent reminder」。
