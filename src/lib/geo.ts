import { Platform } from 'react-native';
import * as Location from 'expo-location';
import type { Position } from './types';

export class LocationError extends Error {
  code: 'unsupported' | 'permission' | 'unavailable' | 'timeout';

  constructor(code: LocationError['code'], message: string) {
    super(message);
    this.name = 'LocationError';
    this.code = code;
  }
}

const TIMEOUT_MS = 20000;

function isWeb() {
  return Platform.OS === 'web';
}

/**
 * Di browser, GPS hanya tersedia pada secure context (HTTPS / localhost).
 * Tanpa ini, navigator.geolocation ada tapi selalu gagal tanpa pesan jelas.
 */
function assertWebContext() {
  if (typeof window === 'undefined') {
    throw new LocationError('unsupported', 'Browser tidak mendukung GPS.');
  }

  const { hostname, protocol } = window.location;
  const local =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';

  if (!window.isSecureContext && !local) {
    throw new LocationError(
      'unsupported',
      'GPS browser hanya bisa dipakai lewat HTTPS. Buka aplikasi memakai alamat https://.'
    );
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new LocationError('unsupported', 'Browser ini tidak mendukung GPS.');
  }
}

function mapWebError(error: GeolocationPositionError): LocationError {
  if (error.code === error.PERMISSION_DENIED) {
    return new LocationError(
      'permission',
      'Izin lokasi ditolak. Klik ikon kunci di address bar / pengaturan aplikasi, izinkan lokasi, lalu coba lagi.'
    );
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return new LocationError(
      'unavailable',
      'Lokasi tidak tersedia. Pastikan GPS/Location Service aktif dan sinyal cukup.'
    );
  }
  return new LocationError('timeout', 'GPS terlalu lama merespons. Coba lagi di area terbuka.');
}

function webPosition(): Promise<Position> {
  assertWebContext();

  return new Promise<Position>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new LocationError('timeout', 'GPS terlalu lama merespons. Coba lagi.'));
    }, TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          lat: result.coords.latitude,
          lng: result.coords.longitude,
          accuracy:
            typeof result.coords.accuracy === 'number' ? Math.round(result.coords.accuracy) : null,
        });
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(mapWebError(error));
      },
      // maximumAge 0: jangan pakai posisi cache lama, supaya jarak ke kantor akurat.
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 0 }
    );
  });
}

async function nativePosition(): Promise<Position> {
  const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => true);
  if (!servicesEnabled) {
    throw new LocationError(
      'unavailable',
      'GPS perangkat mati. Aktifkan Location/GPS lalu coba lagi.'
    );
  }

  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new LocationError(
      'permission',
      'Izin lokasi ditolak. Buka pengaturan aplikasi lalu izinkan akses lokasi.'
    );
  }

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new LocationError('timeout', 'GPS terlalu lama merespons. Coba lagi.')),
      TIMEOUT_MS
    );
  });

  try {
    const result = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      timeout,
    ]);

    return {
      lat: result.coords.latitude,
      lng: result.coords.longitude,
      accuracy:
        typeof result.coords.accuracy === 'number' ? Math.round(result.coords.accuracy) : null,
    };
  } catch (error) {
    if (error instanceof LocationError) throw error;
    throw new LocationError(
      'unavailable',
      'Lokasi tidak tersedia. Pastikan GPS aktif dan izin lokasi diberikan.'
    );
  }
}

/** Ambil posisi terkini. Web memakai geolocation langsung agar error-nya jelas. */
export async function getCurrentPosition(): Promise<Position> {
  if (!isWeb()) return nativePosition();
  return webPosition();
}

/**
 * Pantau posisi secara berkala (mis. jarak ke kantor berubah saat berjalan).
 * Mengembalikan fungsi untuk berhenti memantau.
 */
export function watchPosition(
  onUpdate: (position: Position) => void,
  onError?: (error: LocationError) => void
): () => void {
  let stopped = false;

  if (!isWeb()) {
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          throw new LocationError('permission', 'Izin lokasi ditolak.');
        }
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 10000 },
          (result) => {
            if (stopped) return;
            onUpdate({
              lat: result.coords.latitude,
              lng: result.coords.longitude,
              accuracy:
                typeof result.coords.accuracy === 'number'
                  ? Math.round(result.coords.accuracy)
                  : null,
            });
          }
        );
      } catch (error) {
        if (stopped) return;
        onError?.(
          error instanceof LocationError
            ? error
            : new LocationError('unavailable', 'Tidak bisa memantau lokasi.')
        );
      }
    })();

    return () => {
      stopped = true;
      subscription?.remove();
    };
  }

  try {
    assertWebContext();
  } catch (error) {
    if (error instanceof LocationError) onError?.(error);
    return () => undefined;
  }

  const watchId = navigator.geolocation.watchPosition(
    (result) => {
      if (stopped) return;
      onUpdate({
        lat: result.coords.latitude,
        lng: result.coords.longitude,
        accuracy:
          typeof result.coords.accuracy === 'number' ? Math.round(result.coords.accuracy) : null,
      });
    },
    (error) => {
      if (stopped) return;
      onError?.(mapWebError(error));
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: TIMEOUT_MS }
  );

  return () => {
    stopped = true;
    navigator.geolocation.clearWatch(watchId);
  };
}

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(a)));
}
