-- Avatar presets became twenty cartoon pets (user 2026-09-25, after Muse's plush
-- creature). The eleven glossy shapes saved before map onto pets so nobody's
-- assistant goes blank — the same table as lib/agent/avatars.tsx LEGACY_AVATARS,
-- which still covers values cached in localStorage.
update public.assistant_profiles
set avatar = case avatar
  when 'sphere-violet' then 'bunny'
  when 'sphere-blue' then 'seal'
  when 'sphere-mint' then 'frog'
  when 'sphere-sunset' then 'fox'
  when 'sphere-rose' then 'pig'
  when 'cube' then 'bear'
  when 'ring' then 'panda'
  when 'gem' then 'cat'
  when 'pill' then 'hamster'
  when 'blob' then 'penguin'
  when 'star' then 'chick'
  else avatar end
where avatar in ('sphere-violet', 'sphere-blue', 'sphere-mint', 'sphere-sunset', 'sphere-rose', 'cube', 'ring', 'gem', 'pill', 'blob', 'star');
