import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { searchApi } from '@/lib/api';
import { useSearchStore } from '@/stores/searchStore';
import { SearchResult, SearchEntityType } from '@cricket-os/shared';
import { C, F, R, S } from '@/lib/theme';

function useT() { return C; }

const TYPE_LABEL: Record<SearchEntityType, string> = {
  PLAYER: 'Player', TEAM: 'Team', LEAGUE: 'League', MATCH: 'Match',
};
const TYPE_EMOJI: Record<SearchEntityType, string> = {
  PLAYER: '🏏', TEAM: '👥', LEAGUE: '🏆', MATCH: '⚡',
};

const QUICK_ACTIONS = [
  { label: 'New Match', emoji: '🏏', route: '/match/new' },
  { label: 'All Leagues', emoji: '🏆', route: '/(tabs)/leagues' },
];

function SearchResultRow({ result, isRecent, onPress, t }: {
  result: SearchResult; isRecent: boolean; onPress: () => void; t: any;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      flexDirection: 'row', alignItems: 'center', gap: S.md,
      paddingHorizontal: S.xl, paddingVertical: 13,
      backgroundColor: pressed ? t.cardHover : 'transparent',
    })}>
      <View style={{ width: 42, height: 42, borderRadius: R.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: t.card, borderWidth: 1, borderColor: t.border }}>
        <Text style={{ fontSize: 18 }}>{isRecent ? '🕐' : TYPE_EMOJI[result.type]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.text }} numberOfLines={1}>{result.title}</Text>
        {result.subtitle && (
          <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textSub, marginTop: 1 }} numberOfLines={1}>{result.subtitle}</Text>
        )}
      </View>
      <View style={{ backgroundColor: t.card, borderRadius: R.sm, paddingHorizontal: S.sm, paddingVertical: 3, borderWidth: 1, borderColor: t.border }}>
        <Text style={{ fontFamily: F.medium, fontSize: 11, color: C.textSub }}>{TYPE_LABEL[result.type]}</Text>
      </View>
    </Pressable>
  );
}

export function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const inputRef = useRef<TextInput>(null);
  const { recentSearches, addRecentSearch } = useSearchStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Slight delay to let tab animation settle before focusing
    const timer = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);

  const doSearch = useCallback((q: string) => {
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); return; }
    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await searchApi.search(q);
        setResults(data.data ?? []);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 220);
  }, []);

  function handleChange(text: string) {
    setQuery(text);
    doSearch(text);
  }

  function navigate(result: SearchResult) {
    addRecentSearch(result);
    searchApi.saveRecent({ query: result.title, resultId: result.id, resultType: result.type }).catch(() => {});
    router.push(result.href as any);
  }

  const hasQuery = query.trim().length > 0;
  const displayItems = hasQuery ? results : recentSearches;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Search bar */}
      <View style={{ paddingTop: insets.top + 12, paddingBottom: S.md, paddingHorizontal: S.xl, borderBottomWidth: 1, borderBottomColor: t.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: t.card, borderRadius: R.xl, borderWidth: 1.5, borderColor: t.border, paddingHorizontal: S.lg, paddingVertical: 12 }}>
          <Text style={{ fontSize: 16, color: C.textMuted }}>🔍</Text>
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={handleChange}
            placeholder="Players, teams, leagues, matches…"
            placeholderTextColor={C.textMuted}
            style={{ flex: 1, fontSize: 15, fontFamily: F.reg, color: C.text }}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
          />
          {hasQuery ? (
            <Pressable onPress={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }} style={{ padding: 2 }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: C.textMuted, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 11, color: t.bg, fontFamily: F.bold, lineHeight: 14 }}>✕</Text>
              </View>
            </Pressable>
          ) : (
            <Pressable onPress={() => Keyboard.dismiss()}>
              <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.textMuted }}>Done</Text>
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        data={displayItems}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={item => item.id}
        ListHeaderComponent={(
          <View>
            {/* Section label */}
            {!hasQuery && recentSearches.length > 0 && (
              <Text style={{ paddingHorizontal: S.xl, paddingTop: S.lg, paddingBottom: S.sm, fontFamily: F.semi, fontSize: 11, color: C.textMuted, letterSpacing: 1 }}>RECENT</Text>
            )}
            {/* Loading state */}
            {hasQuery && isLoading && (
              <View style={{ paddingTop: 48, alignItems: 'center' }}>
                <ActivityIndicator color={C.blue} />
              </View>
            )}
            {/* No results */}
            {hasQuery && !isLoading && results.length === 0 && (
              <View style={{ paddingTop: 64, alignItems: 'center' }}>
                <Text style={{ fontSize: 32, marginBottom: S.md }}>🔍</Text>
                <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.text }}>No results for "{query}"</Text>
                <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textSub, marginTop: S.sm }}>Try a player, team or league name</Text>
              </View>
            )}
            {/* Results header */}
            {hasQuery && !isLoading && results.length > 0 && (
              <Text style={{ paddingHorizontal: S.xl, paddingTop: S.lg, paddingBottom: S.sm, fontFamily: F.semi, fontSize: 11, color: C.textMuted, letterSpacing: 1 }}>
                RESULTS  ·  {results.length}
              </Text>
            )}
          </View>
        )}
        renderItem={({ item }) => (
          <SearchResultRow result={item} isRecent={!hasQuery} onPress={() => navigate(item)} t={t} />
        )}
        ListEmptyComponent={
          !hasQuery ? (
            <View style={{ paddingHorizontal: S.xl, paddingTop: S.lg }}>
              {recentSearches.length === 0 && (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Text style={{ fontSize: 36, marginBottom: S.md }}>🔍</Text>
                  <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.text }}>Search anything</Text>
                  <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textSub, marginTop: S.sm }}>Players, teams, leagues, matches</Text>
                </View>
              )}
            </View>
          ) : null
        }
        ListFooterComponent={
          !hasQuery ? (
            <View style={{ paddingTop: S.md }}>
              <Text style={{ paddingHorizontal: S.xl, paddingTop: S.lg, paddingBottom: S.sm, fontFamily: F.semi, fontSize: 11, color: C.textMuted, letterSpacing: 1 }}>QUICK ACTIONS</Text>
              {QUICK_ACTIONS.map(action => (
                <Pressable
                  key={action.route}
                  onPress={() => router.push(action.route as any)}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: S.md,
                    paddingHorizontal: S.xl, paddingVertical: 13,
                    backgroundColor: pressed ? t.cardHover : 'transparent',
                  })}
                >
                  <View style={{ width: 42, height: 42, borderRadius: R.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: t.card, borderWidth: 1, borderColor: t.border }}>
                    <Text style={{ fontSize: 18 }}>{action.emoji}</Text>
                  </View>
                  <Text style={{ flex: 1, fontFamily: F.medium, fontSize: 15, color: C.text }}>{action.label}</Text>
                  <Text style={{ fontSize: 16, color: C.textMuted }}>›</Text>
                </Pressable>
              ))}
            </View>
          ) : null
        }
      />
    </View>
  );
}
