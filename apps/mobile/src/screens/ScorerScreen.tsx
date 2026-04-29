import { useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, StatusBar, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { v4 as uuidv4 } from 'uuid';
import { scoringApi } from '@/lib/api';
import { queueBallEvent } from '@/offline/storage';
import { useScoringStore } from '@/stores/scoringStore';
import { ExtraType, WicketType, BallEvent } from '@cricket-os/shared';
import { C, F, R, S } from '@/lib/theme';

interface Props { matchId: string }

const WICKET_TYPES: { value: WicketType; label: string }[] = [
  { value: 'BOWLED',     label: 'Bowled' },
  { value: 'CAUGHT',     label: 'Caught' },
  { value: 'LBW',        label: 'LBW' },
  { value: 'RUN_OUT',    label: 'Run Out' },
  { value: 'STUMPED',    label: 'Stumped' },
  { value: 'HIT_WICKET', label: 'Hit Wicket' },
  { value: 'RETIRED',    label: 'Retired' },
  { value: 'OBSTRUCTED', label: 'Obstructed' },
];

const RUN_CFG: Record<number, { bg: string; border: string; color: string }> = {
  0: { bg: 'rgba(255,255,255,0.04)', border: C.border,              color: C.textMuted },
  1: { bg: 'rgba(255,255,255,0.06)', border: C.borderLt,            color: C.text },
  2: { bg: 'rgba(255,255,255,0.06)', border: C.borderLt,            color: C.text },
  3: { bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.3)', color: C.primaryLight },
  4: { bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.35)', color: C.green },
  6: { bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.35)', color: C.orange },
};

export function ScorerScreen({ matchId }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const wicketSheetRef = useRef<BottomSheet>(null);
  const { currentInningsState, isOnline, lastBallId, setLastBallId, addPendingBall, pendingBalls } = useScoringStore();
  const [showExtras, setShowExtras] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [strikeIdx, setStrikeIdx] = useState(0);
  const [ballHistory, setBallHistory] = useState<string[]>([]);

  const { data: scorecardData, refetch } = useQuery({
    queryKey: ['scorecard-scorer', matchId],
    queryFn: () => scoringApi.getScorecard(matchId),
  });

  const match = scorecardData?.data?.data?.match;
  const allInnings: any[] = match?.innings ?? [];
  const innings = allInnings[allInnings.length - 1];
  const inningsId = innings?.id;
  const inningsNum = innings?.inningsNumber ?? 1;
  const battingTeam = innings?.battingTeamId === match?.homeTeam?.id ? match?.homeTeam : match?.awayTeam;
  const bowlingTeam = innings?.battingTeamId === match?.homeTeam?.id ? match?.awayTeam : match?.homeTeam;
  const members: any[] = battingTeam?.members ?? [];

  const striker  = members[strikeIdx]?.player?.name?.split(' ').pop() ?? 'Batsman 1';
  const nonStriker = members[strikeIdx === 0 ? 1 : 0]?.player?.name?.split(' ').pop() ?? 'Batsman 2';
  const bowlerName = bowlingTeam?.members?.[0]?.player?.name?.split(' ').pop() ?? 'Bowler';

  const strikerId = members[strikeIdx]?.player?.id ?? 'p1';
  const bowlerId = bowlingTeam?.members?.[0]?.player?.id ?? 'p2';

  const over = currentInningsState?.currentOver;
  const legalBalls = over?.legalBallsDelivered ?? 0;
  const totalRuns = currentInningsState?.totalRuns ?? innings?.totalRuns ?? 0;
  const totalWickets = currentInningsState?.totalWickets ?? innings?.totalWickets ?? 0;
  const overNum = over?.overNumber ?? innings?.completedOvers ?? 0;
  const totalOvers = match?.overs ?? 20;
  const totalBalls = overNum * 6 + legalBalls;
  const crr = totalBalls > 0 ? ((totalRuns / totalBalls) * 6).toFixed(2) : '--';

  const firstInnings = allInnings.find((i: any) => i.inningsNumber === 1);
  const target = inningsNum === 2 && firstInnings ? firstInnings.totalRuns + 1 : null;
  const needed = target != null ? Math.max(0, target - totalRuns) : null;
  const ballsLeft = totalOvers * 6 - totalBalls;
  const rrr = (needed != null && ballsLeft > 0) ? ((needed / ballsLeft) * 6).toFixed(2) : '—';

  const overComplete = legalBalls >= 6;

  const submitBall = useCallback(async (params: {
    runs: number; extraType?: ExtraType; extraRuns?: number;
    wicket?: { type: WicketType; outBatsmanId: string };
  }) => {
    if (isSubmitting || !inningsId) return;
    setIsSubmitting(true);
    await Haptics.impactAsync(
      params.runs >= 4 || params.wicket ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium
    );

    let display = '';
    if (params.wicket) display = 'W';
    else if (params.extraType === 'WIDE') display = 'Wd';
    else if (params.extraType === 'NO_BALL') display = 'Nb';
    else if (params.extraType === 'BYE') display = `B${params.extraRuns ?? 0}`;
    else if (params.extraType === 'LEG_BYE') display = `Lb${params.extraRuns ?? 0}`;
    else display = params.runs === 0 ? '·' : `${params.runs}`;
    setBallHistory(h => [...h.slice(-30), display]);

    const payload = {
      clientId: uuidv4(), inningsId, batsmanId: strikerId, bowlerId,
      runs: params.runs, extraType: params.extraType ?? null,
      extraRuns: params.extraRuns ?? 0, wicket: params.wicket ?? null,
    };

    try {
      if (isOnline) {
        const { data } = await scoringApi.scoreBall(payload);
        setLastBallId(data.data?.id ?? null);
        refetch();
      } else {
        const ball: BallEvent = {
          id: uuidv4(), clientId: payload.clientId, matchId, inningsId,
          overNumber: overNum, ballNumber: legalBalls, rawBallNumber: 0,
          batsmanId: strikerId, bowlerId, runs: params.runs as any,
          extras: params.extraType ? { type: params.extraType, runs: params.extraRuns ?? 1 } : null,
          wicket: params.wicket ?? null,
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
        wicket: params.wicket ?? null, isLegalBall: true, timestamp: new Date().toISOString(),
      };
      queueBallEvent(ball); addPendingBall(ball);
    } finally {
      setIsSubmitting(false); setShowExtras(false);
    }
  }, [isSubmitting, inningsId, isOnline, strikerId, bowlerId, matchId, overNum, legalBalls]);

  async function handleUndo() {
    if (!lastBallId) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setBallHistory(h => h.slice(0, -1));
    try { await scoringApi.undoBall(lastBallId); setLastBallId(null); refetch(); } catch {}
  }

  const ballColor: Record<string, string> = { '4': C.green, '6': C.orange, 'W': C.red, '·': C.textMuted };
  const getBallColor = (b: string) => ballColor[b] || (b.startsWith('Wd') || b.startsWith('Nb') || b.startsWith('B') || b.startsWith('Lb') ? C.orange : C.textSub);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Top bar */}
      <View style={{ backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border, paddingTop: insets.top + 4, padding: S.lg, flexDirection: 'row', alignItems: 'center', gap: S.md, flexShrink: 0 }}>
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
          {pendingBalls.length > 0 && <Text style={{ fontFamily: F.semi, fontSize: 11, color: C.orange }}>{pendingBalls.length}</Text>}
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: isOnline ? C.green : C.red }} />
        </View>
        <Pressable style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', borderRadius: R.md, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 11, color: C.red }}>End</Text>
        </Pressable>
      </View>

      {/* Score display */}
      <View style={{ backgroundColor: '#141929', padding: `${S.lg}px ${S.xl}px` as any, paddingHorizontal: S.xl, paddingVertical: S.lg, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: S.md, marginBottom: S.sm }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 52, color: C.text, lineHeight: 56, letterSpacing: -1.5 }}>
              {totalRuns}<Text style={{ color: C.textMuted, fontSize: 30 }}>/{totalWickets}</Text>
            </Text>
            <Text style={{ fontFamily: F.semi, fontSize: 18, color: C.textSub }}>
              {overNum}.{legalBalls}<Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted }}> overs</Text>
            </Text>
          </View>
          {needed != null && (
            <View style={{ textAlign: 'right' } as any}>
              <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>Need</Text>
              <Text style={{ fontFamily: F.bold, fontSize: 24, color: needed <= 30 ? C.red : C.orange }}>{needed}</Text>
              <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>off {ballsLeft} balls</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: S.xl, marginBottom: S.sm }}>
          {[['CRR', crr], ...(target ? [['RRR', rrr]] : []), ['Extras', innings?.extrasWides ?? 0]].map(([l, v]) => (
            <Text key={l as string} style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>
              {l} <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.textSub }}>{v}</Text>
            </Text>
          ))}
        </View>
        {/* Ball strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexShrink: 0 }}>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {ballHistory.slice(-20).map((b, i) => (
              <View key={i} style={{
                width: 28, height: 28, borderRadius: 14, flexShrink: 0,
                backgroundColor: b === 'W' ? 'rgba(239,68,68,0.15)' : b === '6' ? 'rgba(245,158,11,0.12)' : b === '4' ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)',
                borderWidth: 1.5, borderColor: getBallColor(b),
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontFamily: F.bold, fontSize: 10, color: getBallColor(b) }}>{b}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Batters */}
      <View style={{ padding: S.md, flexDirection: 'row', gap: S.sm, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: C.border }}>
        {[{ name: striker, isStriker: true }, { name: nonStriker, isStriker: false }].map((b, i) => (
          <Pressable key={i} onPress={() => setStrikeIdx(prev => prev === 0 ? 1 : 0)}
            style={{ flex: 1, backgroundColor: b.isStriker ? 'rgba(99,102,241,0.1)' : C.card, borderWidth: 1, borderColor: b.isStriker ? 'rgba(99,102,241,0.35)' : C.border, borderRadius: R.lg, padding: S.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
              {b.isStriker && <View style={{ backgroundColor: C.primary, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}><Text style={{ fontFamily: F.bold, fontSize: 9, color: '#fff' }}>*</Text></View>}
              <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.text }}>{b.name}</Text>
            </View>
            <Text style={{ fontFamily: F.bold, fontSize: 20, color: C.text, lineHeight: 24 }}>
              0<Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}> (0)</Text>
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Bowler */}
      <View style={{ paddingHorizontal: S.xl, paddingVertical: S.sm, backgroundColor: '#0D1220', borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', alignItems: 'center', gap: S.sm, flexShrink: 0 }}>
        <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>Bowling:</Text>
        <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.text }}>{bowlerName}</Text>
        <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textSub }}>
          {overNum}.{legalBalls} ov · 0 W
        </Text>
      </View>

      {/* Action zone */}
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
                  opacity: isSubmitting ? 0.35 : 1,
                  minHeight: 64,
                })}>
                <Text style={{ fontFamily: F.bold, fontSize: 26, color: cfg.color }}>{run}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Extras panel */}
        {showExtras && (
          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', borderRadius: R.lg, padding: S.md, flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
            {[
              { label: 'Wide',    type: 'WIDE' as ExtraType },
              { label: 'No Ball', type: 'NO_BALL' as ExtraType },
              { label: 'Leg Bye', type: 'LEG_BYE' as ExtraType },
              { label: 'Bye',     type: 'BYE' as ExtraType },
            ].map(ex => (
              <Pressable key={ex.type} onPress={() => submitBall({ runs: 0, extraType: ex.type, extraRuns: 1 })}
                style={({ pressed }) => ({ flex: 1, minWidth: '40%', paddingVertical: S.md, borderRadius: R.lg, alignItems: 'center', backgroundColor: pressed ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.08)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)' })}>
                <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.purple }}>{ex.label}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setShowExtras(false)} style={{ width: '100%', alignItems: 'center', paddingVertical: 6 }}>
              <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.textMuted }}>Cancel</Text>
            </Pressable>
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

      {/* Wicket bottom sheet */}
      <BottomSheet ref={wicketSheetRef} index={-1} snapPoints={['55%']} enablePanDownToClose
        backgroundStyle={{ backgroundColor: '#121826' }} handleIndicatorStyle={{ backgroundColor: C.border }}>
        <BottomSheetView style={{ paddingHorizontal: S.xl, paddingBottom: insets.bottom + S.xl }}>
          <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.text, marginBottom: S.lg, marginTop: S.sm }}>How was the wicket?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
            {WICKET_TYPES.map(w => (
              <Pressable key={w.value}
                onPress={async () => {
                  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  wicketSheetRef.current?.close();
                  submitBall({ runs: 0, wicket: { type: w.value, outBatsmanId: strikerId } });
                }}
                style={({ pressed }) => ({
                  width: '22%', flex: 1, paddingVertical: S.md, borderRadius: R.lg, alignItems: 'center',
                  backgroundColor: `${C.red}15`, borderWidth: 1.5, borderColor: `${C.red}40`,
                  opacity: pressed ? 0.75 : 1,
                })}>
                <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.red }}>{w.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => wicketSheetRef.current?.close()}
            style={{ marginTop: S.md, paddingVertical: S.md, borderRadius: R.lg, alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.textSub }}>Cancel</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}
