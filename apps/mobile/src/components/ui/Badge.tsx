import { View, Text, useColorScheme } from 'react-native';

type Variant = 'default' | 'live' | 'completed' | 'upcoming' | 'orange';

const STYLES: Record<Variant, { bg: string; darkBg: string; color: string; darkColor: string }> = {
  default:   { bg:'rgba(5,150,105,0.1)',   darkBg:'rgba(5,150,105,0.15)',   color:'#059669',  darkColor:'#10b981' },
  live:      { bg:'rgba(239,68,68,0.1)',   darkBg:'rgba(239,68,68,0.15)',   color:'#dc2626',  darkColor:'#ef4444' },
  completed: { bg:'rgba(100,116,139,0.1)', darkBg:'rgba(100,116,139,0.12)', color:'#475569',  darkColor:'#94a3b8' },
  upcoming:  { bg:'rgba(59,130,246,0.1)',  darkBg:'rgba(59,130,246,0.15)',  color:'#2563eb',  darkColor:'#60a5fa' },
  orange:    { bg:'rgba(249,115,22,0.1)',  darkBg:'rgba(249,115,22,0.15)',  color:'#ea580c',  darkColor:'#fb923c' },
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: Variant;
}

export function Badge({ children, variant = 'default' }: BadgeProps) {
  const dark = useColorScheme() === 'dark';
  const s = STYLES[variant];
  return (
    <View style={{ paddingHorizontal:10, paddingVertical:3, borderRadius:20, backgroundColor: dark ? s.darkBg : s.bg }}>
      <Text style={{ fontFamily:'Inter_600SemiBold', fontSize:11, color: dark ? s.darkColor : s.color, letterSpacing:0.3 }}>
        {children}
      </Text>
    </View>
  );
}
