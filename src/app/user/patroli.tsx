import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Camera,
  CheckCircle2,
  Clock,
  MapPin,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
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
  ProgressBar,
  Screen,
  SectionTitle,
} from '@/components/ui';
import { CameraCapture } from '@/components/CameraCapture';
import PatrolMap from '@/components/PatrolMap';
import { api, ApiError } from '@/lib/api';
import { formatDateKey, formatDistance, formatTime } from '@/lib/format';
import {
  getCurrentPosition,
  haversineMeters,
  LocationError,
  watchPosition,
} from '@/lib/geo';
import type {
  PatrolCheckpoint,
  PatrolHistoryResponse,
  PatrolTodayResponse,
  Position,
} from '@/lib/types';
import { useAuth } from '@/store/auth';
import { colors, font, radius, spacing } from '@/theme';

type Feedback = { tone: 'success' | 'error' | 'info' | 'warning'; message: string } | null;

const MAX_ACCURACY_M = 50;
const MAX_RADIUS_TOLERANCE_M = 25;

export default function PatroliScreen() {
  const router = useRouter();
  const token = useAuth((state) => state.token);
  const signOut = useAuth((state) => state.signOut);

  const [today, setToday] = useState<PatrolTodayResponse | null>(null);
  const [history, setHistory] = useState<PatrolHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [faceRegistered, setFaceRegistered] = useState<boolean | null>(null);
  const [faceError, setFaceError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cameraCheckpoint, setCameraCheckpoint] = useState<PatrolCheckpoint | null>(null);
  const [scanning, setScanning] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const load = useCallback(
    async (soft = false) => {
      if (!token) return;
      if (soft) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const data = await api.patrolToday(token);
        setToday(data);
        setSelectedId((current) => current || data.checkpoints[0]?.id || null);
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          await signOut();
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Gagal memuat data patroli.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }

      // Riwayat & status wajah bersifat pelengkap: jangan gagalkan layar utama.
      api
        .patrolHistory(token)
        .then(setHistory)
        .catch(() => undefined);
      api
        .faceStatus(token)
        .then((status) => {
          setFaceRegistered(status.face_registered);
          setFaceError(null);
        })
        .catch((caught) => {
          setFaceRegistered(false);
          setFaceError(
            caught instanceof Error ? caught.message : 'Status wajah tidak bisa dimuat.'
          );
        });
    },
    [signOut, token]
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleLocate = useCallback(async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const next = await getCurrentPosition();
      setPosition(next);
      if (next.mocked) {
        setLocationError('Lokasi palsu (mock GPS) terdeteksi. Matikan aplikasi Fake GPS.');
      }
    } catch (caught) {
      setLocationError(
        caught instanceof LocationError
          ? caught.message
          : 'Lokasi tidak tersedia. Periksa izin GPS dan koneksi.'
      );
    } finally {
      setLocating(false);
    }
  }, []);

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

  const checkpoints = today?.checkpoints || [];
  const progress = today?.progress || { scanned: 0, total: 0, percent: 0, done: false };

  const selected = useMemo(
    () => checkpoints.find((checkpoint) => checkpoint.id === selectedId) || null,
    [checkpoints, selectedId]
  );

  const distanceTo = useCallback(
    (checkpoint: PatrolCheckpoint | null) => {
      if (!position || !checkpoint) return null;
      return haversineMeters(position.lat, position.lng, checkpoint.lat, checkpoint.lng);
    },
    [position]
  );

  const selectedDistance = distanceTo(selected);
  const tolerance =
    position?.accuracy === null || position?.accuracy === undefined
      ? 0
      : Math.min(position.accuracy, MAX_RADIUS_TOLERANCE_M);
  const insideSelected =
    selectedDistance !== null && selected
      ? selectedDistance <= selected.radius_meter + tolerance
      : false;
  const mocked = position?.mocked === true;
  const accuracyTooLow =
    position?.accuracy !== null &&
    position?.accuracy !== undefined &&
    position.accuracy > MAX_ACCURACY_M;

  const openScan = (checkpoint: PatrolCheckpoint) => {
    setFeedback(null);
    setSelectedId(checkpoint.id);

    if (checkpoint.scanned) {
      setFeedback({ tone: 'info', message: `${checkpoint.nama} sudah discan hari ini.` });
      return;
    }
    if (!position) {
      setFeedback({ tone: 'warning', message: 'Aktifkan lokasi dulu untuk scan titik patroli.' });
      handleLocate();
      return;
    }
    if (mocked) {
      setFeedback({
        tone: 'error',
        message: 'Lokasi palsu (mock GPS) terdeteksi. Matikan Fake GPS lalu perbarui lokasi.',
      });
      return;
    }
    if (accuracyTooLow) {
      setFeedback({
        tone: 'warning',
        message: `Akurasi GPS ±${position.accuracy} m. Tunggu sampai akurasi ≤ ${MAX_ACCURACY_M} m.`,
      });
      return;
    }
    const distance = distanceTo(checkpoint);
    const limit =
      checkpoint.radius_meter +
      ((position.accuracy === null ? 0 : Math.min(position.accuracy, MAX_RADIUS_TOLERANCE_M)) || 0);
    if (distance === null || distance > limit) {
      setFeedback({
        tone: 'error',
        message: `Kamu berada ${formatDistance(distance)} dari ${checkpoint.nama}. Radius scan ${formatDistance(checkpoint.radius_meter)}.`,
      });
      return;
    }
    if (!faceRegistered) {
      setFeedback({
        tone: 'warning',
        message:
          faceError ||
          'Registrasikan wajah dulu sebelum scan patroli. Verifikasi wajah memastikan yang scan adalah anggota bertugas.',
      });
      return;
    }

    setCameraCheckpoint(checkpoint);
  };

  const submitScan = async (photo: string) => {
    const checkpoint = cameraCheckpoint;
    setCameraCheckpoint(null);
    if (!checkpoint || !token || !position || scanning) return;

    setScanning(true);
    setFeedback(null);

    try {
      const result = await api.patrolScan(token, {
        checkpointId: checkpoint.id,
        position,
        photo,
      });
      setFeedback({ tone: 'success', message: result.message });
      await load(true);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        await signOut();
        return;
      }
      setFeedback({
        tone: 'error',
        message: caught instanceof Error ? caught.message : 'Scan titik gagal. Coba lagi.',
      });
    } finally {
      setScanning(false);
    }
  };

  if (loading && !today) {
    return <LoadingView label="Memuat titik patroli..." />;
  }

  if (error && !today) {
    return (
      <Screen>
        <PageHeader eyebrow="PATROLI" title="Patroli keamanan" />
        <Notice tone="error" title="Tidak bisa memuat patroli" message={error} />
        <Button label="Coba lagi" onPress={() => load()} />
      </Screen>
    );
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          colors={[colors.brand]}
          tintColor={colors.brand}
        />
      }
    >
      <PageHeader
        eyebrow="PATROLI"
        title="Patroli keamanan"
        subtitle="Datangi titik sesuai urutan, lalu scan dengan selfie verifikasi wajah."
        right={
          <Badge
            label={`${progress.scanned}/${progress.total} titik`}
            tone={progress.done ? 'success' : 'brand'}
          />
        }
      />

      {feedback ? <Notice tone={feedback.tone} message={feedback.message} /> : null}

      {progress.done ? (
        <View style={styles.doneBanner}>
          <CheckCircle2 size={22} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.doneTitle}>Patroli hari ini selesai</Text>
            <Text style={styles.doneText}>
              Semua {progress.total} titik sudah discan. Terima kasih, kerja bagus.
            </Text>
          </View>
        </View>
      ) : null}

      <Card>
        <SectionTitle
          title="Progres hari ini"
          hint={`${today?.hari || 'Hari ini'} · ${formatDateKey(today?.date || '')}`}
          right={<Badge label={`${progress.percent}%`} tone={progress.done ? 'success' : 'info'} />}
        />
        <View style={styles.progressWrap}>
          <ProgressBar percent={progress.percent} tone={progress.done ? colors.success : colors.brand} />
        </View>
        <View style={styles.progressMeta}>
          <Text style={styles.progressText}>{progress.scanned} sudah discan</Text>
          <Text style={styles.progressText}>
            {Math.max(0, progress.total - progress.scanned)} tersisa
          </Text>
        </View>
      </Card>

      <Card>
        <SectionTitle
          title="Peta titik patroli"
          hint="Titik hijau sudah discan hari ini. Ketuk titik untuk memilih."
          right={
            <Badge label={position ? 'GPS aktif' : 'GPS belum aktif'} tone={position ? 'success' : 'muted'} />
          }
        />
        <View style={styles.mapWrap}>
          <PatrolMap
            checkpoints={checkpoints}
            selectedId={selectedId}
            onSelect={(checkpoint) => setSelectedId(checkpoint.id)}
            userPosition={position}
          />
        </View>

        {selected ? (
          <View style={styles.selectedBox}>
            <View style={styles.selectedHead}>
              <View style={styles.selectedIcon}>
                <MapPin size={18} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedTitle}>
                  {selected.urutan}. {selected.nama}
                </Text>
                <Text style={styles.selectedMeta}>
                  Radius {formatDistance(selected.radius_meter)} · Jarak kamu{' '}
                  {formatDistance(selectedDistance)}
                </Text>
              </View>
              <Badge
                label={selected.scanned ? 'Sudah discan' : insideSelected ? 'Dalam radius' : 'Di luar radius'}
                tone={selected.scanned ? 'success' : insideSelected ? 'info' : 'warning'}
              />
            </View>

            <Button
              label={selected.scanned ? 'Titik ini sudah discan' : scanning ? 'Memproses...' : 'Scan Titik Ini'}
              onPress={() => openScan(selected)}
              loading={scanning && cameraCheckpoint === null}
              disabled={selected.scanned || scanning}
              icon={<Camera size={17} color={colors.white} />}
              fullWidth
            />
          </View>
        ) : null}

        {!position ? (
          <Button
            label={locating ? 'Mencari lokasi...' : 'Aktifkan lokasi'}
            variant="secondary"
            onPress={handleLocate}
            loading={locating}
            icon={<MapPin size={17} color={colors.ink} />}
            fullWidth
          />
        ) : null}

        {locationError ? <Notice tone="error" message={locationError} /> : null}
        {mocked ? (
          <Notice
            tone="error"
            message="Lokasi palsu (mock GPS) terdeteksi. Scan patroli ditolak server."
          />
        ) : null}
        {accuracyTooLow ? (
          <Notice
            tone="warning"
            message={`Akurasi GPS ±${position?.accuracy} m. Tunggu sampai akurasi ≤ ${MAX_ACCURACY_M} m.`}
          />
        ) : null}
      </Card>

      {faceRegistered === false ? (
        <Card style={styles.faceCard}>
          <SectionTitle
            title="Wajah belum terdaftar"
            hint="Scan patroli memerlukan pencocokan wajah."
            right={<Badge label="Perlu daftar" tone="warning" />}
          />
          <Text style={styles.faceText}>
            {faceError ||
              'Daftarkan wajah 3 pose dulu. Setelah itu selfie saat scan akan dicocokkan di server.'}
          </Text>
          <Button
            label="Daftarkan wajah"
            variant="secondary"
            onPress={() => router.push('/user/wajah')}
            icon={<UserRoundCheck size={17} color={colors.ink} />}
            fullWidth
          />
        </Card>
      ) : null}

      <Card>
        <SectionTitle
          title={`Daftar titik (${checkpoints.length})`}
          hint="Urutan scan mengikuti nomor titik."
        />
        {checkpoints.length === 0 ? (
          <EmptyState
            icon={<MapPin size={26} color={colors.brand} />}
            title="Belum ada titik patroli"
            description="Admin belum menambahkan titik patroli aktif. Hubungi atasan kamu."
          />
        ) : (
          <View style={styles.checkpointList}>
            {checkpoints.map((checkpoint) => {
              const distance = distanceTo(checkpoint);
              const active = checkpoint.id === selectedId;
              return (
                <Pressable
                  key={checkpoint.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Pilih titik ${checkpoint.urutan} ${checkpoint.nama}`}
                  onPress={() => setSelectedId(checkpoint.id)}
                  style={[styles.checkpoint, active && styles.checkpointActive]}
                >
                  <View style={[styles.checkpointNumber, checkpoint.scanned && styles.checkpointNumberDone]}>
                    {checkpoint.scanned ? (
                      <CheckCircle2 size={16} color={colors.white} />
                    ) : (
                      <Text style={styles.checkpointNumberText}>{checkpoint.urutan}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkpointName}>{checkpoint.nama}</Text>
                    <Text style={styles.checkpointMeta}>
                      {formatDistance(checkpoint.radius_meter)} ·{' '}
                      {distance === null ? 'jarak belum diketahui' : `${formatDistance(distance)} dari kamu`}
                    </Text>
                    {checkpoint.scanned_at ? (
                      <Text style={styles.checkpointScanned}>
                        Discan {formatTime(checkpoint.scanned_at)} WIB
                      </Text>
                    ) : null}
                  </View>
                  <Badge
                    label={checkpoint.scanned ? 'Selesai' : active ? 'Dipilih' : 'Menunggu'}
                    tone={checkpoint.scanned ? 'success' : active ? 'brand' : 'muted'}
                  />
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>

      <Card>
        <SectionTitle
          title="Riwayat patroli"
          hint="Log scan terbaru, dikelompokkan per tanggal."
          right={<Badge label={`${history?.days?.length || 0} hari`} tone="info" />}
        />
        {!history || history.days.length === 0 ? (
          <EmptyState
            icon={<Clock size={26} color={colors.brand} />}
            title="Belum ada riwayat"
            description="Setelah scan titik pertama, riwayat akan tampil di sini."
          />
        ) : (
          <View style={styles.historyList}>
            {history.days.map((day) => (
              <View key={day.tanggal} style={styles.historyDay}>
                <View style={styles.historyHead}>
                  <Text style={styles.historyDate}>{formatDateKey(day.tanggal)}</Text>
                  <Badge label={`${day.logs.length} titik`} tone="success" />
                </View>
                {day.logs.map((log) => (
                  <View key={log.id} style={styles.historyRow}>
                    <ShieldCheck size={14} color={colors.success} />
                    <Text style={styles.historyName}>
                      {log.checkpoint?.nama || 'Titik patroli'}
                    </Text>
                    <Text style={styles.historyTime}>{formatTime(log.timestamp_server)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
      </Card>

      <View style={styles.refreshRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Muat ulang patroli"
          onPress={() => load(true)}
          style={styles.refreshButton}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.brand} />
          ) : (
            <RefreshCw size={16} color={colors.brand} />
          )}
          <Text style={styles.refreshText}>Muat ulang data patroli</Text>
        </Pressable>
      </View>

      <PageFooter />

      <CameraCapture
        visible={cameraCheckpoint !== null}
        title={cameraCheckpoint ? `Selfie scan ${cameraCheckpoint.nama}` : 'Selfie scan titik'}
        subtitle="Pastikan wajah terlihat jelas. Server akan mencocokkan wajah dengan data terdaftar."
        busy={scanning}
        onCancel={() => setCameraCheckpoint(null)}
        onConfirm={submitScan}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  doneBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  doneTitle: {
    color: colors.success,
    fontSize: font.body,
    fontWeight: '800',
  },
  doneText: {
    color: colors.success,
    fontSize: font.small,
    lineHeight: 18,
    marginTop: 2,
  },
  progressWrap: {
    marginTop: spacing.lg,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  progressText: {
    color: colors.muted,
    fontSize: font.small,
  },
  mapWrap: {
    marginTop: spacing.md,
  },
  selectedBox: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  selectedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  selectedIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedTitle: {
    color: colors.ink,
    fontSize: font.body,
    fontWeight: '800',
  },
  selectedMeta: {
    color: colors.muted,
    fontSize: font.small,
    marginTop: 2,
  },
  faceCard: {
    backgroundColor: colors.accentSoft,
    borderColor: '#F5D08A',
  },
  faceText: {
    color: colors.inkSoft,
    fontSize: font.small,
    lineHeight: 18,
    marginTop: spacing.md,
  },
  checkpointList: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  checkpoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  checkpointActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  checkpointNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkpointNumberDone: {
    backgroundColor: colors.success,
  },
  checkpointNumberText: {
    color: colors.inkSoft,
    fontSize: font.small,
    fontWeight: '800',
  },
  checkpointName: {
    color: colors.ink,
    fontSize: font.body,
    fontWeight: '700',
  },
  checkpointMeta: {
    color: colors.muted,
    fontSize: font.small,
    marginTop: 2,
  },
  checkpointScanned: {
    color: colors.success,
    fontSize: font.tiny,
    marginTop: 2,
  },
  historyList: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  historyDay: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.md,
    gap: 6,
  },
  historyHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  historyDate: {
    color: colors.ink,
    fontSize: font.body,
    fontWeight: '700',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  historyName: {
    flex: 1,
    color: colors.inkSoft,
    fontSize: font.small,
  },
  historyTime: {
    color: colors.muted,
    fontSize: font.small,
  },
  refreshRow: {
    alignItems: 'center',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  refreshText: {
    color: colors.brand,
    fontSize: font.small,
    fontWeight: '600',
  },
});
