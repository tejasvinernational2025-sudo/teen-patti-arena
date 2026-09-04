const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const me='00000000-0000-0000-0000-000000000021';
const other='00000000-0000-0000-0000-000000000022';
const outsider='00000000-0000-0000-0000-000000000023';
const round='00000000-0000-0000-0000-000000000024';
const room='00000000-0000-0000-0000-000000000025';

test('browser loads hands only through the safe server reader',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../rooms.js'),'utf8');
 const section=source.slice(source.indexOf('  async function loadRound()'),source.indexOf('  function clearSeat('));
 assert.match(section,/db\.rpc\('get_round_hands'/);
 assert.doesNotMatch(section,/from\('player_hands'\)/);
});

test('server-authorized hand visibility',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated;
   create table rooms(id uuid primary key,game_mode text);
   create table game_rounds(id uuid primary key,room_id uuid);
   create table room_players(room_id uuid,user_id uuid,is_active boolean);
   create table player_hands(id uuid default gen_random_uuid(),round_id uuid,room_id uuid,user_id uuid,
    cards jsonb,is_seen boolean default false,is_folded boolean default false,is_revealed boolean default false,
    bet_amount bigint default 0,variant_choice jsonb,created_at timestamptz default now());
   grant all on player_hands to anon,authenticated;
   grant select(cards),select(variant_choice) on player_hands to public;
   insert into rooms values('${room}','classic');insert into game_rounds values('${round}','${room}');
   insert into room_players values('${room}','${me}',true),('${room}','${other}',true),('${room}','${outsider}',false);
   insert into player_hands(round_id,room_id,user_id,cards,variant_choice) values
    ('${round}','${room}','${me}','[{"r":14,"s":"S"}]','{"ready":true,"order":[1,2,3,4,5,6]}'),
    ('${round}','${room}','${other}','[{"r":13,"s":"H"}]','{"ready":true,"order":[6,5,4,3,2,1]}');
   select set_config('request.jwt.claim.sub','${me}',false);`);
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/internal/hand-privacy.sql'),'utf8');
  await db.exec(sql);await db.exec(sql);
  async function as(role,q,p=[]){await db.exec(`set role ${role}`);try{return await db.query(q,p)}finally{await db.exec('reset role')}}
  const hands=()=>as('authenticated','select * from public.get_round_hands($1) order by user_id',[round]);
  await t.test('blind cards and arrangement secrets stay on server',async()=>{
   const rows=(await hands()).rows;
   assert.equal(rows[0].cards,null);assert.equal(rows[1].cards,null);
   assert.deepEqual(rows[1].variant_choice,{ready:true});
  });
  await t.test('own classic cards appear only after seen',async()=>{
   await db.query('update player_hands set is_seen=true where user_id=$1',[me]);
   const mine=(await hands()).rows.find(x=>x.user_id===me);
   assert.equal(mine.cards[0].r,14);
  });
  await t.test('321 player receives own six-card arrangement data',async()=>{
   await db.exec("update rooms set game_mode='321';update player_hands set is_seen=false");
   const rows=(await hands()).rows;
   assert.ok(rows.find(x=>x.user_id===me).cards);
   assert.equal(rows.find(x=>x.user_id===other).cards,null);
  });
  await t.test('revealed opponent cards appear after showdown',async()=>{
   await db.query('update player_hands set is_revealed=true where user_id=$1',[other]);
   const theirs=(await hands()).rows.find(x=>x.user_id===other);
   assert.equal(theirs.cards[0].r,13);assert.ok(theirs.variant_choice.order);
  });
  await t.test('inactive outsider and guest cannot call safe reader',async()=>{
   await db.exec(`select set_config('request.jwt.claim.sub','${outsider}',false)`);
   await assert.rejects(hands(),/not an active player/);
   await assert.rejects(as('anon','select * from public.get_round_hands($1)',[round]),/permission denied/);
   await db.exec(`select set_config('request.jwt.claim.sub','${me}',false)`);
  });
  await t.test('direct secret columns are denied but status columns remain readable',async()=>{
   await assert.rejects(as('authenticated','select cards from player_hands'),/permission denied/);
   await assert.rejects(as('authenticated','select variant_choice from player_hands'),/permission denied/);
   const status=await as('authenticated','select user_id,is_seen,is_folded from player_hands');
   assert.equal(status.rows.length,2);
  });
 }finally{await db.close()}
});
