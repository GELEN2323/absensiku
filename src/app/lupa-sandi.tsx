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
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Hash, MailCheck } from 'lucide-react-native';
import { BrandMark, Button, Card, Notice, TextField } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { colors, font, radius, spacing } from '@/theme';

/**
 * Lupa password: pengguna memasukkan NIK, server mencari email terdaftar
 * lalu meminta Supabase mengirim link reset. Respons server sengaja generik
 * supaya NIP yang tidak terdaftar tidak bisa ditebak.
 */
export default function LupaSandiScreen() {
  const router = useRouter();

  const [nik, setNik] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (loading) return;
    if (!nik.trim()) {
      setError('Isi NIK terlebih dahulu.');
      return;
    }

    setLoading(true);
    setError(null);
    setSent(null);
    try {
      const result = await api.forgotPassword(nik.trim());
      setSent(result.message);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Gagal meminta reset password. Periksa koneksi lalu coba lagi.'
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kembali ke halaman login"
            onPress={() => router.back()}
            style={styles.back}
          >
            <ArrowLeft size={18} color={colors.ink} />
            <Text style={styles.backText}>Kembali</Text>
          </Pressable>

          <BrandMark />

          <Card style={styles.card}>
            <View style={styles.head}>
              <Text style={styles.eyebrow}>LUPA PASSWORD</Text>
              <Text style={styles.title}>Kirim link reset</Text>
              <Text style={styles.subtitle}>
                Masukkan NIK. Kalau NIK terdaftar, link reset akan dikirim ke email yang
                tercatat pada akun.
              </Text>
            </View>

            {error ? <Notice tone="error" message={error} /> : null}
            {sent ? <Notice tone="success" title="Permintaan dikirim" message={sent} /> : null}

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.form}
            >
              <TextField
                label="NIK"
                value={nik}
                onChangeText={setNik}
                placeholder="Contoh: ANGGOTA001"
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="send"
                onSubmitEditing={handleSubmit}
                right={<Hash size={18} color={colors.faint} />}
              />

              <Button
                label="Kirim link reset"
                onPress={handleSubmit}
                loading={loading}
                fullWidth
                icon={<MailCheck size={18} color={colors.white} />}
              />
            </KeyboardAvoidingView>

            <Text style={styles.helper}>
              Belum punya email terdaftar atau tidak menerima link? Hubungi admin untuk reset
              password manual.
            </Text>
          </Card>
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
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  backText: {
    color: colors.ink,
    fontSize: font.small,
    fontWeight: '600',
  },
  card: {
    padding: spacing.xl,
    gap: spacing.lg,
    borderRadius: radius.xl,
  },
  head: {
    gap: 6,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: font.tiny,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.muted,
    fontSize: font.body,
    lineHeight: 20,
  },
  form: {
    gap: spacing.lg,
  },
  helper: {
    color: colors.faint,
    fontSize: font.tiny,
    lineHeight: 16,
    textAlign: 'center',
  },
});
