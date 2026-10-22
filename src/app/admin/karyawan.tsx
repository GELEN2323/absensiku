import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Building2, Mail, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react-native';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingView,
  Notice,
  PageFooter,
  PageHeader,
  Screen,
  StatCard,
  TextField,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { Employee } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { colors, font, radius, spacing } from '@/theme';

export default function AdminKaryawanScreen() {
  const token = useAuth((state) => state.token);
  const signOut = useAuth((state) => state.signOut);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(
    async (soft = false) => {
      if (!token) return;
      if (soft) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await api.adminEmployees(token);
        setEmployees(result.employees || []);
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          await signOut();
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Gagal memuat data karyawan.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [signOut, token]
  );

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter(
      (employee) =>
        String(employee.nama || '').toLowerCase().includes(needle) ||
        String(employee.nip || '').toLowerCase().includes(needle) ||
        String(employee.departemen || '').toLowerCase().includes(needle) ||
        String(employee.email || '').toLowerCase().includes(needle)
    );
  }, [employees, query]);

  const faceRegistered = employees.filter((employee) => employee.face_registered).length;
  const departments = new Set(employees.map((employee) => employee.departemen).filter(Boolean)).size;

  if (loading && employees.length === 0) {
    return <LoadingView label="Memuat data karyawan..." />;
  }

  return (
    <Screen>
      <PageHeader
        eyebrow="ADMIN"
        title="Data karyawan"
        subtitle="Daftar karyawan, kontak, dan status pendaftaran wajah."
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Muat ulang data karyawan"
            onPress={() => load(true)}
            style={styles.refresh}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : (
              <RefreshCw size={18} color={colors.brand} />
            )}
          </Pressable>
        }
      />

      {error ? <Notice tone="error" message={error} /> : null}

      <View style={styles.statsRow}>
        <StatCard
          label="Total karyawan"
          value={employees.length}
          hint="Terdaftar di sistem"
          tone="brand"
          icon={<Users size={19} color={colors.brand} />}
        />
        <StatCard
          label="Wajah terdaftar"
          value={faceRegistered}
          hint="Siap verifikasi wajah"
          tone="success"
          icon={<ShieldCheck size={19} color={colors.success} />}
        />
        <StatCard
          label="Departemen"
          value={departments}
          hint="Unit kerja aktif"
          tone="info"
          icon={<Building2 size={19} color={colors.info} />}
        />
      </View>

      <TextField
        label="Cari karyawan"
        value={query}
        onChangeText={setQuery}
        placeholder="Nama, NIP, departemen, atau email"
        autoCapitalize="none"
        right={<Search size={18} color={colors.faint} />}
      />

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            title="Karyawan tidak ditemukan"
            description={
              employees.length === 0
                ? 'Belum ada data karyawan di database.'
                : 'Coba kata kunci lain atau hapus pencarian.'
            }
          />
        </Card>
      ) : (
        <View style={styles.grid}>
          {filtered.map((employee) => (
            <Card key={employee.id} style={styles.employeeCard}>
              <View style={styles.employeeHead}>
                <Avatar uri={employee.photo_url} name={employee.nama} size={54} />
                <View style={styles.employeeText}>
                  <Text style={styles.employeeName} numberOfLines={1}>
                    {employee.nama}
                  </Text>
                  <Text style={styles.employeeNip}>NIP {employee.nip}</Text>
                </View>
              </View>

              <View style={styles.metaList}>
                <View style={styles.metaRow}>
                  <Building2 size={14} color={colors.muted} />
                  <Text style={styles.metaText}>{employee.departemen || 'Tanpa departemen'}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Mail size={14} color={colors.muted} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {employee.email || 'Email belum tersedia'}
                  </Text>
                </View>
              </View>

              <View style={styles.employeeFooter}>
                <Badge
                  label={employee.face_registered ? 'Wajah terdaftar' : 'Wajah belum terdaftar'}
                  tone={employee.face_registered ? 'success' : 'warning'}
                />
              </View>
            </Card>
          ))}
        </View>
      )}

      <View style={styles.countRow}>
        <Text style={styles.countText}>
          Menampilkan {filtered.length} dari {employees.length} karyawan
        </Text>
        {query ? (
          <Button label="Hapus pencarian" variant="ghost" size="sm" onPress={() => setQuery('')} />
        ) : null}
      </View>

      <PageFooter />
    </Screen>
  );
}

const styles = StyleSheet.create({
  refresh: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  employeeCard: {
    flexGrow: 1,
    flexBasis: 280,
    maxWidth: 520,
    gap: spacing.md,
  },
  employeeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  employeeText: {
    flex: 1,
    minWidth: 0,
  },
  employeeName: {
    color: colors.ink,
    fontSize: font.h3,
    fontWeight: '800',
  },
  employeeNip: {
    color: colors.muted,
    fontSize: font.small,
    marginTop: 2,
  },
  metaList: {
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    flex: 1,
    color: colors.inkSoft,
    fontSize: font.small,
  },
  employeeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  countText: {
    color: colors.muted,
    fontSize: font.small,
  },
});
