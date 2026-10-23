import { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Camera,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react-native';
import {
  Badge,
  Button,
  Card,
  Notice,
  PageFooter,
  PageHeader,
  Screen,
  SectionTitle,
} from '@/components/ui';
import { CameraCapture } from '@/components/CameraCapture';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { colors, font, radius, spacing } from '@/theme';

type Pose = {
  key: string;
  title: string;
  cue: string;
};

const POSES: Pose[] = [
  {
    key: 'depan',
    title: 'Hadap depan',
    cue: 'Tatap kamera dengan wajah di tengah bingkai. Lepas masker dan kacamata gelap.',
  },
  {
    key: 'kiri',
    title: 'Menoleh ke kiri',
    cue: 'Putar wajah pelan ke kiri sampai terlihat tiga perempat, lalu ambil foto.',
  },
  {
    key: 'kanan',
    title: 'Menoleh ke kanan',
    cue: 'Putar wajah pelan ke kanan sampai terlihat tiga perempat, lalu ambil foto.',
  },
];

export default function WajahScreen() {
  const router = useRouter();
  const token = useAuth((state) => state.token);
  const user = useAuth((state) => state.user);
  const refreshUser = useAuth((state) => state.refreshUser);
  const signOut = useAuth((state) => state.signOut);

  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null]);
  const [captureStep, setCaptureStep] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const registered = Boolean(user?.employee?.face_registered);
  const filled = photos.filter(Boolean).length;
  const nextStep = useMemo(() => photos.findIndex((photo) => !photo), [photos]);
  const complete = filled === POSES.length;

  const savePhoto = (index: number, dataUrl: string) => {
    setPhotos((current) => current.map((item, position) => (position === index ? dataUrl : item)));
    setError(null);
    setSuccess(null);
  };

  const reset = (index: number) => {
    setPhotos((current) => current.map((item, position) => (position === index ? null : item)));
    setError(null);
    setSuccess(null);
  };

  const submit = async () => {
    if (!token || submitting) return;
    if (!complete) {
      setError('Lengkapi tiga foto wajah dulu.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await api.enrollFace(token, photos.filter(Boolean) as string[]);
      setSuccess(
        result.face_registered
          ? 'Registrasi wajah berhasil. Sekarang kamu bisa absen dan scan patroli.'
          : 'Registrasi wajah tersimpan.'
      );
      await refreshUser();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        await signOut();
        return;
      }
      setError(caught instanceof Error ? caught.message : 'Registrasi wajah gagal. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  const activePose = nextStep === -1 ? POSES.length : nextStep;

  return (
    <Screen>
      <PageHeader
        eyebrow="WAJAH"
        title="Registrasi wajah"
        subtitle="Tiga pose singkat dipakai untuk mencocokkan wajah saat absen dan patroli."
        right={
          <Badge
            label={registered ? 'Terdaftar' : 'Belum terdaftar'}
            tone={registered ? 'success' : 'warning'}
          />
        }
      />

      <Card style={styles.infoCard}>
        <View style={styles.infoRow}>
          <View style={styles.infoIcon}>
            <ShieldCheck size={22} color={colors.brand} />
          </View>
          <Text style={styles.infoText}>
            Foto hanya diproses di server untuk membuat data wajah (embedding). Foto mentah tidak
            disimpan. Verifikasi absen juga memakai liveness acak supaya tidak bisa diakali dengan
            foto biasa.
          </Text>
        </View>
      </Card>

      {error ? <Notice tone="error" title="Registrasi gagal" message={error} /> : null}
      {success ? <Notice tone="success" title="Berhasil" message={success} /> : null}

      {registered ? (
        <Notice
          tone="warning"
          title="Data wajah sudah ada"
          message="Registrasi ulang akan mengganti data wajah lama. Lakukan hanya kalau wajah sulit dikenali saat absen."
        />
      ) : null}

      <Card>
        <SectionTitle
          title="Langkah foto"
          hint={`${filled} dari ${POSES.length} foto siap`}
          right={<Badge label={complete ? 'Lengkap' : 'Belum lengkap'} tone={complete ? 'success' : 'muted'} />}
        />

        <View style={styles.poses}>
          {POSES.map((pose, index) => {
            const photo = photos[index];
            const isActive = index === activePose;
            return (
              <View
                key={pose.key}
                style={[styles.pose, isActive && styles.poseActive]}
              >
                <View style={styles.poseHead}>
                  <View style={[styles.stepNumber, photo && styles.stepNumberDone]}>
                    {photo ? (
                      <CheckCircle2 size={16} color={colors.white} />
                    ) : (
                      <Text style={styles.stepNumberText}>{index + 1}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.poseTitle}>{pose.title}</Text>
                    <Text style={styles.poseCue}>{pose.cue}</Text>
                  </View>
                </View>

                {photo ? (
                  <View style={styles.previewRow}>
                    <Image source={{ uri: photo }} style={styles.preview} />
                    <View style={styles.previewActions}>
                      <Button
                        label="Ulangi foto"
                        size="sm"
                        variant="secondary"
                        onPress={() => reset(index)}
                        icon={<RefreshCw size={14} color={colors.ink} />}
                      />
                    </View>
                  </View>
                ) : (
                  <Button
                    label={isActive ? 'Ambil foto pose ini' : 'Ambil foto'}
                    variant={isActive ? 'primary' : 'secondary'}
                    size="sm"
                    onPress={() => setCaptureStep(index)}
                    icon={<Camera size={15} color={isActive ? colors.white : colors.ink} />}
                  />
                )}
              </View>
            );
          })}
        </View>
      </Card>

      <Card>
        <SectionTitle
          title="Simpan data wajah"
          hint={
            complete
              ? 'Periksa lagi hasil foto sebelum menyimpan.'
              : 'Selesaikan ketiga pose terlebih dahulu.'
          }
        />
        <Button
          label={registered ? 'Perbarui data wajah' : 'Simpan data wajah'}
          onPress={submit}
          loading={submitting}
          disabled={!complete || submitting}
          icon={<UserRoundCheck size={17} color={colors.white} />}
          fullWidth
        />
        <Button
          label="Kembali"
          variant="secondary"
          onPress={() => router.push('/user')}
          fullWidth
        />
      </Card>

      <PageFooter />

      <CameraCapture
        visible={captureStep !== null}
        title={captureStep !== null ? POSES[captureStep].title : 'Foto wajah'}
        subtitle={
          captureStep !== null
            ? POSES[captureStep].cue
            : 'Posisikan wajah di dalam bingkai, lalu ambil foto.'
        }
        busy={submitting}
        onCancel={() => setCaptureStep(null)}
        onConfirm={(dataUrl) => {
          const index = captureStep;
          setCaptureStep(null);
          if (index !== null) savePhoto(index, dataUrl);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  infoCard: {
    backgroundColor: colors.brandSoft,
    borderColor: '#BFE7E2',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    flex: 1,
    color: colors.brandDark,
    fontSize: font.small,
    lineHeight: 19,
  },
  poses: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  pose: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  poseActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  poseHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberDone: {
    backgroundColor: colors.success,
  },
  stepNumberText: {
    color: colors.inkSoft,
    fontSize: font.small,
    fontWeight: '800',
  },
  poseTitle: {
    color: colors.ink,
    fontSize: font.body,
    fontWeight: '700',
  },
  poseCue: {
    color: colors.muted,
    fontSize: font.small,
    lineHeight: 17,
    marginTop: 2,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  preview: {
    width: 84,
    height: 106,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  previewActions: {
    flex: 1,
    gap: spacing.sm,
  },
});
