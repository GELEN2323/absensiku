import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  FileText,
  ImagePlus,
  RefreshCw,
  Send,
  Trash2,
  XCircle,
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
  SectionTitle,
  TextField,
} from '@/components/ui';
import { CameraCapture } from '@/components/CameraCapture';
import { api, ApiError } from '@/lib/api';
import { formatDateKey, formatTime, todayKey } from '@/lib/format';
import type { IzinItem, IzinListResponse, IzinStatus } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { colors, font, radius, spacing } from '@/theme';

type StatusTone = 'warning' | 'success' | 'danger';

const STATUS_LABEL: Record<IzinStatus, string> = {
  pending: 'Menunggu',
  approved: 'Disetujui',
  rejected: 'Ditolak',
};

const STATUS_TONE: Record<IzinStatus, StatusTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const STATUS_HINT: Record<IzinStatus, string> = {
  pending: 'Menunggu persetujuan atasan.',
  approved: 'Pengajuan izin sudah disetujui.',
  rejected: 'Pengajuan izin ditolak. Lihat catatan atasan.',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Tambah/kurangi hari dari kunci tanggal `YYYY-MM-DD`. */
function shiftDateKey(key: string, days: number): string {
  const base = new Date(`${key}T00:00:00+07:00`);
  if (Number.isNaN(base.getTime())) return key;
  base.setDate(base.getDate() + days);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base);
}

function isValidDateKey(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  return shiftDateKey(value, 0) === value;
}

export default function IzinScreen() {
  const router = useRouter();
  const token = useAuth((state) => state.token);
  const signOut = useAuth((state) => state.signOut);

  const [data, setData] = useState<IzinListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tanggal, setTanggal] = useState(todayKey());
  const [alasan, setAlasan] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);

  const dateValid = useMemo(() => isValidDateKey(tanggal), [tanggal]);
  const today = todayKey();

  const dateChips = useMemo(
    () => [
      { key: today, label: 'Hari ini' },
      { key: shiftDateKey(today, 1), label: 'Besok' },
      { key: shiftDateKey(today, 2), label: 'Lusa' },
    ],
    [today]
  );

  const load = useCallback(
    async (soft = false) => {
      if (!token) return;
      if (soft) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        setData(await api.izinList(token));
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          await signOut();
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Gagal memuat data izin.');
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

  const resetForm = () => {
    setTanggal(todayKey());
    setAlasan('');
    setPhoto(null);
  };

  const pickFromGallery = async () => {
    setFormError(null);
    setPhotoWarning(null);
    setPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        base64: true,
        allowsEditing: true,
      });
      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.base64) {
        setFormError('Foto tidak bisa dibaca. Coba pilih foto lain.');
        return;
      }

      const mime = asset.mimeType || 'image/jpeg';
      setPhoto(`data:${mime};base64,${asset.base64}`);
    } catch (caught) {
      setFormError(
        caught instanceof Error ? caught.message : 'Gagal membuka galeri. Coba lagi.'
      );
    } finally {
      setPicking(false);
    }
  };

  const submit = async () => {
    if (!token || submitting) return;
    setFormError(null);
    setSuccess(null);
    setPhotoWarning(null);

    if (!dateValid) {
      setFormError('Tanggal izin wajib diisi dengan format YYYY-MM-DD.');
      return;
    }
    if (alasan.trim().length < 3) {
      setFormError('Alasan izin minimal 3 karakter.');
      return;
    }
    if (alasan.trim().length > 1000) {
      setFormError('Alasan izin maksimal 1000 karakter.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.createIzin(token, {
        tanggal,
        alasan: alasan.trim(),
        photo,
      });
      setSuccess(result.message);
      if (result.photo_warning) setPhotoWarning(result.photo_warning);
      resetForm();
      await load(true);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        await signOut();
        return;
      }
      setFormError(caught instanceof Error ? caught.message : 'Gagal mengirim pengajuan izin.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !data) {
    return <LoadingView label="Memuat data izin..." />;
  }

  const items = data?.items || [];
  const counts = data?.counts || { pending: 0, approved: 0, rejected: 0 };

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
        eyebrow="IZIN"
        title="Ajukan izin / sakit"
        subtitle="Kirim pengajuan izin dan pantau status persetujuannya."
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Muat ulang data izin"
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
      {success ? <Notice tone="success" title="Terkirim" message={success} /> : null}
      {photoWarning ? (
        <Notice
          tone="warning"
          title="Foto tidak tersimpan"
          message={`Izin tetap tercatat, tetapi foto pendukung gagal diunggah: ${photoWarning}`}
        />
      ) : null}
      {formError ? <Notice tone="error" title="Periksa lagi" message={formError} /> : null}

      <Card>
        <SectionTitle
          title="Form pengajuan"
          hint="Status awal selalu menunggu persetujuan atasan."
          right={<Badge label="Pending" tone="warning" />}
        />

        <View style={styles.form}>
          <View style={styles.chips}>
            {dateChips.map((chip) => {
              const active = tanggal === chip.key;
              return (
                <Pressable
                  key={chip.key}
                  accessibilityRole="button"
                  onPress={() => {
                    setTanggal(chip.key);
                    setFormError(null);
                  }}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {chip.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextField
            label="Tanggal izin"
            value={tanggal}
            onChangeText={(value) => {
              setTanggal(value.trim());
              setFormError(null);
            }}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            hint="Contoh: 2026-10-24"
            right={<CalendarDays size={17} color={colors.faint} />}
          />

          <TextField
            label="Alasan izin"
            value={alasan}
            onChangeText={(value) => {
              setAlasan(value);
              setFormError(null);
            }}
            placeholder="Contoh: Sakit demam, butuh istirahat sesuai surat dokter."
            multiline
            style={styles.reasonInput}
            hint={`${alasan.trim().length}/1000 karakter`}
          />

          <View style={styles.photoBlock}>
            <Text style={styles.photoLabel}>Foto pendukung (opsional)</Text>
            {photo ? (
              <View style={styles.previewRow}>
                <Image source={{ uri: photo }} style={styles.preview} />
                <View style={styles.previewActions}>
                  <Text style={styles.previewHint}>
                    Foto akan diunggah sebagai bukti pendukung. Bisa berupa surat dokter atau
                    keterangan lain.
                  </Text>
                  <Button
                    label="Hapus foto"
                    size="sm"
                    variant="secondary"
                    onPress={() => setPhoto(null)}
                    icon={<Trash2 size={14} color={colors.ink} />}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.photoActions}>
                <Button
                  label="Ambil foto"
                  size="sm"
                  variant="secondary"
                  onPress={() => setCameraOpen(true)}
                  icon={<Camera size={15} color={colors.ink} />}
                  style={{ flex: 1 }}
                />
                <Button
                  label={picking ? 'Membuka galeri...' : 'Pilih galeri'}
                  size="sm"
                  variant="secondary"
                  onPress={pickFromGallery}
                  loading={picking}
                  disabled={picking}
                  icon={<ImagePlus size={15} color={colors.ink} />}
                  style={{ flex: 1 }}
                />
              </View>
            )}
          </View>

          <Button
            label="Kirim pengajuan"
            onPress={submit}
            loading={submitting}
            disabled={submitting}
            icon={<Send size={16} color={colors.white} />}
            fullWidth
          />
        </View>
      </Card>

      <View style={styles.statsRow}>
        <View style={[styles.stat, styles.statPending]}>
          <Text style={styles.statValue}>{counts.pending}</Text>
          <Text style={styles.statLabel}>Menunggu</Text>
        </View>
        <View style={[styles.stat, styles.statApproved]}>
          <Text style={styles.statValue}>{counts.approved}</Text>
          <Text style={styles.statLabel}>Disetujui</Text>
        </View>
        <View style={[styles.stat, styles.statRejected]}>
          <Text style={styles.statValue}>{counts.rejected}</Text>
          <Text style={styles.statLabel}>Ditolak</Text>
        </View>
      </View>

      <Card>
        <SectionTitle
          title="Pengajuan saya"
          hint={`${items.length} pengajuan terbaru`}
          right={<FileText size={18} color={colors.brand} />}
        />

        {items.length === 0 ? (
          <EmptyState
            icon={<FileText size={26} color={colors.brand} />}
            title="Belum ada pengajuan izin"
            description="Pengajuan izin atau sakit yang kamu kirim akan muncul di sini beserta statusnya."
          />
        ) : (
          <View style={styles.list}>
            {items.map((item) => (
              <IzinRow key={item.id} item={item} />
            ))}
          </View>
        )}
      </Card>

      <Button
        label="Kembali ke absensi"
        variant="secondary"
        onPress={() => router.push('/user')}
      />

      <PageFooter />

      <CameraCapture
        visible={cameraOpen}
        title="Foto pendukung izin"
        subtitle="Ambil foto surat dokter atau bukti pendukung lain."
        busy={submitting}
        onCancel={() => setCameraOpen(false)}
        onConfirm={(dataUrl) => {
          setCameraOpen(false);
          setPhoto(dataUrl);
          setFormError(null);
        }}
      />
    </Screen>
  );
}

function IzinRow({ item }: { item: IzinItem }) {
  return (
    <View style={styles.item}>
      <View style={styles.itemHead}>
        <View style={styles.itemDateWrap}>
          <Text style={styles.itemDate}>{formatDateKey(item.tanggal)}</Text>
          {item.hari ? <Text style={styles.itemDay}>{item.hari}</Text> : null}
        </View>
        <Badge label={STATUS_LABEL[item.status]} tone={STATUS_TONE[item.status]} />
      </View>

      <Text style={styles.reason}>{item.alasan}</Text>

      <View style={styles.itemMeta}>
        {item.status === 'approved' ? (
          <CheckCircle2 size={14} color={colors.success} />
        ) : item.status === 'rejected' ? (
          <XCircle size={14} color={colors.danger} />
        ) : (
          <CalendarDays size={14} color={colors.accent} />
        )}
        <Text style={styles.itemMetaText}>{STATUS_HINT[item.status]}</Text>
      </View>

      {item.catatan ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>Catatan atasan</Text>
          <Text style={styles.noteText}>{item.catatan}</Text>
        </View>
      ) : null}

      <View style={styles.itemFoot}>
        <Text style={styles.itemFootText}>
          Diajukan {formatTime(item.created_at)}
          {item.reviewed_at ? ` · ditinjau ${formatTime(item.reviewed_at)}` : ''}
        </Text>
      </View>

      {item.foto_url ? (
        <Image source={{ uri: item.foto_url }} style={styles.itemPhoto} />
      ) : null}
    </View>
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
  form: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  chips: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  chipText: {
    color: colors.inkSoft,
    fontSize: font.small,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.brandDark,
  },
  reasonInput: {
    minHeight: 96,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  photoBlock: {
    gap: spacing.sm,
  },
  photoLabel: {
    color: colors.inkSoft,
    fontSize: font.small,
    fontWeight: '700',
  },
  photoActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  preview: {
    width: 88,
    height: 110,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  previewActions: {
    flex: 1,
    gap: spacing.sm,
  },
  previewHint: {
    color: colors.muted,
    fontSize: font.small,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stat: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
  },
  statPending: {
    backgroundColor: colors.accentSoft,
    borderColor: '#F3D9B0',
  },
  statApproved: {
    backgroundColor: colors.successSoft,
    borderColor: '#BFE7CF',
  },
  statRejected: {
    backgroundColor: colors.dangerSoft,
    borderColor: '#F3C4C4',
  },
  statValue: {
    color: colors.ink,
    fontSize: font.h2,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.muted,
    fontSize: font.tiny,
    marginTop: 2,
  },
  list: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  item: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  itemHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  itemDateWrap: {
    flex: 1,
  },
  itemDate: {
    color: colors.ink,
    fontSize: font.body,
    fontWeight: '700',
  },
  itemDay: {
    color: colors.muted,
    fontSize: font.small,
    marginTop: 2,
  },
  reason: {
    color: colors.inkSoft,
    fontSize: font.body,
    lineHeight: 21,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemMetaText: {
    flex: 1,
    color: colors.muted,
    fontSize: font.small,
  },
  noteBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2,
  },
  noteLabel: {
    color: colors.faint,
    fontSize: font.tiny,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  noteText: {
    color: colors.inkSoft,
    fontSize: font.small,
    lineHeight: 18,
  },
  itemFoot: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  itemFootText: {
    color: colors.faint,
    fontSize: font.tiny,
  },
  itemPhoto: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
});
