const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../auth.js'),'utf8');
function profileHarness(existing) {
  const calls=[];
  const ctx=vm.createContext({readProfile:async()=>existing,preferredUserName:()=> 'Player',
    db:{rpc:async(...args)=>{calls.push(args);return {data:{id:'server-user',chips:25000},error:null};}}});
  vm.runInContext(source.slice(source.indexOf('  async function ensureProfile('),source.indexOf('  async function signInWithFacebook(')),ctx);
  return {ctx,calls};
}
test('profile fallback uses server identity and never sends chips or user ID',async()=>{
  const h=profileHarness(null);
  const p=await h.ctx.ensureProfile({id:'client-user'});
  assert.equal(p.id,'server-user');
  assert.equal(h.calls[0][0],'ensure_player_profile');
  assert.deepEqual(Object.keys(h.calls[0][1]),['p_username']);
});
test('existing profile bypasses creation and preserves balance',async()=>{
  const h=profileHarness({id:'existing',chips:123});
  assert.equal((await h.ctx.ensureProfile({id:'existing'})).chips,123);
  assert.equal(h.calls.length,0);
});
test('player name is text, not executable header markup',()=>{
  const span={},logout={};
  const pill={querySelector:()=>span};
  const ctx=vm.createContext({
    document:{querySelector:selector=>selector==='.header-actions'?{}:null,
      getElementById:id=>id==='tpaAuthUserPill'?pill:logout},
    preferredUserName:()=>'',db:{auth:{signOut:async()=>{}}}
  });
  vm.runInContext(source.slice(source.indexOf('  function installUserPill('),source.indexOf('  async function applySession(')),ctx);
  const name='<img src=x onerror=alert(1)>';
  ctx.installUserPill({username:name},{id:'user'});
  assert.equal(span.textContent,name);
  assert.ok(!pill.innerHTML.includes(name));
});
