-- Site test 2026-10-17 · S3 database fixes.

-- ── H-D2 · the 10-minute retraction window is enforced in the database too ──
-- The UI only offered 「撤回」 for 10 minutes (RETRACT_WINDOW_MS); a direct insert could retract any
-- older message of one's own. Same body as before plus the window check.
create or replace function public.thread_messages_before_insert()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  party text;
  a jsonb;
  reg record;
  fixed jsonb := '[]'::jsonb;
begin
  if not public.is_direct_client_write() then return new; end if;
  new.created_at := now();
  new.sender_id := auth.uid();
  new.channel := 'app';
  party := public.thread_party(new.thread_id);
  if party is null then raise exception 'not_a_party'; end if;
  new.sender_kind := party;
  new.meta := '{}'::jsonb;
  -- A display-name snapshot (not in the hash canonical form); never client-supplied.
  new.sender_label := public.my_sender_label(new.thread_id);
  if new.kind not in ('message', 'retraction') then raise exception 'kind_not_allowed'; end if;
  if new.acting_role is not null and new.acting_role not in ('tenant', 'landlord', 'agent', 'provider', 'admin') then new.acting_role := null; end if;
  if new.kind = 'retraction' then
    if new.ref_message_id is null then raise exception 'retraction_needs_ref'; end if;
    if not exists (select 1 from public.thread_messages m where m.id = new.ref_message_id and m.thread_id = new.thread_id and m.sender_id = auth.uid() and m.kind = 'message') then raise exception 'retraction_not_yours'; end if;
    if not exists (select 1 from public.thread_messages m where m.id = new.ref_message_id and m.created_at > now() - interval '10 minutes') then raise exception 'retraction_window_passed'; end if;
    if exists (select 1 from public.thread_messages m where m.kind = 'retraction' and m.ref_message_id = new.ref_message_id) then raise exception 'already_retracted'; end if;
    new.attachments := '[]'::jsonb;
  else
    new.ref_message_id := null;
  end if;
  if jsonb_array_length(new.attachments) > 6 then raise exception 'too_many_attachments'; end if;
  for a in select * from jsonb_array_elements(new.attachments) loop
    select * into reg from public.thread_attachments r where r.path = a ->> 'path' and r.thread_id = new.thread_id;
    if not found then raise exception 'attachment_not_registered'; end if;
    fixed := fixed || jsonb_build_object('path', reg.path, 'name', reg.name, 'mime', reg.mime, 'size', reg.size, 'sha256', reg.sha256);
  end loop;
  new.attachments := fixed;
  return new;
end $function$;

-- ── T6 越界 · a client-inserted card starts pending, with no decision or execution on it ──
-- agent_pending_actions_self (FOR ALL, user_id = auth.uid()) let a user insert a card already marked
-- approved / executed, which the to-do page then showed as history. Client inserts (assistant proposals,
-- the applicant page, the payment-plan draft) only ever create pending cards.
drop policy if exists agent_pending_actions_self on public.agent_pending_actions;
create policy agent_pending_actions_self on public.agent_pending_actions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy agent_pending_actions_insert_pending on public.agent_pending_actions
  as restrictive for insert with check (status = 'pending' and executed_at is null and execution_result is null and decided_at is null);

-- ── T4-06 · nothing calls is_email_unsubscribed from the API any more (no policy, no client) ──
revoke execute on function public.is_email_unsubscribed(text) from public, anon, authenticated;
