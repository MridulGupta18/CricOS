import { useState } from 'react';
import {
  View, Text, Pressable, FlatList, TextInput, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useRegionStore } from '@/stores/regionStore';
import { C, F, R, S } from '@/lib/theme';

// Popular cricket cities — easily extended
const POPULAR_CITIES = [
  // Canada
  'Calgary', 'Toronto', 'Vancouver', 'Edmonton', 'Brampton', 'Mississauga',
  'Ottawa', 'Surrey', 'Montreal', 'Winnipeg',
  // India
  'Mumbai', 'Delhi', 'Bengaluru', 'Chennai', 'Kolkata', 'Hyderabad',
  'Pune', 'Ahmedabad', 'Jaipur', 'Chandigarh',
  // Other
  'London', 'Melbourne', 'Sydney', 'Dubai', 'Karachi', 'Lahore',
  'Colombo', 'Dhaka', 'Auckland', 'Cape Town',
];

export function RegionPickerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { city: selected, setCity } = useRegionStore();
  const [search, setSearch] = useState('');

  const filtered = POPULAR_CITIES.filter(c =>
    !search.trim() || c.toLowerCase().includes(search.toLowerCase())
  );

  function pick(city: string | null) {
    setCity(city);
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.xl, gap: S.md }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={{ fontFamily: F.reg, fontSize: 22, color: C.textSub }}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.text }}>Your Region</Text>
            <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>
              Filters leagues, matches, and players near you
            </Text>
          </View>
        </View>

        {/* Search */}
        <View style={{ paddingHorizontal: S.xl, paddingBottom: S.sm }}>
          <View style={{ backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg }}>
            <Text style={{ fontSize: 15, color: C.textMuted, marginRight: S.sm }}>⌕</Text>
            <TextInput
              value={search} onChangeText={setSearch}
              placeholder="Search city..." placeholderTextColor={C.textMuted}
              style={{ flex: 1, fontFamily: F.reg, fontSize: 14, color: C.text, paddingVertical: 10 }}
              autoFocus autoCapitalize="words"
            />
          </View>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item}
        contentContainerStyle={{ paddingHorizontal: S.xl, paddingBottom: insets.bottom + 40, paddingTop: S.md }}
        ListHeaderComponent={
          <>
            {/* All Regions option */}
            <Pressable
              onPress={() => pick(null)}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: pressed ? C.cardHover : selected === null ? `${C.primary}18` : C.card,
                borderWidth: 1.5, borderColor: selected === null ? C.primary : C.border,
                borderRadius: R.lg, paddingVertical: S.lg, paddingHorizontal: S.lg, marginBottom: S.sm,
              })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
                <Text style={{ fontSize: 22 }}>🌍</Text>
                <View>
                  <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.text }}>All Regions</Text>
                  <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted }}>Show cricket from everywhere</Text>
                </View>
              </View>
              {selected === null && <Text style={{ color: C.primary, fontSize: 18 }}>✓</Text>}
            </Pressable>

            <Text style={{ fontFamily: F.semi, fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: S.sm, marginTop: S.sm }}>
              Popular Cities
            </Text>
          </>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => pick(item)}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: pressed ? C.cardHover : selected === item ? `${C.primary}18` : C.card,
              borderWidth: 1.5, borderColor: selected === item ? C.primary : C.border,
              borderRadius: R.lg, paddingVertical: 14, paddingHorizontal: S.lg, marginBottom: S.sm,
            })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
              <Text style={{ fontSize: 16 }}>📍</Text>
              <Text style={{ fontFamily: selected === item ? F.bold : F.reg, fontSize: 15, color: C.text }}>{item}</Text>
            </View>
            {selected === item && <Text style={{ color: C.primary, fontSize: 18 }}>✓</Text>}
          </Pressable>
        )}
        ListFooterComponent={
          search.trim() && !filtered.includes(search.trim()) ? (
            <Pressable
              onPress={() => pick(search.trim())}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: S.md,
                backgroundColor: pressed ? C.cardHover : C.card,
                borderWidth: 1, borderColor: C.border, borderRadius: R.lg,
                paddingVertical: 14, paddingHorizontal: S.lg, marginTop: S.sm,
              })}>
              <Text style={{ fontSize: 16 }}>➕</Text>
              <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.primaryLight }}>
                Use "{search.trim()}"
              </Text>
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}
