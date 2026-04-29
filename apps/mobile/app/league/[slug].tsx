import { useLocalSearchParams } from 'expo-router';
import { LeagueDashboardScreen } from '@/screens/LeagueDashboardScreen';

export default function LeaguePage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <LeagueDashboardScreen slug={slug} />;
}
