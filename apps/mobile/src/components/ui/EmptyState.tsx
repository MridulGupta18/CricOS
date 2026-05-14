import { View, Text, Pressable, AccessibilityRole } from 'react-native';
import { C, F, R, S } from '@/lib/theme';

interface Props {
  icon?: string;
  title: string;
  description?: string;
  ctaLabel?: string;
  onPressCta?: () => void;
}

// Lightweight empty-state for list screens.
// Used wherever a screen would otherwise show a blank, confusing area to the user.

export function EmptyState({ icon = '✨', title, description, ctaLabel, onPressCta }: Props) {
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`Empty: ${title}${description ? '. ' + description : ''}`}
      style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: S.xl }}
    >
      <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center', marginBottom: S.lg, borderWidth: 1, borderColor: C.border }}>
        <Text style={{ fontSize: 36 }}>{icon}</Text>
      </View>
      <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.text, textAlign: 'center' }}>{title}</Text>
      {description ? (
        <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.textSub, marginTop: S.sm, textAlign: 'center', maxWidth: 280, lineHeight: 18 }}>
          {description}
        </Text>
      ) : null}
      {ctaLabel && onPressCta ? (
        <Pressable
          onPress={onPressCta}
          accessibilityRole={'button' as AccessibilityRole}
          accessibilityLabel={ctaLabel}
          style={({ pressed }) => ({
            marginTop: S.lg,
            backgroundColor: C.primary,
            borderRadius: R.lg,
            paddingHorizontal: S.xl,
            paddingVertical: 12,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontFamily: F.bold, fontSize: 14, color: '#fff' }}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
