import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock,
  Info,
  MapPin,
  Navigation,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react-native';
import {
  Badge,
  Button,
  Card,
  LoadingView,
  Notice,
  PageFooter,
  PageHeader,
  Screen,
  SectionTitle,
} from '@/components/ui';
import { CameraCapture } from '@/components/CameraCapture';
import { api, ApiError } from '@/lib/api';
import { formatDateKey, formatDistance, formatTime, greeting, todayKey } from '@/lib/format';
import {
  getCurrentPosition,
  haversineMeters,
  LocationError,
  watchPosition,
} from '@/lib/geo';
import type { Position, TodayResponse } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { colors, font, radius, spacing } from '@/theme';

type Feedback = { tone: 'success' | 'error' | 'info' | 'warning'; message: string } | null;

export default function AbsensiScreen() {
  const router = useRouter();
  const token = useAuth((state) => state.token);
  const user = useAuth((state) => state.user);
  const signOut = useAuth((state) => state.signOut);

  const [today, setToday] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState<'in' | 'out' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [clock, setClock] = useState(() => formatTime(new Date().toISOString()));

  const [cameraMode, setCameraMode] = useState<'in' | 'out' | null>(null);

  const load = useCallback(
    async (soft = false) => {
      if (!token) return;
      if (soft) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const data = await api.today(token);
        setToday(data);
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
    [signOut, token]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setClock(formatTime(new Date().toISOString())), 30000);
    return () => clearInterval(timer);
  }, []);

  const handleLocate = useCallback(async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const next = await getCurrentPosition();
      setPosition(next);
    } catch (caught) {
      const message =
        caught instanceof LocationError
          ? caught.message
          : 'Lokasi tidak tersedia. Periksa izin GPS dan koneksi.';
      setLocationError(message);
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    // Generate challenge acak untuk liveness detection setiap kali layar absensi dibuka
    const challengeCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Start countdown timer
    const timer = setTimeout(() => {
      // After 10 seconds, challenge expires, can reset or mark as failed
    }, 10000);

    const stop = watchPosition(
      (next) => {
        setPosition(next);
        setLocationError(null);
      },
      () => undefined
    );

    return () => {
      clearTimeout(timer);
      stop();
    };
  }, []);

  const distance =
    position && today
      ? haversineMeters(position.lat, position.lng, today.office.lat, today.office.lng)
      : null;
  const inside = distance !== null && today ? distance <= today.office.radiusM : false;

  const record = today?.record || null;
  const hasIn = Boolean(record?.check_in_at);
  const hasOut = Boolean(record?.check_out_at);
  const busy = submitting !== null;

  const outside = distance !== null && today !== null && !inside;

  const submit = async (
    type: 'in' | 'out',
    options: { withLocation?: boolean; photo?: string | null } = {}
  ) => {
    const { withLocation = true, photo = null } = options;
    if (!token || busy) return;
    setSubmitting(type);
    setFeedback(null);

    let current = withLocation ? position : null;

    if (withLocation && !current) {
      try {
        current = await getCurrentPosition();
        setPosition(current);
        setLocationError(null);
      } catch (caught) {
        const message =
          caught instanceof LocationError
            ? caught.message
            : 'Lokasi tidak tersedia. Periksa izin GPS dan koneksi.';
        setLocationError(message);
        setSubmitting(null);
        setFeedback({
          tone: 'error',
          message: `${message} Kamu masih bisa absen tanpa lokasi jika diizinkan.`,
        });
        return;
      }
    }

    if (current && today) {
      const currentDistance = haversineMeters(
        current.lat,
        current.lng,
        today.office.lat,
        today.office.lng
      );
      if (currentDistance > today.office.radiusM) {
        setSubmitting(null);
        setFeedback({
          tone: 'error',
          message: `Kamu berada ${formatDistance(currentDistance)} dari ${today.office.name}. Radius absensi ${formatDistance(today.office.radiusM)}.`,
        });
        return;
      }
    }

    try {
      const result =
        type === 'in'
          ? await api.checkIn(token, withLocation ? current : null, photo)
          : await api.checkOut(token, withLocation ? current : null, photo);
      setFeedback({ tone: 'success', message: result.message });
      await load(true);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        await signOut();
        return;
      }
      setFeedback({
        tone: 'error',
        message: caught instanceof Error ? caught.message : 'Absensi gagal. Coba lagi.',
      });
    } finally {
      setSubmitting(null);
    }
  };

  if (loading && !today) {
    return <LoadingView label="Memuat status absensi..." />;
  }

  if (error && !today) {
    return (
      <Screen>
        <PageHeader eyebrow="ABSENSI" title="Absensi" />
        <Notice tone="error" title="Tidak bisa memuat data" message={error} />
        <Button label="Coba lagi" onPress={() => load()} />
      </Screen>
    );
  }

  const firstName = user?.nama?.split(' ')[0] || 'Karyawan';
  const office = today?.office;

  return (
    <Screen>
      <PageHeader
        eyebrow="ABSENSI"
        title={`${greeting()}, ${firstName}`}
        subtitle={formatDateKey(today?.date || todayKey())}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Muat ulang data absensi"
            onPress={() => load(true)}
            style={styles.refresh}
          >
            {refreshing ? <ActivityIndicator size="small" color={colors.brand} /> : <RefreshCw size={18} color={colors.brand} />}
          </Pressable>
        }
      />

      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroBadge}>
            <Clock size={13} color={colors.white} />
            <Text style={styles.heroBadgeText}>{today?.hari || 'Hari ini'}</Text>
          </View>
          <Text style={styles.heroOffice}>{office?.name || 'Kantor'}</Text>
        </View>

        <View style={styles.clockRow}>
          <Text style={styles.clock}>{clock}</Text>
          <Text style={styles.clockZone}>WIB</Text>
        </View>

        <View style={styles.heroBottom}>
          <View style={styles.heroLocation}>
            <MapPin size={15} color="#9FE3D8" />
            <Text style={styles.heroLocationText}>
              {distance === null
                ? 'Lokasi belum aktif'
                : `${formatDistance(distance)} dari kantor`}
            </Text>
          </View>
          <View
            style={[
              styles.heroStatus,
              { backgroundColor: inside ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.08)' },
            ]}
          >
            <View
              style={[
                styles.dot,
                { backgroundColor: inside ? '#4ADE80' : distance === null ? '#94A3B8' : '#FBBF24' },
              ]}
            />
            <Text style={styles.heroStatusText}>
              {inside ? 'Dalam radius' : distance === null ? 'GPS belum aktif' : 'Di luar radius'}
            </Text>
          </View>
        </View>
      </View>

      {feedback ? <Notice tone={feedback.tone} message={feedback.message} /> : null}

      <Card>
        <SectionTitle
          title="Status hari ini"
          hint={record ? formatDateKey(record.tanggal) : 'Belum ada catatan'}
          right={
            record?.check_in_at ? (
              <Badge
                label={record.status}
                tone={record.status === 'Terlambat' ? 'warning' : 'success'}
              />
            ) : (
              <Badge label="Belum absen" tone="muted" />
            )
          }
        />

        <View style={styles.timeRow}>
          <View style={styles.timeBox}>
            <Text style={styles.timeLabel}>Masuk</Text>
            <Text style={styles.timeValue}>{formatTime(record?.check_in_at)}</Text>
            <Text style={styles.timeHint}>
              {record?.check_in_at ? 'Tercatat server' : 'Belum absen masuk'}
            </Text>
          </View>
          <View style={styles.timeDivider} />
          <View style={styles.timeBox}>
            <Text style={styles.timeLabel}>Pulang</Text>
            <Text style={styles.timeValue}>{formatTime(record?.check_out_at)}</Text>
            <Text style={styles.timeHint}>
              {record?.check_out_at
                ? 'Tercatat server'
                : record?.check_in_at
                  ? 'Belum absen pulang'
                  : 'Belum absen'}
            </Text>
          </View>
          <View style={styles.timeDivider} />
          <View style={styles.timeBox}>
            <Text style={styles.timeLabel}>Durasi</Text>
            <Text style={styles.timeValue}>{record?.duration || '—'}</Text>
            <Text style={styles.timeHint}>Jam kerja</Text>
          </View>
        </View>

        {record?.check_in_address ? (
          <View style={styles.addressRow}>
            <MapPin size={14} color={colors.muted} />
            <Text style={styles.addressText}>{record.check_in_address}</Text>
          </View>
        ) : null}

        {record?.check_in_photo || record?.check_out_photo ? (
          <View style={styles.photoRow}>
            {record?.check_in_photo ? (
              <View style={styles.photoItem}>
                <Image source={{ uri: record.check_in_photo }} style={styles.photo} />
                <Text style={styles.photoLabel}>Foto masuk</Text>
              </View>
            ) : null}
            {record?.check_out_photo ? (
              <View style={styles.photoItem}>
                <Image source={{ uri: record.check_out_photo }} style={styles.photo} />
                <Text style={styles.photoLabel}>Foto pulang</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {record?.lokasi_tidak_tersedia ? (
          <View style={styles.warningRow}>
            <AlertCircle size={14} color={colors.accent} />
            <Text style={styles.warningText}>
              Sebagian data lokasi tidak tersedia saat absensi dicatat.
            </Text>
          </View>
        ) : null}
      </Card>

      <Card>
        <SectionTitle
          title={hasOut ? 'Absensi selesai' : hasIn ? 'Waktunya absen pulang' : 'Mulai absensi'}
          hint={
            hasOut
              ? 'Terima kasih, kerja bagus hari ini.'
              : hasIn
                ? 'Pastikan kamu sudah menyelesaikan pekerjaan sebelum pulang.'
                : 'Aktifkan lokasi lalu tekan tombol absen masuk.'
          }
        />

        {hasOut ? (
          <View style={styles.doneBox}>
            <CheckCircle2 size={22} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.doneTitle}>Kamu sudah absen lengkap hari ini</Text>
              <Text style={styles.doneText}>
                Masuk {formatTime(record?.check_in_at)} · Pulang {formatTime(record?.check_out_at)} ·{' '}
                {record?.duration || '—'}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.actionRow}>
            {!hasIn ? (
              <Button
                label={position ? 'Ambil foto & absen masuk' : 'Aktifkan lokasi & absen masuk'}
                onPress={() => (position ? setCameraMode('in') : handleLocate())}
                loading={submitting === 'in' || (locating && !position)}
                disabled={busy || outside || locating}
                icon={
                  position ? (
                    <Camera size={17} color={colors.white} />
                  ) : (
                    <Navigation size={17} color={colors.white} />
                  )
                }
                fullWidth
              />
            ) : (
              <Button
                label={position ? 'Ambil foto & absen pulang' : 'Aktifkan lokasi & absen pulang'}
                onPress={() => (position ? setCameraMode('out') : handleLocate())}
                loading={submitting === 'out' || (locating && !position)}
                disabled={busy || outside || locating}
                icon={
                  position ? (
                    <Camera size={17} color={colors.white} />
                  ) : (
                    <Navigation size={17} color={colors.white} />
                  )
                }
                fullWidth
              />
            )}
          </View>
        )}

        {outside ? (
          <Notice
            tone="warning"
            message={`Posisi kamu ${formatDistance(distance)} dari kantor. Mendekatlah ke area absensi (${formatDistance(office?.radiusM || 0)}).`}
          />
        ) : null}

        {!hasOut && locationError ? (
          <Pressable
            onPress={() => submit(hasIn ? 'out' : 'in', { withLocation: false })}
            style={styles.noLocation}
          >
            <Text style={styles.noLocationText}>
              {hasIn ? 'Absen pulang tanpa lokasi' : 'Absen masuk tanpa lokasi'}
            </Text>
          </Pressable>
        ) : null}

        {hasOut ? (
          <Button
            label="Lihat riwayat"
            variant="secondary"
            onPress={() => router.push('/user/riwayat')}
          />
        ) : null}
      </Card>

      <Card>
        <SectionTitle
          title="Lokasi & radius"
          hint="Validasi dilakukan di server memakai koordinat kantor."
          right={<Badge label={inside ? 'Dalam area' : 'Belum terverifikasi'} tone={inside ? 'success' : 'muted'} />}
        />

        <View style={styles.locationGrid}>
          <View style={styles.locationItem}>
            <Text style={styles.locationLabel}>Status GPS</Text>
            <Text style={styles.locationValue}>
              {position ? 'Aktif' : locating ? 'Mencari...' : 'Belum aktif'}
            </Text>
          </View>
          <View style={styles.locationItem}>
            <Text style={styles.locationLabel}>Akurasi</Text>
            <Text style={styles.locationValue}>
              {position?.accuracy ? `±${position.accuracy} m` : '—'}
            </Text>
          </View>
          <View style={styles.locationItem}>
            <Text style={styles.locationLabel}>Jarak ke kantor</Text>
            <Text style={styles.locationValue}>{formatDistance(distance)}</Text>
          </View>
          <View style={styles.locationItem}>
            <Text style={styles.locationLabel}>Radius izin</Text>
            <Text style={styles.locationValue}>{formatDistance(office?.radiusM)}</Text>
          </View>
        </View>

        <Button
          label={position ? 'Perbarui lokasi' : 'Aktifkan lokasi'}
          variant="secondary"
          onPress={handleLocate}
          loading={locating}
          icon={<MapPin size={17} color={colors.ink} />}
          fullWidth
        />

        {locationError ? <Notice tone="error" message={locationError} /> : null}
      </Card>

      <Card style={styles.tipCard}>
        <View style={styles.tipIcon}>
          <Info size={18} color={colors.info} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.tipTitle}>Tips absensi lancar</Text>
          <Text style={styles.tipText}>
            Nyalakan GPS, izinkan akses lokasi, dan berdiri di dalam radius kantor. Jam absensi
            memakai waktu server, bukan jam perangkat.
          </Text>
        </View>
      </Card>

      <View style={styles.secureRow}>
        <ShieldCheck size={14} color={colors.faint} />
        <Text style={styles.secureText}>Data absensi disimpan di server perusahaan.</Text>
      </View>

      <CameraCapture
        visible={cameraMode !== null}
        title={cameraMode === 'in' ? 'Foto absen masuk' : 'Foto absen pulang'}
        subtitle="Foto jadi bukti kehadiran dan disimpan di server. Pastikan wajah terlihat jelas."
        busy={busy}
        onCancel={() => setCameraMode(null)}
        onConfirm={(dataUrl) => {
          const mode = cameraMode;
          setCameraMode(null);
          if (mode) submit(mode, { photo: dataUrl });
        }}
        onSkip={() => {
          const mode = cameraMode;
          setCameraMode(null);
          if (mode) submit(mode, { photo: null });
        }}
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
  hero: {
    backgroundColor: colors.ink,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
    overflow: 'hidden',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  heroBadgeText: {
    color: colors.white,
    fontSize: font.tiny,
    fontWeight: '700',
  },
  heroOffice: {
    color: '#9FE3D8',
    fontSize: font.small,
    fontWeight: '600',
  },
  clockRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  clock: {
    color: colors.white,
    fontSize: 56,
    lineHeight: 62,
    fontWeight: '800',
    letterSpacing: -2,
  },
  clockZone: {
    color: '#9FE3D8',
    fontSize: font.small,
    fontWeight: '700',
    marginBottom: 12,
  },
  heroBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  heroLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroLocationText: {
    color: '#D7E3EA',
    fontSize: font.small,
  },
  heroStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  heroStatusText: {
    color: colors.white,
    fontSize: font.tiny,
    fontWeight: '600',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: spacing.lg,
  },
  timeBox: {
    flex: 1,
    gap: 4,
  },
  timeDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  timeLabel: {
    color: colors.muted,
    fontSize: font.small,
  },
  timeValue: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  timeHint: {
    color: colors.faint,
    fontSize: font.tiny,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addressText: {
    flex: 1,
    color: colors.muted,
    fontSize: font.small,
    lineHeight: 18,
  },
  photoRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  photoItem: {
    width: 76,
    gap: 4,
  },
  photo: {
    width: 76,
    height: 96,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  photoLabel: {
    color: colors.muted,
    fontSize: font.tiny,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: spacing.sm,
  },
  warningText: {
    flex: 1,
    color: colors.accent,
    fontSize: font.small,
    lineHeight: 18,
  },
  actionRow: {
    marginTop: spacing.lg,
  },
  doneBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: colors.successSoft,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  doneTitle: {
    color: colors.success,
    fontSize: font.body,
    fontWeight: '700',
  },
  doneText: {
    color: colors.success,
    fontSize: font.small,
    marginTop: 3,
    lineHeight: 18,
  },
  noLocation: {
    marginTop: spacing.md,
    alignSelf: 'center',
    padding: 6,
  },
  noLocationText: {
    color: colors.muted,
    fontSize: font.small,
    textDecorationLine: 'underline',
  },
  locationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  locationItem: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 3,
  },
  locationLabel: {
    color: colors.muted,
    fontSize: font.tiny,
  },
  locationValue: {
    color: colors.ink,
    fontSize: font.body,
    fontWeight: '700',
  },
  tipCard: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    backgroundColor: colors.infoSoft,
    borderColor: '#BFDBFE',
  },
  tipIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipTitle: {
    color: colors.info,
    fontSize: font.body,
    fontWeight: '700',
  },
  tipText: {
    color: colors.info,
    fontSize: font.small,
    lineHeight: 18,
    marginTop: 3,
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
  },
});