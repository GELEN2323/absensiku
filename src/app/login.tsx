import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowRight,
  Clock,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MapPin,
  ShieldCheck,
} from 'lucide-react-native';
import { BrandMark, Button, Card, LoadingView, Notice, TextField } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { ApiError } from '@/lib/api';
import { colors, font, radius, spacing } from '@/theme';

const FEATURES = [
  {
    icon: MapPin,
    title: 'Absensi berbasis lokasi',
    text: 'Radius kantor divalidasi di server, bukan di perangkat.',
  },
  {
    icon: Clock,
    title: 'Riwayat rapi',
    text: 'Jam masuk, jam pulang, dan durasi kerja tercatat otomatis.',
  },
  {
    icon: ShieldCheck,
    title: 'Data aman',
    text: 'Akses memakai sesi login dan hak akses admin/karyawan.',
  },
];

export default function LoginScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const hydrated = useAuth((state) => state.hydrated);
  const token = useAuth((state) => state.token);
  const user = useAuth((state) => state.user);
  const signIn = useAuth((state) => state.signIn);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hydrated) return <LoadingView label="Menyiapkan aplikasi..." />;
  if (token && user) {
    return <Redirect href={user.role === 'admin' ? '/admin' : '/user'} />;
  }

  const handleSubmit = async () => {
    if (loading) return;
    if (!identifier.trim() || !password) {
      setError('Isi email/NIP dan password terlebih dahulu.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const loggedIn = await signIn(identifier, password);
      router.replace(loggedIn.role === 'admin' ? '/admin' : '/user');
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Login gagal. Periksa koneksi lalu coba lagi.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.page}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.shell, wide && styles.shellWide]}>
          {wide ? (
            <View style={styles.hero}>
              <BrandMark />
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Kehadiran yang rapi, tanpa ribet.</Text>
                <Text style={styles.heroSubtitle}>
                  Masuk sekali untuk absen, memantau riwayat, dan mengelola kehadiran tim.
                </Text>
              </View>
              <View style={styles.features}>
                {FEATURES.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <View key={feature.title} style={styles.featureRow}>
                      <View style={styles.featureIcon}>
                        <Icon size={18} color={colors.brand} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.featureTitle}>{feature.title}</Text>
                        <Text style={styles.featureText}>{feature.text}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={[styles.formColumn, wide && styles.formColumnWide]}>
            {!wide ? <BrandMark /> : null}
            <Card style={styles.formCard}>
              <View style={styles.formHead}>
                <Text style={styles.formEyebrow}>MASUK APLIKASI</Text>
                <Text style={styles.formTitle}>Selamat datang kembali</Text>
                <Text style={styles.formSubtitle}>
                  Gunakan email terdaftar atau NIP karyawan.
                </Text>
              </View>

              {error ? <Notice tone="error" message={error} /> : null}

              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.form}
              >
                <TextField
                  label="Email atau NIP"
                  value={identifier}
                  onChangeText={setIdentifier}
                  placeholder="nama@perusahaan.com atau NIP"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="username"
                  returnKeyType="next"
                  right={<Mail size={18} color={colors.faint} />}
                />

                <View>
                  <TextField
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Masukkan password"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    returnKeyType="go"
                    onSubmitEditing={handleSubmit}
                    right={
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                        onPress={() => setShowPassword((value) => !value)}
                        style={styles.eyeButton}
                      >
                        {showPassword ? (
                          <EyeOff size={18} color={colors.muted} />
                        ) : (
                          <Eye size={18} color={colors.muted} />
                        )}
                      </Pressable>
                    }
                  />
                  <View style={styles.passwordHint}>
                    <Lock size={12} color={colors.faint} />
                    <Text style={styles.passwordHintText}>
                      Password dikelola oleh admin. Hubungi admin jika lupa.
                    </Text>
                  </View>
                </View>

                <Button
                  label="Masuk"
                  onPress={handleSubmit}
                  loading={loading}
                  fullWidth
                  icon={<ArrowRight size={18} color={colors.white} />}
                />
              </KeyboardAvoidingView>

              <View style={styles.registerRow}>
                <Text style={styles.registerText}>Belum punya akun?</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Daftar akun karyawan"
                  onPress={() => router.push('/register')}
                  style={styles.registerLink}
                >
                  <Text style={styles.registerLinkText}>Daftar sekarang</Text>
                </Pressable>
              </View>

              <Text style={styles.helper}>
                Dengan masuk, kamu menyetujui penggunaan data kehadiran untuk kebutuhan
                administrasi perusahaan.
              </Text>
            </Card>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  shell: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.xl,
  },
  shellWide: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    gap: 56,
  },
  hero: {
    flex: 1,
    gap: spacing.xl,
    paddingVertical: spacing.xl,
  },
  heroText: {
    gap: spacing.md,
  },
  heroTitle: {
    color: colors.ink,
    fontSize: 42,
    lineHeight: 50,
    fontWeight: '800',
    letterSpacing: -1.2,
    maxWidth: 460,
  },
  heroSubtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 430,
  },
  features: {
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    maxWidth: 430,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    color: colors.ink,
    fontSize: font.body,
    fontWeight: '700',
  },
  featureText: {
    color: colors.muted,
    fontSize: font.small,
    lineHeight: 18,
    marginTop: 2,
  },
  formColumn: {
    width: '100%',
    gap: spacing.lg,
  },
  formColumnWide: {
    width: 430,
  },
  formCard: {
    padding: spacing.xl,
    gap: spacing.lg,
    borderRadius: radius.xl,
  },
  formHead: {
    gap: 6,
  },
  formEyebrow: {
    color: colors.brand,
    fontSize: font.tiny,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  formTitle: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  formSubtitle: {
    color: colors.muted,
    fontSize: font.body,
    lineHeight: 20,
  },
  form: {
    gap: spacing.lg,
  },
  eyeButton: {
    padding: 6,
    marginRight: -6,
  },
  passwordHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  passwordHintText: {
    color: colors.faint,
    fontSize: font.tiny,
    flex: 1,
  },
  registerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  registerText: {
    color: colors.muted,
    fontSize: font.small,
  },
  registerLink: {
    paddingVertical: 4,
  },
  registerLinkText: {
    color: colors.brand,
    fontSize: font.small,
    fontWeight: '700',
  },
  helper: {
    color: colors.faint,
    fontSize: font.tiny,
    lineHeight: 16,
    textAlign: 'center',
  },
});
