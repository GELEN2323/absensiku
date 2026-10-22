import { Redirect, Tabs } from 'expo-router';
import { Clock, History, UserRound } from 'lucide-react-native';
import { LoadingView } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export default function UserLayout() {
  const hydrated = useAuth((state) => state.hydrated);
  const token = useAuth((state) => state.token);
  const user = useAuth((state) => state.user);

  if (!hydrated) return <LoadingView label="Menyiapkan sesi..." />;
  if (!token) return <Redirect href="/login" />;
  if (user?.role === 'admin') return <Redirect href="/admin" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarStyle: {
          height: 66,
          paddingTop: 8,
          paddingBottom: 8,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        sceneStyle: {
          backgroundColor: colors.bg,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Absensi',
          tabBarIcon: ({ color, size }) => <Clock color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="riwayat"
        options={{
          title: 'Riwayat',
          tabBarIcon: ({ color, size }) => <History color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
