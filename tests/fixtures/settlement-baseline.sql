-- Captured legacy helper for isolated permission regression tests only.
CREATE OR REPLACE FUNCTION public.finish_online_round_single(p_round_id uuid, p_winner uuid, p_reason text, p_reveal boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_round public.game_rounds%rowtype;
  v_hand jsonb;
  v_hand_name text;
  v_mode text;
begin
  select * into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found or v_round.status = 'finished' then
    return;
  end if;

  select lower(coalesce(game_mode,'classic')) into v_mode
  from public.rooms where id = v_round.room_id;

  select cards into v_hand
  from public.player_hands
  where round_id = p_round_id and user_id = p_winner;

  v_hand_name := case
    when v_hand is null then null
    else public.teen_patti_mode_hand_name(v_hand, v_mode, v_round.variant_data)
  end;

  update public.profiles
  set games_played = games_played + 1
  where id in (
    select user_id from public.player_hands where round_id = p_round_id
  );

  update public.profiles
  set chips = chips + v_round.pot,
      games_won = games_won + 1
  where id = p_winner;

  if p_reveal then
    update public.player_hands
    set is_revealed = true
    where round_id = p_round_id and is_folded = false;
  end if;

  insert into public.game_actions(round_id, room_id, user_id, action, amount)
  values (p_round_id, v_round.room_id, p_winner, 'win', v_round.pot);

  update public.game_rounds
  set status = 'finished',
      winner_id = p_winner,
      winner_hand = v_hand_name,
      current_turn = null,
      turn_deadline = null,
      finished_at = now(),
      result = jsonb_build_object(
        'reason', p_reason,
        'winners', jsonb_build_array(p_winner),
        'amount_each', v_round.pot,
        'hand', v_hand_name,
        'mode', v_mode
      )
  where id = p_round_id;

  update public.rooms set status = 'waiting' where id = v_round.room_id;
end;
$function$;
