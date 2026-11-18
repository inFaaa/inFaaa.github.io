// Wake and sleep share one pond. The boat's return trip closes the loop.
(() => {
  const pond = document.querySelector('svg.rf-ha-scene');
  if (!pond) return;

  const part = name => pond.querySelector('#rf-ha-' + name);
  const boat = part('boat');
  const ghost = part('ghost');
  const lilies = part('lilies');
  const sun = part('sun');
  const moon = part('moon');
  const outboundInk = part('outbound-ink');
  const dreamInk = part('dream-ink');
  const dreamTrail = part('dream-trail');
  const returnInk = part('return-ink');

  function route(name) {
    const path = part(name);
    const length = path.getTotalLength();
    return fraction => path.getPointAtLength(length * Math.max(0, Math.min(1, fraction)));
  }
  const direct = route('direct');
  const dreamed = route('dream-detour');
  const learned = route('real-detour');

  function ease(time, start, end) {
    const t = Math.max(0, Math.min(1, (time - start) / (end - start)));
    return t * t * (3 - 2 * t);
  }

  function position(element, point, angle = 0) {
    element.setAttribute('transform', 'translate(' + point.x.toFixed(2) + ' ' +
      point.y.toFixed(2) + ') rotate(' + angle.toFixed(1) + ')');
  }

  function draw(time) {
    const sleep = ease(time, 2.6, 3.2) - ease(time, 6.3, 6.95);
    sun.style.opacity = 1 - sleep;
    moon.style.opacity = sleep;

    const outbound = ease(time, 0.2, 2.5);
    const rehearsal = ease(time, 3.6, 6.1);
    const homeward = ease(time, 6.98, 10.2);
    outboundInk.style.strokeDashoffset = 1 - outbound;
    outboundInk.style.opacity = 1 - ease(time, 2.55, 3.25);
    dreamInk.style.strokeDashoffset = 1 - rehearsal;
    dreamTrail.style.opacity = ease(time, 3.4, 3.65) -
      0.78 * ease(time, 6.35, 7.08) - 0.22 * ease(time, 9.8, 10.7);
    returnInk.style.strokeDashoffset = 1 - homeward;
    returnInk.style.opacity = ease(time, 6.9, 7.04) - ease(time, 10.4, 11.55);

    // The real boat waits at the far bank while its imagined self tries the detour.
    position(ghost, dreamed(rehearsal));
    ghost.style.opacity = ease(time, 3.42, 3.69) - ease(time, 6.15, 6.63);
    boat.style.opacity = 1 - 0.32 * sleep;
    if (time < 6.98) {
      position(boat, direct(outbound), 180 * ease(time, 6.3, 6.98));
    } else {
      const from = learned(homeward - 0.002);
      const to = learned(homeward + 0.002);
      const tangent = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
      position(boat, learned(homeward), tangent + 180 * ease(time, 10.6, 11.6));
    }

    // The patch fades between dream and waking experience. Its new position changes the turn.
    if (time < 6.92) {
      position(lilies, { x: 147, y: 50 });
      lilies.style.opacity = ease(time, 3.03, 3.58) - ease(time, 6.34, 6.89);
    } else {
      position(lilies, { x: 185, y: 55 }, -14);
      lilies.style.opacity = ease(time, 7.03, 7.56) - ease(time, 10.65, 11.65);
    }
  }

  const animated = [boat, ghost, lilies, sun, moon, outboundInk, dreamInk, dreamTrail, returnInk];
  const still = animated.map(element => ({
    element,
    style: element.getAttribute('style'),
    transform: element.getAttribute('transform')
  }));
  function restoreStill() {
    for (const { element, style, transform } of still) {
      for (const [name, value] of [['style', style], ['transform', transform]]) {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      }
    }
  }

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let inView = !('IntersectionObserver' in window);
  let elapsed = 0;
  let lastFrame = null;
  let frameId = null;

  function tick(now) {
    if (lastFrame !== null) elapsed = (elapsed + (now - lastFrame) / 1000) % 12;
    lastFrame = now;
    draw(elapsed);
    frameId = requestAnimationFrame(tick);
  }

  function updatePlayback() {
    if (inView && !document.hidden && !reducedMotion.matches) {
      if (frameId === null) frameId = requestAnimationFrame(tick);
      return;
    }
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    lastFrame = null;
    if (reducedMotion.matches) {
      elapsed = 0;
      restoreStill();
    }
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      updatePlayback();
    }).observe(pond);
  }
  document.addEventListener('visibilitychange', updatePlayback);
  reducedMotion.addEventListener('change', updatePlayback);
  updatePlayback();
})();
