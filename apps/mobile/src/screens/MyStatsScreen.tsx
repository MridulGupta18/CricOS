import { View, Text, ScrollView, Pressable, StatusBar, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { C, F, R, S } from '@/lib/theme';

function StatBlock({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: S.md }}>
      <Text style={{ fontFamily: F.bold, fontSize: 22, color: C.text, lineHeight: 26 }}>{value}</Text>
      <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
      {sub ? <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textSub, marginTop: 1 }}>{sub}</Text> : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: S.xl }}>
      <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.textSub, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: S.md }}>{title}</Text>
      <View style={{ backgroundColor: C.card, borderRadius: R.xl, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
}

function StatRow({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border }}>
      {items.map((item, i) => (
        <View key={item.label} style={{ flex: 1, alignItems: 'center', paddingVertical: 14, borderRightWidth: i < items.length - 1 ? 1 : 0, borderRightColor: C.border }}>
          <Text style={{ fontFamily: F.bold, fontSize: 20, color: C.text }}>{item.value}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 }}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function DataRow({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
      <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textMuted }}>{label}</Text>
      <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.text }}>{value}</Text>
    </View>
  );
}

const fmt = (n: number | null | undefined, decimals = 1) =>
  n == null || isNaN(n) || n === 0 ? '0' : Number(n).toFixed(decimals);

export function MyStatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['my-stats', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // Find player linked to this user
      const playersRes = await apiClient.get('/players', { params: { limit: '200' } });
      const myPlayer = (playersRes.data?.data ?? []).find((p: any) => p.userId === user!.id);
      if (!myPlayer) return null;
      // Fetch stats
      const statsRes = await apiClient.get(`/players/${myPlayer.id}/stats`);
      return { player: myPlayer, stats: statsRes.data?.data };
    },
  });

  const player = data?.player;
  const stats  = data?.stats;
  const bat    = stats?.batting;
  const bowl   = stats?.bowling;
  const field  = stats?.fielding;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={{ paddingTop: insets.top + 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.xl, gap: S.md }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={{ fontFamily: F.reg, fontSize: 22, color: C.textSub }}>‹</Text>
          </Pressable>
          <Text style={{ flex: 1, fontFamily: F.bold, fontSize: 17, color: C.text }}>My Stats</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.primary} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: S.xl, paddingBottom: insets.bottom + 80 }}
        >
          {/* Player card */}
          {player && (
            <View style={{ backgroundColor: '#141929', borderRadius: R.xl, borderWidth: 1, borderColor: C.border, padding: S.lg, marginBottom: S.xl, flexDirection: 'row', alignItems: 'center', gap: S.lg }}>
              <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: F.bold, fontSize: 20, color: '#fff' }}>
                  {player.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.text }}>{player.name}</Text>
                <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                  {player.role?.replace('_', ' ')} {player.jerseyNumber != null ? `· #${player.jerseyNumber}` : ''}
                </Text>
              </View>
            </View>
          )}

          {!player && (
            <View style={{ backgroundColor: C.card, borderRadius: R.xl, borderWidth: 1, borderColor: C.border, padding: S.xl, alignItems: 'center', marginBottom: S.xl }}>
              <Text style={{ fontSize: 40, marginBottom: S.md }}>🏏</Text>
              <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.text, marginBottom: S.sm }}>No player profile linked</Text>
              <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textSub, textAlign: 'center' }}>
                Your stats will appear here once a team captain adds you to a squad and you play matches.
              </Text>
            </View>
          )}

          {/* ── Batting ── */}
          <Section title="Batting">
            <StatRow items={[
              { label: 'Matches', value: bat?.matches ?? 0 },
              { label: 'Innings', value: bat?.innings ?? 0 },
              { label: 'Runs',    value: bat?.runs    ?? 0 },
            ]} />
            <StatRow items={[
              { label: 'Avg',    value: fmt(bat?.average)    },
              { label: 'SR',     value: fmt(bat?.strikeRate) },
              { label: 'HS',     value: bat?.highScore ?? 0  },
            ]} />
            <View style={{ flexDirection: 'row' }}>
              <DataRow label="50s" value={bat?.halfCenturies ?? 0} />
            </View>
            {[
              ['50s',    bat?.halfCenturies ?? 0],
              ['100s',   bat?.centuries     ?? 0],
              ['Fours',  bat?.fours         ?? 0],
              ['Sixes',  bat?.sixes         ?? 0],
              ['Not outs', bat?.notOuts     ?? 0],
            ].map(([l, v]) => (
              <DataRow key={l as string} label={l as string} value={v as number} />
            ))}
          </Section>

          {/* ── Bowling ── */}
          <Section title="Bowling">
            <StatRow items={[
              { label: 'Wickets', value: bowl?.wickets ?? 0 },
              { label: 'Overs',   value: bowl?.overs   ?? 0 },
              { label: 'Runs',    value: bowl?.runs     ?? 0 },
            ]} />
            <StatRow items={[
              { label: 'Avg',  value: fmt(bowl?.average)  },
              { label: 'Econ', value: fmt(bowl?.economy)  },
              { label: 'SR',   value: fmt(bowl?.strikeRate) },
            ]} />
            {[
              ['Best',    bowl?.bestFigures ?? '—'],
              ['Maidens', bowl?.maidens     ?? 0   ],
              ['5-wicket hauls', bowl?.fiveWicketHauls ?? 0],
            ].map(([l, v]) => (
              <DataRow key={l as string} label={l as string} value={v as any} />
            ))}
          </Section>

          {/* ── Fielding ── */}
          <Section title="Fielding">
            {[
              ['Catches',   field?.catches   ?? 0],
              ['Run outs',  field?.runOuts   ?? 0],
              ['Stumpings', field?.stumpings ?? 0],
            ].map(([l, v]) => (
              <DataRow key={l as string} label={l as string} value={v as number} />
            ))}
          </Section>
        </ScrollView>
      )}
    </View>
  );
}
