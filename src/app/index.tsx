import { Redirect } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { LoadingView } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export default function IndexScreen() {
  const hydrated = useAuth((state) => state.hydrated);
  const token = useAuth((state) => state.token);
  const user = useAuth((state) => state.user);

  if (!hydrated) {
    return (
      <View style={styles.root}>
        <LoadingView label="Menyiapkan aplikasi..." />
      </View>
    );
  }

  if (!token || !user) return <Redirect href="/login" />;

  // Chief hanya boleh memakai App Admin. Layout /user menampilkan pesan
  // penolakan + tombol logout kalau sesi Chief terlanjur tersimpan.
  if (user.employee?.jabatan === 'Chief') return <Redirect href="/user" />;

  return <Redirect href={user.role === 'admin' ? '/admin' : '/user'} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
