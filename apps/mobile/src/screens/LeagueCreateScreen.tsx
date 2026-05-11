import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useQueryClient } from '@tanstack/react-query';
import { leaguesApi } from '@/lib/api';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { C, F, R, S } from '@/lib/theme';

type Format = 'T20' | 'ODI' | 'T10' | 'CUSTOM';

const FORMATS: { value: Format; overs: number; label: string }[] = [
  { value: 'T10', overs: 10,  label: 'T10' },
  { value: 'T20', overs: 20,  label: 'T20' },
  { value: 'ODI', overs: 50,  label: 'ODI' },
  { value: 'CUSTOM', overs: 20, label: 'Custom' },
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

function slugify(str: string) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function LeagueCreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  useRequireAuth();

  const [name,    setName]    = useState('');
  const [slug,    setSlug]    = useState('');
  const [desc,    setDesc]    = useState('');
  const [format,  setFormat]  = useState<Format>('T20');
  const [overs,   setOvers]   = useState('20');
  const [city,    setCity]    = useState('');
  const [maxTeams, setMaxTeams] = useState('');
  const [fee,     setFee]     = useState('0');
  const [isPublic, setIsPublic] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);

  function handleNameChange(v: string) {
    setName(v);
    if (!slugEdited) setSlug(slugify(v));
  }

  async function save() {
    if (!name.trim()) { Toast.show({ type: 'error', text1: 'League name is required' }); return; }
    if (!slug.trim())  { Toast.show({ type: 'error', text1: 'Slug is required' }); return; }
    setSaving(true);
    try {
      const { data } = await leaguesApi.create({
        name: name.trim(),
        slug: slug.trim(),
        description: desc.trim() || undefined,
        format,
        overs: parseInt(overs) || 20,
        city: city.trim() || undefined,
        maxTeams: maxTeams.trim() ? parseInt(maxTeams) : undefined,
        registrationFee: parseInt(fee) || 0,
        isPublic,
        status: 'REGISTRATION_OPEN',
      });
      queryClient.invalidateQueries({ queryKey: ['leagues'] });
      Toast.show({ type: 'success', text1: `${name} created!` });
      router.replace(`/league/${data.data.slug}`);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.response?.data?.error?.message ?? 'Failed to create league' });
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
            <Text style={{ fontFamily: F.bold, fontSize: 26, color: C.text }}>Create League</Text>
            <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textSub, marginTop: 2 }}>Start your tournament or club season</Text>
          </View>

          {/* Name */}
          <View style={{ marginBottom: S.xl }}>
            <FieldLabel label="LEAGUE NAME" required />
            <TextInput value={name} onChangeText={handleNameChange}
              placeholder="e.g. Mumbai Premier League 2025" placeholderTextColor={C.textMuted}
              style={INPUT} autoCapitalize="words" />
          </View>

          {/* Slug */}
          <View style={{ marginBottom: S.xl }}>
            <FieldLabel label="URL SLUG" required />
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, borderRadius: R.lg, paddingLeft: S.md, overflow: 'hidden' }}>
              <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textMuted }}>crivos.app/league/</Text>
              <TextInput value={slug}
                onChangeText={v => { setSlug(slugify(v)); setSlugEdited(true); }}
                placeholder="my-league" placeholderTextColor={C.textMuted}
                autoCapitalize="none" autoCorrect={false}
                style={{ flex: 1, fontFamily: F.medium, fontSize: 14, color: C.primaryLight, paddingVertical: 13, paddingRight: S.lg }} />
            </View>
          </View>

          {/* Description */}
          <View style={{ marginBottom: S.xl }}>
            <FieldLabel label="DESCRIPTION (OPTIONAL)" />
            <TextInput value={desc} onChangeText={setDesc}
              placeholder="Rules, eligibility, prize information..."
              placeholderTextColor={C.textMuted} multiline numberOfLines={3}
              style={[INPUT, { height: 90, textAlignVertical: 'top', paddingTop: 12 }]} />
          </View>

          {/* Format */}
          <View style={{ marginBottom: S.xl }}>
            <FieldLabel label="FORMAT" required />
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
              <TextInput value={overs} onChangeText={setOvers} keyboardType="numeric"
                placeholder="20" placeholderTextColor={C.textMuted} style={INPUT} />
            </View>
          )}

          {/* City + Max Teams in a row */}
          <View style={{ flexDirection: 'row', gap: S.md, marginBottom: S.xl }}>
            <View style={{ flex: 2 }}>
              <FieldLabel label="CITY" />
              <TextInput value={city} onChangeText={setCity} placeholder="e.g. Mumbai"
                placeholderTextColor={C.textMuted} style={INPUT} />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel label="MAX TEAMS" />
              <TextInput value={maxTeams} onChangeText={setMaxTeams} keyboardType="numeric"
                placeholder="16" placeholderTextColor={C.textMuted} style={INPUT} />
            </View>
          </View>

          {/* Public toggle */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.lg, marginBottom: S.xxl }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.text }}>Public League</Text>
              <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted, marginTop: 2 }}>Visible to all users and searchable</Text>
            </View>
            <Switch value={isPublic} onValueChange={setIsPublic}
              trackColor={{ false: C.border, true: C.primary + '88' }}
              thumbColor={isPublic ? C.primary : C.textMuted} />
          </View>

          {/* Save */}
          <Pressable onPress={save} disabled={saving || !name.trim() || !slug.trim()}
            style={({ pressed }) => ({ backgroundColor: C.primary, borderRadius: R.lg, paddingVertical: 16, alignItems: 'center', opacity: pressed || saving || !name.trim() ? 0.6 : 1, elevation: 4 })}>
            {saving ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ fontFamily: F.bold, fontSize: 16, color: '#fff' }}>Create League</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
