import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AuthUser } from '@cricket-os/shared';
import { secureStorage } from '@/lib/secureStore';

// Tokens live in the device keychain (Keychain on iOS, Keystore on Android)
// via expo-secure-store. Other app state (region, scoring overrides) lives
// in AsyncStorage — secure-store has a 2 KiB-per-value soft limit that we
// don't want to brush up against for general state.

export interface AuthUserState extends AuthUser {
  isVerified?: boolean;
}

interface AuthStore {
  user: AuthUserState | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setUser: (user: AuthUserState) => void;
  setTokens: (access: string, refresh: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setUser: (user) => set({ user, isAuthenticated: true }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      logout: () =>
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),
    }),
    {
      name: 'cricket-os-auth',
      storage: createJSONStorage(() => secureStorage),
    }
  )
);
