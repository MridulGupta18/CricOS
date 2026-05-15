import { useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StatusBar, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { playersApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { EmptyState } from '@/components/ui/EmptyState';
import { C, F, R, S } from '@/lib/theme';

// VIEWER has no player:create — hide the "Register Player" CTA in that case.
const CAN_CREATE_PLAYER = new Set(['PLAYER', 'SCORER', 'ORGANIZER', 'ADMIN', 'MASTER']);

const ROLES = [
  { id: 'All',           label: 'All' },
  { id: 'BATSMAN',       label: 'Batters' },
  { id: 'BOWLER',        label: 'Bowlers' },
  { id: 'ALL_ROUNDER',   label: 'All-rounders' },
  { id: 'WICKET_KEEPER', label: 'Wicket-keepers' },
];

const ROLE_LABELS: Record<string, string> = {
  BATSMAN: 'Batsman', BOWLER: 'Bowler', ALL_ROUNDER: 'All-rounder', WICKET_KEEPER: 'WK-Batsman',
};

function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2.2,
      backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: C.border, flexShrink: 0,
    }}>
      <Text style={{ fontFamily: F.bold, fontSize: size * 0.32, color: '#fff' }}>{initials}</Text>
    </View>
  );
}

export function PlayersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('All');
  const userRole = useAuthStore((s) => s.user?.role);
  const canCreatePlayer = !!userRole && CAN_CREATE_PLAYER.has(userRole);

  const params: Record<string, string> = { limit: '100' };
  if (role !== 'All') params.role = role;
  if (q.trim()) params.q = q.trim();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['players', role, q],
    queryFn: () => playersApi.list(params),
    staleTime: 30_000,
  });

  const players: any[] = data?.data?.data ?? [];

  const statValue = (p: any) => {
    if (!p.careerStats) return null;
    if (['BOWLER'].includes(p.role)) return { val: p.careerStats.bowlingWickets, label: 'wickets' };
    return { val: p.careerStats.battingRuns, label: 'runs' };
  };

  const avgValue = (p: any) => {
    if (!p.careerStats) return null;
    if (['BOWLER'].includes(p.role)) return p.careerStats.bowlingAverage;
    return p.careerStats.battingAverage;
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={{ paddingTop: insets.top + 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.xl, gap: S.sm }}>
          <Text style={{ flex: 1, fontFamily: F.bold, fontSize: 17, color: C.text, letterSpacing: -0.3 }}>Players</Text>
        </View>
        <View style={{ paddingHorizontal: S.xl, paddingBottom: S.sm, gap: S.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingHorizontal: S.lg, paddingVertical: 10 }}>
            <Text style={{ fontSize: 16, color: C.textMuted }}>⌕</Text>
            <TextInput
              value={q} onChangeText={setQ}
              placeholder="Search players..." placeholderTextColor={C.textMuted}
              style={{ flex: 1, fontFamily: F.reg, fontSize: 14, color: C.text }}
              autoCapitalize="none" autoCorrect={false}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border }}>
              {ROLES.map(r => (
                <Pressable key={r.id} onPress={() => setRole(r.id)}
                  style={{ paddingVertical: S.sm, paddingHorizontal: S.md, borderBottomWidth: 2, borderBottomColor: role === r.id ? C.primary : 'transparent', marginBottom: -1 }}>
                  <Text style={{ fontFamily: role === r.id ? F.bold : F.medium, fontSize: 13, color: role === r.id ? C.primaryLight : C.textSub } as any}>
                    {r.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.primary} />
        </View>
      ) : (
        <FlatList
          data={players}
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: S.xl, paddingBottom: insets.bottom + 80, paddingTop: S.sm }}
          ListHeaderComponent={
            <Text style={{ fontFamily: F.semi, fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: S.sm, marginTop: S.xs }}>
              {players.length} Players
            </Text>
          }
          ListEmptyComponent={
            <EmptyState
              icon="👥"
              title={q.trim() ? `No players match "${q.trim()}"` : 'No players yet'}
              description={q.trim()
                ? 'Try a different search or filter.'
                : canCreatePlayer ? 'Register players to see them here.' : 'Check back later.'}
              ctaLabel={!q.trim() && canCreatePlayer ? '+ Register Player' : undefined}
              onPressCta={!q.trim() && canCreatePlayer ? () => router.push('/players/create') : undefined}
            />
          }
          renderItem={({ item }) => {
            const sv = statValue(item);
            const av = avgValue(item);
            const team = item.teamMemberships?.[0]?.team;
            return (
              <Pressable onPress={() => router.push(`/player/${item.id}`)}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? C.cardHover : C.card,
                  borderRadius: R.xl, borderWidth: 1, borderColor: C.border,
                  padding: S.lg, marginBottom: S.sm,
                  flexDirection: 'row', alignItems: 'center', gap: S.lg,
                })}>
                <Avatar name={item.name} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.text, marginBottom: 2 }}>{item.name}</Text>
                  <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted }}>
                    {ROLE_LABELS[item.role] ?? item.role ?? 'Player'}
                    {team ? ` · ${team.name}` : ''}
                  </Text>
                  {item.city ? (
                    <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted, marginTop: 2 }}>📍 {item.city}</Text>
                  ) : null}
                </View>
                {sv ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.text }}>{sv.val}</Text>
                    <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted }}>{sv.label}</Text>
                    {av != null && av > 0 ? (
                      <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textSub, marginTop: 2 }}>avg {parseFloat(av).toFixed(1)}</Text>
                    ) : null}
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
