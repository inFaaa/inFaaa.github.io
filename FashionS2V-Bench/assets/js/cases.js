/* Case viewer shared by the main page and the benchmark page.
   Default shows 6 models (3 closed + 3 open led by MiniMax-H3 Open); toggle reveals all 7 (+ HunyuanCustom). */
(() => {
  'use strict';
  const {$, $$, esc, watchVideo, unwatchVideos, outputCard} = window.FS2V;
  const CAT = ['Clothing', 'Footwear', 'Accessories', 'Jewelry'];
  const ATTR = {text_logo: 'Text or logo', small_jewelry: 'Small jewelry', near_twin: 'Near twin pair',
    countable_hardware: 'Countable hardware', hands_on: 'Hands on action', full_turn_360: 'Full 360 turn'};

  function caseRail(c, ptypes) {
    const refs = c.refs.map((r, i) => `<figure class="ref" style="margin:0"><img src="${esc(r)}" alt="Reference image ${i + 1}" loading="lazy"><span>${c.dual ? `Product ${i + 1}` : 'Reference'}</span></figure>`).join('');
    const attrs = c.attributes.map(a => `<span class="attr">${esc(ATTR[a] || a)}</span>`).join(' ');
    return `<div class="case-rail">
      <div><div class="rail-title">References</div><div class="refs">${refs}</div>
        <div class="rail-title" style="margin-top:18px">Case
          <span class="attr">${esc(c.category)}</span><span class="attr">${esc(ptypes[c.prompt] || c.prompt)}</span>
          <span class="attr">${c.dual ? 'Two products' : 'Single product'}</span>${c.hard ? '<span class="attr hard">Core Hard</span>' : ''}</div>
        ${attrs ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${attrs}</div>` : ''}</div>
      <div class="rail-prompt"><div class="rail-title">Description sent to every model</div>
        <p class="desc">${esc(c.description)}</p>
        ${c.camera.length ? `<ul class="cam" hidden>${c.camera.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <button class="subtle" data-expand aria-expanded="false">Read full description +</button></div></div>`;
  }

  function init(root, bench, meta, mode) {
    const cases = bench.cases, ptypes = bench.stats.prompt_types;
    let cat = 0, pt = 0, idx = 0, showAll7 = false, visible = cases.map((c, i) => i);
    root.innerHTML = `${mode === 'taxonomy' ? '<div class="tabs" data-cats role="group" aria-label="Product category"></div><div class="tabs sub" data-pts role="group" aria-label="Prompt type"></div>' : ''}
      <div class="case-nav">
        <span class="where" data-where></span>
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div class="seg" data-mcount role="group" aria-label="Models shown">
            <button type="button" data-all="0" aria-pressed="true">6 models (3 closed + 3 open)</button>
            <button type="button" data-all="1" aria-pressed="false">All 7 (+ HunyuanCustom)</button>
          </div>
          <div class="pager"><button class="round-button" data-prev aria-label="Previous case">&#8592;</button><span data-pos aria-live="polite"></span><button class="round-button" data-next aria-label="Next case">&#8594;</button></div>
        </div>
      </div>
      <div class="case-console" data-console></div>`;
    const cons = $('[data-console]', root);
    FS2V.bindTips(cons);

    $$('[data-mcount] button', root).forEach(b => b.onclick = () => {
      showAll7 = b.dataset.all === '1';
      $$('[data-mcount] button', root).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      render(idx);
    });

    function render(i) {
      idx = i; const c = cases[i];
      unwatchVideos(cons);
      const outs = showAll7 ? c.outputs : c.outputs.filter(o => o.model !== 'open_hunyuancustom');
      cons.innerHTML = caseRail(c, ptypes) + `<div class="outputs">${outs.map(o => outputCard(o, meta)).join('')}</div>`;
      $$('video', cons).forEach(watchVideo);
      const btn = $('[data-expand]', cons);
      btn.addEventListener('click', () => {
        const open = $('.desc', cons).classList.toggle('open');
        const cam = $('.cam', cons); if (cam) cam.hidden = !open;
        btn.textContent = open ? 'Show less' : 'Read full description +';
        btn.setAttribute('aria-expanded', open);
      });
      $('[data-pos]', root).textContent = `${visible.indexOf(i) + 1} / ${visible.length}`;
      $('[data-where]', root).textContent = `${c.category} / ${ptypes[c.prompt]}${c.dual ? ' / two products' : ''}`;
      $('[data-prev]', root).disabled = $('[data-next]', root).disabled = visible.length < 2;
    }
    function catsWith() { return CAT.filter(k => cases.some(c => c.category === k)); }
    function updateTabs() {
      const cats = catsWith(), k = cats[cat];
      const pts = Object.keys(ptypes).filter(p => cases.some(c => c.category === k && c.prompt === p));
      $('[data-cats]', root).innerHTML = cats.map((x, i) => `<button data-cat="${i}" aria-pressed="${i === cat}">${esc(x)}</button>`).join('');
      $('[data-pts]', root).innerHTML = pts.map((p, i) => `<button data-pt="${i}" aria-pressed="${i === pt}">${esc(ptypes[p])}</button>`).join('');
      $$('[data-cat]', root).forEach(b => b.onclick = () => { cat = +b.dataset.cat; pt = 0; updateTabs(); });
      $$('[data-pt]', root).forEach(b => b.onclick = () => { pt = +b.dataset.pt; updateTabs(); });
      visible = cases.map((c, i) => i).filter(i => cases[i].category === k && cases[i].prompt === pts[pt]);
      if (visible.length) render(visible[0]);
    }
    const move = d => { const p = visible.indexOf(idx); render(visible[(p + d + visible.length) % visible.length]); };
    $('[data-prev]', root).onclick = () => move(-1);
    $('[data-next]', root).onclick = () => move(1);
    const api = {
      select(category, prompt) {
        if (mode !== 'taxonomy') return;
        cat = Math.max(0, catsWith().indexOf(category));
        const pts = Object.keys(ptypes).filter(p => cases.some(c => c.category === category && c.prompt === p));
        pt = Math.max(0, pts.indexOf(prompt)); updateTabs();
      }
    };
    if (mode === 'taxonomy') updateTabs(); else render(0);
    return api;
  }
  window.FS2V.initCases = init;
  window.FS2V.ATTR = ATTR;
})();
