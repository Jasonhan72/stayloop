-- 月度简报例行任务 (2026-10-26; design/ai-rebuild-report-review-2026-10-25.md 第一批 4):
-- the landlord kind `monthly_brief` joins both allow-lists (the column CHECK and the per-hat one).
alter table public.agent_routines drop constraint if exists agent_routines_kind_check;
alter table public.agent_routines add constraint agent_routines_kind_check check (kind in (
  'rent_reminder_cards', 'renewal_window_check', 'applications_digest', 'overdue_rent_check', 'monthly_brief',
  'rent_due_reminder', 'maintenance_followup',
  'client_followup_digest'));
alter table public.agent_routines drop constraint if exists agent_routines_kind_by_role;
alter table public.agent_routines add constraint agent_routines_kind_by_role check (
  (role = 'landlord' and kind in ('rent_reminder_cards','renewal_window_check','applications_digest','overdue_rent_check','monthly_brief'))
  or (role = 'tenant' and kind in ('rent_due_reminder','maintenance_followup'))
  or (role = 'agent' and kind in ('client_followup_digest')));
