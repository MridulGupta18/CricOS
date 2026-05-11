import { View, Text, ScrollView, Pressable, StatusBar } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { teamsApi } from '@/lib/api';
import { C, F, R, S } from '@/lib/theme';

const ROLE_LABELS: Record<string, string> = {
  CAPTAIN: 'C', VICE_CAPTAIN: 'VC', PLAYER: '', COACH: 'Coach',
};

export default function TeamDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const { data, isLoading } = useQuery({
    queryKey: ['team', id],
    queryFn: () => teamsApi.get(id!),
    enabled: !!id,
  });

  const team = data?.data?.data;

  if (isLoading || !team) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.textSub }}>
          {isLoading ? 'Loading team…' : 'Team not found'}
        </Text>
      </View>
    );
  }

  const members = (team.members ?? []).filter((m: any) => m.isActive);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: S.xl, paddingBottom: S.lg, flexDirection: 'row', alignItems: 'center', gap: S.md, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={{ fontFamily: F.reg, fontSize: 22, color: C.textSub }}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.text }}>{team.name}</Text>
            <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted }}>
              {team.shortName}{team.city ? ` · ${team.city}` : ''}{team.country ? ` · ${team.country}` : ''}
            </Text>
          </View>
          <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: C.primary + '22', borderWidth: 1, borderColor: C.primary + '44', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.primaryLight }}>{team.shortName?.slice(0, 3)}</Text>
          </View>
        </View>

        {/* Stats strip */}
        <View style={{ flexDirection: 'row', backgroundColor: '#141929', paddingVertical: S.lg, borderBottomWidth: 1, borderBottomColor: C.border }}>
          {[
            { label: 'Players', value: members.length },
            { label: 'City', value: team.city ?? '—' },
            { label: 'Country', value: team.country ?? '—' },
          ].map((s, i) => (
            <View key={s.label} style={{ flex: 1, alignItems: 'center', borderRightWidth: i < 2 ? 1 : 0, borderRightColor: C.border }}>
              <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.text }}>{s.value}</Text>
              <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Squad */}
        <View style={{ paddingHorizontal: S.xl, paddingTop: S.lg }}>
          <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: S.md }}>
            Squad ({members.length})
          </Text>
          <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
            {members.length === 0 && (
              <View style={{ padding: S.xl, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textMuted }}>No players in this team yet</Text>
              </View>
            )}
            {members.map((m: any, i: number) => {
              const p = m.player;
              const badge = ROLE_LABELS[m.role] ?? '';
              return (
                <View key={p?.id ?? i} style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md, borderBottomWidth: i < members.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.primary + '33', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.primaryLight }}>
                      {p?.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.text }}>{p?.name}</Text>
                      {badge ? (
                        <View style={{ backgroundColor: C.primary + '33', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                          <Text style={{ fontFamily: F.bold, fontSize: 9, color: C.primaryLight }}>{badge}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>
                      {p?.role?.replace('_', ' ') ?? 'Player'}
                      {p?.battingStyle ? ` · ${p.battingStyle.replace('_', '-').toLowerCase()} bat` : ''}
                    </Text>
                  </View>
                  {p?.jerseyNumber != null && (
                    <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.textMuted }}>#{p.jerseyNumber}</Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
