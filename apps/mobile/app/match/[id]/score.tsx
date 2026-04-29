import { useLocalSearchParams } from 'expo-router';
import { ScorerScreen } from '@/screens/ScorerScreen';

export default function ScorerPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ScorerScreen matchId={id} />;
}
