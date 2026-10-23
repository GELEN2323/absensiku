import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera, CheckCircle2, RefreshCw, ShieldAlert, X } from 'lucide-react-native';
import { Button, ProgressBar } from './ui';
import { api, ApiError } from '@/lib/api';
import type { LivenessChallenge } from '@/lib/types';
import { colors, font, radius, spacing } from '@/theme';

const AnyCameraView = CameraView as unknown as React.ComponentType<any>;

const MAX_ATTEMPTS = 3;
const BLINK_FRAMES = 18;
const CLOSE_FRAMES = 12;
const OPEN_AFTER_CLOSE_FRAMES = 5;

const CHALLENGE_COPY: Record<
  LivenessChallenge,
  { title: string; instruction: string; running: string }
> = {
  blink_twice: {
    title: 'Kedipkan mata dua kali',
    instruction:
      'Selama perekaman, tutup lalu buka mata perlahan. Ulangi sampai dua kali kedipan terdeteksi.',
    running: 'Kedipkan mata dua kali, perlahan...',
  },
  close_eyes: {
    title: 'Tutup mata sebentar',
    instruction:
      'Saat perekaman dimulai, tutup mata rapat selama beberapa detik. Kami akan meminta kamu membuka mata di akhir.',
    running: 'Tutup mata rapat-rapat...',
  },
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function pickChallenge(): LivenessChallenge {
  return Math.random() < 0.5 ? 'blink_twice' : 'close_eyes';
}

type Phase = 'idle' | 'countdown' | 'capture' | 'verify' | 'failed' | 'blocked' | 'done';

type FaceLivenessProps = {
  visible: boolean;
  token: string | null;
  title?: string;
  subtitle?: string;
  onCancel: () => void;
  onVerified: (result: {
    verificationId: string;
    photo: string;
    distance: number;
    challenge: LivenessChallenge;
  }) => void;
  onBlocked?: (message: string) => void;
};

/**
 * Modal liveness (P4): kamera merekam beberapa frame berurutan, lalu server
 * yang menghitung EAR + jarak wajah. Client tidak mengirim hasil apa pun
 * selain frame mentah; `verification_id` hanya keluar kalau server lolos.
 */
export function FaceLiveness({
  visible,
  token,
  title = 'Verifikasi wajah',
  subtitle,
  onCancel,
  onVerified,
  onBlocked,
}: FaceLivenessProps) {
  const cameraRef = useRef<any>(null);
  const runIdRef = useRef(0);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [challenge, setChallenge] = useState<LivenessChallenge>('blink_twice');
  const [phase, setPhase] = useState<Phase>('idle');
  const [countdown, setCountdown] = useState(3);
  const [progress, setProgress] = useState({ current: 0, total: BLINK_FRAMES });
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [instruction, setInstruction] = useState<string | null>(null);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    setPhase('idle');
    setCountdown(3);
    setProgress({ current: 0, total: BLINK_FRAMES });
    setAttempt(0);
    setMessage(null);
    setError(null);
    setBlockedReason(null);
    setInstruction(null);
  }, []);

  useEffect(() => {
    if (!visible) {
      reset();
      setReady(false);
      return;
    }
    setChallenge(pickChallenge());
    reset();
  }, [reset, visible]);

  // Minta izin kamera saat modal dibuka.
  useEffect(() => {
    if (!visible) return;
    if (!permission || (!permission.granted && permission.canAskAgain)) {
      requestPermission().catch(() => undefined);
    }
  }, [permission, requestPermission, visible]);

  // Jangan menggantung kalau kamera tidak pernah siap.
  useEffect(() => {
    if (!visible || ready) return;
    const timer = setTimeout(() => {
      if (!ready) {
        setError('Kamera tidak merespons. Periksa izin kamera lalu coba lagi.');
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [ready, visible]);

  const secureContextBlocked =
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    !window.isSecureContext &&
    !['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname);

  const denied =
    Boolean(permission && !permission.granted && !permission.canAskAgain) || secureContextBlocked;

  const grabFrame = useCallback(async (): Promise<string | null> => {
    if (!cameraRef.current) return null;
    try {
      const result = await cameraRef.current.takePictureAsync({
        quality: 0.4,
        base64: true,
        skipProcessing: Platform.OS !== 'web',
      });
      const base64: string | undefined = result?.base64;
      const uri: string | undefined = result?.uri;
      if (base64) {
        return base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
      }
      if (uri?.startsWith('data:')) return uri;
      return null;
    } catch {
      return null;
    }
  }, []);

  const start = useCallback(async () => {
    if (!token || phase === 'capture' || phase === 'verify' || phase === 'countdown') return;

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const alive = () => runIdRef.current === runId;

    setMessage(null);
    setError(null);
    setBlockedReason(null);
    setInstruction(null);

    const total =
      challenge === 'blink_twice'
        ? BLINK_FRAMES
        : CLOSE_FRAMES + OPEN_AFTER_CLOSE_FRAMES;
    setProgress({ current: 0, total });
    setPhase('countdown');

    for (let n = 3; n >= 1; n -= 1) {
      if (!alive()) return;
      setCountdown(n);
      await sleep(800);
    }
    if (!alive()) return;

    setPhase('capture');
    setInstruction(
      challenge === 'blink_twice'
        ? CHALLENGE_COPY.blink_twice.running
        : CHALLENGE_COPY.close_eyes.running
    );

    const frames: string[] = [];

    for (let index = 0; index < total; index += 1) {
      if (!alive()) return;

      if (challenge === 'close_eyes' && index === CLOSE_FRAMES) {
        setInstruction('Sekarang buka mata perlahan...');
        await sleep(700);
        if (!alive()) return;
        setInstruction('Tahan mata terbuka...');
      }

      const frame = await grabFrame();
      if (frame) frames.push(frame);

      setProgress({ current: index + 1, total });

      // Jeda kecil supaya kamera tidak kelelahan dan frame punya variasi waktu.
      await sleep(challenge === 'close_eyes' && index === CLOSE_FRAMES ? 80 : 110);
    }

    if (!alive()) return;

    if (frames.length < 6) {
      setPhase('failed');
      setError('Kamera tidak menangkap cukup frame. Coba lagi di tempat yang lebih terang.');
      return;
    }

    setInstruction(null);
    setPhase('verify');

    try {
      const result = await api.verifyFace(token, frames, challenge);

      if (result.match && result.verification_id) {
        setPhase('done');
        onVerified({
          verificationId: result.verification_id,
          // Frame terakhir diambil saat mata terbuka (khusus close_eyes
          // ada frame tambahan setelah instruksi membuka mata).
          photo: frames[frames.length - 1],
          distance: Number(result.distance ?? 0),
          challenge,
        });
        return;
      }

      const nextAttempt = attempt + 1;
      setAttempt(nextAttempt);
      setPhase(nextAttempt >= MAX_ATTEMPTS ? 'blocked' : 'failed');

      const livenessMessage = result.liveness?.message;
      const distanceText =
        result.distance !== null && result.distance !== undefined
          ? ` Jarak wajah ${result.distance.toFixed(2)} (batas ${result.threshold}).`
          : '';

      setMessage(
        `${livenessMessage || 'Verifikasi belum lolos.'}${distanceText}${
          result.remaining_attempts !== undefined && nextAttempt < MAX_ATTEMPTS
            ? ` Sisa percobaan hari ini: ${result.remaining_attempts}.`
            : ''
        }`
      );
      if (nextAttempt >= MAX_ATTEMPTS) {
        setBlockedReason('Batas percobaan verifikasi tercapai. Coba lagi nanti atau hubungi admin.');
      }
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      const details = apiError?.details as { code?: string; failures?: number } | undefined;
      const apiMessage =
        caught instanceof Error ? caught.message : 'Verifikasi wajah gagal. Coba lagi.';

      if (apiError?.status === 403 || details?.code === 'FACE_BLOCKED') {
        setPhase('blocked');
        setBlockedReason(apiMessage);
        onBlocked?.(apiMessage);
      } else if (details?.code === 'FACE_NOT_REGISTERED') {
        setPhase('blocked');
        setBlockedReason(apiMessage);
        onBlocked?.(apiMessage);
      } else {
        const nextAttempt = attempt + 1;
        setAttempt(nextAttempt);
        setPhase(nextAttempt >= MAX_ATTEMPTS ? 'blocked' : 'failed');
        setMessage(apiMessage);
        if (nextAttempt >= MAX_ATTEMPTS) {
          setBlockedReason('Batas percobaan verifikasi tercapai. Coba lagi nanti atau hubungi admin.');
        }
      }
    }
  }, [attempt, challenge, grabFrame, onBlocked, onVerified, phase, token]);

  const busy = phase === 'countdown' || phase === 'capture' || phase === 'verify';
  const challengeCopy = CHALLENGE_COPY[challenge];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>
                {subtitle || 'Pastikan wajah terlihat jelas dan pencahayaan cukup.'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tutup verifikasi wajah"
              onPress={onCancel}
              style={styles.closeButton}
            >
              <X size={18} color={colors.ink} />
            </Pressable>
          </View>

          <View style={styles.stage}>
            {denied ? (
              <View style={styles.fallback}>
                <ShieldAlert size={30} color={colors.accent} />
                <Text style={styles.fallbackTitle}>Kamera tidak bisa dibuka</Text>
                <Text style={styles.fallbackText}>
                  {secureContextBlocked
                    ? 'Kamera browser hanya tersedia lewat HTTPS. Buka aplikasi memakai alamat https://.'
                    : 'Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser/aplikasi, lalu coba lagi.'}
                </Text>
                {permission?.canAskAgain ? (
                  <Button
                    label="Minta izin ulang"
                    variant="secondary"
                    onPress={() => requestPermission().catch(() => undefined)}
                  />
                ) : null}
              </View>
            ) : (
              <>
                <AnyCameraView
                  ref={cameraRef}
                  style={styles.camera}
                  facing="front"
                  mirror
                  onCameraReady={() => setReady(true)}
                  onMountError={(event: any) =>
                    setError(event?.nativeEvent?.message || 'Kamera gagal dimuat.')
                  }
                />

                {!ready ? (
                  <View style={styles.stageOverlay}>
                    <ActivityIndicator color={colors.white} />
                    <Text style={styles.stageText}>Menyiapkan kamera...</Text>
                  </View>
                ) : phase === 'countdown' ? (
                  <View style={styles.stageOverlay}>
                    <Text style={styles.countdown}>{countdown}</Text>
                    <Text style={styles.stageText}>Bersiap...</Text>
                  </View>
                ) : phase === 'capture' ? (
                  <View style={styles.captureOverlay}>
                    <View style={styles.recordingBadge}>
                      <View style={styles.recordingDot} />
                      <Text style={styles.recordingText}>Merekam liveness</Text>
                    </View>
                    {instruction ? <Text style={styles.instruction}>{instruction}</Text> : null}
                  </View>
                ) : phase === 'verify' ? (
                  <View style={styles.stageOverlay}>
                    <ActivityIndicator color={colors.white} />
                    <Text style={styles.stageText}>Memeriksa wajah & liveness...</Text>
                  </View>
                ) : phase === 'done' ? (
                  <View style={styles.stageOverlay}>
                    <CheckCircle2 size={42} color="#4ADE80" />
                    <Text style={styles.stageText}>Wajah terverifikasi</Text>
                  </View>
                ) : (
                  <View style={styles.frame} pointerEvents="none" />
                )}
              </>
            )}
          </View>

          {phase === 'capture' ? (
            <View style={styles.progressBlock}>
              <ProgressBar percent={(progress.current / progress.total) * 100} />
              <Text style={styles.progressText}>
                Frame {progress.current}/{progress.total}
              </Text>
            </View>
          ) : null}

          {phase === 'idle' ? (
            <View style={styles.challengeBox}>
              <Text style={styles.challengeTitle}>{challengeCopy.title}</Text>
              <Text style={styles.challengeText}>{challengeCopy.instruction}</Text>
            </View>
          ) : null}

          {message ? <Text style={styles.message}>{message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {phase === 'blocked' ? (
            <View style={styles.blockedBox}>
              <ShieldAlert size={18} color={colors.danger} />
              <Text style={styles.blockedText}>
                {blockedReason || message || 'Verifikasi tidak bisa dilanjutkan.'}
              </Text>
            </View>
          ) : null}

          {phase === 'idle' ? (
            <Button
              label="Mulai verifikasi"
              onPress={start}
              disabled={denied || !ready}
              icon={<Camera size={17} color={colors.white} />}
              fullWidth
            />
          ) : phase === 'failed' ? (
            <Button
              label={`Coba lagi (${Math.max(0, MAX_ATTEMPTS - attempt)} percobaan)`}
              onPress={start}
              icon={<RefreshCw size={16} color={colors.white} />}
              fullWidth
            />
          ) : phase === 'blocked' ? (
            <Button label="Tutup" variant="secondary" onPress={onCancel} fullWidth />
          ) : phase === 'done' ? (
            <Button label="Selesai" onPress={onCancel} fullWidth />
          ) : (
            <Text style={styles.busyHint}>
              {phase === 'verify'
                ? 'Mohon tunggu, server sedang memeriksa wajah dan liveness.'
                : 'Tetap di dalam bingkai sampai perekaman selesai.'}
            </Text>
          )}

          <Text style={styles.privacy}>
            Frame hanya dikirim ke server perusahaan untuk verifikasi. Tidak disimpan di perangkat.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,18,32,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  title: {
    color: colors.ink,
    fontSize: font.h2,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: colors.muted,
    fontSize: font.small,
    marginTop: 2,
    lineHeight: 17,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    height: 320,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#0B1220',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camera: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  stageOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(11,18,32,0.55)',
  },
  stageText: {
    color: colors.white,
    fontSize: font.body,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  countdown: {
    color: colors.white,
    fontSize: 64,
    fontWeight: '800',
    lineHeight: 70,
  },
  captureOverlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    gap: spacing.sm,
  },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(220,38,38,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  recordingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.white,
  },
  recordingText: {
    color: colors.white,
    fontSize: font.tiny,
    fontWeight: '700',
  },
  instruction: {
    color: colors.white,
    fontSize: font.body,
    fontWeight: '700',
    backgroundColor: 'rgba(11,18,32,0.72)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    lineHeight: 20,
  },
  frame: {
    position: 'absolute',
    width: 200,
    height: 250,
    borderRadius: 120,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  fallback: {
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  fallbackTitle: {
    color: colors.white,
    fontSize: font.h3,
    fontWeight: '700',
    textAlign: 'center',
  },
  fallbackText: {
    color: '#D7E3EA',
    fontSize: font.small,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  progressBlock: {
    gap: 6,
  },
  progressText: {
    color: colors.muted,
    fontSize: font.tiny,
    textAlign: 'center',
  },
  challengeBox: {
    backgroundColor: colors.brandSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 3,
  },
  challengeTitle: {
    color: colors.brand,
    fontSize: font.body,
    fontWeight: '800',
  },
  challengeText: {
    color: colors.brandDark,
    fontSize: font.small,
    lineHeight: 18,
  },
  message: {
    color: colors.accent,
    fontSize: font.small,
    lineHeight: 18,
  },
  error: {
    color: colors.danger,
    fontSize: font.small,
    lineHeight: 18,
  },
  blockedBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  blockedText: {
    flex: 1,
    color: colors.danger,
    fontSize: font.small,
    lineHeight: 18,
  },
  busyHint: {
    color: colors.muted,
    fontSize: font.small,
    textAlign: 'center',
    lineHeight: 18,
  },
  privacy: {
    color: colors.faint,
    fontSize: font.tiny,
    textAlign: 'center',
  },
});
