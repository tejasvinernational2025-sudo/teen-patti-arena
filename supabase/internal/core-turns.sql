-- INTERNAL CANDIDATE ONLY: tested with synthetic fixtures, not deployed.
-- Requires the existing game schema. Not an automatic migration.
CREATE OR REPLACE FUNCTION public.take_online_action(p_round_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_hand public.player_hands%rowtype;
  v_current_seat smallint;
  v_next uuid;
  v_amount bigint := 0;
  v_active_count integer;
  v_winner uuid;
  v_max_score integer[];
  v_winner_count integer;
  v_share bigint;
  v_remainder bigint;
  v_first_winner uuid;
  v_hand_name text;
  v_winners jsonb;
  v_mode text;
begin
  if v_user is null then
    raise exception 'Login required';
  end if;

  p_action := lower(trim(p_action));

  if p_action is null or p_action not in ('seen','blind','chaal','pack','show') then
    raise exception 'Invalid action';
  end if;

  select * into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found then
    raise exception 'Round not found';
  end if;

  if v_round.status <> 'playing' then
    raise exception 'Round is not active';
  end if;

  select lower(coalesce(game_mode,'classic')) into v_mode
  from public.rooms where id = v_round.room_id;

  select * into v_hand
  from public.player_hands
  where round_id = p_round_id and user_id = v_user
  for update;

  if not found then
    raise exception 'You are not in this round';
  end if;

  if v_hand.is_folded then
    raise exception 'You already packed';
  end if;

  if v_round.current_turn is distinct from v_user then
    raise exception 'Wait for your turn';
  end if;

  if v_mode = '321' then
    raise exception 'Use the 321 arrangement controls';
  end if;
  if v_round.turn_deadline is null or v_round.turn_deadline <= clock_timestamp() then
    raise exception 'Turn expired or paused';
  end if;
  if exists (select 1 from public.side_show_requests
             where round_id = p_round_id and status = 'pending') then
    raise exception 'Side Show decision pending';
  end if;

  -- Viewing cards must not extend the player's turn.
  if p_action = 'seen' then
    if not v_hand.is_seen then
      update public.player_hands
      set is_seen = true
      where id = v_hand.id;

      insert into public.game_actions(round_id, room_id, user_id, action, amount)
      values (p_round_id, v_round.room_id, v_user, 'seen', 0);
    end if;

    return jsonb_build_object('ok', true, 'action', 'seen', 'current_turn', v_user);
  end if;

  -- Serialize wallet changes before checking funds.
  perform id from public.profiles where id = v_user for update;
  if not found then raise exception 'Player profile missing'; end if;

  if p_action in ('blind','chaal') then
    if p_action = 'blind' and v_hand.is_seen then
      raise exception 'Seen player cannot play blind';
    end if;

    v_amount := case
      when v_hand.is_seen then v_round.current_bet * 2
      else v_round.current_bet
    end;

    if (select chips from public.profiles where id = v_user) < v_amount then
      raise exception 'Not enough chips';
    end if;

    update public.profiles
    set chips = chips - v_amount
    where id = v_user;

    update public.player_hands
    set bet_amount = bet_amount + v_amount
    where id = v_hand.id;

    update public.game_rounds
    set pot = pot + v_amount
    where id = p_round_id;

    insert into public.game_actions(round_id, room_id, user_id, action, amount)
    values (
      p_round_id, v_round.room_id, v_user,
      case when v_hand.is_seen then 'chaal' else 'blind' end,
      v_amount
    );
  end if;

  if p_action = 'pack' then
    update public.player_hands
    set is_folded = true
    where id = v_hand.id;

    insert into public.game_actions(round_id, room_id, user_id, action, amount)
    values (p_round_id, v_round.room_id, v_user, 'pack', 0);
  end if;

  if p_action = 'show' then
    select count(*) into v_active_count
    from public.player_hands
    where round_id = p_round_id and is_folded = false;

    if v_active_count <> 2 then
      raise exception 'Show is available when only 2 players remain';
    end if;

    v_amount := v_round.current_bet * 2;

    if (select chips from public.profiles where id = v_user) < v_amount then
      raise exception 'Not enough chips for show';
    end if;

    update public.profiles
    set chips = chips - v_amount
    where id = v_user;

    update public.player_hands
    set bet_amount = bet_amount + v_amount
    where id = v_hand.id;

    update public.game_rounds
    set pot = pot + v_amount,
        status = 'show',
        turn_deadline = null
    where id = p_round_id
    returning * into v_round;

    insert into public.game_actions(round_id, room_id, user_id, action, amount)
    values (p_round_id, v_round.room_id, v_user, 'show', v_amount);

    update public.player_hands
    set is_revealed = true
    where round_id = p_round_id and is_folded = false;

    select public.teen_patti_mode_score(cards, v_mode, v_round.variant_data)
    into v_max_score
    from public.player_hands
    where round_id = p_round_id and is_folded = false
    order by public.teen_patti_mode_score(cards, v_mode, v_round.variant_data) desc
    limit 1;

    select count(*) into v_winner_count
    from public.player_hands
    where round_id = p_round_id
      and is_folded = false
      and public.teen_patti_mode_score(cards, v_mode, v_round.variant_data) = v_max_score;

    v_share := v_round.pot / v_winner_count;
    v_remainder := v_round.pot - (v_share * v_winner_count);

    select ph.user_id
    into v_first_winner
    from public.player_hands ph
    join public.room_players rp
      on rp.room_id = ph.room_id and rp.user_id = ph.user_id
    where ph.round_id = p_round_id
      and ph.is_folded = false
      and public.teen_patti_mode_score(ph.cards, v_mode, v_round.variant_data) = v_max_score
    order by rp.seat_no
    limit 1;

    update public.profiles p
    set games_played = games_played + 1
    where p.id in (
      select user_id from public.player_hands where round_id = p_round_id
    );

    update public.profiles p
    set chips = chips + v_share +
        case when p.id = v_first_winner then v_remainder else 0 end,
        games_won = games_won + 1
    where p.id in (
      select user_id
      from public.player_hands
      where round_id = p_round_id
        and is_folded = false
        and public.teen_patti_mode_score(cards, v_mode, v_round.variant_data) = v_max_score
    );

    insert into public.game_actions(round_id, room_id, user_id, action, amount)
    select
      p_round_id, v_round.room_id, ph.user_id, 'win',
      v_share + case when ph.user_id = v_first_winner then v_remainder else 0 end
    from public.player_hands ph
    where ph.round_id = p_round_id
      and ph.is_folded = false
      and public.teen_patti_mode_score(ph.cards, v_mode, v_round.variant_data) = v_max_score;

    select jsonb_agg(user_id)
    into v_winners
    from public.player_hands
    where round_id = p_round_id
      and is_folded = false
      and public.teen_patti_mode_score(cards, v_mode, v_round.variant_data) = v_max_score;

    select public.teen_patti_mode_hand_name(cards, v_mode, v_round.variant_data)
    into v_hand_name
    from public.player_hands
    where round_id = p_round_id
      and is_folded = false
      and public.teen_patti_mode_score(cards, v_mode, v_round.variant_data) = v_max_score
    limit 1;

    update public.game_rounds
    set status = 'finished',
        winner_id = case when v_winner_count = 1 then v_first_winner else null end,
        winner_hand = v_hand_name,
        current_turn = null,
        turn_deadline = null,
        finished_at = now(),
        result = jsonb_build_object(
          'reason', 'show',
          'winners', coalesce(v_winners, '[]'::jsonb),
          'amount_each', v_share,
          'hand', v_hand_name,
          'tie', (v_winner_count > 1),
          'mode', v_mode,
          'variant', v_round.variant_data
        )
    where id = p_round_id;

    update public.rooms
    set status = 'waiting'
    where id = v_round.room_id;

    return jsonb_build_object('ok', true, 'action', 'show', 'finished', true);
  end if;

  select count(*) into v_active_count
  from public.player_hands
  where round_id = p_round_id and is_folded = false;

  if v_active_count = 1 then
    select user_id into v_winner
    from public.player_hands
    where round_id = p_round_id and is_folded = false
    limit 1;

    perform public.finish_online_round_single(
      p_round_id, v_winner, 'all_others_packed', false
    );

    update public.game_rounds set turn_deadline = null where id = p_round_id;

    return jsonb_build_object(
      'ok', true, 'action', p_action, 'finished', true, 'winner', v_winner
    );
  end if;

  select seat_no into v_current_seat
  from public.room_players
  where room_id = v_round.room_id and user_id = v_user;

  select rp.user_id into v_next
  from public.room_players rp
  join public.player_hands ph
    on ph.room_id = rp.room_id
   and ph.user_id = rp.user_id
   and ph.round_id = p_round_id
  where rp.room_id = v_round.room_id
    and ph.is_folded = false
    and rp.seat_no > v_current_seat
  order by rp.seat_no
  limit 1;

  if v_next is null then
    select rp.user_id into v_next
    from public.room_players rp
    join public.player_hands ph
      on ph.room_id = rp.room_id
     and ph.user_id = rp.user_id
     and ph.round_id = p_round_id
    where rp.room_id = v_round.room_id
      and ph.is_folded = false
    order by rp.seat_no
    limit 1;
  end if;

  update public.game_rounds
  set current_turn = v_next,
      turn_seq = turn_seq + 1,
      turn_deadline = now() + interval '30 seconds'
  where id = p_round_id;

  return jsonb_build_object(
    'ok', true, 'action', p_action, 'amount', v_amount, 'current_turn', v_next
  );
end;
$function$;

revoke execute on function public.finish_online_round_single(uuid,uuid,text,boolean) from public, anon, authenticated;
revoke execute on function public.take_online_action(uuid,text) from public, anon;
grant execute on function public.take_online_action(uuid,text) to authenticated;
