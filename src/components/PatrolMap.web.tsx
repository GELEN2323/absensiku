import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, MapPin } from 'lucide-react-native';
import type { PatrolMapProps } from './PatrolMap.types';
import { colors, font, radius, spacing } from '@/theme';

type Percent = `${number}%`;

function percent(value: number): Percent {
  return `${Math.max(4, Math.min(96, value))}%` as Percent;
}

/**
 * Fallback web: react-native-maps tidak mendukung browser, jadi titik patroli
 * digambar sebagai peta skematis berdasarkan koordinat asli. Interaksi tetap
 * sama (pilih titik) dan tidak memalsukan peta jalan.
 */
export default function PatrolMap({
  checkpoints,
  selectedId,
  onSelect,
  userPosition,
}: PatrolMapProps) {
  const points = [
    ...checkpoints.map((checkpoint) => ({
      lat: checkpoint.lat,
      lng: checkpoint.lng,
    })),
    ...(userPosition ? [{ lat: userPosition.lat, lng: userPosition.lng }] : []),
  ];

  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const minLat = lats.length ? Math.min(...lats) : -7.99;
  const maxLat = lats.length ? Math.max(...lats) : -7.98;
  const minLng = lngs.length ? Math.min(...lngs) : 112.62;
  const maxLng = lngs.length ? Math.max(...lngs) : 112.63;
  const latSpan = Math.max(maxLat - minLat, 0.0005);
  const lngSpan = Math.max(maxLng - minLng, 0.0005);

  const project = (lat: number, lng: number) => ({
    left: percent(8 + ((lng - minLng) / lngSpan) * 84),
    top: percent(8 + ((maxLat - lat) / latSpan) * 84),
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.gridRow}>
        <View style={styles.gridLine} />
        <View style={styles.gridLine} />
        <View style={styles.gridLine} />
      </View>
      <View style={[styles.gridCol, { left: '33%' }]} />
      <View style={[styles.gridCol, { left: '66%' }]} />

      <View style={styles.badge}>
        <MapPin size={12} color={colors.brand} />
        <Text style={styles.badgeText}>Peta skematis · web</Text>
      </View>

      {checkpoints.map((checkpoint) => {
        const position = project(checkpoint.lat, checkpoint.lng);
        const selected = checkpoint.id === selectedId;
        return (
          <Pressable
            key={checkpoint.id}
            accessibilityRole="button"
            accessibilityLabel={`Titik ${checkpoint.urutan} ${checkpoint.nama}`}
            onPress={() => onSelect(checkpoint)}
            style={[
              styles.dot,
              position,
              checkpoint.scanned && styles.dotScanned,
              selected && styles.dotSelected,
            ]}
          >
            {checkpoint.scanned ? (
              <Check size={14} color={colors.white} />
            ) : (
              <Text style={[styles.dotText, selected && styles.dotTextSelected]}>
                {checkpoint.urutan}
              </Text>
            )}
          </Pressable>
        );
      })}

      {userPosition ? (
        <View style={[styles.userDot, project(userPosition.lat, userPosition.lng)]} />
      ) : null}

      <Text style={styles.hint}>
        Ketuk titik bernomor untuk memilih. Hijau = sudah discan hari ini.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 300,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#E8F0EE',
    borderWidth: 1,
    borderColor: colors.border,
  },
  gridRow: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'space-evenly',
  },
  gridLine: {
    height: 1,
    backgroundColor: 'rgba(15,118,110,0.10)',
  },
  gridCol: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(15,118,110,0.10)',
  },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    zIndex: 2,
  },
  badgeText: {
    color: colors.brand,
    fontSize: font.tiny,
    fontWeight: '700',
  },
  dot: {
    position: 'absolute',
    width: 32,
    height: 32,
    marginLeft: -16,
    marginTop: -16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotScanned: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  dotSelected: {
    borderColor: colors.ink,
    borderWidth: 3,
    transform: [{ scale: 1.15 }],
  },
  dotText: {
    color: colors.brand,
    fontSize: font.small,
    fontWeight: '800',
  },
  dotTextSelected: {
    color: colors.ink,
  },
  userDot: {
    position: 'absolute',
    width: 18,
    height: 18,
    marginLeft: -9,
    marginTop: -9,
    borderRadius: 9,
    backgroundColor: colors.info,
    borderWidth: 3,
    borderColor: colors.white,
  },
  hint: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    color: colors.inkSoft,
    fontSize: font.tiny,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
});
