# T4 · 数据库集成：权限矩阵（2026-10-17 全站测试）

脚本 `scripts/e2e/db-matrix.sql`（一个 `begin … rollback` 块，**每条探针在自己的子事务里执行后故意抛错回滚**，生产库零写入）+ 运行器 `scripts/e2e/db-matrix.sh`（经 Supabase Management API `database/query` 以 postgres 执行，只打印失败行与 SUMMARY，失败 exit 1）。
以后每次迁移后跑一遍；期望值由 RLS 策略 / 列级授权 / 守卫触发器推导后写死在脚本里，改了策略先改期望。

## 用例设计

| 维度 | 取值 |
|---|---|
| 身份 | anon · tenant（tenant-test）· landlord（landlord-test）· agent（agent-test，RECO verified）· provider（provider-test）· stranger（无任何行的 uuid）· newbie（muse-tenant，只有租客帽子，测「新开通」默认值与纯租客门）· service（service_role，测「服务端也删不掉」） |
| 表 / 视图 | screenings · applications · applicant_applications · lease_documents · households · household_members · household_invites · rent_payments · notice_service_records · threads · thread_messages · work_orders · applicant_profiles · applicant_profile_files · consumer_requests / consumer_disputes / consumer_alerts / passport_share_views · screening_corrections · passport_share_tokens · delegations · agent_profiles / agent_directory / agent_intake_links · service_providers / provider_directory / provider_credentials_public · listings · landlords · tenants · showing_intents · 9 个 RPC（mark_rent_paid / confirm_rent_payment / my_hats / claim_landlord / my_external_contacts / provider_job_context / search_corp_registry / search_ltb_orders / auth_email_status / admin_list_users） |
| 动作 | 本人 / 他人 × select（含列级：token / invited_email / external_email / confirm_token / review_note / `select *`）· insert · update（含冻结列：plan / pro_trial_until / unlock_credits / unlocked_at / source / verification_status / display_* / feed_* / price_history / status / verified_at）· delete · 只追加（UPDATE / DELETE / TRUNCATE，含 service_role）· RPC 门（自确认、非成员、未来账期） |
| 清单 | ① anon 可执行函数 vs 允许名单 ② 对 anon / authenticated 有 INSERT / UPDATE / DELETE 表级授权的关系：表须 RLS 开、视图须不可更新 ③ SECURITY DEFINER 函数 search_path ④ 存储桶策略与桶上限 vs CLAUDE.md ⑤ pg_cron 任务 |

共 **269 条探针 + 185 条清单断言**（4 条夹具前置检查：夹具被别的测试员改动时先在这里报出来，不算缺陷）。

## 执行记录（2026-10-18 03:4x UTC，生产 `uotcczsfeiptnabamzcd`，三次迭代后定稿）

| 组 | 断言 | 通过 | 失败 |
|---|---|---|---|
| 探针（身份 × 表 × 动作） | 269 | 261 | 8 |
| 清单 ①–⑤ | 185 | 184 | 1 |

8 条探针失败 = **4 个缺陷（7 条）+ 1 条夹具漂移**；1 条清单失败是同一个 S0。全部失败行（`bash scripts/e2e/db-matrix.sh` 的原样输出）：

```
FAIL #2     service    fixture            tenant-test holds no landlord row (hat-probes.sh assumes this)   expected ok:0  actual ok:1
FAIL #20    landlord   screenings         delete S_L (own; cascade to screening_corrections must not be blocked)   expected ok:1  actual ERR P0001 append_only
FAIL #21    service    screenings         delete S_L as service role (DELETE /api/screening path)   expected ok:1  actual ERR P0001 append_only
FAIL #22    anon       applications       select all   expected ok:0  actual ERR 42501 permission denied for table listings
FAIL #27    anon       applications       insert on active listing with consent   expected ok:done  actual ERR 42501 permission denied for table listings
FAIL #62    tenant     household_members  update own role -> landlord (must not)   expected ERR.*|ok:tenant  actual ok:landlord
FAIL #224   tenant     provider_directory UPDATE via view (must be denied)   expected ERR 42501|ok:0  actual ok:1
FAIL #225   tenant     provider_directory DELETE via view (must be denied)   expected ERR 42501|ok:0  actual ERR 23514 (只被 work_orders 的 CHECK 挡住)
FAIL #2000  authenticated audit:write_grant provider_directory [DELETE,INSERT,UPDATE]   actual VIEW IS UPDATABLE (writes bypass RLS as owner)
```

通过的 261 条里值得记一笔的（都是 CLAUDE.md 里的承诺，这次实机证实）：anon 对 listings / threads / work_orders / delegations / consumer_* / applicant_profiles / agent_profiles / service_providers / household_invites / notice_service_records 直读一律 42501；`work_orders.token / external_email`、`household_invites.token / invited_email`、`delegations.confirm_token`、`agent_intake_links.token` 列级拒绝，`select * from work_orders` 对任何人 42501；`rent_payments` 只能经 `mark_rent_paid`（直插 42501、直改 0 行），`confirm_rent_payment` 自确认 22023、非成员 42501、未来账期 22023；`thread_messages` 租客插入时 `sender_id / sender_kind` 被触发器改回本人、kind=system 拒、非当事人拒，UPDATE / DELETE 对 authenticated 无授权、对 service_role `append_only`，TRUNCATE 被 FK 挡；`screening_corrections` 只有能读筛查的账号可读、service_role 也改删不了；`landlords.plan / pro_trial_until / unlock_credits`、`screenings.unlocked_at`、`listings.source / display_* / feed_* / price_history` 对直连客户端冻结，改租金即回 pending，新房东行 plan 被打回 free + 30 天试用 + 1 额度，新经纪 / 服务商行 status 被打回 pending；租客改 `household_members.household_id` 被 RLS 拒；`households` 成员不能改任何事实列、不能 insert / delete；`applications` 的 anon INSERT 策略对无同意 / 下架房源 / 伪造 ai_score 都拒（见下：但对正常申请也拒）。

## 缺陷

| # | 严重度 | 一句话 | 复现要点 | 影响 / 根因 | 建议 |
|---|---|---|---|---|---|
| T4-01 | **S0 / P0** | 任何登录用户能经 `provider_directory` 视图改写、删除**任意已核验服务商**的 `service_providers` 行 | 以 tenant-test 身份 `update provider_directory set contact_email='attacker@example.com' where id='8e668976-…'` → 1 行；`reset role` 后基表 `contact_email` 已变、status 仍 verified（回滚事务实测，脚本 #224）。`delete from provider_directory where id=…` 只因 `work_orders.provider_id` 的 FK + CHECK 失败（23514），没有工单的服务商会被真删。 | 视图 `security_invoker=false`、owner postgres，且是单表简单视图（`is_updatable=YES`），而 10-23 迁移时的默认权限给了 authenticated `INSERT/UPDATE/DELETE`；写操作以视图 owner 身份作用到基表，RLS 整个被绕过（和 2026-09-25 修掉的 `applicant_applications` 同一根因）。攻击面：把任何服务商的联系邮箱改成自己的，之后该服务商的派单邀请 / 进入通知 / 工单对话邮件全部改道；改 `legal_name` 让守卫把对方打回 pending（踢出目录）。 | `revoke insert, update, delete on provider_directory, provider_credentials_public, agent_directory from anon, authenticated`（三者都带写授权，后两者只是因为有 join 才不可更新）；并给 `provider_directory` 加 `with (security_barrier)` 或改为 `security_invoker=true` + 对 verified 行的 SELECT 策略。守卫：清单 ② 已断言「视图不可更新」。 |
| T4-02 | **S1 / P0** | 匿名访客无法提交申请（`/apply/<slug>` 未登录路径自 2026-10-11 起 100% 失败） | anon REST `POST /rest/v1/applications` → HTTP 401 `42501 permission denied for table listings`（对下架房源探针，无数据产生）；脚本 #27 对在架房源同样 42501。 | `applications` 的 anon INSERT 策略 WITH CHECK 直接 `exists (select 1 from listings …)`，而 `20261011_listings_anon_no_select.sql` 撤销了 anon 对 listings 的 SELECT；当时只核对了两个 SECURITY DEFINER 触发器，漏了策略本身。`app/apply/[slug]/page.tsx` 第 362 行用浏览器客户端直插，匿名申请人（CLAUDE.md 09-23「租客匿名提交申请」）全部撞墙。登录用户不受影响（authenticated 仍能读 listings）。 | 把策略里的 listings 子查询换成 SECURITY DEFINER 助手（如 `listing_accepts_applications(p_listing uuid)`，与 `recent_application_count` 同一做法），或只对 anon 开 `listings(id, is_active)` 两列的 SELECT。顺带 `showing_intents` 不受影响（需登录）。 |
| T4-03 | **S1 / P1** | 在管租约的租客成员能把自己的 `household_members.role` 改成 `landlord` | tenant-test `update household_members set role='landlord' where household_id=HH and user_id=自己` → `ok:landlord`（脚本 #62；household_id 与 user_id 的改动被 RLS 拒，只有 role 敞开）。 | 策略 `household_members_leave` 是 `FOR UPDATE … using/with check (user_id = auth.uid())`，没有限定只能改 `status`，表上也没有守卫触发器。`lib/marketplace/server.ts:56-59` 把 role='landlord' 的成员当工单「房东」——自升为房东的租客可以在该在管租约上派单、批准报价、向其他租客发 RTA s.27 进入通知；`confirm_rent_payment` 的审计身份、`people_for` / `thread_party` 的标签、`resolveTenantLandlord`（其他租客的报修会发给他）都按这一列。 | `BEFORE UPDATE` 守卫：直连客户端只允许改 `status`（且只能 active → left），其余列 `new := old`；或把策略改成列级（`revoke update on household_members from authenticated; grant update (status) …`）。 |
| T4-04 | **S2 / P1** | 有更正记录的筛查删不掉：`screening_corrections` 的只追加触发器把级联删除也挡了 | landlord-test 与 service_role 删 `10121e42…`（有 1 条更正）都报 `P0001 append_only`（脚本 #20 / #21）。 | CLAUDE.md V0.8 写「screening_corrections … 随筛查删除」，但 `consumer_append_only` 对 DELETE 一律 raise，`on delete cascade` 触发的删除同样被拒。结果：`DELETE /api/screening/<id>`（申请人数据删除请求的执行路径）对任何被更正过的筛查失败。 | 触发器里放行级联（`pg_trigger_depth() > 0` 或检查 `screenings` 行已不存在），或改为 `on delete set null` + 保留更正记录（更符合「更正记录是申请人的证据」）。二选一要定。 |
| T4-05 | S3 / P3 | `service_providers.auth_id` 没有指向 `auth.users` 的外键（landlords / agent_profiles / applicant_profiles 都有） | 脚本 #218：不存在的 uuid 作为 JWT sub 插入成功。 | RLS 把 auth_id 绑在 JWT 上，真 JWT 必来自 auth，所以没有实际越权；只是删用户时不会级联。 | 补 FK（on delete cascade），与其他帽子表一致。 |
| T4-06 | S3 / P3 | `is_email_unsubscribed(text)` 对 anon 可执行：任意邮箱可被探测是否退订过 | 清单 ① 允许名单里保留，但它返回布尔。 | 信息量极小（只是退订与否）。 | 可改为只给 service_role，退订页改走服务端。 |

**夹具漂移（不是缺陷）**：`tenant-test` 在 2026-10-18 03:31:24 UTC 被另一位测试员经 `claim_landlord()` 开通了房东身份（`landlords.id 4161c2c8-6f03-4f8c-85bd-66be7cdbfe7c`，审计 `hat_activated via postgres by_self`）。这让 `scripts/e2e/hat-probes.sh`「tenant-test holds no landlord row」与本脚本 #2 都失败，纯租客门的探针已改用 muse-tenant。**全站测试结束后请删掉这一行**（T4 自己不删他人数据）。同期 F 组在同一在管租约上记了 2026-10-01 租金并附回执、房东记了 N4 送达——都不影响本脚本（每条探针回滚），但「2026-08-01 账期未记录」这条前置检查以后可能被用掉，届时把自确认探针换一个账期。

## 清单 ①–⑤（清单 ②③④⑤ 全部通过）

- **① anon 可执行函数（扩展函数除外）**：`agent_intake_upload_allowed · application_file_readable · application_upload_allowed · attach_application_files · recent_application_count · decline_household_invite · peek_household_invite · is_household_member · is_stayloop_admin · is_stayloop_superadmin · is_direct_client_write · is_email_unsubscribed` —— 12 个全部在允许名单（存储策略助手 / 匿名申请 / `/join` / 策略与触发器助手）。`is_email_unsubscribed` 见 T4-06。2026-09-25 撤销的 7 个 RPC 与触发器函数都已不在列（`search_corp_registry` / `search_ltb_orders` / `claim_landlord` / `my_hats` / `auth_email_status` / `admin_list_users` 对 anon 实测 42501）。
- **② 写授权 vs 策略**：约 70 张表对 anon / authenticated 带 INSERT / UPDATE / DELETE 表级授权而策略不全（Supabase 默认权限遗留，CLAUDE.md 2026-09-25「记录不改」），**全部 RLS 开启**，矩阵里对应的写探针都被拒。三个视图 `agent_directory`（anon + authenticated）、`provider_directory`、`provider_credentials_public` 也带写授权：前者与后者因 join 不可更新，`provider_directory` 可更新 = T4-01。
- **③ SECURITY DEFINER 无 search_path**：0 个（public 下所有 definer 函数都设了）。
- **④ 存储**：10 条 `storage.objects` 策略与 CLAUDE.md 一致（tenancy-files 成员读 / 写；tenant-files 的 screenings 前缀本人 S/I/D、申请匿名上传 + 房东读、收件链接匿名上传 + 经纪读、申请包本人读），没有未登记的策略；`tenancy-files` 没有 UPDATE / DELETE 策略、`tenant-files/profile/*` 与 `thread-inbound`、`assistant-avatars` 没有任何客户端写策略（都只由服务端写）。桶：tenant-files / tenancy-files / thread-inbound 私有 25 MB，assistant-avatars 公开 2 MB，MIME 白名单如记录。
- **⑤ pg_cron**：`agent-proactive-daily 13:00 · agent-registration-sweep 13:20 · delegation-expiry-sweep 13:15 · household-lease-promote 05:05 · screening-stuck-sweep 13:25 · model-discover-weekly 周一 13:40` 全部 active；`realtor-freshness`、`trreb-rent-refresh` 已不存在（10-13 退役）。

## 越界发现

- `consumer_requests / consumer_disputes / consumer_alerts` 没有只追加触发器（只有 `screening_corrections` 与 `passport_share_views` 有）；服务端按设计可改，但与 CLAUDE.md「全部读写经服务端」一致，不算缺陷，记一笔。
- `screenings` 上同时存在旧策略 `Landlords can update own screenings`（`auth.uid() = landlord_id`）与新策略 `screenings_owner_update`（经 landlords.id），两套并存是双 ID 不变量的产物，行为正确。

## 数据副作用

无（每条探针在子事务里回滚，外层再 rollback；三次运行后 `select now()` 核对无遗留行）。匿名 REST 探针用的是已下架房源，被 42501 拒绝，未产生申请。
