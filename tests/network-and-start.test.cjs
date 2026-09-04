const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

function worker() {
  const handlers = {}, deleted = [], stored = [];
  const cache = { match: async () => undefined, put: async (...args) => stored.push(args) };
  const context = {
    URL, Response,
    self: { registration: { scope: 'https://example.com/game/' },
      addEventListener: (name, fn) => { handlers[name] = fn; },
      skipWaiting() {}, clients: { claim() {} } },
    caches: { keys: async () => ['unrelated-app', 'tpa-live-v102', 'tpa-static-v103'],
      delete: async key => deleted.push(key), open: async () => cache },
    fetch: async () => { throw new Error('offline'); }
  };
  vm.runInNewContext(read('sw.js'), context);
  function request(url, options = {}) {
    let response;
    const waits = [];
    handlers.fetch({ request: new Request(url, options),
      respondWith: value => { response = value; }, waitUntil: value => waits.push(value) });
    return { response, waits };
  }
  return { handlers, deleted, stored, context, request };
}

test('worker never intercepts API, auth, cross-origin or out-of-scope requests', () => {
  const w = worker();
  for (const url of ['https://example.com/game/api/wallet', 'https://example.com/other/index.html',
    'https://project.supabase.co/rest/v1/profiles', 'https://example.com/game/?code=secret']) {
    assert.equal(w.request(url).response, undefined);
  }
  assert.equal(w.request('https://example.com/game/index.html', {
    headers: { authorization: 'Bearer test' }
  }).response, undefined);
  assert.equal(w.request('https://example.com/game/index.html', { method: 'POST' }).response, undefined);
});

test('worker provides explicit offline response and leaves unrelated caches alone', async () => {
  const w = worker();
  const response = await w.request('https://example.com/game/index.html').response;
  assert.equal(response.status, 503);
  assert.match(await response.text(), /Reconnect/);
  let activation;
  w.handlers.activate({ waitUntil: value => { activation = value; } });
  await activation;
  assert.deepEqual(w.deleted, ['tpa-live-v102']);
});

test('worker caches public static files but not private responses', async () => {
  const w = worker();
  for (const control of ['public', 'private', 'no-store']) {
    w.context.fetch = async () => ({ ok: true, redirected: false, type: 'basic',
      headers: new Headers({ 'cache-control': control }), clone: () => 'copy' });
    const event = w.request('https://example.com/game/rooms.js');
    await event.response;
    await Promise.all(event.waits);
  }
  assert.equal(w.stored.length, 1);
});

function startHarness() {
  const source = read('rooms.js');
  const online = { roomId: 'room-1' }, calls = [], errors = [];
  let finish, refreshes = 0;
  const ctx = vm.createContext({ online, renderRound() {},
    showError: (...args) => errors.push(args), refreshAll: async () => { refreshes++; },
    db: { rpc: (...args) => { calls.push(args); return new Promise(resolve => { finish = resolve; }); } }
  });
  vm.runInContext(source.slice(source.indexOf('  async function startRoundOnline()'),
    source.indexOf('  async function act(action)')), ctx);
  return { online, calls, errors, ctx, finish: value => finish(value), refreshes: () => refreshes };
}

test('start round suppresses duplicates and unlocks after a server error', async () => {
  const h = startHarness();
  const pending = h.ctx.startRoundOnline();
  await h.ctx.startRoundOnline();
  assert.equal(h.calls.length, 1);
  h.finish({ error: { message: 'Not enough players' } });
  await pending;
  assert.equal(h.online.startBusy, false);
  assert.equal(h.errors.length, 1);
});

test('late start response does not refresh a different room', async () => {
  const h = startHarness();
  const pending = h.ctx.startRoundOnline();
  h.online.roomId = 'room-2';
  h.finish({ error: null });
  await pending;
  assert.equal(h.refreshes(), 0);
  assert.equal(h.online.startBusy, false);
});
