-- INTERNAL CANDIDATE ONLY. Test with matching rooms.js before any deployment.
begin;
revoke select on public.player_hands from public, anon, authenticated;
do $$
declare c record;
begin
  for c in select attname from pg_attribute
    where attrelid='public.player_hands'::regclass and attnum>0 and not attisdropped
  loop
    execute format('revoke select (%I) on public.player_hands from public, anon, authenticated',c.attname);
  end loop;
end $$;
-- Realtime/status fields contain no secret cards or 321 arrangement groups.
grant select (id,round_id,room_id,user_id,is_seen,is_folded,is_revealed,bet_amount,created_at)
  on public.player_hands to authenticated;

create or replace function public.get_round_hands(p_round_id uuid)
returns table(user_id uuid,cards jsonb,is_seen boolean,is_folded boolean,
  is_revealed boolean,bet_amount bigint,variant_choice jsonb)
language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid := auth.uid(); v_room uuid; v_mode text;
begin
  if v_user is null then raise exception 'Login required'; end if;
  select gr.room_id,lower(coalesce(r.game_mode,'classic')) into v_room,v_mode
    from public.game_rounds gr join public.rooms r on r.id=gr.room_id
    where gr.id=p_round_id;
  if v_room is null then raise exception 'Round not found'; end if;
  if not exists(select 1 from public.room_players rp
                where rp.room_id=v_room and rp.user_id=v_user and rp.is_active) then
    raise exception 'You are not an active player in this room';
  end if;
  return query select ph.user_id,
    case when ph.is_revealed or
      (ph.user_id=v_user and (ph.is_seen or v_mode='321')) then ph.cards else null end,
    ph.is_seen,ph.is_folded,ph.is_revealed,ph.bet_amount,
    case when ph.user_id=v_user or ph.is_revealed then ph.variant_choice
         when coalesce((ph.variant_choice->>'ready')::boolean,false)
           then jsonb_build_object('ready',true) else null end
    from public.player_hands ph where ph.round_id=p_round_id;
end $$;
revoke execute on function public.get_round_hands(uuid) from public,anon;
grant execute on function public.get_round_hands(uuid) to authenticated;
commit;
