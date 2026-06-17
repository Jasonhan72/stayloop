-- =============================================================
-- Stayloop V5.3 — canonical seed content for agent demo data.
-- Aligns seed_demo_agent_data + existing pending rows to the design
-- canon (Unit 1207 · King West / Sarah Wang / Mia Chen / David Park),
-- 认证 N 级 terminology, and a NAME-AGNOSTIC tenant approval summary
-- (so it reads correctly whatever the user named their agent).
-- =============================================================
create or replace function public.seed_demo_agent_data(p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then return; end if;

  if p_role = 'tenant' then
    if not exists (select 1 from public.user_memories where user_id = v_user and role = 'tenant') then
      insert into public.user_memories (user_id, role, memory_type, key, label, value, confidence, source) values
        (v_user,'tenant','preference','budget','预算','{"min":2100,"max":2400,"currency":"CAD","cadence":"monthly"}'::jsonb,0.9,'onboarding'),
        (v_user,'tenant','preference','preferred_areas','区域','{"areas":["Downtown","Midtown","North York"]}'::jsonb,0.8,'chat'),
        (v_user,'tenant','constraint','move_in_date','入住','{"target":"2026-09-01","flexible":true}'::jsonb,0.7,'user'),
        (v_user,'tenant','preference','transit','通勤','{"requires_transit":true,"max_walk_minutes":12}'::jsonb,0.85,'chat'),
        (v_user,'tenant','preference','home_type','户型','{"beds":1,"in_unit_laundry":true,"quiet":true}'::jsonb,0.8,'chat');
    end if;
    if not exists (select 1 from public.agent_pending_actions where user_id = v_user and role='tenant' and status='pending') then
      insert into public.agent_pending_actions (user_id, role, action_type, title, summary, recipient_label, data_scope, excluded_data, risk_level, metadata)
      values (v_user,'tenant','share_passport_summary','批准分享你的 Passport 摘要',
        '已为 Unit 1207 · King West 的房东 Sarah Wang 准备了一份租赁 Passport 摘要 —— 只在你点头后才会发送。','Sarah Wang · Unit 1207 房东',
        array['就业状态','收入区间','租赁就绪分','推荐人状态'], array['原始证件','完整银行流水','私人备注'],'medium',
        jsonb_build_object('property_id','unit_1207_king_west'));
    end if;

  elsif p_role = 'landlord' then
    if not exists (select 1 from public.user_memories where user_id = v_user and role = 'landlord') then
      insert into public.user_memories (user_id, role, memory_type, key, label, value, confidence, source) values
        (v_user,'landlord','preference','min_tier','认证门槛','{"value":"默认 认证 2 级 起申 · Unit 1207 提至 认证 3 级"}'::jsonb,1.0,'user'),
        (v_user,'landlord','constraint','min_credit','CREDIT','{"value":"最低 720 · 低于自动降级提示"}'::jsonb,1.0,'user'),
        (v_user,'landlord','constraint','dti','DTI','{"value":"租金 / 收入 ≤ 35%"}'::jsonb,1.0,'user'),
        (v_user,'landlord','preference','pets','PETS','{"value":"猫 ✓ · 狗仅小型 + $500 押金"}'::jsonb,0.9,'user'),
        (v_user,'landlord','preference','term','TERM','{"value":"12 个月起 · 拒绝 < 6 个月"}'::jsonb,1.0,'user');
    end if;
    if not exists (select 1 from public.agent_pending_actions where user_id = v_user and role='landlord' and status='pending') then
      insert into public.agent_pending_actions (user_id, role, action_type, title, summary, recipient_label, data_scope, excluded_data, risk_level, metadata)
      values (v_user,'landlord','send_lease','把 Unit 1207 的电子租约寄给 Mia Chen?',
        'Mia (认证 3 级, 92% match, 信用 758, 月入 $11k) 已通过 3-way 比较。租约草稿基于 Ontario LTB 标准模板 + Unit 1207 特殊条款(宠物押金 $500)。','Mia Chen · 租客',
        array['租约草稿','起租日 6/1','12 个月期','宠物押金 $500'], array['你的其他房源数据','其他申请人资料'],'high',
        jsonb_build_object('listing','Unit 1207 · King West','applicant','Mia Chen'));
    end if;

  elsif p_role = 'agent' then
    if not exists (select 1 from public.user_memories where user_id = v_user and role = 'agent') then
      insert into public.user_memories (user_id, role, memory_type, key, label, value, confidence, source) values
        (v_user,'agent','preference','area','AREA','{"value":"Liberty · King West · Annex"}'::jsonb,0.9,'user'),
        (v_user,'agent','profile','style','STYLE','{"value":"更擅长讲故事 · 喜欢拍照"}'::jsonb,0.8,'chat'),
        (v_user,'agent','profile','goal','GOAL','{"value":"本月目标 $7,200 · 已 $3,840"}'::jsonb,1.0,'user');
    end if;
    if not exists (select 1 from public.agent_pending_actions where user_id = v_user and role='agent' and status='pending') then
      insert into public.agent_pending_actions (user_id, role, action_type, title, summary, recipient_label, data_scope, excluded_data, risk_level, metadata)
      values (v_user,'agent','schedule_viewing','接 Sarah 派的带看单：周三 14:00 · King West Unit 1207 · 客户 Mia Chen?',
        'Sarah Wang 派了一单。客户 Mia Chen (认证 2 级) · $80 已 Stripe 预授权。下面是 RECO 授权 / 不授权回答清单。','Mia Chen · 认证 2 级 · 客户',
        array['✓ 房东授权回答：租金 + 押金细则','✓ 看房时间 / 钥匙安排','✓ 房源配套 / 朝向 / 暖通'], array['✗ 不授权：房东个人信息','✗ 不授权：其他申请人资料','✗ 不授权：替房东谈判或承诺'],'low',
        jsonb_build_object('client','Mia Chen','listing','Unit 1207 · King West','fee','$80'));
    end if;
  end if;
end $$;
grant execute on function public.seed_demo_agent_data(text) to authenticated;

-- Repair rows already seeded with the old (off-canon) content.
update public.agent_pending_actions set
  summary='已为 Unit 1207 · King West 的房东 Sarah Wang 准备了一份租赁 Passport 摘要 —— 只在你点头后才会发送。',
  recipient_label='Sarah Wang · Unit 1207 房东',
  metadata=jsonb_build_object('property_id','unit_1207_king_west')
where role='tenant' and action_type='share_passport_summary' and status='pending';

update public.agent_pending_actions set
  title='把 Unit 1207 的电子租约寄给 Mia Chen?',
  summary='Mia (认证 3 级, 92% match, 信用 758, 月入 $11k) 已通过 3-way 比较。租约草稿基于 Ontario LTB 标准模板 + Unit 1207 特殊条款(宠物押金 $500)。',
  recipient_label='Mia Chen · 租客',
  data_scope=array['租约草稿','起租日 6/1','12 个月期','宠物押金 $500'],
  metadata=jsonb_build_object('listing','Unit 1207 · King West','applicant','Mia Chen')
where role='landlord' and action_type='send_lease' and status='pending';

update public.agent_pending_actions set
  title='接 Sarah 派的带看单：周三 14:00 · King West Unit 1207 · 客户 Mia Chen?',
  summary='Sarah Wang 派了一单。客户 Mia Chen (认证 2 级) · $80 已 Stripe 预授权。下面是 RECO 授权 / 不授权回答清单。',
  recipient_label='Mia Chen · 认证 2 级 · 客户',
  data_scope=array['✓ 房东授权回答：租金 + 押金细则','✓ 看房时间 / 钥匙安排','✓ 房源配套 / 朝向 / 暖通'],
  excluded_data=array['✗ 不授权：房东个人信息','✗ 不授权：其他申请人资料','✗ 不授权：替房东谈判或承诺'],
  metadata=jsonb_build_object('client','Mia Chen','listing','Unit 1207 · King West')
where role='agent' and action_type='schedule_viewing' and status='pending';

update public.user_memories set value='{"value":"默认 认证 2 级 起申 · Unit 1207 提至 认证 3 级"}'::jsonb, label='认证门槛'
where role='landlord' and key='min_tier' and value::text like '%88 Harbour%';
