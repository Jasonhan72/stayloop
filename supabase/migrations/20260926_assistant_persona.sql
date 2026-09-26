-- The assistant's personality, written by the person (user 2026-09-25/26: the
-- settings tab is the agent's long-term record and shapes how it thinks —
-- "相当于每一个 agent 的人格"). A few sentences on who it is and how it works
-- (≤ 600 chars), injected into every turn's system prompt inside the rules.
-- The one-line `vibe` stays as the tone; this is the fuller character.
alter table public.assistant_profiles
  add column if not exists persona text check (persona is null or char_length(persona) <= 600);
