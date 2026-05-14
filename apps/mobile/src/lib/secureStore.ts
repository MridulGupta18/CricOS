// Secure storage shim.
//
// On native (iOS / Android) we use expo-secure-store, which wraps Keychain
// (iOS) and Keystore-encrypted SharedPreferences (Android). Web has no
// hardware secure enclave — we fall back to localStorage (still much smaller
// blast radius than other app state, since the web build only runs on the
// developer's machine for now).
//
// The contract matches the StateStorage interface Zustand expects so we can
// drop this into createJSONStorage().

import { Platform } from 'react-native';

// Lazy require to avoid bundler errors on web where the native module is absent.
let SecureStore: any = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    SecureStore = require('expo-secure-store');
  } catch {
    // expo-secure-store isn't installed — fall through to localStorage shim.
  }
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web' || !SecureStore) {
      try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
    }
    try { return await SecureStore.getItemAsync(key); } catch { return null; }
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web' || !SecureStore) {
      try { globalThis.localStorage?.setItem(key, value); } catch { /* ignore */ }
      return;
    }
    try { await SecureStore.setItemAsync(key, value); } catch { /* ignore — falls through */ }
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web' || !SecureStore) {
      try { globalThis.localStorage?.removeItem(key); } catch { /* ignore */ }
      return;
    }
    try { await SecureStore.deleteItemAsync(key); } catch { /* ignore */ }
  },
};
