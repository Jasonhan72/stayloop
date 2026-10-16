# V1.0 调研线 A · 租客工具（2026-10-13）

> **法规核查后的修正（2026-10-13，详见 `legal-check-2026-10.md` 清单 1–6）**：「租客侧永远不能收费（RTA s.134）」应读作——s.134 禁的是与房源相关 / 替房东行事的收费，全免费是产品决定；s.47.0.1 只适用于房东未按书面要求提供标准租约的情形；s.106(9) 押金可从随后任一期租金扣、不限最后一月；「替租客查房东的评价报告同样落在 CRA」改为「对个人房东可能落入（需律师意见），公司房东不适用」；「5 个工作日存入信托」出处是 O. Reg. 567/05 s.17(1)；LTB 手册原句为 "is not permitted to act as a representative in an LTB proceeding"。

调研员：Claude（租客工具线）。方案：`design/v1-research-plan-2026-10.md` 第 1 节。
规矩：只读仓库代码，没有改任何项目文件；对标产品的页面摘要在 `design/research/v1/tenant/<产品>.md`（每个文件带抓取日期、URL 清单、未能读取的 URL）；法规原文在 `design/research/v1/tenant/legal-boundaries-a4.md`。
两个硬约束贯穿全文：**没有 MLS 房源数据**（不提任何 MLS / DDF / 抓取方案）；**消费者报告机构尚未注册**（注册前不对外开放按姓名查公开记录）。租客侧永远不能收费（RTA s.134）。

**没做的**：方案要求用 muse-tenant 号实测截图，本轮按任务只读代码；A3② 的「20 个问题实测准确率」没有跑模型，只做了「能不能答、靠什么答」的代码对照。

---

## A1 · 八个产品的租客侧对标

数据来源：八个文件各自的 URL 清单与原文短引（≤15 词）。下表只摘结论，引文与 URL 在各文件里。

| 产品 | 市场 | 注册 | 申请包 / 租客档案 | 看房 | 租约解释 | 报修 | 续约 / 退租 | 争议 | 向租客收费 | AI |
|---|---|---|---|---|---|---|---|---|---|---|
| Rentals.ca | 加 | 邮箱 + 密码 + 姓名，只为收藏与提醒 | **无**（房东可对 lead 发起 Certn 信用检查，租客收邮件去同意） | 房源页「Request a Tour」 | 无 | 无 | 无 | 只有反欺诈页 | **不收**（Certn 报告房东付 $20+税/份） | 租客侧无；源码有未公布的 `ai_search` 开关 |
| liv.rent | 加（BC 为主，安省有） | 姓名 / 邮箱 / 密码 + **短信验证**；证件正反面 + 自拍 | **Renter Resume**（一份档案 = 申请表，可复用）+ Trust Score 0–100 | 视频看房、站内聊天 | 数字租约（BC / 安省标准租约）签署，不解释条款 | 无工具 | 平台内续约，到期转月租 | 指向 RTB，平台「无义务协助」 | **免费**（只付支付手续费；Trust Score 报告房东付） | 「AI Smart Filters」+ Trust Score 的算法；无对话 / 代办 |
| Zumper | 美为主 | 免费 | **无**（2026 年初停办自营申请与筛查，之前申请人付 $35） | 「Tour this place」三个时段 | 博客 | 博客 | 博客 | AAA 仲裁 | 只有卡付房租手续费 | Zoe（房源页 24/7 问答 + 订看房）；ChatGPT 内的 Zumper app |
| Openroom | 加（安省） | 免费，不要信用卡 | **无申请包**；「档案」= 判令里出现的名字 + 被上报的欠款 | 无 | 无 | 无 | 无 | 争议中心（判令 / 同名 / 欠款 / 信用，10 天内审） | 查询免费；Plus $10/月；Rental Debt Ledger $188/案 | 内部 Nika Bot 抽判令字段；无面向租客的 AI |
| RentCafe (Yardi) | 美 + 加 | Applicant Portal → Resident Portal 同账号 | 每套房源单独申请；可上传 portable tenant report | 房源页直接约（免注册） | 续约要约在门户电子签 | app 内报修（帮助中心无文章） | 续约电子签；退租无说明 | 「找物业」 | 申请费由物业定 $25–75；付租卡费 2.95% 等；上报征信免费 | Chat IQ（卖给物业的 AI 坐席：排看房、报修、催租、续约） |
| Avail | 美 | 免费 | **Renter Profile**：一份申请 + TransUnion 报告 $55，链接分享多个房东、30 天复用、可撤销 | 无 | 先签后签流程，不解释 | 工单 + 照片 + 工单内消息 | 到期提醒；退租「不提供」 | 平台外；与 Avail 仲裁 | 筛查 $55（通常申请人付）、银行转账 $2.50（房东免费计划时）、CreditBoost $3.95/月 | **无** |
| Rent Panda | 加（安省） | 免费（看照片要登录） | 无（档案对所有房东可见；筛查在房东侧 Smart Screening） | 「Request a Showing」 | 无 | 条款提到工单，无功能 | 无 | 无（评价不能申诉） | **不收** | 无 |
| ChatGPT / Gemini | — | 免费版有限次 | 无 | 无（无执行通道） | 能讲，但引用会编（研究：幻觉率高） | 无 | 能讲 | 无 | 免费 / 付费档 | 全是 AI；无本地房源、无你的租约数据、代办只给付费档 |

### A1 的几条结论

1. **「一次准备、多次复用」的申请包在加拿大只有 liv.rent 做了**（Renter Resume），美国的 Avail 也做了（Renter Profile，30 天内复用、可撤销）。其余加拿大产品（Rentals.ca、Openroom、Rent Panda）租客侧没有档案。这是我们能做而且合法免费的空位。
   - 证据：`liv-rent.md`「申请包 / 租客档案」行；`avail.md` 同行；`rentals-ca.md`「**没有**租客档案」。
2. **没有一家给租客解释租约、处理报修、续约、退租和争议**——要么是博客，要么指向 RTB / LTB / 物业。RentCafe 的 Chat IQ 是卖给物业的，不站在租客一边。
3. **向租客收费的只有美国产品**（Zumper 旧 $35、Avail $55、RentCafe 申请费）；加拿大三家都不收。安省 RTA s.134 下这不是选择题。
4. **通用 AI 的短板正是我们的长板**：没有你的租约、没有执行通道、法律引用会编（`generic-ai-chatgpt-gemini.md`：Tribunals Ontario 2025-04 实务指引「AI results can be wrong」；LTB 案例 Shakori v Tern 2025 ONLTB 31233 租客提交的 ChatGPT 判例 "were fictitious"）。我们有真实租约、确定性法规事实包、只追加的沟通记录、待批卡执行。
5. **Openroom 的租客侧是「查判令 + 争议更正」**，自称安省注册的消费者报告机构；这正是我们注册前不能碰的那块，也说明注册后可以做什么（s.12 / s.13 流程已排进 V0.8）。

**不抄的**：Avail / RentCafe 的申请费与支付手续费；Openroom 的「查房东」评价报告（同样落在 CRA）；RentCafe 的 AI 催收；Zumper 的仲裁条款。

---

## A2 · 我们自己的租客链路走查（只读代码，2026-10-13）

说明：方案里写的是用 muse-tenant 号实测；本轮按任务要求只读代码，没有登录实测。每一步写：入口 · 能做什么 · 空页面 / 示范数据 / 断点。生产基线（方案第 0 节）：在架房源 5 套且全是测试房源，申请 5 份、在管租约 2 份，几乎全是测试号的数据。

### A2-1 首页「问一句」→ 助理预览

- **现状**：`components/home/HeroComposer.tsx` 的 10 个轮换示例里 5 个是租客的（King West 一房、看房该问什么、禁宠条款、涨租 5%、Liberty Village 两房）；输入框左侧选身份（默认租客，示例轮换不改它）；提交 = `router.push(assistantPromptHref(role, q))` → `/tenant/agent?prompt=…&send=1`，到达即发出。匿名预览限 15 次 / IP / 小时、全站 600 次 / 小时（`lib/agent/anonLimits.ts`）。
- **证据**：`HeroComposer.tsx` 第 39–49 行 `HERO_EXAMPLES`；第 72–74 行 `heroSubmit`；`lib/agent/anonLimits.ts` 第 4–5 行。
- **断点**：匿名预览不记忆、不落库、不能出卡片（`AgentWorkspacePage.tsx` 第 162 行：未登录且用户发过话后 `chatCards` 为空）。访客问「禁宠条款有效吗」能得到回答，但问「帮我找房」得到的是下一条的结果（库里 0 套真实房源）。
- **建议**：首页示例保留法规类问题（这是现在真能答好的），找房类示例改为「某区一房的行情 / 平均租金」（行情卡来自 CMHC / 统计局，匿名也能出）。
- **门槛**：工作量 S；无法规门槛。

### A2-2 `/tenant/agent`（`components/agent/AgentWorkspacePage.tsx`）

- **现状**：登录后 = 左侧对话列表（`ThreadList`）+ 中间对话 + 右侧 `AssistantPanel`（待办 · 记忆 · 设置）。四张引导卡（`lib/agent/intake.ts`）：帮我找房（5 步）、解读租约（3 步）、发起报修（7 步）、盖下一枚章（2 步）。租客模型只能提两种待批卡：`send_message`（给**现住处**房东）与 `maintenance_request`（`lib/agent/prompts.ts` 第 144–157 行 `KEY_ACTIONS` / `ACTION_RULE` / `CONTACT_RULE`）。
- **证据**：`intake.ts` 第 186–370 行；`prompts.ts` 第 144–160 行；`AgentWorkspacePage.tsx` 第 68、162、170–248 行。
- **断点**：① 「盖下一枚章」引导卡（`intake.ts` 第 351 行）背后的四枚章是示范数据（见 A3①），引导完了只能得到文字说明。② 租客没有在管租约时，`send_message` 执行器 `resolveTenantLandlord` 找不到房东 → `no_landlord_on_file`（`app/api/agent/execute/route.ts` 第 628–674、941–947 行）；也就是**没把租约导进来的租客，AI 替他写好的信发不出去**。③ `解读租约` 引导卡让用户「上传文件或贴条款」，但 turn 路由对非图片附件只在提示里写一句「[用户上传了文件：xxx]」（`app/api/agent/turn/route.ts` 第 582–586 行），**不抽取 PDF 文本**——租约 PDF 实际没被读。
- **建议**：① 对话里接 PDF 文本抽取（`lib/forensics/pdf-text.ts` 已有，边缘 polyfill 已解决），让「解读租约」真的读到租约；② 没有在管租约时，`send_message` 退化为「生成信件 + 一键复制 / mailto」，不要只报错。
- **门槛**：① M（复用 pdf-text，加长度与成本上限）；② S。无法规门槛。

### A2-3 找房（`lib/agent/listingSearch.ts`）

- **现状**：2026-10-13 起只查 Stayloop 自有房源（`REALTOR_LIVE_READS = false`），附 CMHC / 统计局基准行情卡（`readRentBenchmark`），再给 Realtor.ca / Rentals.ca / Kijiji 的跳转链接（`buildExternalLinks`）；硬约束（预算 / 户型 / 宠物）从消息与记忆确定性推导（`lib/agent/hardConstraints.ts`）；一页 6 套 + 「换一批」。
- **证据**：`listingSearch.ts` 第 4、13、237、274–319、341 行；生产在架 5 套全是 `is_test`。
- **断点**：真实租客问「帮我找房」几乎必然得到 0 套 + 三个外链。行情卡是 CMHC 在住单元调查均值与统计局 CMA 季度挂牌价，不是该社区此刻的挂牌。
- **建议**：把「找房」在产品上重新定义为「找房前的准备 + 行情参考 + 外站链接」，而不是房源检索；首页与角色页文案已改，但引导卡标题仍叫「帮我找房」并有 5 步。
- **门槛**：工作量 S（文案与引导卡）；房源数据本身是硬约束，不在本线解决。

### A2-4 `/listings` 与 `/listings/[slug]`

- **现状**：浏览页走 `/api/listings/search`（服务端筛选、≤100 / 页、地图范围、按来源分组、「套用我的偏好」读 `user_memories`、收藏在本机）。详情页：入住前费用一览（`MoveInCosts`，按省份）、租客保险报价入口（`TenantInsuranceCard` → Rates.ca，Stayloop 不承保）、租金记录（匿名只看最新一行）、「预约看房 / 向房东提问」（`ShowingRequestModal`，需登录，写 `showing_intents` + 房东待批卡 + `listing_inquiry` 对话）、「找认证经纪」（`AgentPicker`）、「申请」（`/apply/<slug>`）。
- **证据**：`app/listings/page.tsx` 第 23–30、101、164、187、252–282 行；`app/listings/[slug]/page.tsx` 第 17–19、29–30、335、747–748、818、1029–1058、1253–1264 行。
- **断点**：全部在架房源带「测试房源 · 非实际房源」标签（`isTestListing`）；看房请求必须登录（匿名访客点了只看到「登录后继续」）。
- **建议**：详情页的三块「与房源无关也有用」的内容（入住前费用、保险入口、租金记录说明）可以抽成独立的租客工具页（例如「签约前算一算」），不依赖房源。
- **门槛**：S。

### A2-5 `/apply/[slug]`

- **现状**：匿名也可提交（匿名 INSERT 策略 + `recent_application_count` 限流）；表单 ≈ 30 个字段（姓名、邮箱、电话、生日、现住址、雇主 / 职位 / 月收入 / 入职日 / 雇主联系方式、前房东与前住址、人数 / 宠物 / 吸烟 / 入住日、备注）+ 四类文件（证件、工资单、对账单、在职信；魁北克不收证件）+ 两个勾选（筛查同意、信用查询同意）。登录后只预填姓名与邮箱（`user_metadata`）。
- **证据**：`app/apply/[slug]/page.tsx` 第 22–27、103–115、120–131、234、300–331、410、618–622、641–644、737–764 行。
- **断点**：**每套房源重填一遍，文件重传一遍**——表单数据与文件都挂在 `applications` 行与 `<application_id>/` 前缀下，没有任何「我的档案」可复用；预填只有两个字段。Realtor 导入房源与自家房源被拒（设计如此）。
- **建议**：见 A3①「申请包」。
- **门槛**：M（见 A3①）。

### A2-6 `/tenant/applications`（含 `[id]`）

- **现状**：DEMO_GATE 页（`WorkspaceShell.tsx` 第 61 行），`liveSlot` 渲染真实的 `MyApplications`（六步追踪：已提交 → 房东已查看 → 筛查已发起 → 决定 → 租约待签 → 在管租约；`lib/lifecycle/applicationTrack.ts`）与 `MyShowings`。详情页 `/tenant/applications/[id]`：进度、下一步说明、材料份数、租约状态、申请对话（`ThreadPanel kind=application`）、「发消息给房东」、婉拒时的 s.10(7) 提示；**不显示分数**（视图 `applicant_applications` 无评分列）。
- **证据**：`app/tenant/applications/page.tsx` 第 118 行；`[id]/page.tsx` 第 47–144 行；`applicationTrack.ts` 第 39–52 行。
- **断点**：没有申请时的空态写「让 AI 助理开始找房」，而找房没有房源（A2-3）。示范段仍是 Mia / Sarah / Unit 1207。
- **建议**：空态改为「先准备申请包」（A3①）。
- **门槛**：S。

### A2-7 签约 `/lease/sign/[token]` 与 `/tenant/lease`

- **现状**：房东从申请起草安省标准租约 → `send_lease` 执行器发邮件 → 租客凭链接打开 → 输入法定全名作为电子签（`Electronic Commerce Act, 2000` 说明）→ 房东回签 → 自动建在管租约 + 首月账期。`/tenant/lease` 只有在管租约列表（`HouseholdList`）与保险入口是真的，租约条款、签署进度、AI 解读都是示范数据（`SAMPLE_NOTE`）。
- **证据**：`app/lease/sign/[token]/page.tsx` 第 111–175 行；`WorkspaceShell.tsx` 第 128 行；`app/tenant/lease/page.tsx` 第 9、126、135–136 行。
- **断点**：① 签署页没有「签之前逐条讲给你听」——角色页承诺的「签约前逐条解读」只在示范段里；② 租客自己拿到的纸质 / 外部租约（多数情况）只能走 `/leases/import`（AI 抽取 → 确认 → 邀请房东）。
- **建议**：签署页接 A2-2 的租约解读（同一份租约 JSON 已在 `lease_documents.terms`，不用 OCR）；`/tenant/lease` 的示范段改为真实租约的条款卡（有在管租约时）。
- **门槛**：M。

### A2-8 在管租约 `/join/[token]` → `/h/[id]`

- **现状**：接受邀请需登录（拒绝不需要，拒绝会标 disputed）；中心四个标签：概览（租期时钟、成员、待接受邀请、入住清单、续约意向面板）、对话（租约线程，只追加 + 哈希链）、租金（`mark_rent_paid`，按多伦多日期判逾期；房东侧有还款计划草稿）、报修（`MaintenancePanel`：工单状态机、三方对话、验收、评价）。
- **证据**：`app/h/[id]/page.tsx` 第 62、100–102、158、172、276–279、350–597 行；`app/join/[token]/page.tsx` 第 59–71 行。
- **断点**：租金只是「记录」，没有收付；租客端没有「我被多收了 / 房东没给收据」这类工具；概览的续约意向面板只在 30 天触点邮件之后才有意义。
- **建议**：见 A3③。
- **门槛**：—。

### A2-9 报修

- **现状**：两条路：① `/tenant/maintenance` 的 `NewTicketModal`（需有在管租约成员身份；≤5 张照片；`isEmergencyMaintenance` 命中即 high 并引 RTA s.20；插入后 `/api/maintenance/notify` 邮件 + 推送房东 + 派单建议卡）；② 对话 `maintenance_request` 执行器（同样要求 household；重复报修并入已开工单）。
- **证据**：`components/tenant/NewTicketModal.tsx` 第 75–139 行；`app/api/agent/execute/route.ts` 第 665–700 行（`no_household_on_file`）。
- **断点**：没有在管租约 → 弹窗显示「没有可发送的房东」+ `/leases/import` 链接，提交禁用；对话里出卡批准后 422。**房东不在 Stayloop 的租客**，报修要先导入租约并邀请房东（房东不接受邀请也能发，邀请中的一方走邮件通知）。
- **建议**：见 A3③。

### A2-10 续约意向与退租

- **现状**：续约由房东侧的 90 / 60 / 30 扫描驱动（`lib/agent/renewalStages.ts`）；30 天触点邮件带 `?intent=renew|leave|negotiate` 链接到 `/h/[id]`，租客在概览页选意向 + 备注（`renewal_intents`，明写「只是意向不是 N9」）。对话里命中 `RENEWAL_INTENT_RE` 时注入 `renewalPlaybook`（RTA 事实包 + 真实租约条款 + 行情卡 + 可起草回信）。退租：生命周期 rail 的「退租 N9（60 天）」步骤只链到 `/rules`；全站没有 N9 生成、没有退租清单、没有押金利息计算（grep `106(6)` / `depositInterest` 为空）。
- **证据**：`renewalStages.ts` 第 10、47、410–436 行；`app/h/[id]/page.tsx` 第 143–158、356 行；`lib/agent/prompts.ts` 第 96–135 行；`lib/lifecycle/stages.ts` 第 375–391 行。
- **断点**：租客侧续约只有「回应」，没有「发起」（例如租客想提前问房东要不要续、或想谈降租）；退租整段是空的。
- **建议**：见 A3③。

### A2-11 其他租客页（示范数据状况）

| 页面 | 真实部分 | 示范部分 | 证据 |
|---|---|---|---|
| `/tenant/payments` | `MyRent`（事实 RPC 的 `rent_all`） | 「立即支付」不扣款，整页示范 | `WorkspaceShell.tsx` 第 65–72 行 note |
| `/tenant/move-in` | `MoveInChecklist`（13 项） | 示范段写「押金 $2,800 转入 Stripe 托管」——Stayloop 不经手资金，这段示范与事实相反 | `app/tenant/move-in/page.tsx` 第 222–251 行 |
| `/tenant/passport` | 分享链接、API 范围勾选、租金上报候补（存 `user_memories`） | 四枚章状态、查看记录、验证历史 | `WorkspaceShell.tsx` 第 124 行；`passport/page.tsx` 第 180–255 行 |
| `/tenant/passport/sharing` | 无 | 全部 | DEMO_GATE 第 98 行 |
| `/onboarding/tier1` | 无（照片只留本机） | 全部 | `app/onboarding/tier1/page.tsx` 第 26–30 行 |
| `/tenant/audit` | `LiveAuditLog` | 空态 | DEMO_GATE 第 102 行 |
| `/disputes` | 两条外链 | 全部虚构 | CLAUDE.md 2026-08-24 节 |

- **建议**：`/tenant/move-in` 的「Stripe 托管」示范段删除或改为事实（押金只能是最后一个月租金，交给房东，有利息）；这一段若被租客当真会误导。
- **门槛**：S；法规门槛 RTA s.105–106（见 A4）。

## A3 · 三件事的深挖

### A3① 申请材料包 / 租客护照：能否做成「一次准备、多次复用」

**现状（代码事实）**

| 部件 | 状态 | 文件 |
|---|---|---|
| `rental_passports` 表 | 2026-05 建了表但全站没有写入方；旧 `/api/trust/verify` 因查它而被删 | `supabase/migrations/20260509_v5_schema.sql` 第 50 行；CLAUDE.md「V0.6 收尾」 |
| `tenants.tier` | 列在，默认 1，没有任何界面写它 | 同上第 27–35 行 |
| 四枚章（身份 / 收入 / 银行 / 信用+法庭） | 页面文案与图标（`lib/passportStamps.ts`），状态是示范 | `app/tenant/passport/page.tsx` 第 37–70 行 |
| 本人授权核验（Veriff / Flinks / Equifax） | 真实流程，但**只能由房东从一条筛查记录上发起**（`/api/verify/create` 要求 `mayScreen` + `hasProAccess`），结果快照挂在 `screenings.verification` | `app/api/verify/create/route.ts` 第 13–40 行；`lib/verify/store.ts` |
| 申请表 | 每套房源一份，约 30 字段 + 4 类文件，只预填姓名邮箱 | A2-5 |
| 分享链接 `/p/<token>` | 真实：姓名缩写 + 四章状态（无核验则不显示）+ 按时付租记录（只认双方确认的在管租约或双签租约） | `app/p/[token]/page.tsx` 第 20–148 行 |
| Stayloop API `passport/verify` | 真实，读 `verification_requests.steps` 与已确认租史，按 `api_scopes` 过滤 | CLAUDE.md「Trust API 重建」 |

**结论**：现在没有「租客自己拥有的档案」。一切核验都从房东的筛查发起，租客只能被动等房东发链接；申请表与文件按房源各存一份。

**建议的「申请包」（与 CRA 注册解耦的做法）**

原则：申请包里的每一项都是**申请人自己提供或自己授权第三方出具**的，Stayloop 不替任何人去查任何人——这与《消费者报告法》无关（消费者自己向房东出示自己的资料不是「消费者报告」，见 A4-6）。按姓名查法院 / LTB 记录那一枚章在注册前不做，也不要以「本人授权」名义绕过。

需要的数据（新表 `applicant_profiles`，`auth_id` 主键，本人 RLS，anon 无权）：

| 组 | 字段 | 来源 | 复用到 |
|---|---|---|---|
| 身份 | 法定姓名、电话、现住址、生日（可选，只用于本人同意的信用查询） | 本人填写；可选 Veriff 结果（姓名 + 证件末四位，不存证件图） | `/apply` 预填；`/p/<token>` |
| 雇佣与收入 | 雇佣状态、雇主、职位、入职日、月收入、雇主联系方式 | 本人填写；可选 Flinks 入账摘要（`payroll_monthly_estimate`） | `/apply` 预填 |
| 租史 | 前住址 / 前房东 / 起止 / 租金 / 搬离原因（可多段） | 本人填写；Stayloop 内双方确认的在管租约自动补一段 | `/apply` 预填；`/p/<token>` |
| 文件 | 证件、工资单（2–3 个月）、对账单、在职信、自取的征信报告（Equifax / TransUnion 免费消费者披露，本人上传） | 本人上传到 `tenant-files/profile/<auth_id>/…`，服务器算 SHA-256，记上传日期 | `/apply` 一键附上（复制到 `<application_id>/` 前缀，现有 RLS 不变） |
| 同意 | 版本化同意文本（沿用 `lib/verify/consent.ts` 的机制）、每次出示的对象与范围 | 本人勾选 | 审计 |
| 新鲜度 | 每份文件的 as-of 日期（`lib/forensics/recency.ts` 已有判定） | 系统算 | 申请前提醒「工资单已 95 天，建议更新」 |

需要的界面：
1. `/tenant/passport` 改为真实的申请包页：分段填写 + 文件 + 新鲜度 + 「预览房东看到的样子」；四枚章改为「已核验 / 自述」两种标记（有 Veriff / Flinks 结果时标「已核验」，否则「自述」），**不再显示「信用 + 法庭章」**，直到 CRA 注册。
2. `/apply/[slug]` 顶部「用我的申请包填写」：预填全部字段、勾选要附的文件；仍可逐项改。
3. 租客自己发起核验：复用 `/verify/<token>` 的三步，但 token 由租客为自己铸造（新路由 `POST /api/verify/self`，无需筛查记录，无需 Pro）。费用由 Stayloop 承担（RTA s.134 不能向租客收；Veriff / Flinks 都按次计费——这是真实成本，要有每账号次数上限）。
4. 对不在 Stayloop 的房东：「导出申请包 PDF」（浏览器打印，同筛查报告的做法）+ 现有分享链接。

门槛：
- 法规：PIPEDA 限制收集（只收租房需要的）；OHRC 申请表不得问受保护特征（现表单没有问，保持）；魁北克不收证件复印件（现有 `fileKindsFor` 规则沿用）；RTA s.134 不得向租客收费。
- 数据：Veriff / Flinks 生产凭证仍未到位（CLAUDE.md 项目状态），自发起核验在拿到凭证前只能是「未开通」。
- 工作量：表 + RLS + 页面 + 预填 + PDF 导出 ≈ L（约 2 周）；自发起核验 M（复用现有三步）。

### A3② 租约解读与权利：租客最常问的 20 个安省问题，对照我们能不能答

**来源**：20 题与每题的官方答案、法条、URL、原文引语在 `design/research/v1/tenant/top20-tenant-questions.md`（LTB 手册 7 份、ontario.ca 3 页、stepstojustice 7 页、settlement.org、ACTO、多伦多供暖条例、e-Laws API 的 RTA 现行版；「常问」依据是 stepstojustice 住房法 26 个问题标题、settlement.org 21 个、ACTO 文章题目与 r/TorontoRenting 的话题统计——Reddit 具体帖子打不开，是该文件写明的缺口）。

**对照方法**（只读代码，没有跑模型）：「事实包里有」= `lib/agent/prompts.ts` 的 `RTA_RENEWAL_FACTS` / `BILL60_FACTS` / `MAINTENANCE_TRIAGE_RULES`，或 `lib/ontario/rules.ts` 的 `ONTARIO_RULES`（25 条）明确写了；「只靠模型」= 提示词没有，模型凭训练知识答（会错、会编条号——正是 `generic-ai-chatgpt-gemini.md` 记录的通用 AI 问题）；「工具」= 有确定性函数或页面。

| # | 问题（top20 文件编号） | 法条 | 事实包里有？ | 工具 | 能答到什么程度 |
|---|---|---|---|---|---|
| 1 | 押金能收多少？损坏 / 宠物押金？ | s.105–106 | 有（`RTA-106-deposit-cap`） | `MoveInCosts` 卡（房源页） | 能答，有页面 |
| 2 | 钥匙押金 / 申请费 / 锁定费？ | s.134、O. Reg. 516/06 s.17 | 有（`RTA-134-no-fees`、`OREG516-17-key-deposit`） | 同上 | 能答 |
| 3 | 必须用安省标准租约？没给副本？ | O. Reg. 9/18、s.12、s.47.0.1 | 有（`OREG9-18-standard-lease`、`RTA-12-copy-21-days`） | 无 | 能答；「21 天没拿到可扣租 / 可 60 天解约」只靠模型 |
| 4 | 能要求预开支票 / 自动扣款？ | s.108 | **无** | 无 | 只靠模型 |
| 5 | 申请表能问什么？收入 3 倍 / 无信用会被拒？ | Code s.2(1)、O. Reg. 290/98、OHRC | 有（`OHRC-no-income-cutoff`、`OHRC-protected-grounds`） | 申请表本身不问受保护特征 | 能答 |
| 6 | 涨多少 / 多久一次 / 提前多久？ | s.116、s.119、s.120、s.6.1 | 有（`RTA_RENEWAL_FACTS`，按生效年份 2.1 / 1.9%） | `guidelineFor` / `n1DeadlineFor` 只给房东侧 | 能答；缺租客侧「核对 N1」工具（A3③ N1） |
| 7 | 东西坏了谁修？不修能扣租？ | s.20、s.29、s.33–34 | 有 s.20（`RTA-20-landlord-repairs`、分诊规则）；T6 / 扣租风险无 | 报修工单 | 能答义务；后续路径只靠模型（A3③ R1） |
| 8 | 房东能随时进来？ | s.25–27 | 有（`RTA-27-entry-notice`、`RTA-26-emergency-entry`） | 进入通知在工单里 | 能答 |
| 9 | 暖气几度？找谁？ | 多伦多 heat by-law（21°C）、s.21 | **无** | 无 | 只靠模型（市政条例分城市） |
| 10 | 能自己装空调？ | s.36.1 | 有（`RTA-36-1-tenant-ac`） | 无 | 能答 |
| 11 | 「禁宠」能养吗？ | s.14 | 有（`RTA-14-no-pet-clause`） | 合规检查 | 能答 |
| 12 | 能转租 / 转让？ | s.95–98、s.134(3) | **无** | 无 | 只靠模型（A3③ M3） |
| 13 | 合租 / 与房东同住保护一样吗？ | s.5(i)、Code s.21(1) | **无** | 无 | 只靠模型 |
| 14 | 骚扰 / 侵犯隐私怎么办？ | s.22–23、s.29、s.31（T2） | **无** | 无 | 只靠模型 |
| 15 | N12 自住 / 卖房必须走？补偿？ | s.48–49、s.48.1、s.57 | 有（`RTA-48-1-n12-120-days`） | 无 | 能答 |
| 16 | 想搬走提前多久？什么表？ | s.44、s.47 | 有（`RTA-47-n9-60-days`） | 无（rail 只链 `/rules`） | 能答原则；日期与表格入口没有（A3③ M1） |
| 17 | 到期必须搬 / 必须续签？ | s.38 | 有（`RTA-38-month-to-month`） | 无 | 能答 |
| 18 | 押金怎么退？利息？ | s.106(6)(9)(10) | 有（`RTA-106-deposit-interest`，info） | 无计算器 | 能答原则（A3③ M2） |
| 19 | 固定租约没到期能提前解约？ | s.47.0.1、s.47.1（家暴 28 天）、s.95(4)、s.16 | **无** | 无 | 只靠模型（A3③ M3） |
| 20 | 欠租 N4 会马上被赶走？听证要等多久？ | s.59、s.74、s.82–83 | 有（`RTA-59-n4-7-days`、`RTA-82-half-arrears`）；听证时长无 | `/h/[id]` 持续迟付提示 | 能答 N4；LTB 程序只靠模型 |

**统计**：20 题里 **14 题事实包有依据**，**6 题完全只靠模型**（#4 预开支票、#9 室温、#12 转租转让、#13 合租与同住、#14 骚扰、#19 提前解约），另有 3 题答一半（#3、#7、#20 的后续程序）。只靠模型的题里，#12 / #13 / #19 恰是社区最常问的（`top20` 文件：r/TorontoRenting 旗标 Sublet、Roommate 28 帖）。

- **现状**：RTA 事实包只在「续约意图」命中时注入（`app/api/agent/turn/route.ts` 第 390 行 `RENEWAL_INTENT_RE`）；`lib/ontario/rules.ts` 的 25 条规则**没有注入租客对话**（只用于房源 / 租约检查与 `/rules` 页）；其余租客问题走基础提示词 + 模型知识。
- **证据**：`prompts.ts` 第 87–135 行；`turn/route.ts` 第 390–411 行；`rules.ts` 第 138–321 行。
- **建议**：① 做一份「租客事实包」，按主题分块（费用与押金 / 涨租 / 维修与进入 / 退租与解约 / 驱逐与通知 / 歧视与拒租 / LTB 程序与代理），每块带条号与 `/rules` 链接，按问题关键词命中注入（与续约专线同一机制），并要求模型「事实包没有的直说不确定 + 给 LTB / Steps to Justice / Tenant Duty Counsel 入口」；② 把 6 + 3 题缺的事实补进 `rules.ts`（s.108、s.95–98、s.47.0.1 / 47.1、s.5(i)、s.22–23 / s.31、多伦多 heat by-law、LTB 代理规则），每条按 10-02 外省法规的标准附原文——`top20` 文件里的引语可以直接用；③ 跑方案要求的实测准确率（每题三次、人工判分，先跑一遍记录基线，再在事实包注入后重跑）。
- **门槛**：法规——只做信息，不做个案法律意见（A4-5）；工作量 ① M、② S、③ S。

### A3③ 入住后的报修 / 续约 / 退租：闭环还缺什么

对照 `lib/agent/renewalStages.ts`、`lib/marketplace/*`、`app/api/agent/execute/route.ts`：

**报修（现有）**：租客建单 → 房东收邮件 / 推送 → 派单（自己的联系人或已核验服务商）→ 报价 → 房东批准（进入通知 s.27 / s.26）→ 到场 → 完工 → 验收 → 线下付款 → 评价；三方对话；工单对话里的系统行；证据导出。

**报修缺口**：
| # | 缺口 | 证据 | 建议 | 门槛 |
|---|---|---|---|---|
| R1 | 房东不响应时租客没有下一步：RTA s.20 之后的路径（书面催告 → 市政 311 / RentSafeTO → LTB T6）在产品里没有 | `maintenanceTriage.ts` 只做分诊；`lib/ontario/rules.ts` 只有 `RTA-20-landlord-repairs` 一条 | 工单 N 天无响应（可配 7 天）→ 租客侧出一张「升级」卡：生成给房东的书面催告（进租约对话，正式通知副本）+ 市政投诉入口（多伦多 311 / RentSafeTO）+ T6 说明 | 法规：只给信息与模板，不代填 LTB 表（见 A4-5）；工作量 M |
| R2 | 没有在管租约就不能报修 | A2-9 | 租客导入租约时允许「房东不在平台」：工单仍建在租客的 household，通知走邮件（现有邀请中走邮件的机制已支持），对方不接受邀请也能留证据 | S |
| R3 | 报修照片只在工单里，没有「入住 / 退租对照」 | `MoveInChecklist` 不存照片（CLAUDE.md P2） | 入住清单的照片项允许上传（同 `tenancy-files`），退租时并排 | M |

**续约（现有）**：房东侧 90 / 60 / 30 三阶（续约函 A/B、60 天 N1 截止日知悉、30 天意向询问）；租客侧意向回复 + 对话谈判剧本（RTA 事实 + 真实租约 + 行情卡 + 起草回信）；外省按各省规则。

**续约缺口**：
| # | 缺口 | 证据 | 建议 | 门槛 |
|---|---|---|---|---|
| N1 | 租客收到 N1（纸质 / 邮件）时没有「核对工具」：涨幅是否 ≤ 指导线、是否满 90 天、是否 12 个月一次、单位是否 2018-11-15 后豁免 | `guidelineFor` / `n1DeadlineFor` 都在 `lib/ontario/rules.ts`，但只给房东侧用 | 租客侧「核对涨租通知」：输入当前租金 / 新租金 / 送达日 / 生效日 / 首次入住年份 → 确定性判定 + 引用；可上传 N1 照片由模型抽字段再确定性核对 | S（纯函数已有）；法规：只核对，不下「无效」结论，给 LTB 链接 |
| N2 | 租客不能主动发起续约谈判（没有房东卡时） | 续约由房东 cron 驱动 | 租客侧 `renewal_intents` 允许在到期前 120 天内任何时候提交，并给房东一张「租客想谈续约」卡 | S |
| N3 | AGI（超指导线申请）场景无内容 | 事实包只有一句 | 加 LTB AGI 页面链接与租客可做的事（出席听证、索取材料） | S |

**退租（现有）**：无。

**退租缺口**：
| # | 缺口 | 建议 | 门槛 |
|---|---|---|---|
| M1 | N9 退租通知：日期计算（60 天、终止日须是租期最后一天 / 月租期末日）、表格下载链接、送达方式说明 | 确定性日期计算 + 链到 LTB 表格；不代填 | S；法规 RTA s.44、s.47 |
| M2 | 押金（最后一月租金）与利息：s.106(6) 每年按指导线付息、s.106(10) 抵最后一月 | 计算器 + 一句「房东若未付息可从最后一月租金里扣」（引用） | S |
| M3 | 提前解约：转租 / 转让（s.95–98）、N11 双方同意、s.47.1–47.2（家暴）| 信息页 + 给房东的转让请求信模板（进租约对话） | S–M；法规见 A4 |
| M4 | 退租清单：入住照片对照、钥匙交还、转寄地址、最后一次检查、取消水电 | 复用 `MoveInChecklist` 的结构 | S |
| M5 | 退租后租史进申请包（A3①）：双方确认的在管租约自动生成一段租史 + 按时付租记录 | 已有 `/p/<token>` 的判定逻辑可复用 | S |

---

## A4 · 法规边界：租客侧不能做的事

原文、URL、逐条含义在 `design/research/v1/tenant/legal-boundaries-a4.md`（法条全部经 e-Laws 的 `ontario.ca/laws/api/v2` 接口取得现行合并版原文；LSO By-Law 4 与 O. Reg. 43/24 只拿到摘要，已标明）。这里只列结论与对租客工具的约束：

| # | 不能做 | 法条（原文在 A4 文件） | 对租客工具的约束 |
|---|---|---|---|
| 1 | 向租客 / 申请人收任何费用（含「替房东代收」） | RTA s.134(1)(a)(b)、(2)、(3)；允许项只有 O. Reg. 516/06 s.17 清单 | 申请包、核验、解读、报修、续约工具全部免费；Veriff / Flinks 的按次成本由 Stayloop 承担，要设次数上限 |
| 2 | 押金超过一个月租金 / 任何损坏押金 / 预开支票或强制自动扣款 | RTA s.105(1)、s.106(2)(6)(10)、s.108 | 入住前费用卡、退租计算器只认「最后一月租金 + 可退钥匙押金」；利息按当年指导线 |
| 3 | 按受保护特征筛租客；收入比截止线 | Human Rights Code s.2(1)；O. Reg. 290/98 s.1(3)(4)、s.4；OHRC「30% cut-off rule is illegal」 | 申请包不问受保护特征；不显示任何「你的收入够不够」判定 |
| 4 | 代收 / 代持 / 代发租金 | 联邦 FINTRAC MSB（「remitting or transmitting funds」须注册）；联邦 RPAA s.2（「holding of funds on behalf of an end user」= 支付功能，须向央行登记）；TRESA s.27（只约束经纪） | 租金只「记录」不经手（既定决定）；「立即支付」示范段要删 |
| 5 | 替租客做法律代理（LTB 出庭、以租客名义谈判法律权利、起草程序文件并自称代理） | Law Society Act s.26.1、s.1(5)(6)；LTB《Who Can be a Representative》：未持牌者「will not be permitted to act as a representative」 | AI 只做信息与模板；每个「升级到 LTB」的出口都给 Tenant Duty Counsel / 社区法律诊所 / LSO 名录；不替租客填 T2 / T6 并提交 |
| 6 | 按姓名查公开记录并出具给房东 | Consumer Reporting Act 定义「consumer report」/「personal information（mode of living）」；s.3 注册；s.9(3)(b) 佐证；s.12 / s.13 查档与争议 | 注册前：`CRA_MODE=tool`；申请包里不做「信用 + 法庭章」；也**不做「替租客查房东」的评价报告**（同样是消费者报告） |
| 7 | 过度收集个人信息 | PIPEDA s.5(3)、Schedule 1 4.3.3、4.4；OHRC 不要 SIN | 申请包只收 O. Reg. 290/98 允许的五类 + 联系与签约必需；不收 SIN；逐项同意、同意不作使用条件 |
| 8 | 未经本人同意拉征信；拒绝不通知 | CRA s.8(1)(b)、s.10(2)(6)(7)；O. Reg. 290/98 s.1(1) | 自发起核验用版本化同意；租客侧可做「谁查过我的档案」提示（s.12(3)） |

---

## 缺口清单（按「租客会不会因此回来」排序）

排序依据：A1 里竞品都没做、A2/A3 里我们已有一半、不触法规门槛、且能在没有房源数据的前提下独立成立的，排在前面。工作量 S ≈ 1–2 天、M ≈ 1 周、L ≈ 2 周以上。

| 序 | 缺口 | 租客为什么会回来 | 现状（证据） | 工作量 | 门槛 |
|---|---|---|---|---|---|
| 1 | **申请包：一次准备、多次复用**（A3①） | 每申请一套房都要重填 30 个字段、重传 4 类文件；加拿大只有 liv.rent 做了 | `/apply` 只预填姓名邮箱；`rental_passports` 表无写入方；四枚章是示范 | L | PIPEDA 限制收集；不收 SIN；不做「法庭章」（CRA 注册前） |
| 2 | **租客事实包 + 20 问答得准**（A3②） | 通用 AI 会编条号；这是我们现在就能比 ChatGPT 做好的事 | 事实包只在续约意图注入；6 题完全靠模型（转租 / 室友 / 骚扰 / 提前解约 / 室温 / 预开支票） | M + S | 只做信息，不做个案法律意见（A4-5） |
| 3 | **对话里真的读租约 PDF**（A2-2 ③、A2-7） | 「解读租约」引导卡现在只传文件名；角色页承诺「逐条讲给你听」 | `orchestrator.ts` 第 183–209 行只传图片；`turn/route.ts` 第 582–586 行 | M | 成本上限（每次抽取字数）；外省租约按该省规则 |
| 4 | **核对涨租通知（N1）工具**（A3③ N1） | 首页第 7 个示例就是这题；确定性函数已有 | `guidelineFor` / `n1DeadlineFor` 只给房东侧 | S | 只核对、不下「无效」结论，给 LTB 入口 |
| 5 | **退租三件套：N9 日期、押金利息、退租清单**（A3③ M1 M2 M4） | 退租整段是空的；每个租客都会经历 | rail 只链 `/rules`；无计算器；`MoveInChecklist` 可复用 | S×3 | RTA s.44 / 47 / 106 |
| 6 | **报修升级路径（房东不响应之后）**（A3③ R1） | 报修是租期中最常见的事；现在只到「发出去」 | 只有 s.20 一条规则与分诊 | M | 给 311 / RentSafeTO / T6 信息，不代填 |
| 7 | **没有在管租约也能发信 / 报修**（A2-2 ②、A3③ R2） | 多数租客的房东不在 Stayloop | `send_message` → `no_landlord_on_file`；报修弹窗禁用 | S | 邮件中转（已有机制） |
| 8 | **自发起核验（身份 / 银行）**（A3①-3） | 让「已核验」标记不依赖房东发链接 | `/api/verify/create` 要筛查记录 + Pro | M | Veriff / Flinks 生产凭证未到位；费用 Stayloop 担、要限次 |
| 9 | **租客主动发起续约 / 谈判**（A3③ N2、N3） | 现在只能等房东的 30 天邮件 | `renewal_intents` 只在触点后有入口 | S | — |
| 10 | **提前解约 / 转租 / 转让信息与信件模板**（A3③ M3） | 社区最常问的题 | 无 | S–M | 信息 + 模板，不是法律代理 |
| 11 | 首页与空态文案对齐「没有房源」的现实（A2-1、A2-3、A2-6） | 现在三处把人引向一个会返回 0 套的找房 | `HeroComposer` 5 个租客示例里 2 个找房；DEMO_GATE 空态 | S | — |
| 12 | 删掉与事实相反的示范段（`/tenant/move-in` 的 Stripe 托管、`/tenant/payments` 立即支付） | 被当真会误导，而且违反既定决定 | A2-11 | S | RTA s.105–106；不经手资金 |
| 13 | 租史自动进申请包（A3③ M5） | 退租后带走记录 | `/p/<token>` 判定逻辑可复用 | S | 只认双方确认的租约 |

**不做 / 不在本线**：MLS 房源数据；按姓名查公开记录（注册前）；向租客收费的任何功能；代收租金；LTB 代理；「替租客查房东」的评价报告。
