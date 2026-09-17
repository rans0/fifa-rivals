'use strict';
/* fifa-rivals — render + stat card. Komputasi ada di stats.js. */

let DATA = null; // data.json mentah
let S = null; // hasil computeStats
let lbSort = { key: 'elo', dir: -1 };

/* ---------- util ---------- */

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(iso) {
  if (!iso || iso.length !== 10) return iso || '';
  return `${+iso.slice(8, 10)} ${MO[+iso.slice(5, 7) - 1]}`;
}
const wr = (s) => (s.p ? Math.round((s.w / s.p) * 1000) / 10 : 0);

/* ---------- club badge (no aset: warna brand + inisial) ---------- */

const CLUB_META = {
  'real madrid': { bg: '#f8fafc', fg: '#1e293b' },
  barcelona: { bg: '#a50044', fg: '#edbb00' },
  arsenal: { bg: '#ef0107', fg: '#ffffff' },
  'inter milan': { bg: '#0b1f5c', fg: '#ffffff' },
  psg: { bg: '#004170', fg: '#e30613' },
  'manchester united': { bg: '#da291c', fg: '#fbe122' },
  liverpool: { bg: '#c8102e', fg: '#ffffff' },
  chelsea: { bg: '#034694', fg: '#ffffff' },
  'manchester city': { bg: '#6cabdd', fg: '#1c2c5b' },
  bayern: { bg: '#dc052d', fg: '#ffffff' },
  'bayern munchen': { bg: '#dc052d', fg: '#ffffff' },
  juventus: { bg: '#111111', fg: '#ffffff' },
  'ac milan': { bg: '#fb090b', fg: '#111111' },
  'atletico madrid': { bg: '#cb3524', fg: '#ffffff' },
  tottenham: { bg: '#132257', fg: '#ffffff' },
  napoli: { bg: '#12a0d7', fg: '#ffffff' },
  dortmund: { bg: '#fde100', fg: '#111111' },
  ajax: { bg: '#d2122e', fg: '#ffffff' },
};
function clubInitials(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
}
function clubColors(name) {
  const meta = CLUB_META[String(name).toLowerCase().trim()];
  if (meta) return meta;
  let h = 7;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { bg: `hsl(${h % 360} 42% 32%)`, fg: '#ffffff' };
}
const clubSlug = (name) =>
  String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const CLUB_IMGS = new Map(); // club -> Image (crest clubs/<slug>.png)
function preloadClubImgs() {
  const clubs = new Set();
  DATA.matches.forEach((m) => {
    clubs.add(m.aClub || '?');
    clubs.add(m.bClub || '?');
  });
  return Promise.all(
    [...clubs].map(
      (c) =>
        new Promise((res) => {
          const img = new Image();
          img.onload = () => { CLUB_IMGS.set(c, img); res(); };
          img.onerror = () => res(); // fallback: chip inisial
          img.src = `clubs/${clubSlug(c)}.png`;
        })
    )
  );
}
function chip(name) {
  if (CLUB_IMGS.has(name))
    return `<img class="chip-crest" src="clubs/${clubSlug(name)}.png" alt="" loading="lazy">`;
  const { bg, fg } = clubColors(name);
  return `<span class="chip" style="--bg:${bg};--fg:${fg}">${esc(clubInitials(name))}</span>`;
}

/* ---------- sparkline ---------- */

function sparkSVG(hist, w, h, stroke, fill) {
  if (!hist || hist.length < 2) return '';
  const min = Math.min(...hist);
  const max = Math.max(...hist);
  const span = max - min || 1;
  const pts = hist.map((v, i) => {
    const x = (i / (hist.length - 1)) * (w - 8) + 4;
    const y = h - 6 - ((v - min) / span) * (h - 12);
    return [x, y];
  });
  const line = pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  const area = `M4,${h - 2} L${line.replace(/ /g, ' L')} L${w - 4},${h - 2} Z`;
  const last = pts.length - 1;
  const dots = pts
    .map((p, i) => {
      const end = i === last;
      return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${end ? 4.5 : 3}" fill="${end ? stroke : '#fff'}" stroke="${stroke}" stroke-width="2"/>`;
    })
    .join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}">
    <path d="${area}" fill="${fill}"/>
    <polyline points="${line}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
  </svg>`;
}

/* ---------- render: banner + records ---------- */

function renderBanner() {
  const el = $('#banner');
  if (!S.lastMatch) {
    el.innerHTML = `<div class="tag">NEW LEAGUE</div><div class="champ">No matches yet 🏁</div>`;
    return;
  }
  // pemuncak klasemen (rank 1 by ELO)
  const champ = S.list[0];
  const second = S.list[1];
  const lead = second ? Math.round(champ.elo - second.elo) : 0;
  el.innerHTML = `<div class="tag">🏆 LEAGUE LEADER</div>
     <div class="champ">${esc(champ.name)}</div>
     <div class="score">${champ.w}W ${champ.d}D ${champ.l}L — <b>${Math.round(champ.elo)} ELO</b>${second ? ` • ${lead > 0 ? `+${lead} vs` : 'level with'} ${esc(second.name)}` : ''}</div>`;
}

function renderRecords() {
  const r = S.records;
  const nm = (id) => esc(S.byId[id].name);
  const cards = [];
  if (r.bestStreak)
    cards.push(['🔥', 'Win Streak', `${r.bestStreak.len} matches`, nm(r.bestStreak.id)]);
  if (r.biggestWin) {
    const m = r.biggestWin;
    const w = m.aScore > m.bScore ? m.a : m.b;
    cards.push(['💥', 'Biggest Win', `${Math.abs(m.aScore - m.bScore)}-goal`, `${nm(w)} · ${m.aScore}–${m.bScore}`]);
  }
  if (r.topScoring) {
    const m = r.topScoring;
    cards.push(['⚽', 'Highest Score', `${m.aScore + m.bScore} goals`, `${nm(m.a)} vs ${nm(m.b)}`]);
  }
  if (r.mostPlayedPair)
    cards.push(['🤝', 'Most Played', `${r.mostPlayedPair.count} meetings`, `${nm(r.mostPlayedPair.ids[0])} vs ${nm(r.mostPlayedPair.ids[1])}`]);
  if (r.worstStreak)
    cards.push(['🥶', 'Losing Streak', `${r.worstStreak.len} matches`, nm(r.worstStreak.id)]);
  if (r.tightH2h) {
    const t = r.tightH2h;
    cards.push(['⚖️', 'Tightest', `${t.wX}–${t.d}–${t.wY}`, `${nm(t.ids[0])} vs ${nm(t.ids[1])}`]);
  }
  $('#records').innerHTML = '<div class="reel">' + cards
    .map(([ic, k, v, s]) => `<div class="rec"><div class="ic">${ic}</div><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`)
    .join('') + '</div>';
}

/* ---------- render: crown history (pemuncak ELO per match day) ---------- */

function renderCrown() {
  const box = $('#crown');
  if (!S.daily.length) { box.closest('.crown-sec').hidden = true; return; }
  // gabung hari beruntun dgn pemuncak sama → satu era (reign)
  const reigns = [];
  for (const d of S.daily) {
    const last = reigns[reigns.length - 1];
    if (last && last.id === d.id) { last.to = d.date; last.elo = d.elo; last.days++; }
    else reigns.push({ id: d.id, from: d.date, to: d.date, elo: d.elo, days: 1 });
  }
  const cur = reigns.length - 1;
  box.innerHTML = reigns
    .map((r, i) => {
      const isCur = i === cur;
      const range = r.from === r.to ? fmtDate(r.from) : `${fmtDate(r.from)} → ${fmtDate(r.to)}`;
      return `<div class="reign${isCur ? ' cur' : ''} click" data-id="${esc(r.id)}">
        <span class="rn-date">${range}</span>
        <span class="rn-name">${isCur ? '👑 ' : ''}${esc(S.byId[r.id].name)}</span>
        <span class="rn-meta"><b>${Math.round(r.elo)}</b> ELO · ${r.days} day${r.days > 1 ? 's' : ''} on top</span>
      </div>`;
    })
    .reverse()
    .join('');
  box.querySelectorAll('.reign').forEach((el) =>
    el.addEventListener('click', () => { location.hash = `#/p/${el.dataset.id}`; })
  );
}

/* ---------- render: slempang kemenangan (defended sash) ---------- */

function renderSash() {
  const box = $('#sash');
  if (!S.sash.length) { box.closest('.sash-sec').hidden = true; return; }
  const cur = S.sash.length - 1;
  box.innerHTML = S.sash
    .map((r, i) => {
      const isCur = i === cur;
      const range = r.from === null && r.gained === r.lost
        ? fmtDate(r.gained)
        : `${fmtDate(r.gained)} → ${isCur ? 'now' : fmtDate(r.lost)}`;
      const took = r.from ? `beat ${esc(S.byId[r.from].name)}` : 'claimed vacant sash';
      const def = `${r.defenses} defense${r.defenses === 1 ? '' : 's'}`;
      return `<div class="reign${isCur ? ' cur' : ''} click" data-id="${esc(r.id)}">
        <span class="rn-date">${range}</span>
        <span class="rn-name">${isCur ? '👑 ' : ''}${esc(S.byId[r.id].name)}</span>
        <span class="rn-meta"><b>${def}</b> · ${took}</span>
      </div>`;
    })
    .reverse()
    .join('');
  box.querySelectorAll('.reign').forEach((el) =>
    el.addEventListener('click', () => { location.hash = `#/p/${el.dataset.id}`; })
  );
}

/* ---------- render: leaderboard ---------- */

function renderLeaderboard() {
  const q = ($('#lb-search').value || '').toLowerCase();
  const diff = (s) => s.gf - s.ga;
  const rows = S.list
    .filter((s) => s.name.toLowerCase().includes(q))
    .map((s) => ({ ...s, diff: diff(s), winrate: wr(s) }));
  const key = lbSort.key;
  const val = (s) =>
    key === 'name' ? s.name : key === 'diff' ? s.diff : key === 'winrate' ? s.winrate : s[key];
  rows.sort((a, b) => {
    const va = val(a), vb = val(b);
    if (typeof va === 'string') return lbSort.dir * va.localeCompare(vb);
    return lbSort.dir * (va - vb);
  });
  $('#lb-body').innerHTML = rows
    .map((s) => {
      const d = s.lastDelta;
      const dCls = d > 0 ? 'pos' : d < 0 ? 'neg' : 'zero';
      const dTxt = d > 0 ? `+${d}` : d < 0 ? `${d}` : '±0';
      const form = s.form.slice(-5).map((f) => `<i class="${f}">${f}</i>`).join('');
      const streak = s.curStreak.type === 'W' ? `🔥 ${s.curStreak.len}` : '—';
      const mv = s.move || 0;
      const mvTxt = mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : '—';
      return `<tr class="click" data-id="${esc(s.id)}">
        <td class="${s.rank === 1 ? 'rank1' : ''}">${s.rank}<span class="mv ${mv > 0 ? 'pos' : mv < 0 ? 'neg' : 'zero'}">${mvTxt}</span></td>
        <td><b>${esc(s.name)}</b><span class="form">${form}</span></td>
        <td class="num"><b>${Math.round(s.elo)}</b> <span class="${dCls}">${dTxt}</span></td>
        <td class="num">${s.p}</td>
        <td class="num">${s.w}</td>
        <td class="num opt">${s.d}</td>
        <td class="num">${s.l}</td>
        <td class="num opt">${s.gf}</td>
        <td class="num opt">${s.ga}</td>
        <td class="num ${s.diff > 0 ? 'pos' : s.diff < 0 ? 'neg' : ''}">${s.diff > 0 ? '+' : ''}${s.diff}</td>
        <td class="num">${s.winrate}%</td>
        <td class="num">${streak} <span style="color:var(--mut);font-size:12px">(best ${s.bestStreak})</span></td>
      </tr>`;
    })
    .join('');
  document.querySelectorAll('#lb-body tr').forEach((tr) =>
    tr.addEventListener('click', () => { location.hash = `#/p/${tr.dataset.id}`; })
  );
}

/* ---------- render: h2h ---------- */

function h2hCell(aId, bId) {
  const h = S.h2h[[aId, bId].sort().join('|')];
  if (!h) return '<span class="zero">–</span>';
  const isX = h.ids[0] === aId;
  const w = isX ? h.wX : h.wY;
  const l = isX ? h.wY : h.wX;
  return `<span class="${w > l ? 'dom' : w < l ? 'neg' : ''}">${w}</span>–${h.d}–<span class="${l > w ? 'dom' : ''}">${l}</span>`;
}

function renderH2H() {
  const list = S.list;
  const short = (n) => (n.length > 9 ? n.slice(0, 8) + '…' : n);
  let html = '<thead><tr><th></th>' + list.map((s) => `<th title="${esc(s.name)}">${esc(short(s.name))}</th>`).join('') + '</tr></thead><tbody>';
  for (const r of list) {
    html += `<tr><th class="rowname">${esc(r.name)}</th>`;
    for (const c of list) {
      html += r.id === c.id ? '<td class="self">·</td>' : `<td class="cell" data-a="${esc(r.id)}" data-b="${esc(c.id)}">${h2hCell(r.id, c.id)}</td>`;
    }
    html += '</tr>';
  }
  $('#h2h-table').innerHTML = html + '</tbody>';
  document.querySelectorAll('#h2h-table td.cell').forEach((td) =>
    td.addEventListener('click', () => showPair(td.dataset.a, td.dataset.b))
  );
}

function showPair(x, y) {
  const h = S.h2h[[x, y].sort().join('|')];
  const box = $('#pair-detail');
  if (!h) { box.innerHTML = ''; return; }
  const [X, Y] = h.ids.map((id) => S.byId[id]);
  const matches = [...h.matches].reverse(); // terbaru dulu
  const aggPct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const total = h.matches.length;
  box.innerHTML = `
    <div class="pair" id="pair-anchor">
      <div class="pair-h">
        <span class="nm">${esc(X.name)}</span><span class="vs">VS</span><span class="nm">${esc(Y.name)}</span>
      </div>
      <div class="pair-agg">
        <div><b class="pos">${h.wX}</b><span>${X.name} wins</span></div>
        <div><b>${h.d}</b><span>draws</span></div>
        <div><b class="neg">${h.wY}</b><span>${Y.name} wins</span></div>
      </div>
      ${matches
        .map((m) => {
          const isAfirst = m.a === h.ids[0];
          const sX = isAfirst ? m.aScore : m.bScore;
          const sY = isAfirst ? m.bScore : m.aScore;
          const clubX = isAfirst ? m.aClub : m.bClub;
          const clubY = isAfirst ? m.bClub : m.aClub;
          return `<div class="match">
            <span class="date">${fmtDate(m.date)}</span>
            <span class="pl">${chip(clubX)}<span class="cn ${sX > sY ? 'win' : ''}">${esc(X.name)}${sX > sY ? ' 🏆' : ''}</span></span>
            <span class="sc">${sX}–${sY}</span>
            <span class="pl r"><span class="cn ${sY > sX ? 'win' : ''}">${esc(Y.name)}${sY > sX ? ' 🏆' : ''}</span>${chip(clubY)}</span>
          </div>`;
        })
        .join('')}
      <p class="hint">Dominance: ${aggPct(h.wX, total)}% ${esc(X.name)} · ${aggPct(h.wY, total)}% ${esc(Y.name)} · aggregate goals ${h.gX}–${h.gY}</p>
    </div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- render: clubs ---------- */

function renderClubs() {
  const f = $('#club-filter').value;
  const src = f ? Object.values(S.byId[f].clubs) : Object.values(S.clubs);
  const rows = src
    .map((c) => ({ ...c, winrate: wr(c) }))
    .sort((a, b) => b.p - a.p || b.w - a.w);
  $('#club-body').innerHTML = rows
    .map(
      (c) => `<tr>
        <td>${chip(c.club)}<b>${esc(c.club)}</b></td>
        <td class="num">${c.p}</td>
        <td class="num">${c.w}</td>
        <td class="num">${c.d}</td>
        <td class="num">${c.l}</td>
        <td class="num">${c.gf}</td>
        <td class="num">${c.ga}</td>
        <td class="num">${c.winrate}%</td>
      </tr>`
    )
    .join('');
}

/* ---------- render: matches ---------- */

// Top performer satu hari: menang terbanyak, seri → gol terbanyak
function dayTopPerformer(list) {
  const agg = {};
  for (const m of list) {
    for (const side of ['a', 'b']) {
      const gf = m[side + 'Score'];
      const ga = m[(side === 'a' ? 'b' : 'a') + 'Score'];
      const s = (agg[m[side]] = agg[m[side]] || { w: 0, gf: 0 });
      s.gf += gf;
      if (gf > ga) s.w++;
    }
  }
  let top = null;
  for (const [id, s] of Object.entries(agg)) {
    if (!top || s.w > top.s.w || (s.w === top.s.w && s.gf > top.s.gf)) top = { id, s };
  }
  return top;
}

// Baris satu match + chip ELO pemenang & highlight big win (margin ≥ 4)
function matchRow(m, dly) {
  const aWin = m.aScore > m.bScore;
  const draw = m.aScore === m.bScore;
  const big = Math.abs(m.aScore - m.bScore) >= 4;
  const eloChip = (winner) => {
    if (draw || m.eloDelta == null) return '';
    const gain = winner === 'a' ? m.eloDelta : -m.eloDelta;
    return gain > 0 ? `<span class="elo-chip">+${gain}</span>` : '';
  };
  return `<div class="match${big ? ' big' : ''}"${dly()}>
    <span class="date">${fmtDate(m.date)}<span class="sub">${m.aScore + m.bScore} goals</span></span>
    <span class="pl">${chip(m.aClub)}<span class="cn ${aWin ? 'win' : ''}">${esc(S.byId[m.a].name)}${aWin ? ' 🏆' : draw ? ' 🤝' : ''}${eloChip('a')}</span></span>
    <span class="sc">${m.aScore}–${m.bScore}</span>
    <span class="pl r"><span class="cn ${!aWin && !draw ? 'win' : ''}">${esc(S.byId[m.b].name)}${!aWin && !draw ? ' 🏆' : draw ? ' 🤝' : ''}${eloChip('b')}</span>${chip(m.bClub)}</span>
  </div>`;
}

function renderMatches() {
  const f = $('#match-filter').value;
  const all = S.list.length ? [...DATA.matches] : [];
  const ms = all.filter((m) => (!f || m.a === f || m.b === f) && S.byId[m.a] && S.byId[m.b]);
  const days = new Map(); // date → matches (urut input)
  for (const m of ms) {
    if (!days.has(m.date)) days.set(m.date, []);
    days.get(m.date).push(m);
  }
  const leaderByDate = new Map(S.daily.map((d) => [d.date, d]));
  const dayNo = new Map(S.daily.map((d, i) => [d.date, i + 1])); // oldest = 1
  let html = '';
  let k = 0; // stagger: tiap elemen muncul berurutan, cap 500ms
  const dly = () => ` style="animation-delay:${Math.min(k++ * 45, 500)}ms"`;
  for (const date of [...days.keys()].sort().reverse()) {
    const list = days.get(date);
    const top = dayTopPerformer(list);
    const lead = leaderByDate.get(date);
    html += `<div class="day-head"${dly()}>
      <span class="dh-t">MATCH DAY ${dayNo.get(date) || ''}<small> · ${fmtDate(date)} · ${list.length} match${list.length > 1 ? 'es' : ''}</small></span>
      <span class="dh-stats">⚽ ${list.reduce((n, m) => n + m.aScore + m.bScore, 0)}${top ? ` · 🔥 ${esc(S.byId[top.id].name)} ${top.s.w}W` : ''}${lead ? ` · 👑 ${esc(S.byId[lead.id].name)} ${Math.round(lead.elo)}` : ''}</span>
    </div>`;
    html += list.map((m) => matchRow(m, dly)).join('');
  }
  $('#match-list').innerHTML = html;
}

/* ---------- render: player page ---------- */

function renderPlayer(id) {
  const s = S.byId[id];
  if (!s) { location.hash = '#/leaderboard'; return; }
  const fav = favoriteClub(s);
  const rows = h2hRowsFor(S, id);
  const myMatches = [...DATA.matches]
    .filter((m) => (m.a === id || m.b === id) && S.byId[m.a] && S.byId[m.b])
    .sort((x, y) => (x.date === y.date ? 0 : x.date < y.date ? 1 : -1));
  const d = s.lastDelta;

  $('#view-player').innerHTML = `
    <a class="back" href="#/leaderboard">← back to leaderboard</a>
    <div class="pl-head">
      <div class="pl-hero">
        <div>
          <div class="pl-kicker">${s.rank === 1 ? '<b>#1</b> · LEAGUE LEADER' : `RANK <b>#${s.rank}</b>`}</div>
          <div class="pl-name">${esc(s.name)}</div>
          <div class="pl-elo">${Math.round(s.elo)} <small>ELO</small>
            <span class="pl-delta ${d > 0 ? 'pos' : d < 0 ? 'neg' : 'zero'}">${d > 0 ? '▲+' : d < 0 ? '▼' : '±'}${Math.abs(d)}</span>
          </div>
        </div>
        <div class="pl-badge${s.rank === 1 ? ' r1' : ''}"><span>#${s.rank}</span></div>
      </div>
      ${sparkSVG(s.eloHist, 560, 96, '#e11d2e', 'rgba(225,29,46,.10)')}
      <div class="pl-grid">
        <div class="box"><div class="k">Matches</div><div class="v">${s.p}</div></div>
        <div class="box"><div class="k">Win rate</div><div class="v">${wr(s)}%</div></div>
        <div class="box"><div class="k">Record W·D·L</div><div class="v">${s.w}·${s.d}·${s.l}</div></div>
        <div class="box"><div class="k">Goals F : A</div><div class="v">${s.gf} : ${s.ga}</div></div>
        <div class="box"><div class="k">Best win streak</div><div class="v">${s.bestStreak}</div></div>
        <div class="box"><div class="k">Signature club</div><div class="v club">${fav ? chip(fav.club) + esc(fav.club) : '—'}</div></div>
      </div>
      <button class="btn" id="dl-card">Download Stat Card</button>
    </div>

    <div class="view-head"><h2>Opponents</h2></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>Opponent</th><th class="num">MP</th><th class="num">W</th><th class="num">D</th><th class="num">L</th>
      <th class="num">Goals</th><th>Trend</th>
    </tr></thead><tbody>
    ${rows
      .map(
        (r) => `<tr class="click" data-opp="${esc(r.oppId)}">
        <td><b>${esc(S.byId[r.oppId].name)}</b></td>
        <td class="num">${r.count}</td>
        <td class="num pos">${r.w}</td>
        <td class="num">${r.d}</td>
        <td class="num neg">${r.l}</td>
        <td class="num">${r.gf} : ${r.ga}</td>
        <td><span class="minibar"><i style="width:${(r.w / r.count) * 100}%"></i><i class="d" style="width:${(r.d / r.count) * 100}%"></i></span></td>
      </tr>`
      )
      .join('')}
    </tbody></table></div>

    <div class="view-head"><h2>Clubs used</h2></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>Club</th><th class="num">MP</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">Win %</th>
    </tr></thead><tbody>
    ${Object.values(s.clubs)
      .map((c) => `<tr>
        <td>${chip(c.club)}<b>${esc(c.club)}</b></td>
        <td class="num">${c.p}</td><td class="num">${c.w}</td><td class="num">${c.d}</td><td class="num">${c.l}</td><td class="num">${wr(c)}%</td>
      </tr>`)
      .join('')}
    </tbody></table></div>

    <div class="view-head"><h2>Recent matches</h2></div>
    <div>${(() => {
      const dayNo = new Map(S.daily.map((d, i) => [d.date, i + 1]));
      const byDate = new Map();
      for (const m of myMatches.slice(0, 10)) {
        if (!byDate.has(m.date)) byDate.set(m.date, []);
        byDate.get(m.date).push(m);
      }
      return [...byDate.entries()].map(([date, list]) => {
        const r = list.reduce((r, m) => {
          const my = m.a === id ? m.aScore : m.bScore, op = m.a === id ? m.bScore : m.aScore;
          r.g += my; my > op ? r.w++ : my < op ? r.l++ : r.d++;
          return r;
        }, { w: 0, d: 0, l: 0, g: 0 });
        const head = `<div class="day-head">
          <span class="dh-t">MATCH DAY ${dayNo.get(date) || ''}<small> · ${fmtDate(date)} · ${list.length} match${list.length > 1 ? 'es' : ''}</small></span>
          <span class="dh-stats">${r.w}W ${r.d}D ${r.l}L · ⚽ ${r.g}</span>
        </div>`;
        const rows = list.map((m) => {
          const slotA = m.a === id;
          const my = slotA ? m.aScore : m.bScore;
          const op = slotA ? m.bScore : m.aScore;
          const opp = slotA ? m.b : m.a;
          const myClub = slotA ? m.aClub : m.bClub;
          const opClub = slotA ? m.bClub : m.aClub;
          return `<div class="match">
            <span class="date">${fmtDate(m.date)}</span>
            <span class="pl">${chip(myClub)}<span class="cn ${my > op ? 'win' : my < op ? 'neg' : ''}">${esc(s.name)}</span></span>
            <span class="sc">${my}–${op}</span>
            <span class="pl r"><span class="cn">${esc(S.byId[opp].name)}</span>${chip(opClub)}</span>
          </div>`;
        }).join('');
        return head + rows;
      }).join('');
    })()}</div>`;

  $('#dl-card').addEventListener('click', () => downloadCard(s));
  document.querySelectorAll('#view-player tbody tr.click').forEach((tr) =>
    tr.addEventListener('click', () => showPair(id, tr.dataset.opp))
  );
  $('#view-player').scrollIntoView();
}

/* ---------- stat card (canvas → PNG) ---------- */

function drawCard(s) {
  const W = 1080, H = 1920; // ukuran Instagram Story (9:16)
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // poster "stat sheet": ink bookends top & bottom, konten putih rata kiri
  const INK = '#0f1512', MUT = '#7a857f', RED = '#e11d2e', LINE = '#e4e8e5', PAPER = '#f7f8f7';
  const M = 70; // margin konten
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  const FONT = (wgt, size) => `${wgt} ${size}px 'Barlow Semi Condensed', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif`;
  const BEB = (size) => `400 ${size}px 'Bebas Neue', 'Arial Narrow', sans-serif`; // scoreboard numerals
  const fitText = (text, max, size, mk) => {
    ctx.font = mk(size);
    while (ctx.measureText(text).width > max && size > 30) {
      size -= 4; ctx.font = mk(size);
    }
    return size;
  };
  const rr = (x, y, w, h, rad) => {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  };

  // bookends: masthead (ink + red rail) & footer bar (ink)
  ctx.fillStyle = INK; ctx.fillRect(0, 0, W, 96);
  ctx.fillStyle = RED; ctx.fillRect(0, 96, W, 10);
  ctx.fillStyle = INK; ctx.fillRect(0, H - 90, W, 90);

  // masthead
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff'; ctx.font = BEB(50);
  ctx.fillText('FIFA RIVALS', M + 26, 66);
  ctx.fillStyle = RED; // tick merah kiri wordmark
  ctx.beginPath();
  ctx.moveTo(M, 36); ctx.lineTo(M + 14, 36); ctx.lineTo(M + 4, 66); ctx.lineTo(M - 10, 66);
  ctx.closePath(); ctx.fill();
  ctx.textAlign = 'right'; ctx.fillStyle = '#9aa39e'; ctx.font = FONT(600, 25);
  ctx.fillText('fifa-rivals.projectlabs.id', W - M, 62);

  // hero: rata kiri — kicker, nama, ELO; badge rank kanan-atas
  ctx.textAlign = 'left';
  ctx.fillStyle = MUT; ctx.font = FONT(600, 26);
  ctx.fillText(`${s.p} MATCHES  ·  PEAK ELO ${Math.round(s.peakElo)}`, M, 240);
  ctx.fillStyle = INK;
  ctx.font = BEB(fitText(s.name.toUpperCase(), W - 2 * M - 260, 150, BEB));
  ctx.fillText(s.name.toUpperCase(), M, 420);

  ctx.fillStyle = MUT; ctx.font = FONT(600, 26);
  ctx.fillText('ELO RATING', M, 515);
  ctx.fillStyle = INK; ctx.font = BEB(200);
  ctx.fillText(String(Math.round(s.elo)), M, 700);
  const d = s.lastDelta;
  if (d !== 0) {
    const ex = M + ctx.measureText(String(Math.round(s.elo))).width + 36;
    ctx.font = FONT(800, 54);
    ctx.fillStyle = d > 0 ? '#0a7a3c' : RED;
    ctx.fillText(`${d > 0 ? '▲ +' + d : '▼ ' + d}`, ex, 698);
  }

  // badge rank — kanan atas hero
  const bx = W - M - 105, by = 330;
  ctx.beginPath(); ctx.arc(bx, by, 105, 0, Math.PI * 2);
  if (s.rank === 1) {
    ctx.fillStyle = RED; ctx.fill();
    ctx.fillStyle = '#ffffff';
  } else {
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = INK;
  }
  ctx.textAlign = 'center';
  ctx.font = FONT(800, 34); ctx.fillText('RANK', bx, by - 16);
  ctx.font = BEB(104); ctx.fillText(`#${s.rank}`, bx, by + 68);

  // sparkline band dengan hairline
  const hist = s.eloHist;
  if (hist.length > 1) {
    const x0 = M, x1 = W - M, y0 = 790, y1 = 905;
    ctx.strokeStyle = LINE; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, y0 - 22); ctx.lineTo(x1, y0 - 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0, y1 + 18); ctx.lineTo(x1, y1 + 18); ctx.stroke();
    const min = Math.min(...hist), max = Math.max(...hist), span = max - min || 1;
    const pts = hist.map((v, i) => [x0 + (i / (hist.length - 1)) * (x1 - x0), y1 - ((v - min) / span) * (y1 - y0 - 12) - 6]);
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.lineTo(x1, y1); ctx.lineTo(x0, y1); ctx.closePath();
    ctx.fillStyle = 'rgba(225,29,46,.08)'; ctx.fill();
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.lineWidth = 6; ctx.strokeStyle = RED; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(...pts[pts.length - 1], 10, 0, Math.PI * 2); ctx.fillStyle = RED; ctx.fill();
  }

  // stat grid — rata kiri, 3×2
  const cells = [
    ['WIN RATE', wr(s) + '%'],
    ['RECORD (W-D-L)', `${s.w}-${s.d}-${s.l}`],
    ['GOALS F : A', `${s.gf} : ${s.ga}`],
    ['BEST WIN STREAK', String(s.bestStreak)],
    ['GOALS / MATCH', s.p ? (s.gf / s.p).toFixed(1) : '0.0'],
    ['PEAK ELO', String(Math.round(s.peakElo))],
  ];
  const bw = (W - 2 * M - 2 * 20) / 3, bh = 170, gy = 985;
  cells.forEach(([k, v], i) => {
    const x = M + (i % 3) * (bw + 20);
    const y = gy + Math.floor(i / 3) * (bh + 20);
    rr(x, y, bw, bh, 12);
    ctx.fillStyle = PAPER; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = LINE; ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = MUT; ctx.font = FONT(700, 24);
    ctx.fillText(k, x + 26, y + 50);
    ctx.fillStyle = INK; ctx.font = BEB(fitText(v, bw - 52, 78, BEB));
    ctx.fillText(v, x + 26, y + 132);
  });

  // recent form strip
  const form = s.form.slice(-5);
  if (form.length) {
    ctx.textAlign = 'left';
    ctx.fillStyle = MUT; ctx.font = FONT(600, 26);
    ctx.fillText('RECENT FORM', M, 1445);
    const sz = 64, gap = 16;
    form.forEach((f, i) => {
      const x = M + i * (sz + gap), y = 1470;
      if (f === 'W') {
        rr(x, y, sz, sz, 10); ctx.fillStyle = INK; ctx.fill();
        ctx.fillStyle = '#ffffff';
      } else if (f === 'L') {
        rr(x, y, sz, sz, 10); ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = RED; ctx.stroke();
        ctx.fillStyle = RED;
      } else {
        rr(x, y, sz, sz, 10); ctx.fillStyle = PAPER; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = LINE; ctx.stroke();
        ctx.fillStyle = MUT;
      }
      ctx.textAlign = 'center'; ctx.font = FONT(800, 30);
      ctx.fillText(f, x + sz / 2, y + sz / 2 + 11);
    });
  }

  // footer bar: signature club kiri, generated kanan
  const fav = favoriteClub(s);
  const crest = fav && CLUB_IMGS.get(fav.club);
  ctx.textBaseline = 'alphabetic';
  if (fav && crest) {
    ctx.drawImage(crest, M, H - 72, 54, 54);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff'; ctx.font = BEB(44);
    ctx.fillText(fav.club.toUpperCase(), M + 70, H - 34);
  } else {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff'; ctx.font = BEB(44);
    ctx.fillText('FIFA RIVALS LEAGUE', M, H - 34);
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = '#9aa39e'; ctx.font = FONT(600, 24);
  ctx.fillText(`generated ${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}`, W - M, H - 34);

  return cv;
}

async function downloadCard(s) {
  await document.fonts.ready; // pastikan Bebas Neue terload sebelum render canvas
  drawCard(s).toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fifa-rivals-${String(s.name).toLowerCase().replace(/\s+/g, '-')}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

/* ---------- standings card (canvas → PNG, top 5) ---------- */

function drawStandings() {
  const W = 1080, H = 1920; // ukuran Instagram Story (9:16)
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  const INK = '#0f1512', MUT = '#7a857f', RED = '#e11d2e', LINE = '#e4e8e5', PAPER = '#f7f8f7';
  const M = 70;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  const FONT = (wgt, size) => `${wgt} ${size}px 'Barlow Semi Condensed', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif`;
  const BEB = (size) => `400 ${size}px 'Bebas Neue', 'Arial Narrow', sans-serif`;
  const rr = (x, y, w, h, rad) => {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  };

  // bookends: masthead + footer bar (sama seperti stat card)
  ctx.fillStyle = INK; ctx.fillRect(0, 0, W, 96);
  ctx.fillStyle = RED; ctx.fillRect(0, 96, W, 10);
  ctx.fillStyle = INK; ctx.fillRect(0, H - 90, W, 90);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff'; ctx.font = BEB(50);
  ctx.fillText('FIFA RIVALS', M + 26, 66);
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(M, 36); ctx.lineTo(M + 14, 36); ctx.lineTo(M + 4, 66); ctx.lineTo(M - 10, 66);
  ctx.closePath(); ctx.fill();
  ctx.textAlign = 'right'; ctx.fillStyle = '#9aa39e'; ctx.font = FONT(600, 25);
  ctx.fillText('fifa-rivals.projectlabs.id', W - M, 62);

  // title
  ctx.textAlign = 'left';
  ctx.fillStyle = MUT; ctx.font = FONT(600, 30);
  ctx.fillText('LEAGUE STANDINGS', M, 210);
  ctx.fillStyle = INK; ctx.font = BEB(130);
  ctx.fillText('TOP 5', M, 330);

  // column labels + hairline
  const top5 = [...S.list].sort((a, b) => a.rank - b.rank).slice(0, 5);
  const xRec = W - M - 450, xWin = W - M - 265, xElo = W - M;
  ctx.fillStyle = MUT; ctx.font = FONT(700, 26);
  ctx.fillText('PLAYER', M + 84, 430);
  ctx.textAlign = 'right';
  ctx.fillText('W-D-L', xRec, 430);
  ctx.fillText('WIN %', xWin, 430);
  ctx.fillText('ELO', xElo, 430);
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(M, 455); ctx.lineTo(W - M, 455); ctx.stroke();

  // rows
  const RH = 200;
  top5.forEach((s, i) => {
    const rs = 455 + i * RH; // top baris
    const cy = rs + RH / 2; // pusat vertikal baris
    ctx.textAlign = 'left';
    ctx.fillStyle = s.rank === 1 ? RED : INK;
    ctx.font = BEB(84);
    ctx.fillText(String(s.rank), M, cy + 30);
    // nama — badge pergerakan nempel di ujung kanan nama
    const xName = M + 84;
    let size = 80;
    ctx.font = BEB(size);
    const name = s.name.toUpperCase();
    while (ctx.measureText(name).width > 200 && size > 30) {
      size -= 4; ctx.font = BEB(size);
    }
    ctx.fillStyle = INK;
    ctx.fillText(name, xName, rs + 90);
    const nameW = ctx.measureText(name).width;
    // badge pergerakan rank vs akhir match day sebelumnya: hijau naik · merah turun · paper tetap
    const mv = s.move;
    const bW = 70, bH = 44, bX = xName + nameW + 24, bY = rs + 34;
    rr(bX, bY, bW, bH, 11);
    if (mv > 0) { ctx.fillStyle = '#0a7a3c'; ctx.fill(); }
    else if (mv < 0) { ctx.fillStyle = RED; ctx.fill(); }
    else {
      ctx.fillStyle = PAPER; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = LINE; ctx.stroke();
    }
    ctx.fillStyle = mv === 0 ? MUT : '#ffffff';
    ctx.font = FONT(800, 28);
    ctx.textAlign = 'center';
    ctx.fillText(mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : '—', bX + bW / 2, bY + 31);
    // form strip kecil di bawah nama (W ink · L putih-merah · D paper)
    ctx.textAlign = 'left';
    const form = s.form.slice(-5);
    form.forEach((f, j) => {
      const x = xName + j * 56, y = rs + 118, sz = 40;
      if (f === 'W') {
        rr(x, y, sz, sz, 8); ctx.fillStyle = INK; ctx.fill();
        ctx.fillStyle = '#ffffff';
      } else if (f === 'L') {
        rr(x, y, sz, sz, 8); ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = RED; ctx.stroke();
        ctx.fillStyle = RED;
      } else {
        rr(x, y, sz, sz, 8); ctx.fillStyle = PAPER; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = LINE; ctx.stroke();
        ctx.fillStyle = MUT;
      }
      ctx.textAlign = 'center'; ctx.font = FONT(800, 24);
      ctx.fillText(f, x + sz / 2, y + sz / 2 + 9);
    });
    // angka — satu pusat vertikal per baris
    ctx.textAlign = 'right';
    ctx.fillStyle = MUT; ctx.font = FONT(600, 32);
    ctx.fillText(`${s.w}-${s.d}-${s.l}`, xRec, cy + 12);
    ctx.fillStyle = INK;
    ctx.fillText(String(Math.round(wr(s))), xWin, cy + 12);
    ctx.font = BEB(96);
    const eloTxt = String(Math.round(s.elo));
    const eloW = ctx.measureText(eloTxt).width; // ukur SEBELUM ganti font, else lebar salah
    ctx.fillText(eloTxt, xElo, cy + 34);
    const dlt = s.lastDelta;
    if (dlt) {
      ctx.fillStyle = dlt > 0 ? '#0a7a3c' : RED;
      ctx.font = FONT(800, 44);
      ctx.fillText(`${dlt > 0 ? '+' : ''}${dlt}`, xElo - eloW - 32, cy + 32);
    }
    if (i < top5.length - 1) {
      ctx.strokeStyle = LINE; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(M, 455 + (i + 1) * RH); ctx.lineTo(W - M, 455 + (i + 1) * RH); ctx.stroke();
    }
  });

  // footer bar
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff'; ctx.font = BEB(44);
  ctx.fillText('FIFA RIVALS LEAGUE', M, H - 34);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#9aa39e'; ctx.font = FONT(600, 24);
  ctx.fillText(`generated ${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}`, W - M, H - 34);

  return cv;
}

async function downloadStandings() {
  await document.fonts.ready;
  drawStandings().toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fifa-rivals-top-5-standings.png';
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

/* ---------- router ---------- */

const VIEWS = ['leaderboard', 'h2h', 'clubs', 'matches', 'player'];
function route() {
  const h = location.hash || '#/leaderboard';
  const parts = h.replace(/^#\//, '').split('/');

  let tab = 'leaderboard';
  if (parts[0] === 'h2h' || parts[0] === 'clubs' || parts[0] === 'matches') tab = parts[0];
  else if (parts[0] === 'p' && parts[1]) {
    $('#view-player').hidden = false;
    renderPlayer(parts[1]);
    VIEWS.filter((v) => v !== 'player').forEach((v) => ($('#view-' + v).hidden = true));
    setActiveTab(null);
    return;
  }

  VIEWS.forEach((v) => ($('#view-' + v).hidden = v !== tab));
  setActiveTab(tab);
  if (tab === 'leaderboard') renderLeaderboard();
}
function setActiveTab(tab) {
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
}

/* ---------- boot ---------- */

async function boot() {
  try {
    const res = await fetch('data.json');
    DATA = await res.json();
  } catch {
    $('#banner').innerHTML = '<div class="champ">Failed to load data.json</div>';
    return;
  }
  S = computeStats(DATA.players, DATA.matches);
  await preloadClubImgs(); // sebelum render biar crest gak kedipan fallback
  // offset sticky day-head = tinggi topbar (berubah antara desktop/mobile)
  document.documentElement.style.setProperty('--topbar-h', $('.topbar').offsetHeight + 'px');

  if (S.skipped.length) {
    const w = $('#data-warn');
    w.hidden = false;
    w.textContent = `⚠ ${S.skipped.length} match(es) skipped (unknown player id / invalid score). Check data.json: ` +
      S.skipped.map((m) => `${m.date} ${m.a} vs ${m.b}`).join('; ');
  }

  renderBanner();
  renderRecords();
  renderH2H();
  renderCrown();
  renderSash();

  $('#lb-search').addEventListener('input', renderLeaderboard);
  $('#dl-standings').addEventListener('click', downloadStandings);
  document.querySelectorAll('#lb-table thead th[data-key]').forEach((th) =>
    th.addEventListener('click', () => {
      const k = th.dataset.key;
      lbSort = { key: k, dir: lbSort.key === k ? -lbSort.dir : k === 'name' ? 1 : -1 };
      renderLeaderboard();
    })
  );

  const opts = '<option value="">All players</option>' +
    S.list.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  $('#club-filter').innerHTML = opts;
  $('#match-filter').innerHTML = opts;
  $('#club-filter').addEventListener('change', renderClubs);
  $('#match-filter').addEventListener('change', renderMatches);
  renderClubs();
  renderMatches();

  window.addEventListener('hashchange', route);
  route();
}
boot();
