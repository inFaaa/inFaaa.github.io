const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '..', 'scholar-citations.js'), 'utf8');
const validStats = {
  scholar_id: '2t7iBnkAAAAJ',
  profile_url: 'https://scholar.google.com/citations?user=2t7iBnkAAAAJ&hl=en',
  citations: 3600,
  updated_at: '2026-11-19T16:23:00Z',
};

async function render({ hostname = 'infaaa.github.io', stats = validStats,
  ok = true, networkError = false, absent = false } = {}) {
  const badge = {
    textContent: '3,533 Google Scholar citations',
    title: 'Original update date',
    dataset: { updatedAt: '2026-11-18T21:03:28Z' },
  };
  const requests = [];
  vm.runInNewContext(script, {
    document: {
      baseURI: `http://${hostname}/index.html`,
      getElementById: () => absent ? null : badge,
    },
    window: { location: { hostname }, setTimeout, clearTimeout },
    AbortController, URL,
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (networkError) throw new Error('Offline');
      return { ok, json: async () => stats };
    },
  });
  await new Promise(setImmediate);
  return { badge, requests };
}

test('updates count and timestamp from raw main without cached credentials', async () => {
  const { badge, requests } = await render();
  assert.equal(badge.textContent, '3,600 Google Scholar citations');
  assert.match(badge.title, /Last updated Nov 19, 2026/);
  assert.equal(badge.dataset.updatedAt, validStats.updated_at);
  assert.equal(requests[0].url,
    'https://raw.githubusercontent.com/inFaaa/inFaaa.github.io/main/data/scholar-stats.json');
  assert.equal(requests[0].options.cache, 'no-cache');
  assert.equal(requests[0].options.credentials, 'omit');
});

test('localhost preview uses local JSON', async () => {
  const { requests } = await render({ hostname: 'localhost' });
  assert.equal(requests[0].url, 'http://localhost/data/scholar-stats.json');
});

test('rejects mismatched identity, invalid counts, and invalid dates', async () => {
  const invalid = [
    null,
    { ...validStats, scholar_id: 'another-user' },
    { ...validStats, profile_url: 'https://example.com/' },
    { ...validStats, citations: '3600' },
    { ...validStats, citations: 3.6 },
    { ...validStats, citations: -1 },
    { ...validStats, citations: 1_000_000_001 },
    { ...validStats, updated_at: 'yesterday' },
    { ...validStats, updated_at: '2026-02-30T16:23:00Z' },
  ];
  for (const stats of invalid) {
    const { badge } = await render({ stats });
    assert.equal(badge.textContent, '3,533 Google Scholar citations');
    assert.equal(badge.title, 'Original update date');
  }
});

test('keeps fallback count when the response is unsuccessful', async () => {
  const { badge } = await render({ ok: false });
  assert.equal(badge.textContent, '3,533 Google Scholar citations');
  assert.equal(badge.title, 'Original update date');
});

test('keeps fallback count when the network fails', async () => {
  const { badge } = await render({ networkError: true });
  assert.equal(badge.textContent, '3,533 Google Scholar citations');
  assert.equal(badge.title, 'Original update date');
});

test('an older cached result cannot replace newer displayed data', async () => {
  const { badge } = await render({ stats: { ...validStats, updated_at: '2026-11-17T16:23:00Z' } });
  assert.equal(badge.textContent, '3,533 Google Scholar citations');
  assert.equal(badge.dataset.updatedAt, '2026-11-18T21:03:28Z');
});

test('does not fetch when the citation link is absent', async () => {
  const { requests } = await render({ absent: true });
  assert.equal(requests.length, 0);
});
