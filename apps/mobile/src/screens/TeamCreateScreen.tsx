import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { teamsApi, playersApi, searchApi } from '@/lib/api';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { C, F, R, S } from '@/lib/theme';

const ROLES = ['PLAYER', 'CAPTAIN', 'VICE_CAPTAIN', 'COACH'];

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.textSub, letterSpacing: 0.8, marginBottom: S.sm }}>
      {label}{required && <Text style={{ color: C.red }}> *</Text>}
    </Text>
  );
}

const INPUT = {
  backgroundColor: C.card, borderColor: C.border, borderWidth: 1.5,
  borderRadius: R.lg, paddingHorizontal: S.lg, paddingVertical: 13,
  fontSize: 15, fontFamily: F.reg, color: C.text,
} as const;

export function TeamCreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  useRequireAuth();

  const [name,      setName]      = useState('');
  const [shortName, setShortName] = useState('');
  const [city,      setCity]      = useState('');
  const [playerQ,   setPlayerQ]   = useState('');
  const [members,   setMembers]   = useState<{ player: any; role: string }[]>([]);
  const [saving,    setSaving]    = useState(false);

  // Auto-generate short name from team name
  function handleNameChange(v: string) {
    setName(v);
    if (!shortName || shortName === name.slice(0, 4).toUpperCase()) {
      setShortName(v.replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase());
    }
  }

  const { data: searchData, isLoading: searching } = useQuery({
    queryKey: ['playerSearch', playerQ],
    queryFn: () => searchApi.search(playerQ, { type: 'PLAYER' }),
    enabled: playerQ.length >= 2,
    staleTime: 5_000,
  });
  const playerResults: any[] = searchData?.data?.data ?? [];

  function addPlayer(player: any) {
    if (members.find(m => m.player.id === player.id)) return;
    setMembers(prev => [...prev, { player, role: 'PLAYER' }]);
    setPlayerQ('');
  }

  function removePlayer(playerId: string) {
    setMembers(prev => prev.filter(m => m.player.id !== playerId));
  }

  function setRole(playerId: string, role: string) {
    setMembers(prev => prev.map(m => m.player.id === playerId ? { ...m, role } : m));
  }

  async function save() {
    if (!name.trim()) { Toast.show({ type: 'error', text1: 'Team name is required' }); return; }
    if (!shortName.trim()) { Toast.show({ type: 'error', text1: 'Short name is required' }); return; }
    setSaving(true);
    try {
      const { data } = await teamsApi.create({
        name: name.trim(),
        shortName: shortName.trim().toUpperCase().slice(0, 5),
        city: city.trim() || undefined,
      });
      const teamId = data.data.id;
      // Add members
      for (const m of members) {
        await teamsApi.addPlayer(teamId, { playerId: m.player.id, role: m.role });
      }
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      Toast.show({ type: 'success', text1: `${name} created!`, text2: `${members.length} player${members.length !== 1 ? 's' : ''} added` });
      router.back();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.response?.data?.error?.message ?? 'Failed to create team' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: S.xl, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled">

          <View style={{ paddingTop: insets.top + 12, marginBottom: S.xxl }}>
            <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: S.lg }}>
              <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.blue }}>‹  Back</Text>
            </Pressable>
            <Text style={{ fontFamily: F.bold, fontSize: 26, color: C.text }}>Create Team</Text>
            <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textSub, marginTop: 2 }}>Build your squad for the season</Text>
          </View>

          {/* Team Name */}
          <View style={{ marginBottom: S.xl }}>
            <FieldLabel label="TEAM NAME" required />
            <TextInput value={name} onChangeText={handleNameChange}
              placeholder="e.g. Mumbai Warriors" placeholderTextColor={C.textMuted}
              style={INPUT} />
          </View>

          {/* Short Name */}
          <View style={{ marginBottom: S.xl }}>
            <FieldLabel label="SHORT NAME (max 5 chars)" required />
            <TextInput value={shortName} onChangeText={v => setShortName(v.toUpperCase().slice(0, 5))}
              placeholder="e.g. MBW" placeholderTextColor={C.textMuted}
              autoCapitalize="characters" maxLength={5}
              style={[INPUT, { letterSpacing: 3, fontFamily: F.bold }]} />
            <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted, marginTop: 4 }}>Used on scorecards and standings</Text>
          </View>

          {/* City */}
          <View style={{ marginBottom: S.xl }}>
            <FieldLabel label="CITY (OPTIONAL)" />
            <TextInput value={city} onChangeText={setCity}
              placeholder="e.g. Mumbai" placeholderTextColor={C.textMuted}
              style={INPUT} />
          </View>

          {/* Add Players */}
          <View style={{ marginBottom: S.xl }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.sm }}>
              <FieldLabel label="SQUAD" />
              <Pressable onPress={() => router.push('/players/create')} hitSlop={8}>
                <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.primary }}>+ Register Player</Text>
              </Pressable>
            </View>

            {/* Player search */}
            <View style={{ backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingHorizontal: S.md, flexDirection: 'row', alignItems: 'center', gap: S.sm, marginBottom: S.sm }}>
              <Text style={{ fontSize: 16, color: C.textMuted }}>⌕</Text>
              <TextInput value={playerQ} onChangeText={setPlayerQ}
                placeholder="Search existing players..." placeholderTextColor={C.textMuted}
                style={{ flex: 1, fontFamily: F.reg, fontSize: 14, color: C.text, paddingVertical: 11 }}
                autoCapitalize="none" />
              {searching && <ActivityIndicator size="small" color={C.primary} />}
            </View>

            {/* Player search results */}
            {playerQ.length >= 2 && playerResults.map((p: any) => (
              <Pressable key={p.id} onPress={() => addPlayer(p)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md, borderRadius: R.lg, backgroundColor: pressed ? C.cardHover : C.card, borderWidth: 1, borderColor: C.border, marginBottom: S.xs })}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.primaryLight }}>{p.title?.[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.text }}>{p.title}</Text>
                  {p.subtitle ? <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted }}>{p.subtitle}</Text> : null}
                </View>
                <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.green }}>+</Text>
              </Pressable>
            ))}

            {/* Current squad */}
            {members.length > 0 && (
              <View style={{ marginTop: S.sm, gap: S.xs }}>
                <Text style={{ fontFamily: F.semi, fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: S.xs }}>
                  {members.length} player{members.length !== 1 ? 's' : ''} added
                </Text>
                {members.map(m => (
                  <View key={m.player.id} style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.sm }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.green + '22', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: F.bold, fontSize: 11, color: C.green }}>{m.player.title?.[0]}</Text>
                    </View>
                    <Text style={{ flex: 1, fontFamily: F.semi, fontSize: 13, color: C.text }}>{m.player.title}</Text>
                    {/* Role picker */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        {['PLAYER', 'CAPTAIN', 'VICE_CAPTAIN'].map(r => (
                          <Pressable key={r} onPress={() => setRole(m.player.id, r)}
                            style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.sm, backgroundColor: m.role === r ? C.primary : C.card2, borderWidth: 1, borderColor: m.role === r ? C.primary : C.border }}>
                            <Text style={{ fontFamily: F.semi, fontSize: 9, color: m.role === r ? '#fff' : C.textMuted }}>
                              {r === 'VICE_CAPTAIN' ? 'VC' : r === 'CAPTAIN' ? 'C' : 'P'}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>
                    <Pressable onPress={() => removePlayer(m.player.id)} hitSlop={8}
                      style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: F.bold, fontSize: 11, color: C.red }}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Save button */}
          <Pressable onPress={save} disabled={saving || !name.trim() || !shortName.trim()}
            style={({ pressed }) => ({ backgroundColor: C.green, borderRadius: R.lg, paddingVertical: 16, alignItems: 'center', opacity: pressed || saving || !name.trim() ? 0.6 : 1, elevation: 4 })}>
            {saving ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ fontFamily: F.bold, fontSize: 16, color: '#fff' }}>Create Team</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
