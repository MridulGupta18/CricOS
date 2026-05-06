import { useRef } from 'react';
import { View, Text, Share, Pressable, Alert } from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import { InningsState } from '@cricket-os/shared';
import { formatOvers } from '@cricket-os/scoring-engine';
import { C, F, R, S } from '@/lib/theme';

interface Props {
  match: any;
  inningsStates: InningsState[];
  playerById: (id: string) => string;
}

export function useScorecardShare({ match, inningsStates, playerById }: Props) {
  const shotRef = useRef<ViewShot>(null);

  async function shareAsImage() {
    try {
      const uri = await shotRef.current?.capture?.();
      if (!uri) { shareAsText(); return; }

      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert('Saved', 'Scorecard saved to your photo library.');
      }
      await Share.share({ url: uri, message: `${match.homeTeam?.shortName} vs ${match.awayTeam?.shortName} — CricOS Scorecard` });
    } catch {
      shareAsText();
    }
  }

  function shareAsText() {
    const lines: string[] = [
      `🏏 ${match.homeTeam?.name} vs ${match.awayTeam?.name}`,
      match.venue ? `📍 ${match.venue}` : '',
      '',
    ];
    for (const inn of inningsStates) {
      const team = inn.battingTeamId === match.homeTeam?.id ? match.homeTeam?.shortName : match.awayTeam?.shortName;
      lines.push(`${team}: ${inn.totalRuns}/${inn.totalWickets} (${formatOvers(inn.totalOvers)} ov)`);
      // Top batsmen
      const top = [...inn.batsmen].sort((a, b) => b.runs - a.runs).slice(0, 3);
      for (const b of top) lines.push(`  ${playerById(b.playerId)} ${b.runs} (${b.ballsFaced})`);
      // Top bowlers
      const topBowl = [...inn.bowlers].sort((a, b) => b.wickets - a.wickets || a.runs - b.runs).slice(0, 2);
      for (const b of topBowl) lines.push(`  ${playerById(b.playerId)} ${b.wickets}/${b.runs} (${formatOvers(b.overs)} ov)`);
      lines.push('');
    }
    if (match.winnerId) {
      const winner = match.winnerId === match.homeTeam?.id ? match.homeTeam?.shortName : match.awayTeam?.shortName;
      lines.push(`✅ ${winner} won`);
    }
    lines.push('', 'Scored with CricOS 🏏');
    Share.share({ message: lines.filter(l => l !== undefined).join('\n') });
  }

  return { shotRef, shareAsImage, shareAsText };
}

// Shareable card component — wrap around any content to enable screenshot
export function ScorecardShareWrapper({ children, shotRef }: { children: React.ReactNode; shotRef: React.RefObject<ViewShot> }) {
  return (
    <ViewShot ref={shotRef} options={{ format: 'jpg', quality: 0.95 }}>
      {children}
    </ViewShot>
  );
}
