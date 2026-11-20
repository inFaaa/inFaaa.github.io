/* Leaderboard, dimension profiles and the main page case viewer. */
(() => {
  'use strict';
  const {$, $$, esc, tierColor, tierLight, heat, WIN_LO, WIN_HI, pct, raw, DIMS, loadJSON, bindTips, initChrome, buildWall, modelMeta} = window.FS2V;
  initChrome();

  const SLICE_GROUPS = [
    {id: 'overall', label: 'Overall'},
    {id: 'category', label: 'By category'},
    {id: 'prompt', label: 'By prompt type'},
    {id: 'structure', label: 'By case structure'}
  ];

  // release months live in an editable file, a missing file only hides the dates
  const dates = loadJSON('data/release_dates.json').catch(() => ({models: []}));
  Promise.all([loadJSON('data/leaderboard.json'), loadJSON('data/benchmark.json'), dates]).then(([board, bench, rel]) => {
    const when = Object.fromEntries((rel.models || []).filter(x => x.date).map(x => [x.tag, x.date]));
    board.models.forEach(m => { m.date = when[m.id] || null; });
    const meta = modelMeta(board);
    buildWall(bench, meta);
    initBoard(board);
    initProfiles(board);
    const ex = $('#examples-viewer');
    if (ex) FS2V.initCases(ex, bench, meta, 'taxonomy');
  }).catch(err => {
    const el = $('#board-body');
    if (el) el.innerHTML = `<tr class="empty-row"><td colspan="12">The leaderboard data could not be loaded (${esc(err.message)}). Serve this folder over HTTP to view it.</td></tr>`;
  });

  function initBoard(board) {
    // default view keeps the official board order: tiers, then Score inside a tier
    const state = {group: 'overall', slice: 'all', access: 'all', q: '', key: 'tier', dir: 1};
    const sliceOf = id => board.slices.find(s => s.id === id);
    const groupTabs = $('#slice-groups'), sliceTabs = $('#slice-tabs');
    const body = $('#board-body'), table = $('#board');
    bindTips(table);

    function drawTabs() {
      groupTabs.innerHTML = SLICE_GROUPS.map(g => `<button data-g="${g.id}" aria-pressed="${g.id === state.group}">${g.label}</button>`).join('');
      const subs = board.slices.filter(s => s.group === state.group);
      sliceTabs.hidden = state.group === 'overall';
      sliceTabs.innerHTML = subs.map(s => `<button data-s="${s.id}" aria-pressed="${s.id === state.slice}">${esc(s.label)} <span style="opacity:.7">(${s.cases})</span></button>`).join('');
      $$('[data-g]', groupTabs).forEach(b => b.onclick = () => {
        state.group = b.dataset.g;
        state.slice = board.slices.find(s => s.group === state.group).id;
        if (state.slice !== 'all' && state.key === 'tier') { state.key = 'win'; state.dir = -1; }
        if (state.slice === 'all' && state.key === 'win') { state.key = 'tier'; state.dir = 1; }
        drawTabs(); draw();
      });
      $$('[data-s]', sliceTabs).forEach(b => b.onclick = () => { state.slice = b.dataset.s; drawTabs(); draw(); });
    }

    $$('#access-seg button').forEach(b => b.onclick = () => {
      state.access = b.dataset.a;
      $$('#access-seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      draw();
    });
    $('#board-search').addEventListener('input', e => { state.q = e.target.value.trim().toLowerCase(); draw(); });
    $$('#board thead th.sortable').forEach(th => {
      th.tabIndex = 0;
      const go = () => {
        const k = th.dataset.k;
        if (state.key === k) state.dir *= -1; else { state.key = k; state.dir = (k === 'name' || k === 'vendor' || k === 'tier') ? 1 : -1; }
        draw();
      };
      th.addEventListener('click', go);
      th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });

    function rowsFor() {
      const s = sliceOf(state.slice);
      return board.models.map(m => {
        const v = state.slice === 'all' ? m : {...m, ...s.scores[m.id]};
        return {...v, date: m.date, tier: m.tier, detail: m.detail, detail_win: m.detail_win, elo: m.elo, elo_lo: m.elo_lo, elo_hi: m.elo_hi};
      }).filter(r => r.score != null)
        .filter(r => state.access === 'all' || (state.access === 'open') === r.open)
        .filter(r => !state.q || r.name.toLowerCase().includes(state.q) || r.vendor.toLowerCase().includes(state.q));
    }

    function draw() {
      const s = sliceOf(state.slice);
      const rows = rowsFor();
      const k = state.key, d = state.dir;
      // overall board: tier bands stay intact when sorting by tier, win rate or Score (best first)
      const grouped = state.slice === 'all' && (k === 'tier' || ((k === 'win' || k === 'score') && d === -1));
      const inner = k === 'tier' ? 'score' : k;
      rows.sort((a, b) => {
        if (grouped && a.tier !== b.tier) return (k === 'tier' ? d : 1) * (a.tier - b.tier);
        const kk = grouped ? inner : k, dd = grouped && k === 'tier' ? -1 : d;
        const x = a[kk], y = b[kk];
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        if (typeof x === 'string') return dd * x.localeCompare(y);
        if (x !== y) return dd * (x - y);
        return b.score - a.score;
      });
      // rank: official order (tier, then Score) on the overall board, win rate order on a slice
      const rk = state.slice === 'all' ? 'score' : 'win';
      const byScore = [...rows].sort((a, b) => (b[rk] ?? -1) - (a[rk] ?? -1));
      const rank = new Map(byScore.map((r, i) => [r.id, i + 1]));
      const tierCount = {};
      rows.forEach(r => { tierCount[r.tier] = (tierCount[r.tier] || 0) + 1; });
      const totalTier = {};
      board.models.forEach(m => { totalTier[m.tier] = (totalTier[m.tier] || 0) + 1; });

      $$('#board thead th.sortable').forEach(th => {
        if (th.dataset.k === k) th.setAttribute('aria-sort', d === 1 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
        const a = $('.arrow', th); if (a) a.textContent = th.dataset.k === k ? (d === 1 ? '↑' : '↓') : '↓';
      });
      $('#tier-col-label').textContent = state.slice === 'all' ? 'Tier' : 'Overall tier';
      $('#score-col-label').textContent = state.slice === 'all' ? 'Win rate' : `Win rate on ${s.label}`;

      const ncol = 13;
      let html = '', lastTier = null, band = 0;
      rows.forEach(r => {
        const tc = tierColor(r.tier);
        if (grouped && r.tier !== lastTier) {
          band++; lastTier = r.tier;
          const n = totalTier[r.tier];
          const what = r.tier === 1 ? 'statistically tied with the leader' : 'tied with this tier’s leader';
          html += `<tr class="tier-head" style="--tc:${tc}"><td colspan="${ncol}"><div class="th-inner"><b>Tier ${r.tier}</b><span>${n} ${n === 1 ? 'model' : 'models'} ${what}${tierCount[r.tier] !== n ? ` (${tierCount[r.tier]} shown)` : ''}</span></div></td></tr>`;
        }
        const alt = grouped && band % 2 === 0 ? ' band-alt' : '';
        const tipName = esc(r.name);
        const cells = DIMS.map(dm => {
          const v = r[dm.key], h = heat(v);
          return `<td class="heat"><span style="background:${h.bg};color:${h.fg}" data-tip="<b>${tipName}</b><br>${esc(dm.name)}: ${raw(v)}<br><span class=k>${esc(dm.help)}</span>">${pct(v)}</span></td>`;
        }).join('');
        const elo = r.elo == null ? 'n/a' : Math.round(r.elo);
        html += `<tr class="${alt}" style="--tc:${tc}">
          <td class="rank">${rank.get(r.id)}</td>
          <td class="model l"><span class="model-name">${esc(r.name)}</span><span class="model-vendor">${esc(r.vendor)}</span></td>
          <td class="date"${r.date ? ` data-tip="<b>${tipName}</b><br>Released ${esc(r.date.replace('-', '.'))}<br><span class=k>Year and month of release</span>"` : ''}>${r.date ? esc(r.date.replace('-', '.')) : ''}</td>
          <td class="c"><span class="tag${r.open ? ' open' : ''}">${r.open ? 'OPEN' : 'CLOSED'}</span></td>
          <td class="c"><span class="tbadge${tierLight(r.tier) ? ' light' : ''}" data-tip="<b>${tipName}</b><br>Tier ${r.tier} of 5 on the overall board">T${r.tier}</span></td>
          ${`<td class="c">${r.detail ? `<span class="dcell" data-tip="<b>${tipName}</b><br>Detail sub tier D${r.detail} inside tier 1<br>Score ties won on detail: ${raw(r.detail_win)}<br><span class=k>Share of the cases tied on the base score that it wins by local point matching against the other tier 1 models. The ranking order does not change</span>"><span class="dbadge">D${r.detail}</span><span class="dnum">${pct(r.detail_win)}</span></span>` : ''}</td>`}
          <td><div class="score" data-tip="<b>${tipName}</b><br>Win rate: ${raw(r.win)}${state.slice === 'all' ? '' : ` on ${esc(s.label)}`}<br><span class=k>Share of the other models it beats on the same case, ties count half, averaged over its cases. 50 is the field average</span>"><div class="bar" aria-hidden="true"><i style="width:${r.win == null ? 0 : (r.win * 100).toFixed(1)}%"></i></div><b>${pct(r.win)}</b></div></td>
          <td class="raw" data-tip="<b>${tipName}</b><br>Score: ${raw(r.score)}${state.slice === 'all' ? '' : ` on ${esc(s.label)}`}<br><span class=k>Mean of the four dimensions over its videos. The Win rate compares these per case scores with the other models</span>">${pct(r.score)}</td>
          ${cells}
          <td class="muted" data-tip="<b>${tipName}</b><br>Gemini arena Elo ${elo}<br>Bootstrap interval ${r.elo_lo == null ? 'n/a' : Math.round(r.elo_lo)} to ${r.elo_hi == null ? 'n/a' : Math.round(r.elo_hi)}<br><span class=k>Reference only, not part of the score</span>">${elo}</td></tr>`;
      });
      if (!rows.length) html = `<tr class="empty-row"><td colspan="${ncol}">No model matches this filter.</td></tr>`;
      body.innerHTML = html;
      $('#board-meta').textContent = `${rows.length} of ${board.models.length} models · ${s.cases} cases${state.slice === 'all' ? '' : ' in this slice'}`;
      $('#slice-note').hidden = state.slice === 'all';
    }
    drawTabs(); draw();
    drawLegend();
  }

  function drawLegend() {
    const ramp = $('#heat-ramp');
    if (ramp) ramp.innerHTML = Array.from({length: 13}, (_, i) => `<i style="background:${heat(0.4 + i * 0.05).bg}"></i>`).join('');
    const tiers = $('#tier-swatches');
    if (tiers) tiers.innerHTML = [1, 2, 3, 4, 5].map(t => `<i style="background:${tierColor(t)}" title="Tier ${t}"></i>`).join('');
  }

  // Small multiples: one radar per picked model, the median of all 51 models as a gray reference shape.
  function initProfiles(board) {
    const host = $('#multiples'), sel = $('#profile-select'), chips = $('#profile-chips');
    if (!host) return;
    bindTips(host);
    let byId, median;
    function refresh() {
      const ms = board.models;
      byId = Object.fromEntries(ms.map(m => [m.id, m]));
      median = {};
      DIMS.forEach(d => {
        const xs = ms.map(m => m[d.key]).filter(v => v != null).sort((a, b) => a - b);
        const n = xs.length; median[d.key] = n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2;
      });
      sel.innerHTML = '<option value="">Add a model</option>' + ms.map(m => `<option value="${m.id}">${esc(m.name)} (T${m.tier}, win rate ${pct(m.win)})</option>`).join('');
    }
    refresh();
    let picked = ['omni12flash', 'klingo3pro', 'open_vace14b', 'open_phantom14b'].filter(id => byId[id]);
    sel.addEventListener('change', () => {
      if (sel.value && !picked.includes(sel.value) && picked.length < 4) picked.push(sel.value);
      sel.value = ''; draw();
    });
    const LO = 0.4, HI = 1.0, R = 92, C = 120;
    const ang = i => -Math.PI / 2 + i * Math.PI / 2;
    const pt = (i, v) => {
      const r = R * Math.max(0, Math.min(1, ((v ?? LO) - LO) / (HI - LO)));
      return [C + r * Math.cos(ang(i)), C + r * Math.sin(ang(i))];
    };
    const poly = vals => vals.map((v, i) => pt(i, v).map(n => n.toFixed(1)).join(',')).join(' ');
    function radar(m) {
      const rings = [0.6, 0.8, 1.0].map(v => `<polygon points="${poly([v, v, v, v])}" fill="none" stroke="#e1ddd3" stroke-width="1"/>`).join('');
      const ringLabels = [0.6, 0.8, 1.0].map(v => { const [x, y] = pt(0, v); return `<text x="${x + 4}" y="${y + 3}" font-size="9" fill="#899298">${v * 100}</text>`; }).join('');
      const axes = DIMS.map((d, i) => { const [x, y] = pt(i, HI); return `<line x1="${C}" y1="${C}" x2="${x}" y2="${y}" stroke="#d5d0c6" stroke-width="1"/>`; }).join('');
      const labels = DIMS.map((d, i) => {
        const [x, y] = pt(i, 1.0); const dx = [0, 10, 0, -10][i], dy = [-10, 4, 18, 4][i];
        const anchor = ['middle', 'start', 'middle', 'end'][i];
        return `<text x="${x + dx}" y="${y + dy}" font-size="11" font-weight="600" fill="#3f4d53" text-anchor="${anchor}">${d.short}</text>`;
      }).join('');
      const med = DIMS.map(d => median[d.key]);
      const vals = DIMS.map(d => m[d.key]);
      const tc = tierColor(m.tier);
      const dots = DIMS.map((d, i) => {
        const [x, y] = pt(i, m[d.key]);
        return `<g data-tip="<b>${esc(m.name)}</b><br>${esc(d.name)}: ${raw(m[d.key])}<br><span class=k>Median of all models: ${raw(median[d.key])}</span>"><circle cx="${x}" cy="${y}" r="13" fill="transparent"/><circle cx="${x}" cy="${y}" r="5" fill="${tc}" stroke="#fbf9f5" stroke-width="2"/></g>`;
      }).join('');
      return `<svg viewBox="0 0 240 240" role="img" aria-label="${esc(m.name)} profile on four dimensions">${rings}${axes}${ringLabels}
        <polygon points="${poly(med)}" fill="rgba(103,115,122,.10)" stroke="#9aa3a8" stroke-width="1.5"/>
        <polygon points="${poly(vals)}" fill="${tc}" fill-opacity=".16" stroke="${tc}" stroke-width="2" stroke-linejoin="round"/>${dots}${labels}</svg>`;
    }
    function draw() {
      chips.innerHTML = picked.map(id => `<span class="chip">${esc(byId[id].name)}<button data-rm="${id}" aria-label="Remove ${esc(byId[id].name)}">&#215;</button></span>`).join('');
      $$('[data-rm]', chips).forEach(b => b.onclick = () => { picked = picked.filter(x => x !== b.dataset.rm); draw(); });
      sel.disabled = picked.length >= 4;
      const cards = picked.map(id => {
        const m = byId[id];
        return `<article class="mult"><h4>${esc(m.name)}</h4><div class="sub"><span class="tbadge${tierLight(m.tier) ? ' light' : ''}" style="--tc:${tierColor(m.tier)}">T${m.tier}</span><span>${esc(m.vendor)} · ${m.open ? 'Open' : 'Closed'} · Win rate ${pct(m.win)} · Score ${pct(m.score)}</span></div>
          ${radar(m)}<dl>${DIMS.map(d => `<div><dt>${d.short}</dt><dd>${pct(m[d.key])}</dd></div>`).join('')}</dl></article>`;
      });
      for (let i = picked.length; i < 4; i++) cards.push('<div class="mult placeholder">Pick a model above</div>');
      host.innerHTML = cards.join('');
    }
    draw();
  }
})();
