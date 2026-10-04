-- Conversation list (2026-10-04): a user-chosen name for a conversation.
-- Kept apart from `title` because every save rewrites `title` from the first
-- thing the user said; the list shows coalesce(custom_title, title).
alter table public.agent_threads
  add column if not exists custom_title text
    check (custom_title is null or char_length(custom_title) between 1 and 80);
