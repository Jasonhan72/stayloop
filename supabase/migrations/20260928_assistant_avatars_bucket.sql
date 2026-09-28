-- Custom assistant avatars (2026-09-28): a user can make the assistant's face
-- from a photo or a description (OpenAI image model, server route
-- /api/assistant/avatar). The result is a 1024px transparent WebP in a public
-- bucket under <uid>/<id>.webp; assistant_profiles.avatar stores the short key
-- `custom:<uid>/<id>` (the renderer builds the URL, so only our own bucket can
-- ever be shown). The uploaded photo itself is never stored.

-- The key is longer than a preset name: lift the 40-character check to 400
-- (drop whichever name the inline check got when the table was created).
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.assistant_profiles'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%avatar%'
  loop
    execute format('alter table public.assistant_profiles drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.assistant_profiles
  add constraint assistant_profiles_avatar_check check (avatar is null or char_length(avatar) <= 400);

-- Public read by URL (the face shows in the user's own UI on every page);
-- writes and deletes only through the generation route (service role) — no
-- storage policy grants authenticated any access, so nobody can upload
-- arbitrary images into it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assistant-avatars', 'assistant-avatars', true, 2097152, array['image/webp', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
