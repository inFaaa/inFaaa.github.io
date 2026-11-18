(() => {
  'use strict';

  const badge = document.getElementById('scholar-citations');
  if (!badge) return;

  const scholarId = '2t7iBnkAAAAJ';
  const profileUrl = 'https://scholar.google.com/citations?user=' + scholarId + '&hl=en';
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  // Read main directly: commits made by GITHUB_TOKEN do not rebuild GitHub Pages.
  const dataUrl = isLocal
    ? new URL('data/scholar-stats.json', document.baseURI).href
    : 'https://raw.githubusercontent.com/inFaaa/inFaaa.github.io/main/data/scholar-stats.json';

  async function refreshCitations() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(dataUrl, {
        cache: 'no-cache',
        credentials: 'omit',
        signal: controller.signal,
      });
      if (!response.ok) return;
      const stats = await response.json();
      if (!stats || stats.scholar_id !== scholarId || stats.profile_url !== profileUrl
          || !Number.isSafeInteger(stats.citations) || stats.citations < 0
          || stats.citations > 1_000_000_000 || typeof stats.updated_at !== 'string'
          || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(stats.updated_at)) return;

      const updatedAt = new Date(stats.updated_at);
      if (!Number.isFinite(updatedAt.getTime())
          || updatedAt.toISOString().replace('.000Z', 'Z') !== stats.updated_at) return;
      const previousUpdate = Date.parse(badge.dataset.updatedAt || '');
      if (Number.isFinite(previousUpdate) && updatedAt.getTime() < previousUpdate) return;

      const count = new Intl.NumberFormat('en-US').format(stats.citations);
      const updatedLabel = new Intl.DateTimeFormat('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short',
      }).format(updatedAt);
      badge.textContent = count + ' Google Scholar citations';
      badge.title = 'Google Scholar · Last updated ' + updatedLabel;
      badge.dataset.updatedAt = stats.updated_at;
    } catch {
      // Keep the visible, linked last-known count if the request fails.
    } finally {
      window.clearTimeout(timeout);
    }
  }

  refreshCitations();
})();
