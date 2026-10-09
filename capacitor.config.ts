import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lucient.app',
  appName: 'Lucient',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  // CSS owns safe-area spacing. Native automatic insets can shift on resume/scroll.
  ios: { contentInset: 'never', scrollEnabled: false, backgroundColor: '#ffffff', allowsLinkPreview: false },
  plugins: { SystemBars: { style: 'LIGHT', hidden: false } },
};

export default config;
