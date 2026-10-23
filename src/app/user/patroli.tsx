import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MapPin, Route, ShieldCheck } from 'lucide-react-native';
import { Badge, Card, PageFooter, PageHeader, Screen, SectionTitle } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { colors, font, radius, spacing } from '@/theme';

/**
 * Tab Patroli — kerangka P2.
 * Peta, geofence titik, dan selfie verifikasi diisi pada tahap P6;
 * sampai saat itu layar ini menjelaskan alurnya tanpa data palsu.
 */
export default function PatroliScreen() {
  const user = useAuth((state) => state.user);
  const jabatan = user?.employee?.jabatan || 'Anggota';

  return (
    <Screen>
      <PageHeader
        eyebrow="PATROLI"
        title="Patroli keamanan"
        subtitle="Scan titik patroli sesuai urutan, lengkap dengan bukti lokasi dan wajah."
        right={<Badge label={jabatan} tone="brand" />}
      />

      <Card>
        <SectionTitle
          title="Alur patroli"
          hint="Berlaku untuk semua anggota dan Danru."
        />
        <View style={styles.steps}>
          <Step
            icon={<MapPin size={18} color={colors.brand} />}
            title="Datangi titik"
            text="Peta menampilkan titik patroli berurutan beserta radiusnya."
          />
          <Step
            icon={<Route size={18} color={colors.brand} />}
            title="Scan titik ini"
            text="Scan hanya aktif saat posisi kamu berada di dalam radius titik."
          />
          <Step
            icon={<ShieldCheck size={18} color={colors.brand} />}
            title="Verifikasi wajah"
            text="Selfie singkat memastikan yang scan adalah anggota yang bertugas."
          />
        </View>
      </Card>

      <Card style={styles.infoCard}>
        <Text style={styles.infoTitle}>Belum ada jadwal patroli</Text>
        <Text style={styles.infoText}>
          Titik patroli dan progres harian akan tampil di sini setelah fitur patroli aktif
          untuk akun kamu.
        </Text>
      </Card>

      <PageFooter />
    </Screen>
  );
}

function Step({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepIcon}>{icon}</View>
      <View style={styles.stepText}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  steps: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
    gap: 2,
  },
  stepTitle: {
    color: colors.ink,
    fontSize: font.body,
    fontWeight: '700',
  },
  stepBody: {
    color: colors.muted,
    fontSize: font.small,
    lineHeight: 18,
  },
  infoCard: {
    backgroundColor: colors.surfaceAlt,
    gap: 4,
  },
  infoTitle: {
    color: colors.ink,
    fontSize: font.body,
    fontWeight: '700',
  },
  infoText: {
    color: colors.muted,
    fontSize: font.small,
    lineHeight: 18,
  },
});
