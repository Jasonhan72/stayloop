-- Drop the dead V4 AI-native agent layer (superseded by the agent_* spine, 20260606_agent_core.sql).
-- Rows were stale dev data from 2026-04-28 ~ 05-08; full JSON backup taken 2026-07-08 before drop.
-- audit_events was still referenced by /api/trust/verify, but every insert failed silently
-- (the route sent an actor_type column the table never had) — the route now writes
-- agent_audit_events instead, so all six tables go together.

drop table if exists public.tool_executions cascade;
drop table if exists public.pending_actions cascade;
drop table if exists public.messages cascade;
drop table if exists public.conversations cascade;
drop table if exists public.user_facts cascade;
drop table if exists public.audit_events cascade;
