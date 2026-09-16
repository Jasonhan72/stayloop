-- 2026-09-15: the Ontario Courts Portal sits behind an Azure Application
-- Gateway that 403s requests from some egress regions (reproduced from a
-- non-Canadian VPN; production's Cloudflare Worker egress hit it at 00:17 UTC
-- while 23:43 UTC passed). The Supabase database (AWS us-east-1) gets a 200,
-- so a service-role-only relay is the fallback when the direct fetch is
-- refused. pg_net cannot be used synchronously (its queue row is invisible to
-- the worker until the calling transaction commits, so in-function polling
-- always times out); the synchronous `http` extension is used instead with a
-- 6 s curl timeout, under PostgREST's 8 s statement timeout. The host
-- allow-list keeps the function from becoming a general proxy.
create extension if not exists http with schema extensions;

create or replace function public.portal_relay_get(p_url text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r extensions.http_response;
begin
  if p_url is null or p_url !~ '^https://api1\.courts\.ontario\.ca/courts/cms/parties\?' then
    return jsonb_build_object('status', 0, 'error', 'host not allowed');
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '6000');
  begin
    r := extensions.http((
      'GET', p_url,
      array[extensions.http_header('accept', 'application/json')],
      null, null
    )::extensions.http_request);
  exception when others then
    return jsonb_build_object('status', 0, 'error', left(sqlerrm, 200));
  end;
  return jsonb_build_object('status', r.status, 'body', r.content);
end $$;
revoke execute on function public.portal_relay_get(text) from public, anon, authenticated;
grant execute on function public.portal_relay_get(text) to service_role;
