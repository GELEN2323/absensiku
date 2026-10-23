import { useCallback, useEffect, useMemo, useState } from 'react';
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
  UserRoundCheck,
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
import { FaceLiveness } from '@/components/FaceLiveness';
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

const MAX_ACCURACY_M = 50;
const MAX_RADIUS_TOLERANCE_M = 25;

export default function AbsensiScreen() {
  const router = useRouter();
  const token = useAuth((state) => state.token);
  const user = useAuth((state) => state.user);
  const refreshUser = useAuth((state) => state.refreshUser);
  const signOut = useAuth((state) => state.signOut);

  const [today, setToday] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [faceRegistered, setFaceRegistered] = useState<boolean | null>(null);
  const [faceError, setFaceError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState<'in' | 'out' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [clock, setClock] = useState(() => formatTime(new Date().toISOString()));

  const [livenessMode, setLivenessMode] = useState<'in' | 'out' | null>(null);

  const load = useCallback(
    async (soft = false, at: Position | null = null) => {
      if (!token) return;
      if (soft) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const data = await api.today(token, at);
        setToday(data);

        // Status wajah dipisah: kegagalan di sini tidak boleh menghilangkan
        // data absensi yang sudah berhasil dimuat.
        try {
          const face = await api.faceStatus(token);
          setFaceRegistered(face.face_registered);
          setFaceError(null);
        } catch (faceCaught) {
          if (faceCaught instanceof ApiError && faceCaught.status === 401) {
            await signOut();
            return;
          }
          setFaceRegistered(false);
          setFaceError(
            faceCaught instanceof Error
              ? faceCaught.message
              : 'Status pendaftaran wajah tidak bisa dimuat.'
          );
        }
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
      if (next.mocked) {
        setLocationError('Lokasi palsu (mock GPS) terdeteksi. Matikan aplikasi Fake GPS.');
      }
      // Minta server menentukan titik absen terdekat untuk posisi ini.
      if (token) {
        api
          .today(token, next)
          .then((data) => setToday(data))
          .catch(() => undefined);
      }
    } catch (caught) {
      const message =
        caught instanceof LocationError
          ? caught.message
          : 'Lokasi tidak tersedia. Periksa izin GPS dan koneksi.';
      setLocationError(message);
    } finally {
      setLocating(false);
    }
  }, [token]);

  useEffect(() => {
    const stop = watchPosition(
      (next) => {
        setPosition(next);
        setLocationError(next.mocked ? 'Lokasi palsu (mock GPS) terdeteksi.' : null);
      },
      () => undefined
    );

    return stop;
  }, []);

  const target = useMemo(() => {
    if (today?.nearest) {
      return {
        name: today.nearest.nama,
        lat: today.nearest.lat,
        lng: today.nearest.lng,
        radiusM: today.nearest.radius_meter,
      };
    }
    if (today?.office) {
      return {
        name: today.office.name,
        lat: today.office.lat,
        lng: today.office.lng,
        radiusM: today.office.radiusM,
      };
    }
    return null;
  }, [today]);

  const distance =
    position && target ? haversineMeters(position.lat, position.lng, target.lat, target.lng) : null;

  const radiusTolerance =
    position?.accuracy === null || position?.accuracy === undefined
      ? 0
      : Math.min(position.accuracy, MAX_RADIUS_TOLERANCE_M);
  const inside = distance !== null && target ? distance <= target.radiusM + radiusTolerance : false;

  const accuracyTooLow =
    position?.accuracy !== null &&
    position?.accuracy !== undefined &&
    position.accuracy > MAX_ACCURACY_M;
  const mocked = position?.mocked === true;

  const record = today?.record || null;
  const hasIn = Boolean(record?.check_in_at);
  const hasOut = Boolean(record?.check_out_at);
  const busy = submitting !== null || livenessMode !== null;

  const outside = distance !== null && target !== null && !inside;

  const beginVerification = (type: 'in' | 'out') => {
    setFeedback(null);

    if (!position) {
      handleLocate();
      return;
    }
    if (mocked) {
      setFeedback({
        tone: 'error',
        message: 'Lokasi palsu (mock GPS) terdeteksi. Matikan aplikasi Fake GPS lalu coba lagi.',
      });
      return;
    }
    if (accuracyTooLow) {
      setFeedback({
        tone: 'warning',
        message: `Akurasi GPS ±${position.accuracy} m. Tunggu sampai akurasi ≤ ${MAX_ACCURACY_M} m, lalu coba lagi.`,
      });
      return;
    }
    if (!inside && target) {
      setFeedback({
        tone: 'error',
        message: `Kamu berada ${formatDistance(distance)} dari ${target.name}. Radius absensi ${formatDistance(target.radiusM)}.`,
      });
      return;
    }
    if (!faceRegistered) {
      setFeedback({
        tone: 'warning',
        message: faceError
          ? `Verifikasi wajah belum bisa dipakai: ${faceError}`
          : 'Registrasikan wajah dulu sebelum absen.',
      });
      return;
    }

    setLivenessMode(type);
  };

  const submit = async (
    type: 'in' | 'out',
    payload: { verificationId: string; photo: string }
  ) => {
    if (!token || !position) return;
    setSubmitting(type);
    setFeedback(null);

    try {
      const result =
        type === 'in'
          ? await api.checkIn(token, position, payload.photo, payload.verificationId)
          : await api.checkOut(token, position, payload.photo, payload.verificationId);
      setFeedback({ tone: 'success', message: result.message });
      await load(true, position);
      refreshUser().catch(() => undefined);
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
          <Text style={styles.heroOffice}>{target?.name || 'Kantor'}</Text>
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
                : `${formatDistance(distance)} dari ${target?.name || 'kantor'}`}
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
                {
                  backgroundColor: mocked
                    ? '#F87171'
                    : inside
                      ? '#4ADE80'
                      : distance === null
                        ? '#94A3B8'
                        : '#FBBF24',
                },
              ]}
            />
            <Text style={styles.heroStatusText}>
              {mocked
                ? 'GPS palsu'
                : accuracyTooLow
                  ? 'Akurasi rendah'
                  : inside
                    ? 'Dalam radius'
                    : distance === null
                      ? 'GPS belum aktif'
                      : 'Di luar radius'}
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
                label={
                  position ? 'Verifikasi wajah & absen masuk' : 'Aktifkan lokasi & absen masuk'
                }
                onPress={() => (position ? beginVerification('in') : handleLocate())}
                loading={submitting === 'in' || (locating && !position)}
                disabled={busy || outside || locating || !faceRegistered}
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
                label={
                  position ? 'Verifikasi wajah & absen pulang' : 'Aktifkan lokasi & absen pulang'
                }
                onPress={() => (position ? beginVerification('out') : handleLocate())}
                loading={submitting === 'out' || (locating && !position)}
                disabled={busy || outside || locating || !faceRegistered}
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

        {faceRegistered === false && !hasOut ? (
          <Notice
            tone="warning"
            title="Wajah belum terdaftar"
            message={
              faceError ||
              'Absensi wajib memakai verifikasi wajah. Daftarkan wajah sekali, lalu absen seperti biasa.'
            }
          />
        ) : null}

        {faceRegistered === false && !hasOut ? (
          <Button
            label="Daftarkan wajah sekarang"
            variant="secondary"
            onPress={() => router.push('/user/wajah')}
            icon={<UserRoundCheck size={17} color={colors.ink} />}
            fullWidth
          />
        ) : null}

        {outside ? (
          <Notice
            tone="warning"
            message={`Posisi kamu ${formatDistance(distance)} dari ${target?.name || 'kantor'}. Mendekatlah ke area absensi (${formatDistance(target?.radiusM || 0)}).`}
          />
        ) : null}

        {accuracyTooLow ? (
          <Notice
            tone="warning"
            message={`Akurasi GPS ±${position?.accuracy} m. Tunggu sampai akurasi ≤ ${MAX_ACCURACY_M} m sebelum absen.`}
          />
        ) : null}

        {mocked ? (
          <Notice
            tone="error"
            message="Lokasi palsu (mock GPS) terdeteksi. Matikan aplikasi Fake GPS lalu perbarui lokasi."
          />
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
          hint="Validasi radius dan waktu dilakukan di server."
          right={
            <Badge
              label={mocked ? 'GPS palsu' : inside ? 'Dalam area' : 'Belum terverifikasi'}
              tone={mocked ? 'danger' : inside ? 'success' : 'muted'}
            />
          }
        />

        <View style={styles.locationGrid}>
          <View style={styles.locationItem}>
            <Text style={styles.locationLabel}>Status GPS</Text>
            <Text style={styles.locationValue}>
              {mocked ? 'Palsu' : position ? 'Aktif' : locating ? 'Mencari...' : 'Belum aktif'}
            </Text>
          </View>
          <View style={styles.locationItem}>
            <Text style={styles.locationLabel}>Akurasi</Text>
            <Text style={[styles.locationValue, accuracyTooLow && styles.locationValueWarning]}>
              {position?.accuracy !== null && position?.accuracy !== undefined
                ? `±${position.accuracy} m`
                : '—'}
            </Text>
          </View>
          <View style={styles.locationItem}>
            <Text style={styles.locationLabel}>Titik absen terdekat</Text>
            <Text style={styles.locationValue} numberOfLines={1}>
              {target?.name || '—'}
            </Text>
          </View>
          <View style={styles.locationItem}>
            <Text style={styles.locationLabel}>Jarak / radius</Text>
            <Text style={styles.locationValue}>
              {formatDistance(distance)} / {formatDistance(target?.radiusM)}
            </Text>
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

      <Card>
        <SectionTitle
          title="Verifikasi wajah"
          hint="Liveness acak + pencocokan wajah di server."
          right={
            <Badge
              label={faceRegistered ? 'Siap' : 'Belum siap'}
              tone={faceRegistered ? 'success' : 'warning'}
            />
          }
        />
        <View style={styles.faceRow}>
          <View style={styles.faceIcon}>
            <ShieldCheck size={22} color={faceRegistered ? colors.success : colors.accent} />
          </View>
          <Text style={styles.faceText}>
            {faceRegistered
              ? 'Wajah sudah terdaftar. Setiap absen memakai tantangan liveness acak dan foto terwatermark NIK + waktu server.'
              : faceError ||
                'Daftarkan wajah 3 pose (depan, kiri, kanan) sebelum bisa absen. Prosesnya hanya sekali.'}
          </Text>
        </View>
        <Button
          label={faceRegistered ? 'Perbarui data wajah' : 'Daftarkan wajah'}
          variant="secondary"
          onPress={() => router.push('/user/wajah')}
          icon={<UserRoundCheck size={17} color={colors.ink} />}
          fullWidth
        />
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

      <FaceLiveness
        visible={livenessMode !== null}
        token={token}
        title={livenessMode === 'in' ? 'Verifikasi wajah · absen masuk' : 'Verifikasi wajah · absen pulang'}
        subtitle="Kamera akan merekam beberapa frame. Ikuti tantangan liveness di layar."
        onCancel={() => setLivenessMode(null)}
        onVerified={({ verificationId, photo }) => {
          const mode = livenessMode;
          setLivenessMode(null);
          if (mode) submit(mode, { verificationId, photo });
        }}
        onBlocked={(message) => setFeedback({ tone: 'error', message })}
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
  locationValueWarning: {
    color: colors.accent,
  },
  faceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.md,
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
    fontSize: font.small,
    lineHeight: 18,
    paddingTop: 2,
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