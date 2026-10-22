import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { LogOut, ShieldCheck, UserRound } from 'lucide-react-native';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Notice,
  PageFooter,
  PageHeader,
  Screen,
  SectionTitle,
  TextField,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { User } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { colors, font, radius, spacing } from '@/theme';

export default function ProfilScreen() {
  const token = useAuth((state) => state.token);
  const user = useAuth((state) => state.user);
  const refreshUser = useAuth((state) => state.refreshUser);
  const signOut = useAuth((state) => state.signOut);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const handleChangePassword = async () => {
    if (!token) return;
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordError('Semua kolom password wajib diisi.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('Password baru minimal 6 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi password belum sama.');
      return;
    }
    if (newPassword === oldPassword) {
      setPasswordError('Password baru harus berbeda dari password lama.');
      return;
    }

    setSaving(true);
    try {
      const result = await api.changePassword(token, oldPassword, newPassword);
      setPasswordSuccess(result.message);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        await signOut();
        return;
      }
      setPasswordError(
        caught instanceof Error ? caught.message : 'Gagal mengubah password. Coba lagi.'
      );
    } finally {
      setSaving(false);
    }
  };

  const employee = user?.employee || null;
  const displayName = employee?.nama || user?.nama || 'Pengguna';
  const roleLabel = user?.role === 'admin' ? 'Admin' : 'Karyawan';
  const appVersion = Constants.expoConfig?.version || '1.0.0';

  return (
    <Screen>
      <PageHeader
        eyebrow="PROFIL"
        title="Profil kamu"
        subtitle="Informasi akun, keamanan, dan status pendaftaran wajah."
      />

      <Card style={styles.profileCard}>
        <View style={styles.profileRow}>
          <Avatar uri={employee?.photo_url} name={displayName} size={72} />
          <View style={styles.profileText}>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.role}>{roleLabel}</Text>
            <View style={styles.profileBadges}>
              <Badge label={employee?.nip ? `NIP ${employee.nip}` : 'NIP belum tersedia'} tone="brand" />
              {employee?.departemen ? <Badge label={employee.departemen} tone="info" /> : null}
            </View>
          </View>
        </View>
      </Card>

      <Card>
        <SectionTitle title="Data akun" hint="Hubungi admin jika ada data yang tidak sesuai." />
        <View style={styles.infoList}>
          <InfoLine label="Email" value={user?.email || '—'} />
          <InfoLine label="Nama karyawan" value={employee?.nama || '—'} />
          <InfoLine label="NIP" value={employee?.nip || '—'} />
          <InfoLine label="Departemen" value={employee?.departemen || '—'} last />
        </View>
      </Card>

      <Card>
        <SectionTitle
          title="Pendaftaran wajah"
          hint="Status data wajah yang tersimpan di server."
          right={
            <Badge
              label={employee?.face_registered ? 'Terdaftar' : 'Belum terdaftar'}
              tone={employee?.face_registered ? 'success' : 'warning'}
            />
          }
        />
        <View style={styles.faceRow}>
          <View style={styles.faceIcon}>
            <ShieldCheck
              size={22}
              color={employee?.face_registered ? colors.success : colors.accent}
            />
          </View>
          <Text style={styles.faceText}>
            {employee?.face_registered
              ? 'Data wajah sudah tersimpan. Jika absensi berbasis wajah diaktifkan, data ini dipakai untuk verifikasi.'
              : 'Data wajah belum terdaftar. Hubungi admin untuk melakukan pendaftaran wajah.'}
          </Text>
        </View>
      </Card>

      <Card>
        <SectionTitle title="Ganti password" hint="Gunakan minimal 6 karakter." />

        {passwordError ? <Notice tone="error" message={passwordError} /> : null}
        {passwordSuccess ? <Notice tone="success" message={passwordSuccess} /> : null}

        <View style={styles.form}>
          <TextField
            label="Password lama"
            value={oldPassword}
            onChangeText={setOldPassword}
            secureTextEntry
            placeholder="Password saat ini"
            autoCapitalize="none"
          />
          <TextField
            label="Password baru"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholder="Minimal 6 karakter"
            autoCapitalize="none"
          />
          <TextField
            label="Konfirmasi password baru"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholder="Ulangi password baru"
            autoCapitalize="none"
          />
          <Button
            label="Simpan password"
            onPress={handleChangePassword}
            loading={saving}
            fullWidth
          />
        </View>
      </Card>

      <Card>
        <SectionTitle title="Sesi" hint="Logout akan menghapus sesi di perangkat ini." />
        {confirmLogout ? (
          <View style={styles.logoutConfirm}>
            <Text style={styles.logoutText}>Yakin ingin keluar dari aplikasi?</Text>
            <View style={styles.logoutActions}>
              <Button
                label="Batal"
                variant="secondary"
                onPress={() => setConfirmLogout(false)}
                style={{ flex: 1 }}
              />
              <Button
                label="Ya, logout"
                variant="danger"
                onPress={signOut}
                icon={<LogOut size={16} color={colors.danger} />}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        ) : (
          <Button
            label="Logout"
            variant="secondary"
            onPress={() => setConfirmLogout(true)}
            icon={<LogOut size={17} color={colors.ink} />}
            fullWidth
          />
        )}
      </Card>

      <View style={styles.versionRow}>
        <UserRound size={14} color={colors.faint} />
        <Text style={styles.versionText}>Absensi Karyawan v{appVersion}</Text>
      </View>

      <PageFooter />
    </Screen>
  );
}

function InfoLine({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoLine, !last && styles.infoLineBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    backgroundColor: colors.surface,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    flexWrap: 'wrap',
  },
  profileText: {
    flex: 1,
    minWidth: 200,
    gap: 4,
  },
  name: {
    color: colors.ink,
    fontSize: font.h1,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  role: {
    color: colors.muted,
    fontSize: font.body,
  },
  profileBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  infoList: {
    marginTop: spacing.sm,
  },
  infoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  infoLineBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    color: colors.muted,
    fontSize: font.small,
  },
  infoValue: {
    flex: 1,
    color: colors.ink,
    fontSize: font.body,
    fontWeight: '600',
    textAlign: 'right',
  },
  faceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  faceIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceText: {
    flex: 1,
    color: colors.inkSoft,
    fontSize: font.body,
    lineHeight: 21,
  },
  form: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  logoutConfirm: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  logoutText: {
    color: colors.inkSoft,
    fontSize: font.body,
  },
  logoutActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  versionText: {
    color: colors.faint,
    fontSize: font.tiny,
  },
});
