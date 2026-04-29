import { useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { matchesApi } from '@/lib/api';
import { C, F, R, S } from '@/lib/theme';

function useT() { return C; }
function resultText(m: any) {
  if (!m.winnerId) return null;
  const n = m.winnerId === m.homeTeam?.id ? m.homeTeam.shortName : m.awayTeam.shortName;
  if (m.winMarginType === 'RUNS') return `${n} won by ${m.winMargin} runs`;
  if (m.winMarginType === 'WICKETS') return `${n} won by ${m.winMargin} wkts`;
  return `${n} won`;
}

const FILTERS = ['All', 'Live', 'Upcoming', 'Completed'] as const;
type Filter = typeof FILTERS[number];

function MatchRow({ m, t, onPress }: { m: any; t: any; onPress: () => void }) {
  const isLive = m.status === 'IN_PROGRESS'; const isDone = m.status === 'COMPLETED';
  const inn = [...(m.innings ?? [])].sort((a: any, b: any) => a.inningsNumber - b.inningsNumber);
  const i1 = inn[0]; const i2 = inn[1];
  const hw = m.winnerId === m.homeTeam?.id; const aw = m.winnerId === m.awayTeam?.id;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      backgroundColor: pressed ? t.cardHover : t.card,
      borderRadius: R.xl, borderWidth: 1,
      borderColor: isLive ? 'rgba(239,68,68,0.35)' : t.border,
      padding: S.lg, marginBottom: S.md,
    })}>
      {/* Header row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.md }}>
        <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted, flex: 1 }} numberOfLines={1}>
          {m.venue ?? 'Calgary'}  ·  {m.format} {m.overs}
        </Text>
        {isLive ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: R.full }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.red }} />
            <Text style={{ fontFamily: F.bold, fontSize: 10, color: C.red, letterSpacing: 1 }}>LIVE</Text>
          </View>
        ) : isDone ? (
          <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: R.full, backgroundColor: 'rgba(255,255,255,0.05)' }}>
            <Text style={{ fontFamily: F.semi, fontSize: 10, color: C.textSub, letterSpacing: 0.8 }}>RESULT</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: R.full, backgroundColor: 'rgba(59,130,246,0.15)' }}>
            <Text style={{ fontFamily: F.semi, fontSize: 10, color: C.blue, letterSpacing: 0.8 }}>UPCOMING</Text>
          </View>
        )}
      </View>

      {/* Score row */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 14, color: hw ? C.text : C.textSub }} numberOfLines={1}>{m.homeTeam?.name ?? m.homeTeam?.shortName}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted, marginBottom: 4 }}>{m.homeTeam?.shortName}</Text>
          {i1 ? (
            <Text style={{ fontFamily: F.bold, fontSize: 26, color: hw ? C.text : C.textSub, lineHeight: 30 }}>
              {i1.totalRuns}{i1.totalWickets < 10 ? `/${i1.totalWickets}` : ''}
              <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted }}>  {i1.completedOvers}{i1.extraBalls > 0 ? `.${i1.extraBalls}` : ''} ov</Text>
            </Text>
          ) : <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textMuted }}>Yet to bat</Text>}
        </View>
        <View style={{ width: 32, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>vs</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: F.bold, fontSize: 14, color: aw ? C.text : C.textSub, textAlign: 'right' }} numberOfLines={1}>{m.awayTeam?.name ?? m.awayTeam?.shortName}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted, marginBottom: 4, textAlign: 'right' }}>{m.awayTeam?.shortName}</Text>
          {i2 ? (
            <Text style={{ fontFamily: F.bold, fontSize: 26, color: aw ? C.text : C.textSub, lineHeight: 30, textAlign: 'right' }}>
              {i2.totalRuns}{i2.totalWickets < 10 ? `/${i2.totalWickets}` : ''}
              <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted }}>  {i2.completedOvers}{i2.extraBalls > 0 ? `.${i2.extraBalls}` : ''} ov</Text>
            </Text>
          ) : <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textMuted, textAlign: 'right' }}>Yet to bat</Text>}
        </View>
      </View>

      {/* Footer */}
      <View style={{ marginTop: S.md, paddingTop: S.md, borderTopWidth: 1, borderTopColor: t.border }}>
        <Text style={{ fontFamily: F.medium, fontSize: 12, color: isDone ? C.green : C.textSub }} numberOfLines={1}>
          {isDone
            ? (resultText(m) ?? 'Match completed')
            : m.scheduledAt
              ? new Date(m.scheduledAt).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              : 'Schedule TBD'}
        </Text>
      </View>
    </Pressable>
  );
}

export function MatchesListScreen() {
  const t = useT(); const router = useRouter(); const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('All');
  const { data, isLoading, refetch } = useQuery({ queryKey: ['matches'], queryFn: () => matchesApi.list({ limit: '50' }) });
  const all: any[] = data?.data?.data ?? [];
  const filtered = filter === 'All' ? all
    : filter === 'Live' ? all.filter(m => m.status === 'IN_PROGRESS')
    : filter === 'Upcoming' ? all.filter(m => m.status === 'UPCOMING')
    : all.filter(m => m.status === 'COMPLETED');

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={t.bg} />
      {/* Header — TopBar style matching design */}
      <View style={{ paddingTop: insets.top + 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.xl }}>
          <Text style={{ flex: 1, fontFamily: F.bold, fontSize: 17, color: C.text, letterSpacing: -0.3 }}>Matches</Text>
          <Pressable onPress={() => router.push('/search')} style={{ padding: S.sm }}>
            <Text style={{ fontSize: 18, color: C.textSub }}>⌕</Text>
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: S.xl, paddingBottom: S.xs }}>
        <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted, marginBottom: S.sm }}>
          {all.length} matches · {all.filter(m => m.status === 'COMPLETED').length} results
        </Text>
        {/* Filter tabs — underline style matching design */}
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, marginTop: S.sm }}>
          {FILTERS.map(f => {
            const active = filter === f;
            const counts: Record<Filter, number> = {
              All: all.length,
              Live: all.filter(m => m.status === 'IN_PROGRESS').length,
              Upcoming: all.filter(m => m.status === 'UPCOMING').length,
              Completed: all.filter(m => m.status === 'COMPLETED').length,
            };
            return (
              <Pressable key={f} onPress={() => setFilter(f)}
                style={{ paddingHorizontal: S.lg, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: active ? C.primary : 'transparent', marginBottom: -1 }}>
                <Text style={{ fontFamily: active ? F.bold : F.medium, fontSize: 13, color: active ? C.primaryLight : C.textSub }}>
                  {f}{counts[f] > 0 ? ` ${counts[f]}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <MatchRow m={item} t={t} onPress={() => router.push(`/match/${item.id}`)} />}
        contentContainerStyle={{ paddingHorizontal: S.xl, paddingBottom: insets.bottom + 80 }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.blue} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Text style={{ fontSize: 40, marginBottom: S.lg }}>🏏</Text>
            <Text style={{ fontFamily: F.semi, fontSize: 16, color: C.text }}>No {filter === 'All' ? '' : filter.toLowerCase()} matches</Text>
            <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textSub, marginTop: S.sm }}>Check back soon</Text>
          </View>
        }
      />

      {/* FAB */}
      <Pressable
        onPress={() => router.push('/match/new')}
        style={({ pressed }) => ({
          position: 'absolute', bottom: insets.bottom + 24, right: S.xl,
          backgroundColor: C.primary, borderRadius: R.full, width: 56, height: 56,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: C.primary, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
          elevation: 10, opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontSize: 24, color: '#fff', lineHeight: 28 }}>+</Text>
      </Pressable>
    </View>
  );
}
