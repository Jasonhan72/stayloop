-- Assistant settings tab (user 2026-09-25, after Muse's fourth tab: "AI Agent
-- 的设置要加上"): a person can give their one assistant a speaking style
-- ("vibe"). One line, ≤ 120 chars. The prompt frames it as tone and wording
-- only — never the rules it follows or what it may do — and the compliance
-- guardrail still runs on every output. RLS on assistant_profiles is self.
alter table public.assistant_profiles
  add column if not exists vibe text check (vibe is null or char_length(vibe) <= 120);
