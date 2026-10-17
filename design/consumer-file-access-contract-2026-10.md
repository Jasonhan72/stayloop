# 消费者索取档案 · 争议更正 · 身份警示 — 三组共用契约（V0.8 第一项 · 2026-10-17）

方案 `design/consumer-file-access-plan-2026-10.md`（四步）本次一次做完。原则：申请人**只凭申请时用过的邮箱**行使权利；未验证邮箱看不到任何档案；
披露包不含任何其他申请人的数据；更正只追加不覆盖；**筛查模块（`app/screening/**`、`app/api/screen-score`、`lib/generateReport.ts`、`lib/forensics`）只做加法**（挂组件、加一列写入），不改逻辑。
文案叫「我的筛查档案 / My screening file」；全站不得出现「不是消费者报告机构」类声明（守卫 `craWording`）。

## 数据（G19 建；G20 / G21 只按此读写）
迁移 `supabase/migrations/20261017_consumer_file_access.sql`，所有新表 `revoke all … from public, anon, authenticated, service_role` 后只 `grant all to service_role`（除注明者）：
```
consumer_requests(id uuid pk, email text not null (lower), token text unique (64 hex), token_expires_at timestamptz, email_verified_at timestamptz,
  name text, date_of_birth date, delivery text check in ('electronic','mail','phone') default 'electronic', mail_address text, phone text,
  status text check in ('pending_verification','matched','needs_review','fulfilled','closed') default 'pending_verification',
  matched_screening_ids uuid[] default '{}', candidate_screening_ids uuid[] default '{}', due_at timestamptz, fulfilled_at timestamptz, closed_at timestamptz,
  admin_note text, handled_by uuid, ip_hash text, created_at timestamptz default now(), updated_at timestamptz default now())
consumer_disputes(id uuid pk, request_id uuid → consumer_requests, screening_id uuid → screenings, item_kind text check in ('fact','public_record','forensic_flag','credit','verification','other'),
  item_ref text (≤200), item_label text (≤300), statement text (≤2000), evidence_path text, status text check in ('open','corrected','supplemented','deleted','maintained') default 'open',
  resolution_note text (≤2000), resolved_by uuid, resolved_at timestamptz, notified_at timestamptz, notified_to jsonb default '[]', created_at timestamptz default now())
screening_corrections(id uuid pk, screening_id uuid → screenings not null, dispute_id uuid → consumer_disputes, item_kind text, item_ref text, item_label text,
  action text check in ('corrected','supplemented','deleted','maintained'), note text (≤2000), created_by uuid, created_at timestamptz default now())
  — 只追加：触发器对所有角色拒绝 UPDATE/DELETE；RLS：`select` 给 authenticated 当 `exists(select 1 from screenings s where s.id = screening_id)`（即调用者能读该筛查——复用 screenings 的 RLS），`grant select to authenticated`。
consumer_alerts(id uuid pk, email text not null (lower), name text, statement text (≤500) not null, created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '6 years', revoked_at timestamptz, request_id uuid)
passport_share_views(id uuid pk, token text → passport_share_tokens, viewed_at timestamptz default now(), ip_hash text, user_agent text (≤200)) — 只追加，service role 写。
alter table screenings add notice_confirmed_at timestamptz, notice_confirmed_how text check in ('application_consent','intake_consent','landlord_attested','partner_attested')  — 直连客户端可写（房东在筛查页勾选时 update 自己的行）。
```
`due_at` = 创建时间 + 2 个工作日（`lib/consumer/businessDays.ts addBusinessDays(d, 2)`，周末跳过，不算法定假日）。

## 纯模块（G19，`lib/consumer/*`，无 'use client'）
- `types.ts`：`ConsumerRequest / ConsumerDispute / ScreeningCorrection / ConsumerAlert / DisclosurePack / PackScreening / PackViewer / PackItem`。
- `match.ts`：`findCandidateScreenings(admin, email)` → 经 `applications.email`（→ `screenings.application_id`）、`verification_requests.tenant_email`（→ `screening_id`）、`agent_intake_submissions.applicant_email`（→ `screening_id`）三条链取 screening id 集合；
  `nameMatches(input, {tenant_name, ai_extracted_name, first_name, last_name})`（NFKC、去重音、token 集合，名与姓都要命中其一；一字之差 ≥5 字母容忍）；`dobMatches(input, applications.date_of_birth)`（有 DOB 时必须相等，无 DOB 不判）；
  `classify()` → `matched`（邮箱链命中 ≥1 且姓名命中、DOB 不冲突）| `needs_review`（邮箱命中但姓名 / DOB 不符，或零命中）。
- `pack.ts`：`buildDisclosurePack({request, screenings[], applications[], verifications[], corrections[], viewers[], recipients[], alerts[], lang})` → `DisclosurePack`：
  每个筛查 → `PackScreening { screening_id, created_at, landlord_name, property, tier_label, summary, items: PackItem[] (kind fact|public_record|forensic_flag|credit|verification, ref, label(浅白), detail, unverified:boolean), sources: string[], documents: {kind,name}[], corrections[] }`；
  `viewers`（3 年内）：筛查房东（`landlords.full_name/phone/email`）、委托经纪、`agent_audit_events` 里 `application_file_viewed/downloaded` 的 actor、`trust_api_passport_verify` 的 partner_name、`passport_share_views` 逐次（匿名，时间）；
  `recipients`（1 年内收到报告者）：房东 + 委托人 + partner（`partner_key_id`）。
  PackItem 取自 `ai_dimension_notes._v3`：`extracted_names / detected_monthly_income / employer / addresses`、`red_flags`、`hard_gates_triggered`（`signalLabel`）、`forensics_detail.flags`（code → `signalLabel`，severity）、`court_records_detail`（每条命中 + 是否佐证 → `unverified`）、`verification` 步骤。**不包含其他申请人的任何字段；数字分数只给 `ai_score` 与 `v3_tier`。**
- `render.ts`：`renderDisclosurePack(pack, lang)` → 可打印 HTML（照 `lib/generateReport.ts` 的 `.sheet` + 工具栏做法；`esc()` 全部；首页固定段落：这是什么、你的权利（争议 / 更正 / 身份警示 / 免费 / 2 个工作日）、联系方式 `privacy@stayloop.ai`；每条 item 带「这条不对？→ 在线提出争议」的提示而非按钮）；指纹 SHA-256 印在末尾。
- `alerts.ts`：`activeAlertFor(admin, email)`；`alertBanner(alert, lang)` 文案。
- `businessDays.ts`。

## 路由（G19，edge；申请人侧**全部匿名 + token**，没有登录）
- `POST /api/consumer/request {email, lang?}` → 永远 200 `{ok:true}`（防枚举）；每 IP 5/h、每邮箱 3/h fail-closed；建 `consumer_requests`（token 64 hex、24h）、发邮件「确认是你 · 查看我的筛查档案」链到 `/my-file/<token>`；审计 `consumer_request_created`（actor system）。
- `GET /api/consumer/request/<token>` → `{status, email_masked, name?, delivery, due_at, matched: PackScreening[] 摘要（只 id/日期/房东名/物业）, disputes: [...], alert: ConsumerAlert|null}`；token 无效 / 过期 → 404 `{error:'invalid_token'}`。首次 GET 把 `email_verified_at` 盖上。
- `POST /api/consumer/request/<token>/verify {name, date_of_birth?, delivery, mail_address?, phone?}` → 跑匹配：`matched` → 若 electronic 立即 `fulfilled`（`fulfilled_at`）；`needs_review` → 保持并通知管理员邮件；mail/phone → `matched` 但不 fulfilled，入队列。返回同 GET。审计 `consumer_request_verified`。
- `GET /api/consumer/request/<token>/pack?format=html|json` → 只在 `status in ('matched','fulfilled')` 且 `email_verified_at` 时返回披露包；HTML 带 `X-Content-Fingerprint`；审计 `consumer_file_disclosed`（每次）。
- `POST /api/consumer/request/<token>/dispute {screening_id, item_kind, item_ref, item_label, statement}`（screening_id 必须在 `matched_screening_ids`）→ 建 `consumer_disputes`，管理员邮件，返回 `{id}`；每 token 每小时 10 条。审计 `consumer_dispute_filed`。
- `POST /api/consumer/request/<token>/alert {statement}` / `DELETE …/alert` → upsert / revoke `consumer_alerts`（email 来自 request），审计 `consumer_alert_set / consumer_alert_revoked`。
- `GET /api/consumer/alert?screening=<id>`（房东 JWT；RLS 读到该筛查即可）→ 该筛查申请人邮箱（同 match 三条链）上的有效警示 `{alert:{statement, created_at}|null}`。
- `GET /api/admin/consumer`（管理员 JWT，照 `app/api/admin/partners/route.ts` 的 `guard`）→ `{requests:[…含 candidate 与 matched 的筛查摘要], disputes:[…]}`；
  `POST /api/admin/consumer {action:'confirm_match', request_id, screening_ids[]}` / `{action:'close', request_id, note}` / `{action:'mark_delivered', request_id, note}` /
  `{action:'resolve_dispute', dispute_id, resolution:'corrected'|'supplemented'|'deleted'|'maintained', note}` —— resolve 写 `screening_corrections`（只追加）、把 `consumer_disputes` 置状态、
  **通知**：60 天内收到报告的收件人（筛查房东邮箱、委托人、`partner_key_id` 的 webhook_url 若有）各发一封「更正通知」邮件并记 `notified_to`；申请人（request.email）发结果邮件；审计 `consumer_dispute_resolved` + `correction_notice_emailed`。
- 既有路由加写入：`app/api/screening/from-application/route.ts` 建行时 `notice_confirmed_at=now(), notice_confirmed_how='application_consent'`；`app/api/agent-intake/[token]/route.ts` 同 `intake_consent`；
  `app/api/v1/screen/route.ts` 已关闭不动；`app/api/v1/passport/verify/route.ts` 响应多 `alert`（该租客邮箱的有效警示）。
- `app/p/[token]/page.tsx` 每次打开除 `view_count+1` 外插一行 `passport_share_views`（service role；ip 只存 sha256 前 16 位）。

## 页面
- G20：`/my-file`（输邮箱）→ 邮件 → `/my-file/<token>`（验证表单 → 匹配结果 → 披露包页内 iframe + 「打印 / 保存 PDF」+ JSON → 逐条「这条不对」争议表单 → 身份警示设置 / 撤销 → 争议状态列表）；`/consumer-rights` 公开说明页；中间件对 `/my-file/` 加 `no-referrer`；
  隐私页第 3 节 + 通知信「你的权利」段 + 报告页末尾各加一句链到 `/consumer-rights` 与 `/my-file`；报告页与完成页顶部 `components/screening/CorrectionsNotice.tsx`（读 `screening_corrections`，有则显示「本档案有 N 条更正记录」逐条）+ `components/screening/ConsumerAlertBanner.tsx`（调 `/api/consumer/alert`）。
- G21：`/admin/consumer-requests`（请求与争议一个队列，`due_at` 倒计时，逾期红；动作按上面的 admin API）；`/admin` 控制台一块「消费者档案请求 · N 待办」；
  `app/screening/app/page.tsx` **只加**一个必勾复选框「申请人已收到书面通知（Form 410 / 申请页同意 / 收件链接授权）· s.11(3)」——未勾不能开始新筛查；行建好后 `update screenings set notice_confirmed_at, notice_confirmed_how='landlord_attested'`；
  `/settings` 房东段加「联系电话（《消费者报告法》披露会列出查阅过申请人档案的人的姓名与电话）」写 `landlords.phone`。

## 文案
中英双语、平实口语；「我的筛查档案」「索取档案」「提出争议」「身份警示」；时限句「电子方式即时；邮寄或电话方式 2 个工作日内」；免费；不得写「不是报告机构」。
