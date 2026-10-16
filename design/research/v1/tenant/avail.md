# Avail（Realtor.com 旗下）· 租客侧公开页面调研

抓取日期：2026-10-13
调研方式：WebFetch 实读公开页面；读不到的用 WebSearch 找该站其他页或官方摘要。所有引文为页面原文（≤15 词）。
**注意**：Avail 的站点已从 avail.co 迁到 **avail.com**，avail.co / help.avail.co 对 WebFetch 直接返回「unable to fetch」；帮助中心现在是 support.avail.com，但首页读不到内容，租客侧说明主要来自 avail.com/education 文章与 community.avail.com 的官方回帖。

**面向市场**：仅美国。服务条款 §14「for use only by persons located in the United States」，§1 要求用户居住在美国或其属地、年满 18；筛查经 TransUnion、租约按州模板、1099-K 税表、芝加哥 Cook County 仲裁、伊利诺伊州法。不做加拿大。
**租客侧产品名**：Avail 没有单独的租客品牌，租客入口叫「Tenant Sign up」（/users/new?tenant=true）、「tenant portal」（定价页写「24/7 tenant portal access」）、「renter dashboard」；可复用的申请包叫 **Renter Profile**；租金上报征信叫 **CreditBoost**（/tenants/report-my-rent）。页头标「Realtor.com Rentals」，页脚「© 2011—2026 Avail」。

## 读过的 URL

成功读取：
- https://www.avail.com/ （首页）
- https://www.avail.com/pricing （定价）
- https://www.avail.com/landlords/features （功能总览）
- https://www.avail.com/landlords/online-rental-applications （在线申请 + Renter Profile）
- https://www.avail.com/landlords/online-tenant-screening （筛查）
- https://www.avail.com/landlords/online-rent-collection （收租）
- https://www.avail.com/landlords/maintenance-tracking （维修追踪）
- https://www.avail.com/landlords/rental-lease-agreement （租约与电子签）
- https://www.avail.com/tenants/report-my-rent （CreditBoost 租客页）
- https://www.avail.com/terms （服务条款）
- https://www.avail.com/education/articles/how-to-create-a-renter-profile-on-avail （2026-08-11 更新）
- https://www.avail.com/education/articles/how-do-i-pay-my-rent-online （2022-08-23 更新）
- https://www.avail.com/education/articles/pay-rent-online-how-to-invite-your-landlord-to-avail （2024-06-12 更新）
- https://www.avail.com/education/articles/can-i-pay-rent-with-a-credit-card （2022-06-24 更新）
- https://www.avail.com/education/articles/the-lease-signing-process-for-landlords-and-tenants-explained （2026-06-01 更新）
- https://www.avail.com/blog/now-announcing-creditboost
- https://community.avail.com/t/avail-optional-fees/2792 （Avail 社区经理 2022-05-16 的官方费用回帖）
- https://community.avail.com/t/electronic-lease-termination-non-renewal/1421 （2021-04 回帖）

未能读取：
- https://www.avail.co/tenants 、https://avail.co/tenants 、https://www.avail.co/pricing 、https://avail.co/pricing （WebFetch：「unable to fetch from avail.co」，旧域名）
- https://help.avail.co/ （同上，旧帮助域名）
- https://www.avail.com/tenants （HTTP 404；租客营销页不存在，页面只剩导航）
- https://www.avail.com/landlords/digital-leases （HTTP 404；现用 /landlords/rental-lease-agreement）
- https://www.avail.com/landlords/rental-applications （HTTP 404；现用 /landlords/online-rental-applications）
- https://support.avail.com/ （返回的正文只有一行「Welcome to LWC Communities!」，不是帮助中心内容）
- https://support.avail.com/hc/en-us （HTTP 404）

## 九项

| 项目 | 内容 | 来源 / 引文 |
|---|---|---|
| 1. 注册流程 | 租客免费注册（「Create an account for free」），入口「Tenant Sign up」。两条路：① 房东先建房源并邀请租客（付租、签约都要先被邀请：「your landlord must create an account and set up the rental property」）；② 租客自己注册后在 renter dashboard 点「Invite My Landlord」填房东姓名、邮箱、房子信息，邀请房东上平台。创建 Renter Profile 不需要信用卡。 | /tenants/report-my-rent；education「how-to-invite-your-landlord」；education「renter-profile」：no credit card needed to create the profile |
| 2. 申请包 / 租客档案 | **Renter Profile**：免费创建一份可复用的申请（住址史、工作史、收入证明、标准申请问题、筛查授权），可上传工资单、报税表、银行流水；可选加 TransUnion 信用 + 犯罪 + 驱逐三报告，「a one-time fee of $55」；用一个链接分享给多个房东，租客能看到每个房东能访问什么并一键撤销（「revoke their access with one click」）。复用窗口：房东页写「apply to multiple Avail listings for 30 days with one payment」（旧页面曾写 90 天）。可邀请「co-applicants, roommates, or spouses to join a single application」。Unlimited Plus 房东可加自定义问题。 | /landlords/online-rental-applications；/landlords/online-tenant-screening：「share their already-paid-for Renter Profiles with multiple landlords」 |
| 3. 看房约定 | 只有房东侧一句：潜在租客可以「schedule or request tours directly from your listing」（并声称能让申请翻倍）。租客侧没有看房流程说明。 | /landlords/online-rental-applications |
| 4. 租约解释 | 没有解释条款的功能。租客被房东邀请建账号后收邮件「instructions on how to review and sign the lease」；发现错误可让房东改了重发；租客「generally provide the first signature」，房东最后签；双方签完「cannot be changed once both parties have signed」，改动走 Lease Amendment（模板是房东付费功能）。电子签对租客免费（「unlimited digital signatures for free」）。租约签好后自动出现在双方 dashboard。 | education「lease-signing-process」；/landlords/rental-lease-agreement |
| 5. 报修 | 租客在自己账号里「through their account whenever they need」提交维修请求，可附照片，房东收邮件；状态只有「pending or completed」；双方在工单里「in-app instant messaging」；房东可在工单上加费用金额留记录。第三方描述的租客界面有 New Ticket / View Request / Close Ticket，官方页没写租客能否关单。 | /landlords/maintenance-tracking |
| 6. 续约 / 退租 | **续约**：租客在租约到期前收「automated reminders as their lease expiration date approaches」；功能页写「The automated renewal process on Avail」，但没有租客侧步骤说明。**退租 / 不续约通知**：Avail 官方 2021-04-19 回帖「Avail does not offer this as a feature at this time」，社区建议邮件 + 挂号信；没有更新的说法。 | /landlords/rental-lease-agreement；community 1421 |
| 7. 争议 | 条款 §3.2 租约争议「must be resolved outside of the Services and Website」；§5.4 付款争议在资金转给房东后「the responsibility to settle the dispute rests with you and the Manager」，转之前 Avail 可酌情作废 / 退回；§18 与 Avail 的争议「RESOLVED EXCLUSIVELY THROUGH FINAL AND BINDING ARBITRATION」（AAA、Cook County, Illinois，仅个人名义，小额法庭除外）；伊利诺伊州法。没有租客对筛查结果提异议的流程页（美国走 FCRA 向 TransUnion 争议）。 | /terms |
| 8. 是否向租客收费 | **会**，按项目：① 筛查 / 申请：三份报告打包 **$55**（单份 $30，按州有差异），「Choose who pays the screening fee — either you as the landlord or the applicant」，默认通常是申请人付；条款 §5.2 筛查费「All fees are earned by us」不退。② 付租：房东在免费 Unlimited 计划时租客每笔银行转账 **$2.50**（「$2.50 per bank transfer」），房东在 Unlimited Plus（$9/单元/月）时银行转账免费；信用卡 / 借记卡一律 **3.5%**（「3.5% processing fee is added to tenant payments regardless of subscription」）。③ ACH 退票 NSF **$15**，加到下一笔付款（条款 §5.5「NSF fees will be passed on to Tenants」，60 天不付可扣卡）。④ CreditBoost **$3.95 / 每个上报月**（最多 24 个月，租客页写「Charged as a flat, one-time fee」且「Money-back guaranteed if payments can't be verified」）。⑤ 租客保险可在账号里询价（第三方报价，无 Avail 费用说明）。 | /pricing；community 2792（Avail 社区经理）；/terms §5.2 §5.3 §5.5；/tenants/report-my-rent |
| 9. 是否有 AI 功能 | **没有**。首页、定价、功能总览、收租、维修、租约、筛查页都不提 AI；条款不提；2026 年的第三方评测称 Realtor.com 2020 收购后「no AI features have been announced or delivered」（出自竞品博客，只作旁证）。 | /（首页）、/pricing、/landlords/features 均「does not mention AI」 |

## 读到的页面文字摘要

**https://www.avail.com/**
面向房东的首页，页头「Realtor.com Rentals」。产品：免费挂到「19 of the top rental sites」（Realtor.com、Redfin、Zumper）；在线申请 + TransUnion 筛查；按州租约模板 + 在线签；在线收租（租金、押金、费用）；维修工单与费用；记账；集中消息。定价两档：Unlimited「$0/unit」（含「24/7 tenant portal access」）、Unlimited Plus「$9/unit」/月（FastPay、免 ACH 费、自定义申请问题、可改租约、品牌网站）。租客只有页脚「Tenant Sign up」链接，没有租客落地页。不提 AI。帮助中心 support.avail.com。

**https://www.avail.com/pricing**
Unlimited $0/unit、Unlimited Plus $9/unit/月。租客付的费用：Unlimited 下「$2.50 per bank transfer」，Plus 下银行付款免费；卡付一律 3.5%；筛查报告费用「vary by location due to state laws」，房东选报告、「tenants usually pay, though landlords can cover them」；CreditBoost 只提上报征信不列价；租客保险可在账号里询价。不提 AI。

**https://www.avail.com/landlords/features**
功能总览：一键挂牌 19 个平台；「Comprehensive rental applications」+ 站内消息；自选 TransUnion 报告；「lawyer-reviewed, state-specific lease and amendment templates」或上传自己的；「free built-in eSign options」；「The automated renewal process on Avail」；调租工具；收租「manage all payments, deposits, and fees through a single platform」，256 位加密 + 身份核验；维修「tracking repairs with in-app messaging, photos, and automatic records」；消息集中；租客可「scheduling payments in advance」（卡或 ACH）；CreditBoost 上报 TransUnion；记账自动同步。页脚另列 FastPay、Rent Price Analysis。不提 AI。

**https://www.avail.com/landlords/online-rental-applications**
申请收集收入、雇佣、住址史、吸烟、宠物等，可上传工资单 / 报税表 / 银行流水，可选 TransUnion 信用 / 犯罪 / 驱逐报告。「Renters can apply to multiple Avail listings for 30 days with one payment」（Renter Profile）。房东「choose to cover the screening cost or pass it to the applicant」，价格按州。Plus 计划可在 5 个标准问题外加自定义问题。租客可「invite co-applicants, roommates, or spouses to join a single application」。潜在租客可从房源页「schedule or request tours」。不列金额。

**https://www.avail.com/landlords/online-tenant-screening**
「Powered by TransUnion」。三种报告：信用（分数、账户、查询、可用额度、债务）、全国犯罪记录（50 州重罪与轻罪）、逐州驱逐记录（50 州 + DC，按「name and SSN」匹配）。「Choose who pays the screening fee — either you as the landlord or the applicant」。租客可「share their already-paid-for Renter Profiles with multiple landlords」。申请也可来自合作站点。不列价格、不讲 ID 核验与共同申请人。

**https://www.avail.com/landlords/online-rent-collection**
租客「can schedule payments」、可用借记卡 / 信用卡 / 银行账户、可与室友拆分、可「report on-time payments to build their credit with CreditBoost」（链到 /tenants/report-my-rent）。房东侧 FastPay 次日到账（标准 3 个工作日）。房东可设自动滞纳金。页面不写任何手续费金额、不讲 NSF。

**https://www.avail.com/landlords/maintenance-tracking**
租客「through their account whenever they need」提交请求，房东收邮件；照片 + 消息让房东远程判断；租客可查工单「pending or completed」；「in-app instant messaging」；房东可「add an expense amount to the ticket」留费用记录。没写照片张数上限、没写租客能否关单。

**https://www.avail.com/landlords/rental-lease-agreement**
上传的租约「unlimited digital signatures for free」；模板租约电子签的价格在 FAQ 里但没显示。租客电子签「no printing, scanning, faxing, or back-and-forth emails required」。续约：「Renters will receive automated reminders as their lease expiration date approaches」，流程细节在 FAQ 里没显示。修订用 Lease Amendment 模板（加租客、调租、改政策）。签好的租约上传后双方 dashboard 都能看。

**https://www.avail.com/tenants/report-my-rent**
CreditBoost 租客页：「$3.95」「per month reported」，「Up to 24 months per lease」，「Money-back guaranteed if payments can't be verified」，「Charged as a flat, one-time fee」（与按月措辞自相矛盾，页面未解释）；上报 TransUnion，「Choose to report past or current payments」；影响 FICO 9 / FICO XD / VantageScore，「up to 40 points」（基于上报 24 个月的客户，「results may vary」）；「Create an account for free」；30 天内见分数变化。

**https://www.avail.com/terms**
§1 用户须居住在美国或其属地、年满 18；§14 网站「for use only by persons located in the United States」。§5.2 租客为每次背景调查付费，「All fees are earned by us」不退；§5.3 部分租客 ACH 付「$2.50 convenience fee per transaction」；§3.4 / §5.5 NSF 费转嫁租客，先付清才能再发起 ACH，60 天不付可扣卡上、无卡扣房东卡。§3.2 租约争议「must be resolved outside of the Services and Website」；§5.4 资金转给房东后争议由双方自行解决。§18 强制仲裁（AAA、Cook County 伊利诺伊，仅个人名义，小额法庭例外）；伊利诺伊州法。

**https://www.avail.com/education/articles/how-to-create-a-renter-profile-on-avail**（2026-08-11）
登录 → 点「Renter Profile」→ 填住址史、工作史、收入证明、标准问题、筛查授权 → 用链接分享给房东。创建免费、不用信用卡；加信用 / 背景 / 驱逐报告「a one-time fee of $55」。租客可查看每个房东能看到的信息与报告，并「revoke their access with one click」。没写有效期。

**https://www.avail.com/education/articles/how-do-i-pay-my-rent-online**（2022-08-23）
建好 renter profile 后设付款方式（银行 / 借记卡 / 信用卡，可存多个随时切换）→ 选金额与日期，系统显示房东何时到账（「the exact date your rent money will hit your landlord's account」）→ 可设 Autopay → 室友各自看到自己欠多少、何时扣款、何时到账。不写手续费，只提 CreditBoost $3.95/上报月。

**https://www.avail.com/education/articles/pay-rent-online-how-to-invite-your-landlord-to-avail**（2024-06-12）
租客在 renter dashboard 点「Invite My Landlord」，填房东姓名、邮箱、房子信息，可附一句话；在 dashboard 追踪邀请状态；房东必须建账号并设好房源才能付租。能做的：AutoPay、每月在借记 / 信用 / 支票账户间切换无罚金、拆分租金、CreditBoost。房东免费、Plus $9/单元/月；不写租客费用。

**https://www.avail.com/education/articles/can-i-pay-rent-with-a-credit-card**（2022-06-24）
信用卡付租「a small processing fee (3.5% through Avail)」；CreditBoost「$3.95/per reported month」。不写 ACH 费。

**https://www.avail.com/education/articles/the-lease-signing-process-for-landlords-and-tenants-explained**（2026-06-01）
房东邀请租客建账号 → 租客收邮件「instructions on how to review and sign the lease」→ 审阅、有错让房东改了重发 → 租客「generally provide the first signature」，房东最后签 → 签完自动「populate both parties' dashboards」。签完「cannot be changed once both parties have signed」，改动走 Lease Amendment（模板属 Unlimited Plus）。不写租客费用、不讲续约。

**https://www.avail.com/blog/now-announcing-creditboost**
CreditBoost 把租金「tradeline to TransUnion」，「$3.95/per reported month」；「it's up to the renter to activate CreditBoost in their own account」，房东不能替租客开；前提是房东先邀请租客经 Avail 付租；在 Payments dashboard 顶部开关；迟付超 30 天前会先通知租客，房东可手动上报迟付；「CreditBoost results may vary by individual」。

**https://community.avail.com/t/avail-optional-fees/2792**（Avail 社区经理，2022-05-16）
官方回帖列费：房东在 Plus 时「the ACH fee is waived」；免费计划下租客「will pay a nominal $2.50 fee per payment」；卡付「3.5% convenience fee billed to the tenant」；ACH 失败「a $15 NSF fee is added to their next payment」；CreditBoost「$3.95/per reported month」；单份报告 $30、三份打包 $55（按州有差异）；Rent Analysis Report $19.99（房东付）。另一位用户提到加州对申请人的上限约 $52.33。

**https://community.avail.com/t/electronic-lease-termination-non-renewal/1421**（2020-12 至 2021-04）
问 Avail 能否电子发送不续约 / 终止通知，Avail 方回复（2021-04-19）「Avail does not offer this as a feature at this time」；社区建议邮件 + 带追踪的 USPS 信件、要求租客确认收到。没有更新的官方回复。

**未能直读、只有搜索摘要的租客侧信息**：第三方页面描述租客 dashboard 的维修区有 New Ticket / View Request / Close Ticket，银行账户区用 Plaid 登录网银绑定；Avail 2026 年教育文章说筛查报告 90 天内可复用（旧页），而现行房东页写 30 天——以 30 天为准但未经账号内核实。
