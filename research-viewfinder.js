(() => {
  'use strict';

  const sceneWidth = 800;
  const sceneHeight = 621;
  const targets = [
    { x: 400, y: 310.5, zoom: 1, subject: 'Research questions' },
    { x: 383, y: 446, zoom: 1.65, subject: 'Boat', box: [343, 402, 82, 72] },
    { x: 210, y: 225, zoom: 2.1, subject: 'Harbor', box: [117, 110, 220, 236] },
    { x: 486, y: 192, zoom: 3, subject: 'Sun', box: [472, 177, 30, 29] },
    { x: 483, y: 430, zoom: 3, subject: 'Reflection', box: [456, 320, 62, 185] }
  ];
  const topicsByKind = {
    understanding: ['Overview', 'Representation learning', 'Vision-language modeling', 'Agentic perception', 'Efficient inference'],
    generation: ['Overview', 'Data and supervision', 'Controllable generation', 'Feedback and alignment', 'Evaluation']
  };
  const focalLengths = [24, 35, 50, 70, 120];
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const views = [...document.querySelectorAll('#research-map .rm-axis')].flatMap(axis => {
    const screen = axis.querySelector('.rm-live-viewfinder');
    if (!screen) return [];
    const kind = axis.classList.contains('rm-axis-generation') ? 'generation' : 'understanding';
    const header = axis.querySelector('.rm-axis-header');
    const toolbar = axis.querySelector('.rm-scene-toolbar');
    const meter = axis.querySelector('.rm-viewfinder-meter');
    const sheet = axis.querySelector('.rm-contact-sheet');
    const topics = [...axis.querySelectorAll('.rm-topics > .rm-topic')];
    screen.id = `rm-camera-${kind}`;
    header.dataset.rmLinkedReady = 'true';
    return [{
      axis, screen, kind, header, toolbar, meter, sheet,
      world: screen.querySelector('.rm-scene-world'),
      detection: screen.querySelector('.rm-scene-detection'),
      tourButton: toolbar.querySelector('.rm-scene-tour'),
      resetButton: toolbar.querySelector('.rm-scene-reset'),
      captureButton: toolbar.querySelector('.rm-scene-capture'),
      status: axis.querySelector('.rm-scene-status'),
      ticks: [...meter.querySelectorAll('[data-rm-focus]')],
      lens: meter.querySelector('.rm-focus-range'),
      readout: meter.querySelector('.rm-focus-readout'),
      caption: screen.querySelector('.rm-scene-caption-title'),
      kicker: screen.querySelector('.rm-scene-kicker'),
      shot: screen.querySelector('.rm-scene-shot'),
      focalDisplay: header.querySelector('.rm-focal-display'),
      topics,
      topicNames: topics.map(topic => topic.querySelector('.rm-topic-title').textContent.trim()),
      questions: [...axis.querySelectorAll('.rm-questions p')].map(question => question.textContent.trim()),
      cards: [...sheet.querySelectorAll('.rm-contact-card')],
      progress: sheet.querySelector('.rm-contact-progress'),
      reveal: axis.querySelector('.rm-scene-reveal'),
      current: { ...targets[0] }, frameIndex: 0, manualFrame: false,
      animation: null, animationTarget: null, tourTimer: null,
      tourRequested: !motion.matches, researchEngaged: false,
      found: new Set(), inView: false, readyIndex: 0, captureMessage: false, captureTimer: null, drag: null
    }];
  });
  if (!views.length) return;

  // Each camera owns its viewport, tour, research preview, and collection.
  const syncMeter = view => {
    const frame = targets[view.frameIndex];
    const zoom = `${view.current.zoom.toFixed(2).replace(/0$/, '')}×`;
    view.screen.dataset.focus = String(view.frameIndex);
    view.lens.value = String(view.frameIndex);
    view.ticks.forEach((tick, index) => {
      tick.removeAttribute('data-rm-preview');
      tick.toggleAttribute('data-rm-active', index === view.frameIndex);
    });
    view.focalDisplay.textContent = view.manualFrame ? `Manual · ${zoom}` : `${focalLengths[view.frameIndex]}mm${view.frameIndex ? '' : ' · Questions'}`;
    view.shot.textContent = view.manualFrame ? `${zoom} / REFRAME` : `${focalLengths[view.frameIndex]}mm / ${view.frameIndex ? 'FOCUS' : 'WIDE'}`;
    const description = view.manualFrame
      ? `${zoom} manual frame · ${focalLengths[view.frameIndex]}mm preset`
      : `${focalLengths[view.frameIndex]}mm · ${frame.subject}`;
    view.readout.textContent = description;
    view.lens.setAttribute('aria-valuetext', description);
  };
  const updateAim = view => {
    const current = view.current;
    let nearest = Infinity;
    let index = 0;
    if (current.zoom >= 1.35) targets.slice(1).forEach((frame, i) => {
      const dx = (frame.x - current.x) * current.zoom;
      const dy = (frame.y - current.y) * current.zoom;
      const distance = dx * dx + dy * dy;
      if (Math.abs(dx) <= 150 && Math.abs(dy) <= sceneHeight * .2 && distance < nearest) {
        nearest = distance;
        index = i + 1;
      }
    });
    const changed = view.readyIndex !== index;
    view.readyIndex = index;
    if (changed && !view.tourRequested && !view.captureMessage) {
      view.status.textContent = index ? view.topicNames[index - 1] : 'Choose a lens or frame a detail.';
    }
    view.screen.toggleAttribute('data-ready', Boolean(index));
    if (index) {
      ['x', 'y', 'width', 'height'].forEach((name, i) => view.detection.setAttribute(name, targets[index].box[i]));
      view.detection.setAttribute('opacity', '.8');
      view.kicker.textContent = view.found.has(index) ? 'Collected' : 'In focus';
      view.caption.textContent = view.topicNames[index - 1];
    } else {
      view.detection.setAttribute('opacity', '0');
      view.kicker.textContent = 'Explore';
      view.caption.textContent = 'A new view of my research.';
    }
    if (!view.captureMessage) view.captureButton.textContent = index && view.found.has(index) ? 'Collected' : 'Capture';
  };
  const draw = view => {
    const current = view.current;
    const transform = `translate(${sceneWidth / 2 - current.x * current.zoom} ${sceneHeight / 2 - current.y * current.zoom}) scale(${current.zoom})`;
    view.world.setAttribute('transform', transform);
    updateAim(view);
    syncMeter(view);
  };
  const constrain = frame => ({
    zoom: frame.zoom,
    x: clamp(frame.x, sceneWidth / 2 / frame.zoom, sceneWidth - sceneWidth / 2 / frame.zoom),
    y: clamp(frame.y, sceneHeight / 2 / frame.zoom, sceneHeight - sceneHeight / 2 / frame.zoom)
  });
  const freezeCamera = view => {
    cancelAnimationFrame(view.animation);
    if (view.animationTarget) view.manualFrame = true;
    view.animation = undefined;
    view.animationTarget = undefined;
    syncMeter(view);
  };
  const move = (view, next, immediate = false, onSettled) => {
    cancelAnimationFrame(view.animation);
    const end = constrain(next);
    view.animationTarget = undefined;
    if (immediate || motion.matches || document.hidden) {
      view.current = end;
      draw(view);
      if (onSettled) onSettled();
      return;
    }
    const start = { ...view.current };
    const begin = performance.now();
    view.animationTarget = end;
    const step = now => {
      const progress = Math.min(1, (now - begin) / 1100);
      const ease = progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      view.current = {
        x: start.x + (end.x - start.x) * ease,
        y: start.y + (end.y - start.y) * ease,
        zoom: start.zoom + (end.zoom - start.zoom) * ease
      };
      draw(view);
      if (progress < 1) view.animation = requestAnimationFrame(step);
      else {
        view.animation = undefined;
        view.animationTarget = undefined;
        if (onSettled) onSettled();
      }
    };
    view.animation = requestAnimationFrame(step);
  };
  const clearReveal = view => {
    view.reveal.hidden = true;
    view.cards.forEach(card => card.setAttribute('aria-pressed', 'false'));
  };
  const selectFrame = (view, index, immediate = false) => {
    if (!Number.isInteger(index) || !targets[index]) return;
    view.frameIndex = index;
    view.manualFrame = false;
    clearReveal(view);
    syncMeter(view);
    move(view, targets[index], immediate, () => showAlignedResearch(view));
  };
  const moveManual = (view, next) => {
    view.researchEngaged = true;
    view.manualFrame = true;
    clearReveal(view);
    move(view, next, true);
  };
  const canTour = view => view.tourRequested && view.inView && !document.hidden && !motion.matches;
  const syncTour = view => {
    clearTimeout(view.tourTimer);
    const playing = canTour(view);
    view.screen.toggleAttribute('data-touring', playing);
    view.tourButton.textContent = motion.matches ? 'Next frame' : view.tourRequested ? 'Pause tour' : 'Play tour';
    view.tourButton.setAttribute('aria-pressed', String(view.tourRequested));
    if (playing) view.tourTimer = setTimeout(() => {
      selectFrame(view, (view.frameIndex + 1) % targets.length);
      syncTour(view);
    }, 6500);
  };
  const stopTour = view => {
    view.tourRequested = false;
    freezeCamera(view);
    syncTour(view);
  };
  const showResearch = (view, index) => {
    const topic = view.topics[index - 1];
    // Keep a settled topic's links in place while someone reads or focuses them.
    if (view.reveal.dataset.topic !== topic.id) {
      const publications = document.createDocumentFragment();
      const seenPapers = new Set();
      const seenLinks = new Set();
      topic.querySelectorAll('.rm-methods > li').forEach(method => {
        const group = document.createElement('section');
        group.className = 'rm-reveal-group';
        const label = method.querySelector(':scope > em');
        if (label) {
          const heading = document.createElement('h4');
          heading.className = 'rm-reveal-group-title';
          heading.textContent = label.textContent.trim();
          group.append(heading);
        }
        const list = document.createElement('ul');
        list.className = 'rm-reveal-paper-list';
        method.querySelectorAll('.rm-publication').forEach(publication => {
          const source = publication.querySelector('.rm-paper, .rm-manuscript');
          if (!source) return;
          const paperId = source.dataset.paper || source.textContent.trim();
          const href = source.getAttribute('href');
          if (seenPapers.has(paperId) || (href && seenLinks.has(href))) return;
          seenPapers.add(paperId);
          if (href) seenLinks.add(href);
          const row = document.createElement('li');
          const paper = document.createElement(href ? 'a' : 'span');
          paper.className = href ? 'rm-reveal-paper' : 'rm-reveal-paper rm-manuscript';
          paper.textContent = source.textContent.replace(/🌟|⭐|★/gu, '').replace(/\s+/g, ' ').trim();
          if (source.title) paper.title = source.title;
          if (href) {
            paper.href = href;
            paper.target = source.target || '_blank';
            paper.rel = 'noopener noreferrer';
          }
          row.append(paper);
          const metadata = ['.rm-resource-type', '.rm-publication-meta', '.rm-honor']
            .map(selector => publication.querySelector(selector)?.textContent.trim()).filter(Boolean);
          if (metadata.length) {
            const venue = document.createElement('span');
            venue.className = 'rm-reveal-venue';
            venue.textContent = metadata.join(' · ');
            row.append(venue);
          }
          list.append(row);
        });
        if (list.children.length) {
          group.append(list);
          publications.append(group);
        }
      });
      view.reveal.querySelector('.rm-reveal-topic strong').textContent = view.topicNames[index - 1];
      view.reveal.querySelector('.rm-reveal-publications').replaceChildren(publications);
      view.reveal.dataset.topic = topic.id;
    }
    view.reveal.hidden = false;
    view.cards.forEach((card, i) => card.setAttribute('aria-pressed', String(i + 1 === index)));
  };
  const showQuestions = view => {
    if (view.reveal.dataset.topic !== 'overview') {
      const questions = view.questions.map(text => {
        const paragraph = document.createElement('p');
        paragraph.className = 'rm-reveal-question';
        paragraph.textContent = text;
        return paragraph;
      });
      view.reveal.querySelector('.rm-reveal-topic strong').textContent = 'Research questions';
      view.reveal.querySelector('.rm-reveal-publications').replaceChildren(...questions);
      view.reveal.dataset.topic = 'overview';
    }
    view.reveal.hidden = false;
    view.cards.forEach(card => card.setAttribute('aria-pressed', 'false'));
  };
  const showAlignedResearch = view => {
    if (view.frameIndex === 0 && !view.manualFrame) showQuestions(view);
    else if (view.researchEngaged && view.readyIndex) showResearch(view, view.readyIndex);
    else view.reveal.hidden = true;
  };
  const capture = view => {
    view.researchEngaged = true;
    stopTour(view);
    updateAim(view);
    if (!view.readyIndex) {
      view.status.textContent = 'Center a subject before collecting this frame.';
      view.caption.textContent = 'Frame a detail to collect it.';
      return;
    }
    const index = view.readyIndex;
    const isNew = !view.found.has(index);
    view.found.add(index);
    updateAim(view);
    const card = view.cards[index - 1];
    card.setAttribute('data-discovered', '');
    card.querySelector('.rm-contact-label').textContent = topicsByKind[view.kind][index];
    card.setAttribute('aria-label', `View ${view.topics[index - 1].querySelector('.rm-topic-title').textContent}`);
    view.progress.textContent = `${view.found.size} / 4`;
    view.sheet.hidden = false;
    showAlignedResearch(view);
    clearTimeout(view.captureTimer);
    view.screen.removeAttribute('data-captured');
    if (isNew) requestAnimationFrame(() => view.screen.setAttribute('data-captured', ''));
    view.captureMessage = true;
    view.captureButton.textContent = isNew ? 'Collected!' : 'Collected';
    view.status.textContent = `${topicsByKind[view.kind][index]}. ${view.found.size} of 4 research frames collected.${view.found.size === 4 ? ' Collection complete.' : ''}`;
    view.captureTimer = setTimeout(() => {
      view.screen.removeAttribute('data-captured');
      view.captureMessage = false;
      updateAim(view);
    }, 1600);
  };

  views.forEach(view => {
    const claimControl = () => stopTour(view);
    view.header.addEventListener('viewfinderfocuschange', event => {
      claimControl();
      view.researchEngaged = true;
      selectFrame(view, event.detail.focus);
    });
    view.meter.addEventListener('pointerdown', claimControl, true);
    view.meter.addEventListener('keydown', claimControl, true);
    view.meter.addEventListener('focusin', claimControl);
    view.axis.querySelector('.rm-topics').addEventListener('click', claimControl, true);
    view.screen.addEventListener('focus', claimControl);
    view.reveal.addEventListener('pointerenter', claimControl);
    view.reveal.addEventListener('pointerdown', claimControl);
    view.reveal.addEventListener('focusin', claimControl);
    view.tourButton.addEventListener('click', () => {
      if (motion.matches) {
        stopTour(view);
        view.researchEngaged = true;
        selectFrame(view, (view.frameIndex + 1) % targets.length, true);
        view.status.textContent = `${targets[view.frameIndex].subject}. ${topicsByKind[view.kind][view.frameIndex]}.`;
      } else {
        view.tourRequested = !view.tourRequested;
        if (!view.tourRequested) {
          freezeCamera(view);
          showAlignedResearch(view);
        }
        syncTour(view);
      }
    });
    view.resetButton.addEventListener('click', () => {
      claimControl();
      view.ticks[0].click();
      view.status.textContent = 'Wide frame restored.';
    });
    view.captureButton.addEventListener('click', () => capture(view));
    view.cards.forEach((card, i) => card.addEventListener('click', () => {
      claimControl();
      view.researchEngaged = true;
      selectFrame(view, i + 1, true);
      view.status.textContent = view.topicNames[i];
    }));
    view.screen.addEventListener('dblclick', () => { if (view.readyIndex) capture(view); });
    view.screen.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      claimControl();
      view.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, frame: { ...view.current }, touch: event.pointerType === 'touch', moved: false };
      if (!view.drag.touch) view.screen.setPointerCapture(event.pointerId);
      view.screen.setAttribute('data-dragging', '');
    });
    view.screen.addEventListener('pointermove', event => {
      const drag = view.drag;
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (drag.touch && !drag.moved) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
          view.drag = null;
          view.screen.removeAttribute('data-dragging');
          return;
        }
        if (Math.abs(dx) < 8) return;
        view.screen.setPointerCapture(event.pointerId);
      }
      if (!drag.moved && drag.frame.zoom < 1.35) drag.frame.zoom = 1.65;
      drag.moved = true;
      const width = view.screen.getBoundingClientRect().width;
      moveManual(view, {
        zoom: drag.frame.zoom,
        x: drag.frame.x - dx * sceneWidth / width / drag.frame.zoom,
        y: drag.frame.y - (drag.touch ? 0 : dy * sceneWidth / width / drag.frame.zoom)
      });
    });
    const endDrag = event => {
      if (!view.drag || event.pointerId !== view.drag.id) return;
      const moved = view.drag.moved;
      if (view.screen.hasPointerCapture(event.pointerId)) view.screen.releasePointerCapture(event.pointerId);
      view.drag = null;
      view.screen.removeAttribute('data-dragging');
      if (moved) showAlignedResearch(view);
    };
    view.screen.addEventListener('pointerup', endDrag);
    view.screen.addEventListener('pointercancel', endDrag);
    view.screen.addEventListener('lostpointercapture', endDrag);
    view.screen.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); capture(view); return;
      }
      const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (!directions[event.key] && !['+', '=', '-', 'Home'].includes(event.key)) return;
      event.preventDefault();
      claimControl();
      if (event.key === 'Home') { view.ticks[0].click(); return; }
      const next = { ...view.current };
      if (directions[event.key]) {
        if (next.zoom < 1.35) next.zoom = 1.65;
        next.x += directions[event.key][0] * 24 / next.zoom;
        next.y += directions[event.key][1] * 24 / next.zoom;
      } else next.zoom = clamp(next.zoom + (event.key === '-' ? -.2 : .2), 1, 4);
      moveManual(view, next);
    });
    view.screen.addEventListener('keyup', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) showAlignedResearch(view);
    });
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
      view.inView = entries[0].isIntersecting && entries[0].intersectionRatio >= .25;
      if (!view.inView) freezeCamera(view);
      syncTour(view);
    }, { threshold: .25 }).observe(view.screen);
    else view.inView = true;
    view.toolbar.hidden = false;
    view.progress.setAttribute('aria-label', 'Research frames collected');
    view.readout.setAttribute('aria-live', 'off');
    view.lens.setAttribute('aria-label', `Camera preset: ${view.kind}`);
    view.lens.setAttribute('aria-controls', `${view.screen.id} ${view.axis.querySelector('.rm-topics').id}`);
    view.screen.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown + - Home Enter Space');
    view.screen.title = 'Drag or use arrow keys to aim, + and − to zoom, and Enter to capture. Home resets the frame.';
  });
  document.addEventListener('visibilitychange', () => {
    views.forEach(view => {
      if (document.hidden) freezeCamera(view);
      syncTour(view);
    });
  });
  motion.addEventListener('change', () => {
    views.forEach(view => {
      if (motion.matches) stopTour(view);
      syncTour(view);
    });
  });
  views.forEach(view => {
    selectFrame(view, 0, true);
    syncTour(view);
  });
})();
