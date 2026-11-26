/* Leaderboard (Core-110 52-model & Full-566 12-model switcher), dimension profiles and main page case viewer. */
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

  const dates = loadJSON('data/release_dates.json').catch(() => ({models: []}));
  Promise.all([
    loadJSON('data/leaderboard.json'),
    loadJSON('data/leaderboard_full566.json'),
    loadJSON('data/benchmark.json'),
    dates
  ]).then(([boardCore, boardFull, bench, rel]) => {
    const relMap = Object.fromEntries((rel.models || []).map(x => [x.tag, x]));
    const attachRelease = m => {
      const info = relMap[m.id] || {};
      m.date = info.date || null;
      m.exact_date = info.exact_date || null;
      m.date_note = info.source_note || '';
    };
    boardCore.models.forEach(attachRelease);
    boardFull.models.forEach(attachRelease);
    const meta = modelMeta(boardCore);
    buildWall(bench, meta);
    initBoard(boardCore, boardFull);
    initProfiles(boardCore);
    const ex = $('#examples-viewer');
    if (ex) FS2V.initCases(ex, bench, meta, 'taxonomy');
  }).catch(err => {
    const el = $('#board-body');
    if (el) el.innerHTML = `<tr class="empty-row"><td colspan="11">The leaderboard data could not be loaded (${esc(err.message)}).</td></tr>`;
  });

  function initBoard(boardCore, boardFull) {
    const state = {dataset: 'core', group: 'overall', slice: 'all', access: 'all', q: '', key: 'tier', dir: 1};
    const curBoard = () => state.dataset === 'core' ? boardCore : boardFull;
    const sliceOf = id => curBoard().slices.find(s => s.id === id) || curBoard().slices[0];
    const groupTabs = $('#slice-groups'), sliceTabs = $('#slice-tabs'), scopeBanner = $('#scope-banner');
    const body = $('#board-body'), table = $('#board');
    bindTips(table);

    $$('#dataset-seg button').forEach(b => b.onclick = () => {
      state.dataset = b.dataset.ds;
      $$('#dataset-seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      state.group = 'overall';
      state.slice = 'all';
      state.key = 'tier';
      state.dir = 1;
      drawTabs(); draw();
    });

    function drawTabs() {
      const board = curBoard();
      groupTabs.innerHTML = SLICE_GROUPS.map(g => `<button data-g="${g.id}" aria-pressed="${g.id === state.group}">${g.label}</button>`).join('');
      const subs = board.slices.filter(s => s.group === state.group);
      sliceTabs.hidden = state.group === 'overall';
      sliceTabs.innerHTML = subs.map(s => `<button data-s="${s.id}" aria-pressed="${s.id === state.slice}">${esc(s.label)} <span style="opacity:.7">(${s.cases})</span></button>`).join('');
      $$('[data-g]', groupTabs).forEach(b => b.onclick = () => {
        state.group = b.dataset.g;
        state.slice = curBoard().slices.find(s => s.group === state.group).id;
        if (state.slice !== 'all' && state.key === 'tier') { state.key = 'score'; state.dir = -1; }
        if (state.slice === 'all' && state.key === 'score') { state.key = 'tier'; state.dir = 1; }
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
      const board = curBoard(), s = sliceOf(state.slice);
      return board.models.map(m => {
        const v = state.slice === 'all' ? m : {...m, ...s.scores[m.id]};
        return {...v, date: m.date, exact_date: m.exact_date, date_note: m.date_note, tier: m.tier, tier_method: m.tier_method, detail: m.detail, detail_win: m.detail_win, elo: m.elo, elo_lo: m.elo_lo, elo_hi: m.elo_hi};
      }).filter(r => r.score != null && r.n > 0)
        .filter(r => state.access === 'all' || (state.access === 'open') === r.open)
        .filter(r => !state.q || r.name.toLowerCase().includes(state.q) || r.vendor.toLowerCase().includes(state.q));
    }

    function draw() {
      const board = curBoard(), s = sliceOf(state.slice);
      const rows = rowsFor();
      const k = state.key, d = state.dir;
      const grouped = state.slice === 'all' && (k === 'tier' || ((k === 'win' || k === 'score') && d === -1));
      const inner = k === 'tier' ? 'score' : k;
      rows.sort((a, b) => {
        if (grouped && a.tier !== b.tier) return (k === 'tier' ? d : 1) * (a.tier - b.tier);
        const kk = grouped ? inner : k, dd = grouped && k === 'tier' ? -1 : d;
        const x = a[kk], y = b[kk];
        if (x == null && y == null) return b.score - a.score;
        if (x == null) return 1;
        if (y == null) return -1;
        if (typeof x === 'string') return dd * x.localeCompare(y);
        if (x !== y) return dd * (x - y);
        return b.score - a.score;
      });

      const tierCount = {}, totalTier = {};
      rows.forEach(r => { tierCount[r.tier] = (tierCount[r.tier] || 0) + 1; });
      board.models.forEach(m => { totalTier[m.tier] = (totalTier[m.tier] || 0) + 1; });

      if (scopeBanner) {
        if (state.dataset === 'core') {
          scopeBanner.innerHTML = `<strong>Core-110 Official Leaderboard (52 models · 5,692 videos).</strong> Includes newly evaluated <strong>MiniMax-H3 (Open, Ref2VA)</strong> under raw prompts (Score <strong>90.9</strong>, #9 overall, #1 Product Identity at <strong>95.2</strong> vs. 89.5 for hosted MiniMax H3; placed in Tier 1 by its score inside [87.8, 93.5] and sole Tier 1 across all 10 open-weight models at <em>p</em> = 1.0×10⁻⁵).`;
        } else {
          scopeBanner.innerHTML = `<strong>Full-566 Extended v7.8 Suite (12 models · 5,714 videos / 5,712 scored across all 566 benchmark cases).</strong> Covers all 9 complete 566-case open-weight models plus historical commercial checkpoints linking to the 15-model human study (<strong>Kling 1.6</strong> <em>n</em>=434, <strong>Sora 2</strong> <em>n</em>=94 Core, <strong>Sora 2 Pro</strong> <em>n</em>=93 Core). Across the 9 complete open-weight models, Full-566 vs. Core-110 rank correlation is <strong>Spearman ρ = 0.9333</strong> (recomputed vs. locked Core ρ = 1.0000), and 13-model Core human preference correlation (excluding native 10s Sora clips) is <strong>ρ = 0.8516</strong> (15-model Core realism <em>r</em> = 0.8244 / ρ = 0.7821).`;
        }
      }

      $$('#board thead th.sortable').forEach(th => {
        if (th.dataset.k === k) th.setAttribute('aria-sort', d === 1 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
        const a = $('.arrow', th); if (a) a.textContent = th.dataset.k === k ? (d === 1 ? '↑' : '↓') : '↓';
      });
      $('#tier-col-label').textContent = state.slice === 'all' ? 'Tier' : 'Overall tier';
      $('#score-col-label').textContent = state.slice === 'all' ? 'Score' : `Score on ${s.label}`;
      const scoreTh = $('#score-th') || $('#board thead th[data-k="score"]');
      if (scoreTh) {
        scoreTh.dataset.tip = state.slice === 'all'
          ? (state.dataset === 'core'
            ? 'Headline: weighted mean of the four dimensions over each model’s scored Core-110 videos'
            : 'Headline: weighted mean of the four dimensions over each model’s scored Full-566 videos')
          : `Headline: weighted mean of the four dimensions over each model’s scored videos in ${s.label} (${s.cases} ${state.dataset === 'core' ? 'Core-110' : 'Full-566'} cases)`;
      }
      $('#elo-th').hidden = state.dataset === 'full566';

      const ncol = state.dataset === 'full566' ? 10 : 11;
      let html = '', lastTier = null, band = 0;
      rows.forEach(r => {
        const tc = tierColor(r.tier);
        if (grouped && r.tier !== lastTier) {
          band++; lastTier = r.tier;
          const n = totalTier[r.tier];
          const what = r.tier === 1
            ? (state.dataset === 'core' ? '25 tied by step-down Wilcoxon + MiniMax-H3 (Open) in [87.8, 93.5]' : 'statistically tied with the leader on shared cases')
            : 'tied with this tier’s leader';
          html += `<tr class="tier-head" style="--tc:${tc}"><td colspan="${ncol}"><div class="th-inner"><b>Tier ${r.tier}</b><span>${n} ${n === 1 ? 'model' : 'models'} · ${what}${tierCount[r.tier] !== n ? ` (${tierCount[r.tier]} shown)` : ''}</span></div></td></tr>`;
        }
        const alt = grouped && band % 2 === 0 ? ' band-alt' : '';
        const tipName = esc(r.name);
        const cells = DIMS.map(dm => {
          const v = r[dm.key], h = heat(v);
          return `<td class="heat"><span style="background:${h.bg};color:${h.fg}" data-tip="<b>${tipName}</b><br>${esc(dm.name)}: ${raw(v)}<br><span class=k>${esc(dm.help)}</span>">${pct(v)}</span></td>`;
        }).join('');
        const elo = r.elo == null ? '—' : Math.round(r.elo);
        const dateTxt = r.date ? esc(r.date.replace('-', '.')) : '—';
        const dateTip = r.date
          ? `<b>${tipName}</b><br>Released: ${esc(r.exact_date || r.date)}${r.date_note ? `<br><span class=k>${esc(r.date_note)}</span>` : ''}`
          : `<b>${tipName}</b><br>Release date unverified<br><span class=k>${esc(r.date_note || 'No single public checkpoint date verified')}</span>`;
        const newTag = r.id === 'open_minimaxh3' ? ' <span class="tag new">NEW</span>' : '';
        const nBadge = (state.dataset === 'full566' || r.n !== s.cases) ? `<span class="model-n" title="${r.n} of ${s.cases} cases scored">n=${r.n}</span>` : '';
        const tierTip = r.tier_method
          ? `<b>${tipName}</b><br>Placed in Tier 1 by Score (90.9) inside locked Tier 1 interval [87.8, 93.5]; sole Tier 1 in 10-model open-weight Holm-Wilcoxon test (p = 1.0e-5)`
          : `<b>${tipName}</b><br>Tier ${r.tier} on the ${state.dataset === 'core' ? '51-model Core-110' : 'Full-566'} Holm-Wilcoxon board`;
        const winTip = r.win == null
          ? `<b>${tipName}</b><br>Evaluated post-freeze on identical v7.8 Open-Judge protocol; 51-model pool win rate not recomputed (Open-10 cohort win rate: 87.1%)`
          : `<b>${tipName}</b><br>Win rate: ${raw(r.win)}${state.slice === 'all' ? '' : ` on ${esc(s.label)}`}<br><span class=k>Share of other models beaten on the same case (ties count half)</span>`;
        const eloCell = state.dataset === 'full566'
          ? ''
          : `<td class="muted" data-tip="<b>${tipName}</b><br>${r.elo == null ? 'Not included in the earlier Gemini pairwise arena run' : `Gemini arena Elo ${elo}<br>Bootstrap interval ${r.elo_lo == null ? '—' : Math.round(r.elo_lo)} to ${r.elo_hi == null ? '—' : Math.round(r.elo_hi)}`}"><span class="mono" style="font-size:12px">${elo}</span></td>`;

        html += `<tr class="${alt}" style="--tc:${tc}">
          <td class="rank c"><span class="tbadge${tierLight(r.tier) ? ' light' : ''}" data-tip="${tierTip}">T${r.tier}</span></td>
          <td class="c">${r.detail ? `<span class="dcell" data-tip="<b>${tipName}</b><br>Detail sub tier D${r.detail} inside pre-release tier 1<br>Score ties won on detail: ${raw(r.detail_win)}"><span class="dbadge">D${r.detail}</span><span class="dnum">${pct(r.detail_win)}</span></span>` : ''}</td>
          <td class="model l"><span class="model-name">${esc(r.name)}${nBadge}</span><span class="model-vendor">${esc(r.vendor)} <span class="tag${r.open ? ' open' : ''}">${r.open ? 'OPEN' : 'CLOSED'}</span>${newTag}</span></td>
          <td class="date" data-tip="${dateTip}">${dateTxt}</td>
          <td><div class="score" data-tip="<b>${tipName}</b><br>Score: ${raw(r.score)} (${r.n} videos)${state.slice === 'all' ? '' : ` on ${esc(s.label)}`}<br><span class=k>Weighted mean of the four dimensions</span>"><div class="bar" aria-hidden="true"><i style="width:${r.score == null ? 0 : (r.score * 100).toFixed(1)}%"></i></div><b>${pct(r.score)}</b></div></td>
          <td class="raw" data-tip="${winTip}">${pct(r.win)}</td>
          ${cells}
          ${eloCell}</tr>`;
      });
      if (!rows.length) html = `<tr class="empty-row"><td colspan="${ncol}">No model matches this filter.</td></tr>`;
      body.innerHTML = html;
      $('#board-meta').textContent = `${rows.length} of ${board.models.length} models · ${s.cases} cases${state.slice === 'all' ? '' : ' in this slice'}`;
      const sn = $('#slice-note');
      if (sn) {
        sn.hidden = state.slice === 'all';
        sn.textContent = state.dataset === 'core'
          ? 'Slice boards compute the Win rate and the Score over the slice’s cases only (10 to 80 cases), so small gaps are noisy. The tier badge always shows the overall tier.'
          : 'Slice boards compute the Win rate and the Score over the slice’s cases only (20 to 481 cases), so small gaps on smaller slices are noisy. The tier badge always shows the overall tier.';
      }
      const dn = $('#detail-note');
      if (dn) dn.hidden = state.dataset === 'full566';
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
      sel.innerHTML = '<option value="">Add a model</option>' + ms.map(m => `<option value="${m.id}">${esc(m.name)} (T${m.tier}, Score ${pct(m.score)})</option>`).join('');
    }
    refresh();
    let picked = ['omni12flash', 'open_minimaxh3', 'h3', 'open_vace14b'].filter(id => byId[id]);
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
        return `<g data-tip="<b>${esc(m.name)}</b><br>${esc(d.name)}: ${raw(m[d.key])}<br><span class=k>Median of all 52 models: ${raw(median[d.key])}</span>"><circle cx="${x}" cy="${y}" r="13" fill="transparent"/><circle cx="${x}" cy="${y}" r="5" fill="${tc}" stroke="#fbf9f5" stroke-width="2"/></g>`;
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
        return `<article class="mult"><h4>${esc(m.name)}</h4><div class="sub"><span class="tbadge${tierLight(m.tier) ? ' light' : ''}" style="--tc:${tierColor(m.tier)}">T${m.tier}</span><span>${esc(m.vendor)} · ${m.open ? 'Open' : 'Closed'} · Score ${pct(m.score)}${m.win != null ? ' · Win ' + pct(m.win) : ''}</span></div>
          ${radar(m)}<dl>${DIMS.map(d => `<div><dt>${d.short}</dt><dd>${pct(m[d.key])}</dd></div>`).join('')}</dl></article>`;
      });
      for (let i = picked.length; i < 4; i++) cards.push('<div class="mult placeholder">Pick a model above</div>');
      host.innerHTML = cards.join('');
    }
    draw();
  }
})();
