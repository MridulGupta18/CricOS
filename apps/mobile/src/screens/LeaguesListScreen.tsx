import { useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, StatusBar, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { leaguesApi } from '@/lib/api';
import { C, F, R, S } from '@/lib/theme';

function useT() { return C; }

// Underline tab style matching design
function TabBar({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border }}>
      {tabs.map(t => (
        <Pressable key={t.id} onPress={() => onChange(t.id)}
          style={{ paddingVertical: 12, paddingHorizontal: S.lg, borderBottomWidth: 2, borderBottomColor: active === t.id ? C.primary : 'transparent', marginBottom: -1 }}>
          <Text style={{ fontFamily: active === t.id ? F.bold : F.medium, fontSize: 13, color: active === t.id ? C.primaryLight : C.textSub }}>
            {t.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// Gradient icon square matching design
function LeagueIcon({ size = 48, emoji = '🏆' }: { size?: number; emoji?: string }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: 14,
      backgroundColor: C.primary,
      alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <Text style={{ fontSize: size * 0.45 }}>{emoji}</Text>
    </View>
  );
}

function ActiveBadge() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.red }} />
      <Text style={{ fontFamily: F.bold, fontSize: 10, color: C.red, letterSpacing: 0.5 }}>Active</Text>
    </View>
  );
}

function LeagueRow({ league, onPress }: { league: any; onPress: () => void }) {
  const isActive = league.status === 'ONGOING' || league.status === 'REGISTRATION_OPEN';
  const teamCount = league._count?.teams ?? league.teams?.length ?? 0;
  const matchCount = league._count?.matches ?? 0;

  return (
    <Pressable onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? C.cardHover : C.card,
        borderRadius: R.xl, borderWidth: 1, borderColor: C.border,
        padding: S.lg, marginBottom: S.sm,
        flexDirection: 'row', alignItems: 'center', gap: S.lg,
      })}>
      <LeagueIcon size={48} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, marginBottom: 3, flexWrap: 'wrap' }}>
          <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.text }} numberOfLines={1}>{league.name}</Text>
          {isActive && <ActiveBadge />}
        </View>
        <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted }}>
          {teamCount} teams · {matchCount || '—'} matches · {league.format ?? 'T20'}
        </Text>
        {league.city && (
          <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted, marginTop: 2 }}>
            📍 {league.city}{league.country ? `, ${league.country}` : ''}
          </Text>
        )}
      </View>
      <Text style={{ fontFamily: F.reg, fontSize: 18, color: C.textMuted }}>›</Text>
    </Pressable>
  );
}

export function LeaguesListScreen() {
  const t = useT(); const router = useRouter(); const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const { data, isLoading, refetch } = useQuery({ queryKey: ['leagues'], queryFn: () => leaguesApi.list() });
  const leagues: any[] = data?.data?.data ?? [];

  const types = [
    { id: 'all', label: 'All' },
    { id: 'T20', label: 'T20' },
    { id: 'ODI', label: 'ODI' },
  ];

  const filtered = leagues
    .filter(l => filter === 'all' || l.format === filter)
    .filter(l => !q || l.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={t.bg} />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: S.xl, paddingBottom: S.sm, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.md }}>
          <Text style={{ fontFamily: F.bold, fontSize: 22, color: C.text }}>Leagues</Text>
          <View style={{ flexDirection: 'row', gap: S.sm, alignItems: 'center' }}>
            <Pressable onPress={() => router.push('/league/create')}
              style={{ backgroundColor: C.primary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 7 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 12, color: '#fff' }}>+ Create</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/search')} style={{ padding: S.sm }}>
              <Text style={{ fontSize: 18, color: C.textSub }}>⌕</Text>
            </Pressable>
          </View>
        </View>

        {/* Search input */}
        <View style={{ backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, marginBottom: S.sm, marginTop: S.sm }}>
          <Text style={{ color: C.textMuted, marginRight: S.sm, fontSize: 14 }}>⌕</Text>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search leagues…"
            placeholderTextColor={C.textMuted}
            style={{ flex: 1, fontFamily: F.reg, fontSize: 14, color: C.text, paddingVertical: 9 }}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        {/* Format filter tabs */}
        <TabBar tabs={types} active={filter} onChange={setFilter} />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.primary} />}
        ListHeaderComponent={
          <View style={{ paddingTop: S.sm, paddingBottom: S.xs }}>
            <Text style={{ fontFamily: F.semi, fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.7 }}>
              All Leagues
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingHorizontal: S.xl, paddingBottom: insets.bottom + 80, paddingTop: S.md }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: S.xxl }}>
            <Text style={{ fontSize: 48, marginBottom: S.lg }}>🏆</Text>
            <Text style={{ fontFamily: F.bold, fontSize: 20, color: C.text, marginBottom: S.sm }}>No leagues yet</Text>
            <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.textSub, textAlign: 'center', marginBottom: S.xxl }}>
              Create a league to manage teams, fixtures, standings and results.
            </Text>
            <Pressable onPress={() => router.push('/league/create')}
              style={({ pressed }) => ({ backgroundColor: C.primary, borderRadius: R.lg, paddingHorizontal: S.xxl, paddingVertical: 14, opacity: pressed ? 0.85 : 1 })}>
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: '#fff' }}>+ Create League</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <LeagueRow league={item} onPress={() => router.push(`/league/${item.slug}`)} />
        )}
      />
    </View>
  );
}
