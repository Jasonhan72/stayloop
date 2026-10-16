# V1.0 调研线 C · 房东留存（2026-10-13）

> **法规核查后的修正（2026-10-13，详见 `legal-check-2026-10.md` 清单 11–13）**：LSA s.1(8) 3 的「本人豁免」只豁免房东自己，不能引为平台替房东填表的依据——平台的边界是 s.1(5)（不施加法律判断：不选表、不建议送达方式；s.1(7) 1 把送达决定也算代理）；Tribunals Ontario 表格页没有单独条款，按 ontario.ca 版权页的 Crown copyright 处理；FINTRAC / 央行登记库本轮不可读，「同行全部已登记」「Connect 平台不在代理名单」标为未能复核，PSP 适用性按央行三指标自评并取书面意见。

调研员：房东留存线。方案见 `design/v1-research-plan-2026-10.md` 第 0、3、5 节。只读仓库与生产库，不改项目文件、不写库。
配套文件：六个对标产品的页面摘要在 `design/research/v1/landlord/<产品>.md`；在线收租通道与合规在 `design/research/v1/landlord/rent-collection-channels.md`；
取数脚本在会话 scratchpad `research-c/`（`fetch.sh` / `fetch2.sh` 经 PostgREST 只读拉表，密钥只在 header 文件；`funnel.py` / `deep.py` 算漏斗）。

硬约束带着：没有 MLS 房源数据；消费者报告机构未注册；「不经手资金」是既定决定——在线收租这里只给做 / 不做的依据。

每条发现四个字段：**现状 · 证据 · 建议 · 门槛**。文档里只有汇总数，没有任何个人邮箱、姓名、地址。

---

## C1 · 漏斗实数（生产库，2026-10-13 只读）

### 怎么算的

- 数据源：`auth.users`（Admin API 分页）、`landlords`、`screenings`、`listings`、`applications`、`lease_documents`、`households` / `household_members`、`rent_payments`、`agent_pending_actions`、`agent_audit_events`（3,009 行）、`agent_threads`、`admin_users`。
- **排除测试号**：`user_metadata.test_account / muse_account / reviewer_account = true` 的账号、邮箱 `@stayloop.ai`、名字或地址含 `[TEST]` 的行，以及这些账号名下的 landlords 行所拥有的记录。共排除 10 个 auth 用户、4 行 landlords、7 份筛查、3 套房源、6 份租约中的 4 份、2 个在管租约。
- **管理员单列**：2 个管理员账号（`admin_users`）是项目自己人，他们的筛查是拿真实案卷做的内部 QA，不能算「房东留存」。下面凡写「非管理员」都已把这两个号剔掉。
- 筛查归属用 `screenings.landlord_id`，按 Dual-ID 规则同时匹配 `landlords.id` 与 `auth.users.id`。

### 发现 C1-1 · 真实账号只有 13 个，其中 4 个连邮箱都没确认

- **现状**：生产库现存 23 个 auth 用户，去掉 10 个测试号剩 13 个真实账号；4 个（都是 8–9 月注册）从未确认邮箱，等于没进过门。9 个用邮箱注册、2 个 Google。
- **证据**：`auth.users` 的 `email_confirmed_at` 为空 4 个；注册月份分布 4 月 1 / 5 月 1 / 7 月 1 / 8 月 4 / 9 月 5 / 10 月 1。距上次登录天数（有记录的 10 个）：0、10、14、20、28、28、49、53、53、147。
- **建议**：注册确认邮件的到达与点击是第一个掉点，V1.0 之前先在 Supabase Auth 日志里看这 4 封信是「没发出」还是「没点」；确认邮件已改双语（10-11），但没有重发提醒和「没收到？」入口。
- **门槛**：数据（Auth 日志保留期 7 天，要尽快看）；工作量 S。

### 发现 C1-2 · 239 份筛查里 181 份是管理员自己跑的；非管理员真实房东只有 51 份、14 个人、10 个已删号

- **现状**：239 份筛查 → 排除测试号 232 份 → 其中 181 份（78%）属于管理员账号（2026-04 至 2026-10，44 个活跃日）。真正的外部房东：**51 份、14 个账号**，其中 10 个账号已不存在（40 份筛查）、4 个还在（11 份）。
- **证据**：按月（管理员 / 外部）：4 月 68 / 30、5 月 10 / 1、6 月 45 / 2、7 月 16 / 3、8 月 17 / 10、9 月 24 / 5、10 月 1 / 0。外部房东的 51 份里 **49 份在该账号第一次筛查后 48 小时内发生**；14 人里 9 人跑过 ≥2 份，但最长跨度 9 天；中位数「注册 → 开通房东」0 天、「注册 → 第一次筛查」0 天、「第 1 次 → 第 2 次筛查」0.1 天。
- **建议**：「筛查是唯一有量的功能」这句要改成「筛查是唯一有量的功能，而且量主要来自内部测试」。4 月那 30 份外部筛查对应 3 个账号在两天内各跑 7–11 份，更像同一批人试用，不是持续使用。V1.0 的留存指标应定义为「同一外部账号在第 8 天以后再跑一次筛查或做任何一件别的事」，现在这个数是 **0 / 14**。
- **门槛**：数据（已删账号的注册日期与来源无从查起——用户删除后 auth 行就没了，`screenings.landlord_id` 成了孤儿 id；以后删号前先把注册日 / 来源落到一张汇总表）；工作量 S。

### 发现 C1-3 · 筛查之后没有人进入下一步

- **现状**：漏斗在「第二次筛查」之后归零。外部真实房东：发布房源 0、收到申请 0、租约 0、在管租约 0、续约 0、待批卡 0、AI 对话线程 0。
- **证据**：`listings` 148 行里 139 行是 Realtor.ca 导入（已归档），其余 9 行：3 行 `[TEST]`、4 行管理员（3 套已标 `is_test`）、2 行测试号（已归档）。`applications` 5 行全在测试房源上；`lease_documents` 6 行里 2 行是真实账号导入的旧租约（2026-08-04，`/leases/import`），其余 4 行测试；`households` 2 行全是测试；`rent_payments` 1 行测试；`agent_pending_actions` 里非管理员真实用户 0 行；`agent_threads` 非管理员真实用户 0 行；`*_agent_turn` 审计事件非管理员真实用户 17 条（全部是租客身份的对话）。
- **建议**：掉点不在「筛查 → 租约」之间的某个页面，而是**筛查之后没有任何东西把房东叫回来**——报告看完就走。把「筛查完成」当成一次触发：① 报告页末尾给出「下一步」（录取 / 起草决定通知 / 起草标准租约）并写明各要几分钟；② 筛查后第 3 天、第 14 天各一封邮件（「这位申请人定了吗？」「要不要把租约录进来，续约和 N1 到期会自动提醒」），都是现有执行器能发的。
- **门槛**：工作量 S（邮件）+ M（报告页末尾接续到申请人页 / 租约页，现在报告与申请队列是两条独立入口）；法规无。

### 发现 C1-4 · 筛查结果分布：外部房东跑出来的 61% 是「拒绝」，错误率 24%

- **现状**：外部真实房东 51 份：decline 14、conditional 10、approve 7、早期无 tier 的 scored 8、**error 12（24%）**。管理员 181 份：decline 112、conditional 33、approve 12、error 22（12%）。
- **证据**：错误原因（全部真实筛查）：15 份空错误（卡死后被 09-22 的清理标为 error）、模型 400 / 解析失败 15 份、`no_documents` 等 4 份。外部房东的 12 份错误集中在 4 月（10 份），当时上传层与模型校验还没修（08-25 的 25 MB 桶、09-13 的卡死清理）。
- **建议**：错误率是真实留存的隐形杀手——4 月那 3 个批量试用的账号各有 3–4 份失败，之后全部删号。现在管线已稳定（9 月外部 5 份 0 错误），但报告页仍没有「失败了怎么办」的可见出口（删除按钮有，重跑要回筛查页重新上传）。加「用同一批文件重跑」按钮。
- **门槛**：工作量 S；注意 `error` 行不占免费配额（已是）。

### 发现 C1-5 · 筛查后 30 天内「再来」的比例，按结果分

- **现状**：按每一份已出分的外部筛查看，之后 30 天内同一账号有没有再做任何事（再筛查或任一非 session 审计事件）：approve 6/7、conditional 7/10、decline 9/14、无 tier 7/8。但这个「再来」几乎全是同一两天内的下一份筛查。按账号看**最后一份筛查之后**：14 人里 12 人再无动作，2 人在 30 天内回来过一次（6 月、7 月各一人）然后也走了。
- **证据**：见 `deep.py` 的「RETURN WITHIN 30 DAYS」与「LAST-SCREENING」两段输出。
- **建议**：结果是 approve 的房东理论上最该留下（有人要签约了），现在 7 份 approve 之后没有任何一份租约——报告页在 approve 结论下直接放「起草安省标准租约（5 分钟）」是成本最低的一刀。
- **门槛**：工作量 S；注意 OHRC 口径——按钮只是「下一步」，不是建议录取。

### 发现 C1-6 · 真实房东最后一次审计动作停在哪

- **现状**：4 个仍在的非管理员真实账号（有房东身份或跑过筛查）最后一条审计事件：3 个是 `tenant_agent_session_started`（14 / 28 / 30 天前），1 个是 `hat_activated`（10 天前，开通房东后就没再动）；另外 2 个跑过筛查的账号没有任何审计事件（53 天前最后登录）。
- **证据**：`agent_audit_events` 按 actor 取最后一条；`last_sign_in_at` 对照。
- **建议**：「最后停在租客助理页」不是房东去找房了——9 月中旬首页 hero 还是对话框、默认租客身份，每次打开首页都会记一条 `tenant_agent_session_started`。这组数据说明 **审计事件分不清「页面打开」和「做了事」**（3,009 条里 2,535 条是 session_started）。V1.0 要先把「打开页面」从审计里拆出去（或者加 `kind=view`），否则留存分析永远看不准。
- **门槛**：工作量 S（写入侧加字段，读侧过滤）；不改历史行。

### 漏斗表（外部真实账号，排除 10 个测试号与 2 个管理员；已删账号只能从 `screenings` 反推）

| 步骤 | 人数 | 到下一步的中位间隔 | 备注 |
|---|---|---|---|
| 注册（现存真实账号） | 13 | — | 另有 ≥10 个已删账号曾跑过筛查，注册数无从查 |
| 确认邮箱 | 9 | — | 4 个从未确认 |
| 开通房东身份 | 3（现存非管理员）| 注册当天 | 另 2 个纯租客账号在 09-29 门禁前跑过筛查 |
| 第一次筛查 | 14（含已删 10）| 开通当天 | 51 份 / 14 人 |
| 第二次筛查 | 9 | 0.1 天 | 49/51 份在首筛 48 小时内 |
| 第 8 天后任意动作 | **0** | — | 这是真正的掉点 |
| 发布房源 | 0 | — | 管理员 4 套、测试 5 套，外部 0 |
| 收到申请 | 0 | — | 5 份申请全在测试房源 |
| 租约 | 0（+2 份导入旧租约）| — | 2026-08-04 一个真实账号导入过 2 份 |
| 在管租约 | 0 | — | |
| 续约 | 0 | — | |

**掉点结论**：不是某一页做不好，而是产品在「筛查报告」这一步就把房东送走了——筛查是一次性需求（有人申请才用），之后的租约 / 报修 / 续约都需要房东**把现有租约录进来**，而这一步没有任何触发、提醒或好处说明。6 家对标里 Avail / TurboTenant 的做法是把免费收租当钩子，让房东每个月都回来；我们不经手资金，可替代的「每月回来一次」的钩子是租金记录 + 到期提醒 + N 表期限（见 C3）。

---

## C2 · 对标 6 个房东工具（实读公开页面，2026-10-13）

详细摘要与引语在 `design/research/v1/landlord/*.md`（每条附 URL + ≤15 词原文）。下面只列对我们有用的结论。

| 产品 | 市场 | 收租方式与费用 | 到账 | 租约 / 电子签 | LTB / 法律表格 | 报修 | 税务 | 免费档 | 付费档 |
|---|---|---|---|---|---|---|---|---|---|
| TurboTenant | 美国 | ACH 租客付 $2/笔（Pro 免），卡 3.49% 租客付；Plaid 连银行 | ACH 5–7 工作日，付费档平台垫付 2–4 天 | 州模板 + 无限电子签 | 无 LTB；33 份表格包 $199（Notice to Pay or Quit 等，自己填期限） | 免费工单；Maintenance Plus 外包 | Schedule E；REI Hub 记账另收 | $0 刊登 / 筛查 / 收租 | $149–199/年；筛查申请人付 $55 |
| Avail（Realtor.com） | 美国 | ACH 租客 $2.50/笔（Plus 免），卡 3.5% | 3 工作日；FastPay 次日（Plus） | 律师审阅州模板 + 无限电子签 | 无；自动滞纳金 | 免费工单 + 承包商 | 自动记账、导出、1099-K | $0 不限套 | $9/套/月 |
| RentRedi | 美国 | ACH $1/笔、卡 3.1%+$0.30，默认租客付 | 2–3 工作日 | 应用内电子签 | 无 | 工单 + 成本 | Schedule E；REI Hub $25–99/月 | 无 | $12–29.95/月；筛查租客付 $39.99–49.99 |
| SingleKey | 加拿大 | Interac 或 PAD；前 3 位租客免费，之后 $5 / $3 一笔，**房东付** | 3–5 工作日 | eLease「built on Ontario's Standard Form of Lease」+ Dropbox Sign | 未读到表格生成；Rent Guarantee 含 paralegal | 未读到 | 未读到 | eLease、Pre-Screen、收租前 3 位 | 筛查 $29.99 / $44.99；Rent Guarantee 月租 3–5% |
| Openroom（房东端） | 加拿大（已注册消费者报告机构） | 无 | — | 无 | 无表格；法庭记录检索、判令欠款报 Equifax（$188/案） | 无 | 无 | 每次检索 10 条 | Plus $10/月 |
| Rent Panda | 安省 | DIY 无；托管层经 PayProp 以 PAD 为主 | 未读到 | DIY 建租约（形态未读到） | 托管层代送通知，无自助生成 | 托管层 | 托管层年报表；无 T776 | 刊登 $0–100 | 托管 $49–109/月 |

### 发现 C2-1 · 美国三家靠「免费收租」把房东留成月活；加拿大三家都没有自助收租 + 安省表格

- **现状**：TurboTenant / Avail / RentRedi 的免费档都含收租，手续费推给租客（$1–2.50 一笔 ACH）——这在安省会撞 RTA s.134（不得向租客收任何费用）。SingleKey 是唯一按安省规则做的（房东按量付、租客零费用）。
- **证据**：见各摘要的「收租」节与来源 URL。
- **建议**：若做收租，只能是「房东付、租客零费用」的 SingleKey 模式；若不做，用「租金记录 + 到期提醒 + 对账」承担同样的「每月回来」角色（C3-① 第三选项）。
- **门槛**：见 C3-①。

### 发现 C2-2 · 六家里没有一家做安省 N 表生成，这是空白

- **现状**：TurboTenant 的表格包是通用 Word / PDF，期限自己算；SingleKey 只在付费保险里给 paralegal；Rent Panda 只在托管层「代送」。我们 `lib/ontario/rules.ts` 已有 N4 7 天 / N1 90 天 / N12 120 天 / 指导比例的确定性规则。
- **证据**：`design/research/v1/landlord/turbotenant.md`「法律表格」节；`singlekey.md`；`rentpanda.md`。
- **建议**：做「期限计算 + 填好的官方 PDF + 送达记录」，不做「送达」（见 C3-②）。
- **门槛**：见 C3-②。

### 发现 C2-3 · 税务：加拿大三家都没有 T776 输出

- **现状**：美国三家围绕 Schedule E；SingleKey / Openroom / Rent Panda 没有任何 T776 行项导出。
- **证据**：各摘要「税务」节。
- **建议**：V1.0 可做「按物业的年度收支表」（毛租金 = `rent_payments` 已记录 + 维修 = 工单账单 + 房东手填的保险 / 利息 / 税），导出 CSV / PDF，表头对齐 T776 行项，**不做税务计算**（CCA 分类留给会计）。
- **门槛**：数据（`rent_payments` 现在只有「标记已付」，没有金额核对；工单账单只在服务市场工单上）；工作量 M；法规：不提供税务建议，只给记录表。

### 发现 C2-4 · 判后追债是安省房东真正的痛点，Openroom 已占住

- **现状**：Openroom 的 Rental Debt Ledger（拿到 LTB 判令后报 Equifax）是加拿大唯一的判后工具；我们注册消费者报告机构前做不了。
- **证据**：`openroom.md`。
- **建议**：注册前不做；但「租客 → 判令」这条链路的前半段（N4 → L1 的期限与证据链）正是 C3-② 的内容。
- **门槛**：法规（CRA 注册）。

---

## C3 · 两个拍板项的可行性

### C3-① 在线收租

通道费用、到账、合规原文全部在 `design/research/v1/landlord/rent-collection-channels.md`（每条带 URL 与 ≤15 词英文原文）。这里只给结论与利弊表。

#### 发现 C3-①-1 · 技术上便宜且成熟，监管上是三条合规线叠在一家新公司上

- **现状**：加拿大可用的通道——Stripe PAD（`acss_debit`）「1% + CA$0.40」封顶「CA$5.00」，T+4 成功 / T+5 可用，个人账户 90 天内「You can't win a PAD dispute」；平台用必须走 Connect，每个房东单独收 PAD 授权（https://stripe.com/en-ca/pricing · https://docs.stripe.com/payments/acss-debit）。Interac Request Money：个人房东在自家网银就能发，银行收 $0–1.50/笔；平台不能直连（一次性 $50,000 + 每月 $20,000），只能经 VoPay 一类聚合商。第三方：Rotessa 只做 PAD（$17–94/月或 $0.35–0.50/笔，NSF $30，1–4 工作日），Chexy 房东零费、租客付 1.75%，Letus（原 RentMoola）/ Payquad 只面向物业公司，Plooto 官网读不到费率。
- **证据**：FINTRAC 2022-07-21 通知把替人付账单列为汇款业务，原文点名「such as those pertaining to utilities, payroll and commission, mortgage and rent」（https://fintrac-canafe.canada.ca/notices-avis/2022-07-21-eng）；旧的商户收单豁免 PI-7670 已撤回；FINTRAC 登记库（2026-04）里 Chexy、Rotessa、Plooto、Letus、VoPay、Stripe Payments Canada **全部已登记为 MSB**。《零售支付活动法》把「the initiation of an electronic funds transfer at the request of an end user」与「transmission, reception or facilitation of an instruction」算作支付功能；加拿大银行指引：「A payment function is likely not an incidental service or business activity if it directly generates revenues」，登记费「the registration application fee is $2,500」+ 年费 + 2025-09-08 起的风险框架与资金保障（https://laws-lois.justice.gc.ca/eng/acts/R-7.36/section-2.html · https://www.bankofcanada.ca/core-functions/retail-payments-supervision/…）。Stripe Connect 平台不在 RPAA s.10「已登记 PSP 的代理」名单上，未读到任何「Connect 平台免登记」的表态。RTA s.108：租约不得要求租客「permit automatic debiting … or any other form of automatic payment」；s.134(2) 把「other person who acts on behalf of a landlord」也管进费用禁令（e-Laws 现行本）。
- **建议**：**V1.0 不做代收**。做「提醒与对账」（下表第三列）——这一列不发起、不转达、不持有任何款项，一项支付功能都不碰，又把「不经手资金」守住。
- **门槛**：再评估「做」要同时满足四条——① 消费者报告机构注册已完成并稳定运营；② 律师或 FINTRAC 政策解释就 Stripe Connect 平台的 MSB / PSP 适用性给出书面意见；③ 在管租约 ≥ 200 份且房东明确要自动扣款（现在 `rent_payments` 只有 1 行测试数据，全部是自述）；④ 能承受 RPAA $2,500 + 年费 + AML 程序的固定成本。届时首选：Connect 直接扣款 + Stripe 定价 + Stripe 承担负余额 + 只做 PAD 不做卡 + Stayloop 不收平台费（避免「直接产生收入」）+ PAD 永远是租客自愿的第二选项（s.108）。

#### 发现 C3-①-2 · 「已付」语义要先改

- **现状**：`rent_payments` 的「标记已付」是任何一方的自述，没有凭证；若接任何通道，T+5 之前都不能写「已付」。
- **证据**：`mark_rent_paid(p_lease, p_due, p_paid_on)` 只记日期与状态（2026-10-01 清债）。
- **建议**：对账版本——租客上传 e-Transfer 回执（图片 / PDF，进 `tenancy-files`）或房东确认 → 账期从「自述」变「有凭证」；房东上传银行流水 CSV → 按金额 + 日期自动对到账期；逾期即提醒；持续迟付规则（`persistentLatePayment`，RTA s.58）与 N4 期限（C3-②）直接吃这张表。
- **门槛**：工作量 S/M；法规无（不经手资金）；注意回执里有租客银行信息，只对该在管租约成员可见。

#### 利弊表：做 / 不做 / 只做提醒与对账

| | **做：Stayloop 代收（Stripe Connect PAD）** | **不做：维持现状** | **只做提醒与对账（建议）** |
|---|---|---|---|
| 成本 | PAD ≤$5/笔由房东付；若收平台费再付 $2/活跃房东/月 + 0.25%+$0.25/出款；RPAA $2,500 + 年费；AML 程序 + 律师意见 | 0 | 0（e-Transfer 由房东自家银行收，$0–1.50） |
| 合规 | FINTRAC MSB 登记（同行全部已登记）+ 加拿大银行 PSP 登记（大概率）+ 消费者报告机构注册在途 = 三条线并行 | 无 | 无：不发起、不转达、不持有 |
| 开发量 | **L**：Connect onboarding、每房东 PAD 授权（Rule H1 的 10 天确认书）、T+5 状态机、争议与负余额、退款、对账、后台风控 | — | **S/M**：回执上传 + 房东确认 + 流水 CSV 对账 + 逾期 / 持续迟付标记（规则已有） |
| 对房东价值 | 自动扣款、少追租；但 s.108 下租客可拒、Rule H1 下随时可撤、90 天内可无理由退回——「保证到账」不成立 | 自述「标记已付」，无凭证 | 有凭证的记录、逾期即提醒、N4 / 持续迟付自动算；不承诺到账 |
| 风险 | 负余额与争议责任、AML / PSP 处罚、s.134 费用转嫁争议、资金事故毁信任 | 无 | 极低：记录可被质疑，但不经手一分钱 |
| 留存作用 | 每月一次「钱到了」是最强的回访钩子 | 无 | 每月一次「该收租了 / 到账了吗 / 回执已核」——弱一档，但零监管成本 |

未读到、需人工核实：Plooto / Letus 现行费率；Payquad 支付方式；VoPay 费用；Stripe 定价模式下能否叠加 application_fee；加拿大银行 PSP 登记库（动态页）；各银行 Interac 零售价。

### C3-② LTB 表格一键生成

#### 发现 C3-②-1 · 官方表格是 Adobe LiveCycle 做的 XFA PDF，可填但不好「程序填」

- **现状**：从 tribunalsontario.ca 下载 N1 / N4 / N12 / L1 / Certificate of Service 五份 PDF 实测：全部加密（空用户密码可打开）、权限允许打印与填表、禁止修改；AcroForm 里带 `/XFA`，Producer 是 `Adobe LiveCycle Designer 11.0` / `Designer 6.5`；字段数 N1 37、N4 71、N12 77、L1 150、Certificate of Service 49；N4 / N12 / L1 版本印着「(2026/09)」，N1 是「v. 01/04/2022」。
- **证据**：表格页 https://tribunalsontario.ca/ltb/forms/ 技术说明「Do not complete the forms in your browser」；文件检查见 scratchpad `research-c/pdfinspect.py` 输出。LTB 2026-09-21 运营更新：N5 / N6 / N8 / N12 / N13 / L1 / L2 / L9 / L10 / T5 换版，「Previous versions of these forms will no longer be accepted as of November 30, 2026」，N4 通知期「is shortened from 14 to 7 days」（https://tribunalsontario.ca/2026/09/21/ltb-operational-update-legislative-changes-at-the-landlord-and-tenant-board-effective-september-21-2026/）。
- **建议**：技术路线二选一——(a) 用 pypdf / pdf-lib 往 AcroForm 字段写值并删掉 `/XFA` 节点（让 Acrobat 以外的阅读器也按 AcroForm 渲染；XFA 版式会丢，字段位置仍在）；(b) **不碰官方 PDF**，自己渲染一份「填写稿」（与官方表格逐项同序）+ 给出官方 PDF 下载链接，让房东照抄或用 Acrobat 导入 FDF/XFDF 数据。(b) 不改原件、没有版权与版本问题，先做 (b)，(a) 等用户拍板。
- **门槛**：版权——ontario.ca 版权页：非商业复制「the materials may be reproduced for non-commercial purposes」且「if no changes are made to the original content」，商业用途「may only be reproduced for commercial purposes under a licence from the King's Printer」（https://www.ontario.ca/page/copyright-information）；表格不在「legal materials」豁免里。我们是商业平台，**往官方 PDF 里填值再分发属于「改动后商业使用」，要么拿 King's Printer 许可，要么只给原件链接 + 自己的填写稿**。版本——每次 LTB 换版都要重新对字段，要有「版本号 + 字段清单」的守卫。

#### 发现 C3-②-2 · 「填表」可以，「送达」与「代填」是法律边界

- **现状**：N4 说明页列出送达方式「hand it directly to the tenant or to an adult in the rental unit」、信箱、门缝、传真、快递、邮寄，并明确「You cannot give the tenant this notice by posting it on the door」；终止日「must be at least 7 days after you give the notice」，邮寄「add five days for delivery」，快递「add one business day」；提交 L1 时须附 Certificate of Service「to tell the LTB when and how you gave the notice」（https://tribunalsontario.ca/documents/ltb/Notices%20of%20Termination%20&%20Instructions/N4_Instructions.html）。L1 只能经 Tribunals Ontario Portal 提交，费用 $201（门户 $186），须用信用卡 / 借记卡（https://tribunalsontario.ca/ltb/filing-and-fees/）。
- **证据**：《Law Society Act》s.1(5)：提供法律服务 = 「the application of legal principles and legal judgment with regard to the circumstances or objectives of a person」；s.1(6) 第 2 段：「Selects, drafts, completes or revises, on behalf of a person」…「a document for use in a proceeding before an adjudicative body」；s.1(8) 第 3 项：「An individual who is acting on his or her own behalf」不算提供法律服务（读自 vlex 转载 https://ca.vlex.com/vid/law-society-act-r-1027722544，e-Laws 页面是脚本渲染、本机读不到，上线前要在 e-Laws 核对现行文本）。
- **建议**：产品只做三件事——① **期限计算器**（已有 `n4EarliestTermination` / `n1DeadlineFor` / 指导比例，补 N12 的 60 / 120 天与「租期末日」校验、L1 的「N4 终止日之后才能提交」）；② **按房东自己录入的事实生成填写稿**（房东是「acting on his or her own behalf」，我们是文具，不替他选表、不判断该不该发——界面上不出现「你应该发 N4」这类话，只在房东点了「我要发 N4」之后帮他算日期、对字段）；③ **送达记录**（房东自己填「几月几日、什么方式、给了谁」，系统按方式算视为送达日，并生成 Certificate of Service 的填写稿），**绝不代送、不代提交 L1、不收门户费**。AI 助理的回复里保留现有「这不是法律意见，LTB 表格由你本人送达」的措辞。
- **门槛**：法规——避免落入 s.1(6)「selects…on behalf of」：不替房东选表、不按情况推荐、填写稿的每个值都来自房东输入或租约行；工作量 M（期限 + 填写稿 + 送达记录三块）；数据——租约行要有「租金到期日、欠款账期」（`rent_payments` 已有 due_date / status）。

#### 发现 C3-②-3 · 与现有 N 表工具箱的差距

- **现状**：`app/landlord/leases/page.tsx` 的 N 表工具箱是 5 张卡（N1 / N2 / N4 / N12 / N13），每张只有「规则一句 + 把一句话预填给 AI 助理」；AI 回复的是文字核对清单，没有任何可下载的东西，也不读租约行里的到期日 / 欠款。`lib/ontario/rules.ts` 已有：N1 90 天、指导比例按生效年份、N4 7 天 + 邮寄 5 天、N12 120 天免补偿、N13 多伦多许可证、2026/09 版本与 11-30 截止。
- **证据**：代码只读；审计里 `executed_*` 从未出现过任何 N 表相关事件。
- **建议**：V1.0 把工具箱改成「选租约 → 选表 → 自动算日期并标红不合规 → 填写稿 PDF + 官方表格链接 → 记录送达」。每一步都是确定性代码，不经模型。
- **门槛**：工作量 M；法规见上；版权见 C3-②-1。

---

## C4 · 房东与经纪的交接：「房东找经纪 → 经纪在自己公司系统挂 MLS → 我们只记 MLS 号与链接」

只读了 `app/api/delegations/*`、`lib/delegations/shared.ts`、`components/agent/ClientBook.tsx`、`lib/agent/clientBook.ts`、`app/dashboard/listings/quick/page.tsx`、`lib/listingPublish.ts`、`components/AgentPicker.tsx`、`app/listings/[slug]/page.tsx`、`components/delegations/MyDelegations.tsx`、listings 相关迁移。

#### 发现 C4-1 · 委托只能由经纪发起，房东没有「找经纪」的入口

- **现状**：`POST /api/delegations` 的调用者必须是 RECO 注册有效的经纪，且客户行是经纪自己在 `agent_clients` 里录的（要先填客户邮箱 + 两个 TRESA 日期）；房东侧只有 `/delegate/<token>` 确认页和 `/settings` 的「我委托的经纪」列表（只能撤销）。`AgentPicker`（认证经纪目录）只挂在房源详情页与申请页，给**租客**用；房东工作台任何页面都没有「找认证经纪」。
- **证据**：`app/api/delegations/route.ts` 第 20–45 行的前置检查；`grep AgentPicker` 只命中 `app/listings/[slug]`、`app/apply/[slug]`。
- **建议**：补房东侧入口——房东在 `/dashboard` 或房源卡上点「找经纪挂牌」→ 从 `agent_directory` 选人 → 给经纪发一条「房东想委托你出租这套房」的消息（走现有 `agent_client` 对话或新建 `listing_inquiry` 式线程）；经纪收到后在自己的客户表里建行、记 TRESA 日期、再按现有流程发委托。**方向反过来，但确认权仍在房东、TRESA 文件仍由经纪记录**，不改既定的「Stayloop 不做经纪业务、不收费」。
- **门槛**：工作量 M（一个弹窗 + 一个线程 kind 或复用 `agent_client`，加一条「房东发起的待办客户」状态）；法规——目录展示「注册名 · 头衔 · 经纪公司」已合规（O. Reg. 567/05 s.12.1），不做派单、不排序、不收费。

#### 发现 C4-2 · 委托的 `listing` 范围没有任何代码落点

- **现状**：`DELEGATION_SCOPES` 有 `listing`（「替房东处理房源、申请人与筛查」），`DELEGATION_ACTIONS` 有 `screen / message / view_documents / draft_lease`。真正被检查的只有 `screen`（筛查行的 `delegation_id` 守卫与 RLS）；`listings` 表的 RLS 与守卫触发器只认 `landlord_id` 本人，`lib/listingPublish.ts`、`app/dashboard/*`、`app/api/listings/*` 里没有一处读 `delegations`。经纪不能替房东建 / 改房源，也不能在房源上记 MLS 号。
- **证据**：`grep -rn delegation app/dashboard lib/listingPublish.ts app/api/listings` 为空；`lib/delegations/shared.ts` 第 8–22 行。
- **建议**：V1.0 不要让经纪在 Stayloop 上「挂牌」（没有 MLS 数据，挂在这里没意义）；只需让**房东自己**（或经有效 `listing` 委托的经纪）在房源上写三样东西：`mls_number`、`source_url`（经纪公司或 Realtor.ca 的公开房源页链接，只存链接不读取）、`brokerage / broker_name`（列已存在）。
- **门槛**：数据——列都在（`mls_number`、`source_url`、`brokerage`、`broker_name`、`broker_phone`，`0000_prod_baseline_core.sql`）；工作量 S（表单 + 一条 RLS 或 RPC 让 `listing` 范围的委托可写这三列）。

#### 发现 C4-3 · 一填 MLS 号就会被当成 Realtor.ca 导入房源

- **现状**：`computeListingSource(form)`：`mls_number` 非空或 `source_url` 含 realtor.ca → `source='realtor'`；而 `source='realtor'` 在全站意味着「Realtor.ca 导入 · 没有 Stayloop 房东」——详情页写「来源 Realtor.ca」、申请页与看房请求被触发器 `guard_listing_accepts_requests` 拒绝、上架天数不显示、联系卡改成「找认证经纪」。房东自己填 MLS 号的房源会因此**收不到申请**。
- **证据**：`lib/listingPublish.ts` 第 31–32 行；`app/apply/[slug]/page.tsx` 第 151、262 行；`app/listings/[slug]/page.tsx` 第 476、793、1029、1049 行；`supabase/migrations/20261002_realtor_no_apply.sql`。
- **建议**：把「来源」和「有没有 MLS 挂牌」拆开：`source` 只表示谁创建（stayloop / realtor-import），另加 `mls_listing` 信息块（号 / 链接 / 经纪公司 / 经纪人 / 记录日期），详情页显示「同时挂在 MLS®：经纪公司 · MLS 号 · 打开 ↗」，申请与看房照常走 Stayloop 房东。PropTx 拒信之后 `realtor` 来源行已全部归档，改这条不影响线上数据。
- **门槛**：工作量 S–M（一个判定函数 + 两处守卫触发器的条件 + 详情页一行）；法规——只存房东 / 经纪自己填的号与链接，不读取、不抓取 MLS 页面，不与 PropTx 拒信冲突；MLS® 是 CREA 注册商标，展示时用「MLS® 号」并注明由房东提供。

#### 发现 C4-4 · 快速发布页没有「我已经找了经纪」这条路

- **现状**：`/dashboard/listings/quick` 第一屏只有地址 / 单元 / 月租 / 照片 + AI 看图；没有经纪 / MLS 字段，也没有「这套房已由经纪挂牌，我只想用 Stayloop 收申请 / 筛查 / 签约」的分支。
- **证据**：`app/dashboard/listings/quick/page.tsx` 的字段清单（grep `mls|agent|brokerage` 为空）。
- **建议**：快速发布第二屏加一个可折叠块「已有经纪挂牌？」（经纪公司、MLS 号、链接三格，可空）；房东事实上最常见的组合是「经纪挂 MLS 带客，房东自己用 Stayloop 筛查签约」，这正是 C1 里 approve 之后没下文的那批人。
- **门槛**：工作量 S；依赖 C4-3 先拆开 `source`。

#### C4 小结：需要补的东西（按顺序）

1. 拆开 `source` 与 MLS 信息块（C4-3）——S–M，前置。
2. 房源表单 / 快速发布加「经纪公司 · MLS 号 · 链接」（C4-2、C4-4）——S。
3. 房东侧「找经纪」入口 + 反向发起的委托（C4-1）——M。
4. `listing` 范围委托真正落地（经纪可写 MLS 三列、可看申请队列）——M；在 1–3 之后。

---

## 缺口清单（按「能把房东留到下一步」排序）

| # | 缺口 | 留到哪一步 | 工作量 | 门槛 |
|---|---|---|---|---|
| 1 | 筛查报告末尾没有「下一步」：approve → 起草标准租约 / 决定通知；报告页与申请队列是两条入口 | 筛查 → 租约 | S–M | OHRC 措辞（只是下一步，不是建议录取） |
| 2 | 筛查后没有任何回访触发（第 3 / 14 天邮件、录入现有租约的好处说明） | 筛查 → 在管租约 | S | 邮件额度（Resend 5 万 / 月，绰绰有余） |
| 3 | 失败的筛查没有「同一批文件重跑」出口（外部房东 24% 错误率时期全部流失） | 第一次 → 第二次筛查 | S | 无 |
| 4 | N 表工具箱只会「让 AI 说一句」：补期限计算 + 填写稿 + 送达记录（C3-②） | 在管租约 → 每月回来 | M | 版权（不改官方 PDF）、Law Society Act s.1(6)（不代选表） |
| 5 | 租金记录只有「标记已付」：补对账视图 + 到期 / 逾期提醒给房东 + 与 N4 期限联动（C3-① 第三选项） | 每月回来 | M | 不经手资金 → 无 FINTRAC / RPAA 问题 |
| 6 | 审计分不清「打开页面」与「做了事」（84% 是 session_started），留存分析失真 | 度量 | S | 无 |
| 7 | 注册确认邮件 4/13 未点：查 Auth 日志、加「没收到？重发」 | 注册 → 进门 | S | Auth 日志 7 天 |
| 8 | MLS 号一填就变成「Realtor.ca 导入」，收不到申请（C4-3） | 发布 → 申请 | S–M | 只存号与链接，不读 MLS |
| 9 | 房东侧没有「找经纪」入口，委托只能经纪发起（C4-1） | 发布 → 经纪挂牌 | M | TRESA 文件仍由经纪记录 |
| 10 | 年度收支表（T776 行项）导出（C2-3） | 年底回来 | M | 不做税务计算 |
| 11 | 在线收租（C3-①）——见利弊表后再定 | 每月回来 | L | FINTRAC / RPAA / 持有资金 / RTA s.108 |
| 12 | 删号时注册日与来源随 auth 行消失，漏斗不可追溯 | 度量 | S | 隐私页写明保留的字段 |

---

## 附：取数与排除的细节

- 现存 auth 用户 23：测试 10（`test_account` 4、`muse_account` 4、`@stayloop.ai` 其他 2）、真实 13。
- `landlords` 9 行：测试 4、真实 5（含 2 个管理员；plan：free 4、pro 1 = 管理员直接开通）。
- `screenings` 239：测试 7、真实 232（管理员 181、外部 51）。外部 51 份的归属：10 个已删账号 40 份、4 个现存账号 11 份。
- `listings` 148：Realtor.ca 导入 139（已归档）、`[TEST]` 3、管理员 4、测试号 2。
- `applications` 5（全在测试房源）、`lease_documents` 6（真实导入 2、测试 4）、`households` 2（测试）、`rent_payments` 1（测试）、`maintenance_tickets` 10、`work_orders` 12、`delegations` 2、`household_invites` 2、`showing_intents` 7——以上除 2 份导入租约外全是测试数据。
- `agent_audit_events` 3,009：`*_session_started` 2,535、`*_agent_turn` 244、其余 230。
- 30 天「再来」的定义：同一 actor 在该筛查之后 30 天内出现任一新筛查行或任一非 `_session_started` 的审计事件。
