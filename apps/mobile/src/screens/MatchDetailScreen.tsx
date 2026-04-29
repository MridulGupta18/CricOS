import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Share, StatusBar, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { matchesApi, scoringApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { C, F, R, S } from '@/lib/theme';

function useT() { return C; }

function resultText(m: any) {
  if (!m.winnerId) return null;
  const n = m.winnerId === m.homeTeam?.id ? m.homeTeam.name : m.awayTeam.name;
  if (m.winMarginType === 'RUNS') return `${n} won by ${m.winMargin} runs`;
  if (m.winMarginType === 'WICKETS') return `${n} won by ${m.winMargin} wkts`;
  return `${n} won`;
}

const TABS = ['Scorecard', 'Timeline', 'Squads', 'Info'] as const;
type Tab = typeof TABS[number];

function StatRow({ stats }: { stats: { value: string | number; label: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.card2, borderRadius: R.lg, paddingVertical: S.lg, marginBottom: S.lg }}>
      {stats.map((s, i) => (
        <View key={s.label} style={{ flex: 1, alignItems: 'center', borderRightWidth: i < stats.length - 1 ? 1 : 0, borderRightColor: C.border }}>
          <Text style={{ fontFamily: F.bold, fontSize: 22, color: C.text, lineHeight: 26 }}>{s.value}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

function DataTable({ columns, rows }: {
  columns: { key: string; label: string; align?: 'left' | 'right'; bold?: boolean; color?: (v: any) => string }[];
  rows: any[];
}) {
  return (
    <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', backgroundColor: '#0D1220', paddingHorizontal: S.md, paddingVertical: S.sm, borderBottomWidth: 1, borderBottomColor: C.border }}>
        {columns.map(c => (
          <Text key={c.key} style={{ flex: c.key === columns[0].key ? 2 : 1, fontFamily: F.semi, fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: c.align || 'left' }}>{c.label}</Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', paddingHorizontal: S.md, paddingVertical: 10, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
          {columns.map(c => (
            <Text key={c.key} style={{ flex: c.key === columns[0].key ? 2 : 1, fontFamily: c.bold ? F.bold : F.reg, fontSize: 12, color: c.color ? c.color(row[c.key]) : (c.bold ? C.text : C.textSub), textAlign: c.align || 'left' }} numberOfLines={1}>
              {row[c.key] ?? '—'}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT(); const router = useRouter(); const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuthStore();
  const [tab, setTab] = useState<Tab>('Scorecard');

  const { data: md, isLoading: ml, refetch } = useQuery({ queryKey: ['match', id], queryFn: () => matchesApi.get(id!), enabled: !!id });
  const { data: sc } = useQuery({ queryKey: ['scorecard', id], queryFn: () => scoringApi.getScorecard(id!), enabled: !!id });

  const match = md?.data?.data;
  const innings: any[] = [...(sc?.data?.data?.innings ?? match?.innings ?? [])].sort((a: any, b: any) => a.inningsNumber - b.inningsNumber);
  const inn1 = innings[0]; const inn2 = innings[1];

  if (!match && ml) return (
    <View style={{ flex: 1, backgroundColor: t.bg, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.textSub }}>Loading match…</Text>
    </View>
  );
  if (!match) return (
    <View style={{ flex: 1, backgroundColor: t.bg, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.textSub }}>Match not found</Text>
    </View>
  );

  const isLive = match.status === 'IN_PROGRESS';
  const isDone = match.status === 'COMPLETED';
  const hw = match.winnerId === match.homeTeam?.id;
  const aw = match.winnerId === match.awayTeam?.id;

  const extras1 = inn1 ? (inn1.extrasWides ?? 0) + (inn1.extrasNoBalls ?? 0) + (inn1.extrasByes ?? 0) + (inn1.extrasLegByes ?? 0) : 0;
  const extras2 = inn2 ? (inn2.extrasWides ?? 0) + (inn2.extrasNoBalls ?? 0) + (inn2.extrasByes ?? 0) + (inn2.extrasLegByes ?? 0) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={t.bg} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        refreshControl={<RefreshControl refreshing={ml} onRefresh={refetch} tintColor={C.primary} />}
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: S.xl, paddingBottom: S.md, flexDirection: 'row', alignItems: 'center', gap: S.md, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={{ fontFamily: F.reg, fontSize: 22, color: C.textSub }}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.text }}>
              {match.homeTeam?.shortName} vs {match.awayTeam?.shortName}
            </Text>
            {match.league && <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>{match.league.name}</Text>}
          </View>
          <Pressable onPress={() => Share.share({ message: `${match.homeTeam?.name} vs ${match.awayTeam?.name} — CricOS` })}>
            <Text style={{ fontFamily: F.reg, fontSize: 18, color: C.textSub }}>⋯</Text>
          </Pressable>
        </View>

        {/* Score hero */}
        <View style={{ backgroundColor: '#141929', padding: S.xl, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: S.md }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.semi, fontSize: 11, color: C.textSub, marginBottom: 4 }}>{match.homeTeam?.name}</Text>
              <Text style={{ fontFamily: F.bold, fontSize: 36, color: hw ? C.text : C.textMuted, lineHeight: 40 }}>
                {inn1 ? `${inn1.totalRuns}` : '—'}
                <Text style={{ fontSize: 22, color: C.textMuted }}>{inn1 ? `/${inn1.totalWickets}` : ''}</Text>
              </Text>
              <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted }}>
                {inn1 ? `${inn1.completedOvers}${inn1.extraBalls > 0 ? `.${inn1.extraBalls}` : ''} overs` : ''}
              </Text>
              {hw && isDone && <View style={{ marginTop: 6, flexDirection: 'row' }}><View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' }}><Text style={{ fontFamily: F.bold, fontSize: 10, color: C.green }}>WINNER</Text></View></View>}
            </View>
            <View style={{ alignItems: 'center', paddingHorizontal: S.md }}>
              {isDone ? (
                <>
                  <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted, marginBottom: 4 }}>RESULT</Text>
                  <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.green, textAlign: 'center', maxWidth: 80, lineHeight: 16 }}>
                    {resultText(match) || 'Completed'}
                  </Text>
                </>
              ) : isLive ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(239,68,68,0.12)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.full }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.red }} />
                  <Text style={{ fontFamily: F.bold, fontSize: 10, color: C.red, letterSpacing: 1 }}>LIVE</Text>
                </View>
              ) : (
                <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted }}>vs</Text>
              )}
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={{ fontFamily: F.semi, fontSize: 11, color: C.textSub, marginBottom: 4, textAlign: 'right' }}>{match.awayTeam?.name}</Text>
              <Text style={{ fontFamily: F.bold, fontSize: 36, color: aw ? C.text : C.textMuted, lineHeight: 40, textAlign: 'right' }}>
                {inn2 ? `${inn2.totalRuns}` : '—'}
                <Text style={{ fontSize: 22, color: C.textMuted }}>{inn2 ? `/${inn2.totalWickets}` : ''}</Text>
              </Text>
              <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted, textAlign: 'right' }}>
                {inn2 ? `${inn2.completedOvers}${inn2.extraBalls > 0 ? `.${inn2.extraBalls}` : ''} overs` : ''}
              </Text>
              {aw && isDone && <View style={{ marginTop: 6, alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'flex-end' }}><View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' }}><Text style={{ fontFamily: F.bold, fontSize: 10, color: C.green }}>WINNER</Text></View></View>}
            </View>
          </View>
          {match.venue && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: S.md, borderTopWidth: 1, borderTopColor: C.border }}>
              <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted }}>📍 {match.venue}{match.scheduledAt ? `  ·  ${new Date(match.scheduledAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</Text>
            </View>
          )}
        </View>

        {/* Toss + extras stats */}
        {match.tossWinnerId && (
          <View style={{ marginHorizontal: S.xl, marginTop: S.md }}>
            <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted, textAlign: 'center' }}>
              Toss: {match.tossWinnerId === match.homeTeam?.id ? match.homeTeam?.shortName : match.awayTeam?.shortName} won & chose to {match.tossDecision?.toLowerCase() ?? 'bat'}
            </Text>
          </View>
        )}
        {(inn1 || inn2) && (
          <View style={{ paddingHorizontal: S.xl, paddingTop: S.md }}>
            <StatRow stats={[
              { value: (inn1?.totalRuns ?? 0) + (inn2?.totalRuns ?? 0), label: 'Total runs' },
              { value: (inn1?.totalWickets ?? 0) + (inn2?.totalWickets ?? 0), label: 'Wickets' },
              { value: extras1 + extras2, label: 'Extras' },
            ]} />
          </View>
        )}

        {/* Tabs */}
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, marginHorizontal: S.xl }}>
          {TABS.map(tb => (
            <Pressable key={tb} onPress={() => setTab(tb)}
              style={{ paddingVertical: 12, paddingHorizontal: S.md, borderBottomWidth: 2, borderBottomColor: tab === tb ? C.primary : 'transparent', marginBottom: -1 }}>
              <Text style={{ fontFamily: tab === tb ? F.bold : F.medium, fontSize: 13, color: tab === tb ? C.primaryLight : C.textSub }}>{tb}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ paddingHorizontal: S.xl, paddingTop: S.lg, paddingBottom: S.lg }}>

          {/* SCORECARD */}
          {tab === 'Scorecard' && (
            <View style={{ gap: S.lg }}>
              {inn1 && (
                <View>
                  <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.textSub, marginBottom: S.sm }}>
                    {inn1.battingTeam?.name ?? match.homeTeam?.name} Batting · {inn1.totalRuns}/{inn1.totalWickets}
                  </Text>
                  <DataTable
                    columns={[
                      { key: 'name', label: 'Batter', bold: true },
                      { key: 'runs', label: 'R', bold: true, align: 'right', color: v => v >= 50 ? C.green : C.text },
                      { key: 'balls', label: 'B', align: 'right' },
                      { key: 'fours', label: '4s', align: 'right', color: () => C.green },
                      { key: 'sixes', label: '6s', align: 'right', color: () => C.orange },
                      { key: 'sr', label: 'SR', align: 'right' },
                    ]}
                    rows={[
                      { name: 'Yet to', runs: '—', balls: '—', fours: '—', sixes: '—', sr: '—', dismissal: 'Scorecard available after live scoring' },
                    ]}
                  />
                  <View style={{ marginTop: S.sm, padding: S.md, backgroundColor: C.card2, borderRadius: R.md }}>
                    <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted, textAlign: 'center' }}>
                      Ball-by-ball scorecard available after live scoring
                    </Text>
                  </View>
                  <View style={{ marginTop: S.lg }}>
                    <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.textSub, marginBottom: S.sm }}>
                      {inn1.bowlingTeam?.name ?? match.awayTeam?.name} Bowling
                    </Text>
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Bowler', bold: true },
                        { key: 'overs', label: 'O', align: 'right' },
                        { key: 'runs', label: 'R', align: 'right' },
                        { key: 'wickets', label: 'W', bold: true, align: 'right', color: v => v > 0 ? C.red : C.textSub },
                        { key: 'economy', label: 'Eco', align: 'right' },
                      ]}
                      rows={[{ name: '—', overs: '—', runs: '—', wickets: '—', economy: '—' }]}
                    />
                  </View>
                </View>
              )}
              {inn2 && (
                <View>
                  <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.textSub, marginBottom: S.sm }}>
                    {inn2.battingTeam?.name ?? match.awayTeam?.name} Batting · {inn2.totalRuns}/{inn2.totalWickets}
                  </Text>
                  <View style={{ padding: S.md, backgroundColor: C.card2, borderRadius: R.md }}>
                    <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted, textAlign: 'center' }}>
                      Ball-by-ball scorecard available after live scoring
                    </Text>
                  </View>
                </View>
              )}
              {!inn1 && !inn2 && (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.textSub }}>No innings data yet</Text>
                </View>
              )}
            </View>
          )}

          {/* TIMELINE */}
          {tab === 'Timeline' && (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Text style={{ fontSize: 32, marginBottom: S.md }}>📋</Text>
              <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.text, marginBottom: S.sm }}>Ball-by-ball timeline</Text>
              <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textSub, textAlign: 'center' }}>
                Available during and after live scoring
              </Text>
            </View>
          )}

          {/* SQUADS */}
          {tab === 'Squads' && (
            <View style={{ gap: S.lg }}>
              {[match.homeTeam, match.awayTeam].filter(Boolean).map((team: any) => (
                <View key={team.id}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, marginBottom: S.sm }}>
                    <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: F.bold, fontSize: 9, color: '#fff' }}>{team.shortName?.slice(0, 3)}</Text>
                    </View>
                    <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.text }}>{team.name}</Text>
                  </View>
                  <View style={{ backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
                    {(team.members ?? []).map((m: any, i: number) => (
                      <View key={m.player?.id ?? i} style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md, borderBottomWidth: i < (team.members?.length ?? 0) - 1 ? 1 : 0, borderBottomColor: C.border }}>
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontFamily: F.bold, fontSize: 11, color: '#fff' }}>
                            {m.player?.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.text }}>{m.player?.name}</Text>
                          <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>{m.player?.role ?? m.role ?? 'Player'}</Text>
                        </View>
                        <Text style={{ fontFamily: F.reg, fontSize: 16, color: C.textMuted }}>›</Text>
                      </View>
                    ))}
                    {(!team.members || team.members.length === 0) && (
                      <View style={{ padding: S.xl, alignItems: 'center' }}>
                        <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textMuted }}>Squad not available</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* INFO */}
          {tab === 'Info' && (
            <View style={{ backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
              {[
                ['Format',    `${match.format} · ${match.overs} overs`],
                ['Venue',     match.venue ?? 'TBD'],
                ['City',      match.city ?? 'Calgary'],
                ...(match.league ? [['League', match.league.name]] : []),
                ...(match.scheduledAt ? [['Date', new Date(match.scheduledAt).toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })]] : []),
                ...(match.tossWinnerId ? [['Toss', `${match.tossWinnerId === match.homeTeam?.id ? match.homeTeam?.shortName : match.awayTeam?.shortName} won · chose to ${match.tossDecision?.toLowerCase() ?? 'bat'}`]] : []),
              ].map(([l, v], i, arr) => (
                <View key={l as string} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 13, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
                  <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textMuted }}>{l}</Text>
                  <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.text, flex: 1, textAlign: 'right' }} numberOfLines={1}>{v}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={{ paddingHorizontal: S.xl, paddingVertical: S.md, paddingBottom: insets.bottom + S.sm, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.card }}>
        {match.status === 'UPCOMING' && isAuthenticated ? (
          <Pressable onPress={() => router.push(`/match/${id}/score`)}
            style={({ pressed }) => ({ backgroundColor: C.primary, borderRadius: R.lg, paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: '#fff' }}>◎ Start Scoring</Text>
          </Pressable>
        ) : isLive && isAuthenticated ? (
          <Pressable onPress={() => router.push(`/match/${id}/score`)}
            style={({ pressed }) => ({ backgroundColor: C.red, borderRadius: R.lg, paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: '#fff' }}>◎ Open Scorer Mode</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => Share.share({ message: `${match.homeTeam?.name} vs ${match.awayTeam?.name} — CricOS` })}
            style={({ pressed }) => ({ backgroundColor: C.card2, borderRadius: R.lg, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border, opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.text }}>Share Match 🔗</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
