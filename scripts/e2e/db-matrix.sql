-- =====================================================================================
-- Stayloop · T4 数据库权限矩阵（2026-10-17 起，每次迁移后跑一遍）
--
-- 用法（三选一）：
--   bash scripts/e2e/db-matrix.sh                 # 经 Management API 跑（PAT 取 env 或 .env.local），只打印失败行 + SUMMARY，失败 exit 1
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/e2e/db-matrix.sql
--   或把整个文件贴进 Supabase MCP execute_sql / SQL editor（以 postgres 身份执行）。
-- 结果基线：design/test-cases-2026-10-17/T4-db-matrix.md（2026-10-18 首跑：269 探针 8 失败 = 4 个缺陷 + 1 条夹具漂移）。
--
-- 原理：一个 begin … rollback 事务。每条探针在自己的子事务里 set_config('role') +
-- request.jwt.claims 模拟身份，执行一条返回 text 的 SQL，然后**故意抛错**让子事务回滚
-- （所以任何写入都不会留下，即使外层 rollback 漏了也一样）。实际值 = 'ok:<返回值>' 或
-- 'ERR <sqlstate>'；期望值是一个正则，由 RLS 策略 / 列级授权 / 守卫触发器推导后写死。
-- 最后一列 pass；SUMMARY 行给总数。另有四张清单（① anon 可执行函数 ② 写授权与策略
-- ③ SECURITY DEFINER 的 search_path ④ 存储桶策略）与 pg_cron 任务。
--
-- 夹具（生产 [TEST] 数据，正式发布前不删）：
--   T  tenant-test     dc734f3e-5bdc-4d32-8ba2-e15729c64956  tenants.id 3249a9c8-a778-4505-a546-63c4934756f2
--   L  landlord-test   30d0c280-562d-4d6c-85bf-25cf5862cb8e  landlords.id 80646b6a-9c7b-4a17-a850-4ff774ea6d64
--   A  agent-test      4388a326-5e19-43c7-81ac-80abbdc91d21  (RECO verified; 服务商 4c890786-c9b8-45ae-837b-3040aa3a3570)
--   P  provider-test   f6b97901-951d-483f-8515-eff7c3761a5d  (服务商 8e668976-c8bb-448c-87cb-20eb52f29b6c)
--   X  陌生 uuid        00000000-0000-4000-8000-000000000001  (任何表都没有行；auth.users 里也没有 → 带 FK 的插入必然 23503)
--   N  newbie = muse-tenant 492d2d59-8d13-4b06-b988-c67c142587bc（只有租客帽子，用来测「新开通」的默认值与纯租客门）
--   HH 在管租约 1c9abb72-c433-498b-942d-0d448fb8342f（L 房东成员 · T 租客成员）
--   HH2 muse 在管租约 2abfd3e7-17ee-46c6-b029-46363fde4608（T 不是成员）
--   LEASE 46b558d0-0028-42dd-9964-0f1b88829c20（L 的，signed_both，tenant_email = T）
--   S_L 筛查 10121e42-98a8-418c-9feb-33c338bc633d（L）· S_A c2c1de6c-c02e-4171-8034-e7af9a4c9c60（A）
--   APP 申请 a8eb88f1-f0f4-4d54-ad9b-568cf9578e65（T → L 的房源 LST）
--   LST 房源 8657c40d-fde6-4b40-af47-fb0f46f52cbb（L，verified，已下架）· LST_PUB 0ca3a060-82f8-4248-81b4-633f6313eeff（muse-landlord，在架）
--   INV 邀请 6732fdb6-a6c6-4eb1-af6b-1a60f5bc097a（HH，已接受）
--   TH_TEN 6eca91f3-efc7-4cbe-addd-cace22f08fb0（tenancy）· TH_WO 3c1f0531-1b8e-467b-9c1e-b0a87a6dfe8a（work_order）· TH_SUP ffaec93e-38c8-4dab-aa41-e775109df6b1（L 的客服对话）
--   WO 963e805b-091d-4fa9-b2fa-a31d7744fd72（L · 服务商 P · HH）
--   DLG 委托 145e93ad-8a9e-4a5e-839d-29795be08ee2（A → L，revoked）
--   NSR 送达记录 f9530840-eea0-4092-b64f-4c6c7ad77fc1（L）· COR 更正 a8aeaa1f-a2cb-4eb6-a0e1-f3fb1d2149a5（S_L）
--   INTAKE 收件链接 4041e7e2-4f44-41d5-87c5-ccdfa14f8374（A，已撤销）
-- =====================================================================================
begin;

create temp table ident(who text primary key, rolename text, claims text);
insert into ident values
  ('anon',     'anon',          '{"role":"anon"}'),
  ('tenant',   'authenticated', '{"sub":"dc734f3e-5bdc-4d32-8ba2-e15729c64956","role":"authenticated","email":"tenant-test@stayloop.ai"}'),
  ('landlord', 'authenticated', '{"sub":"30d0c280-562d-4d6c-85bf-25cf5862cb8e","role":"authenticated","email":"landlord-test@stayloop.ai"}'),
  ('agent',    'authenticated', '{"sub":"4388a326-5e19-43c7-81ac-80abbdc91d21","role":"authenticated","email":"agent-test@stayloop.ai"}'),
  ('provider', 'authenticated', '{"sub":"f6b97901-951d-483f-8515-eff7c3761a5d","role":"authenticated","email":"provider-test@stayloop.ai"}'),
  ('stranger', 'authenticated', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","email":"stranger@example.com"}'),
  ('newbie',   'authenticated', '{"sub":"492d2d59-8d13-4b06-b988-c67c142587bc","role":"authenticated","email":"muse-tenant@stayloop.ai"}'),
  ('service',  'service_role',  '{"role":"service_role"}');

create temp table probe(n serial, who text, tbl text, action text, expected text, sql text);
create temp table result(n int, who text, tbl text, action text, expected text, actual text, detail text, pass boolean);

create function pg_temp.run_one(p_who text, p_sql text, out actual text, out detail text)
language plpgsql as $fn$
declare r record; v text;
begin
  select * into r from ident where who = p_who;
  if r.who is null then actual := 'ERR no-ident'; detail := p_who; return; end if;
  begin
    perform set_config('role', r.rolename, true);
    perform set_config('request.jwt.claims', r.claims, true);
    execute p_sql into v;
    raise exception using errcode = 'P9999', message = 'OK:' || coalesce(v, 'null');
  exception when others then
    if sqlstate = 'P9999' then actual := 'ok:' || substr(sqlerrm, 4); detail := '';
    else actual := 'ERR ' || sqlstate; detail := left(regexp_replace(sqlerrm, '\s+', ' ', 'g'), 110); end if;
  end;
end $fn$;

-- ---------------------------------------------------------------- probes
insert into probe(who, tbl, action, expected, sql) values
-- fixture preconditions (service role) — a failure here means another tester changed the test accounts, not a bug
('service','fixture','newbie (muse-tenant) holds no landlord / agent / provider row','ok:0', $$select ((select count(*) from landlords where auth_id='492d2d59-8d13-4b06-b988-c67c142587bc') + (select count(*) from agent_profiles where auth_id='492d2d59-8d13-4b06-b988-c67c142587bc') + (select count(*) from service_providers where auth_id='492d2d59-8d13-4b06-b988-c67c142587bc'))::text$$),
('service','fixture','tenant-test holds no landlord row (hat-probes.sh assumes this)','ok:0', $$select count(*)::text from landlords where auth_id='dc734f3e-5bdc-4d32-8ba2-e15729c64956'$$),
('service','fixture','HH members are exactly L (landlord) + T (tenant)','ok:landlord:30d0c280,tenant:dc734f3e', $$select string_agg(role||':'||left(user_id::text,8), ',' order by role) from household_members where household_id='1c9abb72-c433-498b-942d-0d448fb8342f' and status='active'$$),
('service','fixture','rent period 2026-08-01 on LEASE not yet recorded (self_confirm probe needs a fresh period)','ok:0', $$select count(*)::text from rent_payments where lease_id='46b558d0-0028-42dd-9964-0f1b88829c20' and due_date='2026-08-01'$$),
-- screenings ---------------------------------------------------------------
('anon','screenings','select all','ok:0', $$select count(*)::text from screenings$$),
('stranger','screenings','select all','ok:0', $$select count(*)::text from screenings$$),
('tenant','screenings','select S_L (own application)','ok:0', $$select count(*)::text from screenings where id='10121e42-98a8-418c-9feb-33c338bc633d'$$),
('landlord','screenings','select S_L','ok:1', $$select count(*)::text from screenings where id='10121e42-98a8-418c-9feb-33c338bc633d'$$),
('agent','screenings','select S_A (own)','ok:1', $$select count(*)::text from screenings where id='c2c1de6c-c02e-4171-8034-e7af9a4c9c60'$$),
('agent','screenings','select S_L (other)','ok:0', $$select count(*)::text from screenings where id='10121e42-98a8-418c-9feb-33c338bc633d'$$),
('newbie','screenings','insert as self (pure tenant, guard_screening_role)','ERR 42501', $$with i as (insert into screenings(landlord_id,tenant_name,status,files) values ('492d2d59-8d13-4b06-b988-c67c142587bc','probe','uploading','[]') returning 1) select count(*)::text from i$$),
('stranger','screenings','insert as self','ERR 42501', $$with i as (insert into screenings(landlord_id,tenant_name,status,files) values ('00000000-0000-4000-8000-000000000001','probe','uploading','[]') returning 1) select count(*)::text from i$$),
('landlord','screenings','insert as self','ok:1', $$with i as (insert into screenings(landlord_id,tenant_name,status,files) values ('30d0c280-562d-4d6c-85bf-25cf5862cb8e','probe','uploading','[]') returning 1) select count(*)::text from i$$),
('agent','screenings','insert as self (RECO verified, no delegation)','ok:1', $$with i as (insert into screenings(landlord_id,tenant_name,status,files) values ('4388a326-5e19-43c7-81ac-80abbdc91d21','probe','uploading','[]') returning 1) select count(*)::text from i$$),
('agent','screenings','insert with revoked delegation','ERR (42501|P0001)', $$with i as (insert into screenings(landlord_id,tenant_name,status,files,delegation_id) values ('4388a326-5e19-43c7-81ac-80abbdc91d21','probe','uploading','[]','145e93ad-8a9e-4a5e-839d-29795be08ee2') returning 1) select count(*)::text from i$$),
('landlord','screenings','update unlocked_at (frozen)','ok:null', $$with u as (update screenings set unlocked_at=now() where id='10121e42-98a8-418c-9feb-33c338bc633d' returning unlocked_at) select coalesce(unlocked_at::text,'null') from u$$),
('landlord','screenings','update tenant_name (own)','ok:1', $$with u as (update screenings set tenant_name='probe' where id='10121e42-98a8-418c-9feb-33c338bc633d' returning 1) select count(*)::text from u$$),
('tenant','screenings','update S_L','ok:0', $$with u as (update screenings set tenant_name='probe' where id='10121e42-98a8-418c-9feb-33c338bc633d' returning 1) select count(*)::text from u$$),
('tenant','screenings','delete S_L','ok:0', $$with d as (delete from screenings where id='10121e42-98a8-418c-9feb-33c338bc633d' returning 1) select count(*)::text from d$$),
('landlord','screenings','delete S_L (own; cascade to screening_corrections must not be blocked)','ok:1', $$with d as (delete from screenings where id='10121e42-98a8-418c-9feb-33c338bc633d' returning 1) select count(*)::text from d$$),
('service','screenings','delete S_L as service role (DELETE /api/screening path; cascade to corrections)','ok:1', $$with d as (delete from screenings where id='10121e42-98a8-418c-9feb-33c338bc633d' returning 1) select count(*)::text from d$$),
-- applications ------------------------------------------------------------
('anon','applications','select all','ok:0', $$select count(*)::text from applications$$),
('tenant','applications','select own (base table has no applicant policy)','ok:0', $$select count(*)::text from applications where email='tenant-test@stayloop.ai'$$),
('landlord','applications','select APP','ok:1', $$select count(*)::text from applications where id='a8eb88f1-f0f4-4d54-ad9b-568cf9578e65'$$),
('landlord','applications','update APP status','ok:1', $$with u as (update applications set status='new' where id='a8eb88f1-f0f4-4d54-ad9b-568cf9578e65' returning 1) select count(*)::text from u$$),
('tenant','applications','update APP','ok:0', $$with u as (update applications set status='approved' where id='a8eb88f1-f0f4-4d54-ad9b-568cf9578e65' returning 1) select count(*)::text from u$$),
('anon','applications','insert on active listing with consent','ok:done', $$with i as (insert into applications(id,listing_id,first_name,last_name,email,phone,consent_screening) values (gen_random_uuid(),'0ca3a060-82f8-4248-81b4-633f6313eeff','Probe','Anon','probe-anon@example.com','4165550100',true)) select 'done'$$),
('anon','applications','insert without consent','ERR 42501', $$with i as (insert into applications(id,listing_id,first_name,last_name,email,phone,consent_screening) values (gen_random_uuid(),'0ca3a060-82f8-4248-81b4-633f6313eeff','Probe','Anon','probe-anon@example.com','4165550100',false)) select 'done'$$),
('anon','applications','insert on inactive listing','ERR 42501', $$with i as (insert into applications(id,listing_id,first_name,last_name,email,phone,consent_screening) values (gen_random_uuid(),'8657c40d-fde6-4b40-af47-fb0f46f52cbb','Probe','Anon','probe-anon@example.com','4165550100',true)) select 'done'$$),
('anon','applications','insert with ai_score (forged)','ERR 42501', $$with i as (insert into applications(id,listing_id,first_name,last_name,email,phone,consent_screening,ai_score) values (gen_random_uuid(),'0ca3a060-82f8-4248-81b4-633f6313eeff','Probe','Anon','probe-anon@example.com','4165550100',true,99)) select 'done'$$),
('landlord','applications','insert on own listing (guard_not_own_listing)','ERR (42501|P0001)', $$with i as (insert into applications(id,listing_id,first_name,last_name,email,phone,consent_screening) values (gen_random_uuid(),'8657c40d-fde6-4b40-af47-fb0f46f52cbb','Probe','Own','landlord-test@stayloop.ai','4165550100',true)) select 'done'$$),
('anon','applicant_applications','select view','ERR 42501', $$select count(*)::text from applicant_applications$$),
('tenant','applicant_applications','select own via view','ok:[1-9][0-9]*', $$select count(*)::text from applicant_applications$$),
('landlord','applicant_applications','select (no applications as applicant)','ok:0', $$select count(*)::text from applicant_applications$$),
('tenant','applicant_applications','select has no score column','ERR 42703', $$select count(ai_score)::text from applicant_applications$$),
('tenant','applicant_applications','update via view','ERR (42501|55000)', $$with u as (update applicant_applications set status='approved' returning 1) select count(*)::text from u$$),
-- lease_documents ---------------------------------------------------------
('anon','lease_documents','select all','ok:0', $$select count(*)::text from lease_documents$$),
('stranger','lease_documents','select LEASE','ok:0', $$select count(*)::text from lease_documents where id='46b558d0-0028-42dd-9964-0f1b88829c20'$$),
('tenant','lease_documents','select LEASE (tenant_email / member)','ok:1', $$select count(*)::text from lease_documents where id='46b558d0-0028-42dd-9964-0f1b88829c20'$$),
('landlord','lease_documents','select LEASE','ok:1', $$select count(*)::text from lease_documents where id='46b558d0-0028-42dd-9964-0f1b88829c20'$$),
('agent','lease_documents','select LEASE','ok:0', $$select count(*)::text from lease_documents where id='46b558d0-0028-42dd-9964-0f1b88829c20'$$),
('tenant','lease_documents','update LEASE (forge tenant signature)','ok:0', $$with u as (update lease_documents set tenant_signature='{"forged":true}' where id='46b558d0-0028-42dd-9964-0f1b88829c20' returning 1) select count(*)::text from u$$),
('landlord','lease_documents','update LEASE status back to draft (frozen after signing)','ok:signed_both|ERR.*', $$with u as (update lease_documents set status='draft' where id='46b558d0-0028-42dd-9964-0f1b88829c20' returning status) select status from u$$),
('landlord','lease_documents','update LEASE landlord_id (frozen)','ok:80646b6a-9c7b-4a17-a850-4ff774ea6d64|ERR.*', $$with u as (update lease_documents set landlord_id='fd48f17f-07e5-4f63-8462-cecdae5101e3' where id='46b558d0-0028-42dd-9964-0f1b88829c20' returning landlord_id::text) select landlord_id from u$$),
('landlord','lease_documents','delete signed LEASE','ok:0', $$with d as (delete from lease_documents where id='46b558d0-0028-42dd-9964-0f1b88829c20' returning 1) select count(*)::text from d$$),
('landlord','lease_documents','insert pre-signed (guard clears)','ok:(draft|active)/null/null', $$with i as (insert into lease_documents(landlord_id,status,tenant_email,landlord_signature,tenant_signature,sign_token) values ('80646b6a-9c7b-4a17-a850-4ff774ea6d64','signed_both','probe@example.com','{"a":1}','{"b":1}','tok') returning status||'/'||coalesce(landlord_signature::text,'null')||'/'||coalesce(tenant_signature::text,'null')) select * from i$$),  -- sign_token is not client-readable since T6-D2 (2026-10-18)
('tenant','lease_documents','insert with landlord_id = L','ERR 42501', $$with i as (insert into lease_documents(landlord_id,status,tenant_email) values ('80646b6a-9c7b-4a17-a850-4ff774ea6d64','draft','probe@example.com') returning 1) select count(*)::text from i$$),
-- households / members / invites -----------------------------------------
('anon','households','select all','ok:0', $$select count(*)::text from households$$),
('stranger','households','select HH','ok:0', $$select count(*)::text from households where id='1c9abb72-c433-498b-942d-0d448fb8342f'$$),
('provider','households','select HH (provider of WO, no direct read)','ok:0', $$select count(*)::text from households where id='1c9abb72-c433-498b-942d-0d448fb8342f'$$),
('tenant','households','select HH','ok:1', $$select count(*)::text from households where id='1c9abb72-c433-498b-942d-0d448fb8342f'$$),
('landlord','households','select HH','ok:1', $$select count(*)::text from households where id='1c9abb72-c433-498b-942d-0d448fb8342f'$$),
('tenant','households','update verified/rent (no update policy)','ok:0', $$with u as (update households set verified=false, monthly_rent=1 where id='1c9abb72-c433-498b-942d-0d448fb8342f' returning 1) select count(*)::text from u$$),
('tenant','households','delete HH','ok:0', $$with d as (delete from households where id='1c9abb72-c433-498b-942d-0d448fb8342f' returning 1) select count(*)::text from d$$),
('tenant','households','insert (no insert policy)','ERR 42501', $$with i as (insert into households(address,city,created_by,verified) values ('1 Probe St','Toronto','dc734f3e-5bdc-4d32-8ba2-e15729c64956',true) returning 1) select count(*)::text from i$$),
('anon','household_members','select all','ok:0', $$select count(*)::text from household_members$$),
('stranger','household_members','select HH members','ok:0', $$select count(*)::text from household_members where household_id='1c9abb72-c433-498b-942d-0d448fb8342f'$$),
('tenant','household_members','select HH members','ok:2', $$select count(*)::text from household_members where household_id='1c9abb72-c433-498b-942d-0d448fb8342f'$$),
('tenant','household_members','insert self into HH2','ERR 42501', $$with i as (insert into household_members(household_id,user_id,role,status) values ('2abfd3e7-17ee-46c6-b029-46363fde4608','dc734f3e-5bdc-4d32-8ba2-e15729c64956','tenant','active') returning 1) select count(*)::text from i$$),
('tenant','household_members','delete own row','ok:0', $$with d as (delete from household_members where household_id='1c9abb72-c433-498b-942d-0d448fb8342f' and user_id='dc734f3e-5bdc-4d32-8ba2-e15729c64956' returning 1) select count(*)::text from d$$),
('tenant','household_members','update own status=left (leave)','ok:left', $$with u as (update household_members set status='left' where household_id='1c9abb72-c433-498b-942d-0d448fb8342f' and user_id='dc734f3e-5bdc-4d32-8ba2-e15729c64956' returning status) select status from u$$),
('tenant','household_members','update own role -> landlord (must not)','ERR.*|ok:tenant', $$with u as (update household_members set role='landlord' where household_id='1c9abb72-c433-498b-942d-0d448fb8342f' and user_id='dc734f3e-5bdc-4d32-8ba2-e15729c64956' returning role) select role from u$$),
('tenant','household_members','update own household_id -> HH2 (must not)','ERR.*|ok:1c9abb72-c433-498b-942d-0d448fb8342f', $$with u as (update household_members set household_id='2abfd3e7-17ee-46c6-b029-46363fde4608' where household_id='1c9abb72-c433-498b-942d-0d448fb8342f' and user_id='dc734f3e-5bdc-4d32-8ba2-e15729c64956' returning household_id::text) select household_id from u$$),
('tenant','household_members','update other member role','ok:0', $$with u as (update household_members set role='tenant' where household_id='1c9abb72-c433-498b-942d-0d448fb8342f' and user_id='30d0c280-562d-4d6c-85bf-25cf5862cb8e' returning 1) select count(*)::text from u$$),
('anon','household_invites','select (no grant)','ERR 42501', $$select count(*)::text from household_invites$$),
('stranger','household_invites','select INV','ok:0', $$select count(*)::text from household_invites where id='6732fdb6-a6c6-4eb1-af6b-1a60f5bc097a'$$),
('tenant','household_invites','select INV (member)','ok:1', $$select count(*)::text from household_invites where id='6732fdb6-a6c6-4eb1-af6b-1a60f5bc097a'$$),
('tenant','household_invites','select token column','ERR 42501', $$select count(token)::text from household_invites$$),
('tenant','household_invites','select invited_email column','ERR 42501', $$select count(invited_email)::text from household_invites$$),
('tenant','household_invites','insert tenant invite (member)','ok:tenant', $$with i as (insert into household_invites(household_id,invited_email,invited_role,invited_by) values ('1c9abb72-c433-498b-942d-0d448fb8342f','probe@example.com','tenant','dc734f3e-5bdc-4d32-8ba2-e15729c64956') returning invited_role) select invited_role from i$$),
('tenant','household_invites','insert landlord invite (landlord already member)','ERR (42501|P0001)', $$with i as (insert into household_invites(household_id,invited_email,invited_role,invited_by) values ('1c9abb72-c433-498b-942d-0d448fb8342f','probe@example.com','landlord','dc734f3e-5bdc-4d32-8ba2-e15729c64956') returning invited_role) select invited_role from i$$),
('stranger','household_invites','insert into HH','ERR 42501', $$with i as (insert into household_invites(household_id,invited_email,invited_role,invited_by) values ('1c9abb72-c433-498b-942d-0d448fb8342f','probe@example.com','tenant','00000000-0000-4000-8000-000000000001') returning 1) select count(*)::text from i$$),
('tenant','household_invites','update revoked_at (allowed column)','ok:1', $$with u as (update household_invites set revoked_at=now() where id='6732fdb6-a6c6-4eb1-af6b-1a60f5bc097a' returning 1) select count(*)::text from u$$),
('tenant','household_invites','update accepted_at (column not granted)','ERR 42501', $$with u as (update household_invites set accepted_at=null where id='6732fdb6-a6c6-4eb1-af6b-1a60f5bc097a' returning 1) select count(*)::text from u$$),
('tenant','household_invites','delete (no delete policy)','ok:0', $$with d as (delete from household_invites where id='6732fdb6-a6c6-4eb1-af6b-1a60f5bc097a' returning 1) select count(*)::text from d$$),
-- rent_payments ------------------------------------------------------------
('anon','rent_payments','select all','ok:0', $$select count(*)::text from rent_payments$$),
('stranger','rent_payments','select LEASE rows','ok:0', $$select count(*)::text from rent_payments where lease_id='46b558d0-0028-42dd-9964-0f1b88829c20'$$),
('provider','rent_payments','select LEASE rows','ok:0', $$select count(*)::text from rent_payments where lease_id='46b558d0-0028-42dd-9964-0f1b88829c20'$$),
('tenant','rent_payments','select LEASE rows','ok:[1-9][0-9]*', $$select count(*)::text from rent_payments where lease_id='46b558d0-0028-42dd-9964-0f1b88829c20'$$),
('landlord','rent_payments','select LEASE rows','ok:[1-9][0-9]*', $$select count(*)::text from rent_payments where lease_id='46b558d0-0028-42dd-9964-0f1b88829c20'$$),
('tenant','rent_payments','direct insert (only via mark_rent_paid)','ERR 42501', $$with i as (insert into rent_payments(lease_id,tenant_id,due_date,amount,status) values ('46b558d0-0028-42dd-9964-0f1b88829c20','dc734f3e-5bdc-4d32-8ba2-e15729c64956','2027-01-01',1,'paid') returning 1) select count(*)::text from i$$),
('tenant','rent_payments','direct update','ok:0', $$with u as (update rent_payments set status='paid' where lease_id='46b558d0-0028-42dd-9964-0f1b88829c20' returning 1) select count(*)::text from u$$),
('landlord','rent_payments','direct delete','ok:0', $$with d as (delete from rent_payments where lease_id='46b558d0-0028-42dd-9964-0f1b88829c20' returning 1) select count(*)::text from d$$),
('anon','rent_payments','rpc mark_rent_paid (no execute)','ERR 42501', $$select (mark_rent_paid('46b558d0-0028-42dd-9964-0f1b88829c20','2026-10-01','2026-10-17')).status$$),
('stranger','rent_payments','rpc mark_rent_paid (not a member)','ERR 42501', $$select (mark_rent_paid('46b558d0-0028-42dd-9964-0f1b88829c20','2026-10-01','2026-10-17')).status$$),
('tenant','rent_payments','rpc mark_rent_paid 2026-10-01 (member)','ok:(paid|late)', $$select (mark_rent_paid('46b558d0-0028-42dd-9964-0f1b88829c20','2026-10-01','2026-10-17')).status$$),
('tenant','rent_payments','rpc mark_rent_paid future period','ERR 22023', $$select (mark_rent_paid('46b558d0-0028-42dd-9964-0f1b88829c20','2027-06-01','2026-10-17')).status$$),
('tenant','rent_payments','rpc confirm_rent_payment on own fresh record 2026-08-01 (self_confirm)','ERR 22023', $$select (confirm_rent_payment('46b558d0-0028-42dd-9964-0f1b88829c20','2026-08-01')).status from (select mark_rent_paid('46b558d0-0028-42dd-9964-0f1b88829c20','2026-08-01','2026-10-17')) m$$),
('landlord','rent_payments','rpc confirm_rent_payment already confirmed (idempotent)','ok:(paid|late)', $$select (confirm_rent_payment('46b558d0-0028-42dd-9964-0f1b88829c20','2026-09-01')).status$$),
('stranger','rent_payments','rpc confirm_rent_payment','ERR 42501', $$select (confirm_rent_payment('46b558d0-0028-42dd-9964-0f1b88829c20','2026-09-01')).status$$),
-- notice_service_records ----------------------------------------------------
('anon','notice_service_records','select (no grant)','ERR 42501', $$select count(*)::text from notice_service_records$$),
('tenant','notice_service_records','select NSR','ok:0', $$select count(*)::text from notice_service_records where id='f9530840-eea0-4092-b64f-4c6c7ad77fc1'$$),
('landlord','notice_service_records','select NSR','ok:1', $$select count(*)::text from notice_service_records where id='f9530840-eea0-4092-b64f-4c6c7ad77fc1'$$),
('landlord','notice_service_records','insert own','ok:N4', $$with i as (insert into notice_service_records(landlord_auth_id,lease_id,form,served_on,method,deemed_served_on) values ('30d0c280-562d-4d6c-85bf-25cf5862cb8e','46b558d0-0028-42dd-9964-0f1b88829c20','N4','2026-10-17','hand','2026-10-17') returning form) select form from i$$),
('tenant','notice_service_records','insert as landlord','ERR 42501', $$with i as (insert into notice_service_records(landlord_auth_id,lease_id,form,served_on,method,deemed_served_on) values ('30d0c280-562d-4d6c-85bf-25cf5862cb8e','46b558d0-0028-42dd-9964-0f1b88829c20','N4','2026-10-17','hand','2026-10-17') returning 1) select count(*)::text from i$$),
('landlord','notice_service_records','update (no grant)','ERR 42501', $$with u as (update notice_service_records set form='N1' where id='f9530840-eea0-4092-b64f-4c6c7ad77fc1' returning 1) select count(*)::text from u$$),
('landlord','notice_service_records','delete (no grant)','ERR 42501', $$with d as (delete from notice_service_records where id='f9530840-eea0-4092-b64f-4c6c7ad77fc1' returning 1) select count(*)::text from d$$),
-- threads / thread_messages ---------------------------------------------------
('anon','threads','select (no grant)','ERR 42501', $$select count(*)::text from threads$$),
('stranger','threads','select TH_TEN','ok:0', $$select count(*)::text from threads where id='6eca91f3-efc7-4cbe-addd-cace22f08fb0'$$),
('tenant','threads','select TH_TEN','ok:1', $$select count(*)::text from threads where id='6eca91f3-efc7-4cbe-addd-cace22f08fb0'$$),
('landlord','threads','select TH_TEN','ok:1', $$select count(*)::text from threads where id='6eca91f3-efc7-4cbe-addd-cace22f08fb0'$$),
('provider','threads','select TH_WO (provider on WO)','ok:1', $$select count(*)::text from threads where id='3c1f0531-1b8e-467b-9c1e-b0a87a6dfe8a'$$),
('agent','threads','select TH_WO (not on that WO)','ok:0', $$select count(*)::text from threads where id='3c1f0531-1b8e-467b-9c1e-b0a87a6dfe8a'$$),
('tenant','threads','select TH_SUP (landlord support thread)','ok:0', $$select count(*)::text from threads where id='ffaec93e-38c8-4dab-aa41-e775109df6b1'$$),
('landlord','threads','select TH_SUP (own)','ok:1', $$select count(*)::text from threads where id='ffaec93e-38c8-4dab-aa41-e775109df6b1'$$),
('tenant','threads','insert (no grant)','ERR 42501', $$with i as (insert into threads(kind,ref_id) values ('tenancy','1c9abb72-c433-498b-942d-0d448fb8342f') returning 1) select count(*)::text from i$$),
('tenant','threads','delete (no grant)','ERR 42501', $$with d as (delete from threads where id='6eca91f3-efc7-4cbe-addd-cace22f08fb0' returning 1) select count(*)::text from d$$),
('service','threads','delete thread with messages (FK restrict)','ERR 23503', $$with d as (delete from threads where id='6eca91f3-efc7-4cbe-addd-cace22f08fb0' returning 1) select count(*)::text from d$$),
('tenant','thread_messages','select TH_TEN messages','ok:[1-9][0-9]*', $$select count(*)::text from thread_messages where thread_id='6eca91f3-efc7-4cbe-addd-cace22f08fb0'$$),
('stranger','thread_messages','select TH_TEN messages','ok:0', $$select count(*)::text from thread_messages where thread_id='6eca91f3-efc7-4cbe-addd-cace22f08fb0'$$),
('tenant','thread_messages','insert as party (sender_kind forced)','ok:tenant', $$with i as (insert into thread_messages(thread_id,sender_id,sender_kind,kind,body) values ('6eca91f3-efc7-4cbe-addd-cace22f08fb0','dc734f3e-5bdc-4d32-8ba2-e15729c64956','landlord','message','probe') returning sender_kind) select sender_kind from i$$),
('tenant','thread_messages','insert with sender_id = landlord (trigger forces sender_id = auth.uid())','ok:true', $$with i as (insert into thread_messages(thread_id,sender_id,sender_kind,kind,body) values ('6eca91f3-efc7-4cbe-addd-cace22f08fb0','30d0c280-562d-4d6c-85bf-25cf5862cb8e','landlord','message','probe') returning (sender_id='dc734f3e-5bdc-4d32-8ba2-e15729c64956' and sender_kind='tenant')::text) select * from i$$),
('tenant','thread_messages','insert kind=system (not allowed)','ERR (42501|P0001)', $$with i as (insert into thread_messages(thread_id,sender_id,sender_kind,kind,body) values ('6eca91f3-efc7-4cbe-addd-cace22f08fb0','dc734f3e-5bdc-4d32-8ba2-e15729c64956','tenant','system','probe') returning 1) select count(*)::text from i$$),
('stranger','thread_messages','insert into TH_TEN (not_a_party)','ERR (42501|P0001)', $$with i as (insert into thread_messages(thread_id,sender_id,sender_kind,kind,body) values ('6eca91f3-efc7-4cbe-addd-cace22f08fb0','00000000-0000-4000-8000-000000000001','tenant','message','probe') returning 1) select count(*)::text from i$$),
('tenant','thread_messages','update (no grant)','ERR 42501', $$with u as (update thread_messages set body='x' where thread_id='6eca91f3-efc7-4cbe-addd-cace22f08fb0' returning 1) select count(*)::text from u$$),
('tenant','thread_messages','delete (no grant)','ERR 42501', $$with d as (delete from thread_messages where thread_id='6eca91f3-efc7-4cbe-addd-cace22f08fb0' returning 1) select count(*)::text from d$$),
('service','thread_messages','update (append_only even for service role)','ERR P0001', $$with u as (update thread_messages set body='x' where thread_id='6eca91f3-efc7-4cbe-addd-cace22f08fb0' returning 1) select count(*)::text from u$$),
('service','thread_messages','delete (append_only even for service role)','ERR P0001', $$with d as (delete from thread_messages where thread_id='6eca91f3-efc7-4cbe-addd-cace22f08fb0' returning 1) select count(*)::text from d$$),
('service','thread_messages','truncate (blocked)','ERR.*', $$select (select 1 from (select 1) x where (select pg_catalog.pg_sleep(0)) is null)::text || (select 'x' from (select 1) y limit 0)$$),
-- work_orders ----------------------------------------------------------------
('anon','work_orders','select (no grant)','ERR 42501', $$select count(id)::text from work_orders$$),
('stranger','work_orders','select WO','ok:0', $$select count(id)::text from work_orders where id='963e805b-091d-4fa9-b2fa-a31d7744fd72'$$),
('agent','work_orders','select WO (other provider)','ok:0', $$select count(id)::text from work_orders where id='963e805b-091d-4fa9-b2fa-a31d7744fd72'$$),
('tenant','work_orders','select WO (household member)','ok:1', $$select count(id)::text from work_orders where id='963e805b-091d-4fa9-b2fa-a31d7744fd72'$$),
('landlord','work_orders','select WO','ok:1', $$select count(id)::text from work_orders where id='963e805b-091d-4fa9-b2fa-a31d7744fd72'$$),
('provider','work_orders','select WO (assigned provider)','ok:1', $$select count(id)::text from work_orders where id='963e805b-091d-4fa9-b2fa-a31d7744fd72'$$),
('tenant','work_orders','select token column','ERR 42501', $$select count(token)::text from work_orders$$),
('landlord','work_orders','select token column','ERR 42501', $$select count(token)::text from work_orders$$),
('provider','work_orders','select external_email column','ERR 42501', $$select count(external_email)::text from work_orders$$),
('landlord','work_orders','select external_email column (use my_external_contacts)','ERR 42501', $$select count(external_email)::text from work_orders$$),
('landlord','work_orders','select * (column-level grant => always denied)','ERR 42501', $$select count(*)::text from (select * from work_orders) s$$),
('landlord','work_orders','update own WO status (server only)','ERR 42501', $$with u as (update work_orders set status='paid' where id='963e805b-091d-4fa9-b2fa-a31d7744fd72' returning 1) select count(*)::text from u$$),
('provider','work_orders','update WO quote (server only)','ERR 42501', $$with u as (update work_orders set quote_amount=1 where id='963e805b-091d-4fa9-b2fa-a31d7744fd72' returning 1) select count(*)::text from u$$),
('landlord','work_orders','insert (server only)','ERR 42501', $$with i as (insert into work_orders(ticket_id,household_id,landlord_auth_id,status) values (gen_random_uuid(),'1c9abb72-c433-498b-942d-0d448fb8342f','30d0c280-562d-4d6c-85bf-25cf5862cb8e','offered') returning 1) select count(*)::text from i$$),
('landlord','work_orders','rpc my_external_contacts','ok:[0-9]+', $$select count(*)::text from my_external_contacts()$$),
('provider','work_orders','rpc provider_job_context (has open WO)','ok:[1-9][0-9]*', $$select count(*)::text from provider_job_context()$$),
('tenant','work_orders','rpc provider_job_context (not a provider)','ok:0', $$select count(*)::text from provider_job_context()$$),
-- applicant_profiles / files -----------------------------------------------------
('anon','applicant_profiles','select (no grant)','ERR 42501', $$select count(*)::text from applicant_profiles$$),
('landlord','applicant_profiles','select T profile','ok:0', $$select count(*)::text from applicant_profiles where auth_id='dc734f3e-5bdc-4d32-8ba2-e15729c64956'$$),
('tenant','applicant_profiles','select own','ok:1', $$select count(*)::text from applicant_profiles where auth_id='dc734f3e-5bdc-4d32-8ba2-e15729c64956'$$),
('tenant','applicant_profiles','update own','ok:1', $$with u as (update applicant_profiles set job_title='probe' where auth_id='dc734f3e-5bdc-4d32-8ba2-e15729c64956' returning 1) select count(*)::text from u$$),
('landlord','applicant_profiles','update T profile','ok:0', $$with u as (update applicant_profiles set job_title='probe' where auth_id='dc734f3e-5bdc-4d32-8ba2-e15729c64956' returning 1) select count(*)::text from u$$),
('stranger','applicant_profiles','insert own (no auth.users row => FK)','ERR 23503', $$with i as (insert into applicant_profiles(auth_id,first_name) values ('00000000-0000-4000-8000-000000000001','Probe') returning 1) select count(*)::text from i$$),
('newbie','applicant_profiles','insert own','ok:1', $$with i as (insert into applicant_profiles(auth_id,first_name) values ('492d2d59-8d13-4b06-b988-c67c142587bc','Probe') returning 1) select count(*)::text from i$$),
('stranger','applicant_profiles','insert as T','ERR 42501', $$with i as (insert into applicant_profiles(auth_id,first_name) values ('dc734f3e-5bdc-4d32-8ba2-e15729c64956','Probe') returning 1) select count(*)::text from i$$),
('tenant','applicant_profile_files','select own','ok:[1-9][0-9]*', $$select count(*)::text from applicant_profile_files where auth_id='dc734f3e-5bdc-4d32-8ba2-e15729c64956'$$),
('landlord','applicant_profile_files','select T files','ok:0', $$select count(*)::text from applicant_profile_files where auth_id='dc734f3e-5bdc-4d32-8ba2-e15729c64956'$$),
('tenant','applicant_profile_files','insert (server only)','ERR 42501', $$with i as (insert into applicant_profile_files(auth_id,kind,path) values ('dc734f3e-5bdc-4d32-8ba2-e15729c64956','paystub','profile/x/y.pdf') returning 1) select count(*)::text from i$$),
('tenant','applicant_profile_files','update (no grant)','ERR 42501', $$with u as (update applicant_profile_files set name='x' where auth_id='dc734f3e-5bdc-4d32-8ba2-e15729c64956' returning 1) select count(*)::text from u$$),
('tenant','applicant_profile_files','delete own (rolled back)','ok:[1-9][0-9]*', $$with d as (delete from applicant_profile_files where auth_id='dc734f3e-5bdc-4d32-8ba2-e15729c64956' returning 1) select count(*)::text from d$$),
('landlord','applicant_profile_files','delete T files','ok:0', $$with d as (delete from applicant_profile_files where auth_id='dc734f3e-5bdc-4d32-8ba2-e15729c64956' returning 1) select count(*)::text from d$$),
-- consumer_* / screening_corrections / passport_share_views -----------------------
('anon','consumer_requests','select','ERR 42501', $$select count(*)::text from consumer_requests$$),
('tenant','consumer_requests','select own email','ERR 42501', $$select count(*)::text from consumer_requests where email='tenant-test@stayloop.ai'$$),
('landlord','consumer_requests','select','ERR 42501', $$select count(*)::text from consumer_requests$$),
('tenant','consumer_requests','insert','ERR 42501', $$with i as (insert into consumer_requests(email,token) values ('x@example.com','t') returning 1) select count(*)::text from i$$),
('anon','consumer_disputes','select','ERR 42501', $$select count(*)::text from consumer_disputes$$),
('landlord','consumer_disputes','select','ERR 42501', $$select count(*)::text from consumer_disputes$$),
('anon','consumer_alerts','select','ERR 42501', $$select count(*)::text from consumer_alerts$$),
('landlord','consumer_alerts','select (use /api/consumer/alert)','ERR 42501', $$select count(*)::text from consumer_alerts$$),
('tenant','consumer_alerts','insert','ERR 42501', $$with i as (insert into consumer_alerts(email,statement) values ('x@example.com','s') returning 1) select count(*)::text from i$$),
('anon','passport_share_views','select','ERR 42501', $$select count(*)::text from passport_share_views$$),
('tenant','passport_share_views','select','ERR 42501', $$select count(*)::text from passport_share_views$$),
('service','passport_share_views','update (append_only)','ERR P0001|ok:0', $$with u as (update passport_share_views set ip_hash='x' where id in (select id from passport_share_views limit 1) returning 1) select count(*)::text from u$$),
('service','passport_share_views','delete (append_only)','ERR P0001|ok:0', $$with d as (delete from passport_share_views where id in (select id from passport_share_views limit 1) returning 1) select count(*)::text from d$$),
('anon','screening_corrections','select','ERR 42501', $$select count(*)::text from screening_corrections$$),
('tenant','screening_corrections','select COR (cannot read screening)','ok:0', $$select count(*)::text from screening_corrections where id='a8aeaa1f-a2cb-4eb6-a0e1-f3fb1d2149a5'$$),
('stranger','screening_corrections','select COR','ok:0', $$select count(*)::text from screening_corrections where id='a8aeaa1f-a2cb-4eb6-a0e1-f3fb1d2149a5'$$),
('landlord','screening_corrections','select COR (can read screening)','ok:1', $$select count(*)::text from screening_corrections where id='a8aeaa1f-a2cb-4eb6-a0e1-f3fb1d2149a5'$$),
('landlord','screening_corrections','insert (server only)','ERR 42501', $$with i as (insert into screening_corrections(screening_id,action) values ('10121e42-98a8-418c-9feb-33c338bc633d','corrected') returning 1) select count(*)::text from i$$),
('landlord','screening_corrections','update (no grant)','ERR 42501', $$with u as (update screening_corrections set note='x' where id='a8aeaa1f-a2cb-4eb6-a0e1-f3fb1d2149a5' returning 1) select count(*)::text from u$$),
('service','screening_corrections','update (append_only)','ERR P0001', $$with u as (update screening_corrections set note='x' where id='a8aeaa1f-a2cb-4eb6-a0e1-f3fb1d2149a5' returning 1) select count(*)::text from u$$),
('service','screening_corrections','delete (append_only)','ERR P0001', $$with d as (delete from screening_corrections where id='a8aeaa1f-a2cb-4eb6-a0e1-f3fb1d2149a5' returning 1) select count(*)::text from d$$),
-- passport_share_tokens ------------------------------------------------------------
('anon','passport_share_tokens','select','ok:0', $$select count(*)::text from passport_share_tokens$$),
('landlord','passport_share_tokens','select T tokens','ok:0', $$select count(*)::text from passport_share_tokens where tenant_user_id='dc734f3e-5bdc-4d32-8ba2-e15729c64956'$$),
('tenant','passport_share_tokens','select own','ok:[1-9][0-9]*', $$select count(*)::text from passport_share_tokens where tenant_user_id='dc734f3e-5bdc-4d32-8ba2-e15729c64956'$$),
('tenant','passport_share_tokens','insert own','ok:1', $$with i as (insert into passport_share_tokens(token,tenant_user_id,expires_at) values ('probe-'||gen_random_uuid()::text,'dc734f3e-5bdc-4d32-8ba2-e15729c64956',now()+interval '1 day') returning 1) select count(*)::text from i$$),
('tenant','passport_share_tokens','insert as other user','ERR 42501', $$with i as (insert into passport_share_tokens(token,tenant_user_id,expires_at) values ('probe-'||gen_random_uuid()::text,'30d0c280-562d-4d6c-85bf-25cf5862cb8e',now()+interval '1 day') returning 1) select count(*)::text from i$$),
('anon','passport_share_tokens','insert','ERR 42501', $$with i as (insert into passport_share_tokens(token,tenant_user_id,expires_at) values ('probe-'||gen_random_uuid()::text,'dc734f3e-5bdc-4d32-8ba2-e15729c64956',now()+interval '1 day') returning 1) select count(*)::text from i$$),
('tenant','passport_share_tokens','update own (revoke)','ok:[1-9][0-9]*', $$with u as (update passport_share_tokens set revoked_at=now() where tenant_user_id='dc734f3e-5bdc-4d32-8ba2-e15729c64956' returning 1) select count(*)::text from u$$),
('tenant','passport_share_tokens','delete own (no delete policy)','ok:0', $$with d as (delete from passport_share_tokens where tenant_user_id='dc734f3e-5bdc-4d32-8ba2-e15729c64956' returning 1) select count(*)::text from d$$),
-- delegations ------------------------------------------------------------------
('anon','delegations','select','ERR 42501', $$select count(id)::text from delegations$$),
('tenant','delegations','select DLG','ok:0', $$select count(id)::text from delegations where id='145e93ad-8a9e-4a5e-839d-29795be08ee2'$$),
('stranger','delegations','select DLG','ok:0', $$select count(id)::text from delegations where id='145e93ad-8a9e-4a5e-839d-29795be08ee2'$$),
('agent','delegations','select DLG (delegate)','ok:1', $$select count(id)::text from delegations where id='145e93ad-8a9e-4a5e-839d-29795be08ee2'$$),
('landlord','delegations','select DLG (principal)','ok:1', $$select count(id)::text from delegations where id='145e93ad-8a9e-4a5e-839d-29795be08ee2'$$),
('agent','delegations','select confirm_token column','ERR 42501', $$select count(confirm_token)::text from delegations$$),
('landlord','delegations','select confirm_token column','ERR 42501', $$select count(confirm_token)::text from delegations$$),
('agent','delegations','update status (server only)','ERR 42501', $$with u as (update delegations set status='active' where id='145e93ad-8a9e-4a5e-839d-29795be08ee2' returning 1) select count(*)::text from u$$),
('agent','delegations','insert (server only)','ERR 42501', $$with i as (insert into delegations(principal_email,delegate_auth_id,scope,allowed_actions,expires_at) values ('x@example.com','4388a326-5e19-43c7-81ac-80abbdc91d21','{listing}','{screen}',now()+interval '1 day') returning 1) select count(*)::text from i$$),
('landlord','delegations','delete (server only)','ERR 42501', $$with d as (delete from delegations where id='145e93ad-8a9e-4a5e-839d-29795be08ee2' returning 1) select count(*)::text from d$$),
-- agent_profiles / agent_directory / agent_intake_links ---------------------------------
('anon','agent_profiles','select (no grant)','ERR 42501', $$select count(*)::text from agent_profiles$$),
('tenant','agent_profiles','select A','ok:0', $$select count(*)::text from agent_profiles where auth_id='4388a326-5e19-43c7-81ac-80abbdc91d21'$$),
('landlord','agent_profiles','select A','ok:0', $$select count(*)::text from agent_profiles where auth_id='4388a326-5e19-43c7-81ac-80abbdc91d21'$$),
('agent','agent_profiles','select own','ok:1', $$select count(*)::text from agent_profiles where auth_id='4388a326-5e19-43c7-81ac-80abbdc91d21'$$),
('agent','agent_profiles','update own status (frozen)','ok:verified', $$with u as (update agent_profiles set status='rejected', verified_at=null where auth_id='4388a326-5e19-43c7-81ac-80abbdc91d21' returning status) select status from u$$),
('agent','agent_profiles','update own reco_number -> pending','ok:pending', $$with u as (update agent_profiles set reco_number='0000001' where auth_id='4388a326-5e19-43c7-81ac-80abbdc91d21' returning status) select status from u$$),
('tenant','agent_profiles','update A','ok:0', $$with u as (update agent_profiles set legal_name='x' where auth_id='4388a326-5e19-43c7-81ac-80abbdc91d21' returning 1) select count(*)::text from u$$),
('stranger','agent_profiles','insert own (no auth.users row => FK)','ERR 23503', $$with i as (insert into agent_profiles(auth_id,legal_name,reco_number,category,brokerage_name,status,verified_at) values ('00000000-0000-4000-8000-000000000001','Probe Agent','0000002','salesperson','Probe Brokerage','verified',now()) returning status) select status from i$$),
('newbie','agent_profiles','insert own pre-verified (defaults to pending)','ok:pending', $$with i as (insert into agent_profiles(auth_id,legal_name,reco_number,category,brokerage_name,status,verified_at) values ('492d2d59-8d13-4b06-b988-c67c142587bc','Probe Agent','0000002','salesperson','Probe Brokerage','verified',now()) returning status) select status from i$$),
('stranger','agent_profiles','insert as A','ERR 42501', $$with i as (insert into agent_profiles(auth_id,legal_name,reco_number,category,brokerage_name) values ('4388a326-5e19-43c7-81ac-80abbdc91d21','Probe Agent','0000003','salesperson','Probe Brokerage') returning 1) select count(*)::text from i$$),
('agent','agent_profiles','delete own (no delete policy)','ok:0', $$with d as (delete from agent_profiles where auth_id='4388a326-5e19-43c7-81ac-80abbdc91d21' returning 1) select count(*)::text from d$$),
('anon','agent_directory','select verified agents (public directory)','ok:[1-9][0-9]*', $$select count(*)::text from agent_directory$$),
('tenant','agent_directory','select','ok:[1-9][0-9]*', $$select count(*)::text from agent_directory$$),
('anon','agent_directory','select has no review_note','ERR 42703', $$select count(review_note)::text from agent_directory$$),
('tenant','agent_directory','update via view','ERR (42501|55000)', $$with u as (update agent_directory set legal_name='x' returning 1) select count(*)::text from u$$),
('agent','agent_intake_links','select own','ok:1', $$select count(*)::text from agent_intake_links where id='4041e7e2-4f44-41d5-87c5-ccdfa14f8374'$$),
('tenant','agent_intake_links','select A link','ok:0', $$select count(*)::text from agent_intake_links where id='4041e7e2-4f44-41d5-87c5-ccdfa14f8374'$$),
('agent','agent_intake_links','update label (allowed column)','ok:1', $$with u as (update agent_intake_links set label='probe' where id='4041e7e2-4f44-41d5-87c5-ccdfa14f8374' returning 1) select count(*)::text from u$$),
('agent','agent_intake_links','update token (column not granted)','ERR 42501', $$with u as (update agent_intake_links set token='x' where id='4041e7e2-4f44-41d5-87c5-ccdfa14f8374' returning 1) select count(*)::text from u$$),
('agent','agent_intake_links','insert (mint via route only)','ERR 42501', $$with i as (insert into agent_intake_links(agent_auth_id,token) values ('4388a326-5e19-43c7-81ac-80abbdc91d21','probe') returning 1) select count(*)::text from i$$),
('agent','agent_intake_submissions','select (server only)','ERR 42501', $$select count(*)::text from agent_intake_submissions$$),
-- service_providers / provider_directory ---------------------------------------
('anon','service_providers','select (no grant)','ERR 42501', $$select count(*)::text from service_providers$$),
('tenant','service_providers','select P','ok:0', $$select count(*)::text from service_providers where id='8e668976-c8bb-448c-87cb-20eb52f29b6c'$$),
('provider','service_providers','select own','ok:1', $$select count(*)::text from service_providers where id='8e668976-c8bb-448c-87cb-20eb52f29b6c'$$),
('agent','service_providers','select P (other provider)','ok:0', $$select count(*)::text from service_providers where id='8e668976-c8bb-448c-87cb-20eb52f29b6c'$$),
('provider','service_providers','update own status (frozen)','ok:verified', $$with u as (update service_providers set status='pending' where id='8e668976-c8bb-448c-87cb-20eb52f29b6c' returning status) select status from u$$),
('provider','service_providers','update own legal_name -> pending','ok:pending', $$with u as (update service_providers set legal_name='Probe Inc.' where id='8e668976-c8bb-448c-87cb-20eb52f29b6c' returning status) select status from u$$),
('tenant','service_providers','update P (direct)','ok:0', $$with u as (update service_providers set contact_email='attacker@example.com' where id='8e668976-c8bb-448c-87cb-20eb52f29b6c' returning 1) select count(*)::text from u$$),
('stranger','service_providers','insert own (service_providers.auth_id has no FK to auth.users; RLS binds it to the JWT)','ok:pending', $$with i as (insert into service_providers(auth_id,legal_name,status,verified_at) values ('00000000-0000-4000-8000-000000000001','Probe Services','verified',now()) returning status) select status from i$$),
('newbie','service_providers','insert own pre-verified (defaults to pending)','ok:pending', $$with i as (insert into service_providers(auth_id,legal_name,status,verified_at) values ('492d2d59-8d13-4b06-b988-c67c142587bc','Probe Services','verified',now()) returning status) select status from i$$),
('provider','service_providers','delete own (no grant)','ERR 42501', $$with d as (delete from service_providers where id='8e668976-c8bb-448c-87cb-20eb52f29b6c' returning 1) select count(*)::text from d$$),
('anon','provider_directory','select (no grant)','ERR 42501', $$select count(*)::text from provider_directory$$),
('tenant','provider_directory','select verified providers','ok:[1-9][0-9]*', $$select count(*)::text from provider_directory$$),
('tenant','provider_directory','select has no review_note','ERR 42703', $$select count(review_note)::text from provider_directory$$),
('tenant','provider_directory','UPDATE via view (must be denied)','ERR 42501|ok:0', $$with u as (update provider_directory set contact_email='attacker@example.com' where id='8e668976-c8bb-448c-87cb-20eb52f29b6c' returning 1) select count(*)::text from u$$),
('tenant','provider_directory','DELETE via view (must be denied)','ERR 42501|ok:0', $$with d as (delete from provider_directory where id='8e668976-c8bb-448c-87cb-20eb52f29b6c' returning 1) select count(*)::text from d$$),
('tenant','provider_directory','INSERT via view (must be denied)','ERR (42501|23502)', $$with i as (insert into provider_directory(id,legal_name,status) values (gen_random_uuid(),'Probe','verified') returning 1) select count(*)::text from i$$),
('tenant','provider_credentials_public','update via view','ERR (42501|55000)', $$with u as (update provider_credentials_public set kind='x' returning 1) select count(*)::text from u$$),
-- listings -----------------------------------------------------------------
('anon','listings','select (no grant since 2026-10-11)','ERR 42501', $$select count(*)::text from listings$$),
('stranger','listings','select public active listing','ok:1', $$select count(*)::text from listings where id='0ca3a060-82f8-4248-81b4-633f6313eeff'$$),
('stranger','listings','select inactive LST','ok:0', $$select count(*)::text from listings where id='8657c40d-fde6-4b40-af47-fb0f46f52cbb'$$),
('landlord','listings','select own inactive LST','ok:1', $$select count(*)::text from listings where id='8657c40d-fde6-4b40-af47-fb0f46f52cbb'$$),
('tenant','listings','update LST','ok:0', $$with u as (update listings set monthly_rent=1 where id='8657c40d-fde6-4b40-af47-fb0f46f52cbb' returning 1) select count(*)::text from u$$),
('landlord','listings','update source -> realtor (trust frozen)','ok:stayloop', $$with u as (update listings set source='realtor' where id='8657c40d-fde6-4b40-af47-fb0f46f52cbb' returning source) select source from u$$),
('landlord','listings','update display_internet=false (feed frozen)','ok:true', $$with u as (update listings set display_internet=false, display_address=false where id='8657c40d-fde6-4b40-af47-fb0f46f52cbb' returning (display_internet and display_address)::text) select * from u$$),
('landlord','listings','update feed_updated_at (frozen)','ok:null', $$with u as (update listings set feed_updated_at=now(), feed_source='mls' where id='8657c40d-fde6-4b40-af47-fb0f46f52cbb' returning coalesce(feed_updated_at::text,'null')) select * from u$$),
('landlord','listings','update monthly_rent on verified -> pending','ok:pending', $$with u as (update listings set monthly_rent=monthly_rent+1 where id='8657c40d-fde6-4b40-af47-fb0f46f52cbb' returning verification_status) select verification_status from u$$),
('landlord','listings','update verification_status=verified directly','ok:verified', $$with u as (update listings set verification_status='verified', verified_at=now() where id='8657c40d-fde6-4b40-af47-fb0f46f52cbb' returning verification_status) select verification_status from u$$),
('landlord','listings','update price_history forged (server only)','ok:true', $$with u as (update listings set price_history='[{"date":"2020-01-01","price":1}]'::jsonb where id='8657c40d-fde6-4b40-af47-fb0f46f52cbb' returning (price_history is distinct from '[{"date":"2020-01-01","price":1}]'::jsonb)::text) select * from u$$),
('landlord','listings','insert pre-verified realtor with display_address=false','ok:stayloop/pending/true', $$with i as (insert into listings(landlord_id,address,city,monthly_rent,slug,source,verification_status,display_address,is_active,images) values ('80646b6a-9c7b-4a17-a850-4ff774ea6d64','1 Probe St','Toronto',1000,'probe-'||gen_random_uuid()::text,'realtor','verified',false,true,'[]') returning source||'/'||verification_status||'/'||display_address) select * from i$$),
('tenant','listings','insert with landlord_id = L','ERR 42501', $$with i as (insert into listings(landlord_id,address,city,monthly_rent,slug) values ('80646b6a-9c7b-4a17-a850-4ff774ea6d64','1 Probe St','Toronto',1000,'probe-'||gen_random_uuid()::text) returning 1) select count(*)::text from i$$),
('landlord','listings','delete own LST (a lease references it => FK)','ERR 23503', $$with d as (delete from listings where id='8657c40d-fde6-4b40-af47-fb0f46f52cbb' returning 1) select count(*)::text from d$$),
-- landlords ------------------------------------------------------------------
('anon','landlords','select','ok:0', $$select count(*)::text from landlords$$),
('tenant','landlords','select L row','ok:0', $$select count(*)::text from landlords where id='80646b6a-9c7b-4a17-a850-4ff774ea6d64'$$),
('landlord','landlords','select own','ok:1', $$select count(*)::text from landlords where id='80646b6a-9c7b-4a17-a850-4ff774ea6d64'$$),
('landlord','landlords','update plan=team (frozen)','ok:true', $$with u as (update landlords set plan='team' where id='80646b6a-9c7b-4a17-a850-4ff774ea6d64' returning (plan is distinct from 'team')::text) select * from u$$),
('landlord','landlords','update pro_trial_until=2099 (frozen)','ok:true', $$with u as (update landlords set pro_trial_until='2099-01-01' where id='80646b6a-9c7b-4a17-a850-4ff774ea6d64' returning (pro_trial_until is distinct from '2099-01-01'::timestamptz)::text) select * from u$$),
('landlord','landlords','update unlock_credits=99 (frozen)','ok:true', $$with u as (update landlords set unlock_credits=99 where id='80646b6a-9c7b-4a17-a850-4ff774ea6d64' returning (unlock_credits is distinct from 99)::text) select * from u$$),
('landlord','landlords','update full_name (own, allowed)','ok:1', $$with u as (update landlords set full_name=full_name where id='80646b6a-9c7b-4a17-a850-4ff774ea6d64' returning 1) select count(*)::text from u$$),
('tenant','landlords','update L row','ok:0', $$with u as (update landlords set full_name='x' where id='80646b6a-9c7b-4a17-a850-4ff774ea6d64' returning 1) select count(*)::text from u$$),
('stranger','landlords','insert own (no auth.users row => FK)','ERR 23503', $$with i as (insert into landlords(auth_id,email,plan,unlock_credits) values ('00000000-0000-4000-8000-000000000001','stranger@example.com','pro',50) returning plan||'/'||unlock_credits||'/'||(pro_trial_until is not null)) select * from i$$),
('newbie','landlords','insert own with plan=pro (guard zeroes billing, trial defaults 30d + 1 credit)','ok:free/1/true', $$with i as (insert into landlords(auth_id,email,plan,unlock_credits) values ('492d2d59-8d13-4b06-b988-c67c142587bc','muse-tenant@stayloop.ai','pro',50) returning plan||'/'||unlock_credits||'/'||(pro_trial_until is not null)) select * from i$$),
('tenant','landlords','insert row for L auth_id','ERR 42501', $$with i as (insert into landlords(auth_id,email) values ('30d0c280-562d-4d6c-85bf-25cf5862cb8e','x@example.com') returning 1) select count(*)::text from i$$),
('anon','landlords','rpc claim_landlord (no execute)','ERR 42501', $$select (claim_landlord()).id::text$$),
('anon','landlords','rpc my_hats (no execute)','ERR 42501', $$select my_hats()::text$$),
('newbie','landlords','rpc my_hats landlord=false (pure tenant)','ok:false', $$select my_hats()->>'landlord'$$),
('landlord','landlords','rpc my_hats landlord=true','ok:true', $$select my_hats()->>'landlord'$$),
('provider','landlords','rpc my_hats provider=verified','ok:verified', $$select my_hats()->>'provider'$$),
-- tenants / showing_intents / misc -----------------------------------------------------
('anon','tenants','select','ok:0', $$select count(*)::text from tenants$$),
('stranger','tenants','select all','ok:0', $$select count(*)::text from tenants$$),
('tenant','showing_intents','update own intent status (guard)','ERR 42501|ok:0', $$with u as (update showing_intents set status='accepted' where tenant_id='3249a9c8-a778-4505-a546-63c4934756f2' returning 1) select count(*)::text from u$$),
('landlord','showing_intents','update intent on own listing (guard)','ERR 42501|ok:0', $$with u as (update showing_intents set status='accepted' where listing_id='8657c40d-fde6-4b40-af47-fb0f46f52cbb' returning 1) select count(*)::text from u$$),
('anon','anon_rate_limits','select (service only)','ok:0|ERR 42501', $$select count(*)::text from anon_rate_limits$$),
('anon','trust_api_keys','select (service only)','ok:0|ERR 42501', $$select count(*)::text from trust_api_keys$$),
('anon','ca_corp_registry','select (RLS, no policy)','ok:0', $$select count(*)::text from (select 1 from ca_corp_registry limit 1) s$$),
('anon','ca_corp_registry','rpc search_corp_registry (no execute)','ERR 42501', $$select count(*)::text from search_corp_registry('acme', 0.3)$$),
('anon','ltb_orders','rpc search_ltb_orders (no execute)','ERR 42501', $$select count(*)::text from search_ltb_orders('john smith','john smith',null,null,5)$$),
('anon','auth','rpc auth_email_status (service only)','ERR 42501', $$select auth_email_status('tenant-test@stayloop.ai')::text$$),
('anon','admin','rpc admin_list_users (no execute)','ERR 42501', $$select count(*)::text from admin_list_users(5)$$),
('tenant','admin','rpc admin_list_users (not admin => empty or error)','ok:0|ERR.*', $$select count(*)::text from admin_list_users(5)$$);

-- fix the truncate probe (plain statement, not a select)
update probe set sql = $$select pg_temp.try_truncate()$$ where action = 'truncate (blocked)';
create function pg_temp.try_truncate() returns text language plpgsql as $f$ begin truncate thread_messages; return 'truncated'; end $f$;

-- ---------------------------------------------------------------- run
do $run$
declare p record; a text; d text;
begin
  for p in select * from probe order by n loop
    select * into a, d from pg_temp.run_one(p.who, p.sql);
    insert into result values (p.n, p.who, p.tbl, p.action, p.expected, a, d, a ~ ('^(' || p.expected || ')$'));
  end loop;
end $run$;

-- ---------------------------------------------------------------- ① anon-executable functions
do $a$
declare f record;
begin
  for f in
    select p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and has_function_privilege('anon', p.oid, 'execute')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')   -- extension members (pg_trgm)
    order by 1
  loop
    insert into result values (1000, 'anon', 'audit:anon_exec_function', f.proname,
      'allowlisted', case when f.proname in (
        'agent_intake_upload_allowed','application_file_readable','application_upload_allowed',  -- storage policy helpers (/intake, /apply)
        'attach_application_files','recent_application_count','listing_accepts_applications',                                    -- anonymous application flow
        'decline_household_invite','peek_household_invite',                                       -- /join/<token>
        'is_household_member','is_stayloop_admin','is_stayloop_superadmin','is_direct_client_write', -- policy / trigger helpers
        'is_email_unsubscribed',
        'kb_pending_rule_notices'                                                                  -- /rules「待核对」角标 + /api/kb/notices（知识库 §7.3，2026-10-27）
        ) then 'allowlisted' else 'NOT allowlisted' end, '', null);
  end loop;
  update result set pass = (actual = expected) where tbl = 'audit:anon_exec_function';
end $a$;

-- ---------------------------------------------------------------- ② write grants vs policies
do $b$
declare g record;
begin
  for g in
    with w as (
      select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) privs
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE')
      group by 1,2)
    select w.table_name, w.grantee, w.privs, c.relkind, c.relrowsecurity rls,
           coalesce((select string_agg(distinct cmd, ',') from pg_policies pp where pp.schemaname='public' and pp.tablename = w.table_name), '-') policies,
           (select is_updatable from information_schema.views v where v.table_schema='public' and v.table_name = w.table_name) updatable
    from w join pg_class c on c.relname = w.table_name join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    order by 1,2
  loop
    insert into result values (2000, g.grantee, 'audit:write_grant', g.table_name || ' [' || g.privs || '] policies=' || g.policies,
      case when g.relkind = 'v' then 'view not updatable' else 'rls on' end,
      case when g.relkind = 'v' then (case when g.updatable = 'YES' then 'VIEW IS UPDATABLE (writes bypass RLS as owner)' else 'view not updatable' end)
           else (case when g.rls then 'rls on' else 'RLS OFF' end) end, '', null);
  end loop;
  update result set pass = (actual = expected) where tbl = 'audit:write_grant';
end $b$;

-- ---------------------------------------------------------------- ③ SECURITY DEFINER without search_path
insert into result
select 3000, 'postgres', 'audit:secdef_search_path', 'count of SECURITY DEFINER functions in public without search_path', '0',
       count(*)::text, coalesce(string_agg(p.proname, ','), ''), count(*) = 0
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');

-- ---------------------------------------------------------------- ④ storage policies & buckets
do $d$
declare r record; expected_policies text[] := array[
  'tenancy_files_member_read','tenancy_files_member_write',
  'tenant_files_owner_select','tenant_files_owner_insert','tenant_files_owner_delete',
  'tenant_files_applicant_insert','tenant_files_listing_landlord_select',
  'tenant_files_agent_intake_insert','tenant_files_agent_intake_select',
  'tenant_files_profile_select'];
begin
  for r in select policyname, cmd, roles::text roles from pg_policies where schemaname='storage' and tablename='objects' order by 1 loop
    insert into result values (4000, r.roles, 'audit:storage_policy', r.policyname || ' (' || r.cmd || ')', 'documented', case when r.policyname = any(expected_policies) then 'documented' else 'UNDOCUMENTED' end, '', r.policyname = any(expected_policies));
  end loop;
  insert into result select 4001, 'storage', 'audit:storage_policy', 'missing documented policies', '', coalesce(string_agg(e, ','), ''), '', count(*) = 0
    from unnest(expected_policies) e where not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname = e);
  for r in select id, public, file_size_limit, coalesce(array_to_string(allowed_mime_types, ','), '') mimes from storage.buckets order by 1 loop
    insert into result values (4100, 'storage', 'audit:bucket', r.id, 
      case r.id when 'tenant-files' then 'private/26214400' when 'tenancy-files' then 'private/26214400' when 'thread-inbound' then 'private/26214400' when 'assistant-avatars' then 'public/2097152' when 'agent-photos' then 'public/1048576' else 'unknown bucket' end,  -- agent-photos: 经纪公开主页头像（2026-10-23）
      (case when r.public then 'public' else 'private' end) || '/' || coalesce(r.file_size_limit::text, 'nolimit'), r.mimes, null);
  end loop;
  update result set pass = (actual = expected) where tbl = 'audit:bucket';
end $d$;

-- ---------------------------------------------------------------- ⑤ pg_cron jobs expected active
do $e$
declare j text;
begin
  foreach j in array array['agent-proactive-daily','agent-registration-sweep','delegation-expiry-sweep','household-lease-promote','screening-stuck-sweep','model-discover-weekly'] loop
    insert into result select 5000, 'cron', 'audit:cron_job', j, 'active', coalesce((select case when active then 'active' else 'inactive' end from cron.job where jobname = j), 'MISSING'), coalesce((select schedule from cron.job where jobname = j), ''), null;
  end loop;
  foreach j in array array['realtor-freshness','trreb-rent-refresh'] loop
    insert into result select 5001, 'cron', 'audit:cron_job', j || ' (unscheduled 2026-10-13)', 'MISSING', coalesce((select case when active then 'active' else 'inactive' end from cron.job where jobname = j), 'MISSING'), '', null;
  end loop;
  update result set pass = (actual = expected) where tbl = 'audit:cron_job';
end $e$;

-- ---------------------------------------------------------------- output
select * from (
  select n, who, tbl, action, expected, actual, detail, pass from result
  union all
  select 99999, 'SUMMARY', 'probes', count(*) filter (where n < 1000) || ' assertions', count(*) filter (where n < 1000 and pass) || ' pass', count(*) filter (where n < 1000 and not pass) || ' fail', '', count(*) filter (where n < 1000 and not pass) = 0 from result
  union all
  select 99998, 'SUMMARY', 'audits', count(*) filter (where n >= 1000) || ' checks', count(*) filter (where n >= 1000 and pass) || ' pass', count(*) filter (where n >= 1000 and not pass) || ' fail', '', count(*) filter (where n >= 1000 and not pass) = 0 from result
) x order by n;

rollback;
