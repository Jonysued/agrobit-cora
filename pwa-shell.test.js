import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { offlineShell } from './pwa-shell.js';

test('service worker boots deep links offline with lazy chunks and excludes API/auth requests', async () => {
  let source;
  offlineShell().generateBundle.call({ emitFile(file) { source = file.source; } }, {}, { 'assets/app.js': {}, 'assets/scanner.js': {}, 'assets/style.css': {} });
  const handlers = {}, saved = new Map(), names = new Map();
  const cache = { addAll: async urls => { for (const url of urls) saved.set(url, new Response(url)); }, match: async url => saved.get(url), keys: async () => [], put: async () => {}, delete: async () => {} };
  vm.runInNewContext(source, { URL, Response, self: { location: { origin: 'https://lucient.example' }, clients: { claim: async () => {} }, addEventListener: (name, fn) => { handlers[name] = fn; } }, caches: { open: async name => { names.set(name, cache); return cache; }, keys: async () => [...names.keys()], delete: async name => names.delete(name) }, fetch: () => { throw new Error('offline'); } });
  let completion;
  handlers.install({ waitUntil: p => { completion = p; } }); await completion;
  assert.ok(saved.has('/assets/scanner.js')); assert.ok(saved.has('/brand/lucient-192.png')); assert.ok(saved.has('/index.html'));
  let response;
  handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://lucient.example/Riego?equipo=qr' }, respondWith: p => { response = p; } });
  assert.equal(await (await response).text(), '/index.html');
  for (const request of [{ method: 'POST', url: 'https://db.example/rest/v1/lots' }, { method: 'GET', mode: 'navigate', url: 'https://lucient.example/auth/callback' }, { method: 'GET', url: 'https://db.example/rest/v1/lots' }]) handlers.fetch({ request, respondWith: () => assert.fail('must not cache API or login callback') });
});
