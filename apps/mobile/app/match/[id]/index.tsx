import { useLocalSearchParams } from 'expo-router';
import { MatchDetailScreen } from '@/screens/MatchDetailScreen';

export default function MatchDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MatchDetailScreen matchId={id} />;
}
