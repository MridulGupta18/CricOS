import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, RefreshControl, StatusBar,
  Animated, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { matchesApi, leaguesApi } from '@/lib/api';
import { C, F, R, S } from '@/lib/theme';

const GRAD_BG = '#141929';
const PRIMARY = C.primary;
const PRIMARY_LIGHT = C.primaryLight;

function resultText(m: any) {
  if (!m.winnerId) return null;
  const n = m.winnerId === m.homeTeam?.id ? m.homeTeam.shortName : m.awayTeam.shortName;
  if (m.winMarginType === 'RUNS') return `${n} won by ${m.winMargin} runs`;
  if (m.winMarginType === 'WICKETS') return `${n} won by ${m.winMargin} wkts`;
  return `${n} won`;
}

function Badge({ type, pulse, children }: { type: 'live'|'upcoming'|'completed'|'active'|'default'; pulse?: boolean; children: React.ReactNode }) {
  const map = {
    live:      ['rgba(239,68,68,0.15)',    '#EF4444',  'rgba(239,68,68,0.3)'],
    upcoming:  ['rgba(99,102,241,0.15)',   PRIMARY_LIGHT, 'rgba(99,102,241,0.3)'],
    completed: ['rgba(16,185,129,0.12)',   C.green,    'rgba(16,185,129,0.25)'],
    active:    ['rgba(239,68,68,0.15)',    '#EF4444',  'rgba(239,68,68,0.3)'],
    default:   ['rgba(100,116,139,0.12)', '#64748B',  'rgba(100,116,139,0.25)'],
  } as any;
  const [bg, color, border] = map[type] || map.default;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, backgroundColor: bg, borderWidth: 1, borderColor: border }}>
      {(type === 'live' || type === 'active' || pulse) && (
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
      )}
      <Text style={{ fontSize: 10, fontWeight: '700', fontFamily: F.bold, letterSpacing: 0.5, color }}>{children}</Text>
    </View>
  );
}

function MatchCard({ m, onPress, compact }: { m: any; onPress: () => void; compact?: boolean }) {
  const isLive = m.status === 'IN_PROGRESS';
  const isDone = m.status === 'COMPLETED';
  const inn = [...(m.innings ?? [])].sort((a: any, b: any) => a.inningsNumber - b.inningsNumber);
  const i1 = inn[0]; const i2 = inn[1];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      backgroundColor: pressed ? C.cardHover : C.card,
      borderRadius: R.xl, borderWidth: 1,
      borderColor: isLive ? 'rgba(239,68,68,0.35)' : C.border,
      padding: compact ? 12 : S.lg,
      minWidth: compact ? 200 : undefined,
    })}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.sm }}>
        <Badge type={isLive ? 'live' : isDone ? 'completed' : 'upcoming'} pulse={isLive}>
          {isLive ? 'LIVE' : isDone ? 'RESULT' : 'UPCOMING'}
        </Badge>
        <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted }} numberOfLines={1}>{m.format}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.textSub, marginBottom: 2 }} numberOfLines={1}>{m.homeTeam?.name ?? m.homeTeam?.shortName}</Text>
          {i1 ? (
            <Text style={{ fontFamily: F.bold, fontSize: 22, color: C.text, lineHeight: 26 }}>
              {i1.totalRuns}{i1.totalWickets < 10 ? `/${i1.totalWickets}` : ''}
              <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted }}>  {i1.completedOvers} ov</Text>
            </Text>
          ) : <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textMuted }}>—</Text>}
        </View>
        <Text style={{ fontFamily: F.reg, fontSize: 10, fontWeight: '700', color: C.textMuted }}>vs</Text>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.textSub, marginBottom: 2 }} numberOfLines={1}>{m.awayTeam?.name ?? m.awayTeam?.shortName}</Text>
          {i2 ? (
            <Text style={{ fontFamily: F.bold, fontSize: 22, color: C.text, lineHeight: 26, textAlign: 'right' }}>
              {i2.totalRuns}{i2.totalWickets < 10 ? `/${i2.totalWickets}` : ''}
              <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted }}>  {i2.completedOvers} ov</Text>
            </Text>
          ) : <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textMuted, textAlign: 'right' }}>—</Text>}
        </View>
      </View>
      {(m.venue || m.scheduledAt || resultText(m)) && (
        <View style={{ marginTop: S.sm, paddingTop: S.sm, borderTopWidth: 1, borderTopColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {isDone && resultText(m)
            ? <Text style={{ fontFamily: F.medium, fontSize: 11, color: C.green }}>{resultText(m)}</Text>
            : <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }} numberOfLines={1}>
                {m.venue ? `📍 ${m.venue}` : ''}
                {m.scheduledAt ? `  ·  ${new Date(m.scheduledAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
              </Text>
          }
        </View>
      )}
    </Pressable>
  );
}

function LeagueChip({ league, onPress }: { league: any; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      backgroundColor: pressed ? C.cardHover : C.card, borderRadius: R.xl,
      borderWidth: 1, borderColor: C.border, padding: S.lg, minWidth: 180,
      flexDirection: 'row', alignItems: 'center', gap: 10,
    })}>
      <View style={{ width: 40, height: 40, borderRadius: R.md, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Text style={{ fontSize: 18 }}>🏆</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.text, marginBottom: 2 }} numberOfLines={1}>{league.name}</Text>
        <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>{league._count?.teams ?? league.teams?.length ?? 0} teams · {league.format}</Text>
      </View>
    </Pressable>
  );
}

export function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dotAnim = useRef(new Animated.Value(1)).current;

  const { data: md, isLoading: ml, refetch: rm } = useQuery({
    queryKey: ['matches'], queryFn: () => matchesApi.list({ limit: '50' }), retry: 2,
  });
  const { data: ld, isLoading: ll, refetch: rl } = useQuery({
    queryKey: ['leagues'], queryFn: () => leaguesApi.list(), retry: 2,
  });

  const all: any[] = md?.data?.data ?? [];
  const live = all.filter(m => m.status === 'IN_PROGRESS');
  const upcoming = all.filter(m => m.status === 'UPCOMING').slice(0, 4);
  const leagues: any[] = ld?.data?.data ?? [];

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Pulse animation for live dot
  useEffect(() => {
    if (live.length > 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dotAnim, { toValue: 0.15, duration: 700, useNativeDriver: true }),
          Animated.timing(dotAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [live.length]);

  useEffect(() => {
    import('@/lib/api').then(({ default: _ }) => {}).catch(() => {});
  }, []);

  const onRefresh = useCallback(() => { rm(); rl(); }, [rm, rl]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Sticky header */}
      <View style={{ paddingTop: insets.top + 10, paddingHorizontal: S.xl, paddingBottom: S.sm, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: `${C.bg}F8` }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
            <View>
              <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted }}>{greet}</Text>
              <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.text, letterSpacing: -0.4 }}>Explore Cricket</Text>
            </View>
            <Pressable onPress={() => router.push('/league/create')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.primary + '22', borderWidth: 1, borderColor: C.primary + '44', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ fontSize: 12 }}>🏆</Text>
              <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.primaryLight }}>New League</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/profile')}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(99,102,241,0.3)' }}>
            <Text style={{ fontFamily: F.bold, fontSize: 13, color: '#fff' }}>AK</Text>
          </Pressable>
        </View>
        {/* Search bar — matches design */}
        <Pressable onPress={() => router.push('/search')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingHorizontal: S.lg, paddingVertical: 10 }}>
          <Text style={{ fontSize: 16, color: C.textMuted }}>⌕</Text>
          <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.textMuted }}>Search matches, leagues, players...</Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80, paddingTop: S.xl }}
        refreshControl={<RefreshControl refreshing={ml || ll} onRefresh={onRefresh} tintColor={PRIMARY} />}
      >
        {/* Hero stat strip */}
        <View style={{ marginHorizontal: S.xl, marginBottom: S.xxl }}>
          <View style={{ backgroundColor: GRAD_BG, borderRadius: R.xl, borderWidth: 1, borderColor: C.borderLt, padding: S.lg, overflow: 'hidden' }}>
            <View style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(99,102,241,0.12)' }} />
            <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted, marginBottom: 4 }}>CricOS Live</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, marginBottom: S.md }}>
              {live.length > 0 && <Animated.View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.red, opacity: dotAnim }} />}
              <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.text }}>
                {live.length > 0 ? `${live.length} match${live.length !== 1 ? 'es' : ''} live` : 'Welcome to CricOS'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: S.xxl }}>
              {[
                { value: all.length || '—', label: "Today's matches" },
                { value: leagues.length || '—', label: 'Active leagues' },
                { value: upcoming.length || '—', label: 'Upcoming' },
              ].map(s => (
                <View key={s.label}>
                  <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.text }}>{s.value}</Text>
                  <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted }}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Live matches */}
        {live.length > 0 && (
          <View style={{ marginBottom: S.xxl }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.xl, marginBottom: S.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
                <Animated.View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.red, opacity: dotAnim }} />
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.text }}>Live Right Now</Text>
              </View>
              <Pressable onPress={() => router.push('/(tabs)/matches')}>
                <Text style={{ fontFamily: F.medium, fontSize: 13, color: PRIMARY_LIGHT }}>See all</Text>
              </Pressable>
            </View>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={live}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingHorizontal: S.xl, gap: S.md }}
              renderItem={({ item }) => (
                <View style={{ width: 230 }}>
                  <MatchCard m={item} onPress={() => router.push(`/match/${item.id}`)} compact />
                </View>
              )}
            />
          </View>
        )}

        {/* Upcoming matches */}
        {upcoming.length > 0 && (
          <View style={{ marginHorizontal: S.xl, marginBottom: S.xxl }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.md }}>
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.text }}>Upcoming Matches</Text>
              <Pressable onPress={() => router.push('/(tabs)/matches')}>
                <Text style={{ fontFamily: F.medium, fontSize: 13, color: PRIMARY_LIGHT }}>View all</Text>
              </Pressable>
            </View>
            <View style={{ gap: S.md }}>
              {upcoming.map((m: any) => (
                <MatchCard key={m.id} m={m} onPress={() => router.push(`/match/${m.id}`)} />
              ))}
            </View>
          </View>
        )}

        {/* Trending leagues */}
        {leagues.length > 0 && (
          <View style={{ marginBottom: S.xxl }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.xl, marginBottom: S.md }}>
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.text }}>🏆 Leagues</Text>
              <Pressable onPress={() => router.push('/(tabs)/leagues')}>
                <Text style={{ fontFamily: F.medium, fontSize: 13, color: PRIMARY_LIGHT }}>Browse all</Text>
              </Pressable>
            </View>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={leagues}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingHorizontal: S.xl, gap: S.md }}
              renderItem={({ item }) => (
                <LeagueChip league={item} onPress={() => router.push(`/league/${item.slug}`)} />
              )}
            />
          </View>
        )}

        {/* Quick score CTA */}
        <View style={{ marginHorizontal: S.xl, backgroundColor: GRAD_BG, borderRadius: R.xl, borderWidth: 1, borderColor: C.borderLt, padding: S.xl, alignItems: 'center', marginBottom: S.lg }}>
          <Text style={{ fontSize: 28, marginBottom: S.sm }}>🏏</Text>
          <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.text, marginBottom: S.sm }}>Start scoring a match</Text>
          <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textMuted, textAlign: 'center', marginBottom: S.lg, lineHeight: 20 }}>
            Track every ball, over, and wicket in real time.
          </Text>
          <Pressable onPress={() => router.push('/match/new')}
            style={({ pressed }) => ({ backgroundColor: PRIMARY, borderRadius: R.lg, paddingVertical: 12, paddingHorizontal: S.xxl, opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: '#fff' }}>+ New Match</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
