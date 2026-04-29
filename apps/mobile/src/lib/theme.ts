// ─── CricOS Design System ────────────────────────────────────────────────────
// Premium dark-first design. Navy base, electric blue/purple accent.

export const C = {
  // Backgrounds
  bg:       '#0B0F1A',
  surface:  '#121826',
  card:     '#121826',
  card2:    '#1A2236',
  cardHover:'#1E2840',

  // Borders
  border:   '#1E2D40',
  borderLt: '#263548',

  // Primary — indigo (from design system)
  primary:      '#6366F1',
  primaryLight: '#818CF8',

  // Accent — electric blue → purple
  blue:     '#3B82F6',
  blueD:    '#2563EB',
  purple:   '#8B5CF6',
  purpleD:  '#7C3AED',

  // Status
  green:    '#10B981',
  greenD:   '#059669',
  orange:   '#F59E0B',
  red:      '#EF4444',
  redD:     '#DC2626',

  // Text
  text:     '#F1F5F9',
  textSub:  '#94A3B8',
  textMuted:'#475569',
  textDim:  '#334155',

  // Live
  live:     '#EF4444',
} as const;

export const LIGHT = {
  bg:       '#F8FAFC',
  surface:  '#FFFFFF',
  card:     '#FFFFFF',
  card2:    '#F1F5F9',
  cardHover:'#E2E8F0',
  border:   '#E2E8F0',
  borderLt: '#CBD5E1',
  text:     '#0F172A',
  textSub:  '#64748B',
  textMuted:'#94A3B8',
  textDim:  '#CBD5E1',
} as const;

export const F = {
  black:  'Inter_700Bold',
  bold:   'Inter_700Bold',
  semi:   'Inter_600SemiBold',
  medium: 'Inter_500Medium',
  reg:    'Inter_400Regular',
} as const;

export const R = {
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
  full: 999,
} as const;

export const S = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
  xxxl:32,
} as const;
