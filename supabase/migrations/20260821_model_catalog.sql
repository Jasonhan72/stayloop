-- Model catalogue + per-user model preferences (2026-08-21).
-- Applied to prod via Supabase MCP (model_catalog).
--
-- model_catalog: admin-managed list of AI models available system-wide. Seeded
-- from lib/modelConfig.ts BUILTIN_MODELS; a row with a builtin id overrides the
-- code definition (that is how admins disable/relabel builtins). Security
-- rules live in lib/modelConfig.ts rowToModel(): api_key_env must be a known
-- provider key and base_url must be on that provider's host allow-list —
-- rows violating that are ignored by the server even if they exist here.
--
-- user_model_preferences: a signed-in user's own picks per slot (turn /
-- screening). Honoured only while still valid (catalogue, enabled,
-- user_selectable, key configured) — see getModelForUser().

create table if not exists public.model_catalog (
  id               text primary key,
  label            text not null,
  note             text not null default '',
  provider         text not null check (provider in ('anthropic','openai-compat')),
  base_url         text,
  api_key_env      text not null,
  vision           boolean not null default false,
  cost_tier        text not null default '中' check (cost_tier in ('低','中','高')),
  allowed_slots    text[] not null default '{turn}',
  omit_temperature boolean not null default false,
  max_tokens_param text not null default 'max_tokens' check (max_tokens_param in ('max_tokens','max_completion_tokens')),
  user_selectable  boolean not null default true,
  enabled          boolean not null default true,
  builtin          boolean not null default false,
  sort_order       integer not null default 1000,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);
alter table public.model_catalog enable row level security;

-- Signed-in users see enabled rows (the /settings/models picker; env NAMES are
-- not secrets, values never leave the server). Admins see and edit everything.
drop policy if exists "Users read enabled models" on public.model_catalog;
create policy "Users read enabled models" on public.model_catalog
  for select to authenticated using (enabled = true or public.is_stayloop_admin());
drop policy if exists "Admins insert model_catalog" on public.model_catalog;
create policy "Admins insert model_catalog" on public.model_catalog
  for insert to authenticated with check (public.is_stayloop_admin());
drop policy if exists "Admins update model_catalog" on public.model_catalog;
create policy "Admins update model_catalog" on public.model_catalog
  for update to authenticated using (public.is_stayloop_admin()) with check (public.is_stayloop_admin());
drop policy if exists "Admins delete model_catalog" on public.model_catalog;
create policy "Admins delete model_catalog" on public.model_catalog
  for delete to authenticated using (public.is_stayloop_admin());

create table if not exists public.user_model_preferences (
  user_id    uuid not null references auth.users(id) on delete cascade,
  slot       text not null check (slot in ('turn','screening','classify','forensics')),
  model_id   text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);
alter table public.user_model_preferences enable row level security;
drop policy if exists "Own model prefs select" on public.user_model_preferences;
create policy "Own model prefs select" on public.user_model_preferences
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Own model prefs insert" on public.user_model_preferences;
create policy "Own model prefs insert" on public.user_model_preferences
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Own model prefs update" on public.user_model_preferences;
create policy "Own model prefs update" on public.user_model_preferences
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Own model prefs delete" on public.user_model_preferences;
create policy "Own model prefs delete" on public.user_model_preferences
  for delete to authenticated using (auth.uid() = user_id);

-- Seed = BUILTIN_MODELS (lib/modelConfig.ts). Keep in sync when adding builtins.
insert into public.model_catalog (id, label, note, provider, base_url, api_key_env, vision, cost_tier, allowed_slots, omit_temperature, max_tokens_param, builtin, sort_order) values
  ('claude-sonnet-5',        'Claude Sonnet 5',          '最新旗舰推理 — 编码/代理任务接近 Opus 级',                         'anthropic',     null,                                                         'ANTHROPIC_API_KEY', true,  '高', '{turn,screening,classify,forensics}', false, 'max_tokens', true, 10),
  ('claude-opus-4-8',        'Claude Opus 4.8',          '最强 Opus 级 — 最难的长程推理任务（成本最高）',                     'anthropic',     null,                                                         'ANTHROPIC_API_KEY', true,  '高', '{turn,screening,classify,forensics}', false, 'max_tokens', true, 20),
  ('claude-sonnet-4-6',      'Claude Sonnet 4.6',        '稳定基线 — 当前对话/评分/分类槽位的默认模型',                       'anthropic',     null,                                                         'ANTHROPIC_API_KEY', true,  '中', '{turn,screening,classify,forensics}', false, 'max_tokens', true, 30),
  ('claude-haiku-4-5',       'Claude Haiku 4.5',         '轻量抽取 — 低成本低延迟，适合取证类结构化抽取',                     'anthropic',     null,                                                         'ANTHROPIC_API_KEY', true,  '低', '{turn,screening,classify,forensics}', false, 'max_tokens', true, 40),
  ('deepseek-v4-flash',      'DeepSeek V4 Flash',        'DeepSeek V4 轻量档 — 极低成本、快速响应',                           'openai-compat', 'https://api.deepseek.com',                                   'DEEPSEEK_API_KEY',  false, '低', '{turn}', false, 'max_tokens', true, 50),
  ('deepseek-v4-pro',        'DeepSeek V4 Pro',          'DeepSeek V4 强化档 — 更强推理，成本仍低于 Claude',                  'openai-compat', 'https://api.deepseek.com',                                   'DEEPSEEK_API_KEY',  false, '低', '{turn}', false, 'max_tokens', true, 60),
  ('kimi-k3',                'Kimi K3',                  'Moonshot Kimi 旗舰 — 思考型模型，响应稍慢（含推理阶段）',           'openai-compat', 'https://api.moonshot.cn/v1',                                 'MOONSHOT_API_KEY',  false, '低', '{turn}', true,  'max_tokens', true, 70),
  ('kimi-k2.6',              'Kimi K2.6',                'Moonshot Kimi K2.6 — 思考型模型，响应稍慢（含推理阶段）',            'openai-compat', 'https://api.moonshot.cn/v1',                                 'MOONSHOT_API_KEY',  false, '低', '{turn}', true,  'max_tokens', true, 80),
  ('gpt-5.4',                'GPT-5.4',                  'OpenAI 旗舰 — 推理/代理能力强，成本中等',                           'openai-compat', 'https://api.openai.com/v1',                                  'OPENAI_API_KEY',    false, '中', '{turn}', true,  'max_completion_tokens', true, 90),
  ('gpt-5.4-mini',           'GPT-5.4 mini',             'OpenAI 轻量档 — 低成本、快速响应',                                 'openai-compat', 'https://api.openai.com/v1',                                  'OPENAI_API_KEY',    false, '低', '{turn}', true,  'max_completion_tokens', true, 100),
  ('gemini-3.7-flash',       'Gemini 3.7 Flash',         'Google Gemini 轻量旗舰 — 低成本、快速，思考型',                     'openai-compat', 'https://generativelanguage.googleapis.com/v1beta/openai',    'GEMINI_API_KEY',    false, '低', '{turn}', false, 'max_tokens', true, 110),
  ('gemini-3.1-pro-preview', 'Gemini 3.1 Pro (preview)', 'Google Gemini Pro 预览版 — 更强推理，成本中等',                     'openai-compat', 'https://generativelanguage.googleapis.com/v1beta/openai',    'GEMINI_API_KEY',    false, '中', '{turn}', false, 'max_tokens', true, 120),
  ('qwen-plus',              '通义千问 Plus',             '阿里通义 Qwen-Plus — 低成本均衡对话',                               'openai-compat', 'https://dashscope.aliyuncs.com/compatible-mode/v1',          'DASHSCOPE_API_KEY', false, '低', '{turn}', false, 'max_tokens', true, 130),
  ('glm-4.6',                '智谱 GLM-4.6',              '智谱 GLM-4.6 — 低成本中文对话/代理',                                'openai-compat', 'https://open.bigmodel.cn/api/paas/v4',                       'ZHIPU_API_KEY',     false, '低', '{turn}', false, 'max_tokens', true, 140)
on conflict (id) do nothing;

-- 2026-08-22: latest + value tier per provider (lib/modelConfig.ts BUILTIN_MODELS).
insert into public.model_catalog (id, label, note, provider, base_url, api_key_env, vision, cost_tier, allowed_slots, omit_temperature, max_tokens_param, builtin, sort_order) values
  ('claude-opus-5',         'Claude Opus 5',         '最新旗舰（Claude 5 代）— 最强推理，成本最高',                 'anthropic',     null,                                                      'ANTHROPIC_API_KEY', true,  '高', '{turn,screening,classify,forensics}', false, 'max_tokens', true, 5),
  ('gpt-5.5',               'GPT-5.5',               'OpenAI 最新旗舰（2026-04）— 最强推理/代理，成本高',           'openai-compat', 'https://api.openai.com/v1',                               'OPENAI_API_KEY',    false, '高', '{turn}', true,  'max_completion_tokens', true, 85),
  ('gpt-5.4-nano',          'GPT-5.4 nano',          'OpenAI 最低价档 — 极低成本、最快，适合简单轮次',               'openai-compat', 'https://api.openai.com/v1',                               'OPENAI_API_KEY',    false, '低', '{turn}', true,  'max_completion_tokens', true, 105),
  ('gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite', 'Google 最低价档 — 极低成本、极快',                             'openai-compat', 'https://generativelanguage.googleapis.com/v1beta/openai', 'GEMINI_API_KEY',    false, '低', '{turn}', false, 'max_tokens', true, 125),
  ('qwen3.8-max',           '通义千问 3.8 Max',       '阿里最新旗舰 — 最强推理，成本中等',                            'openai-compat', 'https://dashscope.aliyuncs.com/compatible-mode/v1',       'DASHSCOPE_API_KEY', false, '中', '{turn}', false, 'max_tokens', true, 128),
  ('qwen3.7-plus',          '通义千问 3.7 Plus',      '阿里均衡档 — 性能与成本平衡',                                  'openai-compat', 'https://dashscope.aliyuncs.com/compatible-mode/v1',       'DASHSCOPE_API_KEY', false, '低', '{turn}', false, 'max_tokens', true, 129),
  ('qwen3.7-flash',         '通义千问 3.7 Flash',     '阿里高性价比档 — 低成本、快速',                                'openai-compat', 'https://dashscope.aliyuncs.com/compatible-mode/v1',       'DASHSCOPE_API_KEY', false, '低', '{turn}', false, 'max_tokens', true, 131),
  ('glm-5.3',               '智谱 GLM-5.3',           '智谱最新旗舰 — 中文对话/代理，成本低',                         'openai-compat', 'https://open.bigmodel.cn/api/paas/v4',                    'ZHIPU_API_KEY',     false, '低', '{turn}', false, 'max_tokens', true, 138),
  ('glm-5-turbo',           '智谱 GLM-5 Turbo',       '智谱高性价比档 — 更快、更便宜',                                'openai-compat', 'https://open.bigmodel.cn/api/paas/v4',                    'ZHIPU_API_KEY',     false, '低', '{turn}', false, 'max_tokens', true, 139)
on conflict (id) do nothing;
-- Superseded aliases stay in history but are switched off (any preference pointing at them falls back to the default).
update public.model_catalog set enabled = false, builtin = false, updated_at = now() where id in ('qwen-plus', 'glm-4.6');
