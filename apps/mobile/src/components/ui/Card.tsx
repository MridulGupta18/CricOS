import { View, Pressable, useColorScheme } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
}

export function Card({ children, onPress, style }: CardProps) {
  const dark = useColorScheme() === 'dark';
  const base = {
    backgroundColor: dark ? '#111c16' : '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: dark ? 'rgba(255,255,255,0.07)' : '#e2e8f0',
    padding: 16,
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [base, style, { opacity: pressed ? 0.88 : 1 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}
