import { View, Text, Pressable, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Search } from 'lucide-react-native';
import { useSearchStore } from '@/stores/searchStore';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  showSearch?: boolean;
  right?: React.ReactNode;
}

export function ScreenHeader({ title, subtitle, showBack, showSearch = true, right }: ScreenHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';

  return (
    <View
      className="border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 pb-3"
      style={{ paddingTop: insets.top + 12 }}
    >
      <View className="flex-row items-center gap-3">
        {showBack && (
          <Pressable onPress={() => router.back()} className="p-1 -ml-1 rounded-lg active:bg-gray-100">
            <ArrowLeft size={22} color={isDark ? '#e5e7eb' : '#111827'} strokeWidth={2} />
          </Pressable>
        )}

        <View className="flex-1">
          <Text className="text-lg font-bold text-gray-900 dark:text-white">{title}</Text>
          {subtitle && <Text className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</Text>}
        </View>

        {showSearch && (
          <Pressable
            onPress={() => router.push('/search')}
            className="p-2 rounded-xl active:bg-gray-100 dark:active:bg-gray-800"
          >
            <Search size={20} color={isDark ? '#9ca3af' : '#6b7280'} strokeWidth={2} />
          </Pressable>
        )}

        {right}
      </View>
    </View>
  );
}
