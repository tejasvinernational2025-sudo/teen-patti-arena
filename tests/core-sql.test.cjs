const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const user = '00000000-0000-0000-0000-000000000001';
const round = '00000000-0000-0000-0000-000000000002';
const room = '00000000-0000-0000-0000-000000000003';

test('internal PostgreSQL turn guards and settlement access', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table rooms(id uuid primary key, game_mode text, status text);
      create table game_rounds(id uuid primary key, room_id uuid, status text,
        current_turn uuid, turn_deadline timestamptz, pot bigint default 0,
        current_bet bigint default 100, variant_data jsonb, turn_seq int default 1,
        winner_id uuid, winner_hand text, finished_at timestamptz, result jsonb);
      create table player_hands(id uuid default gen_random_uuid(), round_id uuid,
        room_id uuid, user_id uuid, is_folded boolean default false,
        is_seen boolean default false, is_revealed boolean default false,
        cards jsonb, bet_amount bigint default 0);
      create table profiles(id uuid primary key, chips bigint, games_played int default 0, games_won int default 0);
      create table room_players(room_id uuid,user_id uuid,seat_no smallint);
      create table side_show_requests(round_id uuid,status text);
      create table game_actions(round_id uuid,room_id uuid,user_id uuid,action text,amount bigint);
      insert into rooms values('${room}','classic','playing');
      insert into game_rounds(id,room_id,status,current_turn,turn_deadline)
        values('${round}','${room}','playing','${user}',now()+interval '30 seconds');
      insert into player_hands(round_id,room_id,user_id) values('${round}','${room}','${user}');
      insert into profiles(id,chips) values('${user}',1000);
      select set_config('request.jwt.claim.sub','${user}',false);
    `);
    await db.exec(read('tests/fixtures/settlement-baseline.sql'));
    await db.exec(read('supabase/internal/core-turns.sql'));
    const action = async value => {
      await db.exec('set role authenticated');
      try { return await db.query('select public.take_online_action($1,$2)', [round,value]); }
      finally { await db.exec('reset role'); }
    };
    const update = sql => db.exec(sql);
    await t.test('null action rejected', () => assert.rejects(action(null), /Invalid action/));
    await t.test('missing turn owner rejected', async () => {
      await update('update game_rounds set current_turn=null');
      await assert.rejects(action('seen'), /Wait for your turn/);
      await update(`update game_rounds set current_turn='${user}'`);
    });
    await t.test('321 cannot invoke ordinary betting actions', async () => {
      await update("update rooms set game_mode='321'");
      await assert.rejects(action('blind'), /321 arrangement/);
      await update("update rooms set game_mode='classic'");
    });
    await t.test('expired turn rejected', async () => {
      await update("update game_rounds set turn_deadline=now()-interval '1 second'");
      await assert.rejects(action('seen'), /expired or paused/);
      await update("update game_rounds set turn_deadline=now()+interval '30 seconds'");
    });
    await t.test('pending side show blocks ordinary actions', async () => {
      await update(`insert into side_show_requests values('${round}','pending')`);
      await assert.rejects(action('pack'), /Side Show decision pending/);
      await update('delete from side_show_requests');
    });
    await t.test('repeated seen does not extend deadline or duplicate action', async () => {
      const before = (await db.query('select turn_deadline::text as deadline from game_rounds')).rows[0].deadline;
      await action('seen'); await action('seen');
      assert.equal((await db.query('select turn_deadline::text as deadline from game_rounds')).rows[0].deadline,before);
      assert.equal((await db.query('select count(*)::int as n from game_actions')).rows[0].n,1);
    });
    await t.test('insufficient chips rejects without debiting the wallet', async () => {
      await update('update profiles set chips=50');
      await assert.rejects(action('chaal'), /Not enough chips/);
      assert.equal((await db.query('select chips::int from profiles')).rows[0].chips,50);
      await update('update profiles set chips=1000');
    });
    await t.test('valid chaal debits once and advances to the next seat', async () => {
      const opponent = '00000000-0000-0000-0000-000000000004';
      await update(`insert into player_hands(round_id,room_id,user_id) values('${round}','${room}','${opponent}');
        insert into room_players values('${room}','${user}',1),('${room}','${opponent}',2);`);
      await action('chaal');
      assert.equal((await db.query('select chips::int from profiles')).rows[0].chips,800);
      const result = (await db.query('select pot::int,current_turn from game_rounds')).rows[0];
      assert.equal(result.pot,200);
      assert.equal(result.current_turn,opponent);
      await assert.rejects(action('chaal'), /Wait for your turn/);
    });
    await t.test('players and guests cannot directly settle a round', async () => {
      for (const role of ['anon','authenticated']) {
        await update(`set role ${role}`);
        await assert.rejects(db.query('select public.finish_online_round_single($1,$2,$3,false)', [round,user,'forged']), /permission denied/);
        await update('reset role');
      }
      assert.equal((await db.query('select chips::int from profiles')).rows[0].chips,800);
    });
  } finally { await db.close(); }
});
