import { Redirect, Tabs } from 'expo-router';
import { ClipboardList, LayoutDashboard, Users } from 'lucide-react-native';
import { LoadingView } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export default function AdminLayout() {
  const hydrated = useAuth((state) => state.hydrated);
  const token = useAuth((state) => state.token);
  const user = useAuth((state) => state.user);

  if (!hydrated) return <LoadingView label="Menyiapkan sesi..." />;
  if (!token) return <Redirect href="/login" />;
  if (user && user.role !== 'admin') return <Redirect href="/user" />;

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
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="absensi"
        options={{
          title: 'Absensi',
          tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="karyawan"
        options={{
          title: 'Karyawan',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
