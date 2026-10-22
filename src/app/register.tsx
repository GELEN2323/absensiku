import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  Hash,
  Lock,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react-native';
import { BrandMark, Button, Card, LoadingView, Notice, TextField } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { ApiError } from '@/lib/api';
import { colors, font, radius, spacing } from '@/theme';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const router = useRouter();

  const hydrated = useAuth((state) => state.hydrated);
  const token = useAuth((state) => state.token);
  const user = useAuth((state) => state.user);
  const register = useAuth((state) => state.register);

  const [nama, setNama] = useState('');
  const [nip, setNip] = useState('');
  const [email, setEmail] = useState('');
  const [departemen, setDepartemen] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hydrated) return <LoadingView label="Menyiapkan aplikasi..." />;
  if (token && user) {
    return <Redirect href={user.role === 'admin' ? '/admin' : '/user'} />;
  }

  const handleSubmit = async () => {
    if (loading) return;

    const trimmedNama = nama.trim();
    const trimmedNip = nip.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedNama) return setError('Nama lengkap wajib diisi.');
    if (!trimmedNip) return setError('NIP wajib diisi.');
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(trimmedNip)) {
      return setError('NIP hanya boleh huruf, angka, titik, garis bawah, atau strip (3-32 karakter).');
    }
    if (!EMAIL_PATTERN.test(trimmedEmail)) return setError('Format email tidak valid.');
    if (password.length < 6) return setError('Password minimal 6 karakter.');
    if (password !== confirm) return setError('Konfirmasi password belum sama.');

    setLoading(true);
    setError(null);
    try {
      const created = await register({
        nama: trimmedNama,
        nip: trimmedNip,
        email: trimmedEmail,
        departemen: departemen.trim(),
        password,
      });
      router.replace(created.role === 'admin' ? '/admin' : '/user');
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Pendaftaran gagal. Periksa koneksi lalu coba lagi.'
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
        <View style={styles.shell}>
          <BrandMark />

          <Card style={styles.formCard}>
            <View style={styles.formHead}>
              <Text style={styles.formEyebrow}>DAFTAR AKUN</Text>
              <Text style={styles.formTitle}>Buat akun karyawan</Text>
              <Text style={styles.formSubtitle}>
                Isi data sesuai data kehadiran perusahaan. Setelah mendaftar kamu langsung masuk.
              </Text>
            </View>

            {error ? <Notice tone="error" message={error} /> : null}

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.form}
            >
              <TextField
                label="Nama lengkap"
                value={nama}
                onChangeText={setNama}
                placeholder="Nama sesuai data perusahaan"
                autoCapitalize="words"
                textContentType="name"
                returnKeyType="next"
                right={<UserRound size={18} color={colors.faint} />}
              />

              <TextField
                label="NIP"
                value={nip}
                onChangeText={setNip}
                placeholder="Nomor induk karyawan"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                hint="Dipakai untuk login bersama email."
                right={<Hash size={18} color={colors.faint} />}
              />

              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="nama@perusahaan.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
                right={<Mail size={18} color={colors.faint} />}
              />

              <TextField
                label="Departemen (opsional)"
                value={departemen}
                onChangeText={setDepartemen}
                placeholder="Contoh: Security, Operasional"
                autoCapitalize="words"
                returnKeyType="next"
                right={<Building2 size={18} color={colors.faint} />}
              />

              <TextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Minimal 6 karakter"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                returnKeyType="next"
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

              <TextField
                label="Konfirmasi password"
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Ulangi password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
                right={<Lock size={18} color={colors.faint} />}
              />

              <Button
                label="Daftar & masuk"
                onPress={handleSubmit}
                loading={loading}
                fullWidth
                icon={<ArrowRight size={18} color={colors.white} />}
              />
            </KeyboardAvoidingView>

            <View style={styles.loginRow}>
              <Text style={styles.loginText}>Sudah punya akun?</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Masuk ke akun"
                onPress={() => router.replace('/login')}
                style={styles.loginLink}
              >
                <Text style={styles.loginLinkText}>Masuk di sini</Text>
              </Pressable>
            </View>
          </Card>

          <View style={styles.secureRow}>
            <ShieldCheck size={14} color={colors.faint} />
            <Text style={styles.secureText}>
              Password disimpan terenkripsi oleh penyedia autentikasi.
            </Text>
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
    maxWidth: 460,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
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
  loginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  loginText: {
    color: colors.muted,
    fontSize: font.small,
  },
  loginLink: {
    paddingVertical: 4,
  },
  loginLinkText: {
    color: colors.brand,
    fontSize: font.small,
    fontWeight: '700',
  },
  secureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secureText: {
    color: colors.faint,
    fontSize: font.tiny,
    flex: 1,
  },
});
