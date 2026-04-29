import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

/**
 * Redirects to /auth/login if the user isn't authenticated.
 * Use at the top of any screen that requires a logged-in user.
 * Returns isAuthenticated so callers can also gate inline UI.
 */
export function useRequireAuth() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
    }
  }, [isAuthenticated]);

  return { isAuthenticated };
}
