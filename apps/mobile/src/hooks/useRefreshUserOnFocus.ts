import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

// Refresh the cached `user` (role, verification status, profile name) whenever
// the app comes back to the foreground. This closes the "I was promoted to
// ORGANIZER but the New League button is still hidden" gap from the review.
//
// Mount once at the top of the app — App.tsx / _layout.tsx.

export function useRefreshUserOnFocus() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    if (!isAuthenticated) return;

    async function fetchMe() {
      try {
        const { data } = await authApi.me();
        if (data?.data) {
          setUser({
            id:    data.data.id,
            email: data.data.email,
            name:  data.data.name,
            role:  data.data.role,
            isVerified: data.data.isVerified,
          });
        }
      } catch {
        // Silent — the request interceptor will handle 401s.
      }
    }

    // Run once on mount, then again on every foreground transition.
    fetchMe();
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') fetchMe();
    });
    return () => sub.remove();
  }, [isAuthenticated]);
}
