-- =============================================================
-- Stayloop V5.3 — extend seed_demo_agent_data to all three roles.
-- Idempotent: only inserts when the (user, role) has no memories /
-- no pending action yet. Mirrors lib/agent/demo.ts.
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
        'Luna 为 123 King St W 的房东准备了一份租赁 Passport 摘要 —— 只在你点头后才会发送。','123 King St W 的房东',
        array['就业状态','收入区间','租赁就绪分','推荐人状态'], array['原始证件','完整银行流水','私人备注'],'medium',
        jsonb_build_object('property_id','demo_property_123_king','prepared_by','Luna'));
    end if;

  elsif p_role = 'landlord' then
    if not exists (select 1 from public.user_memories where user_id = v_user and role = 'landlord') then
      insert into public.user_memories (user_id, role, memory_type, key, label, value, confidence, source) values
        (v_user,'landlord','preference','min_tier','TIER','{"value":"默认 Tier 3 起申 · 88 Harbour 提至 T3"}'::jsonb,1.0,'user'),
        (v_user,'landlord','constraint','min_credit','CREDIT','{"value":"最低 720 · 低于自动降级提示"}'::jsonb,1.0,'user'),
        (v_user,'landlord','constraint','dti','DTI','{"value":"租金 / 收入 ≤ 35%"}'::jsonb,1.0,'user'),
        (v_user,'landlord','preference','pets','PETS','{"value":"猫 ✓ · 狗仅小型 + $500 押金"}'::jsonb,0.9,'user'),
        (v_user,'landlord','preference','term','TERM','{"value":"12 个月起 · 拒绝 < 6 个月"}'::jsonb,1.0,'user');
    end if;
    if not exists (select 1 from public.agent_pending_actions where user_id = v_user and role='landlord' and status='pending') then
      insert into public.agent_pending_actions (user_id, role, action_type, title, summary, recipient_label, data_scope, excluded_data, risk_level, metadata)
      values (v_user,'landlord','send_lease','把 88 Harbour 的电子租约寄给 Mia Wang?',
        'Mia (Tier 3, 92% match, 信用 758, 月入 $11k) 已通过 3-way 比较。租约草稿基于你 5/1 批的模板 + 88 Harbour 特殊条款(宠物押金 $500)。','Mia Wang · 租客',
        array['租约草稿','起租日 5/22','12 个月期','宠物押金 $500'], array['你的其他房源数据','其他申请人资料'],'high',
        jsonb_build_object('listing','88 Harbour St','applicant','Mia Wang'));
    end if;

  elsif p_role = 'agent' then
    if not exists (select 1 from public.user_memories where user_id = v_user and role = 'agent') then
      insert into public.user_memories (user_id, role, memory_type, key, label, value, confidence, source) values
        (v_user,'agent','preference','area','AREA','{"value":"Liberty · King West · Annex"}'::jsonb,0.9,'user'),
        (v_user,'agent','profile','style','STYLE','{"value":"更擅长讲故事 · 喜欢拍照"}'::jsonb,0.8,'chat'),
        (v_user,'agent','profile','goal','GOAL','{"value":"本月目标 $7,200 · 已 $1,840"}'::jsonb,1.0,'user');
    end if;
    if not exists (select 1 from public.agent_pending_actions where user_id = v_user and role='agent' and status='pending') then
      insert into public.agent_pending_actions (user_id, role, action_type, title, summary, recipient_label, data_scope, excluded_data, risk_level, metadata)
      values (v_user,'agent','schedule_viewing','替 Karen Liu 约 Distillery 区下周末看房?',
        'Karen (来自 Stayloop 推荐) 想看 Distillery 区。我可按你日历空档发出 3 个备选时段,确认前不发任何消息给房东。','Karen Liu · 新客户',
        array['你的可约时段','房源地址','看房须知'], array['你的佣金分成比例','其他客户安排'],'low',
        jsonb_build_object('client','Karen Liu','area','Distillery'));
    end if;
  end if;
end $$;
grant execute on function public.seed_demo_agent_data(text) to authenticated;
