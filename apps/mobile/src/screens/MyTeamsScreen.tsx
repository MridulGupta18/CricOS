import { View, Text, FlatList, Pressable, StatusBar, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { C, F, R, S } from '@/lib/theme';

const ROLE_LABEL: Record<string, string> = {
  CAPTAIN: 'Captain', VICE_CAPTAIN: 'Vice-Captain', PLAYER: 'Player',
};
const ROLE_COLOR: Record<string, string> = {
  CAPTAIN: C.orange, VICE_CAPTAIN: C.primaryLight, PLAYER: C.textMuted,
};

function TeamCard({ item, onPress }: { item: any; onPress: () => void }) {
  const team = item.team;
  const role = item.role ?? 'PLAYER';
  const initials = (team?.shortName ?? team?.name?.slice(0, 3) ?? '??').toUpperCase();

  return (
    <Pressable onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? C.cardHover : C.card,
        borderRadius: R.xl, borderWidth: 1, borderColor: C.border,
        padding: S.lg, marginBottom: S.sm,
        flexDirection: 'row', alignItems: 'center', gap: S.lg,
      })}>
      <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Text style={{ fontFamily: F.bold, fontSize: 13, color: '#fff' }}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.text, marginBottom: 3 }}>{team?.name ?? '—'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, backgroundColor: `${ROLE_COLOR[role]}18`, borderWidth: 1, borderColor: `${ROLE_COLOR[role]}44` }}>
            <Text style={{ fontFamily: F.bold, fontSize: 10, color: ROLE_COLOR[role] }}>{ROLE_LABEL[role] ?? role}</Text>
          </View>
          {team?.city && <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>📍 {team.city}</Text>}
        </View>
      </View>
      <Text style={{ fontFamily: F.reg, fontSize: 18, color: C.textMuted }}>›</Text>
    </Pressable>
  );
}

export function MyTeamsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();

  // Fetch the player profile linked to this user account, then their team memberships
  const { data, isLoading } = useQuery({
    queryKey: ['my-teams', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // Find the player profile linked to this user
      const playersRes = await apiClient.get('/players', { params: { limit: '200' } });
      const myPlayer = (playersRes.data?.data ?? []).find((p: any) => p.userId === user!.id);
      if (!myPlayer) return [];

      // Get full player details including team memberships
      const playerRes = await apiClient.get(`/players/${myPlayer.id}`);
      const memberships = playerRes.data?.data?.teamMemberships ?? [];
      return memberships.filter((m: any) => m.isActive);
    },
  });

  const teams: any[] = data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={{ paddingTop: insets.top + 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.xl, gap: S.md }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={{ fontFamily: F.reg, fontSize: 22, color: C.textSub }}>‹</Text>
          </Pressable>
          <Text style={{ flex: 1, fontFamily: F.bold, fontSize: 17, color: C.text }}>My Teams</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.primary} />
        </View>
      ) : (
        <FlatList
          data={teams}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: S.xl, paddingBottom: insets.bottom + 80 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 64 }}>
              <Text style={{ fontSize: 48, marginBottom: S.lg }}>👥</Text>
              <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.text, marginBottom: S.sm }}>No teams yet</Text>
              <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.textSub, textAlign: 'center' }}>
                You'll appear here once a team captain adds you to their squad.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TeamCard item={item} onPress={() => item.team?.id && router.push(`/team/${item.team.id}`)} />
          )}
        />
      )}
    </View>
  );
}
