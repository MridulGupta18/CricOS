import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { useAuthStore } from '@/stores/authStore';

SplashScreen.preventAutoHideAsync();

// expo-font's processFontFamily() fires a dev-only "not loaded through expo-font" warning
// even after Font.loadAsync succeeds, because our Metro resolveRequest creates a split
// module identity for the loaded registry. Fonts DO render correctly (the native side has
// them); this just suppresses the false-positive console noise in development.
if (__DEV__) {
  const _warn = console.warn.bind(console);
  console.warn = (...args: Parameters<typeof console.warn>) => {
    if (typeof args[0] === 'string' && args[0].includes('not a system font')) return;
    _warn(...args);
  };
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

// Redirects unauthenticated users to onboarding and authenticated users away from it.
function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [hydrated, setHydrated] = useState(false);

  // Wait for zustand-persist to finish reading from AsyncStorage
  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
    } else {
      const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
      return unsub;
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const inTabs    = segments[0] === '(tabs)';
    const inOnboard = segments[0] === 'onboarding';
    const inAuth    = segments[0] === 'auth';

    if (!isAuthenticated && inTabs) {
      router.replace('/onboarding');
    } else if (isAuthenticated && (inOnboard || inAuth)) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, segments, hydrated]);

  return null;
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Font.loadAsync({
      Inter_400Regular: require('../assets/fonts/Inter_400Regular.ttf'),
      Inter_500Medium:  require('../assets/fonts/Inter_500Medium.ttf'),
      Inter_600SemiBold: require('../assets/fonts/Inter_600SemiBold.ttf'),
      Inter_700Bold:    require('../assets/fonts/Inter_700Bold.ttf'),
    })
      .then(() => { setReady(true); })
      .catch(() => { setReady(true); });
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <BottomSheetModalProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="match/[id]/index" options={{ presentation: 'card' }} />
            <Stack.Screen name="match/[id]/score" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="match/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="league/[slug]" options={{ presentation: 'card' }} />
            <Stack.Screen name="league/create" options={{ presentation: 'modal' }} />
            <Stack.Screen name="team/create" options={{ presentation: 'modal' }} />
            <Stack.Screen name="players/create" options={{ presentation: 'modal' }} />
            <Stack.Screen name="auth/login" options={{ presentation: 'modal' }} />
            <Stack.Screen name="auth/register" options={{ presentation: 'modal' }} />
            <Stack.Screen name="search" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="player/[id]" options={{ presentation: 'card' }} />
          </Stack>
          <AuthGate />
          <StatusBar style="auto" />
          <Toast />
        </BottomSheetModalProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
