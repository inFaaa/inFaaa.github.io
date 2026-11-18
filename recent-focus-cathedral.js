// Rouen Cathedral in afternoon light. The facade is built in a 320 × 86 coordinate system.
(() => {
  const canvas = document.getElementById('rf-cathedral-paint');
  if (!canvas) return;
  const svg = 'http://www.w3.org/2000/svg';
  const fragment = document.createDocumentFragment();
  const guides = document.getElementById('rf-cathedral-guides');
  const guidePaths = document.createDocumentFragment();
  const marks = new Map();
  let seed = 1894;

  function random(min = 0, max = 1) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return min + (max - min) * seed / 4294967296;
  }

  const pick = colors => colors[Math.floor(random(0, colors.length))];
  const n = value => Math.round(value * 100) / 100;
  const point = (x, y) => n(x) + ',' + n(y);
  const stone = ['#ffdfa1', '#f8cb8e', '#efae81', '#d69e91', '#ead0bc', '#f8d5a3'];
  const shadow = ['#77799d', '#8a83a5', '#9b8da8', '#8b91b5', '#a18a9c', '#b09bb1'];
  const recess = ['#565c85', '#646c98', '#7478a2', '#887f9c', '#9a8ca0'];
  const light = ['#ffe8b4', '#ffddb0', '#ffcb8b', '#f5bb83', '#f9d7ae'];

  // Keep one SVG path per pigment in each layer, even for thousands of small dabs.
  function mark(color, outline) {
    if (!marks.has(color)) marks.set(color, []);
    marks.get(color).push(outline);
  }

  function paintLayer(opacity = 1) {
    const stage = document.createElementNS(svg, 'g');
    stage.setAttribute('class', 'rf-paint-stage');
    stage.style.setProperty('--layer', fragment.childElementCount);
    for (const [color, pieces] of marks) {
      const path = document.createElementNS(svg, 'path');
      path.setAttribute('fill', color);
      path.setAttribute('fill-rule', 'evenodd');
      path.setAttribute('d', pieces.join(''));
      if (opacity < 1) path.setAttribute('opacity', opacity);
      stage.append(path);
    }
    fragment.append(stage);
    marks.clear();
  }

  function strip(x, y, width, height) {
    return 'M' + point(x, y) + 'h' + n(width) + 'v' + n(height) + 'h' + n(-width) + 'Z';
  }

  // The edge of a flat brush leaves a split, tapered tip.
  function dab(x, y, dx, dy, width, color) {
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy * width / (2 * length);
    const ny = dx * width / (2 * length);
    mark(color, 'M' + point(x + nx, y + ny)
      + 'q' + point(dx * .49 + nx * .6, dy * .49 + ny * .6) + ' ' + point(dx - nx, dy - ny)
      + 'l' + point(-dx * .28 - nx, -dy * .28 - ny)
      + 'L' + point(x - nx * .65, y - ny * .65) + 'Z');
  }

  // A wash of cool underpaint shows between the warmer strokes on the pale limestone.
  mark('#c5acac', strip(0, 0, 320, 86));
  paintLayer();
  for (let x = -4; x < 322; x += random(2.4, 5.5)) {
    mark(pick(random() < .72 ? stone : shadow), strip(x, -1, random(2, 8), 89));
  }
  paintLayer(.85);
  for (let i = 0; i < 2100; i++) {
    const x = random(0, 320), y = random(-4, 88);
    dab(x, y, random(-1.4, 1), random(1.3, 6.5), random(.55, 2.3),
      pick(Math.sin(x * .19 + y * .05) + random(-1, 1) < -.65 ? shadow : stone));
  }
  paintLayer(.86);

  function guide(className, outline, index) {
    const path = document.createElementNS(svg, 'path');
    path.setAttribute('class', className);
    path.setAttribute('pathLength', '1');
    path.setAttribute('d', outline);
    if (index !== undefined) path.style.setProperty('--i', index);
    guidePaths.append(path);
  }

  function archOutline(x, bottom, spring, tip, radius) {
    const height = spring - tip;
    return 'M' + point(x - radius, bottom) + 'V' + n(spring)
      + 'Q' + point(x - radius * .94, spring - height * .46) + ' ' + point(x, tip)
      + 'Q' + point(x + radius * .94, spring - height * .46) + ' ' + point(x + radius, spring)
      + 'V' + n(bottom);
  }

  function arch(x, bottom, spring, tip, radius) {
    return archOutline(x, bottom, spring, tip, radius) + 'Z';
  }

  // The paired lancets and deep window reveals set the rhythm of the upper gallery.
  const bays = [-5, 12, 25, 49, 58, 67, 86, 95, 105, 117, 203, 215, 225, 235, 252, 261, 270, 292, 305, 321];
  for (const x of bays) {
    const top = x < 35 || x > 280 ? random(-10, -1) : random(3.5, 8);
    const sill = random(31, 38);
    if ([49, 67, 95, 225, 252, 270].includes(x)) {
      guide('rf-build-arch', archOutline(x, sill, top + 6.5, top, 3.35));
    }
    mark('#8e8199', arch(x, sill + 1, top + 6, top - 1.7, 4.5));
    mark(pick(recess), arch(x, sill, top + 6.5, top, 3.35));
    mark('#d3b29e', strip(x - .4, top + 7, .85, sill - top - 7));
    dab(x - 4, sill, -.2, -sill + top + 7, 1, pick(light));
    dab(x - 4.1, top + 6, 3.9, -5.9, .85, pick(light));
    dab(x - 5, sill + 1, 10, -.5, 1.4, pick(light));
  }
  paintLayer();

  const rose = { x: 160, y: 8.4, radius: 32.5 };
  function ellipse(x, y, rx, ry) {
    return 'M' + point(x - rx, y) + 'a' + point(rx, ry) + ' 0 1 0 ' + point(2 * rx, 0)
      + 'a' + point(rx, ry) + ' 0 1 0 ' + point(-2 * rx, 0) + 'Z';
  }

  function drawRoseWindow(petalCount) {
    mark('#d69f86', ellipse(rose.x, rose.y, 34, 33));
    paintLayer();
    mark('#65688d', ellipse(rose.x, rose.y, rose.radius, 31.5));
    paintLayer();
    for (let i = 0; i < 480; i++) {
      const angle = random(0, 2 * Math.PI), r = Math.sqrt(random()) * 30.2;
      dab(rose.x + Math.cos(angle) * r, rose.y + Math.sin(angle) * r * .97,
        random(-1.7, .6), random(.3, 2), random(.45, 1.45), pick(recess));
    }
    paintLayer();

    // Lobed petals in radial coordinates form the stained-glass tracery.
    function polar(angle, radius) {
      return point(rose.x + Math.cos(angle) * radius, rose.y + Math.sin(angle) * radius * .97);
    }

    for (let k = 0; k < petalCount; k++) {
      const a = k * 2 * Math.PI / petalCount - Math.PI / 2;
      const tip = .173;
      const petal = 'M' + polar(a, 4)
        + 'Q' + polar(a - tip * .08, 12) + ' ' + polar(a - tip * .75, 19)
        + 'Q' + polar(a - tip * 1.52, 28) + ' ' + polar(a, 30)
        + 'Q' + polar(a + tip * 1.32, 28) + ' ' + polar(a + tip * .76, 20)
        + 'Q' + polar(a + tip * .1, 12) + ' ' + polar(a, 4) + 'Z';
      const glass = 'M' + polar(a, 7)
        + 'Q' + polar(a - tip * .24, 15) + ' ' + polar(a - tip * .6, 20)
        + 'Q' + polar(a - tip * 1.13, 26) + ' ' + polar(a, 28.6)
        + 'Q' + polar(a + tip * 1.04, 26.4) + ' ' + polar(a + tip * .6, 20)
        + 'Q' + polar(a + tip * .18, 13) + ' ' + polar(a, 7) + 'Z';
      mark(pick(stone), petal + glass);
      // The painting starts at twelve o’clock. The construction starts at three.
      guide('rf-build-petal', petal, (k + 3 * petalCount / 4) % petalCount);
    }
    mark('#f1cb98', ellipse(rose.x, rose.y, 4.8, 4.7) + ellipse(rose.x, rose.y, 3.4, 3.3));
    mark('#e6c39f', ellipse(rose.x, rose.y, 32.8, 32) + ellipse(rose.x, rose.y, 31.9, 31));
    paintLayer();
  }
  drawRoseWindow(16);

  // A short gable ties the rose to the central portal. Two smaller gables flank it.
  const portals = [
    { x: 58, radius: 19.2, tip: 60.2, spring: 78, peak: 37 },
    { x: 160.5, radius: 40.8, tip: 34.3, spring: 71.2, peak: 14.2 },
    { x: 263, radius: 19.1, tip: 60.9, spring: 78.5, peak: 38 }
  ];
  function drawPortals(portals) {
    for (const { x, radius, tip, spring, peak } of portals) {
      const width = radius * .94;
      const base = tip + 18;
      mark('#b19aa9', 'M' + point(x - width, base) + 'Q' + point(x - 8, tip + 4) + ' ' + point(x, peak)
        + 'Q' + point(x + 9, tip + 4) + ' ' + point(x + width, base) + 'L' + point(x, tip + 1) + 'Z');
      for (const sign of [-1, 1]) {
        for (let i = 0; i < 32; i++) {
          const t = i / 32, u = (i + 1) / 32;
          const edgeX = t => x + sign * width * (t * .48 + t * t * .52);
          const edgeY = t => peak + t * (base - peak);
          dab(edgeX(t), edgeY(t), edgeX(u) - edgeX(t), edgeY(u) - edgeY(t), 1.4, pick(light));
          if (i % 3 === 0) dab(edgeX(t), edgeY(t), sign * random(.3, 1.5), -1.5, 1, pick(stone));
        }
        for (let i = 1; i <= 4; i++) {
          const dx = i * width / 6;
          const y = peak + (base - peak) * Math.pow(dx / width, .74) + 2;
          dab(x + sign * dx, y, 0, 3.8, 1.6, pick(shadow));
          dab(x + sign * dx - .85, y + .4, 0, 3.1, .65, pick(light));
        }
      }
      const archDepth = radius * .32;
      for (const t of [0, .55, 1]) {
        guide('rf-build-arch', archOutline(x, 87, spring + t * 1.7,
          tip + t * archDepth, radius * (1 - t * .32)));
      }
      const bands = ['#f8d399','#ae919a','#c79c87','#a88995','#d9ab93','#8a7b94','#bf9a94','#847795','#a98da2'];
      for (let j = 0; j < bands.length; j++) {
        const t = j / bands.length, u = (j + 1) / bands.length;
        const band = t => arch(x, 91, spring + t * 1.7, tip + t * archDepth, radius * (1 - t * .32));
        mark(bands[j], band(t) + band(u));
      }
      mark('#a392a3', arch(x, 91, spring + 1.7, tip + archDepth, radius * .68));
    }
    paintLayer();

    // Small sunlit voussoirs follow the curvature of each archivolt.
    for (const { x, radius, tip, spring } of portals) {
      for (let row = 0; row < 5; row++) {
        const t = (row + .55) / 5;
        const r = radius * (1 - t * .32), top = tip + t * radius * .32;
        const height = spring + t * 1.7 - top;
        for (const sign of [-1, 1]) {
          const count = Math.round(r * 1.05);
          for (let i = 0; i < count; i++) {
            const s = (i + random(.1,.85)) / count;
            const xx = x + sign * r * (1 - .12 * s - .88 * s * s);
            const yy = spring + t * 1.7 - height * (.92 * s + .08 * s * s);
            dab(xx, yy, sign * random(-.3,.45), random(.65,2.4), random(.4,1.1),
              pick(random() < (sign < 0 ? .72 : .49) ? light : shadow));
          }
        }
      }
      // Carved figures under the arch enter the light along one shoulder and one cheek.
      for (let i = -4; i <= 4; i++) {
        const xx = x + i * radius * .13;
        const yy = tip + radius * .41 + Math.abs(i) * radius * .09;
        mark(pick(shadow), ellipse(xx + .4, yy + 1.6, 1, 1.4));
        mark(pick(stone), ellipse(xx, yy + 1.2, .72, .95));
        dab(xx, yy + 2, -.8, radius * .14, 1.3, pick(light));
        dab(xx + 1, yy + 2.7, 1.1, radius * .13, 1.1, pick(shadow));
      }
    }
    paintLayer(.94);
  }
  drawPortals(portals);

  // Buttresses, pinnacles and statue niches stand proud of the recessed portals.
  for (const [x, top, width] of [[2,8,6],[30,2,8],[38,31,5],[77,22,5],[87,-8,8],[106,25,6],
    [117,-9,8],[125,24,4],[196,-2,6],[205,-10,8],[213,25,5],[235,-8,8],[244,24,5],[282,29,6],[294,1,9],[316,12,6]]) {
    mark('#b496a0', strip(x - width * .45, top + 10, width, 89));
    mark('#efc397', strip(x - width * .45, top + 10, width * .45, 89));
    mark('#9d8ba4', arch(x, 74, top + 18, top + 6, width * .35));
    mark('#efc599', 'M'+point(x - width * .6, top + 13)+'L'+point(x, top)+'L'
      +point(x + width * .5,top + 13)+'L'+point(x,top + 6)+'Z');
    for (let j = 0; j < 18; j++) {
      const y = random(top + 9, 84), dx = random(-width * .45, width * .5);
      dab(x + dx, y, random(-.4,.3), random(1,5), random(.55,1.5), pick(dx < .25 ? stone : shadow));
    }
    for (let j = 0; j < 3; j++) {
      const y = top + 23 + j * 16;
      dab(x - width * .6,y, width * 1.08, -.4, 1.3, pick(light));
      dab(x - width * .45,y + 1,width * 1.05,.1,.9,pick(shadow));
    }
    mark('#a18fa5', ellipse(x + .7, 57.3, 1.25, 1.5));
    mark('#efcca8', ellipse(x, 57.2, 1, 1.2));
    dab(x, 59, -1.4, 8.6, 2.1, pick(light));
    dab(x + .9, 59.1, .9, 8.4, 1.5, pick(stone));
  }
  paintLayer();

  // Scumble over the carving with small broken patches, leaving the larger shadows intact.
  for (let i = 0; i < 1150; i++) {
    const x = random(0, 320), y = random(0, 86);
    const r = Math.hypot(x - rose.x, (y - rose.y) / .97);
    if (r < 32 && random() < .72) continue;
    dab(x, y, random(-1.6,1.7), random(-2.9,-.45), random(.45,1.15), pick(random() < .55 ? light : shadow));
  }
  paintLayer(.53);
  canvas.replaceChildren(fragment);
  if (guides) guides.replaceChildren(guidePaths);
})();
