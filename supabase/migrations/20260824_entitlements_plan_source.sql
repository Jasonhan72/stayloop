-- get_entitlements 与真实计划源对齐（2026-08-24）
--
-- 背景：付费门禁的真实执行方（app/api/screen-score 配额、app/api/deep-check
-- 的 pro 门）读的是 landlords.plan，Stripe webhook 也写这一列——这条链一直是
-- 对的。而 get_entitlements 读的是 public.subscription，该表 0 行且没有任何
-- 写入方，于是真付费房东在 /settings 的「当前计划」上被显示成 free。
--
-- 这里让 landlord 分支以 landlords.plan 为准（subscription 若将来有行则优先），
-- 并把 'team' 补进解锁集合，与 screen-score/deep-check 的判断一致。
-- tenant / agent 角色没有任何计划存储，继续解析为 free（如实）。
create or replace function public.get_entitlements(p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_plan text; v_paid boolean;
begin
  if v_user is null then return '{}'::jsonb; end if;

  select plan into v_plan from public.subscription where account_id = v_user and role = p_role;

  if v_plan is null and p_role = 'landlord' then
    select plan into v_plan from public.landlords
     where auth_id = v_user or id = v_user
     order by (auth_id = v_user) desc
     limit 1;
  end if;

  v_plan := coalesce(v_plan, 'free');
  v_paid := v_plan in ('pro', 'team', 'premium');

  if p_role = 'tenant' then
    return jsonb_build_object('transaction_fee', 0, 'plan', v_plan,
      'proactive_alerts', v_plan in ('plus','pro'), 'cross_city', v_plan = 'pro');
  elsif p_role = 'landlord' then
    return jsonb_build_object('plan', v_plan, 'rent_collection', true,
      'full_screening', v_paid, 'lease_drafting', v_paid,
      'listing_limit', case v_plan when 'free' then 1 else 999 end,
      'commission_panel', v_plan = 'premium', 'next_day_payout', v_plan = 'premium');
  else
    return jsonb_build_object('plan', v_plan, 'referral_receive', true, 'referral_settle', true,
      'priority', v_plan in ('pro','team'), 'team', v_plan = 'team');
  end if;
end $$;
grant execute on function public.get_entitlements(text) to authenticated;
