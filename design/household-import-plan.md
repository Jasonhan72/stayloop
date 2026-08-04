# 存量租约导入 → 在管租约(Household)设计方案

> 2026-08-03 定稿的功能设计。目标:任何一方(租客/房东/经纪)把**已经签好的租约**上传进系统,
> 邀请相关方加入,然后这套房的日常管理——对话、报修、租金提醒、续约——都在 Stayloop 里进行。

## 0. 为什么这个功能是战略级的(而不只是一个新页面)

当前生产数据说明了一切:`screenings` 177 行是全站唯一真实活动;`lease_documents`、
`rent_payments`、`maintenance_tickets`、`applications` 全部 **0 行**。房东侧能用(背调是
一次性动作),而**所有租客界面都在渲染默认值**——因为没有任何东西把「一套真实存在的租约关系」
带进系统。

e-sign 流程(lease/send/sign)只覆盖「在 Stayloop 里从头签」的新租约——但市场上 99% 的
租约已经签完了。**存量租约导入是把真实租约关系灌进系统的唯一现实入口**,它一次性激活:

- 租客工作台(payments / maintenance / passport 的租金准时记录)
- 房东工作台(leases / maintenance / finance)
- Agent 大脑(Luna/Logic 的 proactive 续约雷达、租金提醒 executor——**这些代码已存在,在等数据**)
- 三方互通(v5.4 设计主张的 agent_threads,一直没有落地场景)

并且把商业模式从「一次性背调 $X」延伸到「持续在管 → 订阅/增值」。

## 1. 核心对象模型

```
households                     ← 新表:容器,跨续约存续
  id uuid pk
  address / unit / city
  monthly_rent numeric         ← 当前租期的
  rent_due_day int             ← 每月几号
  start_date / end_date        ← 当前租期
  current_lease_id → lease_documents.id
  status: active | ended
  source: imported | esign     ← e-sign 流程后续也挂进来
  created_by uuid (authId)
  verified boolean default false   ← 见 §4,双方确认后才 true
  created_at

household_members              ← 新表:RLS 锚点
  household_id → households
  user_id uuid (authId, 统一用 auth.users.id —— 不碰 landlords.id,不复活 tenants)
  role: landlord | tenant | agent | property_manager
  status: active | left
  joined_at
  unique(household_id, user_id)

household_invites              ← 新表:照抄 passport_share_tokens 的成熟模式
  household_id, token (≥32 字符, ^[A-Za-z0-9_-]+$ CHECK), invited_email,
  invited_role, invited_by, expires_at (14 天), accepted_by, accepted_at,
  revoked_at, created_at

household_messages             ← 新表:成员间对话(人↔人,不是 agent 聊天)
  household_id, sender_id, body text (clamp), created_at
  (MVP 轮询/Supabase Realtime 订阅;已有浏览器直连 supabase 的客户端模式)

maintenance_tickets            ← 已存在(0 行):加 household_id 列(additive),
                                  listing_id 改为可空。NewTicketModal UI 已建好,只差数据。

rent_payments                  ← 已存在(0 行,lease_id → lease_documents):不动 schema。
                                  导入时创建一行 lease_documents(status='imported'),
                                  household.current_lease_id 指向它。

lease_documents                ← 已存在:新增 status 取值 'imported'(上传的已签租约,
                                  不走 sign_token 流程)。pdf_path 指向上传文件。
```

**为什么容器是新表而不是复用旧 `tenancies`**:那张表(0 行、零消费者)是「租史评价」形态
(prior_landlord_name / rating_stars / on_time_payments),概念是一段**过去的**租住历史的单
边评价;household 是**进行中的**多方协作容器。硬塞会两头不像。旧表保留不动,将来做租史
验证时再启用。

**为什么导入也创建 lease_documents 行**:`rent_payments` 按 lease_id 挂;护照公开分享页
(/p/[token])的租金准时记录按 `lease_documents.tenant_email` 解析;proactive 续约雷达扫
的是 lease_documents。**创建这一行,三个既有消费者免费点亮**;不创建,就要三处双轨。

**Dual-ID 纪律**:所有新表 user 键一律 authId。`lease_documents.landlord_id` 存 profileId
的坑(已文档化)只在读它时按既有双解析处理,新表不引入。

## 2. 用户流程

### 2a. 上传(任何角色)
1. 入口:三个工作台 + /dashboard 各放「导入已有租约」CTA → 统一路由 `/leases/import`
   (读 useAuth 的角色着色,不分三个页面)。
2. 选自己的身份(租客/房东/经纪)→ 上传租约 PDF/照片(可多文件)。
3. **AI 抽取 + 人工确认**:复用 classify-files + Vision 抽取模式,抽 地址/单元/租金/
   due day/起止日期/双方姓名。抽取结果**必须**让用户确认修改后才落库——抽取是加速器,
   不是事实来源(本项目的既定纪律)。
4. 落库:households + 本人 member 行 + lease_documents(imported) + 文件入
   `tenancy-files` bucket(新 bucket,路径按 household_id 分区,storage RLS 只允许成员)。

### 2b. 邀请
1. 上传人填对方 email(可多个:房东+租客+经纪)+ 对方角色 → 生成 invite token →
   Resend 发邀请信。
2. 对方点链接 → `/join/[token]`:未登录先走 magic link 注册/登录(**认领时按邀请角色
   claim**——注意 claim_landlord() 现在一律插 role=landlord,要支持按 invited_role 设定,
   否则被邀租客会拿到房东角色)。
3. 落地页明示:「X 邀请你以租客身份加入 123 Main St 的在管租约;上传的租约写明租客为
   YYY」→ 对方可**先看租约原件**再决定接受/拒绝。
4. 接受 → member 行 active;拒绝 → invite 标记 declined 并通知上传人,落地页提供
   「要求删除我的信息」入口(PIPEDA 姿态,见 §4)。

### 2c. 加入后点亮什么(全部是既有代码接上数据)
- **对话**:household_messages 线程(成员间)。Phase 2 让 Luna/Logic 起草消息进线程
  (/api/agent/execute 的 send_message + isKnownCounterparty 扩展到 household 成员)。
- **报修**:tenant/maintenance + landlord/maintenance 两页从 demo fixture 切到真数据
  (沿用 applicants 页「有真数据用真数据,零数据回落样本+标注」的既定模式)。
- **租金提醒**:由 rent_due_day 生成月度 rent_payments 行;租客标记已付/房东确认——
  **只做提醒+记录,不碰资金流**(见 §6)。proactive cron 的月末 rent_reminder 扫描
  + executor 已存在,把扫描源从 lease_documents 扩到 households 即通。
- **续约雷达**:proactive 的 renewal-window 扫描 + Logic 的 A/B 续约信 + TRREB 行情卡,
  现在有真实租约喂它了。这是导入功能最大的免费红利。
- **护照**:租金记录经 lease_documents.tenant_email 进入 /p/[token] 的准时记录。

## 3. RLS 要点

- households / household_messages / maintenance_tickets(household 域)/ 文件 bucket:
  一律 `EXISTS (select 1 from household_members m where m.household_id = X
  and m.user_id = auth.uid() and m.status='active')`。
- household_members:成员可见同组成员;任何 active 成员可发邀请(经纪上传后要同时邀
  房东和租客);退出只能退自己;创建者可移除成员(记审计)。
- household_invites:**无 anon/authenticated 直读策略**,接受走 SECURITY DEFINER RPC
  (`accept_household_invite(token)`),建函数当天就 `revoke from public, anon`——
  这是 20260728 和 LTB 两次踩过的同一个坑,写进迁移注释。
- 邀请频控:复用 durable rate-limit RPC 模式(每用户每日邀请上限,fail-closed)。

## 4. 信任模型与防滥用(这个功能最深的坑)

**原则:导入的一切都是自述数据(self-asserted),不产生任何公开信任背书。**

- household 完全私密,只有受邀成员可见——伪造租约的收益面≈0(骗不到第三方,只能骗
  你有 email 的那个人,而对方接受前能看到租约原件)。
- `verified=false` 起步;**对方接受邀请并点「确认租约信息无误」= 双方确认**,才翻
  verified=true。这个状态才允许喂给护照盖章/租史等信任面。单方上传永远不够格。
- 姓名软校验:加入者姓名 vs 租约抽取姓名不一致 → 黄条提示,不阻断(名字合法地各种写法)。
- 拒绝邀请的一方可要求删除:上传的租约含对方 PII;处理双方签署的合同属合理目的,但
  拒绝后要给出口(标记 household 为 disputed + 提供删除请求路径)。
- 邮件内容防钓鱼:邀请信不放租金等敏感数字,只有地址 + 邀请人 + 角色。

## 5. IA 与路由

```
/leases/import          上传向导(角色自适应)
/join/[token]           邀请落地页(公开路由,token 门)
/h/[id]                 household 中心(共享壳,角色着色):
                        文档 · 成员 · 对话 · 租金 · 报修 五个 tab
各工作台既有页            列出我的 households,深链进 /h/[id] 对应 tab
```

选共享 `/h/[id]` 而不是三套角色页:一个 surface,三方看同一份事实,只有强调色随角色。
WorkspaceShell 已支持角色主题。

## 6. 明确不做的(本期)

- **资金流**(Stripe 代收租金/押金托管):提醒+记录足够激活场景;碰钱引入合规、对账、
  退款整套复杂度,等在管量证明需求再做。
- 存量租约的 e-sign(已有独立流程)。
- 多单元/整栋批量导入、房东会计报表。
- agent_threads 三方 AI 互通(Phase 2 之后,household_messages 先给它铺了地基)。

## 7. 分期

**Phase 1(MVP,约一个整会话)**
迁移(households/members/invites/messages + maintenance_tickets 加列 + lease status
'imported')→ /leases/import 上传+抽取+确认 → 邀请/接受闭环 → /h/[id] 五 tab(租金 tab
是展示+手动标记)→ 工作台列表接入。邮件只发:邀请、接受通知。

**Phase 2**
proactive 租金提醒/续约雷达接 households;Luna/Logic 注入 household 上下文与 send_message;
报修状态流转通知;双方确认 → verified 翻转 → 护照租金记录点亮。

**Phase 3**
verified household 喂租史/盖章;Stripe 收租(若需求验证);经纪佣金场景。

## 8. 风险与预算

- **Resend 100 封/天**:邀请+接受通知很省;Phase 2 的提醒/通知要按 household 每日聚合
  (digest),并把这条写进 cron。超量时 $20/月 解决。
- **抽取质量**:租约版式千奇百怪,确认步是兜底;抽不出就让用户手填,不阻断。
- **被邀者转化**:落地页是无账号状态下的第一触点,值得做好(显示邀请人/地址/角色 +
  租约预览须登录后)。
- **claim 角色**:invited_role 驱动 claim 的 role,是唯一要动老 RPC 的点,单独小心。
