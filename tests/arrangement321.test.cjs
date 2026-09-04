const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../rooms.js'), 'utf8');

function setup() {
  const nodes = {};
  function element() {
    return {
      children: [], style: {}, classList: { add() {}, remove() {} },
      set innerHTML(value) { this.children = []; },
      setAttribute() {}, appendChild(child) { this.children.push(child); },
      insertAdjacentElement(_, child) { nodes['#' + child.id] = child; }
    };
  }
  for (const id of ['#dealBtn', '#actionBar', '#roundLabel']) nodes[id] = element();
  const online = {
    currentRound: { id: 'round-1' },
    myHand: { cards: Array.from({ length: 6 }, (_, i) => ({ r: i + 2, s: 'S' })) }
  };
  const calls = [];
  let resolve;
  const context = vm.createContext({
    online, document: { createElement: element }, $q: id => nodes[id],
    db: { rpc: (...args) => { calls.push(args); return new Promise(r => { resolve = r; }); } },
    refreshAll: async () => {}, showError: () => {}, renderRound: () => {}
  });
  vm.runInContext(source.slice(source.indexOf('  function show321Controls()'), source.indexOf('  function renderRound()')), context);
  return { context, online, nodes, calls, finish: value => resolve(value) };
}

test('321 swaps across groups, preserves edits on refresh and resets for next round', () => {
  const s = setup();
  s.context.show321Controls();
  let groups = s.nodes['#tpa321Controls'].children[0];
  groups.children[0].children[0].onclick();
  groups = s.nodes['#tpa321Controls'].children[0];
  groups.children[2].children[0].onclick();
  assert.deepEqual(Array.from(s.online.arrangement321), [6,2,3,4,5,1]);
  s.context.show321Controls();
  assert.equal(s.online.arrangement321[0], 6);
  s.online.currentRound.id = 'round-2';
  s.context.show321Controls();
  assert.deepEqual(Array.from(s.online.arrangement321), [1,2,3,4,5,6]);
});

test('321 submits exact server positions and suppresses duplicate requests', async () => {
  const s = setup();
  s.context.show321Controls();
  const submit = s.nodes['#tpa321Controls'].children[1];
  const pending = submit.onclick();
  await submit.onclick();
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0][0], 'submit_321_arrangement');
  assert.deepEqual(Array.from(s.calls[0][1].p_order), [1,2,3,4,5,6]);
  s.finish({ error: null });
  await pending;
  assert.equal(s.online.arrangementBusy, false);
});
