/* Benchmark page: taxonomy matrix, statistics charts, per slice comparison table and the case browser. */
(() => {
  'use strict';
  const {$, $$, esc, tierColor, tierLight, heat, WIN_LO, WIN_HI, pct, raw, loadJSON, bindTips, initChrome, modelMeta, ATTR} = window.FS2V;
  initChrome();
  // categorical slots 1 to 3 of the validated palette (all pairs pass), used only in the spread chart
  const S1 = '#2a78d6', S2 = '#eb6834', S3 = '#1baf7a';
  const PT_ORDER = ['selling_prompt', 'living_prompt', 'comparison_prompt', 'tryon_prompt', 'realsell_prompt'];
  const PT_DEF = {
    selling_prompt: 'a cinematic showcase of the product',
    living_prompt: 'a host presents the product in a simulated live broadcast',
    comparison_prompt: 'two products side by side, compared feature by feature',
    tryon_prompt: 'a model wears the garment and turns to show it',
    realsell_prompt: 'plain seller style footage on a white background'
  };
  const RULES = {
    text_logo: 'A product carries a logo, text, letters, numerals, an engraving or a monogram',
    small_jewelry: 'Jewelry category: earrings, rings, charms, brooches, necklaces, watches',
    near_twin: 'Two product case whose reference products look very similar',
    countable_hardware: 'A product has hardware or a pattern with a countable number of parts',
    hands_on: 'The brief asks for a hand action such as fastening, buckling, zipping, lacing or putting on',
    full_turn_360: 'The brief asks for a full 360 degree turn'
  };

  Promise.all([loadJSON('data/leaderboard.json'), loadJSON('data/benchmark.json')]).then(([board, bench]) => {
    const meta = modelMeta(board);
    const st = bench.stats;
    drawMatrix(st);
    $('#pt-defs').innerHTML = PT_ORDER.map(k => `<strong>${esc(st.prompt_types[k])}</strong>: ${esc(PT_DEF[k])}`).join('. ') + '.';
    $('#bench-stats').innerHTML = [
      [st.core_cases, 'Core cases'], [st.products, 'Products'], [st.dual, 'Two product cases'],
      [st.hard_cases, 'Core Hard cases'], [st.motion_required, 'Cases that ask for product motion']
    ].map(([n, l]) => `<div><strong>${n}</strong><span>${l}</span></div>`).join('');
    drawAttrs(st);
    drawSpread(board);
    $('#attr-rules').innerHTML = Object.keys(RULES).map(k => `<tr><td class="l"><span class="model-name" style="font-size:13px">${esc(ATTR[k])}</span></td><td class="l" style="white-space:normal;color:var(--ink2)">${esc(RULES[k])}</td><td>${st.hard_attributes[k]}</td></tr>`).join('');
    drawSliceTable(board);
    const api = FS2V.initCases($('#case-browser'), bench, meta, 'taxonomy');
    $$('#matrix [data-family]').forEach(el => {
      const go = () => { const [c, p] = el.dataset.family.split('|'); api.select(c, p); $('#cases').scrollIntoView({behavior: FS2V.reduceMotion ? 'auto' : 'smooth'}); };
      el.addEventListener('click', go);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }).catch(err => { $('#mx-body').innerHTML = `<tr class="empty-row"><td colspan="16">Data could not be loaded (${esc(err.message)}).</td></tr>`; });

  function drawMatrix(st) {
    const fam = {};
    st.families.forEach(f => { fam[f.category + '|' + f.prompt] = f.cases; });
    let h = '<div></div>' + PT_ORDER.map(k => `<div class="h">${esc(st.prompt_types[k].toUpperCase())}</div>`).join('');
    st.categories.forEach(c => {
      h += `<div class="r">${esc(c)}</div>`;
      PT_ORDER.forEach(p => {
        const n = fam[c + '|' + p];
        h += n ? `<div class="cell on" role="button" tabindex="0" data-family="${c}|${p}" aria-label="${c} ${st.prompt_types[p]}, ${n} cases"><b>${n}</b><small>CASES</small></div>` : '<div class="cell off" aria-hidden="true"></div>';
      });
    });
    $('#matrix').innerHTML = h;
  }

  const roundEnd = (x, y, w, h, r) => {
    r = Math.min(r, w, h / 2);
    return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 -${r},${r}h-${w - r}Z`;
  };

  function drawAttrs(st) {
    const keys = Object.keys(RULES).sort((a, b) => st.hard_attributes[b] - st.hard_attributes[a]);
    const W = 520, L = 140, rowH = 30, barH = 14, top = 6, max = 40;
    const x = v => L + (W - L - 40) * v / max;
    let s = '';
    [0, 10, 20, 30, 40].forEach(t => { s += `<line x1="${x(t)}" x2="${x(t)}" y1="0" y2="${top + keys.length * rowH}" stroke="#e1ddd3"/><text x="${x(t)}" y="${top + keys.length * rowH + 14}" font-size="10" fill="#899298" text-anchor="middle">${t}</text>`; });
    keys.forEach((k, i) => {
      const y = top + i * rowH, v = st.hard_attributes[k];
      s += `<g class="hbar" data-tip="<b>${esc(ATTR[k])}</b><br>${v} of ${st.core_cases} Core cases<br><span class=k>${esc(RULES[k])}</span>">
        <rect class="hit" x="0" y="${y}" width="${W}" height="${rowH}"/>
        <text x="${L - 10}" y="${y + rowH / 2 + 4}" font-size="12" fill="#3f4d53" text-anchor="end">${esc(ATTR[k])}</text>
        <path class="mark" d="${roundEnd(x(0), y + (rowH - barH) / 2, x(v) - x(0), barH, 4)}" fill="${S1}"/>
        <text x="${x(v) + 6}" y="${y + rowH / 2 + 4}" font-size="12" font-weight="600" fill="#1d282d">${v}</text></g>`;
    });
    const svg = $('#chart-attrs');
    svg.setAttribute('viewBox', `0 0 ${W} ${top + keys.length * rowH + 20}`);
    svg.innerHTML = s;
    bindTips(svg.parentElement);
  }

  function drawSpread(board) {
    const slices = board.slices;
    const W = 520, L = 120, rowH = 26, top = 4, lo = 0.4, hi = 1.0;
    const x = v => L + (W - L - 16) * (v - lo) / (hi - lo);
    const name = Object.fromEntries(board.models.map(m => [m.id, m]));
    let s = '';
    [0.4, 0.6, 0.8, 1.0].forEach(t => { s += `<line x1="${x(t)}" x2="${x(t)}" y1="0" y2="${top + slices.length * rowH}" stroke="#e1ddd3"/><text x="${x(t)}" y="${top + slices.length * rowH + 14}" font-size="10" fill="#899298" text-anchor="middle">${Math.round(t * 100)}</text>`; });
    slices.forEach((sl, i) => {
      const ent = Object.entries(sl.scores).filter(([, v]) => v.score != null).map(([id, v]) => ({id, v: v.score}));
      ent.sort((a, b) => a.v - b.v);
      const n = ent.length, med = n % 2 ? ent[(n - 1) / 2].v : (ent[n / 2 - 1].v + ent[n / 2].v) / 2;
      const best = ent[n - 1], worst = ent[0];
      const bestOpen = ent.filter(e => name[e.id].open).pop();
      const y = top + i * rowH + rowH / 2;
      const tipTxt = `<b>${esc(sl.label)}</b> (${sl.cases} cases), Score<br>Best: ${esc(name[best.id].name)} ${raw(best.v)}<br>Median model: ${raw(med)}<br>Best open source: ${esc(name[bestOpen.id].name)} ${raw(bestOpen.v)}<br>Lowest: ${esc(name[worst.id].name)} ${raw(worst.v)}`;
      s += `<g data-tip="${tipTxt}"><rect x="0" y="${y - rowH / 2}" width="${W}" height="${rowH}" fill="transparent"/>
        ${i === 0 || sl.group !== slices[i - 1].group ? `<line x1="0" x2="${W}" y1="${y - rowH / 2}" y2="${y - rowH / 2}" stroke="#d5d0c6"/>` : ''}
        <text x="${L - 10}" y="${y + 4}" font-size="12" fill="#3f4d53" text-anchor="end" ${sl.id === 'all' ? 'font-weight="600"' : ''}>${esc(sl.label === 'All Core cases' ? 'All Core' : sl.label)}</text>
        <line x1="${x(worst.v)}" x2="${x(best.v)}" y1="${y}" y2="${y}" stroke="#b9bfc2" stroke-width="2" stroke-linecap="round"/>
        <circle cx="${x(bestOpen.v)}" cy="${y}" r="5" fill="${S3}" stroke="#fbf9f5" stroke-width="2"/>
        <circle cx="${x(med)}" cy="${y}" r="5" fill="${S1}" stroke="#fbf9f5" stroke-width="2"/>
        <circle cx="${x(best.v)}" cy="${y}" r="5" fill="${S2}" stroke="#fbf9f5" stroke-width="2"/></g>`;
    });
    const svg = $('#chart-spread');
    svg.setAttribute('viewBox', `0 0 ${W} ${top + slices.length * rowH + 20}`);
    svg.innerHTML = s;
    $('#spread-legend').innerHTML = [[S2, 'Best model'], [S1, 'Median model'], [S3, 'Best open source'], ['#b9bfc2', 'Range']].map(([c, l]) => `<span style="display:inline-flex;align-items:center;gap:6px"><i style="width:10px;height:10px;border-radius:50%;background:${c};display:inline-block"></i>${l}</span>`).join('');
    bindTips(svg.parentElement);
  }

  function drawSliceTable(board) {
    const cols = board.slices;
    const short = {all: 'Overall', single: 'Single', dual: 'Two prod.', hard: 'Core Hard'};
    const state = {key: 'all', dir: -1, access: 'all', q: '', metric: 'score'};
    const bestOf = (c, k) => Math.max(...Object.values(c.scores).map(v => v[k] ?? -1));
    const groupLabel = {overall: '', category: 'CATEGORY', prompt: 'PROMPT TYPE', structure: 'STRUCTURE'};
    const head = $('#mx-head');
    const groups = [];
    cols.forEach(c => { const g = groups[groups.length - 1]; if (g && g.id === c.group) g.n++; else groups.push({id: c.group, n: 1}); });
    head.innerHTML = `<tr><th class="rank" rowspan="2"></th><th class="model l sortable" rowspan="2" data-k="name">Model <span class="arrow">↓</span></th><th class="c" rowspan="2">Tier</th>${groups.map(g => `<th class="c" colspan="${g.n}" style="padding-bottom:2px;border-bottom:0">${groupLabel[g.id]}</th>`).join('')}</tr>
      <tr>${cols.map(c => `<th class="c sortable" data-k="${c.id}" data-tip="${esc(c.label)}: ${c.cases} cases">${esc(short[c.id] || c.label)} <span class="arrow">↓</span></th>`).join('')}</tr>`;
    bindTips($('#mx-table'));
    $$('th.sortable', head).forEach(th => {
      th.tabIndex = 0;
      const go = () => { const k = th.dataset.k; if (state.key === k) state.dir *= -1; else { state.key = k; state.dir = k === 'name' ? 1 : -1; } draw(); };
      th.addEventListener('click', go);
      th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    $$('#mx-access button').forEach(b => b.onclick = () => { state.access = b.dataset.a; $$('#mx-access button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); });
    $('#mx-search').addEventListener('input', e => { state.q = e.target.value.trim().toLowerCase(); draw(); });
    $$('#mx-metric button').forEach(b => b.onclick = () => { state.metric = b.dataset.m; $$('#mx-metric button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); });
    const byId = Object.fromEntries(cols.map(c => [c.id, c]));
    function draw() {
      let rows = board.models.filter(m => state.access === 'all' || (state.access === 'open') === m.open)
        .filter(m => !state.q || m.name.toLowerCase().includes(state.q) || m.vendor.toLowerCase().includes(state.q));
      const mk = state.metric;
      const val = (m, k) => k === 'name' ? m.name : byId[k].scores[m.id][mk];
      rows.sort((a, b) => {
        const x = val(a, state.key), y = val(b, state.key);
        if (x == null) return 1; if (y == null) return -1;
        return typeof x === 'string' ? state.dir * x.localeCompare(y) : state.dir * (x - y);
      });
      $$('th.sortable', head).forEach(th => {
        const on = th.dataset.k === state.key;
        if (on) th.setAttribute('aria-sort', state.dir === 1 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
        $('.arrow', th).textContent = on && state.dir === 1 ? '↑' : '↓';
      });
      $('#mx-body').innerHTML = rows.length ? rows.map((m, i) => `<tr style="--tc:${tierColor(m.tier)}"><td class="rank">${i + 1}</td>
        <td class="model l"><span class="model-name">${esc(m.name)}</span><span class="model-vendor">${esc(m.vendor)}${m.open ? ' · open' : ''}</span></td>
        <td class="c"><span class="tbadge${tierLight(m.tier) ? ' light' : ''}">T${m.tier}</span></td>
        ${cols.map(c => {
          const s = c.scores[m.id], v = s[mk], h = mk === 'win' ? heat(v, WIN_LO, WIN_HI) : heat(v), top = v != null && Math.abs(v - bestOf(c, mk)) < 1e-9;
          return `<td class="heat"><span style="background:${h.bg};color:${h.fg};${top ? 'box-shadow:inset 0 0 0 2px #1d282d;font-weight:700' : ''}" data-tip="<b>${esc(m.name)}</b> on ${esc(c.label)}<br>Win rate: ${raw(s.win)}<br>Score: ${raw(s.score)}${top ? '<br>Best on this slice' : ''}">${pct(v)}</span></td>`;
        }).join('')}</tr>`).join('') : '<tr class="empty-row"><td colspan="16">No model matches this filter.</td></tr>';
      const lo = mk === 'win' ? WIN_LO : 0.4, hi = mk === 'win' ? WIN_HI : 1.0;
      $('#heat-ramp').innerHTML = Array.from({length: 13}, (_, i) => `<i style="background:${heat(lo + i * (hi - lo) / 12, lo, hi).bg}"></i>`).join('');
      $('#ramp-label').textContent = mk === 'win' ? 'Win rate' : 'Score';
      $('#ramp-lo').textContent = Math.round(lo * 100); $('#ramp-hi').textContent = Math.round(hi * 100);
    }
    draw();
    $('#tier-swatches').innerHTML = [1, 2, 3, 4, 5].map(t => `<i style="background:${tierColor(t)}" title="Tier ${t}"></i>`).join('');
  }
})();
