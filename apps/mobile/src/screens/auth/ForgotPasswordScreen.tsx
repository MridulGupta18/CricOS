import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { authApi } from '@/lib/api';
import { C, F, R, S } from '@/lib/theme';

export function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const inputStyle = {
    backgroundColor: C.card, borderColor: C.border,
    borderWidth: 1.5, borderRadius: R.lg,
    paddingHorizontal: S.lg, paddingVertical: 14,
    fontSize: 15, fontFamily: F.reg, color: C.text,
  };

  async function submit() {
    if (!email.trim()) { Toast.show({ type: 'error', text1: 'Enter your email' }); return; }
    setSending(true);
    try {
      // API always returns 200 to avoid leaking whether the email exists.
      // We show a generic confirmation either way.
      await authApi.forgot(email.trim().toLowerCase());
      setSent(true);
    } catch {
      // Still show success so we don't accidentally reveal account existence
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: S.xl, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: 'center', marginBottom: S.xxxl }}>
          <View style={{ width: 72, height: 72, borderRadius: R.xl, backgroundColor: 'rgba(59,130,246,0.12)', borderWidth: 1.5, borderColor: 'rgba(59,130,246,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: S.lg }}>
            <Text style={{ fontSize: 28 }}>🔑</Text>
          </View>
          <Text style={{ fontFamily: F.bold, fontSize: 24, color: C.text }}>Reset password</Text>
          <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.textSub, marginTop: S.sm, textAlign: 'center' }}>
            Enter the email on your CricOS account.{'\n'}We'll send you a reset link.
          </Text>
        </View>

        {sent ? (
          <View style={{ alignItems: 'center', gap: S.md }}>
            <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.green, textAlign: 'center' }}>
              ✓ Check your inbox
            </Text>
            <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textSub, textAlign: 'center', maxWidth: 300 }}>
              If an account exists for that email, you'll get a reset link within a minute.
            </Text>
            <Pressable onPress={() => router.replace('/auth/login')} style={{ marginTop: S.lg }}>
              <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.blue }}>Back to sign in</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: S.md }}>
            <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.textSub, letterSpacing: 0.8 }}>EMAIL</Text>
            <TextInput
              value={email} onChangeText={setEmail}
              placeholder="you@example.com" placeholderTextColor={C.textMuted}
              keyboardType="email-address" autoCapitalize="none" autoComplete="email"
              style={inputStyle}
            />
            <Pressable
              onPress={submit}
              disabled={sending}
              accessibilityRole="button"
              accessibilityLabel="Send reset link"
              style={({ pressed }) => ({ backgroundColor: C.blue, borderRadius: R.lg, paddingVertical: 15, alignItems: 'center', marginTop: S.sm, opacity: pressed || sending ? 0.85 : 1 })}
            >
              {sending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ fontFamily: F.bold, fontSize: 16, color: '#fff' }}>Send Reset Link</Text>
              }
            </Pressable>
            <Pressable onPress={() => router.back()} style={{ alignItems: 'center', marginTop: S.sm }}>
              <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.textSub }}>Back to sign in</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
