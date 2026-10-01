let nativeConnected;

export const isOnline = () => nativeConnected ?? globalThis.navigator?.onLine ?? true;

export function setNativeConnectivity(connected) {
  const before = isOnline();
  nativeConnected = connected;
  if (before !== isOnline()) window.dispatchEvent(new Event(isOnline() ? 'online' : 'offline'));
}
