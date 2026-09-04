-- INTERNAL CANDIDATE ONLY. Apply with the matching auth.js in isolation first.
-- No automatic migration or live database changes.
begin;
revoke insert, update, delete, truncate on public.profiles from public, anon, authenticated;
-- Table revocation does not remove older explicit column grants.
do $$
declare c record;
begin
  for c in select attname from pg_attribute
    where attrelid='public.profiles'::regclass and attnum>0 and not attisdropped
  loop
    execute format('revoke insert (%I), update (%I) on public.profiles from public, anon, authenticated', c.attname, c.attname);
  end loop;
end $$;
grant update (username, avatar_url) on public.profiles to authenticated;
alter table public.profiles enable row level security;
-- Restrictive policy prevents broader legacy policies from permitting other users.
drop policy if exists tpa_profile_owner_guard on public.profiles;
create policy tpa_profile_owner_guard on public.profiles as restrictive
  for update to authenticated
  using (id=(select auth.uid())) with check (id=(select auth.uid()));
drop policy if exists tpa_profile_owner_update on public.profiles;
create policy tpa_profile_owner_update on public.profiles for update to authenticated
  using (id=(select auth.uid())) with check (id=(select auth.uid()));

create or replace function public.ensure_player_profile(p_username text default 'Player')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := left(coalesce(nullif(btrim(p_username),''),'Player'),20);
  v_result jsonb;
begin
  if v_user is null then raise exception 'Login required'; end if;
  if not exists (select 1 from auth.users where id=v_user) then
    raise exception 'User account not found';
  end if;
  -- Only server defaults initialize chips/stats. Existing rows are never reset.
  insert into public.profiles(id,username) values(v_user,v_name)
    on conflict(id) do nothing;
  select jsonb_build_object('id',id,'username',username,'chips',chips,
    'games_played',games_played,'games_won',games_won)
    into v_result from public.profiles where id=v_user;
  return v_result;
end $$;
revoke execute on function public.ensure_player_profile(text) from public, anon;
grant execute on function public.ensure_player_profile(text) to authenticated;
commit;
