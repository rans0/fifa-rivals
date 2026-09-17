'use strict';
// Pure compute — shared browser (script tag) & node (test). No DOM here.

const ELO_BASE = 1200;
const ELO_K = 32;

function expectedScore(ra, rb) {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

function sortMatches(matches) {
  return matches
    .map((m, i) => ({ m, i }))
    .sort((x, y) => {
      if (x.m.date !== y.m.date) return x.m.date < y.m.date ? -1 : 1;
      return x.i - y.i; // stabil: urutan input utk tanggal sama
    })
    .map((e) => e.m);
}

function newPlayerStat(p) {
  return {
    id: p.id,
    name: p.name,
    elo: ELO_BASE,
    peakElo: ELO_BASE,
    lastDelta: 0,
    rank: null,
    p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0,
    eloHist: [ELO_BASE],
    form: [], // 'W' | 'D' | 'L'
    curStreak: { type: null, len: 0 },
    bestStreak: 0, // winstreak terpanjang
    worstStreak: 0, // losing streak terpanjang
    clubs: {}, // nama club -> {club,p,w,d,l,gf,ga}
  };
}

function applyResult(st, r, gf, ga) {
  st.p++;
  st.gf += gf;
  st.ga += ga;
  if (r === 'W') st.w++;
  else if (r === 'D') st.d++;
  else st.l++;
  st.form.push(r);
  if (st.curStreak.type === r) st.curStreak.len++;
  else st.curStreak = { type: r, len: 1 };
  if (r === 'W' && st.curStreak.len > st.bestStreak) st.bestStreak = st.curStreak.len;
  if (r === 'L' && st.curStreak.len > st.worstStreak) st.worstStreak = st.curStreak.len;
}

function bumpClub(store, club, gf, ga) {
  const c = (store[club] = store[club] || { club, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });
  c.p++;
  c.gf += gf;
  c.ga += ga;
  if (gf > ga) c.w++;
  else if (gf === ga) c.d++;
  else c.l++;
}

function h2hKey(a, b) {
  return [a, b].sort().join('|');
}

function winrate(s) {
  return s.p ? Math.round((s.w / s.p) * 1000) / 10 : 0;
}

function computeStats(players, matches) {
  const byId = {};
  players.forEach((p) => {
    byId[p.id] = newPlayerStat(p);
  });

  const h2h = {}; // key -> {ids:[x,y], wX,d,wY, gX,gY, matches:[]}
  const clubs = {}; // aggregate global per club
  const skipped = [];
  const valid = [];

  const daily = []; // {date, id, elo} — pemuncak ELO di akhir tiap tanggal main
  let curDate = null;
  const snapDay = () => {
    let top = null;
    for (const p of players) if (top === null || byId[p.id].elo > byId[top].elo) top = p.id;
    daily.push({ date: curDate, id: top, elo: byId[top].elo });
  };

  for (const m of sortMatches(matches)) {
    const A = byId[m.a];
    const B = byId[m.b];
    const ok =
      A && B &&
      A !== B &&
      typeof m.aScore === 'number' &&
      typeof m.bScore === 'number' &&
      m.aScore >= 0 && m.bScore >= 0;
    if (!ok) {
      skipped.push(m);
      continue;
    }
    valid.push(m);

    if (curDate !== null && m.date !== curDate) snapDay(); // tutup tanggal sebelumnya
    curDate = m.date;

    const aWin = m.aScore > m.bScore;
    const draw = m.aScore === m.bScore;

    // ELO
    const ea = expectedScore(A.elo, B.elo);
    const dA = Math.round(ELO_K * ((draw ? 0.5 : aWin ? 1 : 0) - ea));
    A.elo += dA;
    B.elo -= dA;
    A.lastDelta = dA;
    B.lastDelta = -dA;
    A.eloHist.push(A.elo);
    B.eloHist.push(B.elo);
    if (A.elo > A.peakElo) A.peakElo = A.elo;
    if (B.elo > B.peakElo) B.peakElo = B.elo;

    applyResult(A, aWin ? 'W' : draw ? 'D' : 'L', m.aScore, m.bScore);
    applyResult(B, aWin ? 'L' : draw ? 'D' : 'W', m.bScore, m.aScore);
    bumpClub(A.clubs, m.aClub || '?', m.aScore, m.bScore);
    bumpClub(B.clubs, m.bClub || '?', m.bScore, m.aScore);
    bumpClub(clubs, m.aClub || '?', m.aScore, m.bScore);
    bumpClub(clubs, m.bClub || '?', m.bScore, m.aScore);

    // H2H — simpan dari perspektif ids terurut
    const ids = [m.a, m.b].sort();
    const k = ids.join('|');
    const h = (h2h[k] = h2h[k] || { ids, wX: 0, d: 0, wY: 0, gX: 0, gY: 0, matches: [] });
    const sX = m.a === ids[0] ? m.aScore : m.bScore;
    const sY = m.a === ids[0] ? m.bScore : m.aScore;
    if (sX > sY) h.wX++;
    else if (sX === sY) h.d++;
    else h.wY++;
    h.gX += sX;
    h.gY += sY;
    h.matches.push(m);
  }

  const list = Object.values(byId);
  [...list]
    .sort((x, y) => y.elo - x.elo)
    .forEach((s, i) => {
      s.rank = i + 1;
    });

  // Pergerakan rank vs state sebelum match terakhir: revert ELO dua pemain
  // di match terakhir (elo - lastDelta), ranking ulang. move > 0 naik, < 0 turun.
  const last = valid[valid.length - 1] || null;
  if (valid.length > 1) {
    const prevElo = new Map(list.map((s) => [s.id, s.elo]));
    prevElo.set(last.a, byId[last.a].elo - byId[last.a].lastDelta);
    prevElo.set(last.b, byId[last.b].elo - byId[last.b].lastDelta);
    [...list]
      .sort((x, y) => prevElo.get(y.id) - prevElo.get(x.id))
      .forEach((s, i) => {
        s.prevRank = i + 1;
        s.move = i + 1 - s.rank;
      });
  } else {
    list.forEach((s) => {
      s.prevRank = s.rank;
      s.move = 0;
    });
  }

  // Records
  let biggestWin = null;
  let topScoring = null;
  for (const m of valid) {
    const margin = Math.abs(m.aScore - m.bScore);
    if (!biggestWin || margin > Math.abs(biggestWin.aScore - biggestWin.bScore)) biggestWin = m;
    if (!topScoring || m.aScore + m.bScore > topScoring.aScore + topScoring.bScore) topScoring = m;
  }
  let mostPlayedPair = null;
  for (const h of Object.values(h2h)) {
    if (!mostPlayedPair || h.matches.length > mostPlayedPair.count)
      mostPlayedPair = { ids: h.ids, count: h.matches.length };
  }
  let bestStreak = null;
  for (const s of list) {
    if (s.bestStreak > 0 && (!bestStreak || s.bestStreak > bestStreak.len))
      bestStreak = { id: s.id, name: s.name, len: s.bestStreak };
  }
  let worstStreak = null;
  for (const s of list) {
    if (s.worstStreak > 0 && (!worstStreak || s.worstStreak > worstStreak.len))
      worstStreak = { id: s.id, name: s.name, len: s.worstStreak };
  }
  // Rival terketat: h2h paling seimbang (min 2 match), selisih menang terkecil;
  // seri margin -> lebih banyak meeting menang.
  let tightH2h = null;
  for (const h of Object.values(h2h)) {
    if (h.matches.length < 2) continue;
    const margin = Math.abs(h.wX - h.wY);
    if (!tightH2h || margin < tightH2h.margin ||
        (margin === tightH2h.margin && h.matches.length > tightH2h.count))
      tightH2h = { ids: h.ids, margin, count: h.matches.length, wX: h.wX, d: h.d, wY: h.wY };
  }

  const lastMatch = valid[valid.length - 1] || null;
  if (curDate !== null) snapDay(); // tanggal terakhir

  return {
    byId,
    list: [...list].sort((x, y) => x.rank - y.rank),
    h2h,
    clubs,
    records: { biggestWin, topScoring, mostPlayedPair, bestStreak, worstStreak, tightH2h },
    daily,
    lastMatch,
    skipped,
  };
}

// Baris h2h dari perspektif satu pemain, sorted by jumlah match desc
function h2hRowsFor(stats, id) {
  const rows = [];
  for (const h of Object.values(stats.h2h)) {
    if (!h.ids.includes(id)) continue;
    const isX = h.ids[0] === id;
    rows.push({
      oppId: isX ? h.ids[1] : h.ids[0],
      w: isX ? h.wX : h.wY,
      d: h.d,
      l: isX ? h.wY : h.wX,
      gf: isX ? h.gX : h.gY,
      ga: isX ? h.gY : h.gX,
      count: h.matches.length,
      matches: h.matches,
    });
  }
  return rows.sort((a, b) => b.count - a.count);
}

// Club andalan: paling sering dipakai; tie-break panyak kemenangan
function favoriteClub(st) {
  let best = null;
  for (const c of Object.values(st.clubs)) {
    if (!best || c.p > best.p || (c.p === best.p && c.w > best.w)) best = c;
  }
  return best;
}

if (typeof module !== 'undefined') {
  module.exports = {
    ELO_BASE,
    ELO_K,
    expectedScore,
    sortMatches,
    computeStats,
    h2hRowsFor,
    favoriteClub,
    winrate,
  };
}
