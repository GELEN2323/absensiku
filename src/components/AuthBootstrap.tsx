import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export function AuthBootstrap() {
  const hydrated = useAuth((state) => state.hydrated);
  const bootstrap = useAuth((state) => state.bootstrap);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (hydrated) return null;

  return (
    <View style={styles.overlay}>
      <ActivityIndicator size="large" color={colors.brand} />
      <Text style={styles.text}>Menyiapkan sesi...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  text: {
    color: colors.muted,
    fontSize: 14,
  },
});
