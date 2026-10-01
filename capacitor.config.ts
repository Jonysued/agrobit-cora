import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lucient.app',
  appName: 'Lucient',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  ios: { contentInset: 'automatic', allowsLinkPreview: false },
};

export default config;
