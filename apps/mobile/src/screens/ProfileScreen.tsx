import { View, Text, Pressable, ScrollView, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/lib/api';
import { C, F, R, S } from '@/lib/theme';

function Avatar({ name, size = 72 }: { name: string; size?: number }) {
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 3.3,
      backgroundColor: C.primary,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: C.border,
    }}>
      <Text style={{ fontFamily: F.bold, fontSize: size * 0.32, color: '#fff' }}>{initials}</Text>
    </View>
  );
}

// Menu items visible to all authenticated users
const MENU_ITEMS = [
  { icon: '📊', label: 'My Stats',    sub: 'Your career batting & bowling', route: '/my-stats'        },
  { icon: '◈',  label: 'My Leagues',  sub: 'Leagues you\'re part of',      route: '/(tabs)/leagues'  },
  { icon: '◷',  label: 'My Matches',  sub: 'Match history & scorecards',   route: '/(tabs)/matches'  },
  { icon: '👥', label: 'My Teams',    sub: 'Teams you play for',            route: '/my-teams'        },
];

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();

  async function handleLogout() {
    // Pass the current refresh token so the server can delete it server-side —
    // otherwise a stolen refresh token would remain valid until expiry.
    const refreshToken = useAuthStore.getState().refreshToken ?? undefined;
    try { await authApi.logout(refreshToken); } catch {}
    logout();
    Toast.show({ type: 'success', text1: 'Signed out' });
  }

  const displayName = user?.name ?? 'Guest';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={{ paddingTop: insets.top + 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.xl }}>
          <Text style={{ flex: 1, fontFamily: F.bold, fontSize: 17, color: C.text, letterSpacing: -0.3 }}>Profile</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>

        {/* Hero — name and email only, no role badge */}
        <View style={{ backgroundColor: '#141929', paddingHorizontal: S.xl, paddingTop: S.xxl, paddingBottom: S.xl, borderBottomWidth: 1, borderBottomColor: C.border, alignItems: 'center', marginBottom: S.lg }}>
          <View style={{ marginBottom: S.md }}>
            <Avatar name={displayName} size={72} />
          </View>
          <Text style={{ fontFamily: F.bold, fontSize: 20, color: C.text, marginBottom: 4 }}>{displayName}</Text>
          {user?.email && (
            <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textMuted }}>{user.email}</Text>
          )}
        </View>

        {/* Guest sign-in prompt */}
        {!isAuthenticated && (
          <View style={{ paddingHorizontal: S.xl, marginBottom: S.lg, gap: S.sm }}>
            <Pressable onPress={() => router.push('/auth/login')}
              style={({ pressed }) => ({ backgroundColor: C.primary, borderRadius: R.lg, paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.85 : 1 })}>
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: '#fff' }}>Sign In</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/auth/register')}
              style={({ pressed }) => ({ backgroundColor: C.card, borderRadius: R.lg, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border, opacity: pressed ? 0.85 : 1 })}>
              <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.text }}>Create Account</Text>
            </Pressable>
          </View>
        )}

        {/* Menu */}
        {isAuthenticated && (
          <View style={{ paddingHorizontal: S.xl, gap: S.sm }}>
            {MENU_ITEMS.map((item) => (
              <Pressable key={item.label}
                onPress={() => router.push(item.route as any)}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? C.cardHover : C.card,
                  borderWidth: 1, borderColor: C.border,
                  borderRadius: R.lg, padding: S.lg,
                  flexDirection: 'row', alignItems: 'center', gap: S.lg,
                })}>
                <View style={{ width: 44, height: 44, borderRadius: R.md, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Text style={{ fontSize: 20 }}>{item.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.text }}>{item.label}</Text>
                  <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted, marginTop: 2 }}>{item.sub}</Text>
                </View>
                <Text style={{ fontFamily: F.reg, fontSize: 18, color: C.textMuted }}>›</Text>
              </Pressable>
            ))}

            <Pressable onPress={handleLogout}
              style={({ pressed }) => ({
                backgroundColor: pressed ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
                borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
                borderRadius: R.lg, padding: S.lg,
                alignItems: 'center', justifyContent: 'center',
                marginTop: S.sm,
              })}>
              <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.red }}>Sign Out</Text>
            </Pressable>
          </View>
        )}

        <View style={{ alignItems: 'center', paddingTop: S.xxl }}>
          <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.textMuted }}>CricOS</Text>
          <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textDim, marginTop: 4 }}>Built for scorers, by cricket fans</Text>
        </View>
      </ScrollView>
    </View>
  );
}
