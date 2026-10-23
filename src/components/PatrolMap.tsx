import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import type { PatrolMapProps } from './PatrolMap.types';
import { colors, radius } from '@/theme';

const DEFAULT_REGION = {
  latitude: -7.988931,
  longitude: 112.627671,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

/**
 * Peta titik patroli (Android/iOS). Versi web ada di `PatrolMap.web.tsx`
 * supaya react-native-maps tidak ikut dibundel untuk browser.
 */
export default function PatrolMap({
  checkpoints,
  selectedId,
  onSelect,
  userPosition,
}: PatrolMapProps) {
  const mapRef = useRef<MapView | null>(null);

  const initialRegion = useMemo(() => {
    const first = checkpoints[0];
    if (first) {
      return {
        latitude: first.lat,
        longitude: first.lng,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      };
    }
    if (userPosition) {
      return {
        latitude: userPosition.lat,
        longitude: userPosition.lng,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      };
    }
    return DEFAULT_REGION;
  }, []); // sengaja sekali saja; perubahan posisi ditangani fitToCoordinates

  useEffect(() => {
    const points = [
      ...checkpoints.map((checkpoint) => ({
        latitude: checkpoint.lat,
        longitude: checkpoint.lng,
      })),
      ...(userPosition
        ? [{ latitude: userPosition.lat, longitude: userPosition.lng }]
        : []),
    ];
    if (points.length === 0 || !mapRef.current) return;

    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(points, {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [checkpoints, userPosition]);

  return (
    <View style={styles.wrap}>
      <MapView ref={mapRef} style={styles.map} initialRegion={initialRegion}>
        {checkpoints.map((checkpoint) => {
          const selected = checkpoint.id === selectedId;
          return (
            <Marker
              key={checkpoint.id}
              coordinate={{ latitude: checkpoint.lat, longitude: checkpoint.lng }}
              title={`${checkpoint.urutan}. ${checkpoint.nama}`}
              description={
                checkpoint.scanned
                  ? 'Sudah discan hari ini'
                  : `Radius ${checkpoint.radius_meter} m`
              }
              pinColor={checkpoint.scanned ? colors.success : selected ? colors.brandDark : colors.brand}
              onPress={() => onSelect(checkpoint)}
            />
          );
        })}

        {userPosition ? (
          <Marker
            coordinate={{ latitude: userPosition.lat, longitude: userPosition.lng }}
            title="Posisi kamu"
            description={
              userPosition.accuracy !== null
                ? `Akurasi ±${userPosition.accuracy} m`
                : undefined
            }
            pinColor={colors.info}
          />
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 300,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  map: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
