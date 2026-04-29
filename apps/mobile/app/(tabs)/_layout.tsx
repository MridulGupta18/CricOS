import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { C, F } from '@/lib/theme';

// Crisp emoji icons that render well on Android
const ICONS: Record<string, string> = {
  index:   '🧭',
  matches: '🏏',
  leagues: '🏆',
  players: '👥',
  profile: '👤',
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 20, lineHeight: 24, opacity: focused ? 1 : 0.45 }}>
      {ICONS[name] ?? '●'}
    </Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.card,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: C.primaryLight,
        tabBarInactiveTintColor: C.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontFamily: 'Inter_500Medium', letterSpacing: 0.2 },
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
      })}
    >
      <Tabs.Screen name="index"   options={{ title: 'Explore' }} />
      <Tabs.Screen name="matches" options={{ title: 'Matches' }} />
      <Tabs.Screen name="leagues" options={{ title: 'Leagues' }} />
      <Tabs.Screen name="players" options={{ title: 'Players' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="search"  options={{ href: null }} />
    </Tabs>
  );
}
