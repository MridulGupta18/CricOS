import { useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { matchesApi, teamsApi } from '@/lib/api';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { C, F, R, S } from '@/lib/theme';

function useT() { return C; }

type Format = 'T20' | 'ODI' | 'T10' | 'CUSTOM';

const FORMATS: { value: Format; overs: number; label: string }[] = [
  { value: 'T10', overs: 10, label: 'T10' },
  { value: 'T20', overs: 20, label: 'T20' },
  { value: 'ODI', overs: 50, label: 'ODI' },
  { value: 'CUSTOM', overs: 20, label: 'Custom' },
];

function FieldLabel({ label }: { label: string }) {
  return <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.textSub, letterSpacing: 0.8, marginBottom: S.sm }}>{label}</Text>;
}

export function NewMatchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  useRequireAuth();

  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [homeTeamName, setHomeTeamName] = useState('');
  const [awayTeamName, setAwayTeamName] = useState('');
  const [venue, setVenue] = useState('');
  const [format, setFormat] = useState<Format>('T20');
  const [overs, setOvers] = useState('20');
  const [isLoading, setIsLoading] = useState(false);
  const [lookingUp, setLookingUp] = useState<'home' | 'away' | null>(null);

  async function lookupTeam(id: string, side: 'home' | 'away') {
    const trimmed = id.trim();
    if (!trimmed) return;
    setLookingUp(side);
    try {
      const { data } = await teamsApi.get(trimmed);
      const name = data.data.name;
      if (side === 'home') setHomeTeamName(name);
      else setAwayTeamName(name);
    } catch {
      if (side === 'home') setHomeTeamName('');
      else setAwayTeamName('');
    } finally {
      setLookingUp(null);
    }
  }

  const inputStyle = {
    backgroundColor: t.card, borderColor: t.border,
    borderWidth: 1.5, borderRadius: R.lg,
    paddingHorizontal: S.lg, paddingVertical: 13,
    fontSize: 15, fontFamily: F.reg, color: C.text,
  };

  async function create() {
    if (!homeTeamId.trim() || !awayTeamId.trim()) {
      Toast.show({ type: 'error', text1: 'Enter both team IDs' });
      return;
    }
    setIsLoading(true);
    try {
      const { data } = await matchesApi.create({
        homeTeamId: homeTeamId.trim(),
        awayTeamId: awayTeamId.trim(),
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
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={t.bg} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: S.xl, paddingBottom: insets.bottom + 32 }}
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
                <Pressable
                  key={f.value}
                  onPress={() => { setFormat(f.value); if (f.value !== 'CUSTOM') setOvers(String(f.overs)); }}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: R.lg, alignItems: 'center', backgroundColor: format === f.value ? C.blue : t.card, borderWidth: 1.5, borderColor: format === f.value ? C.blue : t.border }}
                >
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
                placeholderTextColor={C.textMuted} style={inputStyle}
              />
            </View>
          )}

          {/* Team IDs */}
          <View style={{ marginBottom: S.xl }}>
            <FieldLabel label="HOME TEAM ID" />
            <TextInput
              value={homeTeamId}
              onChangeText={(v) => { setHomeTeamId(v); setHomeTeamName(''); }}
              onBlur={() => lookupTeam(homeTeamId, 'home')}
              placeholder="Paste team ID"
              placeholderTextColor={C.textMuted} autoCapitalize="none"
              style={inputStyle}
            />
            {lookingUp === 'home' && <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textSub, marginTop: 4 }}>Looking up...</Text>}
            {homeTeamName ? <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.green, marginTop: 4 }}>✓ {homeTeamName}</Text> : null}
          </View>

          <View style={{ marginBottom: S.xl }}>
            <FieldLabel label="AWAY TEAM ID" />
            <TextInput
              value={awayTeamId}
              onChangeText={(v) => { setAwayTeamId(v); setAwayTeamName(''); }}
              onBlur={() => lookupTeam(awayTeamId, 'away')}
              placeholder="Paste team ID"
              placeholderTextColor={C.textMuted} autoCapitalize="none"
              style={inputStyle}
            />
            {lookingUp === 'away' && <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textSub, marginTop: 4 }}>Looking up...</Text>}
            {awayTeamName ? <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.green, marginTop: 4 }}>✓ {awayTeamName}</Text> : null}
          </View>

          <View style={{ marginBottom: S.xxl }}>
            <FieldLabel label="VENUE (OPTIONAL)" />
            <TextInput
              value={venue} onChangeText={setVenue}
              placeholder="Stadium or ground name"
              placeholderTextColor={C.textMuted}
              style={inputStyle}
            />
          </View>

          {/* Create button */}
          <Pressable
            onPress={create}
            disabled={isLoading}
            style={({ pressed }) => ({ backgroundColor: C.blue, borderRadius: R.lg, paddingVertical: 16, alignItems: 'center', opacity: pressed || isLoading ? 0.85 : 1, shadowColor: C.blue, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 })}
          >
            {isLoading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ fontFamily: F.bold, fontSize: 16, color: '#fff' }}>Create Match</Text>
            }
          </Pressable>

          <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted, textAlign: 'center', marginTop: S.lg }}>
            💡 Find team IDs via the Players tab or Search
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
