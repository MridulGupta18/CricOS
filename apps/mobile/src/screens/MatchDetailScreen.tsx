import { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Share, StatusBar, RefreshControl, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetView, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { matchesApi, scoringApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { connectSocket, joinMatchRoom, leaveMatchRoom } from '@/lib/socket';
import { InningsState, BatsmanInnings, BowlerInnings } from '@cricket-os/shared';
import { formatOvers, generateCommentary } from '@cricket-os/scoring-engine';
import { useScorecardShare, ScorecardShareWrapper } from '@/components/ScorecardShare';
import { C, F, R, S } from '@/lib/theme';

function resultText(m: any) {
  if (!m.winnerId) return null;
  const n = m.winnerId === m.homeTeam?.id ? m.homeTeam.name : m.awayTeam.name;
  if (m.winMarginType === 'RUNS')    return `${n} won by ${m.winMargin} runs`;
  if (m.winMarginType === 'WICKETS') return `${n} won by ${m.winMargin} wkts`;
  return `${n} won`;
}

function dismissalText(bat: BatsmanInnings, playerById: (id: string) => string): string {
  if (!bat.isOut || !bat.wicket) return 'not out';
  const { type, fielderId } = bat.wicket as any;
  const fielder = fielderId ? playerById(fielderId) : '';
  switch (type) {
    case 'BOWLED':            return 'b';
    case 'CAUGHT':            return fielder ? `c ${fielder}` : 'caught';
    case 'LBW':               return 'lbw';
    case 'RUN_OUT':           return fielder ? `run out (${fielder})` : 'run out';
    case 'STUMPED':           return fielder ? `st ${fielder}` : 'stumped';
    case 'HIT_WICKET':        return 'hit wkt';
    case 'RETIRED_HURT':      return 'retired hurt';
    case 'OBSTRUCTING_FIELD': return 'obstructed';
    case 'HANDLED_BALL':      return 'handled ball';
    case 'TIMED_OUT':         return 'timed out';
    default:                  return type.toLowerCase();
  }
}

const TABS = ['Scorecard', 'Timeline', 'Squads', 'Info'] as const;
type Tab = typeof TABS[number];

function SectionTitle({ children }: { children: string }) {
  return <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: S.sm, marginTop: S.lg }}>{children}</Text>;
}

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

// ── Batting table ──────────────────────────────────────────────────────────
function BattingTable({ batsmen, playerById }: { batsmen: BatsmanInnings[]; playerById: (id: string) => string }) {
  return (
    <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', backgroundColor: '#0D1220', paddingHorizontal: S.md, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border }}>
        {['Batter', 'R', 'B', '4s', '6s', 'SR'].map((h, i) => (
          <Text key={h} style={{ flex: i === 0 ? 2.5 : 1, fontFamily: F.semi, fontSize: 9, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: i > 0 ? 'right' : 'left' }}>{h}</Text>
        ))}
      </View>
      {batsmen.length === 0 && (
        <View style={{ padding: S.xl, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted }}>No batting data yet</Text>
        </View>
      )}
      {batsmen.map((b, i) => (
        <View key={b.playerId} style={{ borderBottomWidth: i < batsmen.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
          <View style={{ flexDirection: 'row', paddingHorizontal: S.md, paddingVertical: 10, alignItems: 'center' }}>
            <View style={{ flex: 2.5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.text }} numberOfLines={1}>{playerById(b.playerId)}</Text>
                {!b.isOut && <View style={{ backgroundColor: C.green + '20', borderRadius: 3, paddingHorizontal: 4 }}><Text style={{ fontFamily: F.bold, fontSize: 8, color: C.green }}>*</Text></View>}
              </View>
              <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted, marginTop: 1 }}>{dismissalText(b, playerById)}</Text>
            </View>
            <Text style={{ flex: 1, fontFamily: F.bold, fontSize: 13, color: b.runs >= 50 ? C.green : b.runs >= 30 ? C.orange : C.text, textAlign: 'right' }}>{b.runs}</Text>
            <Text style={{ flex: 1, fontFamily: F.reg, fontSize: 12, color: C.textSub, textAlign: 'right' }}>{b.ballsFaced}</Text>
            <Text style={{ flex: 1, fontFamily: F.reg, fontSize: 12, color: C.green,    textAlign: 'right' }}>{b.fours}</Text>
            <Text style={{ flex: 1, fontFamily: F.reg, fontSize: 12, color: C.orange,   textAlign: 'right' }}>{b.sixes}</Text>
            <Text style={{ flex: 1, fontFamily: F.reg, fontSize: 12, color: C.textSub,  textAlign: 'right' }}>{b.strikeRate.toFixed(0)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Bowling table ──────────────────────────────────────────────────────────
function BowlingTable({ bowlers, playerById }: { bowlers: BowlerInnings[]; playerById: (id: string) => string }) {
  return (
    <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', backgroundColor: '#0D1220', paddingHorizontal: S.md, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border }}>
        {['Bowler', 'O', 'M', 'R', 'W', 'Eco'].map((h, i) => (
          <Text key={h} style={{ flex: i === 0 ? 2.5 : 1, fontFamily: F.semi, fontSize: 9, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: i > 0 ? 'right' : 'left' }}>{h}</Text>
        ))}
      </View>
      {bowlers.length === 0 && (
        <View style={{ padding: S.xl, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted }}>No bowling data yet</Text>
        </View>
      )}
      {bowlers.map((b, i) => (
        <View key={b.playerId} style={{ flexDirection: 'row', paddingHorizontal: S.md, paddingVertical: 10, borderBottomWidth: i < bowlers.length - 1 ? 1 : 0, borderBottomColor: C.border, alignItems: 'center' }}>
          <Text style={{ flex: 2.5, fontFamily: F.semi, fontSize: 12, color: C.text }} numberOfLines={1}>{playerById(b.playerId)}</Text>
          <Text style={{ flex: 1, fontFamily: F.reg, fontSize: 12, color: C.textSub,  textAlign: 'right' }}>{formatOvers(b.overs)}</Text>
          <Text style={{ flex: 1, fontFamily: F.reg, fontSize: 12, color: b.maidens > 0 ? C.green : C.textSub, textAlign: 'right' }}>{b.maidens}</Text>
          <Text style={{ flex: 1, fontFamily: F.reg, fontSize: 12, color: C.textSub,  textAlign: 'right' }}>{b.runs}</Text>
          <Text style={{ flex: 1, fontFamily: F.bold, fontSize: 13, color: b.wickets > 0 ? C.red : C.textSub, textAlign: 'right' }}>{b.wickets}</Text>
          <Text style={{ flex: 1, fontFamily: F.reg, fontSize: 12, color: b.economy > 10 ? C.red : b.economy < 6 ? C.green : C.textSub, textAlign: 'right' }}>{b.economy.toFixed(1)}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Fall of wickets ────────────────────────────────────────────────────────
function FallOfWickets({ innings: inn, playerById }: { innings: InningsState; playerById: (id: string) => string }) {
  if (!inn.fallOfWickets.length) return null;
  return (
    <View style={{ marginTop: S.lg }}>
      <SectionTitle>Fall of Wickets</SectionTitle>
      <View style={{ backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.md }}>
        <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textSub, lineHeight: 18 }}>
          {inn.fallOfWickets.map(f => `${f.runs}-${f.wicketNumber} (${playerById(f.playerId)}, ${formatOvers(f.overs)} ov)`).join('  •  ')}
        </Text>
      </View>
    </View>
  );
}

// ── Extras row ─────────────────────────────────────────────────────────────
function ExtrasRow({ inn }: { inn: InningsState }) {
  const e = inn.extras;
  const parts = [
    e.wides   && `${e.wides} wd`,
    e.noBalls && `${e.noBalls} nb`,
    e.byes    && `${e.byes} b`,
    e.legByes && `${e.legByes} lb`,
    e.penalties && `${e.penalties} pen`,
  ].filter(Boolean).join(', ');
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: S.md, paddingVertical: 10, backgroundColor: C.card2, borderRadius: R.md, marginTop: S.sm }}>
      <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted }}>Extras</Text>
      <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.textSub }}>{e.total} ({parts || '—'})</Text>
    </View>
  );
}

// ── Ball label helper ──────────────────────────────────────────────────────
function ballLabel(b: any): { label: string; bg: string; fg: string; border: string } {
  if (b.isWicket)                  return { label: 'W',             bg: 'rgba(239,68,68,0.15)',   fg: C.red,    border: C.red + '40' };
  if (b.extraType === 'WIDE')      return { label: 'Wd',            bg: 'rgba(255,255,255,0.04)', fg: C.orange, border: C.orange + '40' };
  if (b.extraType === 'NO_BALL')   return { label: b.isFreeHit ? 'NB⚡' : 'Nb', bg: 'rgba(255,255,255,0.04)', fg: C.orange, border: C.orange + '40' };
  if (b.extraType === 'BYE')       return { label: `B${b.extraRuns}`,  bg: 'rgba(255,255,255,0.04)', fg: C.textMuted, border: C.border };
  if (b.extraType === 'LEG_BYE')   return { label: `Lb${b.extraRuns}`, bg: 'rgba(255,255,255,0.04)', fg: C.textMuted, border: C.border };
  if (b.runs === 6)                return { label: '6',             bg: 'rgba(245,158,11,0.15)', fg: C.orange, border: C.orange + '40' };
  if (b.runs === 4)                return { label: '4',             bg: 'rgba(16,185,129,0.15)', fg: C.green,  border: C.green + '40' };
  if (b.runs === 0)                return { label: '·',             bg: 'rgba(255,255,255,0.04)', fg: C.textMuted, border: C.border };
  return                                  { label: `${b.runs}`,     bg: 'rgba(255,255,255,0.04)', fg: C.textSub,   border: C.border };
}

// ── Over-by-over timeline with ball commentary ─────────────────────────────
function OverTimeline({ ballEvents, playerById }: { ballEvents: any[]; playerById: (id: string) => string }) {
  if (!ballEvents.length) return (
    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
      <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.textSub }}>No balls bowled yet</Text>
    </View>
  );

  const overs: Record<number, any[]> = {};
  for (const b of ballEvents) {
    if (!overs[b.overNumber]) overs[b.overNumber] = [];
    overs[b.overNumber].push(b);
  }

  return (
    <View style={{ gap: S.md }}>
      {Object.entries(overs).reverse().map(([ov, balls]) => {
        const runs    = balls.reduce((s: number, b: any) => s + b.runs + b.extraRuns, 0);
        const wickets = balls.filter((b: any) => b.isWicket).length;
        return (
          <View key={ov} style={{ backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
            {/* Over header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.md, paddingVertical: S.sm, backgroundColor: '#0D1220', borderBottomWidth: 1, borderBottomColor: C.border }}>
              <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.textSub }}>Over {parseInt(ov) + 1}</Text>
              <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>
                {playerById(balls[0]?.bowlerId ?? '')}  ·  {runs} run{runs !== 1 ? 's' : ''}{wickets ? `  ${wickets}W` : ''}
              </Text>
            </View>
            {/* Ball dots */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingHorizontal: S.md, paddingTop: S.md, paddingBottom: S.sm }}>
              {balls.map((b: any, i: number) => {
                const { label, bg, fg, border } = ballLabel(b);
                return (
                  <View key={i} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: bg, borderWidth: 1.5, borderColor: border, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: F.bold, fontSize: 10, color: fg }}>{label}</Text>
                  </View>
                );
              })}
            </View>
            {/* Ball-by-ball commentary */}
            <View style={{ paddingHorizontal: S.md, paddingBottom: S.md, gap: 4 }}>
              {[...balls].reverse().map((b: any, i: number) => {
                const batsmanName = playerById(b.batsmanId).split(' ').pop() ?? '?';
                const bowlerName  = playerById(b.bowlerId).split(' ').pop() ?? '?';
                const fielderName = b.wicket?.fielderId ? playerById(b.wicket.fielderId).split(' ').pop() : undefined;
                const commentary  = generateCommentary(
                  { ...b, extras: b.extraType ? { type: b.extraType, runs: b.extraRuns } : null, wicket: b.isWicket && b.wicket ? b.wicket : null },
                  batsmanName, bowlerName, fielderName
                );
                const { fg } = ballLabel(b);
                return (
                  <View key={i} style={{ flexDirection: 'row', gap: S.sm, alignItems: 'flex-start' }}>
                    <Text style={{ fontFamily: F.bold, fontSize: 10, color: fg, width: 28, marginTop: 2 }}>
                      {parseInt(ov)}.{b.ballNumber + 1}
                    </Text>
                    <Text style={{ flex: 1, fontFamily: F.reg, fontSize: 12, color: b.isWicket ? C.red : C.textSub, lineHeight: 18 }}>
                      {commentary}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Over-by-over run chart ─────────────────────────────────────────────────
function OverRunChart({ ballEvents }: { ballEvents: any[] }) {
  if (!ballEvents?.length) return null;

  const map: Record<number, { runs: number; wickets: number }> = {};
  for (const b of ballEvents) {
    if (!map[b.overNumber]) map[b.overNumber] = { runs: 0, wickets: 0 };
    map[b.overNumber].runs += (b.runs ?? 0) + (b.extraRuns ?? 0);
    if (b.isWicket) map[b.overNumber].wickets++;
  }

  const overs = Object.keys(map).map(Number).sort((a, b) => a - b);
  if (!overs.length) return null;
  const maxRuns = Math.max(...overs.map(o => map[o].runs), 1);

  return (
    <View style={{ marginTop: S.lg }}>
      <SectionTitle>Run Chart</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, paddingBottom: S.sm, minHeight: 72 }}>
          {overs.map((o) => {
            const { runs, wickets } = map[o];
            const barH = Math.max(6, Math.round((runs / maxRuns) * 52));
            const barColor = runs >= 16 ? C.orange : runs >= 10 ? C.green : C.primary;
            return (
              <View key={o} style={{ alignItems: 'center', width: 26 }}>
                {wickets > 0 && (
                  <Text style={{ fontFamily: F.bold, fontSize: 8, color: C.red, marginBottom: 1 }}>
                    {wickets}W
                  </Text>
                )}
                <Text style={{ fontFamily: F.bold, fontSize: 9, color: barColor, marginBottom: 2 }}>{runs}</Text>
                <View style={{ width: 18, height: barH, backgroundColor: barColor, borderRadius: 2, opacity: 0.85 }} />
                <Text style={{ fontFamily: F.reg, fontSize: 8, color: C.textMuted, marginTop: 3 }}>{o + 1}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

// ── InningsScorecard ───────────────────────────────────────────────────────
function InningsScorecard({ inningsState, rawInnings, playerById, title }: {
  inningsState: InningsState;
  rawInnings: any;
  playerById: (id: string) => string;
  title: string;
}) {
  return (
    <View style={{ gap: 0 }}>
      <SectionTitle>{title}</SectionTitle>
      <BattingTable batsmen={inningsState.batsmen} playerById={playerById} />
      <ExtrasRow inn={inningsState} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: S.md, paddingVertical: 10 }}>
        <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.text }}>Total</Text>
        <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.text }}>{inningsState.totalRuns}/{inningsState.totalWickets} ({formatOvers(inningsState.totalOvers)} ov)</Text>
      </View>
      <FallOfWickets innings={inningsState} playerById={playerById} />
      <View style={{ marginTop: S.lg }}>
        <SectionTitle>Bowling</SectionTitle>
        <BowlingTable bowlers={inningsState.bowlers} playerById={playerById} />
      </View>
      <OverRunChart ballEvents={rawInnings?.ballEvents ?? []} />
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────
export function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter(); const insets = useSafeAreaInsets();
  const { isAuthenticated, accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('Scorecard');
  const [scorerAssigning, setScorerAssigning] = useState(false);
  const scorerSheetRef = useRef<BottomSheet>(null);

  // Join the match Socket.IO room for live score push
  useEffect(() => {
    if (!id) return;
    const socket = connectSocket(accessToken ?? undefined);
    joinMatchRoom(id);
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['match', id] });
      queryClient.invalidateQueries({ queryKey: ['scorecard', id] });
    };
    socket.on('ball:scored', refresh);
    socket.on('innings:complete', refresh);
    socket.on('match:status:changed', refresh);
    return () => {
      socket.off('ball:scored', refresh);
      socket.off('innings:complete', refresh);
      socket.off('match:status:changed', refresh);
      leaveMatchRoom(id);
    };
  }, [id, accessToken]);

  const { data: md, isLoading: ml, refetch } = useQuery({ queryKey: ['match', id], queryFn: () => matchesApi.get(id!), enabled: !!id });
  const { data: sc } = useQuery({ queryKey: ['scorecard', id], queryFn: () => scoringApi.getScorecard(id!), enabled: !!id });

  const match        = md?.data?.data;
  const scData       = sc?.data?.data;
  const inningsStates: InningsState[] = scData?.inningsStates ?? [];
  const rawInnings   = scData?.match?.innings ?? match?.innings ?? [];
  const inn1State    = inningsStates.find((i: InningsState) => i.inningsNumber === 1);
  const inn2State    = inningsStates.find((i: InningsState) => i.inningsNumber === 2);
  const rawInn1      = rawInnings.find((i: any) => i.inningsNumber === 1);
  const rawInn2      = rawInnings.find((i: any) => i.inningsNumber === 2);

  // Build a player lookup map — memoized so O(1) lookup instead of O(n) per render
  const playerMap = useMemo(() => {
    const map = new Map<string, string>();
    const sources = [
      ...(match?.homeTeam?.members ?? []),
      ...(match?.awayTeam?.members ?? []),
      ...(scData?.match?.homeTeam?.members ?? []),
      ...(scData?.match?.awayTeam?.members ?? []),
    ];
    for (const m of sources) {
      if (m?.player?.id) map.set(m.player.id, m.player.name);
    }
    return map;
  }, [match, scData]);
  const playerById = (id: string) => playerMap.get(id) ?? id?.slice(0, 8) ?? '?';
  const { shotRef, shareAsImage } = useScorecardShare({ match: match ?? {}, inningsStates, playerById });

  // Eligible scorers — fetched on demand when the picker sheet opens
  const { data: eligibleData, refetch: refetchEligible } = useQuery({
    queryKey: ['eligible-scorers', id],
    queryFn: () => matchesApi.getEligibleScorers(id!),
    enabled: false,
  });
  const eligibleScorers: any[] = eligibleData?.data?.data ?? [];
  const currentScorerId: string | null = eligibleData?.data?.meta?.currentScorerId ?? match?.scorer?.id ?? null;

  // Determine if the current user can manage scorer assignment
  const authUser = useAuthStore((s) => s.user);
  const canManageScorer = !!(authUser && match && (
    match.creatorId === authUser.id ||
    match.scorer?.id === authUser.id ||
    authUser.role === 'ADMIN' ||
    authUser.role === 'MASTER'
  ));

  function openOverflowMenu() {
    const options = ['Share Scorecard', canManageScorer ? 'Change Scorer' : null, 'Cancel']
      .filter(Boolean) as string[];
    Alert.alert('Match Options', undefined, [
      { text: 'Share Scorecard', onPress: shareAsImage },
      ...(canManageScorer ? [{
        text: match?.scorer ? 'Change Scorer' : 'Assign Scorer',
        onPress: async () => {
          await refetchEligible();
          scorerSheetRef.current?.expand();
        },
      }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  async function handleAssignScorer(userId: string) {
    if (!id || scorerAssigning) return;
    setScorerAssigning(true);
    try {
      await matchesApi.assignScorer(id, userId);
      scorerSheetRef.current?.close();
      queryClient.invalidateQueries({ queryKey: ['match', id] });
      queryClient.invalidateQueries({ queryKey: ['eligible-scorers', id] });
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error?.message ?? 'Could not assign scorer.');
    } finally {
      setScorerAssigning(false);
    }
  }

  async function handleRemoveScorer() {
    if (!id || scorerAssigning) return;
    Alert.alert('Remove Scorer', 'Remove the current scorer assignment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          setScorerAssigning(true);
          try {
            await matchesApi.assignScorer(id, null);
            queryClient.invalidateQueries({ queryKey: ['match', id] });
            queryClient.invalidateQueries({ queryKey: ['eligible-scorers', id] });
          } catch {}
          finally { setScorerAssigning(false); }
        },
      },
    ]);
  }

  if (!match && ml) return (
    <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.textSub }}>Loading match…</Text>
    </View>
  );
  if (!match) return (
    <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.textSub }}>Match not found</Text>
    </View>
  );

  const isLive = match.status === 'IN_PROGRESS';
  const isDone = match.status === 'COMPLETED';
  const hw = match.winnerId === match.homeTeam?.id;
  const aw = match.winnerId === match.awayTeam?.id;

  const inn1 = rawInn1;
  const inn2 = rawInn2;
  const extras1 = inn1State?.extras.total ?? 0;
  const extras2 = inn2State?.extras.total ?? 0;
  const allBalls = [...(rawInn1?.ballEvents ?? []), ...(rawInn2?.ballEvents ?? [])];

  // 2nd innings chase info
  const target      = inn1State ? inn1State.totalRuns + 1 : null;
  const chasing     = inn2State && !inn2State.isComplete && target != null;
  const inn2Runs    = inn2State?.totalRuns ?? 0;
  const inn2Wkts    = inn2State?.totalWickets ?? 0;
  const inn2Overs   = inn2State ? Math.floor(inn2State.totalOvers) + (inn2State.currentOver.legalBallsDelivered / 6) : 0;
  const maxOvers    = match.overs ?? 20;
  const needed      = chasing ? Math.max(0, target! - inn2Runs) : null;
  const ballsLeft   = chasing ? Math.max(0, maxOvers * 6 - (inn2State!.currentOver.overNumber * 6 + inn2State!.currentOver.legalBallsDelivered)) : null;
  const inn2CRR     = inn2Overs > 0 ? (inn2Runs / inn2Overs).toFixed(2) : null;
  const inn2RRR     = (ballsLeft != null && ballsLeft > 0 && needed != null) ? ((needed / ballsLeft) * 6).toFixed(2) : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScorecardShareWrapper shotRef={shotRef}>
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
          <Pressable onPress={openOverflowMenu} hitSlop={12}>
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
                <Text style={{ fontFamily: F.bold, fontSize: 11, color: C.green, textAlign: 'center', maxWidth: 80, lineHeight: 16 }}>
                  {resultText(match) ?? 'Completed'}
                </Text>
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
          {match.tossWinnerId && (
            <View style={{ paddingTop: S.sm, borderTopWidth: 1, borderTopColor: C.border }}>
              <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>
                🪙 Toss: {match.tossWinnerId === match.homeTeam?.id ? match.homeTeam?.shortName : match.awayTeam?.shortName} won · chose to {match.tossDecision?.toLowerCase() ?? 'bat'}
                {match.venue ? `  ·  📍 ${match.venue}` : ''}
              </Text>
            </View>
          )}
        </View>

        {/* ── Chase info bar (2nd innings live) ── */}
        {chasing && (
          <View style={{ backgroundColor: '#0F1A2E', paddingHorizontal: S.xl, paddingVertical: S.md, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', gap: S.xl, alignItems: 'center', flexWrap: 'wrap' }}>
            <View>
              <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted }}>Need</Text>
              <Text style={{ fontFamily: F.bold, fontSize: 20, color: needed! <= 30 ? C.red : C.orange }}>{needed}</Text>
              <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted }}>off {ballsLeft} balls</Text>
            </View>
            <View>
              <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted }}>Target</Text>
              <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.text }}>{target}</Text>
            </View>
            {inn2CRR && (
              <View>
                <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted }}>CRR</Text>
                <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.textSub }}>{inn2CRR}</Text>
              </View>
            )}
            {inn2RRR && (
              <View>
                <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted }}>RRR</Text>
                <Text style={{ fontFamily: F.bold, fontSize: 18, color: parseFloat(inn2RRR) > 12 ? C.red : parseFloat(inn2RRR) > 9 ? C.orange : C.green }}>{inn2RRR}</Text>
              </View>
            )}
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

        <View style={{ paddingHorizontal: S.xl, paddingTop: S.md, paddingBottom: S.lg }}>

          {/* SCORECARD */}
          {tab === 'Scorecard' && (
            <View style={{ gap: S.sm }}>
              {inn1State && <InningsScorecard inningsState={inn1State} rawInnings={rawInn1} playerById={playerById} title={`1st Innings — ${rawInn1?.battingTeamId === match.homeTeam?.id ? match.homeTeam?.name : match.awayTeam?.name}`} />}
              {inn2State && <View style={{ marginTop: S.xl }}><InningsScorecard inningsState={inn2State} rawInnings={rawInn2} playerById={playerById} title={`2nd Innings — ${rawInn2?.battingTeamId === match.homeTeam?.id ? match.homeTeam?.name : match.awayTeam?.name}`} /></View>}
              {!inn1State && !inn2State && (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Text style={{ fontSize: 32, marginBottom: S.md }}>🏏</Text>
                  <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.text, marginBottom: S.sm }}>No innings yet</Text>
                  <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textSub, textAlign: 'center' }}>Start scoring to see the full scorecard here</Text>
                </View>
              )}
            </View>
          )}

          {/* TIMELINE */}
          {tab === 'Timeline' && (
            <View>
              {allBalls.length > 0 ? (
                <>
                  {rawInn1?.ballEvents && (
                    <View style={{ marginBottom: S.xl }}>
                      <SectionTitle>1st Innings</SectionTitle>
                      <OverTimeline ballEvents={rawInn1.ballEvents} playerById={playerById} />
                    </View>
                  )}
                  {rawInn2?.ballEvents && (
                    <View>
                      <SectionTitle>2nd Innings</SectionTitle>
                      <OverTimeline ballEvents={rawInn2.ballEvents} playerById={playerById} />
                    </View>
                  )}
                </>
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Text style={{ fontSize: 32, marginBottom: S.md }}>📋</Text>
                  <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.text, marginBottom: S.sm }}>Ball-by-ball timeline</Text>
                  <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textSub, textAlign: 'center' }}>Available during and after live scoring</Text>
                </View>
              )}
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
                          <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>{m.player?.role?.replace('_', ' ') ?? m.role ?? 'Player'}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* INFO */}
          {tab === 'Info' && (
            <View>
              <View style={{ backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: S.lg }}>
                {[
                  ['Format',  `${match.format} · ${match.overs} overs`],
                  ['Venue',   match.venue ?? 'TBD'],
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

              {/* Scorer card */}
              <View style={{ backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 13 }}>
                  <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textMuted }}>Scorer</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'flex-end', gap: S.sm }}>
                    {match.scorer ? (
                      <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.text }}>{match.scorer.name}</Text>
                    ) : (
                      <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textMuted, fontStyle: 'italic' }}>Not assigned</Text>
                    )}
                    {canManageScorer && (
                      <Pressable
                        onPress={async () => { await refetchEligible(); scorerSheetRef.current?.expand(); }}
                        style={{ backgroundColor: C.primary + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.primary + '44' }}>
                        <Text style={{ fontFamily: F.semi, fontSize: 11, color: C.primaryLight }}>
                          {match.scorer ? 'Change' : 'Assign'}
                        </Text>
                      </Pressable>
                    )}
                    {canManageScorer && match.scorer && (
                      <Pressable onPress={handleRemoveScorer}
                        style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' }}>
                        <Text style={{ fontFamily: F.semi, fontSize: 11, color: C.red }}>Remove</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
                {match.scorer && (
                  <View style={{ paddingHorizontal: S.lg, paddingBottom: S.sm }}>
                    <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>
                      Only this person can score balls and reassign the scorer role
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
      </ScorecardShareWrapper>

      {/* ── Scorer picker sheet ── */}
      <BottomSheet ref={scorerSheetRef} index={-1} snapPoints={['55%']} enablePanDownToClose
        backgroundStyle={{ backgroundColor: '#121826' }} handleIndicatorStyle={{ backgroundColor: C.border }}>
        <BottomSheetView style={{ paddingHorizontal: S.xl, paddingBottom: S.md }}>
          <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.text, marginTop: S.sm, marginBottom: 4 }}>
            {match.scorer ? 'Change Scorer' : 'Assign Scorer'}
          </Text>
          <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted, marginBottom: S.lg }}>
            Select a player from either team. Only they can score balls and reassign this role.
          </Text>
        </BottomSheetView>
        <BottomSheetFlatList
          data={eligibleScorers}
          keyExtractor={(item: any) => item.userId}
          contentContainerStyle={{ paddingHorizontal: S.xl, paddingBottom: insets.bottom + S.xl, gap: S.sm }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textMuted, textAlign: 'center' }}>
                No eligible players found.{'\n'}Players must have a registered account to be assigned as scorer.
              </Text>
            </View>
          }
          renderItem={({ item }: { item: any }) => {
            const isCurrent = item.userId === currentScorerId;
            return (
              <Pressable
                onPress={() => !isCurrent && handleAssignScorer(item.userId)}
                disabled={scorerAssigning || isCurrent}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md,
                  borderRadius: R.lg, borderWidth: 1.5,
                  backgroundColor: isCurrent ? `${C.green}15` : pressed ? C.card2 : C.card,
                  borderColor: isCurrent ? `${C.green}50` : C.border,
                  opacity: scorerAssigning && !isCurrent ? 0.5 : 1,
                })}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isCurrent ? `${C.green}33` : C.primary + '33', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 14, color: isCurrent ? C.green : C.primaryLight }}>
                    {item.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.semi, fontSize: 14, color: isCurrent ? C.green : C.text }}>{item.name}</Text>
                  <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>
                    {item.team?.shortName} · {item.playerRole?.replace('_', ' ') ?? 'Player'}
                    {item.jerseyNumber != null ? ` · #${item.jerseyNumber}` : ''}
                  </Text>
                </View>
                {isCurrent && (
                  <View style={{ backgroundColor: `${C.green}20`, borderRadius: R.sm, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontFamily: F.bold, fontSize: 10, color: C.green }}>CURRENT</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      </BottomSheet>

      {/* Bottom CTA */}
      <View style={{ paddingHorizontal: S.xl, paddingVertical: S.md, paddingBottom: insets.bottom + S.sm, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.card }}>
        {isLive && isAuthenticated ? (
          <Pressable onPress={() => router.push(`/match/${id}/score`)}
            style={({ pressed }) => ({ backgroundColor: C.red, borderRadius: R.lg, paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: '#fff' }}>◎ Open Scorer Mode</Text>
          </Pressable>
        ) : match.status === 'UPCOMING' && isAuthenticated ? (
          <Pressable onPress={() => router.push(`/match/${id}/score`)}
            style={({ pressed }) => ({ backgroundColor: C.primary, borderRadius: R.lg, paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: '#fff' }}>◎ Start Scoring</Text>
          </Pressable>
        ) : (
          <Pressable onPress={shareAsImage}
            style={({ pressed }) => ({ backgroundColor: C.card2, borderRadius: R.lg, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border, opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.text }}>Share Scorecard</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
