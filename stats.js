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
    league: p.league || 1,
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

  const daily = []; // {date, tops: {lg: {id, elo}}} — pemuncak ELO per liga di akhir tiap tanggal main
  let curDate = null;
  let dayRanks = null; // Map id->rank akhir match-day terakhir
  let prevDayRanks = null; // Map id->rank akhir match-day sebelumnya
  const leagues = [...new Set(players.map((p) => p.league || 1))];
  // Map id->rank dalam liganya (ELO pool terpisah per liga)
  const leagueRanksOf = (map) => {
    const m = new Map();
    for (const lg of leagues) {
      Object.values(map)
        .filter((s) => s.league === lg)
        .sort((x, y) => y.elo - x.elo)
        .forEach((s, i) => m.set(s.id, i + 1));
    }
    return m;
  };
  let leagueRanks = null;
  let prevLeagueRanks = null;
  const snapDay = () => {
    // pemuncak ELO per liga di akhir tanggal main (pool ELO terpisah)
    const tops = {};
    for (const lg of leagues) {
      let top = null;
      for (const p of players) {
        const s = byId[p.id];
        if (s.league !== lg) continue;
        if (top === null || s.elo > byId[top].elo) top = p.id;
      }
      if (top !== null) tops[lg] = { id: top, elo: byId[top].elo };
    }
    daily.push({ date: curDate, tops });
    prevDayRanks = dayRanks;
    dayRanks = new Map(
      [...Object.values(byId)].sort((x, y) => y.elo - x.elo).map((s, i) => [s.id, i + 1])
    );
    prevLeagueRanks = leagueRanks;
    leagueRanks = leagueRanksOf(byId);
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
    m.crossLeague = A.league !== B.league; // exhibition: di-record, tapi ELO/W-D-L tidak dihitung

    if (m.crossLeague) {
      m.eloDelta = null; // tanpa chip ELO di match list
    } else {
      // ELO
      const ea = expectedScore(A.elo, B.elo);
      const dA = Math.round(ELO_K * ((draw ? 0.5 : aWin ? 1 : 0) - ea));
      m.eloDelta = dA; // gain ELO sisi a (dipakai chip pergerakan di match list)
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
    }
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

  if (curDate !== null) snapDay(); // tutup tanggal terakhir, sebelum hitung rank/move

  const list = Object.values(byId);
  [...list]
    .sort((x, y) => y.elo - x.elo)
    .forEach((s, i) => {
      s.rank = i + 1;
    });

  // Pergerakan rank vs akhir match day sebelumnya — ranking ulang penuh,
  // jadi pemain yang gak main di hari terakhir pun bisa naik/tergeser.
  // move > 0 naik, < 0 turun. Baris pertama league / pemain baru: 0.
  for (const s of list) {
    const pr = prevDayRanks ? prevDayRanks.get(s.id) : null;
    s.prevRank = pr == null ? s.rank : pr;
    s.move = pr == null ? 0 : pr - s.rank;
  }

  // Rank & pergerakan dalam liga masing-masing (pool ELO terpisah)
  for (const s of list) {
    s.leagueRank = leagueRanks ? leagueRanks.get(s.id) : s.rank;
    const plr = prevLeagueRanks ? prevLeagueRanks.get(s.id) : null;
    s.leagueMove = plr == null ? 0 : plr - s.leagueRank;
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

  return {
    byId,
    list: [...list].sort((x, y) => x.rank - y.rank),
    h2h,
    clubs,
    records: { biggestWin, topScoring, mostPlayedPair, bestStreak, worstStreak, tightH2h },
    daily,
    sash: computeSash(valid),
    lastMatch,
    skipped,
  };
}

// Slempang Kemenangan — gelar "sabuk" king-of-the-hill (BUKAN berbasis ELO).
// Pemenang match pertama jadi juara perdana. Tiap match berikutnya adalah
// pertahanan gelar HANYA jika sang juara ikut main: juara mempertahankan saat
// menang/seri, dan lepas sabuk ke penantang saat kalah. Match tanpa juara
// tidak mengubah kepemilikan. `matches` harus sudah valid & terurut.
function computeSash(matches) {
  const reigns = []; // {id, from, gained, lost, defenses, current}
  let champ = null;
  let cur = null;
  for (const m of matches) {
    const draw = m.aScore === m.bScore;
    const winner = draw ? null : m.aScore > m.bScore ? m.a : m.b;
    const loser = draw ? null : m.aScore > m.bScore ? m.b : m.a;
    if (champ === null) {
      if (draw) continue; // sabuk mulai dari match menang pertama
      champ = winner;
      cur = { id: champ, from: null, gained: m.date, lost: null, defenses: 0, current: true };
      reigns.push(cur);
      continue;
    }
    if (m.a !== champ && m.b !== champ) continue; // bukan match gelar
    if (draw || winner === champ) {
      cur.defenses++; // pertahanan sukses (seri = juara retain)
    } else {
      cur.lost = m.date;
      cur.current = false;
      champ = winner;
      cur = { id: champ, from: loser, gained: m.date, lost: null, defenses: 0, current: true };
      reigns.push(cur);
    }
  }
  return reigns;
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
    computeSash,
  };
}
