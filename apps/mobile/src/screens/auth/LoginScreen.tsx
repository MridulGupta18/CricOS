import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { C, F, R, S } from '@/lib/theme';

function useT() { return C; }

export function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { setUser, setTokens } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const inputStyle = {
    backgroundColor: t.card, borderColor: t.border,
    borderWidth: 1.5, borderRadius: R.lg,
    paddingHorizontal: S.lg, paddingVertical: 14,
    fontSize: 15, fontFamily: F.reg, color: C.text,
  };

  async function login() {
    if (!email.trim() || !password) { Toast.show({ type: 'error', text1: 'Fill in all fields' }); return; }
    setIsLoading(true);
    try {
      const { data } = await authApi.login({ email: email.trim(), password });
      setUser(data.data.user);
      setTokens(data.data.accessToken, data.data.refreshToken);
      Toast.show({ type: 'success', text1: `Welcome, ${data.data.user.name}!` });
      router.replace('/(tabs)');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.response?.data?.error?.message ?? 'Login failed' });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: S.xl, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={{ alignItems: 'center', marginBottom: S.xxxl + 8 }}>
          <View style={{ width: 72, height: 72, borderRadius: R.xl, backgroundColor: 'rgba(59,130,246,0.12)', borderWidth: 1.5, borderColor: 'rgba(59,130,246,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: S.lg }}>
            <Text style={{ fontSize: 32 }}>🏏</Text>
          </View>
          <Text style={{ fontFamily: F.bold, fontSize: 28, color: C.text }}>Welcome back</Text>
          <Text style={{ fontFamily: F.reg, fontSize: 15, color: C.textSub, marginTop: S.sm }}>Sign in to CricOS</Text>
        </View>

        {/* Fields */}
        <View style={{ gap: S.md }}>
          <View>
            <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.textSub, letterSpacing: 0.8, marginBottom: S.sm }}>EMAIL</Text>
            <TextInput
              value={email} onChangeText={setEmail}
              placeholder="you@example.com" placeholderTextColor={C.textMuted}
              keyboardType="email-address" autoCapitalize="none" autoComplete="email"
              style={inputStyle}
            />
          </View>
          <View>
            <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.textSub, letterSpacing: 0.8, marginBottom: S.sm }}>PASSWORD</Text>
            <TextInput
              value={password} onChangeText={setPassword}
              placeholder="••••••••" placeholderTextColor={C.textMuted}
              secureTextEntry
              style={inputStyle}
            />
          </View>

          <Pressable
            onPress={login}
            disabled={isLoading}
            style={({ pressed }) => ({ backgroundColor: C.blue, borderRadius: R.lg, paddingVertical: 15, alignItems: 'center', marginTop: S.sm, opacity: pressed || isLoading ? 0.85 : 1 })}
          >
            {isLoading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ fontFamily: F.bold, fontSize: 16, color: '#fff' }}>Sign In</Text>
            }
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: S.xxl, gap: S.xs }}>
          <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.textSub }}>Don't have an account?</Text>
          <Pressable onPress={() => router.push('/auth/register')}>
            <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.blue }}>Sign up</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => router.back()} style={{ marginTop: S.lg, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.textMuted }}>Continue as guest</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
