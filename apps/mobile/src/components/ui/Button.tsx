import { Pressable, Text, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'scorer';

interface ButtonProps {
  onPress?: () => void;
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  textClassName?: string;
  haptic?: boolean;
}

const containerStyles: Record<Variant, string> = {
  primary: 'bg-brand-600 active:bg-brand-700',
  secondary: 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 active:bg-gray-50',
  ghost: 'active:bg-gray-100 dark:active:bg-gray-800',
  danger: 'bg-red-600 active:bg-red-700',
};

const textStyles: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-gray-900 dark:text-gray-100',
  ghost: 'text-gray-700 dark:text-gray-300',
  danger: 'text-white',
};

const sizeStyles: Record<Size, string> = {
  sm: 'px-3 py-2 rounded-xl',
  md: 'px-4 py-3 rounded-xl',
  lg: 'px-6 py-4 rounded-2xl',
  scorer: 'rounded-2xl', // sized by width/height externally
};

const textSizeStyles: Record<Size, string> = {
  sm: 'text-sm',
  md: 'text-sm',
  lg: 'text-base',
  scorer: 'text-2xl',
};

export function Button({
  onPress,
  children,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  className,
  textClassName,
  haptic = true,
}: ButtonProps) {
  async function handlePress() {
    if (haptic && !disabled) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      className={cn(
        'flex-row items-center justify-center',
        containerStyles[variant],
        sizeStyles[size],
        (disabled || loading) && 'opacity-50',
        className
      )}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' || variant === 'danger' ? '#fff' : '#059669'} />
      ) : (
        <Text className={cn('font-semibold', textStyles[variant], textSizeStyles[size], textClassName)}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}
