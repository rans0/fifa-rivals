# ⚽ fifa-rivals

Leaderboard & match statistics for FIFA games between friends. Pure static site —
no framework, no backend, no build. All stats (ELO, winstreak, head-to-head,
aggregate club) are computed client-side from `data.json`.

## Features

- **Leaderboard**: ELO (+Δ from last match), W-D-L, GF/GA, winrate, winstreak, last-5 form. Sortable & searchable.
- **Reigning champion**: banner for the latest match winner (bragging-rights focus).
- **Head-to-head**: matrix of all players + per-pair duel details.
- **Club**: per-club stats (global & per player) + real crests.
- **History**: all matches, filterable per player.
- **Stat card**: each player can download a stat card as a 1080×1350 PNG (share-ready for IG/WA).
- **Records**: longest winstreak, biggest win, highest-scoring match, most frequent rival.

ELO: base 1200, K=32, computed in date order — deterministic, same result every time.

## Updating data

Edit `data.json`:

```json
{ "date": "2026-09-16", "a": "aran", "aClub": "Inter Milan", "aScore": 2, "b": "morte", "bClub": "PSG", "bScore": 1 }
```

- `a`/`b` = player slots 1 & 2 — **not home/away**, no advantage.
- Club names must be exactly consistent (always `PSG`, never sometimes `Paris Saint Germain`) so aggregates are correct.
- New player: add `{ "id": "baru", "name": "Baru" }` under `players`.
- Commit → `git pull` on the VPS → live.

### Adding a new club crest

Crests live in the `clubs/` folder, filename = slug of the club name (`Real Madrid` → `real-madrid.png`).
A club with no crest automatically falls back to a colored initials chip. Crest source: [football-logos.cc](https://football-logos.cc/) (256×256 is enough).

## Local dev

```bash
cd fifa-rivals
python3 -m http.server 8000   # or: bunx serve
# open http://localhost:8000
```

## Test

```bash
node stats.test.js   # unit tests for ELO, streak, h2h, club, validation
```

## Structure

```
index.html      shell + sections
style.css       dark theme
stats.js        pure computation (used by browser & tests)
app.js          render + hash router + stat card canvas
data.json       THE ONLY file you need to edit to update
clubs/          per-club crest PNGs
stats.test.js   unit tests
```
