import test from 'node:test';
import assert from 'node:assert/strict';
import { isOnline, setNativeConnectivity } from './connectivity.js';

test('native reconnect overrides stale WebView state and emits only real transitions', () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  globalThis.window = new EventTarget();
  const events = [];
  window.addEventListener('offline', () => events.push('offline'));
  window.addEventListener('online', () => events.push('online'));
  setNativeConnectivity(false);
  assert.equal(isOnline(), false);
  setNativeConnectivity(false);
  navigator.onLine = false;
  setNativeConnectivity(true);
  assert.equal(isOnline(), true);
  setNativeConnectivity(true);
  assert.deepEqual(events, ['offline', 'online']);
});
