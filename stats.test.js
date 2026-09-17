'use strict';
// Jalankan: node stats.test.js
const assert = require('assert');
const {
  ELO_BASE,
  ELO_K,
  expectedScore,
  sortMatches,
  computeStats,
  h2hRowsFor,
  favoriteClub,
  winrate,
  computeSash,
} = require('./stats.js');

// expectedScore
assert.ok(Math.abs(expectedScore(1200, 1200) - 0.5) < 1e-9, 'elo sama = 0.5');
assert.ok(expectedScore(1400, 1200) > 0.75, 'rating lebih tinggi difavoritkan');

// sortMatches: tanggal asc, urutan input stabil utk tanggal sama
const sorted = sortMatches([
  { date: '2026-01-02', tag: 'b' },
  { date: '2026-01-01', tag: 'a' },
  { date: '2026-01-02', tag: 'c' },
]);
assert.deepStrictEqual(sorted.map((m) => m.tag), ['a', 'b', 'c'], 'sort tanggal + stabil');

// computeStats dasar
const players = [
  { id: 'x', name: 'X' },
  { id: 'y', name: 'Y' },
];
const st = computeStats(players, [
  { date: '2026-01-01', a: 'x', aClub: 'A', aScore: 2, b: 'y', bClub: 'B', bScore: 1 }, // x menang
  { date: '2026-01-02', a: 'x', aClub: 'A', aScore: 0, b: 'y', bClub: 'B', bScore: 0 }, // draw
  { date: '2026-01-03', a: 'y', aClub: 'B', aScore: 3, b: 'x', bClub: 'A', bScore: 1 }, // y menang
]);

const X = st.byId.x;
const Y = st.byId.y;
assert.strictEqual(X.p, 3, 'x main 3');
assert.strictEqual(X.w, 1, 'x menang 1');
assert.strictEqual(X.d, 1, 'x draw 1');
assert.strictEqual(X.l, 1, 'x kalah 1');
assert.strictEqual(X.gf, 3, 'gf x = 3');
assert.strictEqual(X.ga, 4, 'ga x = 4');
assert.strictEqual(winrate(X), 33.3, 'winrate x');
assert.strictEqual(X.elo + Y.elo, 2 * ELO_BASE, 'elo konservatif: jumlah tetap');
assert.strictEqual(X.lastDelta, -(Y.lastDelta), 'delta terakhir simetris');

// streak: x = W, D, L -> bestStreak 1
assert.strictEqual(X.bestStreak, 1, 'best streak x = 1');
// streak: y = L, D, W -> bestStreak 1
assert.strictEqual(Y.bestStreak, 1, 'best streak y = 1');
assert.strictEqual(X.form.join(''), 'WDL', 'form x');

// winstreak beruntun
const st2 = computeStats(players, [
  { date: '2026-01-01', a: 'x', aClub: 'A', aScore: 1, b: 'y', bClub: 'B', bScore: 0 },
  { date: '2026-01-02', a: 'x', aClub: 'A', aScore: 2, b: 'y', bClub: 'B', bScore: 1 },
  { date: '2026-01-03', a: 'x', aClub: 'A', aScore: 3, b: 'y', bClub: 'B', bScore: 0 },
  { date: '2026-01-04', a: 'x', aClub: 'A', aScore: 0, b: 'y', bClub: 'B', bScore: 1 },
  { date: '2026-01-05', a: 'x', aClub: 'A', aScore: 1, b: 'y', bClub: 'B', bScore: 0 },
]);
assert.strictEqual(st2.byId.x.bestStreak, 3, 'winstreak x = 3');
assert.strictEqual(st2.byId.x.curStreak.type, 'W', 'streak skrg W');
assert.strictEqual(st2.byId.x.curStreak.len, 1, 'streak skrg reset ke 1');
assert.strictEqual(st2.byId.x.rank, 1, 'x rank 1');
assert.strictEqual(st2.byId.y.rank, 2, 'y rank 2');

// ELO pemenang rating bawah naik lebih banyak
const st3 = computeStats(players, [
  { date: '2026-01-01', a: 'x', aClub: 'A', aScore: 1, b: 'y', bClub: 'B', bScore: 0 },
]);
const st4 = computeStats(players, [
  { date: '2026-01-01', a: 'y', aClub: 'B', aScore: 0, b: 'x', aClub: 'A', bScore: 1 },
]);
// di st3 & st4 pemenang sama-sama x, cuma beda sisi home/away
assert.strictEqual(st3.byId.x.elo, st4.byId.x.elo, 'elo simetris: menang dr sisi mana pun sama');
assert.strictEqual(st3.byId.x.elo, ELO_BASE + Math.round(ELO_K * (1 - 0.5)), 'elo awal menang = +16');

// h2h
const rows = h2hRowsFor(st, 'x');
assert.strictEqual(rows.length, 1, 'x punya 1 lawan');
assert.strictEqual(rows[0].oppId, 'y', 'lawan y');
assert.strictEqual(rows[0].w, 1, 'h2h x menang 1');
assert.strictEqual(rows[0].d, 1, 'h2h x draw 1');
assert.strictEqual(rows[0].l, 1, 'h2h x kalah 1');
assert.strictEqual(rows[0].gf + rows[0].ga, 7, 'total gol h2h');

// club
const fav = favoriteClub(st.byId.x);
assert.strictEqual(fav.club, 'A', 'club andalan x');
assert.strictEqual(fav.p, 3, 'club A dipakai 3x');
const globalA = st.clubs.A;
assert.strictEqual(globalA.p, 3, 'club global A 3 match');

// match invalid di-skip, bukan crash
const st5 = computeStats(players, [
  { date: '2026-01-01', a: 'x', aClub: 'A', aScore: 1, b: 'y', bClub: 'B', bScore: 0 },
  { date: '2026-01-02', a: 'x', aClub: 'A', aScore: 1, b: 'tidakada', bClub: 'B', bScore: 0 },
  { date: '2026-01-03', a: 'x', aClub: 'A', b: 'y', bClub: 'B', bScore: 0 }, // skor hilang
]);
assert.strictEqual(st5.skipped.length, 2, '2 match invalid di-skip');
assert.strictEqual(st5.byId.x.p, 1, 'hanya 1 match valid terhitung');

// pergerakan rank: st diakhiri y menang → sebelumnya x rank 1, sekarang y rank 1
assert.strictEqual(st.byId.x.move, -1, 'x turun 1 (move -1)');
assert.strictEqual(st.byId.y.move, 1, 'y naik 1 (move +1)');
assert.strictEqual(st.byId.x.prevRank, 1, 'prevRank x = 1');
// cuma 1 match: belum ada state sebelumnya → semuanya tetap
assert.strictEqual(st3.byId.x.move, 0, '1 match: move x = 0');
assert.strictEqual(st3.byId.y.move, 0, '1 match: move y = 0');

// pergerakan dihitung vs akhir match day sebelumnya (ranking ulang penuh):
// pemain yang gak main di hari terakhir tetap bisa naik/tergeser
const players3 = [
  { id: 'x', name: 'X' },
  { id: 'y', name: 'Y' },
  { id: 'z', name: 'Z' },
];
const st6 = computeStats(players3, [
  { date: '2026-01-01', a: 'y', aClub: 'B', aScore: 1, b: 'x', bClub: 'A', bScore: 0 }, // hari 1: y menang → y1 z2 x3
  { date: '2026-01-02', a: 'x', aClub: 'A', aScore: 2, b: 'z', bClub: 'C', bScore: 1 }, // hari 2: y gak main
]);
assert.strictEqual(st6.byId.y.rank, 1, 'y tetap rank 1');
assert.strictEqual(st6.byId.y.move, 0, 'y gak main, gak bergerak');
assert.strictEqual(st6.byId.x.move, 1, 'x naik 1 walau lewat 2 hari');
assert.strictEqual(st6.byId.z.move, -1, 'z turun 1');
assert.strictEqual(st6.byId.x.prevRank, 3, 'prevRank x = rank akhir hari sebelumnya');

// records
assert.strictEqual(st5.records.biggestWin.a + st5.records.biggestWin.b, 'xy', 'biggestWin tercatat');
assert.strictEqual(st5.records.bestStreak.len, 1, 'record streak');
assert.strictEqual(st5.lastMatch.date, '2026-01-01', 'lastMatch = match valid terakhir');

// worstStreak: y kalah 3x beruntun di st2? (y: L L L W L -> worst 3)
assert.strictEqual(st2.byId.y.worstStreak, 3, 'losing streak y = 3');
assert.strictEqual(st2.records.worstStreak.id, 'y', 'record losing streak y');
// st: x WDL -> worst 1, y LDW -> worst 1
assert.strictEqual(st.byId.x.worstStreak, 1, 'losing streak x = 1');

// tightH2h: st x-y = 1W 1D 1L (margin 0, 3 meetings) -> terketat
assert.strictEqual(st.records.tightH2h.ids.join('|'), 'x|y', 'tightest rivalry x vs y');
assert.strictEqual(st.records.tightH2h.margin, 0, 'margin h2h st = 0');
// st2 x-y = 4W 0D 1L (margin 3) -> margin 3
assert.strictEqual(st2.records.tightH2h.margin, 3, 'margin h2h st2 = 3');
// 1 match saja tidak lolos syarat >= 2 meeting
assert.strictEqual(st3.records.tightH2h, null, '1 meeting: tidak ada tightH2h');

// daily: pemuncak ELO di akhir tiap tanggal
// st: 01 x menang, 02 draw (x masih atas), 03 y menang → y salip
assert.deepStrictEqual(st.daily.map((d) => `${d.date}:${d.id}`), [
  '2026-01-01:x', '2026-01-02:x', '2026-01-03:y',
], 'daily: x,x,lalu y');
assert.strictEqual(st.daily[0].elo, ELO_BASE + 16, 'elo daily hari-1 = +16');
assert.strictEqual(st.daily[2].elo, st.byId.y.elo, 'elo daily terakhir = elo akhir y');
// st2: x menang hampir semua → x di atas 5 hari
assert.deepStrictEqual(st2.daily.map((d) => d.id), ['x', 'x', 'x', 'x', 'x'], 'daily st2 semua x');
assert.strictEqual(st2.daily[4].elo, st2.byId.x.elo, 'elo daily terakhir = elo akhir x');
// st3: 1 match 1 hari
assert.deepStrictEqual(st3.daily.map((d) => d.id), ['x'], 'daily 1 hari = x');
// st5: tanggal dgn match invalid tetap pakai match valid saja
assert.deepStrictEqual(st5.daily.map((d) => d.date), ['2026-01-01'], 'daily skip match invalid');

// eloDelta per match: gain ELO sisi a (positif = a untung)
assert.strictEqual(st3.lastMatch.eloDelta, 16, 'eloDelta match pertama = +16 utk pemenang');
assert.strictEqual(st.lastMatch.eloDelta, 17, 'eloDelta match terakhir st: a (y) menang +17');

// computeSash: sabuk king-of-the-hill, bukan ELO
// x menang perdana → pertahankan vs draw → y rebut → y pertahankan
const sash = computeSash([
  { date: '2026-01-01', a: 'x', aScore: 2, b: 'y', bScore: 1 }, // x juara perdana
  { date: '2026-01-02', a: 'x', aScore: 0, b: 'y', bScore: 0 }, // seri → x retain (defense)
  { date: '2026-01-03', a: 'z', aScore: 3, b: 'w', bScore: 1 }, // tanpa juara → tak berubah
  { date: '2026-01-04', a: 'y', aScore: 3, b: 'x', bScore: 1 }, // y rebut sabuk
  { date: '2026-01-05', a: 'y', aScore: 2, b: 'z', bScore: 0 }, // y pertahankan
]);
assert.strictEqual(sash.length, 2, 'dua era sabuk');
assert.deepStrictEqual(sash.map((r) => r.id), ['x', 'y'], 'x lalu y');
assert.strictEqual(sash[0].defenses, 1, 'x 1 defense (seri retain)');
assert.strictEqual(sash[0].from, null, 'x juara perdana');
assert.strictEqual(sash[0].lost, '2026-01-04', 'x lepas sabuk 01-04');
assert.strictEqual(sash[1].from, 'x', 'y rebut dari x');
assert.strictEqual(sash[1].defenses, 1, 'y 1 defense');
assert.strictEqual(sash[1].current, true, 'y juara saat ini');
// juara tak main → sabuk diam (match z-w tidak bikin era baru)
assert.strictEqual(computeSash([]).length, 0, 'no match no sash');

console.log('✓ semua test lolos');
