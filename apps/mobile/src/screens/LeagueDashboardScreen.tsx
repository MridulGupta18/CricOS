import { useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StatusBar, FlatList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { leaguesApi, matchesApi } from '@/lib/api';
import { C, F, R, S } from '@/lib/theme';

function useT() { return C; }

function TabBar({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border }}>
        {tabs.map(t => (
          <Pressable key={t.id} onPress={() => onChange(t.id)}
            style={{ paddingVertical: 12, paddingHorizontal: S.lg, borderBottomWidth: 2, borderBottomColor: active === t.id ? C.primary : 'transparent', marginBottom: -1 }}>
            <Text style={{ fontFamily: active === t.id ? F.bold : F.medium, fontSize: 13, color: active === t.id ? C.primaryLight : C.textSub }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function StatRow({ stats }: { stats: { value: string | number; label: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.card2, borderRadius: R.lg, paddingVertical: S.lg, marginBottom: S.lg }}>
      {stats.map((s, i) => (
        <View key={s.label} style={{ flex: 1, alignItems: 'center', borderRightWidth: i < stats.length - 1 ? 1 : 0, borderRightColor: C.border }}>
          <Text style={{ fontFamily: F.bold, fontSize: 20, color: C.text, lineHeight: 24 }}>{s.value}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

function MatchCard({ m, onPress }: { m: any; onPress: () => void }) {
  const isLive = m.status === 'IN_PROGRESS';
  const isDone = m.status === 'COMPLETED';
  const inn = [...(m.innings ?? [])].sort((a: any, b: any) => a.inningsNumber - b.inningsNumber);
  const i1 = inn[0]; const i2 = inn[1];

  return (
    <Pressable onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? C.cardHover : C.card, borderRadius: R.xl,
        borderWidth: 1, borderColor: isLive ? 'rgba(239,68,68,0.35)' : C.border,
        padding: S.lg, marginBottom: S.sm,
      })}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20,
          backgroundColor: isLive ? 'rgba(239,68,68,0.15)' : isDone ? 'rgba(16,185,129,0.12)' : 'rgba(99,102,241,0.15)',
          borderWidth: 1, borderColor: isLive ? 'rgba(239,68,68,0.3)' : isDone ? 'rgba(16,185,129,0.25)' : 'rgba(99,102,241,0.3)' }}>
          {isLive && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.red }} />}
          <Text style={{ fontFamily: F.bold, fontSize: 10, color: isLive ? C.red : isDone ? C.green : C.primaryLight, letterSpacing: 0.5 }}>
            {isLive ? 'LIVE' : isDone ? 'RESULT' : 'UPCOMING'}
          </Text>
        </View>
        <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted }}>{m.format}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.text }} numberOfLines={1}>{m.homeTeam?.shortName}</Text>
          {i1 ? <Text style={{ fontFamily: F.bold, fontSize: 20, color: C.text }}>{i1.totalRuns}/{i1.totalWickets}<Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted }}> {i1.completedOvers} ov</Text></Text>
            : <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted }}>—</Text>}
        </View>
        <Text style={{ fontFamily: F.semi, fontSize: 10, color: C.textMuted, paddingHorizontal: S.md }}>vs</Text>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.text, textAlign: 'right' }} numberOfLines={1}>{m.awayTeam?.shortName}</Text>
          {i2 ? <Text style={{ fontFamily: F.bold, fontSize: 20, color: C.text, textAlign: 'right' }}>{i2.totalRuns}/{i2.totalWickets}<Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted }}> {i2.completedOvers} ov</Text></Text>
            : <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted, textAlign: 'right' }}>—</Text>}
        </View>
      </View>
      {m.venue && (
        <View style={{ marginTop: S.sm, paddingTop: S.sm, borderTopWidth: 1, borderTopColor: C.border }}>
          <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>📍 {m.venue}</Text>
        </View>
      )}
    </Pressable>
  );
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'matches',  label: 'Matches' },
  { id: 'points',   label: 'Points' },
  { id: 'teams',    label: 'Teams' },
  { id: 'sponsors', label: 'Sponsors' },
];

export function LeagueDashboardScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useT(); const router = useRouter(); const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('overview');
  const [followed, setFollowed] = useState(false);

  const { data: ld, isLoading: ll, refetch: rl } = useQuery({ queryKey: ['league', slug], queryFn: () => leaguesApi.get(slug!), enabled: !!slug });
  const league = ld?.data?.data;
  const { data: sd, refetch: rs } = useQuery({ queryKey: ['standings', league?.id], queryFn: () => leaguesApi.getStandings(league!.id), enabled: !!league?.id });
  const { data: md, refetch: rm } = useQuery({ queryKey: ['matches'], queryFn: () => matchesApi.list({ limit: '50' }) });

  const standings: any[] = sd?.data?.data ?? [];
  const allMatches: any[] = md?.data?.data ?? [];
  const leagueMatches = allMatches.filter(m => m.leagueId === league?.id || m.league?.id === league?.id);
  const upcoming = leagueMatches.filter(m => m.status === 'UPCOMING');
  const recent = leagueMatches.filter(m => m.status === 'COMPLETED');
  const teamCount = standings.length;

  // Static sponsors for demo
  const sponsors = [
    { name: 'Calgary Sports Club', tier: 'Title', logo: 'CSC' },
    { name: 'Prairie Drinks Co.', tier: 'Gold',  logo: 'PDC' },
    { name: 'Foothills Auto',     tier: 'Silver', logo: 'FA' },
  ];
  const tierColor: Record<string, string> = { Title: C.orange, Gold: '#F59E0B', Silver: C.textSub };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={t.bg} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={ll} onRefresh={() => { rl(); rs(); rm(); }} tintColor={C.primary} />}
      >
        {/* Header nav */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: S.xl, paddingBottom: S.md, flexDirection: 'row', alignItems: 'center', gap: S.md, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={{ fontFamily: F.reg, fontSize: 22, color: C.textSub }}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.text }}>{league?.name ?? 'League'}</Text>
            {league && <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>{league.format} · Season {new Date(league.startDate ?? Date.now()).getFullYear()}</Text>}
          </View>
          <Pressable onPress={() => setFollowed(f => !f)}
            style={{ paddingHorizontal: S.md, paddingVertical: 6, borderRadius: 20, backgroundColor: followed ? 'transparent' : C.primary, borderWidth: followed ? 1 : 0, borderColor: C.border }}>
            <Text style={{ fontFamily: F.bold, fontSize: 12, color: followed ? C.textSub : '#fff' }}>
              {followed ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
        </View>

        {/* Hero */}
        <View style={{ backgroundColor: '#141929', padding: S.xl, paddingBottom: S.lg, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <View style={{ flexDirection: 'row', gap: S.lg, alignItems: 'center', marginBottom: S.lg }}>
            <View style={{ width: 60, height: 60, borderRadius: 16, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 28 }}>🏆</Text>
            </View>
            <View style={{ flex: 1 }}>
              {league?.city && <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>📍 {league.city} · {league.format}</Text>}
              {(league?.startDate || league?.endDate) && (
                <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                  Season: {league.startDate ? new Date(league.startDate).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' }) : '—'}
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.red }} />
                  <Text style={{ fontFamily: F.bold, fontSize: 10, color: C.red }}>Active</Text>
                </View>
                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, backgroundColor: 'rgba(100,116,139,0.12)', borderWidth: 1, borderColor: 'rgba(100,116,139,0.25)' }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 10, color: C.textSub }}>{league?.format ?? 'T20'}</Text>
                </View>
              </View>
            </View>
          </View>
          <StatRow stats={[
            { value: teamCount || '—', label: 'Teams' },
            { value: upcoming.length + recent.length || '—', label: 'Matches' },
            { value: '—', label: 'Players' },
            { value: recent.length, label: 'Played' },
          ]} />
        </View>

        {/* Tabs */}
        <View style={{ paddingHorizontal: S.xl }}>
          <TabBar tabs={TABS} active={tab} onChange={setTab} />
        </View>

        <View style={{ paddingHorizontal: S.xl, paddingTop: S.lg, paddingBottom: S.lg }}>

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <View style={{ gap: S.md }}>
              <View style={{ backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
                {[
                  ['Full Name',   league?.name ?? '—'],
                  ['Format',      `${league?.format ?? 'T20'} · ${league?.overs ?? 20} overs per side`],
                  ['Teams',       `${teamCount} teams`],
                  ['Matches',     `${upcoming.length + recent.length} total · ${recent.length} played`],
                  ...(league?.startDate ? [['Start Date', new Date(league.startDate).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })]] : []),
                  ...(league?.endDate   ? [['End Date',   new Date(league.endDate).toLocaleDateString('en-CA',   { month: 'long', day: 'numeric', year: 'numeric' })]] : []),
                  ...(league?.city      ? [['Location',   `${league.city}${league.country ? ', ' + league.country : ''}`]] : []),
                ].map(([l, v], i, arr) => (
                  <View key={l as string} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
                    <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textMuted }}>{l}</Text>
                    <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.text, flex: 1, textAlign: 'right' }} numberOfLines={1}>{v}</Text>
                  </View>
                ))}
              </View>
              {/* Defending champion placeholder */}
              <View style={{ backgroundColor: '#141929', borderWidth: 1, borderColor: C.borderLt, borderRadius: R.lg, padding: S.lg, flexDirection: 'row', gap: S.lg, alignItems: 'center' }}>
                <Text style={{ fontSize: 28 }}>🏆</Text>
                <View>
                  <Text style={{ fontFamily: F.semi, fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Top Team</Text>
                  <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.text }}>{standings[0]?.team?.name ?? 'Season in progress'}</Text>
                  <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted }}>{standings[0] ? `${standings[0].pointsEarned} pts · ${standings[0].matchesWon}W` : '—'}</Text>
                </View>
              </View>
            </View>
          )}

          {/* MATCHES */}
          {tab === 'matches' && (
            <View style={{ gap: S.sm }}>
              {leagueMatches.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.textSub }}>No matches yet</Text>
                </View>
              ) : (
                leagueMatches.map(m => (
                  <MatchCard key={m.id} m={m} onPress={() => router.push(`/match/${m.id}`)} />
                ))
              )}
            </View>
          )}

          {/* POINTS TABLE */}
          {tab === 'points' && (
            standings.length > 0 ? (
              <View>
                <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
                  <View style={{ flexDirection: 'row', backgroundColor: '#0D1220', paddingHorizontal: S.md, paddingVertical: S.sm, borderBottomWidth: 1, borderBottomColor: C.border }}>
                    {['#', 'Team', 'P', 'W', 'L', 'Pts', 'NRR'].map((h, i) => (
                      <Text key={h} style={{ width: i === 0 ? 22 : i === 1 ? undefined : i === 5 ? 36 : i === 6 ? 52 : 26, flex: i === 1 ? 1 : undefined, fontFamily: F.semi, fontSize: 10, color: C.textMuted, textAlign: i > 1 ? 'right' : 'left', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</Text>
                    ))}
                  </View>
                  {standings.map((s: any, i: number) => (
                    <View key={s.team?.id ?? i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: 12, borderBottomWidth: i < standings.length - 1 ? 1 : 0, borderBottomColor: C.border, backgroundColor: i < 2 ? 'rgba(99,102,241,0.04)' : undefined }}>
                      <Text style={{ width: 22, fontFamily: F.bold, fontSize: 13, color: i < 2 ? C.primaryLight : C.textMuted }}>{i + 1}</Text>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
                        <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontFamily: F.bold, fontSize: 7, color: '#fff' }}>{s.team?.shortName?.slice(0, 3)}</Text>
                        </View>
                        <Text style={{ fontFamily: i < 2 ? F.semi : F.reg, fontSize: 12, color: C.text }} numberOfLines={1}>{s.team?.shortName ?? '—'}</Text>
                      </View>
                      <Text style={{ width: 26, textAlign: 'right', fontFamily: F.reg, fontSize: 12, color: C.textSub }}>{s.matchesPlayed ?? 0}</Text>
                      <Text style={{ width: 26, textAlign: 'right', fontFamily: F.reg, fontSize: 12, color: C.green }}>{s.matchesWon ?? 0}</Text>
                      <Text style={{ width: 26, textAlign: 'right', fontFamily: F.reg, fontSize: 12, color: C.red }}>{s.matchesLost ?? (s.matchesPlayed ?? 0) - (s.matchesWon ?? 0)}</Text>
                      <Text style={{ width: 36, textAlign: 'right', fontFamily: F.bold, fontSize: 14, color: C.primary }}>{s.pointsEarned ?? 0}</Text>
                      <Text style={{ width: 52, textAlign: 'right', fontFamily: F.medium, fontSize: 11, color: (s.nrr ?? 0) >= 0 ? C.green : C.red }}>
                        {(s.nrr ?? 0) >= 0 ? '+' : ''}{Number(s.nrr ?? 0).toFixed(3)}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted, textAlign: 'center', marginTop: S.md }}>
                  NRR = Net Run Rate  ·  Top 2 qualify
                </Text>
              </View>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.textSub }}>No standings yet</Text>
              </View>
            )
          )}

          {/* TEAMS */}
          {tab === 'teams' && (
            <View style={{ gap: S.sm }}>
              {standings.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.textSub }}>No teams yet</Text>
                </View>
              ) : (
                standings.map((s: any, i: number) => (
                  <Pressable key={s.team?.id ?? i}
                    style={({ pressed }) => ({ backgroundColor: pressed ? C.cardHover : C.card, borderRadius: R.xl, borderWidth: 1, borderColor: C.border, padding: S.lg, flexDirection: 'row', alignItems: 'center', gap: S.lg })}>
                    <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Text style={{ fontFamily: F.bold, fontSize: 13, color: '#fff' }}>{s.team?.shortName?.slice(0, 3)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.text, marginBottom: 2 }}>{s.team?.name ?? '—'}</Text>
                      <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted }}>{s.matchesPlayed ?? 0} matches played</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.green }}>{s.matchesWon ?? 0}W <Text style={{ color: C.red }}>{(s.matchesPlayed ?? 0) - (s.matchesWon ?? 0)}L</Text></Text>
                      <Text style={{ fontFamily: F.bold, fontSize: 11, color: C.primaryLight }}>{s.pointsEarned ?? 0} pts</Text>
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          )}

          {/* SPONSORS */}
          {tab === 'sponsors' && (
            <View style={{ gap: S.sm }}>
              {sponsors.map((sp, i) => (
                <View key={i} style={{ backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.lg, flexDirection: 'row', alignItems: 'center', gap: S.lg }}>
                  <View style={{ width: 44, height: 44, borderRadius: R.md, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.textSub }}>{sp.logo}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.text }}>{sp.name}</Text>
                    <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted }}>This season</Text>
                  </View>
                  <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, backgroundColor: `${tierColor[sp.tier] ?? C.textSub}18`, borderWidth: 1, borderColor: `${tierColor[sp.tier] ?? C.textSub}44` }}>
                    <Text style={{ fontFamily: F.bold, fontSize: 10, color: tierColor[sp.tier] ?? C.textSub }}>{sp.tier}</Text>
                  </View>
                </View>
              ))}
              <Pressable style={({ pressed }) => ({ backgroundColor: C.primary, borderRadius: R.lg, paddingVertical: 13, alignItems: 'center', opacity: pressed ? 0.85 : 1, flexDirection: 'row', justifyContent: 'center', gap: S.sm })}>
                <Text style={{ fontFamily: F.bold, fontSize: 14, color: '#fff' }}>+ Add Sponsor</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={{ paddingHorizontal: S.xl, paddingVertical: S.md, paddingBottom: insets.bottom + S.sm, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.card }}>
        <Pressable style={({ pressed }) => ({ backgroundColor: C.card2, borderRadius: R.lg, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: C.border, opacity: pressed ? 0.85 : 1 })}>
          <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.text }}>Manage League</Text>
        </Pressable>
      </View>
    </View>
  );
}
