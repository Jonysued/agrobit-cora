import { Capacitor } from '@capacitor/core';
import { setNativeConnectivity } from './connectivity.js';

export const isNative = Capacitor.isNativePlatform();
export const authCallbackOrigin = () => isNative ? 'https://lucient-v1.vercel.app' : window.location.origin;

export async function initializeNative() {
  if (!isNative) return;
  const [{ App }, { Network }] = await Promise.all([import('@capacitor/app'), import('@capacitor/network')]);
  await Network.addListener('networkStatusChange', status => setNativeConnectivity(status.connected));
  setNativeConnectivity((await Network.getStatus()).connected);
  await App.addListener('appStateChange', async ({ isActive }) => {
    if (!isActive) { window.dispatchEvent(new Event('lucient:pause')); return; }
    try { setNativeConnectivity((await Network.getStatus()).connected); }
    finally { window.dispatchEvent(new Event('lucient:resume')); }
  });
  if (Capacitor.getPlatform() === 'android') {
    await App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back(); else void App.minimizeApp();
    });
  }
}
