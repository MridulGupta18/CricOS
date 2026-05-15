import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { C, F, R, S } from '@/lib/theme';

// Public URLs for the terms + privacy policy.
// Env-driven so the URLs can be updated without shipping a new app build —
// critical because App Store/Play Store reviewers tap these during submission
// and any broken link rejects the build. Defaults match the production brand.
const TERMS_URL   = process.env.EXPO_PUBLIC_TERMS_URL   ?? 'https://crivos.app/terms';
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? 'https://crivos.app/privacy';

// ── Password rules ───────────────────────────────────────────

const RULES = [
  { id: 'length',  label: 'At least 8 characters',        test: (p: string) => p.length >= 8       },
  { id: 'upper',   label: 'One uppercase letter (A–Z)',    test: (p: string) => /[A-Z]/.test(p)     },
  { id: 'lower',   label: 'One lowercase letter (a–z)',    test: (p: string) => /[a-z]/.test(p)     },
  { id: 'digit',   label: 'One number (0–9)',              test: (p: string) => /[0-9]/.test(p)     },
  { id: 'symbol',  label: 'One symbol (!@#$%^&*…)',        test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function PasswordStrength({ password }: { password: string }) {
  const passed = RULES.filter(r => r.test(password)).length;
  if (!password) return null;
  return (
    <View style={{ marginTop: S.sm, gap: 5 }}>
      {RULES.map(rule => {
        const ok = rule.test(password);
        return (
          <View key={rule.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={{
              width: 16, height: 16, borderRadius: 8,
              backgroundColor: ok ? `${C.green}22` : `${C.red}18`,
              borderWidth: 1.5, borderColor: ok ? C.green : `${C.red}55`,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 9, color: ok ? C.green : C.red }}>{ok ? '✓' : '×'}</Text>
            </View>
            <Text style={{ fontFamily: F.reg, fontSize: 12, color: ok ? C.green : C.textMuted }}>
              {rule.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setUser, setTokens } = useAuthStore();

  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [phone,    setPhone]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const allRulesPassed = useMemo(() => RULES.every(r => r.test(password)), [password]);

  const inputStyle = {
    backgroundColor: C.card, borderColor: C.border,
    borderWidth: 1.5, borderRadius: R.lg,
    paddingHorizontal: S.lg, paddingVertical: 14,
    fontSize: 15, fontFamily: F.reg, color: C.text,
  };

  async function register() {
    if (!name.trim())  { Toast.show({ type: 'error', text1: 'Full name is required' }); return; }
    if (!email.trim()) { Toast.show({ type: 'error', text1: 'Email is required' }); return; }
    if (!allRulesPassed) {
      Toast.show({ type: 'error', text1: 'Password doesn\'t meet requirements' });
      setPwFocused(true);
      return;
    }
    if (!acceptedTerms) {
      Toast.show({ type: 'error', text1: 'Please accept the terms and privacy policy to continue' });
      return;
    }

    setIsLoading(true);
    try {
      const { data } = await authApi.register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        password,
        acceptedTerms: true,
      });
      setUser(data.data.user);
      setTokens(data.data.accessToken, data.data.refreshToken);
      Toast.show({
        type: 'success',
        text1: `Welcome, ${data.data.user.name}!`,
        text2: data.data.user.isVerified ? undefined : 'Check your email to verify your account.',
      });
      router.replace('/(tabs)');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.response?.data?.error?.message ?? 'Registration failed' });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: S.xl, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={{ alignItems: 'center', marginBottom: S.xxl + 4 }}>
          <View style={{ width: 72, height: 72, borderRadius: R.xl, backgroundColor: 'rgba(59,130,246,0.12)', borderWidth: 1.5, borderColor: 'rgba(59,130,246,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: S.lg }}>
            <Text style={{ fontSize: 32 }}>🏏</Text>
          </View>
          <Text style={{ fontFamily: F.bold, fontSize: 28, color: C.text }}>Create account</Text>
          <Text style={{ fontFamily: F.reg, fontSize: 15, color: C.textSub, marginTop: S.sm }}>Join CricOS</Text>
        </View>

        {/* Fields */}
        <View style={{ gap: S.lg }}>

          {/* Full name */}
          <View>
            <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.textSub, letterSpacing: 0.8, marginBottom: S.sm }}>FULL NAME</Text>
            <TextInput
              value={name} onChangeText={setName}
              placeholder="Your name" placeholderTextColor={C.textMuted}
              autoCapitalize="words" autoComplete="name"
              style={inputStyle}
            />
          </View>

          {/* Email */}
          <View>
            <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.textSub, letterSpacing: 0.8, marginBottom: S.sm }}>EMAIL</Text>
            <TextInput
              value={email} onChangeText={setEmail}
              placeholder="you@example.com" placeholderTextColor={C.textMuted}
              keyboardType="email-address" autoCapitalize="none" autoComplete="email"
              style={inputStyle}
            />
          </View>

          {/* Phone (optional) */}
          <View>
            <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.textSub, letterSpacing: 0.8, marginBottom: S.sm }}>
              PHONE <Text style={{ fontFamily: F.reg, color: C.textMuted, letterSpacing: 0 }}>(optional)</Text>
            </Text>
            <TextInput
              value={phone} onChangeText={setPhone}
              placeholder="+1 403 555 0100" placeholderTextColor={C.textMuted}
              keyboardType="phone-pad" autoComplete="tel"
              style={inputStyle}
            />
          </View>

          {/* Password */}
          <View>
            <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.textSub, letterSpacing: 0.8, marginBottom: S.sm }}>PASSWORD</Text>
            <View style={{ position: 'relative' }}>
              <TextInput
                value={password} onChangeText={setPassword}
                placeholder="Create a strong password" placeholderTextColor={C.textMuted}
                secureTextEntry={!showPw}
                onFocus={() => setPwFocused(true)}
                style={[inputStyle, { paddingRight: 48 }]}
              />
              <Pressable
                onPress={() => setShowPw(v => !v)}
                hitSlop={8}
                style={{ position: 'absolute', right: S.lg, top: 0, bottom: 0, justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 18, color: C.textMuted }}>{showPw ? '🙈' : '👁'}</Text>
              </Pressable>
            </View>
            {(pwFocused || password.length > 0) && <PasswordStrength password={password} />}
          </View>

          {/* Terms + privacy consent — required for App/Play Store + GDPR */}
          <Pressable
            onPress={() => setAcceptedTerms((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptedTerms }}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: S.sm, marginTop: S.sm, paddingVertical: 4 }}
            hitSlop={6}
          >
            <View style={{
              width: 20, height: 20, borderRadius: 5, marginTop: 2,
              borderWidth: 2,
              borderColor: acceptedTerms ? C.blue : C.border,
              backgroundColor: acceptedTerms ? C.blue : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {acceptedTerms && <Text style={{ fontSize: 12, color: '#fff', fontFamily: F.bold }}>✓</Text>}
            </View>
            <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textSub, flex: 1, lineHeight: 18 }}>
              I agree to the{' '}
              <Text style={{ color: C.blue, fontFamily: F.semi }} onPress={() => Linking.openURL(TERMS_URL)}>
                Terms of Service
              </Text>
              {' '}and{' '}
              <Text style={{ color: C.blue, fontFamily: F.semi }} onPress={() => Linking.openURL(PRIVACY_URL)}>
                Privacy Policy
              </Text>
              .
            </Text>
          </Pressable>

          <Pressable
            onPress={register}
            disabled={isLoading || !acceptedTerms}
            accessibilityRole="button"
            accessibilityLabel="Create account"
            style={({ pressed }) => ({
              backgroundColor: acceptedTerms ? C.blue : C.border,
              borderRadius: R.lg, paddingVertical: 15,
              alignItems: 'center', marginTop: S.sm,
              opacity: pressed || isLoading ? 0.85 : 1,
            })}
          >
            {isLoading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ fontFamily: F.bold, fontSize: 16, color: '#fff' }}>Create Account</Text>
            }
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: S.xxl, gap: S.xs }}>
          <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.textSub }}>Already have an account?</Text>
          <Pressable onPress={() => router.push('/auth/login')}>
            <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.blue }}>Sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
