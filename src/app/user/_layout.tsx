import { Redirect, Tabs } from 'expo-router';
import { Clock, History, MapPin, UserRound } from 'lucide-react-native';
import { Button, LoadingView, Notice, PageHeader, Screen } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export default function UserLayout() {
  const hydrated = useAuth((state) => state.hydrated);
  const token = useAuth((state) => state.token);
  const user = useAuth((state) => state.user);
  const signOut = useAuth((state) => state.signOut);

  if (!hydrated) return <LoadingView label="Menyiapkan sesi..." />;
  if (!token) return <Redirect href="/login" />;

  // Pembatasan jabatan: App Pengguna hanya untuk Danru/Anggota.
  if (user?.employee?.jabatan === 'Chief') {
    return (
      <Screen>
        <PageHeader
          eyebrow="AKSES DIBATASI"
          title="Gunakan aplikasi admin"
          subtitle="Akun Chief tidak bisa memakai App Pengguna."
        />
        <Notice
          tone="warning"
          title="Salah aplikasi"
          message="Dashboard, kelola pengguna, lokasi, dan approval izin ada di App Admin (com.absensi.admin)."
        />
        <Button label="Logout" variant="secondary" onPress={signOut} fullWidth />
      </Screen>
    );
  }

  // Akun lama dengan role admin tetapi tanpa jabatan tetap memakai panel admin web.
  if (user?.role === 'admin' && !user.employee?.jabatan) return <Redirect href="/admin" />;

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
        name="patroli"
        options={{
          title: 'Patroli',
          tabBarIcon: ({ color, size }) => <MapPin color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} />,
        }}
      />
      {/*
        Halaman pendukung tetap berada di dalam grup tab supaya tombol
        kembali konsisten, tetapi tidak tampil sebagai tab kelima.
      */}
      <Tabs.Screen name="wajah" options={{ href: null }} />
      <Tabs.Screen name="izin" options={{ href: null }} />
    </Tabs>
  );
}
