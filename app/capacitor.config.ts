import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.omnideck.app',
  appName: 'OmniDeck',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    ScreenOrientation: {
      // Lock to landscape
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#07090E',
    },
    Keyboard: {},
  },
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
    backgroundColor: '#07090E',
    preferredContentMode: 'mobile',
  },
  android: {
    backgroundColor: '#07090E',
    allowMixedContent: true,
  },
};

export default config;
