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
