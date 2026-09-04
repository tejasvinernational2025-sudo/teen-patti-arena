const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
const me='00000000-0000-0000-0000-000000000011';
const other='00000000-0000-0000-0000-000000000012';

test('profile security with legacy broad grants and policies', async t => {
  const db=new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      create table public.profiles(id uuid primary key references auth.users,
        username text not null default 'Player', avatar_url text,
        chips bigint not null default 25000, games_played int default 0,
        games_won int default 0, xp bigint default 0, level int default 1,
        last_spin_date date, created_at timestamptz default now(), updated_at timestamptz default now());
      grant all on public.profiles to anon,authenticated;
      grant update(chips),insert(chips) on public.profiles to public;
      alter table public.profiles enable row level security;
      create policy legacy_read on public.profiles for select to authenticated using(true);
      create policy legacy_write on public.profiles for all to authenticated using(true) with check(true);
      insert into auth.users values('${me}'),('${other}');
      insert into public.profiles(id,username,chips) values('${other}','Other',1000);
      select set_config('request.jwt.claim.sub','${me}',false);
    `);
    const sql=fs.readFileSync(path.join(__dirname,'../supabase/internal/profile-security.sql'),'utf8');
    await db.exec(sql);
    await db.exec(sql); // permission repair must be repeatable
    async function as(role, query, params=[]) {
      await db.exec(`set role ${role}`);
      try { return await db.query(query,params); }
      finally { await db.exec('reset role'); }
    }
    await t.test('new user gets server-default chips through authenticated RPC',async()=>{
      const r=await as('authenticated','select public.ensure_player_profile($1) as p',['New Player']);
      assert.equal(r.rows[0].p.chips,25000);
      assert.equal(r.rows[0].p.id,me);
    });
    await t.test('repeated profile creation preserves balance and name',async()=>{
      await db.query('update profiles set chips=1234 where id=$1',[me]);
      const r=await as('authenticated','select public.ensure_player_profile($1) as p',['Changed']);
      assert.equal(r.rows[0].p.chips,1234);
      assert.equal(r.rows[0].p.username,'New Player');
    });
    for(const field of ['chips','xp','games_played','games_won','level']) {
      await t.test(`direct ${field} mutation denied`,async()=>{
        await assert.rejects(as('authenticated',`update profiles set ${field}=999999 where id=$1`,[me]),/permission denied/);
      });
    }
    await t.test('profile deletion, insertion and truncation denied',async()=>{
      for(const query of ['delete from profiles','truncate profiles',
        `insert into profiles(id,username,chips) values('${me}','Fake',999999)`]) {
        await assert.rejects(as('authenticated',query),/permission denied/);
      }
    });
    await t.test('own name/avatar allowed; other player remains unchanged',async()=>{
      await as('authenticated','update profiles set username=$1,avatar_url=$2 where id=$3',['My Name','avatar.png',me]);
      const r=await as('authenticated','update profiles set username=$1 where id=$2 returning id',['Hacked',other]);
      assert.equal(r.rows.length,0);
      assert.equal((await db.query('select username from profiles where id=$1',[other])).rows[0].username,'Other');
    });
    await t.test('guest cannot create a profile or edit chips',async()=>{
      await assert.rejects(as('anon','select public.ensure_player_profile()'),/permission denied/);
      await assert.rejects(as('anon','update profiles set chips=999999'),/permission denied/);
    });
    await t.test('missing authenticated identity rejected',async()=>{
      await db.exec("select set_config('request.jwt.claim.sub','',false)");
      await assert.rejects(as('authenticated','select public.ensure_player_profile()'),/Login required/);
    });
  } finally { await db.close(); }
});
