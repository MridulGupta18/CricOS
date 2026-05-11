import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useQueryClient } from '@tanstack/react-query';
import { playersApi } from '@/lib/api';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { C, F, R, S } from '@/lib/theme';

type PlayerRole = 'BATSMAN' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKET_KEEPER';
type BattingStyle = 'RIGHT_HAND' | 'LEFT_HAND';

const ROLES: { value: PlayerRole; label: string; icon: string }[] = [
  { value: 'BATSMAN',       label: 'Batsman',       icon: '🏏' },
  { value: 'BOWLER',        label: 'Bowler',         icon: '🎳' },
  { value: 'ALL_ROUNDER',   label: 'All-rounder',    icon: '⚡' },
  { value: 'WICKET_KEEPER', label: 'WK-Batsman',     icon: '🧤' },
];

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

export function PlayerCreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  useRequireAuth();

  const [name,         setName]         = useState('');
  const [role,         setRole]         = useState<PlayerRole>('BATSMAN');
  const [battingStyle, setBattingStyle] = useState<BattingStyle>('RIGHT_HAND');
  const [bowlingStyle, setBowlingStyle] = useState('');
  const [jersey,       setJersey]       = useState('');
  const [city,         setCity]         = useState('');
  const [saving,       setSaving]       = useState(false);

  async function save() {
    if (!name.trim()) { Toast.show({ type: 'error', text1: 'Player name is required' }); return; }
    setSaving(true);
    try {
      await playersApi.create({
        name: name.trim(),
        role,
        battingStyle,
        bowlingStyle: bowlingStyle.trim() || undefined,
        jerseyNumber: jersey.trim() ? parseInt(jersey) : undefined,
        city: city.trim() || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      Toast.show({ type: 'success', text1: `${name} registered!` });
      router.back();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.response?.data?.error?.message ?? 'Failed to register player' });
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
            <Pressable onPress={() => router.back()} style={{ marginBottom: S.lg }}>
              <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.blue }}>‹  Back</Text>
            </Pressable>
            <Text style={{ fontFamily: F.bold, fontSize: 26, color: C.text }}>Register Player</Text>
            <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textSub, marginTop: 2 }}>Add a player to the CricOS database</Text>
          </View>

          {/* Name */}
          <View style={{ marginBottom: S.xl }}>
            <FieldLabel label="FULL NAME" required />
            <TextInput value={name} onChangeText={setName}
              placeholder="e.g. Virat Kohli" placeholderTextColor={C.textMuted}
              style={INPUT} autoCapitalize="words" />
          </View>

          {/* Role */}
          <View style={{ marginBottom: S.xl }}>
            <FieldLabel label="PLAYING ROLE" required />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
              {ROLES.map(r => (
                <Pressable key={r.value} onPress={() => setRole(r.value)}
                  style={{ flex: 1, minWidth: '45%', paddingVertical: S.md, borderRadius: R.lg, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: S.xs, backgroundColor: role === r.value ? C.primary + '22' : C.card, borderWidth: 1.5, borderColor: role === r.value ? C.primary : C.border }}>
                  <Text style={{ fontSize: 16 }}>{r.icon}</Text>
                  <Text style={{ fontFamily: F.semi, fontSize: 13, color: role === r.value ? C.primaryLight : C.textSub }}>{r.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Batting style */}
          <View style={{ marginBottom: S.xl }}>
            <FieldLabel label="BATTING HAND" />
            <View style={{ flexDirection: 'row', gap: S.sm }}>
              {(['RIGHT_HAND', 'LEFT_HAND'] as BattingStyle[]).map(s => (
                <Pressable key={s} onPress={() => setBattingStyle(s)}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: R.lg, alignItems: 'center', backgroundColor: battingStyle === s ? C.blue + '22' : C.card, borderWidth: 1.5, borderColor: battingStyle === s ? C.blue : C.border }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 14, color: battingStyle === s ? C.blue : C.textSub }}>
                    {s === 'RIGHT_HAND' ? '🤜 Right' : '🤛 Left'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Bowling style */}
          {(role === 'BOWLER' || role === 'ALL_ROUNDER') && (
            <View style={{ marginBottom: S.xl }}>
              <FieldLabel label="BOWLING STYLE" />
              <TextInput value={bowlingStyle} onChangeText={setBowlingStyle}
                placeholder="e.g. Right-arm fast, Left-arm spin"
                placeholderTextColor={C.textMuted} style={INPUT} />
            </View>
          )}

          {/* Jersey + City */}
          <View style={{ flexDirection: 'row', gap: S.md, marginBottom: S.xl }}>
            <View style={{ flex: 1 }}>
              <FieldLabel label="JERSEY #" />
              <TextInput value={jersey} onChangeText={setJersey}
                placeholder="7" placeholderTextColor={C.textMuted}
                keyboardType="numeric" maxLength={3} style={INPUT} />
            </View>
            <View style={{ flex: 2 }}>
              <FieldLabel label="CITY" />
              <TextInput value={city} onChangeText={setCity}
                placeholder="e.g. Mumbai" placeholderTextColor={C.textMuted}
                style={INPUT} />
            </View>
          </View>

          {/* Save */}
          <Pressable onPress={save} disabled={saving || !name.trim()}
            style={({ pressed }) => ({ backgroundColor: C.primary, borderRadius: R.lg, paddingVertical: 16, alignItems: 'center', opacity: pressed || saving || !name.trim() ? 0.6 : 1, elevation: 4 })}>
            {saving ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ fontFamily: F.bold, fontSize: 16, color: '#fff' }}>Register Player</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
