import { View, Text, ScrollView, Pressable, StatusBar, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playersApi } from '@/lib/api';
import { C, F, R, S } from '@/lib/theme';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', backgroundColor: C.card, borderRadius: R.lg, padding: S.md, borderWidth: 1, borderColor: C.border }}>
      <Text style={{ fontFamily: F.bold, fontSize: 22, color: C.text, lineHeight: 26 }}>{value}</Text>
      {sub && <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.primary, marginTop: 1 }}>{sub}</Text>}
      <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: S.sm, marginTop: S.lg }}>{children}</Text>;
}

function StatsGrid({ items }: { items: { label: string; value: string | number; sub?: string }[] }) {
  const rows = [];
  for (let i = 0; i < items.length; i += 3) rows.push(items.slice(i, i + 3));
  return (
    <View style={{ gap: S.sm }}>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: S.sm }}>
          {row.map((item) => <StatCard key={item.label} {...item} />)}
          {row.length === 2 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </View>
  );
}

export function PlayerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const { data: pd, isLoading: pl, refetch: rp } = useQuery({ queryKey: ['player', id], queryFn: () => playersApi.get(id!), enabled: !!id });
  const { data: sd, isLoading: sl, refetch: rs } = useQuery({ queryKey: ['player-stats', id], queryFn: () => playersApi.getStats(id!), enabled: !!id });

  const player = pd?.data?.data;
  const stats  = sd?.data?.data;
  const bat    = stats?.batting;
  const bowl   = stats?.bowling;
  const field  = stats?.fielding;

  const initials = player?.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2) ?? '?';
  const teams: any[] = player?.teamMemberships ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={pl || sl} onRefresh={() => { rp(); rs(); }} tintColor={C.primary} />}
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: S.xl, paddingBottom: S.md, flexDirection: 'row', alignItems: 'center', gap: S.md, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={{ fontFamily: F.reg, fontSize: 22, color: C.textSub }}>‹</Text>
          </Pressable>
          <Text style={{ flex: 1, fontFamily: F.bold, fontSize: 16, color: C.text }}>Player Profile</Text>
        </View>

        {/* Hero */}
        <View style={{ backgroundColor: '#141929', padding: S.xl, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.lg, marginBottom: S.lg }}>
            <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: F.bold, fontSize: 26, color: '#fff' }}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 22, color: C.text }}>{player?.name ?? '—'}</Text>
              <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textSub, marginTop: 2 }}>
                {player?.role?.replace('_', ' ') ?? 'Cricketer'}
                {player?.battingStyle ? `  ·  ${player.battingStyle === 'RIGHT_HAND' ? 'RHB' : 'LHB'}` : ''}
              </Text>
              {player?.city && <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted, marginTop: 2 }}>📍 {player.city}</Text>}
            </View>
            {player?.jerseyNumber != null && (
              <View style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 2, borderColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.primaryLight }}>#{player.jerseyNumber}</Text>
              </View>
            )}
          </View>

          {/* Teams */}
          {teams.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
              {teams.map((tm: any) => (
                <View key={tm.team?.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, backgroundColor: 'rgba(99,102,241,0.12)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)' }}>
                  <Text style={{ fontFamily: F.semi, fontSize: 11, color: C.primaryLight }}>{tm.team?.shortName}</Text>
                  {tm.role === 'CAPTAIN' && <Text style={{ fontFamily: F.bold, fontSize: 9, color: C.orange }}>(C)</Text>}
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ paddingHorizontal: S.xl }}>
          {/* Batting */}
          {bat && bat.innings > 0 && (
            <View>
              <SectionTitle>Batting</SectionTitle>
              <StatsGrid items={[
                { label: 'Matches',    value: bat.matches },
                { label: 'Innings',    value: bat.innings },
                { label: 'Runs',       value: bat.runs },
                { label: 'Average',    value: bat.average, sub: bat.notOuts > 0 ? `${bat.notOuts} NO` : undefined },
                { label: 'Strike Rate', value: bat.strikeRate },
                { label: 'High Score', value: bat.highScore },
                { label: '50s / 100s', value: `${bat.halfCenturies} / ${bat.centuries}` },
                { label: '4s',         value: bat.fours, sub: undefined },
                { label: '6s',         value: bat.sixes, sub: undefined },
              ]} />
            </View>
          )}

          {/* Bowling */}
          {bowl && bowl.balls > 0 && (
            <View>
              <SectionTitle>Bowling</SectionTitle>
              <StatsGrid items={[
                { label: 'Matches',   value: bowl.matches },
                { label: 'Wickets',   value: bowl.wickets },
                { label: 'Best',      value: bowl.bestFigures },
                { label: 'Average',   value: bowl.average || '—' },
                { label: 'Economy',   value: bowl.economy },
                { label: 'SR',        value: bowl.strikeRate || '—' },
                { label: 'Overs',     value: bowl.overs },
                { label: 'Maidens',   value: bowl.maidens },
                { label: '5-fors',    value: bowl.fiveWicketHauls },
              ]} />
            </View>
          )}

          {/* Fielding */}
          {field && (field.catches + field.runOuts + field.stumpings) > 0 && (
            <View>
              <SectionTitle>Fielding</SectionTitle>
              <StatsGrid items={[
                { label: 'Catches',   value: field.catches },
                { label: 'Run Outs',  value: field.runOuts },
                { label: 'Stumpings', value: field.stumpings },
              ]} />
            </View>
          )}

          {/* Bowling style info */}
          {player?.bowlingStyle && (
            <View style={{ marginTop: S.lg, backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.lg }}>
              <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted }}>
                Bowling: <Text style={{ fontFamily: F.semi, color: C.text }}>{player.bowlingStyle}</Text>
              </Text>
            </View>
          )}

          {!bat && !bowl && !field && !pl && !sl && (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Text style={{ fontSize: 32, marginBottom: S.md }}>📊</Text>
              <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.text, marginBottom: S.sm }}>No match data yet</Text>
              <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textSub, textAlign: 'center' }}>Stats appear after the player participates in scored matches</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
