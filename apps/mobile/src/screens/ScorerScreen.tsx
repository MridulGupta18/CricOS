import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, Pressable, StatusBar, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import BottomSheet, { BottomSheetView, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { v4 as uuidv4 } from 'uuid';
import { scoringApi, matchesApi } from '@/lib/api';
import { queueBallEvent } from '@/offline/storage';
import { useScoringStore } from '@/stores/scoringStore';
import { connectSocket, joinMatchRoom, leaveMatchRoom } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';
import { ExtraType, WicketType, BallEvent, InningsState, FREE_HIT_SAFE_WICKET_TYPES } from '@cricket-os/shared';
import { isPowerplay } from '@cricket-os/scoring-engine';
import { C, F, R, S } from '@/lib/theme';

interface Props { matchId: string }

// ── Wicket detail step: select dismissed batsman + fielder ─────────────────
function WicketDetailsStep({ wicketType, strikerId, nonStrikerId, allPlayers, playerName, needsFielder, onConfirm, onBack }: {
  wicketType: WicketType;
  strikerId: string; nonStrikerId: string;
  allPlayers: any[];
  playerName: (id: string) => string;
  needsFielder: boolean;
  onConfirm: (outBatsmanId: string, fielderId?: string) => void;
  onBack: () => void;
}) {
  const [outId, setOutId]       = useState(strikerId);
  const [fielderId, setFielderId] = useState<string | null>(null);

  const fieldLabel = wicketType === 'CAUGHT' ? 'Caught by' : wicketType === 'STUMPED' ? 'Stumped by' : 'Run out by';

  return (
    <View style={{ gap: S.md }}>
      <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.text, marginTop: S.sm }}>
        {wicketType.replace('_', ' ')} — details
      </Text>

      {/* Dismissed batsman */}
      <View>
        <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.textMuted, marginBottom: S.sm }}>Who was dismissed?</Text>
        <View style={{ flexDirection: 'row', gap: S.sm }}>
          {[strikerId, nonStrikerId].filter(Boolean).map(id => (
            <Pressable key={id} onPress={() => setOutId(id)}
              style={{ flex: 1, paddingVertical: S.md, borderRadius: R.lg, alignItems: 'center',
                backgroundColor: outId === id ? `${C.red}20` : C.card,
                borderWidth: 1.5, borderColor: outId === id ? C.red : C.border }}>
              <Text style={{ fontFamily: F.bold, fontSize: 13, color: outId === id ? C.red : C.textSub }}>
                {playerName(id)}{id === strikerId ? ' *' : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Fielder */}
      {needsFielder && (
        <View>
          <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.textMuted, marginBottom: S.sm }}>{fieldLabel}</Text>
          <ScrollView style={{ maxHeight: 140 }} nestedScrollEnabled>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
              {allPlayers.map((m: any) => {
                const pid = m.player?.id;
                return (
                  <Pressable key={pid} onPress={() => setFielderId(pid === fielderId ? null : pid)}
                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
                      backgroundColor: fielderId === pid ? `${C.green}20` : C.card,
                      borderWidth: 1, borderColor: fielderId === pid ? C.green : C.border }}>
                    <Text style={{ fontFamily: F.semi, fontSize: 12, color: fielderId === pid ? C.green : C.textSub }}>
                      {m.player?.name?.split(' ').pop()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.sm }}>
        <Pressable onPress={onBack}
          style={{ flex: 1, paddingVertical: S.md, borderRadius: R.lg, alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border }}>
          <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.textMuted }}>Back</Text>
        </Pressable>
        <Pressable onPress={() => onConfirm(outId, fielderId ?? undefined)}
          style={({ pressed }) => ({ flex: 2, paddingVertical: S.md, borderRadius: R.lg, alignItems: 'center', backgroundColor: C.red, opacity: pressed ? 0.85 : 1 })}>
          <Text style={{ fontFamily: F.bold, fontSize: 14, color: '#fff' }}>Confirm Out</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Match setup: toss + start innings ─────────────────────────────────────
function MatchSetupScreen({ match, onStarted }: { match: any; onStarted: () => void }) {
  const [tossWinnerId, setTossWinnerId] = useState<string>(match?.homeTeamId ?? '');
  const [tossDecision, setTossDecision] = useState<'BAT' | 'BOWL'>('BAT');
  const [submitting, setSubmitting] = useState(false);
  const insets = useSafeAreaInsets();
  const { accessToken } = useAuthStore();

  const homeTeam = match?.homeTeam;
  const awayTeam = match?.awayTeam;

  // Derive batting/bowling team from toss result
  const battingTeamId = tossDecision === 'BAT' ? tossWinnerId
    : tossWinnerId === match?.homeTeamId ? match?.awayTeamId : match?.homeTeamId;
  const bowlingTeamId = battingTeamId === match?.homeTeamId ? match?.awayTeamId : match?.homeTeamId;

  async function handleStart() {
    if (!match?.id || submitting) return;
    setSubmitting(true);
    try {
      // 1. Set toss
      await matchesApi.setToss(match.id, { tossWinnerId, tossDecision });
      // 2. Start innings 1
      await scoringApi.startInnings(match.id, { battingTeamId, bowlingTeamId, inningsNumber: 1 });
      onStarted();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error?.message ?? 'Could not start innings. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView contentContainerStyle={{ padding: S.xl, paddingTop: insets.top + S.xl, paddingBottom: insets.bottom + 80 }}>
        <Text style={{ fontFamily: F.bold, fontSize: 22, color: C.text, marginBottom: 4 }}>Match Setup</Text>
        <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textMuted, marginBottom: S.xl }}>
          {homeTeam?.shortName} vs {awayTeam?.shortName}
        </Text>

        {/* Toss winner */}
        <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.textSub, marginBottom: S.sm }}>Who won the toss?</Text>
        <View style={{ flexDirection: 'row', gap: S.sm, marginBottom: S.xl }}>
          {[homeTeam, awayTeam].filter(Boolean).map((t: any) => (
            <Pressable key={t.id} onPress={() => setTossWinnerId(t.id)}
              style={{ flex: 1, paddingVertical: S.lg, borderRadius: R.lg, alignItems: 'center',
                backgroundColor: tossWinnerId === t.id ? `${C.primary}22` : C.card,
                borderWidth: 2, borderColor: tossWinnerId === t.id ? C.primary : C.border }}>
              <Text style={{ fontFamily: F.bold, fontSize: 18, color: tossWinnerId === t.id ? C.primaryLight : C.textMuted }}>{t.shortName}</Text>
              <Text style={{ fontFamily: F.reg, fontSize: 11, color: tossWinnerId === t.id ? C.primaryLight : C.textMuted, marginTop: 2 }}>{t.name}</Text>
            </Pressable>
          ))}
        </View>

        {/* Toss decision */}
        <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.textSub, marginBottom: S.sm }}>Elected to…</Text>
        <View style={{ flexDirection: 'row', gap: S.sm, marginBottom: S.xl }}>
          {(['BAT', 'BOWL'] as const).map(d => (
            <Pressable key={d} onPress={() => setTossDecision(d)}
              style={{ flex: 1, paddingVertical: S.lg, borderRadius: R.lg, alignItems: 'center',
                backgroundColor: tossDecision === d ? `${C.green}22` : C.card,
                borderWidth: 2, borderColor: tossDecision === d ? C.green : C.border }}>
              <Text style={{ fontFamily: F.bold, fontSize: 22 }}>{d === 'BAT' ? '🏏' : '⚾'}</Text>
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: tossDecision === d ? C.green : C.textMuted, marginTop: 4 }}>{d}</Text>
            </Pressable>
          ))}
        </View>

        {/* Summary */}
        <View style={{ backgroundColor: C.card, borderRadius: R.lg, padding: S.lg, borderWidth: 1, borderColor: C.border, marginBottom: S.xl }}>
          <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textSub }}>
            <Text style={{ fontFamily: F.bold, color: C.text }}>
              {tossWinnerId === match?.homeTeamId ? homeTeam?.shortName : awayTeam?.shortName}
            </Text>
            {' '}won the toss and elected to{' '}
            <Text style={{ fontFamily: F.bold, color: C.green }}>{tossDecision.toLowerCase()}</Text>
          </Text>
          <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted, marginTop: 6 }}>
            Innings 1: <Text style={{ fontFamily: F.semi, color: C.text }}>
              {battingTeamId === match?.homeTeamId ? homeTeam?.shortName : awayTeam?.shortName}
            </Text> bat vs <Text style={{ fontFamily: F.semi, color: C.text }}>
              {bowlingTeamId === match?.homeTeamId ? homeTeam?.shortName : awayTeam?.shortName}
            </Text> bowl
          </Text>
        </View>

        <Pressable onPress={handleStart} disabled={submitting}
          style={({ pressed }) => ({ backgroundColor: submitting ? C.border : C.primary, borderRadius: R.lg, paddingVertical: 16, alignItems: 'center', opacity: pressed ? 0.85 : 1 })}>
          <Text style={{ fontFamily: F.bold, fontSize: 16, color: '#fff' }}>
            {submitting ? 'Starting…' : 'Start Match'}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const WICKET_TYPES: { value: WicketType; label: string }[] = [
  { value: 'BOWLED',            label: 'Bowled' },
  { value: 'CAUGHT',            label: 'Caught' },
  { value: 'LBW',               label: 'LBW' },
  { value: 'RUN_OUT',           label: 'Run Out' },
  { value: 'STUMPED',           label: 'Stumped' },
  { value: 'HIT_WICKET',        label: 'Hit Wkt' },
  { value: 'RETIRED_HURT',      label: 'Retired' },
  { value: 'OBSTRUCTING_FIELD', label: 'Obstruct' },
  { value: 'HANDLED_BALL',      label: 'Handled' },
  { value: 'TIMED_OUT',         label: 'Timed Out' },
];

// Free hit: these dismissals are NOT allowed (sourced from shared constants)
const FREE_HIT_BLOCKED = FREE_HIT_SAFE_WICKET_TYPES as readonly WicketType[];

const RUN_CFG: Record<number, { bg: string; border: string; color: string }> = {
  0: { bg: 'rgba(255,255,255,0.04)', border: C.border,               color: C.textMuted },
  1: { bg: 'rgba(255,255,255,0.06)', border: C.borderLt,             color: C.text },
  2: { bg: 'rgba(255,255,255,0.06)', border: C.borderLt,             color: C.text },
  3: { bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.3)', color: C.primaryLight },
  4: { bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.35)', color: C.green },
  6: { bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.35)', color: C.orange },
};

type PickerMode = 'striker' | 'nonStriker' | 'bowler' | null;

export function ScorerScreen({ matchId }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { accessToken } = useAuthStore();
  const wicketSheetRef  = useRef<BottomSheet>(null);
  const pickerSheetRef  = useRef<BottomSheet>(null);

  // Join the match Socket.IO room for live updates
  useEffect(() => {
    const socket = connectSocket(accessToken ?? undefined);
    joinMatchRoom(matchId);

    const onBallScored = () => queryClient.invalidateQueries({ queryKey: ['scorecard-scorer', matchId] });

    const onInningsComplete = (data: { isTied?: boolean; newMatchStatus?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['scorecard-scorer', matchId] });
      // When a regular innings ends in a tie, ask the scorer how to proceed
      if (data?.isTied) {
        Alert.alert(
          'Match Tied!',
          'Both teams are level. How should the match end?',
          [
            {
              text: 'Points Split (Tie)',
              style: 'cancel',
              // Match is already set to COMPLETED/TIE on the backend — nothing more to do
            },
            {
              text: 'Super Over',
              onPress: async () => {
                try {
                  await scoringApi.startSuperOver(matchId);
                  queryClient.invalidateQueries({ queryKey: ['scorecard-scorer', matchId] });
                } catch {
                  Alert.alert('Error', 'Could not start super over. Try again.');
                }
              },
            },
          ],
          { cancelable: false }
        );
      }
    };

    socket.on('ball:scored', onBallScored);
    socket.on('innings:complete', onInningsComplete);
    return () => {
      socket.off('ball:scored', onBallScored);
      socket.off('innings:complete', onInningsComplete);
      leaveMatchRoom(matchId);
    };
  }, [matchId, accessToken]);

  const { isOnline, lastBallId, setLastBallId, addPendingBall, pendingBalls } = useScoringStore();
  const [showExtras, setShowExtras]   = useState(false);
  const [extraRunsAmount, setExtraRunsAmount] = useState(1);
  const [pendingExtra, setPendingExtra] = useState<ExtraType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ballHistory, setBallHistory]   = useState<string[]>([]);
  const [pickerMode, setPickerMode]     = useState<PickerMode>(null);
  // Wicket two-step: first select type, then select dismissed batsman + fielder
  const [pendingWicketType, setPendingWicketType] = useState<WicketType | null>(null);
  const [wicketPickerStep, setWicketPickerStep]   = useState<'type' | 'details'>('type');

  // Manual overrides — cleared when scorecard refetches with updated state
  const [manualStrikerId,    setManualStrikerId]    = useState<string | null>(null);
  const [manualNonStrikerId, setManualNonStrikerId] = useState<string | null>(null);
  const [manualBowlerId,     setManualBowlerId]     = useState<string | null>(null);

  const { data: scorecardData, refetch } = useQuery({
    queryKey: ['scorecard-scorer', matchId],
    queryFn:  () => scoringApi.getScorecard(matchId),
    refetchInterval: 5000,
  });

  const match        = scorecardData?.data?.data?.match;
  const allInnings: any[]  = scorecardData?.data?.data?.inningsStates ?? [];
  const innings      = allInnings[allInnings.length - 1] as InningsState | undefined;
  const rawInnings   = match?.innings?.[match.innings.length - 1];
  const inningsId    = rawInnings?.id;
  const inningsNum   = innings?.inningsNumber ?? 1;

  const battingTeam  = rawInnings?.battingTeamId === match?.homeTeam?.id ? match?.homeTeam : match?.awayTeam;
  const bowlingTeam  = rawInnings?.battingTeamId === match?.homeTeam?.id ? match?.awayTeam : match?.homeTeam;
  const battingMembers:  any[] = battingTeam?.members  ?? [];
  const bowlingMembers:  any[] = bowlingTeam?.members  ?? [];
  const allPlayers   = [...battingMembers, ...bowlingMembers];

  // Resolve IDs — prefer manual override, fall back to engine state
  const strikerId    = manualStrikerId    ?? innings?.currentStrikerId    ?? battingMembers[0]?.player?.id ?? '';
  const nonStrikerId = manualNonStrikerId ?? innings?.currentNonStrikerId ?? battingMembers[1]?.player?.id ?? '';
  const bowlerId     = manualBowlerId     ?? innings?.currentOver?.bowlerId ?? bowlingMembers[0]?.player?.id ?? '';

  const findPlayer  = (id: string) => allPlayers.find(m => m.player?.id === id)?.player;
  const playerName  = (id: string) => findPlayer(id)?.name?.split(' ').pop() ?? '?';
  const batsmanStat = (id: string) => innings?.batsmen?.find(b => b.playerId === id);
  const bowlerStat  = () => innings?.bowlers?.find(b => b.playerId === bowlerId);

  // Innings numbers
  const overNum       = innings?.currentOver?.overNumber  ?? rawInnings?.completedOvers ?? 0;
  const legalBalls    = innings?.currentOver?.legalBallsDelivered ?? 0;
  const totalRuns     = innings?.totalRuns   ?? rawInnings?.totalRuns   ?? 0;
  const totalWickets  = innings?.totalWickets ?? rawInnings?.totalWickets ?? 0;
  const totalOvers    = match?.overs ?? 20;
  const totalBalls    = overNum * 6 + legalBalls;
  const crr           = totalBalls > 0 ? ((totalRuns / totalBalls) * 6).toFixed(2) : '--';

  const firstInnings  = allInnings.find((i: any) => i.inningsNumber === 1);
  const target        = inningsNum === 2 && firstInnings ? firstInnings.totalRuns + 1 : null;
  const needed        = target != null ? Math.max(0, target - totalRuns) : null;
  const ballsLeft     = totalOvers * 6 - totalBalls;
  const rrr           = (needed != null && ballsLeft > 0) ? ((needed / ballsLeft) * 6).toFixed(2) : '—';

  const isFreeHit  = innings?.nextBallIsFreeHit ?? false;
  const inPowerplay = isPowerplay(overNum, match?.format ?? 'T20');
  const partnership = innings?.currentPartnership;

  // Ball colour helpers
  const getBallColour = (b: string) => {
    if (b === 'W') return C.red;
    if (b === '6') return C.orange;
    if (b === '4') return C.green;
    if (b === '·') return C.textMuted;
    if (b.startsWith('Wd') || b.startsWith('Nb') || b.startsWith('B') || b.startsWith('Lb')) return C.orange;
    return C.textSub;
  };

  const submitBall = useCallback(async (params: {
    runs: number; extraType?: ExtraType; extraRuns?: number;
    wicket?: { type: WicketType; outBatsmanId: string; fielderId?: string };
  }) => {
    if (isSubmitting || !inningsId || !strikerId || !bowlerId) return;

    // Innings already complete — block further scoring
    if (innings?.isComplete) return;

    // Free hit guard
    if (isFreeHit && params.wicket && FREE_HIT_BLOCKED.includes(params.wicket.type)) {
      return; // silently block — UI already greyed out
    }

    setIsSubmitting(true);
    await Haptics.impactAsync(
      params.runs >= 4 || params.wicket ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium
    );

    let display = '';
    if (params.wicket)                         display = 'W';
    else if (params.extraType === 'WIDE')      display = 'Wd';
    else if (params.extraType === 'NO_BALL')   display = 'Nb';
    else if (params.extraType === 'BYE')       display = `B${params.extraRuns ?? 0}`;
    else if (params.extraType === 'LEG_BYE')   display = `Lb${params.extraRuns ?? 0}`;
    else                                        display = params.runs === 0 ? '·' : `${params.runs}`;
    setBallHistory(h => [...h.slice(-30), display]);

    const payload = {
      clientId: uuidv4(), inningsId, batsmanId: strikerId, bowlerId,
      runs: params.runs, extraType: params.extraType ?? null,
      extraRuns: params.extraRuns ?? 0, wicket: params.wicket ?? null,
    };

    try {
      if (isOnline) {
        const { data } = await scoringApi.scoreBall(payload);
        setLastBallId(data.data?.ballEvent?.id ?? null);
        // Clear manual overrides so engine state takes over
        setManualStrikerId(null); setManualNonStrikerId(null); setManualBowlerId(null);
        refetch();
      } else {
        const ball: BallEvent = {
          id: uuidv4(), clientId: payload.clientId, matchId, inningsId,
          overNumber: overNum, ballNumber: legalBalls, rawBallNumber: 0,
          batsmanId: strikerId, bowlerId, runs: params.runs as any,
          extras: params.extraType ? { type: params.extraType, runs: params.extraRuns ?? 1 } : null,
          wicket: params.wicket ?? null, isFreeHit,
          isLegalBall: !params.extraType || (params.extraType !== 'WIDE' && params.extraType !== 'NO_BALL'),
          timestamp: new Date().toISOString(),
        };
        queueBallEvent(ball); addPendingBall(ball);
      }
    } catch {
      const ball: BallEvent = {
        id: uuidv4(), clientId: payload.clientId, matchId, inningsId,
        overNumber: overNum, ballNumber: legalBalls, rawBallNumber: 0,
        batsmanId: strikerId, bowlerId, runs: params.runs as any,
        extras: params.extraType ? { type: params.extraType, runs: params.extraRuns ?? 1 } : null,
        wicket: params.wicket ?? null, isFreeHit, isLegalBall: true, timestamp: new Date().toISOString(),
      };
      queueBallEvent(ball); addPendingBall(ball);
    } finally {
      setIsSubmitting(false); setShowExtras(false);
    }
  }, [isSubmitting, inningsId, isOnline, strikerId, nonStrikerId, bowlerId, matchId, overNum, legalBalls, isFreeHit]);

  async function handleUndo() {
    if (!lastBallId) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setBallHistory(h => h.slice(0, -1));
    try { await scoringApi.undoBall(lastBallId); setLastBallId(null); refetch(); } catch {}
  }

  function openPicker(mode: PickerMode) {
    setPickerMode(mode);
    pickerSheetRef.current?.expand();
  }

  function selectPlayer(playerId: string) {
    if (pickerMode === 'striker')    setManualStrikerId(playerId);
    if (pickerMode === 'nonStriker') setManualNonStrikerId(playerId);
    if (pickerMode === 'bowler')     setManualBowlerId(playerId);
    pickerSheetRef.current?.close();
  }

  // Wicket types that require a fielder name
  const FIELDER_REQUIRED: WicketType[] = ['CAUGHT', 'STUMPED', 'RUN_OUT'];
  // All players for wicket detail step
  const allMatchPlayers = useMemo(() => [...battingMembers, ...bowlingMembers], [battingMembers, bowlingMembers]);

  const pickerList = pickerMode === 'bowler' ? bowlingMembers : battingMembers;
  const bowlerInfo = bowlerStat();
  const strikerInfo    = batsmanStat(strikerId);
  const nonStrikerInfo = batsmanStat(nonStrikerId);

  // Show match setup (toss + start innings) when no innings have been created yet
  const matchNotStarted = match && (!match.innings || match.innings.length === 0);
  if (matchNotStarted) {
    return (
      <MatchSetupScreen
        match={match}
        onStarted={() => queryClient.invalidateQueries({ queryKey: ['scorecard-scorer', matchId] })}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Top bar ── */}
      <View style={{ backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border, paddingTop: insets.top + 4, paddingHorizontal: S.lg, paddingBottom: S.md, flexDirection: 'row', alignItems: 'center', gap: S.md }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontFamily: F.reg, fontSize: 22, color: C.textSub }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.text }}>
            {match ? `${match.homeTeam?.shortName} vs ${match.awayTeam?.shortName}` : 'Loading...'}
          </Text>
          <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>
            Innings {inningsNum} · {battingTeam?.shortName ?? '—'} batting
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
          {pendingBalls.length > 0 && <Text style={{ fontFamily: F.semi, fontSize: 11, color: C.orange }}>{pendingBalls.length} pending</Text>}
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: isOnline ? C.green : C.red }} />
        </View>
        <Pressable
          onPress={() =>
            Alert.alert(
              'End Innings',
              `End this innings at ${totalRuns}/${totalWickets} (${overNum}.${legalBalls} ov)?`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'End Innings', style: 'destructive', onPress: () => router.back() },
              ]
            )
          }
          style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', borderRadius: R.md, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 11, color: C.red }}>End</Text>
        </Pressable>
      </View>

      {/* ── Innings complete banner ── */}
      {innings?.isComplete && (
        <View style={{ backgroundColor: 'rgba(16,185,129,0.15)', borderBottomWidth: 1, borderBottomColor: 'rgba(16,185,129,0.4)', paddingVertical: 8, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.green }}>Innings Complete — {totalRuns}/{totalWickets}</Text>
        </View>
      )}

      {/* ── Free hit banner ── */}
      {isFreeHit && (
        <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', borderBottomWidth: 1, borderBottomColor: 'rgba(245,158,11,0.4)', paddingVertical: 6, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          <Text style={{ fontSize: 14 }}>⚡</Text>
          <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.orange }}>FREE HIT</Text>
          <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.orange, opacity: 0.75 }}>Only run-out/obstructing dismissals apply</Text>
        </View>
      )}

      {/* ── Score hero ── */}
      <View style={{ backgroundColor: '#141929', paddingHorizontal: S.xl, paddingVertical: S.lg, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: S.md, marginBottom: S.sm }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 52, color: C.text, lineHeight: 56, letterSpacing: -1.5 }}>
              {totalRuns}<Text style={{ color: C.textMuted, fontSize: 30 }}>/{totalWickets}</Text>
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
              <Text style={{ fontFamily: F.semi, fontSize: 18, color: C.textSub }}>
                {overNum}.{legalBalls}<Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted }}> overs</Text>
              </Text>
              {inPowerplay && (
                <View style={{ backgroundColor: 'rgba(99,102,241,0.2)', borderRadius: R.sm, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(99,102,241,0.4)' }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 9, color: C.primaryLight, letterSpacing: 0.5 }}>POWERPLAY</Text>
                </View>
              )}
            </View>
          </View>
          {needed != null && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>Need</Text>
              <Text style={{ fontFamily: F.bold, fontSize: 24, color: needed <= 30 ? C.red : C.orange }}>{needed}</Text>
              <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>off {ballsLeft} balls</Text>
            </View>
          )}
        </View>

        {/* Rates + partnership */}
        <View style={{ flexDirection: 'row', gap: S.xl, marginBottom: S.sm }}>
          <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>
            CRR <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.textSub }}>{crr}</Text>
          </Text>
          {target != null && (
            <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>
              RRR <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.textSub }}>{rrr}</Text>
            </Text>
          )}
          {partnership && (
            <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>
              Partnership <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.green }}>{partnership.runs} ({partnership.balls})</Text>
            </Text>
          )}
        </View>

        {/* Ball strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {ballHistory.slice(-20).map((b, i) => (
              <View key={i} style={{
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: b === 'W' ? 'rgba(239,68,68,0.15)' : b === '6' ? 'rgba(245,158,11,0.12)' : b === '4' ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)',
                borderWidth: 1.5, borderColor: getBallColour(b), alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontFamily: F.bold, fontSize: 10, color: getBallColour(b) }}>{b}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* ── Batters row ── */}
      <View style={{ padding: S.md, flexDirection: 'row', gap: S.sm, borderBottomWidth: 1, borderBottomColor: C.border }}>
        {[
          { id: strikerId,    isStriker: true,  info: strikerInfo,    mode: 'striker' as PickerMode },
          { id: nonStrikerId, isStriker: false, info: nonStrikerInfo, mode: 'nonStriker' as PickerMode },
        ].map((b) => (
          <Pressable key={b.id} onLongPress={() => openPicker(b.mode)}
            style={{ flex: 1, backgroundColor: b.isStriker ? 'rgba(99,102,241,0.1)' : C.card, borderWidth: 1, borderColor: b.isStriker ? 'rgba(99,102,241,0.35)' : C.border, borderRadius: R.lg, padding: S.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 }}>
              {b.isStriker && <View style={{ backgroundColor: C.primary, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}><Text style={{ fontFamily: F.bold, fontSize: 9, color: '#fff' }}>*</Text></View>}
              <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.text }} numberOfLines={1}>{playerName(b.id)}</Text>
            </View>
            <Text style={{ fontFamily: F.bold, fontSize: 20, color: C.text, lineHeight: 24 }}>
              {b.info?.runs ?? 0}<Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}> ({b.info?.ballsFaced ?? 0})</Text>
            </Text>
            <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted, marginTop: 2 }}>
              {b.info?.fours ?? 0}×4  {b.info?.sixes ?? 0}×6  SR {b.info?.strikeRate?.toFixed(0) ?? '—'}
            </Text>
            <Text style={{ fontFamily: F.reg, fontSize: 9, color: C.textMuted, marginTop: 2, opacity: 0.5 }}>Hold to change</Text>
          </Pressable>
        ))}
      </View>

      {/* ── Bowler strip ── */}
      <Pressable onLongPress={() => openPicker('bowler')} style={{ paddingHorizontal: S.xl, paddingVertical: S.sm, backgroundColor: '#0D1220', borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
        <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>Bowling:</Text>
        <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.text }}>{playerName(bowlerId)}</Text>
        <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textSub }}>
          {bowlerInfo ? `${Math.floor(bowlerInfo.overs)}.${Math.round((bowlerInfo.overs % 1) * 6)} ov  ${bowlerInfo.runs}r  ${bowlerInfo.wickets}W` : `${overNum}.${legalBalls} ov`}
        </Text>
        {bowlerInfo?.maidens ? <Text style={{ fontFamily: F.semi, fontSize: 10, color: C.green }}>{bowlerInfo.maidens}M</Text> : null}
        <Text style={{ fontFamily: F.reg, fontSize: 9, color: C.textMuted, marginLeft: 'auto', opacity: 0.5 }}>Hold to change</Text>
      </Pressable>

      {/* ── Action zone ── */}
      <View style={{ flex: 1, padding: S.md, gap: S.sm }}>
        {/* 6-column run grid */}
        <View style={{ flexDirection: 'row', gap: S.sm, flex: 1, maxHeight: 160 }}>
          {[0, 1, 2, 3, 4, 6].map(run => {
            const cfg = RUN_CFG[run];
            return (
              <Pressable key={run} disabled={isSubmitting} onPress={() => submitBall({ runs: run })}
                style={({ pressed }) => ({
                  flex: 1, borderRadius: R.lg, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: pressed ? cfg.border : cfg.bg,
                  borderWidth: 2, borderColor: cfg.border,
                  transform: [{ scale: pressed ? 0.93 : 1 }],
                  opacity: isSubmitting ? 0.35 : 1, minHeight: 64,
                })}>
                <Text style={{ fontFamily: F.bold, fontSize: 26, color: cfg.color }}>{run}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Extras panel — step 1: pick type */}
        {showExtras && !pendingExtra && (
          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', borderRadius: R.lg, padding: S.md, flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
            {([
              { label: 'Wide',    type: 'WIDE' as ExtraType },
              { label: 'No Ball', type: 'NO_BALL' as ExtraType },
              { label: 'Leg Bye', type: 'LEG_BYE' as ExtraType },
              { label: 'Bye',     type: 'BYE' as ExtraType },
              { label: 'Penalty', type: 'PENALTY' as ExtraType },
            ] as const).map(ex => (
              <Pressable key={ex.type} onPress={() => { setPendingExtra(ex.type); setExtraRunsAmount(ex.type === 'PENALTY' ? 5 : 1); }}
                style={({ pressed }) => ({ flex: 1, minWidth: '40%', paddingVertical: S.md, borderRadius: R.lg, alignItems: 'center', backgroundColor: pressed ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.08)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)' })}>
                <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.purple }}>{ex.label}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setShowExtras(false)} style={{ width: '100%', alignItems: 'center', paddingVertical: 6 }}>
              <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.textMuted }}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {/* Extras panel — step 2: pick run amount */}
        {showExtras && pendingExtra && (
          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', borderRadius: R.lg, padding: S.md, gap: S.sm }}>
            <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.text }}>
              {pendingExtra.replace('_', ' ')} — how many runs?
            </Text>
            <View style={{ flexDirection: 'row', gap: S.sm }}>
              {(pendingExtra === 'PENALTY' ? [5] : [0, 1, 2, 3, 4]).map(r => (
                <Pressable key={r} onPress={() => setExtraRunsAmount(r)}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: R.md, alignItems: 'center',
                    backgroundColor: extraRunsAmount === r ? C.primary : 'rgba(255,255,255,0.05)',
                    borderWidth: 1.5, borderColor: extraRunsAmount === r ? C.primary : C.border }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 16, color: extraRunsAmount === r ? '#fff' : C.textSub }}>{r}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.xs }}>
              <Pressable onPress={() => setPendingExtra(null)}
                style={{ flex: 1, paddingVertical: S.md, borderRadius: R.lg, alignItems: 'center', backgroundColor: C.card2, borderWidth: 1, borderColor: C.border }}>
                <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.textMuted }}>Back</Text>
              </Pressable>
              <Pressable onPress={() => {
                  submitBall({ runs: 0, extraType: pendingExtra, extraRuns: extraRunsAmount });
                  setPendingExtra(null); setShowExtras(false);
                }}
                style={({ pressed }) => ({ flex: 2, paddingVertical: S.md, borderRadius: R.lg, alignItems: 'center', backgroundColor: C.primary, opacity: pressed ? 0.85 : 1 })}>
                <Text style={{ fontFamily: F.bold, fontSize: 14, color: '#fff' }}>
                  Confirm {pendingExtra.replace('_', ' ')} +{extraRunsAmount}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Secondary row */}
        {!showExtras && (
          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <Pressable disabled={isSubmitting}
              onPress={async () => { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); wicketSheetRef.current?.expand(); }}
              style={({ pressed }) => ({ flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.35)', borderRadius: R.lg, paddingVertical: S.lg, alignItems: 'center', opacity: isSubmitting ? 0.35 : pressed ? 0.8 : 1 })}>
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.red }}>🏏 Wicket</Text>
            </Pressable>
            <Pressable onPress={() => setShowExtras(true)}
              style={({ pressed }) => ({ flex: 1, backgroundColor: 'rgba(139,92,246,0.08)', borderWidth: 1.5, borderColor: 'rgba(139,92,246,0.3)', borderRadius: R.lg, paddingVertical: S.lg, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.purple }}>+ Extras</Text>
            </Pressable>
            <Pressable disabled={!lastBallId} onPress={handleUndo}
              style={({ pressed }) => ({ flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingVertical: S.lg, alignItems: 'center', opacity: !lastBallId ? 0.35 : pressed ? 0.8 : 1 })}>
              <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.textSub }}>↩ Undo</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* ── Wicket sheet — Step 1: pick type ── */}
      <BottomSheet ref={wicketSheetRef} index={-1} snapPoints={['60%']} enablePanDownToClose
        backgroundStyle={{ backgroundColor: '#121826' }} handleIndicatorStyle={{ backgroundColor: C.border }}
        onClose={() => { setPendingWicketType(null); setWicketPickerStep('type'); }}>
        <BottomSheetView style={{ paddingHorizontal: S.xl, paddingBottom: insets.bottom + S.xl }}>
          {wicketPickerStep === 'type' ? (
            <>
              <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.text, marginBottom: S.lg, marginTop: S.sm }}>How was the wicket?</Text>
              {isFreeHit && (
                <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: R.md, padding: S.sm, marginBottom: S.md, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
                  <Text style={{ fontFamily: F.semi, fontSize: 11, color: C.orange }}>⚡ Free Hit — only Run Out & Obstructing apply</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
                {WICKET_TYPES.map(w => {
                  const blocked = isFreeHit && FREE_HIT_BLOCKED.includes(w.value);
                  return (
                    <Pressable key={w.value} disabled={blocked}
                      onPress={async () => {
                        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        setPendingWicketType(w.value);
                        setWicketPickerStep('details');
                      }}
                      style={({ pressed }) => ({
                        width: '22%', flex: 1, paddingVertical: S.md, borderRadius: R.lg, alignItems: 'center',
                        backgroundColor: blocked ? 'rgba(255,255,255,0.03)' : `${C.red}15`,
                        borderWidth: 1.5, borderColor: blocked ? C.border : `${C.red}40`,
                        opacity: blocked ? 0.35 : pressed ? 0.75 : 1,
                      })}>
                      <Text style={{ fontFamily: F.semi, fontSize: 12, color: blocked ? C.textMuted : C.red }}>{w.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable onPress={() => wicketSheetRef.current?.close()}
                style={{ marginTop: S.md, paddingVertical: S.md, borderRadius: R.lg, alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border }}>
                <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.textSub }}>Cancel</Text>
              </Pressable>
            </>
          ) : (
            <WicketDetailsStep
              wicketType={pendingWicketType!}
              strikerId={strikerId}
              nonStrikerId={nonStrikerId}
              allPlayers={allMatchPlayers}
              playerName={playerName}
              needsFielder={FIELDER_REQUIRED.includes(pendingWicketType!)}
              onConfirm={(outBatsmanId, fielderId) => {
                wicketSheetRef.current?.close();
                setPendingWicketType(null);
                setWicketPickerStep('type');
                submitBall({ runs: 0, wicket: { type: pendingWicketType!, outBatsmanId, fielderId } });
              }}
              onBack={() => setWicketPickerStep('type')}
            />
          )}
        </BottomSheetView>
      </BottomSheet>

      {/* ── Player picker sheet ── */}
      <BottomSheet ref={pickerSheetRef} index={-1} snapPoints={['50%']} enablePanDownToClose
        backgroundStyle={{ backgroundColor: '#121826' }} handleIndicatorStyle={{ backgroundColor: C.border }}>
        <BottomSheetView style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.text, padding: S.xl, paddingBottom: S.md }}>
            Select {pickerMode === 'bowler' ? 'Bowler' : pickerMode === 'striker' ? 'Striker' : 'Non-striker'}
          </Text>
          <BottomSheetFlatList
            data={pickerList}
            keyExtractor={(item: any) => item.player?.id}
            contentContainerStyle={{ paddingHorizontal: S.xl, paddingBottom: insets.bottom + S.xl, gap: S.sm }}
            renderItem={({ item }: { item: any }) => (
              <Pressable onPress={() => selectPlayer(item.player?.id)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md, borderRadius: R.lg, backgroundColor: pressed ? C.card2 : C.card, borderWidth: 1, borderColor: C.border })}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.primary + '33', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.primaryLight }}>{item.player?.name?.[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.text }}>{item.player?.name}</Text>
                  <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>{item.player?.role?.replace('_', ' ') ?? 'Player'}</Text>
                </View>
              </Pressable>
            )}
          />
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}
