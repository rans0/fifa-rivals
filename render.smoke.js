'use strict';
// Jalankan: node render.smoke.js
// Boot app.js + stats.js di context VM dgn stub DOM minimal — nangkep crash
// render yang gak ketemu di stats.test.js (mis: TypeError di template string).
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const store = {};
const el = (sel) =>
  (store[sel] ||= {
    innerHTML: '', value: '', textContent: '', hidden: false,
    addEventListener() {}, classList: { toggle() {}, add() {} },
    querySelectorAll: () => [], closest: () => ({ hidden: false }),
    scrollIntoView() {},
  });

const ctx = {
  document: {
    querySelector: el, querySelectorAll: () => [],
    documentElement: { style: { setProperty() {} } },
    fonts: { ready: Promise.resolve() },
    createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }), toBlob() {} }),
  },
  location: { hash: '#/matches' },
  window: { addEventListener() {} },
  Image: class { set src(v) { setTimeout(() => this.onerror && this.onerror()); } },
  setTimeout, clearTimeout, console, URL, Blob: class {},
  fetch: async () => ({ json: async () => JSON.parse(fs.readFileSync('data.json')) }),
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('stats.js', 'utf8'), ctx, { filename: 'stats.js' });
vm.runInContext(fs.readFileSync('app.js', 'utf8'), ctx, { filename: 'app.js' });

setTimeout(() => {
  const html = store['#match-list'].innerHTML;
  const matches = JSON.parse(fs.readFileSync('data.json')).matches;
  const days = new Set(matches.map((m) => m.date));
  assert.ok((html.match(/MATCH DAY/g) || []).length === days.size, 'semua match day ke-render');
  assert.ok((html.match(/class="match/g) || []).length === matches.length, 'semua baris match ke-render');
  assert.ok((store['#crown'].innerHTML.match(/class="reign/g) || []).length >= 1, 'crown history ke-render');
  assert.ok((store['#sash'].innerHTML.match(/class="reign/g) || []).length >= 1, 'slempang ke-render');
  assert.ok(store['#records'].innerHTML.includes('rec'), 'records ke-render');
  assert.ok(store['#banner'].innerHTML.includes('champ'), 'banner ke-render');
  assert.ok(store['#h2h-table'].innerHTML.includes('tbody'), 'h2h ke-render');
  console.log('✓ render smoke lolos');
}, 300);
