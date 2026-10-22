import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera, Check, RefreshCw, ShieldAlert, X } from 'lucide-react-native';
import { Button } from './ui';
import { colors, font, radius, spacing } from '@/theme';

const AnyCameraView = CameraView as unknown as React.ComponentType<any>;

type CameraCaptureProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
  /** Dipakai saat kamera tidak tersedia / izin ditolak. */
  onSkip?: () => void;
};

export function CameraCapture({
  visible,
  title,
  subtitle,
  busy = false,
  onCancel,
  onConfirm,
  onSkip,
}: CameraCaptureProps) {
  const cameraRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  // Minta izin saat modal dibuka; di web browser menampilkan prompt kamera.
  useEffect(() => {
    if (!visible) return;
    // permission null = hook belum selesai memuat status izin.
    if (!permission || (!permission.granted && permission.canAskAgain)) {
      requestPermission().catch(() => undefined);
    }
  }, [permission, requestPermission, visible]);

  useEffect(() => {
    if (visible) return;
    setPhoto(null);
    setError(null);
    setReady(false);
    setCapturing(false);
    setUnavailable(false);
  }, [visible]);

  // Pastikan modal tidak menggantung saat kamera tidak pernah siap
  // (mis. perangkat tanpa kamera atau browser memblokir getUserMedia).
  useEffect(() => {
    if (!visible || photo || ready) return;

    const timer = setTimeout(() => {
      if (!ready) {
        setUnavailable(true);
        setError('Kamera tidak merespons. Periksa izin kamera atau gunakan perangkat lain.');
      }
    }, 7000);

    return () => clearTimeout(timer);
  }, [photo, ready, visible]);

  const secureContextBlocked =
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    !window.isSecureContext &&
    !['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname);

  const denied =
    Boolean(permission && !permission.granted && !permission.canAskAgain) ||
    secureContextBlocked;
  const blocked = denied || unavailable;

  const capture = useCallback(async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    setError(null);

    try {
      const result = await cameraRef.current.takePictureAsync({
        quality: 0.55,
        base64: true,
        skipProcessing: Platform.OS !== 'web',
      });

      const base64: string | undefined = result?.base64;
      const uri: string | undefined = result?.uri;

      // Di web `uri` sudah berupa data URL; di native butuh base64 eksplisit.
      const dataUrl = base64
        ? base64.startsWith('data:')
          ? base64
          : `data:image/jpeg;base64,${base64}`
        : uri && uri.startsWith('data:')
          ? uri
          : null;

      if (!dataUrl) throw new Error('Hasil foto tidak terbaca. Coba ambil ulang.');
      setPhoto(dataUrl);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Gagal mengambil foto. Coba lagi.'
      );
    } finally {
      setCapturing(false);
    }
  }, [capturing]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>
                {subtitle || 'Posisikan wajah di dalam bingkai, lalu ambil foto.'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tutup kamera"
              onPress={onCancel}
              style={styles.closeButton}
            >
              <X size={18} color={colors.ink} />
            </Pressable>
          </View>

          <View style={styles.stage}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.preview} resizeMode="cover" />
            ) : blocked ? (
              <View style={styles.fallback}>
                <ShieldAlert size={30} color={colors.accent} />
                <Text style={styles.fallbackTitle}>Kamera tidak bisa dibuka</Text>
                <Text style={styles.fallbackText}>
                  {secureContextBlocked
                    ? 'Kamera browser hanya tersedia lewat HTTPS. Buka aplikasi memakai alamat https://.'
                    : denied
                      ? 'Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser/aplikasi, lalu coba lagi.'
                      : 'Tidak ada kamera yang terdeteksi. Kamu masih bisa absen tanpa foto.'}
                </Text>
                {permission && permission.canAskAgain ? (
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
                ) : (
                  <View style={styles.frame} pointerEvents="none" />
                )}
              </>
            )}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {photo ? (
            <View style={styles.actions}>
              <Button
                label="Ambil ulang"
                variant="secondary"
                onPress={() => setPhoto(null)}
                icon={<RefreshCw size={16} color={colors.ink} />}
                style={{ flex: 1 }}
              />
              <Button
                label="Gunakan foto"
                onPress={() => onConfirm(photo)}
                loading={busy}
                icon={<Check size={17} color={colors.white} />}
                style={{ flex: 1 }}
              />
            </View>
          ) : (
            <View style={styles.actions}>
              <Button
                label="Ambil foto"
                onPress={capture}
                loading={capturing}
                disabled={blocked || !ready}
                icon={<Camera size={17} color={colors.white} />}
                style={{ flex: 1 }}
              />
            </View>
          )}

          {onSkip ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Lanjut tanpa foto"
              onPress={onSkip}
              style={styles.skip}
            >
              <Text style={styles.skipText}>Lanjut tanpa foto</Text>
            </Pressable>
          ) : null}
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
    height: 300,
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
  preview: {
    width: '100%',
    height: '100%',
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
    backgroundColor: 'rgba(11,18,32,0.4)',
  },
  stageText: {
    color: colors.white,
    fontSize: font.small,
  },
  frame: {
    position: 'absolute',
    width: 190,
    height: 240,
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
  error: {
    color: colors.danger,
    fontSize: font.small,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  skip: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  skipText: {
    color: colors.muted,
    fontSize: font.small,
    textDecorationLine: 'underline',
  },
});
