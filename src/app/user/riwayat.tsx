import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  RefreshCw,
} from 'lucide-react-native';
import {
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
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import {
  currentMonth,
  formatDateKey,
  formatMonth,
  formatTime,
  shiftMonth,
} from '@/lib/format';
import type { HistoryResponse } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { colors, font, radius, spacing } from '@/theme';

export default function RiwayatScreen() {
  const router = useRouter();
  const token = useAuth((state) => state.token);
  const signOut = useAuth((state) => state.signOut);

  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (soft = false) => {
      if (!token) return;
      if (soft) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        setData(await api.history(token, month));
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          await signOut();
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Gagal memuat riwayat.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [month, signOut, token]
  );

  useEffect(() => {
    load();
  }, [load]);

  const isCurrentMonth = month >= currentMonth();

  if (loading && !data) {
    return <LoadingView label="Memuat riwayat absensi..." />;
  }

  const records = data?.records || [];
  const summary = data?.summary;

  return (
    <Screen>
      <PageHeader
        eyebrow="RIWAYAT"
        title="Riwayat absensi"
        subtitle="Rekap kehadiran, jam kerja, dan lokasi absensi kamu."
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Muat ulang riwayat"
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

      <Card style={styles.monthCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bulan sebelumnya"
          onPress={() => setMonth((value) => shiftMonth(value, -1))}
          style={styles.monthButton}
        >
          <ChevronLeft size={18} color={colors.ink} />
        </Pressable>
        <View style={styles.monthCenter}>
          <CalendarDays size={17} color={colors.brand} />
          <Text style={styles.monthText}>{formatMonth(month)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bulan berikutnya"
          onPress={() => !isCurrentMonth && setMonth((value) => shiftMonth(value, 1))}
          style={[styles.monthButton, isCurrentMonth && styles.monthButtonDisabled]}
          disabled={isCurrentMonth}
        >
          <ChevronRight size={18} color={isCurrentMonth ? colors.faint : colors.ink} />
        </Pressable>
      </Card>

      {error ? <Notice tone="error" message={error} /> : null}

      <View style={styles.statsRow}>
        <StatCard
          label="Hadir"
          value={summary?.present ?? 0}
          hint="Hari dengan absen masuk"
          tone="success"
          icon={<CalendarDays size={19} color={colors.success} />}
        />
        <StatCard
          label="Terlambat"
          value={summary?.late ?? 0}
          hint="Melewati jam masuk"
          tone="warning"
          icon={<Clock size={19} color={colors.accent} />}
        />
        <StatCard
          label="Total durasi"
          value={summary?.total_duration || '0j 0m'}
          hint="Akumulasi jam kerja"
          tone="info"
          icon={<Clock size={19} color={colors.info} />}
        />
      </View>

      {records.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays size={26} color={colors.brand} />}
            title="Belum ada riwayat"
            description={`Tidak ada catatan absensi pada ${formatMonth(month)}. Coba pilih bulan lain.`}
          />
        </Card>
      ) : (
        <View style={styles.list}>
          {records.map((record) => (
            <Card key={record.id} style={styles.item}>
              <View style={styles.itemHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemDate}>{formatDateKey(record.tanggal)}</Text>
                  <Text style={styles.itemDay}>{record.hari}</Text>
                </View>
                <View style={styles.badges}>
                  {record.ongoing ? <Badge label="Belum pulang" tone="info" /> : null}
                  <Badge
                    label={record.status}
                    tone={record.status === 'Terlambat' ? 'warning' : 'success'}
                  />
                </View>
              </View>

              <View style={styles.times}>
                <View style={styles.timeBlock}>
                  <Text style={styles.timeLabel}>Masuk</Text>
                  <Text style={styles.timeValue}>{formatTime(record.check_in_at)}</Text>
                </View>
                <View style={styles.timeArrow} />
                <View style={styles.timeBlock}>
                  <Text style={styles.timeLabel}>Pulang</Text>
                  <Text style={styles.timeValue}>{formatTime(record.check_out_at)}</Text>
                </View>
                <View style={styles.durationBlock}>
                  <Text style={styles.timeLabel}>Durasi</Text>
                  <Text style={styles.durationValue}>{record.duration || '—'}</Text>
                </View>
              </View>

              {record.check_in_photo || record.check_out_photo ? (
                <View style={styles.photos}>
                  {record.check_in_photo ? (
                    <Image source={{ uri: record.check_in_photo }} style={styles.photo} />
                  ) : null}
                  {record.check_out_photo ? (
                    <Image source={{ uri: record.check_out_photo }} style={styles.photo} />
                  ) : null}
                  <Text style={styles.photoHint}>Foto absensi</Text>
                </View>
              ) : null}

              {record.check_in_address ? (
                <View style={styles.address}>
                  <MapPin size={13} color={colors.muted} />
                  <Text style={styles.addressText} numberOfLines={2}>
                    {record.check_in_address}
                  </Text>
                </View>
              ) : null}

              {record.lokasi_tidak_tersedia ? (
                <Text style={styles.locationWarning}>Lokasi tidak tersedia saat absen.</Text>
              ) : null}
            </Card>
          ))}
        </View>
      )}

      <Button
        label="Kembali ke absensi"
        variant="secondary"
        onPress={() => router.push('/user')}
      />

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
  monthCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  monthButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  monthButtonDisabled: {
    opacity: 0.5,
  },
  monthCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monthText: {
    color: colors.ink,
    fontSize: font.body,
    fontWeight: '700',
    textTransform: 'capitalize',
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
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  itemDate: {
    color: colors.ink,
    fontSize: font.h3,
    fontWeight: '700',
  },
  itemDay: {
    color: colors.muted,
    fontSize: font.small,
    marginTop: 2,
  },
  badges: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  times: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
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
  timeArrow: {
    width: 18,
    height: 2,
    backgroundColor: colors.border,
    marginTop: 10,
  },
  durationBlock: {
    flex: 1,
    gap: 2,
    alignItems: 'flex-end',
  },
  durationValue: {
    color: colors.brand,
    fontSize: font.h3,
    fontWeight: '800',
  },
  photos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  photo: {
    width: 54,
    height: 68,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  photoHint: {
    color: colors.faint,
    fontSize: font.tiny,
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
  locationWarning: {
    color: colors.accent,
    fontSize: font.tiny,
  },
});
