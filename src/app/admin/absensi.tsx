import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react-native';
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
import { formatDateKey, formatTime, todayKey, formatMonth, shiftMonth } from '@/lib/format';
import type { AdminAttendanceResponse } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { colors, font, radius, spacing } from '@/theme';

function shiftDateKey(key: string, delta: number): string {
  // Gunakan server time jika sudah di-set, else parse dari key
  const date = new Date(`${key}T00:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toLocaleDateString('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export default function AdminAbsensiScreen() {
  const token = useAuth((state) => state.token);
  const signOut = useAuth((state) => state.signOut);

  const [date, setDate] = useState(todayKey());
  const [data, setData] = useState<AdminAttendanceResponse | null>(null);
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
        setData(await api.adminAttendance(token, { date }));
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          await signOut();
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Gagal memuat data absensi.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [date, signOut, token]
  );

  useEffect(() => {
    load();
  }, [load]);

  const records = useMemo(() => {
    const items = data?.records || [];
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (record) =>
        String(record.employee?.nama || '').toLowerCase().includes(needle) ||
        String(record.employee?.nip || '').toLowerCase().includes(needle)
    );
  }, [data, query]);

  const summary = data?.summary;
  const isToday = date === todayKey();

  return (
    <Screen>
      <PageHeader
        eyebrow="ADMIN"
        title="Data absensi"
        subtitle="Pantau kehadiran seluruh karyawan berdasarkan tanggal."
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Muat ulang data absensi"
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

      <Card style={styles.toolbar}>
        <View style={styles.dateControl}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tanggal sebelumnya"
            onPress={() => setDate((value) => shiftDateKey(value, -1))}
            style={styles.navButton}
          >
            <ChevronLeft size={18} color={colors.ink} />
          </Pressable>
          <View style={styles.dateCenter}>
            <CalendarDays size={17} color={colors.brand} />
            <Text style={styles.dateText}>{formatDateKey(date)}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tanggal berikutnya"
            onPress={() => !isToday && setDate((value) => shiftDateKey(value, 1))}
            style={[styles.navButton, isToday && styles.navButtonDisabled]}
            disabled={isToday}
          >
            <ChevronRight size={18} color={isToday ? colors.faint : colors.ink} />
          </Pressable>
        </View>

        {!isToday ? (
          <Button label="Hari ini" variant="secondary" size="sm" onPress={() => setDate(todayKey())} />
        ) : null}
      </Card>

      <View style={styles.statsRow}>
        <StatCard
          label="Hadir"
          value={summary?.present ?? 0}
          hint="Absen masuk"
          tone="success"
          icon={<Users size={19} color={colors.success} />}
        />
        <StatCard
          label="Terlambat"
          value={summary?.late ?? 0}
          hint="Melewati jam masuk"
          tone="warning"
          icon={<Clock size={19} color={colors.accent} />}
        />
        <StatCard
          label="Belum pulang"
          value={Math.max(0, (summary?.present ?? 0) - (summary?.completed ?? 0))}
          hint="Masih di kantor"
          tone="info"
          icon={<Clock size={19} color={colors.info} />}
        />
        <StatCard
          label="Total durasi"
          value={summary?.total_duration || '0j 0m'}
          hint="Akumulasi selesai"
          tone="brand"
          icon={<CalendarDays size={19} color={colors.brand} />}
        />
      </View>

      {error ? <Notice tone="error" message={error} /> : null}

      <TextField
        label="Cari karyawan"
        value={query}
        onChangeText={setQuery}
        placeholder="Nama atau NIP"
        autoCapitalize="none"
        right={<Search size={18} color={colors.faint} />}
      />

      {loading && !data ? (
        <LoadingView label="Memuat absensi..." />
      ) : records.length === 0 ? (
        <Card>
          <EmptyState
            title="Tidak ada data"
            description={`Belum ada absensi pada ${formatDateKey(date)}${query ? ' yang cocok dengan pencarian' : ''}.`}
          />
        </Card>
      ) : (
        <View style={styles.list}>
          {records.map((record) => (
            <Card key={record.id} style={styles.item}>
              <View style={styles.itemHead}>
                <Avatar
                  uri={record.employee?.photo_url}
                  name={record.employee?.nama}
                  size={46}
                />
                <View style={styles.employeeText}>
                  <Text style={styles.employeeName} numberOfLines={1}>
                    {record.employee?.nama || 'Karyawan'}
                  </Text>
                  <Text style={styles.employeeMeta} numberOfLines={1}>
                    {record.employee?.nip || '—'} · {record.employee?.departemen || 'Tanpa departemen'}
                  </Text>
                </View>
                <Badge
                  label={record.status}
                  tone={
                    record.status === 'Terlambat'
                      ? 'warning'
                      : record.status === 'Hadir'
                        ? 'success'
                        : 'muted'
                  }
                />
              </View>

              <View style={styles.times}>
                <View style={styles.timeBlock}>
                  <Text style={styles.timeLabel}>Masuk</Text>
                  <Text style={styles.timeValue}>{formatTime(record.check_in_at)}</Text>
                </View>
                <View style={styles.timeDivider} />
                <View style={styles.timeBlock}>
                  <Text style={styles.timeLabel}>Pulang</Text>
                  <Text style={styles.timeValue}>{formatTime(record.check_out_at)}</Text>
                </View>
                <View style={styles.timeDivider} />
                <View style={styles.timeBlock}>
                  <Text style={styles.timeLabel}>Durasi</Text>
                  <Text style={styles.durationValue}>{record.duration || '—'}</Text>
                </View>
              </View>

              {record.check_in_address ? (
                <View style={styles.address}>
                  <MapPin size={13} color={colors.muted} />
                  <Text style={styles.addressText} numberOfLines={2}>
                    {record.check_in_address}
                  </Text>
                </View>
              ) : null}
            </Card>
          ))}
        </View>
      )}

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
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  dateControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  dateCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    color: colors.ink,
    fontSize: font.body,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  list: {
    gap: spacing.md,
  },
  item: {
    gap: spacing.md,
  },
  itemHead: {
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
    fontSize: font.body,
    fontWeight: '700',
  },
  employeeMeta: {
    color: colors.muted,
    fontSize: font.small,
    marginTop: 2,
  },
  times: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  timeBlock: {
    flex: 1,
    gap: 2,
  },
  timeLabel: {
    color: colors.muted,
    fontSize: font.tiny,
  },
  timeValue: {
    color: colors.ink,
    fontSize: font.h3,
    fontWeight: '800',
  },
  durationValue: {
    color: colors.brand,
    fontSize: font.h3,
    fontWeight: '800',
  },
  timeDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  address: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  addressText: {
    flex: 1,
    color: colors.muted,
    fontSize: font.small,
    lineHeight: 18,
  },
});
