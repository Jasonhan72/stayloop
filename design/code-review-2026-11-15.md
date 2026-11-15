# 全站代码审查 2026-11-15

审查对象：分支 `v5.3-launch`（`b1b7a3f`），线上版本 ship100 `efd44319`，Supabase 项目 `uotcczsfeiptnabamzcd` 的线上现状。
这一轮只审不改：没有改业务代码、没有部署、没有跑迁移。数据库验证全部在会回滚的事务里以测试号身份试跑（`tenant-test` / `landlord-test`，非管理员），没有写入生产数据。

## 修复记录

**2026-11-15 · ship101 `98c6be6d`（提交 `b1b7ad4`，迁移 `20261115_code_review_s0_s1`，守卫 `tests/codeReview20261115.spec.ts`）：S0-1 与 S1-1 至 S1-5 已修并在生产复测。S2 / S3 共 63 条未动。**

| 条目 | 怎么修的 | 生产复测 |
|---|---|---|
| S0-1 | 导出路由的委托查询拆成两次参数化查询（`delegationsOfMatter`），不再拼 `or=()`；`lease_documents.tenant_email` 加格式约束，三处写入表单先提示 | 带逗号的邮箱建租约返回 400 `23514`；房东导出自己的事务 200 |
| S1-1 | `search_ltb_orders` 函数体内判断身份（房东帽子 / 注册有效的经纪 / 管理员；service role 不受影响），删掉 `/api/ltb-search` | 租客测试号 403 `42501`，房东测试号 200；旧路由 404 |
| S1-2 | `landlords` 的 FOR ALL 策略换成只管 UPDATE 的策略，撤销 anon / authenticated 的 DELETE 与 TRUNCATE | 房东测试号 DELETE 返回 403 `42501` |
| S1-3 | 新增共用的 `lib/db/ilikeExact.ts`，两处照改；守卫另外扫出第三处 `lib/profile/history.ts:149`，一并改掉；原来两份私有副本改为引用 | 代码与守卫 |
| S1-4 | 新增 `lib/afterResponse.ts`（挂 `waitUntil`，本地无上下文时照常跑），25 处悬空的通知 / 派单建议 / 邮件接上去；日扫里的 3 处改成 `await` | 租客测试号真实报修一张 `[TEST]` 工单：同一秒出现 `work_order_dispatch_no_candidate` 审计行并给房东发了说明邮件（该房东没有可派的服务商，所以是「无人可派」分支而不是出卡） |
| S1-5 | `tokenStillParty` 的 `listing_inquiry` 分支补上房东复核（与 `application` 分支同一做法） | 代码与守卫；没有在生产上发真实邮件复现 |

**2026-11-15 · ship102 `195757d1`（提交 `a69e664`，迁移 `20261115b_code_review_s2`，守卫 `tests/codeReviewS2_20261115.spec.ts`）：31 条 S2 里修了 27 条。**

没修、等你定的 4 条：**S2-6**（委托范围是否限制事务访问，产品决定）、**S2-31**（隐私页里的 MLS 表述，法律文本，可能牵涉 `TERMS_VERSION`）、**S2-10** 与 **S2-11**（深度核查付费闸、免费档额度，都在筛查模块里，那是不能动的区域）。**S2-9** 只做了收窄：核验请求的租客邮箱在对方同意后不能再改；「按房东填的邮箱归属」这个根本问题要在 Veriff / Flinks 生产凭证到位前重新设计。

| 条目 | 怎么修的 | 验证 |
|---|---|---|
| S2-1 | `agent_pending_actions` 加 UPDATE 守卫触发器：直接客户端只能改待批卡内容、把卡退回 / 作废；批准只经 `decide_pending_action`，已执行的卡只读，已决定的卡不能复活 | 生产：直接批准、改角色、改已批准卡、复活已作废卡均 403 `42501`；编辑待批卡、RPC 批准、撤销均 200 |
| S2-2 | 看房卡的租客身份取自 `tenants` 行，不再读卡片 metadata | 代码与守卫 |
| S2-3 | `tenants` 加守卫：`tier` / `email` 对本人冻结；`claim_tenant` 只认领 `auth_id` 为空的行 | 生产：租客把 tier 改 3、邮箱改别人，返回仍是 1 与本人邮箱 |
| S2-4 | 删除筛查先核对所有者；文件路径限定在本筛查目录或所有者目录 | 代码与守卫；未知 id 404 |
| S2-5 | 一键筛查的「已有筛查」改用调用者自己的客户端查 | 代码与守卫 |
| S2-7 | 四处校验合成 `lib/auth/sameSitePath.ts`，拒绝控制字符与反斜杠并按 origin 复核；无人引用的 `AuthModal` 里那份也换掉 | 单元测试（含制表符绕过的原始用例）；没有在浏览器里复现 |
| S2-8 | `isMlsHost` 去掉主机名尾部的点；读取器返回的最终地址再判一次 | 单元测试 |
| S2-12 | `checkout.session.completed` 分支补写续费日与卡信息 | 代码与守卫；生产没有真实订阅可验 |
| S2-13 | 新增 `underMailLimits`（调用者桶 + 全站桶，fail-closed）与 `ipBucket`（IPv6 按 /64）；contact、notify-landlord、consumer/request、agent-intake、household/invite 五处接入；邀请的计数查询失败不再按 0 放行 | 代码与守卫；没有为了验证去真实打满限流 |
| S2-14 | `household/extract` 每账号每小时 20 次；`classify-files` 加持久限流与筛查角色门 | 生产：租客调 classify-files 403 `role_required`，房东通过角色门 |
| S2-15 | 自报的 `X-Client-Id` 同时计入调用方 IP 的桶 | 生产：带 client id 的请求后出现 `v1:rules:ip:` 桶 |
| S2-16 | MCP 批量上限 20 条 | 生产：21 条 400「batch too large」，3 条 200 |
| S2-17 | 合规事件的写入改经 `afterResponse` 真正发出 | 没能在生产复现：两次诱导都被模型自己拒绝，守卫没有触发；表约束允许这组取值 |
| S2-18 | 预览不再保存房东邮箱 | 代码与守卫 |
| S2-19 | 催租卡去重看全部状态 | 代码与守卫 |
| S2-20 | 对话行以 `last_message_at` 当版本：条件写入，冲突时把对方追加的消息按原位置并入 | 单元测试（模拟 cron 在页面背后追加） |
| S2-21 | 下架分支 upsert 改 update 并检查结果，邮件如实说明 | 代码与守卫 |
| S2-22 | `agent-proactive-daily` 加 300 秒超时 | 线上 `cron.job` 命令已带超时 |
| S2-23 | 哈希链触发器拿到锁之后重新取号；规范格式 `stayloop-thread-v1` 不变 | 回滚事务里连插两条，链与哈希复算一致；生产全表 0 处断链 |
| S2-24 | `dispute` 与 `cancel` 可从 `rework` 发起 | 单元测试 |
| S2-25 | 「Fully executed」日期按多伦多 | 代码与守卫 |
| S2-26 | `useHats` 失败后按 1 / 3 / 8 / 15 秒重试 | 代码与守卫 |
| S2-27 | N 表工具箱切换租约丢弃迟到的响应 | 代码与守卫 |
| S2-28 | 派单策略读失败时不标记已加载、不允许保存 | 代码与守卫 |
| S2-29 | 外省工单进入通知写本省法规名、不引安省条款与时段；安省的 24 小时 / 8–20 校验只对安省生效；报修邮件同理 | 单元测试 |
| S2-30 | 经纪 rail 提示词改成 Stayloop 在租挂牌 + CMHC / 统计局基准 | 代码与守卫 |

试跑迁移时抓到一个自己写出来的洞：身份判断最初写成 `not (房东 or 经纪状态 in (…) or 管理员)`，租客的经纪状态是 NULL，`NULL in (…)` 让整个条件变成 NULL，IF 当成假，租客照样查得到。改成每一项都 `coalesce` 之后探针才对。守卫钉住了这个写法。

权限矩阵（`scripts/e2e/db-matrix.sh`）加了 4 行，全部通过；另有 2 条与本次无关的失败，是 10-28 测试时给测试租约记了一笔 2026-08-01 的租金，夹具要求那个账期是空的。

## 总览

| 严重度 | 条数 | 含义 |
|---|---|---|
| S0 | 1 | 可被利用或丢数据 |
| S1 | 5 | 功能错误 / 既定规则被绕过 |
| S2 | 31 | 边角或隐患 |
| S3 | 32 | 清理 |

**最该先修的 5 条**

1. **S0-1 证据包导出的过滤注入**：任何有房东帽子的账号都能读出全站委托记录。改动很小（一条 `.or()` 拆成两次 `.eq()`）。
2. **S1-1 `search_ltb_orders` 对所有登录账号开放**：租客测试号直接按姓名查到了 LTB 判令，绕过筛查角色门与 `CRA_MODE`。
3. **S1-2 房东可以删掉自己的 `landlords` 行**：重新认领就拿到新的 30 天 Pro 试用和 1 个解锁额度，可循环；同一个删除还会级联删掉名下全部房源。
4. **S1-3 按邮箱 `ilike` 没转义通配符**：登录邮箱带 `_` 的租客，信会发到别人的房东那里（两处，已有现成的 `ilikeExact`）。
5. **S1-4 响应返回后的工作没挂 `waitUntil`**：租客报修后房东收不到派单建议卡（生产上最近两张工单都没有），外部服务商的消息通知、委托撤回邮件同理。

**怎么读每条发现**：`文件:行号` · 缺陷 · 触发场景 · 核实方式。核实方式四种——
〔探针〕在生产库的回滚事务里以目标角色试跑得到结果；〔数据〕生产数据佐证；〔代码〕回到代码逐行确认；〔推断〕机制成立但没有复现。
四个区域的初审由并行子代理完成，这里收录的每一条都由主审查回到代码或数据库重新核对过；核对后有 3 条调了级（见各条说明）。

---

## S0

### S0-1 证据包导出把 `tenant_email` 原样拼进 service role 的 `.or()`
- 位置：`app/api/matters/export/route.ts:63`
- 缺陷：`rental_matters.tenant_email` 直接拼进 PostgREST 的 `or=(…)` 过滤串，查询用的是 service role。逗号会把一个值拆成多个 OR 条件。
- 触发场景：有房东帽子的账号（帽子可自助开通）给自己插一份草稿租约，`tenant_email` 写成 `x@y.zz,principal_email.neq.zz` → 调 `my_matters()`，这串文本被写进 `rental_matters.tenant_email` → `POST /api/matters/export`，自己是 landlord 一方所以通过 → 第三个条件命中 `delegations` 全表，导出的 HTML「委托」一节列出全站委托：委托人姓名、经纪、范围、允许的动作、状态与各时间点。
- 核实：〔探针〕前两步在回滚事务里以 `landlord-test` 试跑成功，`lease_documents` 接受这个值，`rental_matters.tenant_email` 读回就是注入串。〔代码〕第三步按路由第 63 行与 PostgREST 的 `or` 语法确认。生产上目前只有 2 条已撤销的测试委托，实际泄露面很小，但机制对任何未来数据都成立。
- 修法方向：拆成 `.eq('principal_auth_id', …)` 与 `.eq('principal_email', …)` 两次查询；给 `lease_documents.tenant_email` 加格式约束。同文件其余 `.or()` 只拼 UUID，没有问题。

---

## S1

### S1-1 `search_ltb_orders` 对任何登录账号可直接调用
- 位置：`supabase/migrations/20260802_ltb_order_catalogue.sql:205,215`（授给 `authenticated`）；调用方 `app/api/screen-score/route.ts:2209,3321`、`app/api/ltb-search/route.ts:48`
- 缺陷：这个 SECURITY DEFINER 函数按姓名查 LTB 判令目录，授权对象是所有登录账号。三个调用方都用调用者的 JWT，所以授权是承重的，函数体里没有任何身份判断。
- 触发场景：任何注册账号（包括纯租客）直接 `POST /rest/v1/rpc/search_ltb_orders`，传任意姓名，拿到案卷号、判令日期、当事人姓名、单元地址、判令 PDF 链接。绕过筛查角色门（`lib/screening/roleGate.ts`）、`CRA_MODE=tool`、免费档额度。
- 违反规则：「筛查只给房东或 RECO 注册有效的经纪」；「注册完成前不做：公开按姓名查 LTB」。
- 核实：〔探针〕`tenant-test` 直接调用返回 3 行；直读 `ltb_orders` 表则是 permission denied，说明这个函数是唯一的口子。
- 附带：`app/api/ltb-search/route.ts` 没有任何客户端调用（文件里自己的注释也这么写），路由里没有 `personalRecordLookupsAllowed()` 也没有角色门，是一条死路由。
- 修法方向：在函数体里加与 `guard_screening_role` 同一谓词的身份判断，或者让服务端改用 service role 调用后撤掉 `authenticated` 的执行权；删掉 `/api/ltb-search`。调用点在筛查模块里（DO NOT TOUCH），这里只报告。

### S1-2 房东能删自己的 `landlords` 行：试用与解锁额度可重置，房源被级联删除
- 位置：`supabase/migrations/0000_prod_baseline_core.sql:260`（策略 `Landlords see own profile` 是 FOR ALL，含 DELETE）；`supabase/migrations/20261012_pro_trial.sql:41-55`（插入时发试用与额度）
- 缺陷：计费列有守卫（探针确认 `plan` / `unlock_credits` / `pro_trial_until` 改不动），但整行删除不受限。重新 `claim_landlord()` 得到一行全新的记录。
- 触发场景：① 试用到期或额度用完的房东 `DELETE /rest/v1/landlords?auth_id=eq.<自己>`，再打开任何触发认领的页面 → 新的 30 天 Pro 试用 + 1 个 $14.99 的解锁额度，可无限循环。② `listings.landlord_id` 的外键是 ON DELETE CASCADE，同一个请求会把名下全部房源连同后代记录删掉，没有任何确认。
- 核实：〔探针〕回滚事务里 `claim → delete → claim`，第二次得到新 id、额度 1、试用到期日重新起算。外键删除动作查 `pg_constraint` 为 `c`。
- 修法方向：策略拆成 SELECT / UPDATE，去掉客户端 DELETE（销户走服务端）；试用资格按 `auth.users.id` 记一次，不按行。

### S1-3 service role + `ilike(邮箱)` 没转义通配符，信会发到别人的房东那里
- 位置：`app/api/agent/execute/route.ts:647`（`resolveTenantLandlord`）；`app/api/cron/agent-routines/route.ts:204`
- 缺陷：调用者的登录邮箱直接当 ILIKE 模式用，`_` 匹配任意一个字符；查询是 service role，没有 RLS 兜底。
- 触发场景：登录邮箱 `john_smith@outlook.com`、名下没有已确认在管租约的账号批准一张租客 `send_message` 卡 → 匹配到 `john.smith@outlook.com` 的租约 → 最多 5000 字的正文发给那份租约的房东，回执只显示「房东」。Outlook / Hotmail / Yahoo 都允许下划线，知道受害租客邮箱的人可以注册一个把其中一位换成 `_` 的地址来有意触发。第二处的结果是把别人租约的单元名和月租写进这位用户的主对话与推送。
- 核实：〔代码〕两处都确认；仓库里已有转义助手 `ilikeExact`（`lib/agent/connectClient.ts:9`、`lib/consumer/match.ts:25`），这两处漏用。报修路径要求 `household_id`，不受影响。
- 修法方向：两处换成 `ilikeExact(email)`，或邮箱存小写后用 `.eq`。

### S1-4 响应返回后的工作没有挂 `waitUntil`，通知与派单建议会被 Worker 取消
- 位置：
  - `app/api/agent/execute/route.ts:862,866`：`void notifyUser(…)`、`void suggestDispatch(…)`
  - `app/api/w/[token]/route.ts:60`：`void notifyThreadParties(…)`
  - `app/api/delegations/[id]/route.ts:50,52,55`、`app/api/delegations/confirm/route.ts:68`
  - `lib/marketplace/server.ts:196,441,453-454,457,465`：工单流转收尾处的 `void notifyUser(…)`
  - `app/api/v1/passport/verify/route.ts:90`
- 缺陷：这些都是浮动 promise，后面紧跟 `return NextResponse.json(…)`。仓库自己在 `app/api/listings/enrich/route.ts:163` 与 `app/api/agent/turn/route.ts:1306` 写明了「Cloudflare cancels post-response work unless it rides waitUntil」，并在那两处、`v1/screen`、`public/stats` 做了处理，这一批漏了。
- 触发场景：租客在助理里批准报修卡 → 工单和给房东的邮件都成功，但 `suggestDispatch` 是十几到几十次串行往返，响应先返回，房东待办里不出现派单建议卡；房东策略是「紧急件自动派」时，停暖 / 燃气也不会自动派出去。日扫不补建议卡，没有兜底。外部服务商在 `/w/<token>` 发消息后，房东与租客收不到推送和邮件。经纪撤回委托后，没有账号的委托人收不到撤回邮件。
- 核实：〔代码〕全部确认；`suggestDispatch` 另外四个调用点都是 `await`。〔数据〕生产上经这条路径建的最近两张工单（10-18、10-28）都没有派单建议卡，也没有工单，与此吻合（样本只有 2，不能排除别的原因）。其余几处在生产没有样本，属于〔推断〕。
- 修法方向：改成 `await`，或照 enrich 路由的写法 `try { getCloudflareContext().ctx.waitUntil(p) } catch { void p }`。

### S1-5 房东用邮件回复「房源咨询」会被静默丢弃
- 位置：`lib/threads/server.ts:415-418`（`tokenStillParty`），对照 `:269`（给房东签发回复地址）
- 缺陷：通知邮件给房源咨询线程里的房东签发了回复令牌，正文写着直接回复即可；收信时的当事人复核对 `listing_inquiry` 只认租客，房东一律 `return false`。
- 触发场景：租客在房源页提问 → 房东没开推送，收到带 Reply-To 的邮件 → 直接回邮件 → 记为 `revoked`，不写消息、不通知任何人，收信端点照常回 200。房东以为已回复，租客永远收不到。
- 核实：〔代码〕确认。数据库里的 `party_for()` 把房源的房东算作当事人；`application` 分支有房东路径，`listing_inquiry` 漏了同样的分支；相关守卫测试只断言调用了 `tokenStillParty`，没有说明拒绝房东是有意的。

---

## S2

### 权限与数据边界

**S2-1 `agent_pending_actions` 本人整行可写，审批函数可以绕过**
- 位置：策略 `agent_pending_actions_self`（FOR ALL，`user_id = auth.uid()`）；`insert_pending` 是 RESTRICTIVE，只管 INSERT。
- 场景：用户直接 `UPDATE … SET status='approved', decided_at=…, metadata=…`，跳过 `decide_pending_action` 写的 `approval_events` 与审计行；也能把 `executed_at` 清空重放一张已执行的卡、把 `expired` 改回 `approved`。
- 核实：〔探针〕`tenant-test` 插一张 `role=landlord`、`action_type=send_lease` 的卡再直接改成 approved，成功。执行器逐项复核归属与事实（`execute/route.ts:1591` 及各 executor），所以这不是越权，是审批与审计记录不可信、重放只受每小时 20 封的限流约束。
- 方向：UPDATE 改成列级授权或加守卫触发器，状态流转只经 RPC。

**S2-2 看房卡信任了卡片 metadata 里的 `tenant_auth_id`**
- 位置：`app/api/agent/execute/route.ts:1350-1351,1389`
- 场景：房东把自己一张真实看房卡的 `tenant_auth_id` 改成任意用户的 UUID 再批准 → service role 建出「该房源 × 那位用户」的咨询线程，房东从此可以给对方发消息；真实租客拿到的回信令牌绑的是别人的身份。需要知道目标的 auth UUID，可利用性低。
- 核实：〔代码〕。方向：从 `tenants.auth_id`（`intent.tenant_id` 那一行）取，和其它执行器「收件人来自行、不来自卡」一致。

**S2-3 `tenants` 表没有守卫；`claim_tenant()` 按邮箱认领不要求 `auth_id` 为空**
- 位置：策略 `tenants_self`（FOR ALL），表上无触发器；函数 `claim_tenant`。
- 场景：`tier` 本人可改（进助理提示词 `lib/agent/userContext.ts:118`「租客护照认证 N 级」）；`email` 本人可改，而它被 `execute/route.ts:1336` 当收件地址、`lib/consumer/server.ts:260` 当档案匹配键。`claim_tenant` 找到同邮箱的行就改写 `auth_id`，不看那行是否已属于别人（`claim_landlord` 有 `auth_id is null`）；用户改过登录邮箱后，旧邮箱的新主人可以接管原来的租客行及其租约、报修、看房记录。
- 核实：〔探针〕`tier` 1→3、`email` 改任意值都成功。接管场景是〔推断〕。

**S2-4 删除筛查把「读得到」当「拥有」；文件路径没限定在本人目录**
- 位置：`app/api/screening/[id]/route.ts:31,42-52`
- 场景：① 委托的委托人经 `screenings_delegation_principal_read` 读得到经纪名下的筛查，这条路由随后用 service role 删掉筛查行、文件和核验记录，绕过了只许所有者删除的策略。② `files` 列所有者可写，路径只要求以 `screenings/` 开头，把别人的文件路径写进自己的筛查再删除，就能删掉别人的文件（需要知道确切路径）。
- 核实：〔代码〕+ 线上策略定义。

**S2-5 一键筛查的「已有筛查」查询不限归属**
- 位置：`app/api/screening/from-application/route.ts:93-99`
- 场景：申请人开通房东帽子后自插一行带自己申请 id 的筛查 → 房东点一键筛查时拿到这行的 id（自己读不到），永远做不了一键筛查。
- 核实：〔代码〕；`guard_screening_delegation` 不校验 `application_id`。

**S2-6 委托的「范围 / 允许的动作」在事务访问上没有生效（需要你定）**
- 位置：函数 `matter_party`（`supabase/migrations/20260927_node5_matters_delegations.sql:87-103`）；`app/api/matters/export/route.ts:37-38`
- 场景：`matter_party` 只看委托是否有效，不看 `scope`。客户只确认了「找房 + 起草租约」，经纪仍能导出这位客户全部事务的对话全文、工单对话、每期租金记录。`lib/delegations/shared.ts:13` 对「事务跟进（matter）」的说明正是「进入客户的租赁事务与对话」，按文案这应该是单独的一项授权。
- 核实：〔代码〕+ 线上函数定义。是否有意由你定。

**S2-7 登录后的 `next` / `redirect` 校验可被制表符绕过（开放重定向）**
- 位置：`lib/auth/useLoginForm.ts:33`、`app/auth/callback/page.tsx:76`、`components/auth/AuthPage.tsx:47`、`lib/landlordHat.ts:5`（同一个校验写了四遍）
- 场景：`/login?next=/%09/evil.com`。校验只拒绝 `//` 与 `/\` 开头；URL 解析会先删掉制表符，`/\t/evil.com` 变成 `//evil.com`。已登录用户被 `router.replace` 直接送到站外，未登录用户在真实域名上登录后被送走。
- 核实：〔代码〕URL 解析一步用 node 验证；Next 路由对站外地址整页跳转在 `node_modules/next/dist/client/components/app-router-utils.js:25` 确认。没有在浏览器里复现。初审标 S1，因为不泄露会话（Supabase 读完 hash 就清掉），降为 S2。
- 方向：合成一个 helper，用 `new URL(raw, location.origin).origin === location.origin` 判断。

**S2-8 `isMlsHost` 可以绕过，Realtor 页面仍会被读取**
- 位置：`lib/listings/externalSources.ts:19`；`app/api/agent/turn/route.ts:171-177`
- 场景：① 主机名末尾加点 `https://www.realtor.ca./…`，`hostname` 是 `www.realtor.ca.`，正则以 `$` 结尾不匹配。② 判定只看原始 URL，Jina 读取器会跟随跳转，短链可以读到 realtor.ca 页面。
- 违反规则：「`isMlsHost()` 的主机一律不读」。
- 核实：〔代码〕① 用 node 实测返回 false；② 是〔推断〕。

**S2-9 护照核验结论按房东手填的 `tenant_email` 归属（目前休眠）**
- 位置：`app/api/v1/passport/verify/route.ts:61`；`app/api/verify/create/route.ts:72-73`
- 场景：核验请求的归属邮箱由发起的房东填写且可事后改，护照接口会把别人的核验算到持有人头上。Veriff / Flinks 生产凭证未到位，现在没有真实核验数据。
- 核实：〔代码〕（按子代理定位复核了两处入口，未追完整条链路）。

### 计费与额度

**S2-10 深度核查的付费闸与核查对象脱钩**
- 位置：`app/api/deep-check/route.ts:537-556`
- 场景：闸只看请求体里的 `screening_id` 是否已解锁，核查对象（姓名、雇主、电话）却优先取请求体。一次解锁可以给任意多个申请人做深度核查。
- 核实：〔代码〕。筛查模块，只报告。

**S2-11 免费档每月 3 次可以绕过**
- 位置：`app/api/screen-score/route.ts:896-913`
- 场景：额度按「本月创建且已评分的行数」计。上月创建的行换材料重跑、同一行反复跑都不占额度；路由没有按用户的成本限流。
- 核实：〔代码〕。筛查模块，只报告。

**S2-12 首次付费时订阅事件先到会被丢弃**
- 位置：`app/api/stripe/webhook/route.ts:239-259`，对照 `:195-205`
- 场景：`stripe_customer_id` 只在 `checkout.session.completed` 里写入。`customer.subscription.created` 先到时按 customer id 匹配 0 行，返回 200，Stripe 不重试；而 completed 分支不写续费日和卡信息 → 新 Pro 用户的「下次续费日」和卡尾号空到下个账期。
- 核实：〔代码〕。生产上目前没有带订阅的行，无法用数据验证。

### 限流与成本

**S2-13 发信端点缺全站总闸或持久限流**
- 规则原文：「发信类限流 fail-closed、成本类 fail-open；匿名面都要有全站总闸。」

| 位置 | 现状 |
|---|---|
| `app/api/contact/route.ts:14,42` | 免登录；只有单 isolate 内存节流（`lib/contact.ts` 自己注明不是持久限流） |
| `app/api/notify-landlord/route.ts` | 免登录；没有限流，只靠「每个申请一次」，申请可匿名批量建 |
| `app/api/consumer/request/route.ts:25-26` | 免登录；每 IP、每邮箱两个桶，没有全站桶 |
| `app/api/agent-intake/[token]/route.ts:71-72` | 需 token；每 IP 10 次 / 小时，IP 没按 /64 归桶，没有每链接上限；每次提交给经纪发一封邮件 |
| `app/api/household/invite/route.ts:33-37,68-86` | 需登录；每账号每天 30 封，没有全站桶；两处计数查询失败时按 0 放行 |

- 核实：〔代码〕。初审把 household/invite 标为 S1（匿名会话可发信）；查 Auth 配置后确认生产关着匿名登录、注册要确认邮箱，降为 S2。

**S2-14 花模型钱的路由没有持久限流**
- 位置：`app/api/household/extract/route.ts:35-38`（没有任何限流，每次是一次带整份 PDF 的模型调用）；`app/api/classify-files/route.ts:485-531`（进程内 Map，Worker 上等于没有；也没有角色门）
- 核实：〔代码〕。同目录的 `threads/upload`、`rent/evidence`、`work-orders/receipt` 都用了 `underHourlyLimit`。

**S2-15 开放 API 的限流键取自报的 `X-Client-Id`**
- 位置：`lib/api/v1Limits.ts:35-40`
- 场景：每次换一个 `X-Client-Id` 就绕过每客户端桶，只剩全站桶；单一来源可以把全站桶打满，让所有调用方 429。
- 核实：〔代码〕。

**S2-16 MCP 批量没有条数上限**
- 位置：`lib/mcp/jsonrpc.ts:134`
- 场景：一次 POST 可带数百次工具调用（含数据库查询），只算 1 次限流。有请求体大小上限，没有条数上限。
- 核实：〔代码〕。

### 正确性

**S2-17 守卫命中的合规事件从来没有入库**
- 位置：`app/api/agent/turn/route.ts:850`
- 缺陷：`void svcC.from('compliance_events').insert(…)` 没有 `.then()`，PostgREST builder 是惰性的，请求不会发出。与 10-28 轮抓到的是同一类问题。
- 核实：〔数据〕生产 `compliance_events` 共 85 行，来源是 `compliance_api` / `work_order` / `decision_notice`，`source='guardrail'` 为 0 行。

**S2-18 「预览」会改写租客保存的房东邮箱**
- 位置：`app/api/agent/execute/route.ts:1080`、`:801`，写入在 `:700-709`
- 场景：从卡片正文抠出「房东邮箱：…」并 upsert 的一步发生在 `preview` 判断之前。用户看预览发现地址不对、拒绝卡片，保存的房东邮箱已经被换掉，之后不带邮箱行的报修和信默认发去那个地址。
- 核实：〔代码〕。

**S2-19 例行任务「到期前提醒交租」在拒绝后第二天又出同一张卡**
- 位置：`app/api/cron/agent-routines/route.ts:77`
- 场景：去重只看 `pending / approved`（`executed` 这个状态值不存在）。房东拒绝后、或卡因租客已付而过期后，接下来几天每天再出一张。`proactive/route.ts:674` 的注释写的是「never re-nag a decided touchpoint」。
- 核实：〔代码〕。

**S2-20 例行任务写进主对话的汇报会被开着的页面覆盖**
- 位置：`lib/agent/threads.ts:99-103`；`app/api/cron/agent-routines/route.ts:56`
- 场景：`agent_threads.messages` 是整列读-改-写，没有版本条件。页面停在主对话时 cron 追加了汇报，用户随后在没刷新的页面发一句话，页面把自己那份整列写回，汇报消失。
- 核实：〔代码〕机制确认，没有复现。

**S2-21 模型自动发现的「下架」分支停用不了模型，邮件却写「已停用」**
- 位置：`lib/models/autoDiscover.ts:91`
- 缺陷：只带部分列的 upsert，`label` 等 NOT NULL 列缺失，返回的 error 没检查。
- 核实：〔探针〕回滚事务里做同形状的 upsert，报 `23502 null value in column "label"`。

**S2-22 每日 proactive cron 用的是 pg_net 默认 5 秒超时**
- 位置：`supabase/migrations/20260708_pg_cron_proactive.sql:33-41`
- 场景：其余四个 HTTP cron 都显式给了 120–300 秒，只有 `agent-proactive-daily` 没给。路由现在串了五个扫描。
- 核实：〔数据〕线上 `cron.job` 的命令确实没有 `timeout_milliseconds`，`net.http_post` 的默认值是 5000。当前测试规模的数据下，这个任务建的卡落在 13:00 之后约 3 秒，余量只剩 2 秒左右；数据一多，排在后面的扫描（跟进邮件、租金提醒、下架提醒）会静默不跑。近 14 天 9 个 cron 任务本身 0 失败。

**S2-23 消息哈希链在并发插入时会写出「自检不通过」的链**
- 位置：函数 `thread_messages_chain`（`supabase/migrations/20260929_messaging_a.sql:212-223`）
- 场景：`id` 是 bigserial，在 BEFORE 触发器之前取号；咨询锁在排最后的链触发器里才拿。同一线程里先取号的后拿锁，第 N 条的 `prev_hash` 会指向第 N+1 条，导出时永久显示「哈希链断开」，而表是只追加的，改不了。
- 核实：〔代码〕+ 线上函数定义。〔数据〕生产 81 条消息、20 个线程，目前 0 处断链。
- 方向：按「改格式就加 v2」的规则，最小改动是让取号发生在拿锁之后，校验端不用动。

**S2-24 工单「返工中」房东没有任何可用动作**
- 位置：`lib/marketplace/workOrders.ts:34-50`
- 场景：房东点「要求返工」后服务商不再出现。`cancel` 只能从 `offered / quoted / scheduled`，`dispute` 只能从 `completed / accepted / in_progress`，`rework` 两边都不在；同一张报修也不能改派。
- 核实：〔代码〕。方向：`dispute` 或 `cancel` 的 `from` 加上 `rework`。

**S2-25 租约上的「Fully executed」日期取 UTC**
- 位置：`components/lease/OntarioLeaseDoc.tsx:88`、`components/lease/TrrebLeaseDoc.tsx:82`
- 场景：多伦多时间晚上签完，盖章日期比同页上方 `torontoDate()` 显示的签署日晚一天。这是会被打印存档的文件。
- 核实：〔代码〕。

**S2-26 `my_hats` 失败一次，`useHats` 永远停在 loading**
- 位置：`lib/useHats.ts:55`
- 场景：加载时这一次 RPC 遇到网络抖动，`/landlord/*` 整页不渲染、`/messages` 一直是空白底色，没有提示也不重试，只能手动刷新。
- 核实：〔代码〕。

**S2-27 N 表工具箱切换租约没有取消标志**
- 位置：`components/landlord/NoticeToolbox.tsx:185-196`
- 场景：先点租约 A 再马上点 B，A 的响应后到，B 的 N4 填写稿列出 A 的欠款账期和金额。同文件租约列表的 effect 有 `cancelled` 标志，这一处漏了。
- 核实：〔代码〕。

**S2-28 派单策略卡读取失败后保存会整行覆盖**
- 位置：`components/marketplace/DispatchPolicyCard.tsx:33-42`
- 场景：读取失败时按默认值显示并标记已加载；房东只改一项，整行 upsert 把偏好服务商和紧急预授权清掉，界面显示「已保存」。
- 核实：〔代码〕。

### 与既定规则不一致

**S2-29 工单与报修邮件对外省租约照样写安省法条**
- 位置：`lib/marketplace/workOrders.ts:186-188`；`lib/marketplace/server.ts:372,403-408`；`app/api/maintenance/notify/route.ts:65,75`
- 场景：在管租约支持外省。外省租客会收到写着「按《住宅租赁法》s.27…8:00–20:00」的正式进入通知，并原样存进线程的正式通知副本；进入时间窗校验用的也是安省的时段。
- 规则原文：「外省走 `lib/provinces/`…外省页面不出现 RTA / LTB / N 表」。
- 核实：〔代码〕`lib/marketplace/`、`app/api/maintenance`、`app/api/work-orders` 里没有任何省份分支。

**S2-30 经纪 rail 的预填提示词仍写「实时挂牌和 TRREB 数据」**
- 位置：`lib/lifecycle/stages.ts:416`
- 规则原文：「租金基准只用 CMHC + 统计局…不再展示 TRREB 数字」；不写「实时挂牌」。同一句在 `components/agent/AgentChat.tsx:71` 已经改掉，这里漏了，现有守卫不覆盖这个文件。
- 核实：〔代码〕。

**S2-31 隐私页仍写「部分房源数据由房地产协会与 MLS® 系统授权提供」（需要你定）**
- 位置：`app/privacy/page.tsx:54-55`
- 说明：与「MLS 读取永久关闭」和站内其它位置的「Stayloop 不读取 MLS® 数据」相反，并据此告诉用户姓名、邮箱可能提供给这些机构。属于法律文本，改动可能牵涉 `TERMS_VERSION`，只报告。
- 核实：〔代码〕。

---

## S3

| # | 位置 | 问题 |
|---|---|---|
| 1 | `app/api/agent/execute/route.ts:1296-1297` | 下架提醒的 update 失败后不释放 claim，卡片永久停在 `in_flight` |
| 2 | `app/api/agent/turn/route.ts:139-166,208,374` | 直连回退 `res.text()` 无大小上限；私网黑名单是 `lib/net/publicUrl.ts` 的弱化副本（不处理末尾点）；图片附件不限大小 |
| 3 | `app/api/agent/proactive/route.ts:346-350,373-377,489-490` | 去重靠无 limit 的全量扫描与超长 `.in()`，没有唯一索引兜底；当前数据量不触发 |
| 4 | `app/api/threads/notify/route.ts:49` | 发信类限流写成 fail-open（第三个参数应为 `false`） |
| 5 | `app/api/lease/sign/route.ts:224-246` | 房东先签、租客后签时，房东收不到「双方已签」的邮件（注释写的是双方都收到） |
| 6 | `lib/push/webpush.ts:124` | 推送请求没有超时，通知循环又是串行的，一方挂起会挡住后面的人 |
| 7 | `workers/reply-email/src/index.ts:30-43` | 不看 `Auto-Submitted` / `Precedence`，休假自动回复可能被记成本人消息（存疑） |
| 8 | `app/api/screen-score/route.ts:770-779` | `x-partner-key` 通道不受「第三档关闭」开关约束，也跳过角色门（需要一把绑定房东的有效密钥） |
| 9 | `app/api/admin/consumer/route.ts:98-112,143-146` | `resolve_dispute` 没有状态条件，两人同时点会写两条更正、发两轮邮件 |
| 10 | `app/api/verify/create/route.ts:63`、`app/api/admin/consumer/route.ts:126`、`lib/listingPublish.ts:52-59`、`lib/useLandlord.ts:60`、`lib/useUser.ts:230`、`components/settings/LandlordPhoneCard.tsx:40`、`app/dashboard/page.tsx:81` | 查房东行没走 `pickLandlordRow`（双 ID 规则）；现网所有行都带 `auth_id`，暂无影响 |
| 11 | `app/api/listings/search`、`listings/[slug]`、`listings/enrich`、`app/go/[code]`、`app/api/config/*` | 匿名面缺全站总闸；社区简介生成没有在途标记 |
| 12 | `app/api/stripe/webhook/route.ts:90,99-136` | 单次解锁在授予后、盖章前中断，Stripe 重试会多发一个额度 |
| 13 | `app/api/verify/[token]/start/route.ts:43`、`credit/route.ts` | Veriff 步骤写死 `sandbox: false`；征信路由没接核验限流（凭证未到位，休眠） |
| 14 | `app/api/stripe/portal/route.ts:49`、`resume/route.ts:39` | 没有房东帽子的账号得到 400 而不是规则写的 403 |
| 15 | 函数 `seed_demo_agent_data` | 仍授给 `authenticated`，代码里两处调用都是 `seedDemo:false`。〔探针〕租客号直接调用会往自己的真实记忆里写 5 条编造的房东偏好（含「最低 720」「DTI ≤ 35%」）和一张没有执行器的卡 |
| 16 | 表 `email_unsubscribes` | INSERT 策略 `with check (true)`，任何人可为任意邮箱插行〔探针〕；代码已无引用，是死表 |
| 17 | 函数 `decline_household_invite` | 不查 `revoked_at` / `expires_at`：过期或已撤销的 token 仍能把在管租约置为 `disputed` |
| 18 | 策略 `Public can read verified listings` | 仍带 `OR source = 'realtor'`，与「公开 = is_active AND verified」不一致；现 0 行命中 |
| 19 | `wrangler.jsonc:11` | `workers_dev: true`，Worker 另有 workers.dev 入口，不经 zone 的规则 |
| 20 | GitHub Actions | 仓库 secrets 里留着没有任何 workflow 使用的 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`（旧 Pages 部署遗留）；`kb-refresh.yml:66` 把 `inputs.only` 直接插进 `run` 脚本；`rent-benchmarks-refresh.yml` 没有 `permissions` 块和超时，service role key 设在 job 级；`scripts/rent-benchmarks/load.mjs:57` 抓到 0 行也 exit 0 |
| 21 | 仓库根目录 | `ship2-v53.command` 被 `.gitignore` 的 `*.command` 排除，唯一副本在这台机器上；另有 14 个旧 `.command`（含推 `main`、部署 Pages 的），其中 `add-canlii-key.command` 里有一把明文密钥（未入库） |
| 22 | `ship-v53.log` | 2026-06 的旧部署日志仍被跟踪（内容无密钥） |
| 23 | `lib/observability/sentry.ts` | `SENTRY_DSN` 不在 `worker-secrets-sync.sh` 的清单和 CLAUDE.md 的环境变量清单里，`captureException` 在生产是空操作；发送本身也没挂 `waitUntil` |
| 24 | `app/dashboard/page.tsx:159,181,185,221,230,240`、`app/agent/showings/[id]/feedback/page.tsx:282` | 登录后界面仍用原生 `alert` / `prompt` |
| 25 | `lib/i18n.tsx:66`、`lib/agent/prompts.ts:253` | 仍写「四枚章」，现有守卫没覆盖这两处 |
| 26 | `app/agent/earnings/page.tsx:173` | 挂载 effect 里直接 `history.replaceState` |
| 27 | `app/h/[id]/page.tsx:145`、`app/listings/page.tsx:244` | effect 依赖写成 `user?.id` |
| 28 | `app/landlord/leases/page.tsx:216`、`app/landlord/applicants/page.tsx:171` | `page.tsx` 导出了多余符号（当前构建能过） |
| 29 | `components/AuthModal.tsx`（719 行）、`components/v4/SecHead.tsx`、`app/api/ltb-search/route.ts` | 无任何引用的死代码；cron 密钥比较有三份重复实现（`proactive/route.ts:614`、`reflect/route.ts:15`、`cron/agent-routines/route.ts:28`），另有共用的 `lib/cron/secret.ts` |
| 30 | `app/h/[id]/page.tsx:100`、`app/landlord/applicants/[id]/page.tsx:165`、`app/tenant/passport/page.tsx:168,231` | 读取失败显示成「不存在」；撤销分享链接失败无提示 |
| 31 | `app/landlord/applicants/[id]/page.tsx:262-279`、`components/household/PaymentPlanDraft.tsx:98-99`、`app/api/agent/execute/route.ts:1099` | 待批卡文案在英文界面是中文硬编码；默认邮件主题写的是「Stayloop 代理」而不是「AI 助理」 |
| 32 | `app/providers/professional/page.tsx:94`、`app/provider/onboard/page.tsx:71` | 服务商网站不校验就当 `href`，不带协议的值变成站内 404 |

---

## 看过、判定没问题

**数据库（线上现状）**
- 全部 SECURITY DEFINER 函数都设了 `search_path`；触发器函数没有 API 角色的执行权。
- 计费列守卫有效：〔探针〕房东改 `plan` / `unlock_credits` / `pro_trial_until`，读回未变。
- 筛查解锁守卫有效：〔探针〕`unlocked_at` 改不动。
- 在管租约成员角色冻结：〔探针〕`household_member_fields_frozen`。
- `admin_*` RPC 逐个带管理员判断，含「最后一个 superadmin」保护。
- `mark_rent_paid` / `confirm_rent_payment`：成员判定、不可自我确认、日期边界都成立。
- 存储：5 个桶，私有桶有大小与类型上限；各策略按路径首段鉴权。
- pg_cron 9 个任务近 14 天 0 失败；pg_net 近 6 小时回调全 200。

**AI 助理与 cron**
- 执行器的归属校验、原子 claim、撤销互斥、批准前重核事实都成立。
- 租客只能出两类卡、房东和经纪不出卡，由 `gateProposedAction` 确定性把关。
- 匿名预览：每 IP 15 次 / 小时 fail-closed + 全站 600 次 / 小时，零持久化。
- 所有 cron 路由在未设 `CRON_SECRET` 时关闭，比较是常量时间。
- 没有绕过 `llmChat` 的聊天调用；思考型模型截断有专门的错误类型。

**租约、消息、工单**
- 收信端点：密钥未设置即 403；冒充发件人需要同时持有收件人专属令牌且 From 相符。
- `thread_messages` 只追加对 service role 也生效；`hashChain.ts` 与 SQL 的规范串一致。
- 租约签署并发用条件更新；`sign_token` 只经 service role 读。
- 列级授权的表在范围内没有客户端 `select('*')`。
- 委托确认要求登录邮箱 = 委托邮箱，令牌一次性。
- 工单状态更新带旧状态条件；CSV 导出已处理公式注入；邮件模板的用户输入都过转义。

**支付、房源、开放 API**
- Stripe 签名校验、price 与回跳地址不可由客户端控制；`checkout` 与 `unlock` 对无帽子账号返回 403。
- connect 两条确实是 410；`/api/admin/*` 都在服务端验 `is_stayloop_admin`。
- `/api/v1/screen` 入口关着；MCP 只暴露第一档的 7 个工具。
- `file-url` 与 `profile/files` 的路径归属校验成立；`listings/search` 每页 ≤100 强制。

**前端与部署**
- `proxy.ts`：安全头、token 页 `no-referrer` 前缀、CORS 收口都覆盖到。
- 没有 `runtime='edge'`、没有 `signInWithOtp`、没有从 `'use client'` 模块取常量的 Route Handler。
- 已跟踪文件里没有密钥形态的串；`opennext-env-guard.mjs` 逻辑正确。
- LTB 与企业注册库入库脚本对截断下载拒绝删除。

## 没有看 / 没看全

- **筛查模块**：`screen-score`、`deep-check` 只看了鉴权、角色门、额度和落库；评分与取证主体、`lib/forensics`、`lib/generateReport.ts` 没读。
- **前端**：117 个页面只细读了约 14 个，其余靠全站 grep 定位；示范数据标注、中英硬编码、无 limit 查询都只是抽样；外省页面的安省术语没有系统验证。
- **纯函数库**：`lib/household/csvReconcile.ts`、`rentReminders.ts`（N4 日期与迟付计数）、`lib/api/v1Core.ts` 的日期算术、`lib/provinces/rules.ts`、`lib/agent/prompts.ts` 等没有逐行核对。
- **客户端状态机**：`lib/agent/useAgentSession.ts`（1226 行）只核对了撤销、执行、保存几处。
- **数据库**：`work_orders`、`rent_payments`、消息相关表的 RLS 没有逐条重跑矩阵（`scripts/e2e/db-matrix.sh` 是回归基线，本轮没跑）；背景里列明的已知顾问项没有重审。
- **没有做的事**：没有跑 tsc / vitest / 构建，没有在浏览器里复现任何一条，没有登录任何账号。
