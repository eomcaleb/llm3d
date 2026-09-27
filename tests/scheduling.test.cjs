// Run with node --test tests/scheduling.test.cjs; no installed dependencies required.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function harness() {
  const frames = [];
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { hidden: false, getClientRects: () => [1] });
    return elements.get(id);
  };
  const context = vm.createContext({
    console, setTimeout, clearTimeout, performance,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => {},
    window: {},
    document: { hidden: false, getElementById: element, addEventListener() {} }
  });
  const source = fs.readFileSync('assets/app.js', 'utf8').split('// ---------- start ----------')[0];
  vm.runInContext(source, context);
  return { run: code => vm.runInContext(code, context), async frame() {
    frames.splice(0).forEach(fn => fn(performance.now()));
    for (let i = 0; i < 12; i++) await Promise.resolve();
  }};
}
test('bursts share a redraw and wait for an in-flight render', async () => {
  const h = harness();
  h.run('var renders = 0, release; renderScene = () => { renders++; return new Promise(r => release = r); }; var first = draw(); var same = draw();');
  assert.equal(h.run('first === same'), true);
  await h.frame();
  assert.equal(h.run('renders'), 1);
  h.run('draw(); draw();');
  await h.frame();
  assert.equal(h.run('renders'), 1);
  h.run('release()');
  await h.frame(); await h.frame();
  assert.equal(h.run('renders'), 2);
  h.run('release()');
});
test('camera frames skip busy plots and hidden documents', async () => {
  const h = harness();
  h.run('var moves = 0; var Plotly = { relayout: () => { moves++; } }; camMove = { from: {r:1,az:0,el:0}, to: {r:1,az:1,el:1}, dAz:1, t0:0, ms:1000 }; plotBusy = true; loop(100);');
  assert.equal(h.run('moves'), 0);
  h.run('plotBusy = false; document.hidden = true; loop(200);');
  assert.equal(h.run('moves'), 0);
  h.run('document.hidden = false; loop(300);');
  await h.frame();
  assert.equal(h.run('moves'), 1);
});
test('secondary charts serialize and defer hidden panels until shown', async () => {
  const h = harness();
  h.run(`var calls = [], finish;
    document.getElementById('hidden').getClientRects = () => [];
    queueChart('hidden', () => calls.push('hidden'));
    queueChart('a', () => { calls.push('a'); return new Promise(r => finish = r); });
    queueChart('b', () => calls.push('b'));`);
  await h.frame();
  assert.equal(h.run('calls.join()'), 'a');
  await h.frame();
  assert.equal(h.run('calls.join()'), 'a');
  h.run('finish()');
  await h.frame(); await h.frame();
  assert.equal(h.run('calls.join()'), 'a,b');
  h.run("document.getElementById('hidden').getClientRects = () => [1]; flushCharts();");
  await h.frame();
  assert.equal(h.run('calls.join()'), 'a,b,hidden');
});
