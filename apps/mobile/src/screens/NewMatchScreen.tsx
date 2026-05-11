import { useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable,
  KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import BottomSheet, { BottomSheetFlatList, BottomSheetView } from '@gorhom/bottom-sheet';
import { useQuery } from '@tanstack/react-query';
import { matchesApi, teamsApi, searchApi } from '@/lib/api';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { C, F, R, S } from '@/lib/theme';

type Format = 'T20' | 'ODI' | 'T10' | 'CUSTOM';

const FORMATS: { value: Format; overs: number; label: string }[] = [
  { value: 'T10', overs: 10,  label: 'T10' },
  { value: 'T20', overs: 20,  label: 'T20' },
  { value: 'ODI', overs: 50,  label: 'ODI' },
  { value: 'CUSTOM', overs: 20, label: 'Custom' },
];

function FieldLabel({ label }: { label: string }) {
  return <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.textSub, letterSpacing: 0.8, marginBottom: S.sm }}>{label}</Text>;
}

// Reusable team picker card
function TeamCard({ team, onPress, onClear }: { team: any | null; onPress: () => void; onClear: () => void }) {
  if (team) {
    return (
      <Pressable onPress={onPress}
        style={{ backgroundColor: C.card2, borderWidth: 1.5, borderColor: C.green + '60', borderRadius: R.lg, padding: S.lg, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 40, height: 40, borderRadius: R.md, backgroundColor: C.primary + '33', alignItems: 'center', justifyContent: 'center', marginRight: S.md }}>
          <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.primaryLight }}>{team.shortName?.slice(0, 3)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.text }}>{team.name}</Text>
          {team.city ? <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>📍 {team.city}</Text> : null}
        </View>
        <Pressable onPress={onClear} hitSlop={10}
          style={{ backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: R.full, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.red }}>✕</Text>
        </Pressable>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress}
      style={{ backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, borderRadius: R.lg, padding: S.lg, flexDirection: 'row', alignItems: 'center', gap: S.md }}>
      <View style={{ width: 40, height: 40, borderRadius: R.md, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 18, color: C.textMuted }}>🔍</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.textSub }}>Search & select team</Text>
        <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>Tap to search your teams</Text>
      </View>
      <Text style={{ fontFamily: F.reg, fontSize: 18, color: C.textMuted }}>›</Text>
    </Pressable>
  );
}

export function NewMatchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useRequireAuth();

  const [homeTeam, setHomeTeam] = useState<any>(null);
  const [awayTeam, setAwayTeam] = useState<any>(null);
  const [venue, setVenue]       = useState('');
  const [format, setFormat]     = useState<Format>('T20');
  const [overs, setOvers]       = useState('20');
  const [isLoading, setIsLoading] = useState(false);
  const [pickerFor, setPickerFor] = useState<'home' | 'away' | null>(null);
  const [teamSearch, setTeamSearch] = useState('');

  const pickerRef = useRef<BottomSheet>(null);

  const { data: searchData, isLoading: searching } = useQuery({
    queryKey: ['teamSearch', teamSearch],
    queryFn: () => searchApi.search(teamSearch, { type: 'TEAM' }),
    enabled: teamSearch.length >= 1,
    staleTime: 5_000,
  });

  const searchResults: any[] = searchData?.data?.data ?? [];

  function openPicker(side: 'home' | 'away') {
    setPickerFor(side);
    setTeamSearch('');
    pickerRef.current?.expand();
  }

  function selectTeam(team: any) {
    if (pickerFor === 'home') setHomeTeam(team);
    else setAwayTeam(team);
    pickerRef.current?.close();
    setPickerFor(null);
  }

  async function create() {
    if (!homeTeam || !awayTeam) {
      Toast.show({ type: 'error', text1: 'Select both teams' });
      return;
    }
    if (homeTeam.id === awayTeam.id) {
      Toast.show({ type: 'error', text1: 'Home and away teams must be different' });
      return;
    }
    setIsLoading(true);
    try {
      const { data } = await matchesApi.create({
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        venue: venue.trim() || undefined,
        format,
        overs: parseInt(overs) || 20,
        isPublic: true,
      });
      Toast.show({ type: 'success', text1: 'Match created!' });
      router.replace(`/match/${data.data.id}`);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.response?.data?.error?.message ?? 'Failed to create match' });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: S.xl, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={{ paddingTop: insets.top + 12, marginBottom: S.xxl }}>
            <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: S.lg }}>
              <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.blue }}>‹  Back</Text>
            </Pressable>
            <Text style={{ fontFamily: F.bold, fontSize: 26, color: C.text }}>New Match</Text>
            <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textSub, marginTop: 2 }}>Set up a match to start scoring</Text>
          </View>

          {/* Format */}
          <View style={{ marginBottom: S.xl }}>
            <FieldLabel label="FORMAT" />
            <View style={{ flexDirection: 'row', gap: S.sm }}>
              {FORMATS.map(f => (
                <Pressable key={f.value}
                  onPress={() => { setFormat(f.value); if (f.value !== 'CUSTOM') setOvers(String(f.overs)); }}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: R.lg, alignItems: 'center', backgroundColor: format === f.value ? C.blue : C.card, borderWidth: 1.5, borderColor: format === f.value ? C.blue : C.border }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 14, color: format === f.value ? '#fff' : C.textSub }}>{f.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {format === 'CUSTOM' && (
            <View style={{ marginBottom: S.xl }}>
              <FieldLabel label="OVERS PER SIDE" />
              <TextInput
                value={overs} onChangeText={setOvers}
                keyboardType="numeric" placeholder="20"
                placeholderTextColor={C.textMuted}
                style={{ backgroundColor: C.card, borderColor: C.border, borderWidth: 1.5, borderRadius: R.lg, paddingHorizontal: S.lg, paddingVertical: 13, fontSize: 15, fontFamily: F.reg, color: C.text }}
              />
            </View>
          )}

          {/* Home Team */}
          <View style={{ marginBottom: S.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.sm }}>
              <FieldLabel label="HOME TEAM" />
              <Pressable onPress={() => router.push('/team/create')} hitSlop={8}>
                <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.primary }}>+ New Team</Text>
              </Pressable>
            </View>
            <TeamCard team={homeTeam} onPress={() => openPicker('home')} onClear={() => setHomeTeam(null)} />
          </View>

          {/* Away Team */}
          <View style={{ marginBottom: S.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.sm }}>
              <FieldLabel label="AWAY TEAM" />
              <Pressable onPress={() => router.push('/team/create')} hitSlop={8}>
                <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.primary }}>+ New Team</Text>
              </Pressable>
            </View>
            <TeamCard team={awayTeam} onPress={() => openPicker('away')} onClear={() => setAwayTeam(null)} />
          </View>

          {/* Venue */}
          <View style={{ marginBottom: S.xxl }}>
            <FieldLabel label="VENUE (OPTIONAL)" />
            <TextInput
              value={venue} onChangeText={setVenue}
              placeholder="Stadium or ground name"
              placeholderTextColor={C.textMuted}
              style={{ backgroundColor: C.card, borderColor: C.border, borderWidth: 1.5, borderRadius: R.lg, paddingHorizontal: S.lg, paddingVertical: 13, fontSize: 15, fontFamily: F.reg, color: C.text }}
            />
          </View>

          {/* Create button */}
          <Pressable onPress={create} disabled={isLoading || !homeTeam || !awayTeam}
            style={({ pressed }) => ({ backgroundColor: C.blue, borderRadius: R.lg, paddingVertical: 16, alignItems: 'center', opacity: pressed || isLoading || !homeTeam || !awayTeam ? 0.6 : 1, elevation: 4 })}>
            {isLoading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ fontFamily: F.bold, fontSize: 16, color: '#fff' }}>Create Match</Text>
            }
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Team picker bottom sheet */}
      <BottomSheet ref={pickerRef} index={-1} snapPoints={['70%']} enablePanDownToClose
        backgroundStyle={{ backgroundColor: '#121826' }} handleIndicatorStyle={{ backgroundColor: C.border }}>
        <BottomSheetView style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.text, paddingHorizontal: S.xl, paddingTop: S.md, paddingBottom: S.sm }}>
            Select {pickerFor === 'home' ? 'Home' : 'Away'} Team
          </Text>
          {/* Search input */}
          <View style={{ paddingHorizontal: S.xl, paddingBottom: S.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingHorizontal: S.md, gap: S.sm }}>
              <Text style={{ fontSize: 16, color: C.textMuted }}>⌕</Text>
              <TextInput
                value={teamSearch} onChangeText={setTeamSearch}
                placeholder="Search teams by name..."
                placeholderTextColor={C.textMuted} autoFocus
                style={{ flex: 1, fontFamily: F.reg, fontSize: 14, color: C.text, paddingVertical: 11 }}
                autoCapitalize="none"
              />
              {searching && <ActivityIndicator size="small" color={C.primary} />}
            </View>
          </View>

          <BottomSheetFlatList
            data={searchResults}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={{ paddingHorizontal: S.xl, paddingBottom: 40, gap: S.sm }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textMuted }}>
                  {teamSearch.length < 1 ? 'Type to search teams' : 'No teams found'}
                </Text>
                <Pressable onPress={() => { pickerRef.current?.close(); router.push('/team/create'); }}
                  style={{ marginTop: S.lg, paddingHorizontal: S.xl, paddingVertical: 10, borderRadius: R.lg, backgroundColor: C.primary + '22', borderWidth: 1, borderColor: C.primary + '44' }}>
                  <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.primaryLight }}>+ Create New Team</Text>
                </Pressable>
              </View>
            }
            renderItem={({ item }: { item: any }) => (
              <Pressable onPress={() => selectTeam(item)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md, borderRadius: R.lg, backgroundColor: pressed ? C.cardHover : C.card, borderWidth: 1, borderColor: C.border })}>
                <View style={{ width: 40, height: 40, borderRadius: R.md, backgroundColor: C.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.primaryLight }}>{item.subtitle?.slice(0, 3) ?? item.title?.slice(0, 3)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.text }}>{item.title}</Text>
                  {item.subtitle ? <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>{item.subtitle}</Text> : null}
                </View>
              </Pressable>
            )}
          />
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}
