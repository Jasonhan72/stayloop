# R1 · 数据库与接口层回归复测（2026-10-18）

范围：10-18 三批部署 + 迁移 20261018_site_test_s0s1 / b / c / d / e。方法：REST（各号 JWT，经 Auth Admin generate_link + /auth/v1/verify 换取，未输密码）、Management API 矩阵、`execute_sql` 的 begin … rollback。

| 缺陷编号 | 复测步骤 | 实际 | 结论 |
|---|---|---|---|
| 矩阵 | `bash scripts/e2e/db-matrix.sh` | 探针 269 条 268 过 1 败；清单 182 条 181 过 1 败（上轮 261/269、184/185）。剩余 2 条：#46 landlord 插 `lease_documents` 带 sign_token 并 RETURNING 它 → 42501（T6-D2 修复的直接结果：列已不可读写给客户端，探针期望已过期，应改探针）；#1000 anon 可执行函数 `listing_accepts_applications` 不在允许名单（T4-02 新增的 SECURITY DEFINER 助手，anon 策略需要它，应加入矩阵允许名单）。均非新缺陷，也不属旧 S3；T4-05 / T4-06（S3）仍存在但矩阵未设失败断言。夹具 #2 已恢复（tenant-test 无 landlords 行） | 已修复（余 2 条为探针期望待更新） |
| T4-01 | 查 `provider_directory` / `provider_credentials_public` / `agent_directory` 对 anon、authenticated 的 INSERT/UPDATE/DELETE 权限；tenant JWT 经 REST PATCH / DELETE provider_directory，POST agent_directory | 三个视图写权限全为 false；PATCH、DELETE → 403 `42501 permission denied for view provider_directory`；POST agent_directory → 500 `55000 cannot insert into view`（不可写，只是状态码不是 403） | 已修复 |
| T4-02 / D-07 | anon 角色在事务里向 `applications` 插入（有效房源 `[TEST] 200 Test QA Lane`、同意筛查）；矩阵 #27 同 | 插入 ok（rollback）；矩阵 #22 #27 通过，伪造 ai_score / 无同意 / 下架房源仍 42501 | 已修复 |
| T4-03 | tenant JWT PATCH `household_members.role=landlord`（自己在 1c9abb72） | 403 `42501 household_member_fields_frozen`；矩阵 #62 通过 | 已修复 |
| T4-04 | 事务内删除带 1 条更正记录的筛查 `10121e42…` | delete ok，`screening_corrections` 随之清零（rollback）；矩阵 #20 #21 通过 | 已修复 |
| T6-D2 | landlord / tenant / anon 读 `lease_documents?select=sign_token`；landlord 读 `id,status,tenant_email`；`select=*`；`/api/lease/view?token=`；`/api/lease/sign` token 模式 | sign_token：三者都 403 `42501`；其余列 200；`select=*` 403（客户端须列名，现有页面均已列名）；view 用库中 `sent` 租约 token → 200 返回租约内容，假 token → 404；sign 用已 signed_both 租约 token → 200 `already:true`（不写入），假 token → 404 | 已修复（「签署路由校验 JWT 邮箱 = tenant_email」那条加固未做，token 仍等同能力凭证，属按设计） |
| T6-D1 | tenant-test POST `/api/stripe/checkout`（空 body 与带 priceId）、`/api/stripe/unlock`（空 body 与带 listing_id）；查 landlords | 四次均 403 `{"error":"landlord_required"}`；tenant-test 的 landlords 行 0 条（上轮 4161c2c8 已不在，全表 9 行无新增） | 已修复 |
| G-D1 | tenant JWT `POST /api/work-orders/fcbcfcf1…/act` `{"action":"tenant_confirm"}` | 200，响应键 `ok,status,work_order`；work_order 47 个键，不含 `token`、`external_email`（库里该行二者均有值）；`landlord_auth_id` 等仍在，未列入缺陷 | 已修复 |
| G-D2 | tenant 身份事务内对工单 550ca87d（Northline）插评价，provider_id 指向别家 / 指向本家 | 别家 → 42501 RLS；本家 → 通过策略，仅被 `provider_reviews_work_order_id_by_user_key` 唯一约束挡（23505，已评过） | 已修复 |
| G-D3 | 八个路径假 token GET：`/w /lease/sign /p /join /delegate /verify /intake /my-file` | 全部 200 且 `Referrer-Policy: no-referrer` | 已修复 |
| E-D1 | landlord JWT 调 `ltb_coverage` RPC 12 次；anon 调用；库内 EXPLAIN | 12 次全 200、非空（2025-01-08 ~ 2026-06-30，49261 条）；端到端 68–165ms（含 VPN 往返，约 250ms 链路下实为本机量到的 curl 总时长），库内执行 1.5ms；anon → 401 `42501`。注意：`refreshed_at` 为 10-03，物化视图靠触发器刷新，之后无新判令入库所以未变 | 已修复（端到端 <100ms 仅 9/12 次，超出的 3 次 121–165ms 属网络抖动，库侧远小于 100ms） |
| C-S3-5 / T6-D11 | landlord 事务内把自己 `[TEST] 77 Sitetest Rd` 的 is_test 改 false | row_count 1，读回 is_test=true | 已修复 |
| C-S3-7 | landlord 事务内插入 `[TEST] 9 Retest St` 且显式 is_test=false；再插普通地址显式 is_test=true | 前者 is_test=true；后者 is_test=false（客户端不能自标测试） | 已修复 |
| D-F-04（数据层） | tenant JWT `rpc/lifecycle_facts_tenant` | households[0] 含 `start_date 2026-08-01`、`rent_due_day 1`、`next_lease_id`（键在，值 null，无下一份租约）、另有 `end_date`、`monthly_rent` | 已修复（界面层未测） |

## 新发现
- S3 · 矩阵探针 #46 与允许名单（#1000）期望过期，下次跑矩阵前更新 `scripts/e2e/db-matrix.sql`：#46 不再 RETURNING sign_token；把 `listing_accepts_applications` 加进 anon 允许名单。
- S3 · `POST /rest/v1/agent_directory` 返回 500 `55000` 而非 403（视图本身无写权限且不可更新，无安全影响）。
- 观察（未复现问题）：`lifecycle_facts_tenant()` 在无 JWT（postgres 直调）时返回了 muse 租客的 household，仅限超级用户直调，不是客户端路径。

## 数据副作用
- 生产库零持久写入：所有写探针（anon 申请、筛查级联删除、评价、is_test、矩阵）均在 begin … rollback 内；复测前后 landlords 行数不变。
- 一次真实写入：`POST /api/work-orders/fcbcfcf1…/act tenant_confirm`（工单已 paid，响应 200；可能刷新 `tenant_confirmed_at` / 事件行，`[TEST]` 数据）。
- `/api/lease/sign` 仅用已完成签署的租约 token（返回 already，无写入）；未签任何租约。`/api/lease/view` 只读。
- 脚本与 JWT 在本会话 scratchpad `r1/`（未写入仓库；密码、token 值未落盘到报告）。
