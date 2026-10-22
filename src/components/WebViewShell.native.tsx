import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { RefreshCw, ShieldCheck } from 'lucide-react-native';
import { Button, BrandMark } from './ui';
import { colors, radius, spacing } from '@/theme';

const WEB_URL = (process.env.EXPO_PUBLIC_WEBVIEW_URL || '').trim();
const AnyWebView = WebView as unknown as ComponentType<any>;

async function requestNativePermissions() {
  if (Platform.OS !== 'android') return;
  try {
    await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      PermissionsAndroid.PERMISSIONS.CAMERA,
    ]);
  } catch {
    // Izin bisa diminta ulang dari halaman web saat dibutuhkan.
  }
}

export default function WebViewShell() {
  const webViewRef = useRef<any>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(WEB_URL));
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    requestNativePermissions();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [canGoBack]);

  const reload = useCallback(() => {
    setError(null);
    setLoading(true);
    setProgress(0);
    webViewRef.current?.reload();
  }, []);

  if (!WEB_URL) {
    return (
      <View style={styles.setup}>
        <StatusBar style="dark" />
        <BrandMark />
        <View style={styles.setupCard}>
          <ShieldCheck size={28} color={colors.brand} />
          <Text style={styles.setupTitle}>URL web belum diatur</Text>
          <Text style={styles.setupText}>
            Isi `EXPO_PUBLIC_WEBVIEW_URL` di file `.env` dengan URL hasil deploy web, lalu
            restart aplikasi.
          </Text>
          <Text style={styles.setupExample}>Contoh: https://absensi.example.com</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <AnyWebView
        ref={webViewRef}
        source={{ uri: WEB_URL }}
        originWhitelist={['http://*', 'https://*']}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        mixedContentMode="never"
        onLoadProgress={({ nativeEvent }: any) => setProgress(nativeEvent.progress)}
        onLoadStart={() => {
          setLoading(true);
          setError(null);
        }}
        onLoadEnd={() => setLoading(false)}
        onError={({ nativeEvent }: any) => {
          setLoading(false);
          setError(nativeEvent.description || 'Halaman web tidak bisa dibuka.');
        }}
        onHttpError={({ nativeEvent }: any) => {
          setLoading(false);
          setError(`Server mengembalikan status ${nativeEvent.statusCode}.`);
        }}
        onNavigationStateChange={({ canGoBack: back }: any) => setCanGoBack(back)}
        onShouldStartLoadWithRequest={(request: any) => {
          const target = request.url;
          if (!target) return false;
          if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('about:')) {
            return true;
          }
          Linking.openURL(target).catch(() => undefined);
          return false;
        }}
        {...({
          onPermissionRequest: (event: any) => {
            event?.nativeEvent?.request?.grant(event.nativeEvent.request.resources);
          },
        } as any)}
        style={styles.webview}
      />

      {loading ? (
        <View style={styles.loading}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(8, progress * 100)}%` }]} />
          </View>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorOverlay}>
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Tidak bisa membuka aplikasi</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Button label="Coba lagi" onPress={reload} icon={<RefreshCw size={16} color={colors.white} />} />
            <Button
              label="Buka di browser"
              variant="secondary"
              onPress={() => Linking.openURL(WEB_URL).catch(() => undefined)}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  webview: {
    flex: 1,
  },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 10,
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(244,246,248,0.92)',
  },
  progressTrack: {
    height: 3,
    width: '100%',
    backgroundColor: colors.surfaceAlt,
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.brand,
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  errorTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  errorText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  setup: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.xl,
    paddingTop: 80,
    gap: spacing.xl,
  },
  setupCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  setupTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '800',
  },
  setupText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  setupExample: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
});
