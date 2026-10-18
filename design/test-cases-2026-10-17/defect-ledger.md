# 缺陷台账（测试员交回汇总，待复核）

## L+M+N（已交回）
- N-D1 S2/P1 Resend suppression：*@stayloop.ai 测试邮箱全部 suppressed；管理员告警与真实收件人同一封整封 suppressed → 告警可能无人收到。建议：管理员告警按收件人单独发；清 suppression（用户在 Resend 后台操作）。
- M-D1 S3/P3 /admin/usage TODAY 卡按 UTC 日，其余按 America/Toronto。
- 观察：By model 表模型 id 与「unpriced」角标连写（视觉未核）。
- 越界：tenant-test 被某测试员开通了 landlords 行 4161c2c8…（测完删除）。
- 32 个新模型 unpriced（已知待办）。

## E（已交回，28 用例，1 失败 1 部分）
- E-D1 S2/P1 LTB coverage 间歇为 null（`_v3.ltb_check.coverage`）：`lib/ltb/search.ts` L203–222 吞错不记日志；疑与并行 search_ltb_orders 超时有关。筛查模块 DO NOT TOUCH → 只做加法：补日志 + 重试一次？需复核。
- E-D2 S2/P1 申请人页决定通知卡「确认 · 替我执行」一点即发，无 60 秒撤销（`app/landlord/applicants/[id]/page.tsx` L315 runNotice 直接 execute）；待办页同卡有撤销。统一：走 decide + 60s 或卡上写明。
- E-D3 S3/P2 `/screening/<id>/ltb` 子页中文下英文数据源名 / 注记（没用 courtSourceZh/courtNoteZh）。筛查模块——只加显示层翻译。
- E-D4 S3/P3 筛查页删除用 window.confirm（DO NOT TOUCH，记录）。
- E-D5 S3/P3 披露包取证标签英文内部短语（signalLabel 未覆盖）；JSON 更正记录带管理员 uuid。
- E-D6 S3/P3 决定通知邮件页脚缺 /my-file · /consumer-rights 句。
- 观察：O-2 管理员队列候选含 error 筛查。
- 越界：测试员间无头 Chrome 端口撞车；muse-* 密码文件可能过期。

## B+O（已交回，B 17 用例 1 失败；O 9 全过；矩阵 210 组合零溢出）
- B-D1 S2/P2 HeroComposer：访客自己切身份 / 点「›」后 1.5s 内空提交发出上一条示例并进上一条身份（`show()` 对一切变化记 changed，CHANGE_GRACE_MS 没区分自动轮换与访客操作）。修：只有自动轮换才设 grace。
- B-D2 S3/P3 英文界面眉标残留中文：/tenant /landlord /agent /services「TENANT · 租客 · AI 助理」，/platform「LEASING · 租前」。
- B-D3 S3/P3 /screening 英文页整段中文（DO NOT TOUCH 模块 — 只能记录或加法）；/listings 英文卡片设施芯片双语串「厨房 / Kitchen」未拆（详情页已拆）。
- B-D4 S3/P3 三方动画头像按钮无可读名（inert，卫生）。
- B-D5 产品决定：数字带「0 套公开房源」（is_test 后真值）。
- O-D1 S3/P3 /privacy 第 5 节没列 privacy@stayloop.ai。
- O-D2 S3/P3 页脚无「消费者权利」链接。
- 备注：README 的语言键应为 `stayloop_lang`；条款现 8 条；WebKit 未跑。

## T6 安全（已交回，30 用例 3 失败）
- **T6-D2 S1/P0** `lease_documents.sign_token` 对 authenticated 有列级 SELECT → 房东读自己租约即得租客签署 token；`/api/lease/sign` token 模式不校验签署人 → 可伪造租客签名到 signed_both。修：revoke 列 SELECT（anon/authenticated），签署路由 service role 查；并考虑要求 JWT 邮箱 = tenant_email。
- **T6-D3 S1/P1** next@15.5.2 critical 公告，npm audit 建议 15.5.28；另 4 个 high。升级前在 next-on-pages 验证构建。
- **T6-D1 S2/P1** `POST /api/stripe/checkout` 空 body 让任何登录账号被 `claim_landlord` 自愈成房东（与 09-24 决定相悖）。tenant-test 已被开通 landlords 行 4161c2c8（需删）。
- T6-D5 S3/P2 消费者披露包含房东登录邮箱（s.12 只要求名称）。
- T6-D7 S3/P3 thread_messages 直插 \u0000 回 Postgres 原话（400，不落库）。
- T6-D8 S3/P3 /api/v1/screen 抓 files url follow redirect、webhook 无私网校验（关闭中，开放前补）。
- T6-D9 S3/P3 HTML 页面带 ACAO *（无 credentials）。
- T6-D10 S3/P2 `search_corp_registry` 对所有登录用户开放无限流，低阈值 8s 超时耗 CPU。
- T6-D11 S3/P3 房东可直写自己房源 is_test=true。
- 越界：agent_directory 暴露 auth_id；agent_pending_actions 本人 INSERT 完全开放（待办页显示伪造卡）。
- 副作用待清：landlords 4161c2c8（tenant-test）+ 审计 87e60f99；pending action 3247cb25。

## T4 数据库权限矩阵（已交回，269 探针 8 失败；scripts/e2e/db-matrix.sql + .sh）
- **T4-01 S0/P0** `provider_directory` 视图可写（security_invoker=false + 默认权限 INSERT/UPDATE/DELETE）→ 任何登录用户改任意已核验服务商的 contact_email、删无工单服务商。修：revoke insert,update,delete on provider_directory, provider_credentials_public, agent_directory from anon, authenticated（与 09-25 applicant_applications 同根因）。
- **T4-02 S1/P0** 匿名申请自 2026-10-11 起 100% 失败：applications 的 anon INSERT 策略 WITH CHECK 直接子查询 listings，而 anon 对 listings 的 SELECT 已撤 → 42501。修：策略里 listings 检查换 SECURITY DEFINER 助手。
- **T4-03 S1/P1** 租客成员可把 household_members.role 改成 landlord（策略只约束 user_id，无列限制）→ 派单 / 批准报价 / 进入通知。修：BEFORE UPDATE 守卫只放行 status 变更。
- **T4-04 S2/P1** 有更正记录的筛查删不掉：screening_corrections append_only 触发器连级联 DELETE 也 raise → DELETE /api/screening 失败。要定：放行级联或改 set null。
- T4-05 S3 service_providers.auth_id 无 FK。T4-06 S3 is_email_unsubscribed 对 anon 可探测。
- 越界：consumer_* 表无只追加触发器（按设计）。

## A+K（已交回，A 21 用例 2 部分；K 10 用例 1 失败）
- D-A7/D-K3 = T6-D1（checkout/unlock 自愈 claim_landlord）。
- D-K1 S2/P1 筛查页注册提示中文「免费档每月 5 单」（应 3）`app/screening/app/page.tsx:2756`（筛查模块文件，文案改动算加法？——与 FREE_SCREENINGS_PER_MONTH 同源）。
- D-K2 S3 设置页 planFreeDesc 中文缺「送 1 次深度核查 / 30 天 Pro」。
- D-A3 S3 PasswordAgeGate / TermsConsentGate 标题仍以「房源数据提供方的规则」为由。
- D-A4 S3 signOut 不清 sl-thread-current-* 键。
- D-A5 S3 匿名 /agent/verify 渲染完整表单无「请先登录」。
- D-A6 S3 sessionStorage sl-onboarding-role 跨账号残留 → 已起名经纪被送 /landlord/become；signOut 应清。
- D-A8 S3 terms-confirmation 并发竞态（历史 6ms 两封）。

## F（已交回，35 用例 34 过 1 未执行）
- D-F-01 S2/P2 N 表工具箱「今天」/送达日默认用 UTC（NoticeToolbox.tsx:142 isoDate(todayUtc())），多伦多晚 8 点后错一天 → 改 torontoDate()。
- D-F-04 S2/P2 租客 /tenant/payments MyRent 只列有 rent_payments 行的账期，未记录的逾期期 / 下期不出现（房东台账有占位，租客侧没有）→ MyRent 也用 scheduledPlaceholders。
- D-F-02 S3 时间戳按 UTC ISO 截取显示（NoticeToolbox 502、RentPeriodRow 156/164/184、leases/[id] 330、h/[id] 412/424）→ 多伦多日期格式化。
- D-F-03 S3 CSV 两期合付只在两期都未记录时识别。
- 观察：从申请起草签完后 applications.status 仍 new；/tenant/lease 列表不显示待接受邀请。

## C+D（10-18 补完；C 26 全过，D 17 执行 16 过 1 失败）
- D-S0-1 = D-07 = T4-02（匿名申请 42501）——迁移 20261018_site_test_s0s1 修复。
- C-S3-5 S3/P2 房东可把自己房源 is_test 改成 false（与 T6-D11 合并：守卫应冻结 is_test，只管理员可改）；C-S3-7 快速发布 `[TEST]` 地址落库 is_test=false。
- C-S3-1 S3/P3 搜索接口整列返回 images（data URL 照片，5 条 153 KB）→ 卡片只取首图 / 不回 data URL。
- C-S3-2 = B-D3 后半（列表卡设施芯片双语串）。C-S3-3 / D-S3-1 S3/P3 列表页、申请页、/tenant/* 的 `<title>` 不随语言 / 沿用首页长标题。
- C-S3-4 S3/P3 不存在房源页 HTTP 200（软 404）。C-S3-6 S3/P3 快速发布重复地址检查在识图之后才跑。
- D-S3-2 S3/P3 已申请房源页仍展示申请包勾选，但提交禁用，勾选无出口。

## I（10-18 补完；25 用例 24 过 1 部分，无 S0/S1）
- I-D1 S2/P2 匿名 /landlord/agent 起房源草稿时描述编造用户没说的事实（「北约克核心便利地段…采光充沛」）→ 发布即公开。需在草稿 prompt / 后处理限制只写用户给的事实。只在匿名预览复现一次。
- I-D2 S3/P3 找房回复「实时房源和市场行情卡附在下方」紧接「库里没有符合条件的房源」，自相矛盾且用了禁用词「实时」。
- I-D3 S3/P3 画像「交回自动」后 current_focus 仍是用户原文直到下次反思。
- I-D4 S3/P3 手机端「放到主屏」浮层盖住助理输入框（可 × 关）。

## J（10-18 补完；16 用例 14 过 2 部分，无 S0/S1）
- J-D3 原报 S2「Guide 送达」未保存 → 主线程复核：经纪 RLS 直写该列成功（回滚事务 row_count 1），字段 onBlur 才保存，判为探针未触发失焦；不算缺陷，下轮界面复测。
- J-D2 S3 收件页中文眉标「经经纪收件」→ 已改「经纪代收」（未部署）。
- J-D1 S3 /screening/app?as=agent 说明条中英两段同显（筛查模块，只能加法）。
- J-D4 S3 intake-links 创建返回 200 非 201（无影响）。J-D5 S3 已撤销收件链接页仍显示经纪姓名 + RECO 号（公开信息）。J-D6 S3「预开支票」发现链接 /rules 无锚点。
- 越界：components/agent/PrivateMemorySnapshot.tsx:96 登录后用原生 confirm()。

## 主线程处置（10-18）
- 已上线（ship 00:39 + 迁移 20261018_site_test_s0s1 已应用并回滚探针复核）：T4-01、T4-02/D-07、T4-03、T4-04、T6-D2（含 /api/lease/send 改 service role 读 token）、T6-D1（checkout/unlock 403 landlord_required，前端三处转 /landlord/become）。生产复核：匿名申请插入成功、房东读 sign_token 42501、租客改 household role 42501、lease/send 409 正常分支、租客 checkout 403。
- 已改未部署：B-D1、D-F-01、D-K1、D-K2、E-D2（申请人页批准后走 60 秒撤销再发）、J-D2。守卫 tests/siteTest20261018_{s0s1,fixes}.spec.ts；全量 206 文件 2877 测试通过。

## G+H（10-18 补完；G 40 执行 36 过 35 失败 1；H 18 全过）
- **G-D1 主线程升 S1/P0**（测试员报 S2）：`POST /api/work-orders/[id]/act` 回整行工单，含 `token` / `external_email` → 租客拿 token 走 /w/<token> 冒充外部联系人接单 / 报价 / 开账单。库层列级保护本身有效，泄露只在这条响应。修：响应按 WORK_ORDER_COLUMNS 白名单（已改）。
- G-D2 S2/P2 评价可写成非本工单服务商：provider_reviews_insert 策略把 w.provider_id 与自身比较（未限定列名）→ 迁移 20261018b 已应用，回滚探针复核（错服务商 42501）。
- G-D3 S3/P3 /w /lease/sign /p /join /delegate 不是 no-referrer → middleware 前缀表补齐（已改）。
- H-D1 S3/P3 英文界面会话预览 / 系统行显示「中文 / English」双语存储串。
- H-D2 S3/P3 撤回 10 分钟窗口只在界面拦，服务端可对旧消息插 retraction。
- 未执行：G-25 / G-26 / G-30（mark_paid、rework 路径，省邮件预算）、G-36（不再用 token 写）。
- 观察：消息搜索无匹配无空态。

## S3 收尾（10-18，部署 4 / 5 + 迁移 f / g / h / m）
- 已修：B-D2 · C-S3-2（= B-D3 后半）· B-D4 · O-D1 · O-D2 · C-S3-1（搜索每条只回一张图，153 KB → 91 KB）· C-S3-3 / D-S3-1（DocTitle 监听 head，防 Next 重写）· C-S3-4（只能加 noindex，客户端壳改不了状态码）· C-S3-6 · D-S3-2 · D-A3 · D-A4 · D-A5 · D-A6 · D-A8（terms_confirm_claims 认领）· D-F-02 · D-F-03 · E-D5 · E-D6 · T6-D5 · T6-D7（服务端路径过 stripNul；REST 直插仍回原话，可接受）· T6-D8 · T6-D9（页面 ACAO 锁本站，/api/v1、/api/mcp、/.well-known 保留 *）· T6-D10（企业注册两个 RPC 只给 service role）· H-D1 · H-D2（数据库也拦 10 分钟外撤回）· I-D3（交回自动清空原文 + 立即反思）· I-D4 · J-D2 · J-D4 · J-D6（新增规则 RTA-108-post-dated-cheques）· M-D1（迁移 m）· T4-06 · 越界：PrivateMemorySnapshot 两步确认、待批卡客户端只能插 pending · N-1 · N-2。
- 不修（原因）：E-D3 / E-D4 / J-D1 / B-D3 前半（筛查模块 DO NOT TOUCH）；T4-05（auth_id NOT NULL，删用户时级联还是禁止需先定，现无孤儿行）；J-D5（RECO 号本属公开信息）；越界 agent_directory.auth_id（委托与房源页按它关联，属功能需要）。
