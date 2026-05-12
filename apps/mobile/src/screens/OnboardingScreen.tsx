import { useRef, useState, useEffect } from 'react';
import { View, Text, Pressable, StatusBar, Dimensions, FlatList, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, S } from '@/lib/theme';

const { width: W } = Dimensions.get('window');

const SLIDES = [
  {
    emoji: '🏏',
    title: 'Score Cricket\nLive',
    body: 'Ball-by-ball scoring with real-time updates. Wickets, extras, free hits — everything tracked automatically.',
    bg: 'rgba(99,102,241,0.08)',
    accent: C.primaryLight,
  },
  {
    emoji: '🏆',
    title: 'Run Your\nLeague',
    body: 'Create tournaments, manage teams, track standings and NRR. Your league, your rules.',
    bg: 'rgba(16,185,129,0.08)',
    accent: C.green,
  },
  {
    emoji: '📊',
    title: 'Track Every\nStat',
    body: 'Career batting averages, economy rates, partnerships. Every ball feeds into live player stats.',
    bg: 'rgba(245,158,11,0.08)',
    accent: C.orange,
  },
];

export function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState(0);
  const listRef = useRef<FlatList>(null);

  // Animated values for each dot — drive width/opacity with Animated.Value
  const dotAnims = useRef(SLIDES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;

  useEffect(() => {
    dotAnims.forEach((anim, i) => {
      Animated.spring(anim, { toValue: i === active ? 1 : 0, useNativeDriver: false }).start();
    });
  }, [active]);

  function next() {
    if (active < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: active + 1, animated: true });
      setActive(active + 1);
    } else {
      router.replace('/auth/register');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Skip → register (not login) so new users land on the right screen */}
      <View style={{ position: 'absolute', top: insets.top + 12, right: S.xl, zIndex: 10 }}>
        <Pressable onPress={() => router.replace('/auth/register')} hitSlop={16}>
          <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.textMuted }}>Skip</Text>
        </Pressable>
      </View>

      {/* Slides */}
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / W);
          setActive(idx);
        }}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={{ width: W, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.xl + 8 }}>
            <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: item.bg, alignItems: 'center', justifyContent: 'center', marginBottom: 40, borderWidth: 1, borderColor: item.accent + '30' }}>
              <Text style={{ fontSize: 56 }}>{item.emoji}</Text>
            </View>
            <Text style={{ fontFamily: F.bold, fontSize: 36, color: C.text, textAlign: 'center', lineHeight: 42, marginBottom: S.lg }}>
              {item.title}
            </Text>
            <Text style={{ fontFamily: F.reg, fontSize: 16, color: C.textSub, textAlign: 'center', lineHeight: 24, maxWidth: 300 }}>
              {item.body}
            </Text>
          </View>
        )}
      />

      {/* Animated dots */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: S.xl }}>
        {SLIDES.map((_, i) => (
          <Animated.View key={i} style={{
            height: 6, borderRadius: 3,
            backgroundColor: i === active ? C.primaryLight : C.border,
            width: dotAnims[i].interpolate({ inputRange: [0, 1], outputRange: [6, 22] }),
          }} />
        ))}
      </View>

      {/* CTAs */}
      <View style={{ paddingHorizontal: S.xl, paddingBottom: insets.bottom + S.lg, gap: S.sm }}>
        <Pressable onPress={next}
          style={({ pressed }) => ({ backgroundColor: C.primary, borderRadius: R.lg, paddingVertical: 16, alignItems: 'center', opacity: pressed ? 0.85 : 1 })}>
          <Text style={{ fontFamily: F.bold, fontSize: 16, color: '#fff' }}>
            {active === SLIDES.length - 1 ? 'Get Started' : 'Next'}
          </Text>
        </Pressable>
        {active === SLIDES.length - 1 && (
          <Pressable onPress={() => router.replace('/auth/register')}
            style={({ pressed }) => ({ backgroundColor: C.card, borderRadius: R.lg, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: C.border, opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ fontFamily: F.semi, fontSize: 16, color: C.text }}>Create Account</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
