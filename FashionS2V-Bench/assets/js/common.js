/* FashionS2V-Bench shared helpers: data loading, number formats, validated color scales, tooltip,
   scroll reveal, mobile nav, the drifting cover wall and in view autoplay for case videos.
   Color notes: tier colors are one ordinal copper ramp (validated light to dark, light end 2.25:1 on the surface),
   heat cells use one sequential blue ramp, tiers and tags always carry a text label so color is never the only cue. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // five display tiers: the lowest one merges the two lowest statistical tiers
  const TIER = ['#6e3626', '#8a4732', '#a3593e', '#b86c4f', '#d99a7c'];
  const tierColor = t => TIER[Math.min(Math.max(t, 1), 5) - 1];
  const tierLight = t => t >= 5;
  const HEAT = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281'];
  const HEAT_LO = 0.4, HEAT_HI = 1.0;
  const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const WIN_LO = 0.1, WIN_HI = 0.75;
  function heat(v, lo = HEAT_LO, hi = HEAT_HI) {
    if (v == null) return {bg: 'transparent', fg: '#899298'};
    const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    const x = t * (HEAT.length - 1), i = Math.min(HEAT.length - 2, Math.floor(x)), f = x - i;
    const a = hex2rgb(HEAT[i]), b = hex2rgb(HEAT[i + 1]);
    const c = a.map((v0, k) => Math.round(v0 + (b[k] - v0) * f));
    return {bg: `rgb(${c.join(',')})`, fg: t >= 0.62 ? '#ffffff' : '#1d282d'};
  }
  const pct = v => v == null ? 'n/a' : (v * 100).toFixed(1);
  const raw = v => v == null ? 'n/a' : v.toFixed(4);

  const DIMS = [
    {key: 'I6', short: 'ID', name: 'Product identity', help: 'Share of product attributes judged the same as in the reference image'},
    {key: 'D', short: 'DEF', name: 'No major defect', help: '1 without a visible defect, 0.5 when the worst defect is minor, 0 when a major defect is visible'},
    {key: 'CTX', short: 'CTX', name: 'Scene and action', help: 'Adherence to the requested scene and action, plus composition on two product cases'},
    {key: 'MOT', short: 'MOT', name: 'Product motion', help: 'Motion gate: the product moves as the prompt asks. Enters the score only where the prompt asks for product motion'}
  ];

  const cache = {};
  const loadJSON = url => cache[url] || (cache[url] = fetch(url).then(r => {
    if (!r.ok) throw new Error(url + ' ' + r.status);
    return r.json();
  }));

  // Tooltip: one shared element, follows the pointer, also shown on keyboard focus.
  let tip;
  function showTip(html, x, y) {
    if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    tip.innerHTML = html; tip.classList.add('on');
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let left = x + 14, top = y + 16;
    if (left + w > innerWidth - 8) left = x - w - 14;
    if (top + h > innerHeight - 8) top = y - h - 12;
    tip.style.left = Math.max(8, left) + 'px'; tip.style.top = Math.max(8, top) + 'px';
  }
  const hideTip = () => tip && tip.classList.remove('on');
  function bindTips(root) {
    root.addEventListener('pointermove', e => {
      const el = e.target.closest('[data-tip]');
      if (el && root.contains(el)) showTip(el.dataset.tip, e.clientX, e.clientY); else hideTip();
    });
    root.addEventListener('pointerleave', hideTip);
    root.addEventListener('focusin', e => {
      const el = e.target.closest('[data-tip]');
      if (!el) return;
      const r = el.getBoundingClientRect(); showTip(el.dataset.tip, r.left + r.width / 2, r.bottom);
    });
    root.addEventListener('focusout', hideTip);
  }
  addEventListener('scroll', hideTip, {passive: true});

  // Scroll reveal and nav
  function initChrome() {
    const toggle = $('.menu-toggle'), nav = $('.site-header nav');
    if (toggle) {
      toggle.addEventListener('click', () => { const o = nav.classList.toggle('open'); toggle.setAttribute('aria-expanded', o); });
      $$('a', nav).forEach(a => a.addEventListener('click', () => { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', false); }));
    }
    if ('IntersectionObserver' in window) {
      document.documentElement.classList.add('js-on');
      const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } }), {threshold: .04});
      $$('.reveal').forEach(el => io.observe(el));
    }
    const copy = $('[data-copy-cite]');
    if (copy) copy.addEventListener('click', async () => {
      const text = $('pre.cite code').textContent, status = $('.cite-status');
      try { await navigator.clipboard.writeText(text); status.textContent = 'BibTeX copied to the clipboard'; }
      catch (err) { status.textContent = 'Copy is blocked here. Select the text above instead'; }
    });
  }

  // Videos: load and play only while in view, pause when out of view or the tab is hidden.
  let motionOn = !reduceMotion;
  const vio = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
    const v = e.target;
    if (e.isIntersecting) {
      if (!v.src && v.dataset.src) { v.src = v.dataset.src; }
      if (motionOn || !v.dataset.wall) { if (!reduceMotion) v.play().catch(() => {}); }
    } else if (!v.paused) v.pause();
  }), {rootMargin: '120px 0px', threshold: .2}) : null;
  function watchVideo(v) {
    if (reduceMotion) { v.controls = !v.dataset.wall; if (v.dataset.src && !v.dataset.wall) v.preload = 'none', v.src = v.dataset.src; return; }
    if (vio) vio.observe(v); else { v.src = v.dataset.src; v.play().catch(() => {}); }
  }
  function unwatchVideos(root) {
    $$('video', root).forEach(v => { if (vio) vio.unobserve(v); v.pause(); v.removeAttribute('src'); v.load(); });
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) $$('video').forEach(v => v.pause()); });

  // Cover wall built from the case gallery outputs.
  function buildWall(bench, meta) {
    const wall = $('#wall');
    if (!wall) return;
    // spread cases and models across the columns
    const ordered = [];
    for (let k = 0; k < 4; k++) bench.cases.forEach(c => ordered.push({c, o: c.outputs[(k + bench.cases.indexOf(c)) % 4]}));
    const cols = 5, per = 5, colsArr = Array.from({length: cols}, () => []);
    for (let i = 0; i < cols * per; i++) colsArr[i % cols].push(ordered[(i * 3) % ordered.length]);
    // every second tile plays video, the rest show a still frame, which keeps decoding light
    wall.innerHTML = colsArr.map((col, ci) => `<div class="wall-col">${col.map(({c, o}, ri) => {
      const m = meta[o.model] || {name: o.model};
      const media = (ci + ri) % 2 === 0
        ? `<video muted loop playsinline preload="none" poster="${esc(o.poster)}" data-src="${esc(o.video)}" data-wall="1" tabindex="-1"></video>`
        : `<img class="tile-poster" src="${esc(o.poster)}" alt="" loading="lazy">`;
      return `<div class="tile" aria-hidden="true">${media}
        <div class="tile-ref"><img src="${esc(c.refs[0])}" alt="" loading="lazy"></div>
        <div class="tile-cap"><span>${esc(m.name.toUpperCase())}</span><span>${esc(c.category.toUpperCase())}</span></div></div>`;
    }).join('')}</div>`).join('');
    $$('video', wall).forEach(watchVideo);
    const btn = $('#motion-toggle');
    const apply = () => {
      document.body.classList.toggle('motion-off', !motionOn);
      $$('video', wall).forEach(v => { if (!motionOn) v.pause(); });
      if (btn) { btn.textContent = motionOn ? 'PAUSE MOTION' : 'PLAY MOTION'; btn.setAttribute('aria-pressed', String(motionOn)); }
    };
    if (btn) btn.addEventListener('click', () => {
      motionOn = !motionOn; apply();
      if (motionOn) $$('video', wall).forEach(v => { const r = v.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); } });
    });
    apply();
    if (!reduceMotion) {
      addEventListener('scroll', () => document.body.style.setProperty('--cp', Math.min(1, scrollY / innerHeight)), {passive: true});
      if (matchMedia('(pointer:fine)').matches) {
        $('.cover').addEventListener('pointermove', e => {
          wall.style.setProperty('--px', `${(e.clientX / innerWidth - .5) * 18}px`);
          wall.style.setProperty('--py', `${(e.clientY / innerHeight - .5) * 12}px`);
        });
      }
    }
  }

  function modelMeta(board) {
    const m = {};
    board.models.forEach(x => { m[x.id] = x; });
    return m;
  }

  // One output card used by both pages.
  function outputCard(o, meta) {
    const m = meta[o.model] || {name: o.model, vendor: '', tier: 0, open: false};
    const cell = (d, v, extra = '') => {
      const h = heat(v);
      return `<div style="background:${h.bg};color:${h.fg}" data-tip="<b>${esc(d.name)}</b><br>${raw(v)}${extra}"><small>${d.short}</small>${pct(v)}</div>`;
    };
    const cells = DIMS.map(d => cell(d, o[d.key], d.key === 'MOT' && !o.motion_required ? '<br><span class=k>Not counted here: the prompt asks for no product motion</span>' : '')).join('');
    return `<article class="out"><header><h4 title="${esc(m.name)}">${esc(m.name)}</h4>
      <span class="tbadge${tierLight(m.tier) ? ' light' : ''}" style="--tc:${tierColor(m.tier)}" data-tip="Overall tier ${m.tier} of 5">T${m.tier}</span></header>
      <video muted loop playsinline preload="none" poster="${esc(o.poster)}" data-src="${esc(o.video)}" aria-label="${esc(m.name)} output"></video>
      <div class="scores"><div class="total" data-tip="<b>Win rate on this case</b><br>${raw(o.win)}<br><span class=k>Share of the other models this video beats on the same case, ties count half</span>"><small>WIN</small><b>${pct(o.win)}</b></div><div class="raw" data-tip="<b>Score of this video</b><br>${raw(o.v6)}<br><span class=k>Raw v6 score, the mean of the four dimensions</span>"><small>SCORE</small>${pct(o.v6)}</div>${cells}</div></article>`;
  }

  window.FS2V = {$, $$, esc, reduceMotion, tierColor, tierLight, heat, WIN_LO, WIN_HI, pct, raw, DIMS, loadJSON, showTip, hideTip, bindTips,
    initChrome, watchVideo, unwatchVideos, buildWall, modelMeta, outputCard, HEAT, TIER};
})();
