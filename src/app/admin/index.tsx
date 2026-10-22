import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  TrendingUp,
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
  SectionTitle,
  StatCard,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDateKey, formatMonth, shiftMonth, formatTime, todayKey } from '@/lib/format';
import type { AdminSummary } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { colors, font, radius, spacing } from '@/theme';

export default function AdminDashboardScreen() {
  const token = useAuth((state) => state.token);
  const user = useAuth((state) => state.user);
  const signOut = useAuth((state) => state.signOut);

  const [data, setData] = useState<AdminSummary | null>(null);
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
        setData(await api.adminSummary(token, todayKey()));
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          await signOut();
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Gagal memuat dashboard.');
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

  if (loading && !data) {
    return <LoadingView label="Memuat dashboard..." />;
  }

  if (error && !data) {
    return (
      <Screen>
        <PageHeader eyebrow="ADMIN" title="Dashboard" />
        <Notice tone="error" title="Tidak bisa memuat dashboard" message={error} />
        <Button label="Coba lagi" onPress={() => load()} />
      </Screen>
    );
  }

  const totals = data?.totals;
  const trend = data?.trend || [];
  const maxPresent = Math.max(1, ...trend.map((point) => point.present));
  const firstName = user?.nama?.split(' ')[0] || 'Admin';

  return (
    <Screen>
      <PageHeader
        eyebrow="ADMIN"
        title={`Halo, ${firstName}`}
        subtitle={`Ringkasan kehadiran ${formatDateKey(data?.date || todayKey())}.`}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Muat ulang dashboard"
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
          value={totals?.employees ?? 0}
          hint="Data karyawan aktif"
          tone="brand"
          icon={<Users size={19} color={colors.brand} />}
        />
        <StatCard
          label="Hadir hari ini"
          value={totals?.present ?? 0}
          hint="Sudah absen masuk"
          tone="success"
          icon={<CheckCircle2 size={19} color={colors.success} />}
        />
        <StatCard
          label="Terlambat"
          value={totals?.late ?? 0}
          hint="Melewati jam masuk"
          tone="warning"
          icon={<Clock size={19} color={colors.accent} />}
        />
        <StatCard
          label="Belum absen"
          value={totals?.absent ?? 0}
          hint="Belum ada catatan"
          tone="danger"
          icon={<AlertCircle size={19} color={colors.danger} />}
        />
      </View>

      {totals && totals.not_checked_out > 0 ? (
        <Notice
          tone="warning"
          message={`${totals.not_checked_out} karyawan sudah absen masuk tetapi belum absen pulang.`}
        />
      ) : null}

      <Card>
        <SectionTitle
          title="Tren kehadiran"
          hint="Jumlah karyawan yang absen masuk dalam 7 hari terakhir."
          right={
            <View style={styles.trendLegend}>
              <View style={[styles.legendDot, { backgroundColor: colors.brand }]} />
              <Text style={styles.legendText}>Hadir</Text>
              <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
              <Text style={styles.legendText}>Terlambat</Text>
            </View>
          }
        />

        <View style={styles.chart}>
          {trend.map((point) => {
            const presentHeight = Math.max(4, (point.present / maxPresent) * 120);
            const lateHeight = Math.max(0, (point.late / maxPresent) * 120);
            return (
              <View key={point.date} style={styles.chartColumn}>
                <Text style={styles.chartValue}>{point.present}</Text>
                <View style={styles.chartTrack}>
                  <View
                    style={[
                      styles.chartBar,
                      { height: presentHeight, backgroundColor: colors.brand },
                    ]}
                  />
                  {lateHeight > 0 ? (
                    <View
                      style={[
                        styles.chartLate,
                        { height: Math.min(lateHeight, presentHeight), backgroundColor: colors.accent },
                      ]}
                    />
                  ) : null}
                </View>
                <Text style={styles.chartLabel}>{formatMonth(point.date)}</Text>
              </View>
            );
          })}
        </View>
      </Card>

      <View style={styles.twoColumn}>
        <Card style={styles.recentCard}>
          <SectionTitle title="Aktivitas terbaru" hint="Absen masuk terakhir hari ini." />
          {data?.recent?.length ? (
            <View style={styles.recentList}>
              {data.recent.map((record) => (
                <View key={record.id} style={styles.recentRow}>
                  <Avatar
                    uri={record.employee?.photo_url}
                    name={record.employee?.nama}
                    size={40}
                  />
                  <View style={styles.recentText}>
                    <Text style={styles.recentName} numberOfLines={1}>
                      {record.employee?.nama || 'Karyawan'}
                    </Text>
                    <Text style={styles.recentMeta} numberOfLines={1}>
                      {record.employee?.nip || '—'} · {formatTime(record.check_in_at)}
                    </Text>
                  </View>
                  <Badge
                    label={record.status}
                    tone={record.status === 'Terlambat' ? 'warning' : 'success'}
                  />
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              title="Belum ada aktivitas"
              description="Belum ada karyawan yang absen masuk hari ini."
            />
          )}
        </Card>

        <Card style={styles.insightCard}>
          <View style={styles.insightIcon}>
            <TrendingUp size={20} color={colors.info} />
          </View>
          <Text style={styles.insightTitle}>Ringkasan cepat</Text>
          <Text style={styles.insightText}>
            {totals
              ? `${totals.present} dari ${totals.employees} karyawan sudah absen masuk hari ini. ${totals.late} di antaranya terlambat.`
              : 'Data belum tersedia.'}
          </Text>
          <View style={styles.insightStats}>
            <View>
              <Text style={styles.insightValue}>{totals?.present ?? 0}</Text>
              <Text style={styles.insightLabel}>Hadir</Text>
            </View>
            <View>
              <Text style={styles.insightValue}>{totals?.absent ?? 0}</Text>
              <Text style={styles.insightLabel}>Belum absen</Text>
            </View>
          </View>
        </Card>
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
  trendLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: colors.muted,
    fontSize: font.tiny,
    marginRight: spacing.sm,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xl,
    minHeight: 160,
  },
  chartColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  chartValue: {
    color: colors.inkSoft,
    fontSize: font.tiny,
    fontWeight: '700',
  },
  chartTrack: {
    height: 120,
    width: '100%',
    maxWidth: 46,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  chartBar: {
    width: '100%',
    borderRadius: radius.sm,
  },
  chartLate: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    opacity: 0.75,
  },
  chartLabel: {
    color: colors.muted,
    fontSize: 10,
  },
  twoColumn: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    alignItems: 'stretch',
  },
  recentCard: {
    flex: 2,
    minWidth: 300,
  },
  recentList: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  recentText: {
    flex: 1,
    minWidth: 0,
  },
  recentName: {
    color: colors.ink,
    fontSize: font.body,
    fontWeight: '700',
  },
  recentMeta: {
    color: colors.muted,
    fontSize: font.small,
    marginTop: 2,
  },
  insightCard: {
    flex: 1,
    minWidth: 240,
    gap: spacing.sm,
  },
  insightIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.infoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightTitle: {
    color: colors.ink,
    fontSize: font.h3,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  insightText: {
    color: colors.muted,
    fontSize: font.small,
    lineHeight: 19,
  },
  insightStats: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  insightValue: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
  },
  insightLabel: {
    color: colors.muted,
    fontSize: font.tiny,
  },
});
