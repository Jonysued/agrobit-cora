import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

const root = 'ios/App/App';
const config = JSON.parse(await readFile(`${root}/capacitor.config.json`, 'utf8'));
assert.equal(config.appId, 'com.lucient.app');
assert.equal(config.webDir, 'dist');
assert.equal(config.server?.url, undefined, 'Offline startup must use bundled assets');
async function verify(directory = '') {
  for (const entry of await readdir(path.join('dist', directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) await verify(relative);
    else assert.deepEqual(await readFile(path.join(root, 'public', relative)), await readFile(path.join('dist', relative)), `Stale asset ${relative}`);
  }
}
await verify();
const info = await readFile(`${root}/Info.plist`, 'utf8');
assert.match(info, /NSCameraUsageDescription/);
const packageSwift = await readFile('ios/App/CapApp-SPM/Package.swift', 'utf8');
assert.match(packageSwift, /CapacitorNetwork/);
assert.match(packageSwift, /CapacitorApp/);
console.log('iOS bundle verified: current assets, local shell, camera permission and native network/resume plugins');
